import { createThreadActivityView, createThreadInsightsView } from "./thread-insights-view.js";
import { createThreadFileDiffView } from "./thread-file-diff-view.js";
import { createThreadImagePreviewView } from "./thread-image-preview-view.js";
import { createThreadMessageSearch } from "./thread-message-search.js";
import { createThreadOverviewView } from "./thread-overview-view.js";
import { renderCopyIconButton } from "../utils/copy-icon-button.js";
import { renderCloseIconButton } from "../utils/close-icon-button.js";
import { createLoadingOverlay } from "../utils/loading-overlay.js";
import { renderMessageMarkdown } from "../utils/markdown-renderer.js";
import { renderRefreshIconButton, setRefreshIconButtonLoading } from "../utils/refresh-icon-button.js";

const DIALOG_TITLE_MAX_LENGTH = 52;

function timestampToMilliseconds(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value < 1_000_000_000_000 ? value * 1_000 : value;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric < 1_000_000_000_000 ? numeric * 1_000 : numeric;
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatMessageTime(message, formatUpdated) {
  // 回复优先显示完成时间；提问没有完成时间时显示所属回合的开始时间。
  const timestamp = timestampToMilliseconds(message.completedAt)
    ?? timestampToMilliseconds(message.startedAt);
  if (timestamp === null) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return { label: formatUpdated(date), dateTime: date.toISOString() };
}

function formatMessageDuration(message) {
  const startedAt = timestampToMilliseconds(message.startedAt);
  const completedAt = timestampToMilliseconds(message.completedAt);
  if (startedAt === null || completedAt === null || completedAt <= startedAt) return null;
  const seconds = Math.max(1, Math.round((completedAt - startedAt) / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

function createTurnIdBadge({ t, turnId, onCopyTurnId }) {
  const normalizedTurnId = typeof turnId === "string" ? turnId.trim() : "";
  if (!normalizedTurnId) return null;
  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = "turn-id-badge";
  const label = document.createElement("span");
  label.textContent = t("threadTurnId");
  const value = document.createElement("code");
  value.textContent = normalizedTurnId;
  badge.append(label, value);
  const renderDefault = () => {
    badge.classList.remove("is-copied", "is-failed");
    badge.title = badge.ariaLabel = `${t("copyId")}：${normalizedTurnId}`;
  };
  renderDefault();
  badge.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    badge.disabled = true;
    try {
      await onCopyTurnId(normalizedTurnId);
      badge.classList.add("is-copied");
      badge.title = badge.ariaLabel = t("copied");
    } catch {
      badge.classList.add("is-failed");
      badge.title = badge.ariaLabel = t("copyFailedLong");
    }
    window.setTimeout(() => {
      badge.disabled = false;
      renderDefault();
    }, 1_500);
  });
  return badge;
}

function createMessageTurnMeta({ t, message, duration, onCopyTurnId }) {
  const turnIdBadge = createTurnIdBadge({ t, turnId: message.turnId, onCopyTurnId });
  if (!duration && !turnIdBadge) return null;
  const meta = document.createElement("span");
  meta.className = "message-turn-meta";
  if (duration) {
    const durationLabel = document.createElement("span");
    durationLabel.className = "message-turn-duration";
    durationLabel.textContent = t("threadMessageDuration", { value: duration });
    meta.append(durationLabel);
  }
  if (turnIdBadge) meta.append(turnIdBadge);
  return meta;
}

function createCollapsedMessagesDisclosure({
  t,
  message,
  duration,
  onCopyTurnId,
  activityDisclosure,
}) {
  const collapsedMessages = Array.isArray(message.collapsedMessages) ? message.collapsedMessages : [];
  if (collapsedMessages.length === 0 && !activityDisclosure) return null;
  const disclosure = document.createElement("details");
  disclosure.className = "message-duration-disclosure";
  const summary = document.createElement("summary");
  // 展开入口包含箭头与文字，回合 ID 仍独立复制，避免点击元信息时误展开。
  summary.tabIndex = -1;
  summary.addEventListener("click", (event) => event.preventDefault());
  const turnMeta = createMessageTurnMeta({
    t,
    message,
    duration,
    onCopyTurnId,
  }) ?? document.createElement("span");
  turnMeta.className = "message-turn-meta";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "message-turn-toggle";
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "m9 6 6 6-6 6");
  icon.append(path);
  const label = document.createElement("span");
  label.textContent = t("threadProcessRecords");
  toggle.append(icon, label);
  const renderToggle = () => {
    toggle.setAttribute("aria-expanded", String(disclosure.open));
    toggle.title = toggle.ariaLabel = t(
      disclosure.open ? "threadCollapseRecords" : "threadViewAllRecords",
    );
  };
  toggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    disclosure.open = !disclosure.open;
    renderToggle();
  });
  turnMeta.prepend(toggle);
  renderToggle();
  summary.append(turnMeta);
  const content = document.createElement("div");
  content.className = "message-collapsed-content";
  for (const text of collapsedMessages) {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    content.append(paragraph);
  }
  if (activityDisclosure) content.append(activityDisclosure);
  disclosure.append(summary, content);
  return disclosure;
}

/**
 * 会话详情视图保留已打开的详情数据，以便切换语言时可重新渲染角色与复制按钮。
 */
export function createThreadDialogView({
  t,
  formatUpdated,
  copyText,
  copyMessage,
  onRefreshThread,
  onLoadOlderTurns,
  onReadFullOverview,
  onReadLocalFile,
  onExportThread,
}) {
  const threadDialog = document.querySelector("#thread-dialog");
  const dialogContent = document.querySelector(".dialog-content");
  const dialogSidebar = document.querySelector("#thread-sidebar");
  const sidebarToggle = document.querySelector("#thread-sidebar-toggle");
  const dialogTitle = document.querySelector("#dialog-title");
  const dialogMeta = document.querySelector("#dialog-meta");
  const messageList = document.querySelector("#message-list");
  const dialogCloseButton = document.querySelector("#dialog-close");
  const searchInput = document.querySelector("#dialog-search-input");
  const searchResult = document.querySelector("#dialog-search-result");
  const exportButton = document.querySelector("#thread-export");
  const copyIdButton = document.querySelector("#thread-copy-id");
  const refreshButton = document.querySelector("#thread-refresh");
  const statusOverlay = createLoadingOverlay({
    container: threadDialog,
    className: "thread-loading-overlay",
  });
  const fileDiffView = createThreadFileDiffView({ t });
  const imagePreviewView = createThreadImagePreviewView({ t });
  const insightsView = createThreadInsightsView({ t });
  const activityView = createThreadActivityView({
    t,
    onViewFileChanges: (activity) => fileDiffView.show(activity),
  });
  const overviewView = createThreadOverviewView({
    t,
    onViewFileChange: (activity) => fileDiffView.show(activity),
  });
  let currentDetail = null;
  let currentReadError = null;
  let loadingOlder = false;
  let olderLoadError = null;
  let loadingFullOverview = false;
  let detailGeneration = 0;
  // 默认优先展示对话内容；概览信息按需展开，避免窄窗口被左侧栏挤占。
  let sidebarExpanded = false;
  const messageSearch = createThreadMessageSearch({
    t,
    input: searchInput,
    result: searchResult,
    onChange: ({ focusCurrentMatch }) => {
      if (currentDetail) renderMessages(currentDetail, { focusCurrentMatch });
    },
  });

  function showStatus(message, error = false) {
    if (error) statusOverlay.showError(message);
    else statusOverlay.show(message);
  }

  function renderCopyIdButton(state = "idle") {
    const threadId = currentDetail?.id ?? "";
    copyIdButton.classList.toggle("is-copied", state === "copied");
    copyIdButton.classList.toggle("is-failed", state === "failed");
    const value = document.createElement("code");
    value.textContent = threadId;
    copyIdButton.replaceChildren(value);
    copyIdButton.title = threadId ? `${t("threadCopyId")}：${threadId}` : t("threadCopyId");
    copyIdButton.ariaLabel = copyIdButton.title;
  }

  function renderActions() {
    exportButton.title = exportButton.ariaLabel = t("threadExport");
    renderCopyIdButton();
    renderRefreshIconButton(refreshButton, { label: t("threadRefresh") });
    const disabled = !currentDetail;
    exportButton.disabled = disabled;
    copyIdButton.disabled = disabled;
    refreshButton.disabled = disabled;
  }

  function renderSidebarVisibility() {
    dialogContent.classList.toggle("is-sidebar-collapsed", !sidebarExpanded);
    dialogSidebar.hidden = !sidebarExpanded;
    sidebarToggle.setAttribute("aria-expanded", String(sidebarExpanded));
    const labelKey = sidebarExpanded ? "threadCollapseSidebar" : "threadExpandSidebar";
    sidebarToggle.title = sidebarToggle.ariaLabel = t(labelKey);
  }

  function setDialogTitle(title) {
    const normalizedTitle = String(title ?? "").replace(/\s+/g, " ").trim();
    const titleCharacters = Array.from(normalizedTitle);
    const displayTitle = titleCharacters.length > DIALOG_TITLE_MAX_LENGTH
      ? `${titleCharacters.slice(0, DIALOG_TITLE_MAX_LENGTH).join("")}…`
      : normalizedTitle;
    // 保留完整标题，避免摘要模式丢失原始会话上下文。
    dialogTitle.textContent = displayTitle;
    dialogTitle.title = normalizedTitle;
    dialogTitle.ariaLabel = normalizedTitle;
  }

  function setDialogMeta(updatedAt) {
    // 概览只保留高频使用的更新时间；创建时间和会话 ID 不再长期占据侧栏。
    dialogMeta.textContent = updatedAt ? t("updated", { value: formatUpdated(updatedAt) }) : "";
    dialogMeta.hidden = !updatedAt;
  }

  function focusActiveMatch() {
    const { activeMessageIndex } = messageSearch.getState();
    if (activeMessageIndex === undefined) return;
    const message = messageList.querySelector(`[data-message-index="${activeMessageIndex}"]`);
    message?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function renderMessages(detail, { focusCurrentMatch = false } = {}) {
    messageList.replaceChildren();
    const { matchingIndexes, activeMessageIndex } = messageSearch.getState();
    if (detail.nextCursor) {
      const historyBar = document.createElement("div");
      historyBar.className = "thread-history-bar";
      const hint = document.createElement("span");
      hint.className = "thread-history-hint";
      hint.textContent = t("loadedHistoryOnly");
      const loadOlder = document.createElement("button");
      loadOlder.type = "button";
      loadOlder.className = "thread-load-older";
      loadOlder.textContent = t(loadingOlder ? "loadingOlderTurns" : "loadOlderTurns");
      loadOlder.disabled = loadingOlder;
      loadOlder.addEventListener("click", () => void loadOlderTurns());
      historyBar.append(hint, loadOlder);
      messageList.append(historyBar);
    }
    if (olderLoadError) {
      const error = document.createElement("p");
      error.className = "thread-history-error";
      error.textContent = t("olderTurnsFailed", { error: olderLoadError });
      messageList.append(error);
    }
    if (detail.truncated) {
      const hint = document.createElement("p");
      hint.className = "dialog-hint";
      hint.textContent = t("threadTruncated");
      messageList.append(hint);
    }
    if (detail.messages.length === 0) {
      const empty = document.createElement("p");
      empty.className = "dialog-hint";
      empty.textContent = t("noMessages");
      messageList.append(empty);
      return;
    }

    for (const [index, message] of detail.messages.entries()) {
      const entry = document.createElement("section");
      entry.className = `message-entry message-entry-${message.role}`;
      entry.dataset.messageIndex = String(index);
      const item = document.createElement("article");
      item.className = `message message-${message.role}`;
      if (matchingIndexes.has(index)) item.classList.add("is-search-match");
      if (index === activeMessageIndex) item.classList.add("is-active-search-match");
      if (message.text) {
        const text = document.createElement("div");
        renderMessageMarkdown(text, message.text, { t, copyText, onReadLocalFile });
        messageSearch.highlightRenderedText(text);
        if (text.querySelector(".markdown-code-block")) item.classList.add("has-code-block");
        item.append(text);
      }
      const duration = message.role === "assistant" ? formatMessageDuration(message) : null;
      const activityDisclosure = activityView.createDisclosure(message.activities);
      const collapsedMessages = createCollapsedMessagesDisclosure({
        t,
        message,
        duration,
        onCopyTurnId: copyText,
        activityDisclosure,
      });
      if (collapsedMessages) {
        entry.append(collapsedMessages);
      } else {
        const turnMeta = createMessageTurnMeta({
          t,
          message,
          duration,
          onCopyTurnId: copyText,
        });
        if (turnMeta) {
          const durationLabel = document.createElement("span");
          durationLabel.className = "message-duration";
          durationLabel.append(turnMeta);
          entry.append(durationLabel);
        }
      }
      let imageStrip = null;
      if ((message.images ?? []).length > 0) {
        imageStrip = document.createElement("div");
        imageStrip.className = "message-image-strip";
        const imageCount = message.images.length;
        imageStrip.style.width = `min(100%, ${imageCount * 78 + Math.max(0, imageCount - 1) * 8}px)`;
        imageStrip.style.gridTemplateColumns = `repeat(${imageCount}, minmax(0, 1fr))`;
        for (const [imageIndex, imageData] of message.images.entries()) {
          const frame = document.createElement("div");
          frame.className = "message-image-frame";
          const image = document.createElement("img");
          image.className = "message-image";
          image.src = imageData.src;
          image.alt = `${t("threadImage")} ${imageIndex + 1}`;
          image.loading = "lazy";
          image.addEventListener("error", () => frame.remove());
          image.tabIndex = 0;
          image.setAttribute("role", "button");
          image.title = t("openImagePreview");
          image.addEventListener("click", () => imagePreviewView.show(image));
          image.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            imagePreviewView.show(image);
          });
          frame.append(image);
          imageStrip.append(frame);
        }
      }
      if (imageStrip) entry.append(imageStrip);
      // 仅含图片的消息不再生成空白文字气泡，保持与 ChatGPT 附件布局一致。
      if (message.text || !imageStrip) entry.append(item);
      // 与 ChatGPT 的结果区一致：最终回复之后再次汇总本回合涉及的全部文件修改。
      const fileSummary = activityView.createFileSummary(message.activities);
      if (fileSummary) entry.append(fileSummary);
      const actions = document.createElement("div");
      actions.className = "message-actions";
      const time = formatMessageTime(message, formatUpdated);
      if (time) {
        const timeLabel = document.createElement("time");
        timeLabel.className = "message-time";
        timeLabel.dateTime = time.dateTime;
        timeLabel.textContent = time.label;
        actions.append(timeLabel);
      }
      if (message.text) {
        const copy = document.createElement("button");
        copy.type = "button";
        renderCopyIconButton(copy, { label: t("copy") });
        copy.addEventListener("click", async () => {
          copy.disabled = true;
          try {
            await copyMessage(message);
            renderCopyIconButton(copy, { label: t("copied"), state: "copied" });
          } catch {
            renderCopyIconButton(copy, { label: t("copyFailedLong"), state: "failed" });
          }
          window.setTimeout(() => {
            copy.disabled = false;
            renderCopyIconButton(copy, { label: t("copy") });
          }, 1_500);
        });
        actions.append(copy);
      }
      // 过程消息与工具记录收进“过程记录”区域，最终回复的操作栏保持在正文之后。
      if (actions.childElementCount > 0) entry.append(actions);
      messageList.append(entry);
    }
    if (focusCurrentMatch && activeMessageIndex !== undefined) {
      window.requestAnimationFrame(focusActiveMatch);
    }
  }

  async function loadOlderTurns() {
    const detail = currentDetail;
    if (!detail?.nextCursor || loadingOlder) return;
    const generation = detailGeneration;
    const cursor = detail.nextCursor;
    loadingOlder = true;
    olderLoadError = null;
    const loadButton = messageList.querySelector(".thread-load-older");
    if (loadButton) {
      loadButton.disabled = true;
      loadButton.textContent = t("loadingOlderTurns");
    }
    try {
      const page = await onLoadOlderTurns(detail.id, cursor);
      if (generation !== detailGeneration || currentDetail !== detail) return;
      detail.messages = [...page.messages, ...detail.messages];
      detail.nextCursor = page.nextCursor;
      if (!detail.overviewComplete) {
        detail.fileChanges = [...page.fileChanges, ...detail.fileChanges];
        detail.issues = [...page.issues, ...detail.issues];
        for (const [key, value] of Object.entries(page.insights)) {
          detail.insights[key] = (detail.insights[key] ?? 0) + value;
        }
        detail.overviewComplete = !page.nextCursor;
      }
      loadingOlder = false;
      messageSearch.setMessages(detail.messages);
      insightsView.render(detail);
      overviewView.setDetail(detail, { preserveDisclosure: true });
      renderMessages(detail);
      // 用户从列表顶部请求更早记录，完成后停在新页开头，避免新增内容被滚走。
      messageList.scrollTop = 0;
    } catch (error) {
      if (generation !== detailGeneration || currentDetail !== detail) return;
      loadingOlder = false;
      olderLoadError = String(error);
      renderMessages(detail);
      messageList.querySelector(".thread-load-older")?.focus();
    }
  }

  async function loadFullOverview() {
    const detail = currentDetail;
    if (!detail || detail.overviewComplete || loadingFullOverview) return;
    const generation = detailGeneration;
    loadingFullOverview = true;
    overviewView.setNotice(t("loadingFullOverview"));
    try {
      const overview = await onReadFullOverview(detail.id);
      if (generation !== detailGeneration || currentDetail !== detail) return;
      detail.fileChanges = overview.fileChanges;
      detail.issues = overview.issues;
      detail.insights = overview.insights;
      detail.overviewComplete = true;
      insightsView.render(detail);
      overviewView.setDetail(detail, { preserveDisclosure: true });
      overviewView.setNotice(null);
    } catch (error) {
      if (generation === detailGeneration && currentDetail === detail) {
        overviewView.setNotice(t("readFailed", { error: String(error) }));
      }
    } finally {
      if (generation === detailGeneration) loadingFullOverview = false;
    }
  }

  function openLoading(thread) {
    detailGeneration += 1;
    currentDetail = null;
    currentReadError = null;
    loadingOlder = false;
    olderLoadError = null;
    loadingFullOverview = false;
    messageSearch.reset();
    setDialogTitle(thread.title);
    setDialogMeta(thread.updatedAt);
    messageList.replaceChildren();
    insightsView.clear();
    overviewView.clear();
    renderActions();
    fileDiffView.clear();
    imagePreviewView.close();
    showStatus(t("readingThread"));
    threadDialog.showModal();
  }

  function showDetail(detail) {
    detailGeneration += 1;
    currentDetail = detail;
    currentReadError = null;
    loadingOlder = false;
    olderLoadError = null;
    loadingFullOverview = false;
    messageSearch.setMessages(detail.messages, { resetActiveMatch: true });
    setDialogTitle(detail.title);
    setDialogMeta(detail.updatedAt);
    statusOverlay.hide();
    insightsView.render(detail);
    overviewView.setDetail(detail);
    renderActions();
    renderMessages(detail);
    if (sidebarExpanded) void loadFullOverview();
  }

  function showReadFailure(error) {
    currentReadError = error;
    showStatus(t("readFailed", { error: String(error) }), true);
  }

  function updateLanguage() {
    renderCloseIconButton(dialogCloseButton, { label: t("closeThreadDetail") });
    renderSidebarVisibility();
    renderActions();
    imagePreviewView.updateLanguage();
    if (!threadDialog.open) {
      dialogTitle.textContent = "";
      dialogTitle.removeAttribute("title");
      dialogTitle.removeAttribute("aria-label");
      // 文件对比面板在详情弹窗内延迟打开；关闭详情时切换语言也需提前同步其按钮文案。
      fileDiffView.updateLanguage();
      return;
    }
    if (currentDetail) {
      setDialogMeta(currentDetail.updatedAt);
      insightsView.render(currentDetail);
      overviewView.updateLanguage();
      renderActions();
      fileDiffView.updateLanguage();
      messageSearch.setMessages(currentDetail.messages);
      renderMessages(currentDetail);
    } else {
      insightsView.clear();
      overviewView.clear();
      fileDiffView.clear();
      messageSearch.updateLanguage();
      if (currentReadError !== null) showReadFailure(currentReadError);
      else showStatus(t("readingThread"));
    }
    if (statusOverlay.isVisible() && statusOverlay.getKind() === "loading") {
      statusOverlay.setMessage(t("readingThread"));
    }
  }

  dialogCloseButton.addEventListener("click", () => threadDialog.close());
  sidebarToggle.addEventListener("click", () => {
    sidebarExpanded = !sidebarExpanded;
    renderSidebarVisibility();
    if (sidebarExpanded) void loadFullOverview();
  });
  copyIdButton.addEventListener("click", async () => {
    if (!currentDetail) return;
    copyIdButton.disabled = true;
    try {
      await copyText(currentDetail.id);
      renderCopyIdButton("copied");
      window.setTimeout(renderActions, 1_200);
    } catch (error) {
      showStatus(t("readFailed", { error: String(error) }), true);
      renderActions();
    }
  });
  refreshButton.addEventListener("click", async () => {
    if (!currentDetail) return;
    currentReadError = null;
    refreshButton.disabled = true;
    setRefreshIconButtonLoading(refreshButton, true);
    showStatus(t("readingThread"));
    try {
      showDetail(await onRefreshThread(currentDetail.id));
    } catch (error) {
      showReadFailure(error);
    } finally {
      setRefreshIconButtonLoading(refreshButton, false);
      renderActions();
    }
  });
  exportButton.addEventListener("click", async () => {
    if (!currentDetail) return;
    exportButton.disabled = true;
    try {
      await onExportThread(currentDetail.id);
      renderActions();
    } catch (error) {
      showStatus(t("readFailed", { error: String(error) }), true);
      renderActions();
    }
  });
  threadDialog.addEventListener("cancel", (event) => {
    if (imagePreviewView.isOpen() || imagePreviewView.handlingEscape()) {
      event.preventDefault();
      if (imagePreviewView.isOpen()) imagePreviewView.close();
    } else if (fileDiffView.isOpen()) {
      event.preventDefault();
      fileDiffView.close();
    }
  });
  threadDialog.addEventListener("click", (event) => {
    if (event.target === threadDialog) threadDialog.close();
  });
  renderActions();
  renderSidebarVisibility();
  return { openLoading, showDetail, showReadFailure, updateLanguage };
}
