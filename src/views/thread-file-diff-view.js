import { renderCloseIconButton } from "../utils/close-icon-button.js";

/**
 * 渲染 Codex 会话已记录的统一 diff。这里不会读取当前工作区，因此历史差异不会被后续修改覆盖。
 */
export function createThreadFileDiffView({ t }) {
  const panel = document.querySelector("#file-diff-panel");
  const title = document.querySelector("#file-diff-title");
  const summary = document.querySelector("#file-diff-summary");
  const list = document.querySelector("#file-diff-list");
  const closeButton = document.querySelector("#file-diff-close");
  const sideBySideButton = document.querySelector("#file-diff-side-by-side");
  const unifiedButton = document.querySelector("#file-diff-unified");
  let currentActivity = null;
  let layout = "side-by-side";

  function changeTypeLabel(changeType) {
    const labels = {
      add: "fileChangeTypeAdd",
      delete: "fileChangeTypeDelete",
      update: "fileChangeTypeUpdate",
    };
    return t(labels[changeType] ?? "fileChangeTypeUpdate");
  }

  function createDiffLine(line) {
    const row = document.createElement("span");
    row.className = "file-diff-line";
    if (line.startsWith("@@")) row.classList.add("is-hunk");
    else if (line.startsWith("+") && !line.startsWith("+++")) row.classList.add("is-added");
    else if (line.startsWith("-") && !line.startsWith("---")) row.classList.add("is-removed");
    row.textContent = line || " ";
    return row;
  }

  function lineKind(line) {
    if (line.startsWith("@@")) return "hunk";
    if (line.startsWith("+") && !line.startsWith("+++")) return "added";
    if (line.startsWith("-") && !line.startsWith("---")) return "removed";
    return "context";
  }

  function createSideBySideLine(line, kind = lineKind(line ?? "")) {
    const row = document.createElement("span");
    row.className = "file-diff-side-by-side-line";
    if (line === null) {
      row.classList.add("is-empty");
    } else if (kind === "hunk") row.classList.add("is-hunk");
    else if (kind === "added") row.classList.add("is-added");
    else if (kind === "removed") row.classList.add("is-removed");
    row.textContent = line || " ";
    return row;
  }

  function appendSideBySideRow(container, before, after) {
    after.classList.add("is-right");
    container.append(before, after);
  }

  /** 将统一格式 diff 的相邻删除、新增行配对，保持左右版本的行级对齐。 */
  function createSideBySideDiff(diff) {
    const container = document.createElement("div");
    container.className = "file-diff-side-by-side";
    const oldHeader = document.createElement("span");
    oldHeader.className = "file-diff-side-by-side-header";
    oldHeader.textContent = t("fileDiffBefore");
    const newHeader = document.createElement("span");
    newHeader.className = "file-diff-side-by-side-header is-right";
    newHeader.textContent = t("fileDiffAfter");
    container.append(oldHeader, newHeader);

    const lines = diff.replaceAll("\r\n", "\n").split("\n");
    for (let index = 0; index < lines.length;) {
      const line = lines[index];
      const kind = lineKind(line);
      if (kind === "hunk") {
        const hunk = createSideBySideLine(line, kind);
        hunk.classList.add("is-hunk-label");
        container.append(hunk);
        index += 1;
        continue;
      }
      if (kind === "removed") {
        const removed = [];
        while (index < lines.length && lineKind(lines[index]) === "removed") removed.push(lines[index++]);
        const added = [];
        while (index < lines.length && lineKind(lines[index]) === "added") added.push(lines[index++]);
        const rowCount = Math.max(removed.length, added.length);
        for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
          appendSideBySideRow(
            container,
            createSideBySideLine(removed[rowIndex] ?? null, "removed"),
            createSideBySideLine(added[rowIndex] ?? null, "added"),
          );
        }
        continue;
      }
      if (kind === "added") {
        appendSideBySideRow(container, createSideBySideLine(null), createSideBySideLine(line, kind));
        index += 1;
        continue;
      }
      appendSideBySideRow(container, createSideBySideLine(line, kind), createSideBySideLine(line, kind));
      index += 1;
    }
    return container;
  }

  function renderDiff(diff) {
    if (layout === "side-by-side") return createSideBySideDiff(diff);
    const code = document.createElement("pre");
    code.className = "file-diff-code";
    for (const line of diff.replaceAll("\r\n", "\n").split("\n")) code.append(createDiffLine(line));
    return code;
  }

  function updateLayoutButtons() {
    sideBySideButton.classList.toggle("is-active", layout === "side-by-side");
    sideBySideButton.setAttribute("aria-pressed", String(layout === "side-by-side"));
    unifiedButton.classList.toggle("is-active", layout === "unified");
    unifiedButton.setAttribute("aria-pressed", String(layout === "unified"));
  }

  function render() {
    const changes = currentActivity?.changes ?? [];
    title.textContent = t("fileDiffTitle");
    summary.textContent = t("fileDiffSummary", { count: changes.length });
    list.replaceChildren();
    for (const change of changes) {
      const file = document.createElement("article");
      file.className = "file-diff-file";
      const header = document.createElement("header");
      const path = document.createElement("code");
      path.textContent = change.path;
      path.title = change.path;
      const kind = document.createElement("span");
      kind.className = `file-diff-kind file-diff-kind-${change.changeType ?? "update"}`;
      kind.textContent = changeTypeLabel(change.changeType);
      header.append(path, kind);
      file.append(header);
      if (change.movePath) {
        const moved = document.createElement("p");
        moved.className = "file-diff-moved";
        moved.textContent = `${t("fileChangeMovedTo")} ${change.movePath}`;
        file.append(moved);
      }
      if (!change.diff) {
        const unavailable = document.createElement("p");
        unavailable.className = "file-diff-empty";
        unavailable.textContent = t("fileDiffUnavailable");
        file.append(unavailable);
      } else {
        file.append(renderDiff(change.diff));
      }
      list.append(file);
    }
  }

  function show(activity) {
    currentActivity = activity;
    // 每次进入文件对比都以左右布局打开；用户可在当前查看期间切换为上下布局。
    layout = "side-by-side";
    updateLayoutButtons();
    render();
    panel.hidden = false;
    closeButton.focus();
  }

  function close() {
    panel.hidden = true;
  }

  function isOpen() {
    return !panel.hidden;
  }

  function clear() {
    currentActivity = null;
    close();
    list.replaceChildren();
  }

  function updateLanguage() {
    renderCloseIconButton(closeButton, { label: t("closeFileDiff") });
    sideBySideButton.textContent = t("fileDiffSideBySide");
    sideBySideButton.setAttribute("aria-label", t("fileDiffSideBySide"));
    unifiedButton.textContent = t("fileDiffUnified");
    unifiedButton.setAttribute("aria-label", t("fileDiffUnified"));
    updateLayoutButtons();
    if (currentActivity) render();
  }

  closeButton.addEventListener("click", close);
  sideBySideButton.addEventListener("click", () => {
    layout = "side-by-side";
    updateLayoutButtons();
    if (currentActivity) render();
  });
  unifiedButton.addEventListener("click", () => {
    layout = "unified";
    updateLayoutButtons();
    if (currentActivity) render();
  });
  updateLanguage();
  return { show, close, clear, isOpen, updateLanguage };
}
