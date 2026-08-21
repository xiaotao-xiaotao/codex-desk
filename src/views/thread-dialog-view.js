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
  let currentDetail = null;

  function showStatus(message, error = false) {
    dialogStatus.textContent = message;
    dialogStatus.dataset.kind = error ? "error" : "normal";
    dialogStatus.hidden = false;
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
    dialogTitle.textContent = thread.title;
    dialogMeta.textContent = t("updated", { value: formatUpdated(thread.updatedAt) });
    messageList.replaceChildren();
    showStatus(t("readingThread"));
    threadDialog.showModal();
  }

  function showDetail(detail) {
    currentDetail = detail;
    dialogTitle.textContent = detail.title;
    dialogMeta.textContent = t("updated", { value: formatUpdated(detail.updatedAt) });
    dialogStatus.hidden = true;
    renderMessages(detail);
  }

  function showReadFailure(error) {
    showStatus(t("readFailed", { error: String(error) }), true);
  }

  function updateLanguage() {
    dialogCloseButton.ariaLabel = t("closeThreadDetail");
    if (!threadDialog.open) {
      dialogTitle.textContent = t("threadDetail");
      return;
    }
    if (currentDetail) {
      dialogMeta.textContent = t("updated", { value: formatUpdated(currentDetail.updatedAt) });
      renderMessages(currentDetail);
    } else {
      showStatus(t("readingThread"));
    }
  }

  dialogCloseButton.addEventListener("click", () => threadDialog.close());
  threadDialog.addEventListener("click", (event) => {
    if (event.target === threadDialog) threadDialog.close();
  });

  return { openLoading, showDetail, showReadFailure, updateLanguage };
}
