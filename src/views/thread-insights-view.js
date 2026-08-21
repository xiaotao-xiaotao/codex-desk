/**
 * 会话洞察区只消费后端已归一化的数据，不关心 App Server 的原始 item 结构。
 * 这样协议字段变化时，界面层无需跟着修改。
 */
export function createThreadInsightsView({ t }) {
  const insightList = document.querySelector("#thread-insights");
  const activityPanel = document.querySelector("#thread-activity");

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

    for (const activity of activities) {
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
      content.append(title);
      if (activity.detail) {
        const detail = document.createElement("span");
        detail.textContent = activity.detail;
        content.append(detail);
      }

      row.append(icon, content);
      if (activity.status) {
        const status = document.createElement("span");
        status.className = `activity-status activity-status-${activity.status}`;
        status.textContent = statusLabel(activity.status);
        row.append(status);
      }
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
