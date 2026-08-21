/**
 * 会话列表的分页、空态和复制按钮都在此处渲染；查询策略仍由页面控制器决定。
 */
export function createThreadListView({ t, formatUpdated, copyText, onOpenThread }) {
  const threadList = document.querySelector("#thread-list");
  const threadSearch = document.querySelector("#thread-search");
  const searchResult = document.querySelector("#search-result");
  const threadPagination = document.querySelector("#thread-pagination");
  const previousPageButton = document.querySelector("#previous-page");
  const nextPageButton = document.querySelector("#next-page");
  const pageIndicator = document.querySelector("#page-indicator");

  function renderThreads(threads, emptyMessage) {
    threadList.replaceChildren();
    if (threads.length === 0) {
      const empty = document.createElement("div");
      empty.className = "thread-empty";
      empty.textContent = emptyMessage;
      threadList.append(empty);
      return;
    }

    for (const thread of threads) {
      const item = document.createElement("article");
      item.className = "thread-item";
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.setAttribute("aria-label", t("viewingThread", { title: thread.title }));
      item.innerHTML = `
        <span class="thread-title"></span>
        <div class="thread-meta">
          <div class="thread-id-line"><code></code><button class="id-copy-button" type="button">${t("copyId")}</button></div>
          <time class="thread-updated-at"></time>
          <time class="thread-created-at"></time>
        </div>
      `;
      item.querySelector(".thread-title").textContent = thread.title;
      const id = item.querySelector("code");
      id.textContent = `${thread.id.slice(0, 8)}…`;
      id.title = `${t("copyId")}：${thread.id}`;
      const updatedAt = item.querySelector(".thread-updated-at");
      updatedAt.textContent = t("updated", { value: formatUpdated(thread.updatedAt) });
      updatedAt.dateTime = String(thread.updatedAt ?? "");
      const createdAt = item.querySelector(".thread-created-at");
      if (thread.createdAt) {
        createdAt.textContent = t("created", { value: formatUpdated(thread.createdAt) });
        createdAt.dateTime = String(thread.createdAt);
      } else {
        createdAt.hidden = true;
      }

      const copyIdButton = item.querySelector(".id-copy-button");
      copyIdButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        copyIdButton.disabled = true;
        try {
          await copyText(thread.id);
          copyIdButton.textContent = t("copied");
        } catch {
          copyIdButton.textContent = t("copyFailed");
        }
        window.setTimeout(() => {
          copyIdButton.disabled = false;
          copyIdButton.textContent = t("copyId");
        }, 1_500);
      });
      copyIdButton.addEventListener("keydown", (event) => event.stopPropagation());
      item.addEventListener("click", () => onOpenThread(thread));
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenThread(thread);
        }
      });
      threadList.append(item);
    }
  }

  function renderPagination(page, totalPages) {
    threadPagination.hidden = totalPages <= 1;
    if (totalPages <= 1) return;
    pageIndicator.textContent = `${page} / ${totalPages}`;
    previousPageButton.disabled = page <= 1;
    nextPageButton.disabled = page >= totalPages;
  }

  return {
    getSearchQuery: () => threadSearch.value,
    setSearchResult: (value) => { searchResult.textContent = value; },
    renderThreads,
    renderPagination,
    hidePagination: () => { threadPagination.hidden = true; },
    onSearchInput: (listener) => threadSearch.addEventListener("input", listener),
    onPreviousPage: (listener) => previousPageButton.addEventListener("click", listener),
    onNextPage: (listener) => nextPageButton.addEventListener("click", listener),
  };
}
