import { createThreadInsightsView } from "./thread-insights-view.js";

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
  const resumeThreadButton = document.querySelector("#resume-thread-button");
  const insightsView = createThreadInsightsView({ t });
  let currentDetail = null;

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

  function renderMessages(detail) {
    messageList.replaceChildren();
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

    for (const message of detail.messages) {
      const item = document.createElement("article");
      item.className = `message message-${message.role}`;
      const header = document.createElement("div");
      header.className = "message-header";
      const role = document.createElement("span");
      role.className = "message-role";
      role.textContent = message.role === "user" ? t("you") : t("codex");
      const copy = document.createElement("button");
      copy.className = "copy-button";
      copy.type = "button";
      copy.textContent = t("copy");
      copy.addEventListener("click", async () => {
        copy.disabled = true;
        try {
          await copyText(message.text);
          copy.textContent = t("copied");
        } catch {
          copy.textContent = t("copyFailedLong");
        }
        window.setTimeout(() => {
          copy.disabled = false;
          copy.textContent = t("copy");
        }, 1_500);
      });
      const text = document.createElement("p");
      text.textContent = message.text;
      header.append(role, copy);
      item.append(header, text);
      messageList.append(item);
    }
  }

  function openLoading(thread) {
    currentDetail = null;
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
    resumeThreadButton.textContent = t("resumeThread");
    resumeThreadButton.title = `codex resume ${threadId ?? ""}`;
  }

  function updateLanguage() {
    dialogCloseButton.ariaLabel = t("closeThreadDetail");
    resumeThreadButton.textContent = t("resumeThread");
    if (!threadDialog.open) {
      dialogTitle.textContent = t("threadDetail");
      dialogTitle.removeAttribute("title");
      dialogTitle.removeAttribute("aria-label");
      return;
    }
    if (currentDetail) {
      dialogMeta.textContent = t("updated", { value: formatUpdated(currentDetail.updatedAt) });
      insightsView.render(currentDetail);
      renderMessages(currentDetail);
    } else {
      insightsView.clear();
      showStatus(t("readingThread"));
    }
  }

  dialogCloseButton.addEventListener("click", () => threadDialog.close());
  resumeThreadButton.addEventListener("click", async () => {
    const threadId = resumeThreadButton.dataset.threadId;
    if (!threadId) return;
    resumeThreadButton.disabled = true;
    try {
      // 只复制官方 CLI 恢复命令，不直接拉起终端，避免应用替用户执行本机命令。
      await copyText(`codex resume ${threadId}`);
      resumeThreadButton.textContent = t("resumeThreadCopied");
    } catch {
      resumeThreadButton.textContent = t("copyFailedLong");
    }
    window.setTimeout(() => {
      resumeThreadButton.disabled = false;
      resumeThreadButton.textContent = t("resumeThread");
    }, 1_500);
  });
  threadDialog.addEventListener("click", (event) => {
    if (event.target === threadDialog) threadDialog.close();
  });

  return { openLoading, showDetail, showReadFailure, updateLanguage };
}
