/**
 * 会话洞察区只消费后端已归一化的数据，不关心 App Server 的原始 item 结构。
 * 这样协议字段变化时，界面层无需跟着修改。
 */
export function createThreadInsightsView({ t }) {
  const insightList = document.querySelector("#thread-insights");
  const activityPanel = document.querySelector("#thread-activity");
  const fullTextTooltip = document.createElement("div");
  fullTextTooltip.className = "activity-full-text-tooltip";
  fullTextTooltip.hidden = true;
  fullTextTooltip.setAttribute("role", "tooltip");
  document.body.append(fullTextTooltip);

  function positionFullTextTooltip(clientX, clientY) {
    const gap = 12;
    const maxLeft = window.innerWidth - fullTextTooltip.offsetWidth - gap;
    const maxTop = window.innerHeight - fullTextTooltip.offsetHeight - gap;
    fullTextTooltip.style.left = `${Math.max(gap, Math.min(clientX + gap, maxLeft))}px`;
    fullTextTooltip.style.top = `${Math.max(gap, Math.min(clientY + gap, maxTop))}px`;
  }

  /** WebView2 的原生 title 提示不稳定，长文本统一使用应用内即时浮层展示。 */
  function bindFullTextTooltip(element, text) {
    const show = (clientX, clientY) => {
      fullTextTooltip.textContent = text;
      fullTextTooltip.hidden = false;
      positionFullTextTooltip(clientX, clientY);
    };
    element.addEventListener("mouseenter", (event) => show(event.clientX, event.clientY));
    element.addEventListener("mousemove", (event) => positionFullTextTooltip(event.clientX, event.clientY));
    element.addEventListener("mouseleave", () => { fullTextTooltip.hidden = true; });
    element.addEventListener("focus", () => {
      const rect = element.getBoundingClientRect();
      show(rect.left, rect.bottom);
    });
    element.addEventListener("blur", () => { fullTextTooltip.hidden = true; });
  }

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

  function statusLabel(status) {
    const labels = {
      completed: "activityStatusCompleted",
      inProgress: "activityStatusInProgress",
      failed: "activityStatusFailed",
      interrupted: "activityStatusInterrupted",
    };
    return labels[status] ? t(labels[status]) : status || t("activityStatusUnknown");
  }

  function renderActivities(activities) {
    activityPanel.replaceChildren();
    if (!activities?.length) {
      const empty = document.createElement("p");
      empty.className = "activity-empty";
      empty.textContent = t("noStructuredActivity");
      activityPanel.append(empty);
      return;
    }

    for (const activity of groupConsecutiveActivities(activities)) {
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
      // 卡片保持单行省略，完整命令或文件名通过悬停浮层按需查看。
      title.title = activity.title;
      bindFullTextTooltip(title, activity.title);
      content.append(title);
      if (activity.detail) {
        const detail = document.createElement("span");
        detail.textContent = activity.detail;
        detail.title = activity.detail;
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
      activityPanel.append(row);
    }
  }

  function render(detail) {
    const insights = detail.insights ?? {};
    insightList.replaceChildren(
      createMetric(t("insightMessages"), insights.messages, "blue"),
      createMetric(t("insightToolCalls"), insights.toolCalls, "violet"),
      createMetric(t("insightFileChanges"), insights.fileChanges, "emerald"),
      createMetric(t("insightIssues"), insights.issues, "amber"),
    );
    renderActivities(detail.activities);
  }

  function clear() {
    insightList.replaceChildren();
    activityPanel.replaceChildren();
  }

  return { render, clear };
}
import { groupConsecutiveActivities } from "./activity-summary.js";
