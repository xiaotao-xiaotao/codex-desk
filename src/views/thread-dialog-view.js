import { createThreadInsightsView } from "./thread-insights-view.js";
import { createThreadMessageSearch } from "./thread-message-search.js";
import { renderCopyIconButton, renderCopyTextButton } from "../utils/copy-icon-button.js";

const DIALOG_TITLE_MAX_LENGTH = 52;

/**
 * 会话详情视图保留已打开的详情数据，以便切换语言时可重新渲染角色与复制按钮。
 */
export function createThreadDialogView({ t, formatUpdated, copyText }) {
  const threadDialog = document.querySelector("#thread-dialog");
  const dialogTitle = document.querySelector("#dialog-title");
  const dialogMeta = document.querySelector("#dialog-meta");
  const dialogStatus = document.querySelector("#dialog-status");
  const messageList = document.querySelector("#message-list");
  const dialogCloseButton = document.querySelector("#dialog-close");
  const readingModeButton = document.querySelector("#thread-reading-mode-button");
  const resumeThreadButton = document.querySelector("#resume-thread-button");
  const searchInput = document.querySelector("#dialog-search-input");
  const searchResult = document.querySelector("#dialog-search-result");
  const searchPreviousButton = document.querySelector("#dialog-search-previous");
  const searchNextButton = document.querySelector("#dialog-search-next");
  const insightsView = createThreadInsightsView({ t });
  let currentDetail = null;
  let readingMode = false;
  const messageSearch = createThreadMessageSearch({
    t,
    input: searchInput,
    result: searchResult,
    previousButton: searchPreviousButton,
    nextButton: searchNextButton,
    onChange: ({ focusCurrentMatch }) => {
      if (currentDetail) renderMessages(currentDetail, { focusCurrentMatch });
    },
  });

  function showStatus(message, error = false) {
    dialogStatus.textContent = message;
    dialogStatus.dataset.kind = error ? "error" : "normal";
    dialogStatus.hidden = false;
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

  function focusActiveMatch() {
    const { activeMessageIndex } = messageSearch.getState();
    if (activeMessageIndex === undefined) return;
    const message = messageList.querySelector(`[data-message-index="${activeMessageIndex}"]`);
    message?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function renderReadingMode() {
    threadDialog.classList.toggle("is-reading-mode", readingMode);
    readingModeButton.classList.toggle("is-active", readingMode);
    readingModeButton.setAttribute("aria-pressed", String(readingMode));
    readingModeButton.title = readingMode ? t("exitReadingMode") : t("enterReadingMode");
    readingModeButton.ariaLabel = readingModeButton.title;
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
      const item = document.createElement("article");
      item.className = `message message-${message.role}`;
      item.dataset.messageIndex = String(index);
      if (matchingIndexes.has(index)) item.classList.add("is-search-match");
      if (index === activeMessageIndex) item.classList.add("is-active-search-match");
      const header = document.createElement("div");
      header.className = "message-header";
      const role = document.createElement("span");
      role.className = "message-role";
      role.textContent = message.role === "user" ? t("you") : t("codex");
      const copy = document.createElement("button");
      copy.className = "copy-button";
      copy.type = "button";
      renderCopyIconButton(copy, { label: t("copyId") });
      copy.addEventListener("click", async () => {
        copy.disabled = true;
        try {
          await copyText(message.text);
          renderCopyIconButton(copy, { label: t("copied"), state: "copied" });
        } catch {
          renderCopyIconButton(copy, { label: t("copyFailedLong"), state: "failed" });
        }
        window.setTimeout(() => {
          copy.disabled = false;
          renderCopyIconButton(copy, { label: t("copyId") });
        }, 1_500);
      });
      const text = document.createElement("p");
      messageSearch.appendHighlightedText(text, message.text);
      header.append(role, copy);
      item.append(header, text);
      messageList.append(item);
    }
    if (focusCurrentMatch && activeMessageIndex !== undefined) {
      window.requestAnimationFrame(focusActiveMatch);
    }
  }

  function openLoading(thread) {
    currentDetail = null;
    readingMode = false;
    renderReadingMode();
    messageSearch.reset();
    setDialogTitle(thread.title);
    dialogMeta.textContent = t("updated", { value: formatUpdated(thread.updatedAt) });
    updateResumeButton(thread.id);
    messageList.replaceChildren();
    insightsView.clear();
    showStatus(t("readingThread"));
    threadDialog.showModal();
  }

  function showDetail(detail) {
    currentDetail = detail;
    messageSearch.setMessages(detail.messages, { resetActiveMatch: true });
    setDialogTitle(detail.title);
    dialogMeta.textContent = t("updated", { value: formatUpdated(detail.updatedAt) });
    updateResumeButton(detail.id);
    dialogStatus.hidden = true;
    insightsView.render(detail);
    renderMessages(detail);
  }

  function showReadFailure(error) {
    showStatus(t("readFailed", { error: String(error) }), true);
  }

  function updateResumeButton(threadId) {
    resumeThreadButton.hidden = !threadId;
    resumeThreadButton.dataset.threadId = threadId ?? "";
    renderCopyTextButton(resumeThreadButton, { label: t("resumeThread") });
  }

  function updateLanguage() {
    dialogCloseButton.ariaLabel = t("closeThreadDetail");
    renderReadingMode();
    renderCopyTextButton(resumeThreadButton, { label: t("resumeThread") });
    if (!threadDialog.open) {
      dialogTitle.textContent = t("threadDetail");
      dialogTitle.removeAttribute("title");
      dialogTitle.removeAttribute("aria-label");
      return;
    }
    if (currentDetail) {
      dialogMeta.textContent = t("updated", { value: formatUpdated(currentDetail.updatedAt) });
      insightsView.render(currentDetail);
      messageSearch.setMessages(currentDetail.messages);
      renderMessages(currentDetail);
    } else {
      insightsView.clear();
      messageSearch.updateLanguage();
      showStatus(t("readingThread"));
    }
  }

  dialogCloseButton.addEventListener("click", () => threadDialog.close());
  readingModeButton.addEventListener("click", () => {
    readingMode = !readingMode;
    renderReadingMode();
  });
  resumeThreadButton.addEventListener("click", async () => {
    const threadId = resumeThreadButton.dataset.threadId;
    if (!threadId) return;
    resumeThreadButton.disabled = true;
    try {
      // 只复制官方 CLI 恢复命令，不直接拉起终端，避免应用替用户执行本机命令。
      await copyText(`codex resume ${threadId}`);
      renderCopyTextButton(resumeThreadButton, { label: t("resumeThreadCopied"), state: "copied" });
    } catch {
      renderCopyTextButton(resumeThreadButton, { label: t("copyFailedLong"), state: "failed" });
    }
    window.setTimeout(() => {
      resumeThreadButton.disabled = false;
      renderCopyTextButton(resumeThreadButton, { label: t("resumeThread") });
    }, 1_500);
  });
  threadDialog.addEventListener("click", (event) => {
    if (event.target === threadDialog) threadDialog.close();
  });
  threadDialog.addEventListener("close", () => {
    readingMode = false;
    renderReadingMode();
  });

  return { openLoading, showDetail, showReadFailure, updateLanguage };
}
