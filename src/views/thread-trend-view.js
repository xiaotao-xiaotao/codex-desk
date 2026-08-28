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
  // 日期轴固定使用 MM-DD，既保留月份语义，也避免完整日期挤压相邻刻度。
  return typeof day === "string" && day.length >= 10 ? day.slice(5) : day;
}

function shouldRenderDayLabel(index, totalDays) {
  // 30 天视图仅每 5 天显示一个刻度，并始终保留最后一天，避免日期文字相互挤压。
  return totalDays !== 30 || index % 5 === 0 || index === totalDays - 1;
}

/**
 * 原生 SVG 仅负责绘制趋势，不耦合 App Server 请求或页面刷新时机。
 * 标签组可独立显示或隐藏指标，便于在同一时间轴上比较多条活动曲线。
 */
export function createThreadTrendView({ t, onRangeChange }) {
  const controls = document.querySelector("#trend-controls");
  const range = document.querySelector("#trend-range");
  const chart = document.querySelector("#thread-trend-chart");
  const total = document.querySelector("#trend-total");
  const trendSection = chart.closest(".trend-section");
  let response = null;
  let selectedDays = 7;
  const visibleMetrics = new Set(Object.keys(TREND_SERIES));
  let chartExpanded = false;

  function updateChartAccessibility() {
    const actionKey = chartExpanded ? "trendCollapse" : "trendExpand";
    chart.tabIndex = 0;
    chart.setAttribute("role", "button");
    chart.setAttribute("aria-expanded", String(chartExpanded));
    chart.setAttribute("aria-label", `${t("trendTitle")}：${t(actionKey)}`);
    // 原生 title 会与数据点 Tooltip 叠加，交互说明仅保留给辅助技术读取。
    chart.removeAttribute("title");
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
      const tag = document.createElement("label");
      tag.className = `trend-filter ${visibleMetrics.has(metric) ? "is-active" : ""}`;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = visibleMetrics.has(metric);
      checkbox.setAttribute("aria-label", t(config.labelKey));
      const dot = document.createElement("span");
      dot.className = "trend-filter-dot";
      dot.style.backgroundColor = config.color;
      tag.append(checkbox, dot, document.createTextNode(t(config.labelKey)));
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          visibleMetrics.add(metric);
        } else {
          visibleMetrics.delete(metric);
        }
        render();
      });
      controls.append(tag);
    }
  }

  function renderRange() {
    range.replaceChildren();
    for (const days of [3, 7, 30]) {
      const option = document.createElement("option");
      option.value = String(days);
      option.selected = days === selectedDays;
      option.textContent = t(`trendRange${days}`);
      range.append(option);
    }
    range.setAttribute("aria-label", t("trendRangeLabel"));
  }

  function createTooltip() {
    const tooltip = document.createElement("div");
    tooltip.className = "trend-tooltip";
    tooltip.hidden = true;

    function show(point, event) {
      tooltip.replaceChildren();
      const date = document.createElement("p");
      date.className = "trend-tooltip-date";
      date.textContent = `${t("trendTooltipDate")}：${point.day}`;
      tooltip.append(date);
      for (const [metric, config] of Object.entries(TREND_SERIES)) {
        const row = document.createElement("p");
        row.textContent = `${t(config.labelKey)}：${Number(point[metric] ?? 0)}`;
        tooltip.append(row);
      }
      tooltip.hidden = false;
      move(event);
    }

    function move(event) {
      const bounds = chart.getBoundingClientRect();
      const maximumLeft = Math.max(8, bounds.width - tooltip.offsetWidth - 8);
      const left = Math.min(Math.max(8, event.clientX - bounds.left + 12), maximumLeft);
      const top = Math.max(tooltip.offsetHeight + 4, event.clientY - bounds.top - 10);
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }

    function hide() {
      tooltip.hidden = true;
    }

    return { tooltip, show, move, hide };
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

    const selectedSeries = Object.entries(TREND_SERIES)
      .filter(([metric]) => visibleMetrics.has(metric));
    const valueMax = Math.max(
      ...selectedSeries.flatMap(([metric]) => points.map((point) => Number(point[metric] ?? 0))),
      1,
    );
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

    const tooltip = createTooltip();
    const svg = createSvgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      // 容器会随展开窗口变宽；强制按容器铺满，避免默认等比缩放把底部日期轴挤出可视区。
      preserveAspectRatio: "none",
      role: "img",
      "aria-label": `${t("trendTitle")}：${selectedSeries.map(([, config]) => t(config.labelKey)).join("、") || "-"}`,
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

    const labels = createSvgElement("g", { class: "trend-labels" });
    for (const [metric, config] of selectedSeries) {
      const values = points.map((point) => Number(point[metric] ?? 0));
      const linePoints = points.map((point, index) => `${indexToX(index)},${valueToY(values[index])}`).join(" ");
      svg.append(createSvgElement("polyline", {
        points: linePoints,
        fill: "none",
        stroke: config.color,
        "stroke-width": 2.4,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }));
      points.forEach((point, index) => {
        const dot = createSvgElement("circle", {
          class: "trend-point",
          cx: indexToX(index),
          cy: valueToY(values[index]),
          r: 3.6,
          fill: "#fff",
          stroke: config.color,
          "stroke-width": 2,
        });
        dot.addEventListener("mouseenter", (event) => tooltip.show(point, event));
        dot.addEventListener("mousemove", (event) => tooltip.move(event));
        dot.addEventListener("mouseleave", tooltip.hide);
        labels.append(dot);
      });
    }
    points.forEach((point, index) => {
      if (!shouldRenderDayLabel(index, response.days ?? points.length)) return;
      const x = indexToX(index);
      // 首尾日期向图内收齐，避免文本中心点落在边界时被 SVG 裁切。
      const textAnchor = index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";
      const label = createSvgElement("text", { x, y: height - 9, "text-anchor": textAnchor });
      label.textContent = compactDayLabel(point.day);
      labels.append(label);
    });
    svg.append(labels);
    chart.append(svg, tooltip.tooltip);

    const sum = selectedSeries.reduce(
      (result, [metric]) => result + points.reduce((subtotal, point) => subtotal + Number(point[metric] ?? 0), 0),
      0,
    );
    total.textContent = t("trendTotal", { total: sum, days: response.days ?? points.length });
  }

  function render() {
    renderRange();
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
    selectedDays = nextResponse.days ?? selectedDays;
    render();
  }

  function setRange(days) {
    selectedDays = days;
    // 时间范围变更后不能短暂显示上一范围的数据，等待对应范围的响应再绘制。
    response = null;
    renderRange();
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
  range.addEventListener("change", () => {
    const days = Number(range.value);
    if (![3, 7, 30].includes(days) || days === selectedDays) return;
    setRange(days);
    onRangeChange?.(days);
  });

  updateChartAccessibility();
  renderRange();
  return { render, setData, setRange, showLoading, showError };
}
