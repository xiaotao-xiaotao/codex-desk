import { createThreadInsightsView } from "./thread-insights-view.js";
import { createThreadMessageSearch } from "./thread-message-search.js";
import { renderCopyIconButton } from "../utils/copy-icon-button.js";

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
  const searchInput = document.querySelector("#dialog-search-input");
  const searchResult = document.querySelector("#dialog-search-result");
  const insightsView = createThreadInsightsView({ t });
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
    const value = formatUpdated(updatedAt);
    const label = t("updated", { value });
    dialogMeta.textContent = label;
    dialogMeta.title = label;
    dialogMeta.setAttribute("aria-label", label);
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
    messageSearch.reset();
    setDialogTitle(thread.title);
    setDialogMeta(thread.updatedAt);
    messageList.replaceChildren();
    insightsView.clear();
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
    renderMessages(detail);
  }

  function showReadFailure(error) {
    showStatus(t("readFailed", { error: String(error) }), true);
  }

  function updateLanguage() {
    dialogCloseButton.ariaLabel = t("closeThreadDetail");
    if (!threadDialog.open) {
      dialogTitle.textContent = t("threadDetail");
      dialogTitle.removeAttribute("title");
      dialogTitle.removeAttribute("aria-label");
      return;
    }
    if (currentDetail) {
      setDialogMeta(currentDetail.updatedAt);
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
  threadDialog.addEventListener("click", (event) => {
    if (event.target === threadDialog) threadDialog.close();
  });
  return { openLoading, showDetail, showReadFailure, updateLanguage };
}
