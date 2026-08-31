import { groupConsecutiveActivities } from "./activity-summary.js";

function createMetric(label, value, tone) {
  const metric = document.createElement("div");
  metric.className = `insight-metric insight-metric-${tone}`;
  const metricValue = document.createElement("strong");
  metricValue.textContent = String(value ?? 0);
  const metricLabel = document.createElement("span");
  metricLabel.textContent = label;
  metric.append(metricValue, metricLabel);
  return metric;
}

/**
 * 会话洞察区只渲染汇总指标；具体操作由消息视图按回合放在对应回复下方。
 */
export function createThreadInsightsView({ t }) {
  const insightList = document.querySelector("#thread-insights");

  function render(detail) {
    const insights = detail.insights ?? {};
    insightList.replaceChildren(
      createMetric(t("insightMessages"), insights.messages, "blue"),
      createMetric(t("insightToolCalls"), insights.toolCalls, "violet"),
      createMetric(t("insightFileChanges"), insights.fileChanges, "emerald"),
      createMetric(t("insightIssues"), insights.issues, "amber"),
    );
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
      const path = document.createElement("code");
      path.textContent = change.path;
      path.title = change.path;
      row.append(path, createDiffStats(change));
      row.addEventListener("click", () => onViewFileChanges({ ...activity, changes: [change] }));
      wrapper.append(row, createFileHoverPreview(change));
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
      title.textContent = activity.title;
      bindFullTextTooltip(title, activity.title);
      content.append(title);
      if (activity.detail) {
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
      if (activity.status) {
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
    icon.innerHTML = `<svg viewBox="0 0 20 20"><rect x="4.5" y="3.5" width="11" height="13" rx="2"></rect><path d="M7.5 7.5h5M7.5 11h5M10 8.5v5"></path></svg>`;
    return icon;
  }

  function createDisclosure(activities) {
    if (!activities?.length) return null;
    const disclosure = document.createElement("details");
    disclosure.className = "message-activity-disclosure";
    const summary = document.createElement("summary");
    const fileCount = activities.reduce(
      (count, activity) => count + (activity.kind === "file" ? activity.changes?.length ?? 0 : 0),
      0,
    );
    const title = document.createElement("strong");
    title.textContent = fileCount > 0
      ? t("messageFileActivitySummary", { count: fileCount })
      : t("messageActivitySummary", { count: activities.length });
    const hint = document.createElement("span");
    hint.className = "activity-summary-hint";
    hint.textContent = t("activitySummaryHint");
    summary.append(createActivitySummaryIcon(), title, hint);

    const list = document.createElement("div");
    list.className = "activity-list message-activity-list";
    renderActivities(list, activities);
    disclosure.append(summary, list);
    return disclosure;
  }

  return { createDisclosure };
}
