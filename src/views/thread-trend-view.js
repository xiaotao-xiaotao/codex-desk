const SVG_NS = "http://www.w3.org/2000/svg";

const TREND_SERIES = {
  messages: { labelKey: "trendMessages", color: "#1677ff" },
  toolCalls: { labelKey: "trendToolCalls", color: "#7454d6" },
  fileChanges: { labelKey: "trendFileChanges", color: "#19956a" },
  issues: { labelKey: "trendIssues", color: "#c77900" },
};

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function compactDayLabel(day) {
  return typeof day === "string" && day.length >= 10 ? day.slice(5).replace("-", "/") : day;
}

/**
 * 原生 SVG 仅负责绘制趋势，不耦合 App Server 请求或页面刷新时机。
 * 单序列切换避免消息量掩盖低频错误、文件变更等指标。
 */
export function createThreadTrendView({ t }) {
  const controls = document.querySelector("#trend-controls");
  const chart = document.querySelector("#thread-trend-chart");
  const total = document.querySelector("#trend-total");
  const trendSection = chart.closest(".trend-section");
  let response = null;
  let selectedMetric = "messages";
  let chartExpanded = false;

  function updateChartAccessibility() {
    const actionKey = chartExpanded ? "trendCollapse" : "trendExpand";
    chart.tabIndex = 0;
    chart.setAttribute("role", "button");
    chart.setAttribute("aria-expanded", String(chartExpanded));
    chart.setAttribute("aria-label", `${t("trendTitle")}：${t(actionKey)}`);
    chart.title = t(actionKey);
  }

  function toggleChartExpanded() {
    chartExpanded = !chartExpanded;
    trendSection.classList.toggle("is-chart-expanded", chartExpanded);
    updateChartAccessibility();

    // 覆盖层完成布局后再按实际可用尺寸重绘，保证放大后的文字与坐标轴清晰。
    window.requestAnimationFrame(() => {
      if (response) renderChart();
    });
  }

  function renderControls() {
    controls.replaceChildren();
    for (const [metric, config] of Object.entries(TREND_SERIES)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `trend-control ${metric === selectedMetric ? "is-active" : ""}`;
      button.dataset.metric = metric;
      button.setAttribute("aria-pressed", String(metric === selectedMetric));
      const dot = document.createElement("span");
      dot.className = "trend-control-dot";
      dot.style.backgroundColor = config.color;
      button.append(dot, document.createTextNode(t(config.labelKey)));
      button.addEventListener("click", () => {
        selectedMetric = metric;
        render();
      });
      controls.append(button);
    }
  }

  function renderChart() {
    chart.replaceChildren();
    const points = response?.points ?? [];
    if (points.length === 0) {
      const empty = document.createElement("p");
      empty.className = "trend-empty";
      empty.textContent = t("trendNoData");
      chart.append(empty);
      total.textContent = "";
      return;
    }

    const config = TREND_SERIES[selectedMetric];
    const values = points.map((point) => Number(point[selectedMetric] ?? 0));
    const valueMax = Math.max(...values, 1);
    const axisMax = Math.max(2, Math.ceil(valueMax / 2) * 2);
    // 放大时使用容器的真实尺寸，避免固定 viewBox 被拉伸后导致文字和坐标轴失真。
    const width = Math.max(760, Math.round(chart.clientWidth) || 760);
    const height = Math.max(108, Math.round(chart.clientHeight) || 108);
    const left = 35;
    const right = 12;
    const top = 8;
    const bottom = 24;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const valueToY = (value) => top + plotHeight - (value / axisMax) * plotHeight;
    const indexToX = (index) => left + (points.length === 1 ? plotWidth / 2 : (index * plotWidth) / (points.length - 1));

    const svg = createSvgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      // 容器会随展开窗口变宽；强制按容器铺满，避免默认等比缩放把底部日期轴挤出可视区。
      preserveAspectRatio: "none",
      role: "img",
      "aria-label": `${t("trendTitle")}：${t(config.labelKey)}`,
    });
    const grid = createSvgElement("g", { class: "trend-grid" });
    for (let index = 0; index <= 2; index += 1) {
      const value = (axisMax * index) / 2;
      const y = valueToY(value);
      grid.append(createSvgElement("line", { x1: left, x2: width - right, y1: y, y2: y }));
      const label = createSvgElement("text", { x: left - 7, y: y + 3, "text-anchor": "end" });
      label.textContent = String(value);
      grid.append(label);
    }
    svg.append(grid);

    const linePoints = points.map((point, index) => `${indexToX(index)},${valueToY(values[index])}`).join(" ");
    svg.append(createSvgElement("polyline", {
      points: linePoints,
      fill: "none",
      stroke: config.color,
      "stroke-width": 2.4,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }));

    const labels = createSvgElement("g", { class: "trend-labels" });
    points.forEach((point, index) => {
      const x = indexToX(index);
      const y = valueToY(values[index]);
      const dot = createSvgElement("circle", { cx: x, cy: y, r: 3.6, fill: "#fff", stroke: config.color, "stroke-width": 2 });
      const title = createSvgElement("title");
      title.textContent = `${point.day}\n${t(config.labelKey)}：${values[index]}`;
      dot.append(title);
      labels.append(dot);
      const label = createSvgElement("text", { x, y: height - 9, "text-anchor": "middle" });
      label.textContent = compactDayLabel(point.day);
      labels.append(label);
    });
    svg.append(labels);
    chart.append(svg);

    const sum = values.reduce((result, value) => result + value, 0);
    total.textContent = t("trendTotal", { total: sum, days: response.days ?? points.length });
  }

  function render() {
    renderControls();
    updateChartAccessibility();
    renderChart();
  }

  function showLoading() {
    updateChartAccessibility();
    if (response) return;
    chart.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "trend-empty";
    loading.textContent = t("trendLoading");
    chart.append(loading);
  }

  function showError() {
    updateChartAccessibility();
    chart.replaceChildren();
    const error = document.createElement("p");
    error.className = "trend-empty trend-empty-error";
    error.textContent = t("trendUnavailable");
    chart.append(error);
    total.textContent = "";
  }

  function setData(nextResponse) {
    response = nextResponse;
    render();
  }

  chart.addEventListener("dblclick", (event) => {
    event.preventDefault();
    toggleChartExpanded();
  });
  chart.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleChartExpanded();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && chartExpanded) toggleChartExpanded();
  });
  window.addEventListener("resize", () => {
    if (chartExpanded && response) renderChart();
  });

  updateChartAccessibility();
  return { render, setData, showLoading, showError };
}
