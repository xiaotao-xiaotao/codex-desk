import {
  compactDayLabel,
  createChartTooltip,
  createExpandableChart,
  createSvgElement,
} from "../utils/trend-chart.js";

const TREND_SERIES = {
  messages: { labelKey: "trendMessages", color: "#1677ff" },
  toolCalls: { labelKey: "trendToolCalls", color: "#7454d6" },
  fileChanges: { labelKey: "trendFileChanges", color: "#19956a" },
  issues: { labelKey: "trendIssues", color: "#c77900" },
};

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
  const range = document.querySelector("#insights-range");
  const chart = document.querySelector("#thread-trend-chart");
  const total = document.querySelector("#trend-total");
  const trendSection = chart.closest(".trend-section");
  let response = null;
  let selectedDays = 7;
  const visibleMetrics = new Set(Object.keys(TREND_SERIES));
  const chartInteraction = createExpandableChart({
    chart,
    section: trendSection,
    getTitle: () => t("trendTitle"),
    getActionLabel: (expanded) => t(expanded ? "trendCollapse" : "trendExpand"),
    canRender: () => Boolean(response),
    render: renderChart,
  });

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

  function createTooltipContent(point) {
    const date = document.createElement("p");
    date.className = "trend-tooltip-date";
    date.textContent = `${t("trendTooltipDate")}：${point.day}`;
    return [date, ...Object.entries(TREND_SERIES).map(([metric, config]) => {
      const row = document.createElement("p");
      row.textContent = `${t(config.labelKey)}：${Number(point[metric] ?? 0)}`;
      return row;
    })];
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
    // 双列布局下图表会收窄到左栏，按真实宽度生成 viewBox 才不会把文字缩得过小。
    const compact = !trendSection.classList.contains("is-chart-expanded") && chart.clientHeight < 100;
    const width = Math.max(320, Math.round(chart.clientWidth) || 320);
    const height = Math.max(compact ? 72 : 108, Math.round(chart.clientHeight) || 108);
    // 紧凑卡片仍为 Y 轴数字和首个数据点保留呼吸空间，避免视觉上贴近左边框。
    const left = compact ? 38 : 35;
    const right = compact ? 8 : 12;
    const top = compact ? 5 : 8;
    const bottom = compact ? 17 : 24;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const valueToY = (value) => top + plotHeight - (value / axisMax) * plotHeight;
    const indexToX = (index) => left + (points.length === 1 ? plotWidth / 2 : (index * plotWidth) / (points.length - 1));

    const tooltip = createChartTooltip(chart);
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
      const label = createSvgElement("text", {
        // 紧凑模式只右移绘图区，Y 轴数字仍保持原位置，形成清晰的轴前间距。
        x: left - (compact ? 13 : 7),
        y: y + 3,
        "text-anchor": "end",
        "font-size": compact ? 8 : 10,
      });
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
        "stroke-width": compact ? 2 : 2.4,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }));
      points.forEach((point, index) => {
        const dot = createSvgElement("circle", {
          class: "trend-point",
          cx: indexToX(index),
          cy: valueToY(values[index]),
          r: compact ? 2.8 : 3.6,
          fill: "#fff",
          stroke: config.color,
          "stroke-width": compact ? 1.6 : 2,
        });
        dot.addEventListener("mouseenter", (event) => tooltip.show(createTooltipContent(point), event));
        dot.addEventListener("mousemove", tooltip.move);
        dot.addEventListener("mouseleave", tooltip.hide);
        labels.append(dot);
      });
    }
    points.forEach((point, index) => {
      if (!shouldRenderDayLabel(index, response.days ?? points.length)) return;
      const x = indexToX(index);
      // 首尾日期向图内收齐，避免文本中心点落在边界时被 SVG 裁切。
      const textAnchor = index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";
      const label = createSvgElement("text", {
        x,
        y: height - (compact ? 4 : 9),
        "text-anchor": textAnchor,
        "font-size": compact ? 8 : 10,
      });
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
    chartInteraction.updateAccessibility();
    renderChart();
  }

  function showLoading() {
    chartInteraction.updateAccessibility();
    if (response) return;
    chart.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "trend-empty";
    loading.textContent = t("trendLoading");
    chart.append(loading);
  }

  function showError() {
    chartInteraction.updateAccessibility();
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

  range.addEventListener("change", () => {
    const days = Number(range.value);
    if (![3, 7, 30].includes(days) || days === selectedDays) return;
    setRange(days);
    onRangeChange?.(days);
  });

  renderRange();
  return { render, setData, setRange, showLoading, showError };
}
