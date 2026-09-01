import { createThreadActivityView, createThreadInsightsView } from "./thread-insights-view.js";
import { createThreadFileDiffView } from "./thread-file-diff-view.js";
import { createThreadImagePreviewView } from "./thread-image-preview-view.js";
import { createThreadMessageSearch } from "./thread-message-search.js";
import { createThreadOverviewView } from "./thread-overview-view.js";
import { renderCopyIconButton } from "../utils/copy-icon-button.js";
import { renderCloseIconButton } from "../utils/close-icon-button.js";

const DIALOG_TITLE_MAX_LENGTH = 52;

/**
 * 会话详情视图保留已打开的详情数据，以便切换语言时可重新渲染角色与复制按钮。
 */
export function createThreadDialogView({
  t,
  formatUpdated,
  copyText,
  copyMessage,
  onRefreshThread,
  onExportThread,
}) {
  const threadDialog = document.querySelector("#thread-dialog");
  const dialogTitle = document.querySelector("#dialog-title");
  const dialogMeta = document.querySelector("#dialog-meta");
  const dialogStatus = document.querySelector("#dialog-status");
  const messageList = document.querySelector("#message-list");
  const dialogCloseButton = document.querySelector("#dialog-close");
  const searchInput = document.querySelector("#dialog-search-input");
  const searchResult = document.querySelector("#dialog-search-result");
  const exportButton = document.querySelector("#thread-export");
  const copyIdButton = document.querySelector("#thread-copy-id");
  const refreshButton = document.querySelector("#thread-refresh");
  const fileDiffView = createThreadFileDiffView({ t });
  const imagePreviewView = createThreadImagePreviewView({ t });
  const insightsView = createThreadInsightsView({ t });
  const overviewView = createThreadOverviewView({
    t,
    formatUpdated,
    onViewFileChange: (activity) => fileDiffView.show(activity),
  });
  const activityView = createThreadActivityView({
    t,
    onViewFileChanges: (activity) => fileDiffView.show(activity),
  });
  let currentDetail = null;
  const messageSearch = createThreadMessageSearch({
    t,
    input: searchInput,
    result: searchResult,
    onChange: ({ focusCurrentMatch }) => {
      if (currentDetail) renderMessages(currentDetail, { focusCurrentMatch });
    },
  });

  function showStatus(message, error = false) {
    dialogStatus.textContent = message;
    dialogStatus.dataset.kind = error ? "error" : "normal";
    dialogStatus.hidden = false;
  }

  function renderSidebarActions() {
    exportButton.textContent = t("threadExport");
    copyIdButton.textContent = t("threadCopyId");
    refreshButton.textContent = t("threadRefresh");
    const disabled = !currentDetail;
    exportButton.disabled = disabled;
    copyIdButton.disabled = disabled;
    refreshButton.disabled = disabled;
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

  function setDialogMeta() {
    // 更新时间已纳入左侧“会话基础信息”，标题区域只保留会话名称。
    dialogMeta.textContent = "";
    dialogMeta.hidden = true;
    dialogMeta.removeAttribute("title");
    dialogMeta.removeAttribute("aria-label");
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
        const copy = document.createElement("button");
        copy.className = "copy-button";
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
        const text = document.createElement("p");
        messageSearch.appendHighlightedText(text, message.text);
        // 角色由消息气泡的左右位置区分，复制按钮固定在右上角，不占用额外标题行。
        item.append(copy, text);
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
          image.addEventListener("dblclick", () => imagePreviewView.show(image));
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
      const activityDisclosure = activityView.createDisclosure(message.activities);
      if (activityDisclosure) entry.append(activityDisclosure);
      messageList.append(entry);
    }
    if (focusCurrentMatch && activeMessageIndex !== undefined) {
      window.requestAnimationFrame(focusActiveMatch);
    }
  }

  function openLoading(thread) {
    currentDetail = null;
    messageSearch.reset();
    setDialogTitle(thread.title);
    setDialogMeta(thread.updatedAt);
    messageList.replaceChildren();
    insightsView.clear();
    overviewView.clear();
    renderSidebarActions();
    fileDiffView.clear();
    imagePreviewView.close();
    showStatus(t("readingThread"));
    threadDialog.showModal();
  }

  function showDetail(detail) {
    currentDetail = detail;
    messageSearch.setMessages(detail.messages, { resetActiveMatch: true });
    setDialogTitle(detail.title);
    setDialogMeta(detail.updatedAt);
    dialogStatus.hidden = true;
    insightsView.render(detail);
    overviewView.setDetail(detail);
    renderSidebarActions();
    renderMessages(detail);
  }

  function showReadFailure(error) {
    showStatus(t("readFailed", { error: String(error) }), true);
  }

  function updateLanguage() {
    renderCloseIconButton(dialogCloseButton, { label: t("closeThreadDetail") });
    imagePreviewView.updateLanguage();
    if (!threadDialog.open) {
      dialogTitle.textContent = t("threadDetail");
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
      renderSidebarActions();
      fileDiffView.updateLanguage();
      messageSearch.setMessages(currentDetail.messages);
      renderMessages(currentDetail);
    } else {
      insightsView.clear();
      overviewView.clear();
      fileDiffView.clear();
      messageSearch.updateLanguage();
      showStatus(t("readingThread"));
    }
  }

  dialogCloseButton.addEventListener("click", () => threadDialog.close());
  copyIdButton.addEventListener("click", async () => {
    if (!currentDetail) return;
    copyIdButton.disabled = true;
    try {
      await copyText(currentDetail.id);
      copyIdButton.textContent = t("copied");
      window.setTimeout(renderSidebarActions, 1_200);
    } catch (error) {
      showStatus(t("readFailed", { error: String(error) }), true);
      renderSidebarActions();
    }
  });
  refreshButton.addEventListener("click", async () => {
    if (!currentDetail) return;
    refreshButton.disabled = true;
    showStatus(t("readingThread"));
    try {
      showDetail(await onRefreshThread(currentDetail.id));
    } catch (error) {
      showReadFailure(error);
      renderSidebarActions();
    }
  });
  exportButton.addEventListener("click", async () => {
    if (!currentDetail) return;
    exportButton.disabled = true;
    try {
      await onExportThread(currentDetail.id);
      renderSidebarActions();
    } catch (error) {
      showStatus(t("readFailed", { error: String(error) }), true);
      renderSidebarActions();
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
  renderSidebarActions();
  return { openLoading, showDetail, showReadFailure, updateLanguage };
}
