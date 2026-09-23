import { groupConsecutiveActivities } from "./activity-summary.js";

function createSummaryItem(label, value) {
  const item = document.createElement("span");
  item.className = "insight-summary-item";
  const metricValue = document.createElement("strong");
  metricValue.textContent = String(value ?? 0);
  item.append(metricValue, document.createTextNode(` ${label}`));
  return item;
}

/**
 * 会话洞察区只渲染汇总指标；具体操作由消息视图按回合放在对应回复下方。
 */
export function createThreadInsightsView({ t }) {
  const insightList = document.querySelector("#thread-insights");

  function render(detail) {
    const insights = detail.insights ?? {};
    const primary = document.createElement("div");
    primary.className = "insight-summary-primary";
    primary.append(
      createSummaryItem(t("insightMessages"), insights.messages),
      createSummaryItem(t("insightToolCalls"), insights.toolCalls),
    );
    insightList.replaceChildren(primary);
  }

  function clear() {
    insightList.replaceChildren();
  }

  return { render, clear };
}

/**
 * 将单个回合的结构化操作渲染为消息下方的折叠卡片；文件操作仍复用完整 diff 面板。
 */
export function createThreadActivityView({ t, onViewFileChanges }) {
  const fullTextTooltip = document.createElement("div");
  fullTextTooltip.className = "activity-full-text-tooltip";
  fullTextTooltip.hidden = true;
  fullTextTooltip.setAttribute("role", "tooltip");
  // 原生 dialog 位于顶层；提示必须成为 dialog 子元素才不会被弹窗遮住。
  document.querySelector("#thread-dialog").append(fullTextTooltip);

  function positionFullTextTooltip(clientX, clientY) {
    const gap = 12;
    const maxLeft = window.innerWidth - fullTextTooltip.offsetWidth - gap;
    const maxTop = window.innerHeight - fullTextTooltip.offsetHeight - gap;
    fullTextTooltip.style.left = `${Math.max(gap, Math.min(clientX + gap, maxLeft))}px`;
    fullTextTooltip.style.top = `${Math.max(gap, Math.min(clientY + gap, maxTop))}px`;
  }

  function bindFullTextTooltip(element, text) {
    function isPointerOverEllipsis(event) {
      if (element.scrollWidth <= element.clientWidth) return false;
      const rect = element.getBoundingClientRect();
      const fontSize = Number.parseFloat(getComputedStyle(element).fontSize) || 12;
      const ellipsisWidth = Math.max(12, fontSize * 1.5);
      return event.clientX >= rect.right - ellipsisWidth && event.clientX <= rect.right;
    }

    const show = (clientX, clientY) => {
      fullTextTooltip.textContent = text;
      fullTextTooltip.hidden = false;
      positionFullTextTooltip(clientX, clientY);
    };
    element.addEventListener("mouseenter", (event) => {
      if (isPointerOverEllipsis(event)) show(event.clientX, event.clientY);
    });
    element.addEventListener("mousemove", (event) => {
      if (isPointerOverEllipsis(event)) {
        show(event.clientX, event.clientY);
      } else {
        fullTextTooltip.hidden = true;
      }
    });
    element.addEventListener("mouseleave", () => { fullTextTooltip.hidden = true; });
    element.addEventListener("focus", () => {
      const rect = element.getBoundingClientRect();
      show(rect.left, rect.bottom);
    });
    element.addEventListener("blur", () => { fullTextTooltip.hidden = true; });
  }

  function statusLabel(status) {
    const labels = {
      completed: "activityStatusCompleted",
      inProgress: "activityStatusInProgress",
      failed: "activityStatusFailed",
      interrupted: "activityStatusInterrupted",
    };
    return labels[status] ? t(labels[status]) : status || t("activityStatusUnknown");
  }

  function diffStats(diff) {
    const lines = String(diff ?? "").replaceAll("\r\n", "\n").split("\n");
    return {
      added: lines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length,
      removed: lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length,
    };
  }

  function parsePreviewLines(diff) {
    const previewLines = [];
    let oldLine = null;
    let newLine = null;
    for (const line of String(diff ?? "").replaceAll("\r\n", "\n").split("\n")) {
      const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunk) {
        oldLine = Number(hunk[1]);
        newLine = Number(hunk[2]);
        previewLines.push({ kind: "hunk", oldLine: "", newLine: "", text: line });
        continue;
      }
      if (line.startsWith("---") || line.startsWith("+++")) continue;
      if (line.startsWith("-")) {
        previewLines.push({ kind: "removed", oldLine, newLine: "", text: line.slice(1) });
        if (oldLine !== null) oldLine += 1;
      } else if (line.startsWith("+")) {
        previewLines.push({ kind: "added", oldLine: "", newLine, text: line.slice(1) });
        if (newLine !== null) newLine += 1;
      } else {
        previewLines.push({ kind: "context", oldLine, newLine, text: line.startsWith(" ") ? line.slice(1) : line });
        if (oldLine !== null) oldLine += 1;
        if (newLine !== null) newLine += 1;
      }
      if (previewLines.length >= 80) break;
    }
    return previewLines;
  }

  function createDiffStats(change) {
    const stats = diffStats(change.diff);
    const container = document.createElement("span");
    container.className = "activity-file-stats";
    const added = document.createElement("span");
    added.className = "is-added";
    added.textContent = `+${stats.added}`;
    const removed = document.createElement("span");
    removed.className = "is-removed";
    removed.textContent = `-${stats.removed}`;
    container.append(added, removed);
    return container;
  }

  function createSummaryDiffStats(changes) {
    const total = changes.reduce((result, change) => {
      const stats = diffStats(change.diff);
      result.added += stats.added;
      result.removed += stats.removed;
      return result;
    }, { added: 0, removed: 0 });
    const container = document.createElement("span");
    container.className = "message-file-summary-stats";
    const added = document.createElement("span");
    added.className = "is-added";
    added.textContent = `+${total.added}`;
    const removed = document.createElement("span");
    removed.className = "is-removed";
    removed.textContent = `-${total.removed}`;
    container.append(added, removed);
    return container;
  }

  function createFileHoverPreview(change) {
    const preview = document.createElement("div");
    preview.className = "activity-file-hover-preview";
    preview.setAttribute("role", "tooltip");
    const header = document.createElement("header");
    const path = document.createElement("code");
    path.textContent = change.path;
    header.append(path, createDiffStats(change));
    preview.append(header);

    if (!change.diff) {
      const unavailable = document.createElement("p");
      unavailable.textContent = t("fileDiffUnavailable");
      preview.append(unavailable);
      return preview;
    }

    const code = document.createElement("div");
    code.className = "activity-file-preview-code";
    for (const line of parsePreviewLines(change.diff)) {
      const row = document.createElement("div");
      row.className = `activity-file-preview-line is-${line.kind}`;
      const oldNumber = document.createElement("span");
      oldNumber.textContent = line.oldLine ?? "";
      const newNumber = document.createElement("span");
      newNumber.textContent = line.newLine ?? "";
      const text = document.createElement("code");
      text.textContent = line.text || " ";
      row.append(oldNumber, newNumber, text);
      code.append(row);
    }
    preview.append(code);
    return preview;
  }

  function renderFileActivity(container, activity) {
    for (const change of activity.changes) {
      const wrapper = document.createElement("div");
      wrapper.className = "activity-file-item";
      const row = document.createElement("button");
      row.className = "activity-file-row";
      row.type = "button";
      row.setAttribute("aria-label", t("openFileDiff", { count: 1 }));
      const content = document.createElement("span");
      content.className = "activity-file-content";
      const action = document.createElement("span");
      const actionKeys = {
        add: "activityCreatedFile",
        delete: "activityDeletedFile",
        update: "activityEditedFile",
      };
      action.textContent = t(actionKeys[change.changeType] ?? "activityEditedFile");
      const path = document.createElement("code");
      path.textContent = change.path.split(/[\\/]/).pop() || change.path;
      path.title = change.path;
      content.append(action, path);
      row.append(content, createDiffStats(change));
      row.addEventListener("click", () => onViewFileChanges({ ...activity, changes: [change] }));
      // 预览改由点击后进入完整差异面板，避免悬停时把长代码直接铺进聊天区。
      wrapper.append(row);
      container.append(wrapper);
    }
  }

  function renderActivities(container, activities) {
    for (const activity of groupConsecutiveActivities(activities)) {
      if (activity.kind === "file" && activity.changes?.length > 0) {
        renderFileActivity(container, activity);
        continue;
      }
      const row = document.createElement("article");
      row.className = `activity-row activity-row-${activity.kind || "tool"}`;

      const icon = document.createElement("span");
      icon.className = "activity-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = activity.kind === "file" ? "↳" : activity.kind === "issue" ? "!" : "›";

      const content = document.createElement("div");
      content.className = "activity-content";
      const title = document.createElement("strong");
      title.textContent = activity.kind === "command"
        ? `${t("activityRanCommand")} ${activity.title}`
        : activity.title;
      bindFullTextTooltip(title, activity.title);
      content.append(title);
      if (activity.detail && activity.kind !== "command") {
        const detail = document.createElement("span");
        detail.textContent = activity.detail;
        bindFullTextTooltip(detail, activity.detail);
        content.append(detail);
      }

      const meta = document.createElement("div");
      meta.className = "activity-meta";
      if (activity.count > 1) {
        const repeat = document.createElement("span");
        repeat.className = "activity-repeat";
        repeat.textContent = `×${activity.count}`;
        meta.append(repeat);
      }
      if (activity.status && !(activity.kind === "command" && activity.status === "completed")) {
        const status = document.createElement("span");
        status.className = `activity-status activity-status-${activity.status}`;
        status.textContent = statusLabel(activity.status);
        meta.append(status);
      }
      row.append(icon, content, meta);
      container.append(row);
    }
  }

  function createActivitySummaryIcon() {
    const icon = document.createElement("span");
    icon.className = "activity-summary-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = `<svg viewBox="0 0 20 20"><path d="m7 10.5 4.8-4.8a2.3 2.3 0 0 1 3.2 3.2l-6.4 6.4a3.3 3.3 0 0 1-4.7-4.7l6-6"></path></svg>`;
    return icon;
  }

  function createDisclosure(activities) {
    if (!activities?.length) return null;
    const disclosure = document.createElement("details");
    disclosure.className = "message-activity-disclosure";
    disclosure.open = true;
    const summary = document.createElement("summary");
    const fileChanges = activities
      .filter((activity) => activity.kind === "file")
      .flatMap((activity) => activity.changes ?? []);
    const fileCount = fileChanges.length;
    const commandCount = activities.filter((activity) => activity.kind === "command").length;
    const toolCount = activities.filter((activity) => activity.kind === "tool").length;
    const title = document.createElement("strong");
    const labels = [];
    if (fileCount > 0) labels.push(t("activityEditedFiles"));
    if (commandCount > 0) labels.push(t("activityRanCommands"));
    if (toolCount > 0) labels.push(t("activityUsedTools"));
    title.textContent = labels.length > 0
      ? labels.join(" · ")
      : t("messageActivitySummary", { count: activities.length });
    summary.append(createActivitySummaryIcon(), title);

    const list = document.createElement("div");
    list.className = "activity-list message-activity-list";
    renderActivities(list, activities);
    disclosure.append(summary, list);
    return disclosure;
  }

  function createFileSummary(activities) {
    const fileActivities = (activities ?? [])
      .filter((activity) => activity.kind === "file" && activity.changes?.length > 0);
    if (fileActivities.length === 0) return null;

    const changes = fileActivities.flatMap((activity) => activity.changes);
    const groupedFiles = new Map();
    for (const activity of fileActivities) {
      for (const change of activity.changes) {
        // 同一回合可能多次修改同一文件；结果卡片按路径合并，避免文件数量重复。
        const key = String(change.path ?? "").replaceAll("\\", "/");
        const existing = groupedFiles.get(key);
        if (existing) {
          existing.diffs.push(change.diff);
          existing.change = {
            ...existing.change,
            ...change,
            path: existing.change.path,
            diff: existing.diffs.filter(Boolean).join("\n"),
          };
        } else {
          groupedFiles.set(key, {
            activity,
            change: { ...change },
            diffs: [change.diff],
          });
        }
      }
    }
    const files = [...groupedFiles.values()];

    const summary = document.createElement("section");
    summary.className = "message-file-summary";
    const header = document.createElement("header");
    header.className = "message-file-summary-header";
    const icon = document.createElement("span");
    icon.className = "message-file-summary-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = `<svg viewBox="0 0 20 20"><rect x="4.5" y="3.5" width="11" height="13" rx="2"></rect><path d="M7.5 8h5M7.5 11h5M7.5 14h3"></path></svg>`;
    const heading = document.createElement("span");
    heading.className = "message-file-summary-heading";
    const title = document.createElement("strong");
    title.textContent = t("messageFileActivitySummary", { count: files.length });
    heading.append(title, createSummaryDiffStats(changes));
    header.append(icon, heading);
    summary.append(header);

    const rows = [];
    for (const [index, file] of files.entries()) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "message-file-summary-row";
      row.title = row.ariaLabel = t("openFileDiff", { count: 1 });
      row.hidden = index >= 3;

      const content = document.createElement("span");
      content.className = "message-file-summary-content";
      const path = document.createElement("code");
      path.textContent = String(file.change.path ?? "").replaceAll("\\", "/");
      path.title = file.change.path;
      content.append(path);

      const meta = document.createElement("span");
      meta.className = "message-file-summary-meta";
      meta.append(createDiffStats(file.change));

      row.append(content, meta);
      row.addEventListener("click", () => {
        onViewFileChanges({ ...file.activity, changes: [file.change] });
      });
      rows.push(row);
      summary.append(row);
    }

    if (files.length > 3) {
      const hiddenCount = files.length - 3;
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "message-file-summary-toggle";
      const label = document.createElement("span");
      const arrow = document.createElement("span");
      arrow.className = "message-file-summary-toggle-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.innerHTML = `<svg viewBox="0 0 12 12"><path d="m3 4.5 3 3 3-3"></path></svg>`;
      toggle.append(label, arrow);
      let expanded = false;
      const renderToggle = () => {
        rows.slice(3).forEach((row) => { row.hidden = !expanded; });
        label.textContent = t(expanded ? "messageCollapseFiles" : "messageShowMoreFiles", {
          count: hiddenCount,
        });
        toggle.setAttribute("aria-expanded", String(expanded));
        arrow.classList.toggle("is-expanded", expanded);
      };
      toggle.addEventListener("click", () => {
        expanded = !expanded;
        renderToggle();
      });
      renderToggle();
      summary.append(toggle);
    }
    return summary;
  }

  return { createDisclosure, createFileSummary };
}
