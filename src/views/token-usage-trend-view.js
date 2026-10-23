import {
  compactDayLabel,
  createChartTooltip,
  createExpandableChart,
  createSvgElement,
} from "../utils/trend-chart.js";

const TOKEN_COLOR = "#1677ff";
const DISTRIBUTION_LABEL_SPACING = 64;

// 使用连续的固定区间，既保留 M 级会话差异，也便于不同时间范围横向比较。
const SESSION_TOKEN_BUCKETS = [
  { label: "0–10K", maximum: 10_000 },
  { label: "10K–50K", maximum: 50_000 },
  { label: "50K–100K", maximum: 100_000 },
  { label: "100K–250K", maximum: 250_000 },
  { label: "250K–500K", maximum: 500_000 },
  { label: "500K–1M", maximum: 1_000_000 },
  { label: "1M–2M", maximum: 2_000_000 },
  { label: "2M–5M", maximum: 5_000_000 },
  { label: "5M–10M", maximum: 10_000_000 },
  { label: "10M–20M", maximum: 20_000_000 },
  { label: "20M–50M", maximum: 50_000_000 },
  { label: "50M+", maximum: Number.POSITIVE_INFINITY },
];

function localDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function recentDayKeys(days) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - days + index + 1);
    return localDayKey(date);
  });
}

function shouldRenderDayLabel(index, totalDays, compact) {
  if (compact) return index === 0 || index === totalDays - 1 || index % 3 === 0;
  return totalDays !== 30 || index % 5 === 0 || index === totalDays - 1;
}

function shouldRenderDistributionLabel(index, totalBuckets, chartWidth, compact) {
  // 总览的迷你图保留代表性刻度，完整细分区间仍可通过柱子悬停查看。
  if (compact) return index === 0 || index === totalBuckets - 1 || index % 4 === 0;
  const step = Math.max(1, Math.ceil(DISTRIBUTION_LABEL_SPACING / (chartWidth / totalBuckets)));
  // 按绘图区实际宽度取刻度，同时为最后一档留出间距，窄屏不挤压相邻区间文字。
  return index === 0 || index === totalBuckets - 1 || (index % step === 0 && totalBuckets - 1 - index >= step);
}

/**
 * 洞察页趋势和会话分布共用 Token 数据。
 */
export function createTokenUsageTrendView({ t }) {
  const chartViews = [
    { chart: document.querySelector("#token-usage-chart"), total: document.querySelector("#token-usage-total"), titleKey: "tokenUsageTitle", draw: renderTrendChart },
    { chart: document.querySelector("#token-distribution-chart"), total: document.querySelector("#token-distribution-total"), titleKey: "tokenUsageDistributionTitle", draw: renderDistributionChart },
  ];
  let response = null;
  let loadError = false;
  let selectedDays = 7;
  const chartInteractions = chartViews.map((view) => createExpandableChart({
    chart: view.chart,
    section: view.chart.closest(".trend-section"),
    getTitle: () => t(view.titleKey),
    getActionLabel: (expanded) => t(expanded ? "trendCollapse" : "trendExpand"),
    canRender: () => Boolean(response),
    render: () => renderChart(view),
  }));

  function formatTokens(value) {
    return String(Math.round(Number(value) || 0));
  }

  function formatCompactTokens(value) {
    const numeric = Number(value) || 0;
    const unit = [
      [1_000_000_000, "B"],
      [1_000_000, "M"],
      [1_000, "K"],
    ].find(([threshold]) => numeric >= threshold);
    if (!unit) return formatTokens(numeric);

    const [threshold, suffix] = unit;
    const compact = (numeric / threshold).toFixed(1).replace(/\.0$/, "");
    return `${compact}${suffix}`;
  }

  function pointsForRange() {
    const buckets = new Map(
      (response?.dailyUsageBuckets ?? []).map((bucket) => [bucket.startDate, Number(bucket.tokens) || 0]),
    );
    return recentDayKeys(selectedDays).map((day) => ({ day, tokens: buckets.get(day) ?? 0 }));
  }

  function sessionUsageForRange() {
    const days = recentDayKeys(selectedDays);
    const firstDay = days[0];
    const lastDay = days.at(-1);
    // 同一会话跨天续聊时，只累计当前所选区间，避免把历史消耗归到创建日。
    return (response?.localSessionUsage ?? []).map((session) => ({
      tokens: (session.dailyUsage ?? [])
        .filter((bucket) => bucket.startDate >= firstDay && bucket.startDate <= lastDay)
        .reduce((sum, bucket) => sum + (Number(bucket.tokens) || 0), 0),
    })).filter((session) => session.tokens > 0);
  }

  function distributionForRange() {
    const sessions = sessionUsageForRange();
    let minimum = 0;
    return SESSION_TOKEN_BUCKETS.map((bucket) => {
      const count = sessions.filter((session) => {
        const tokens = Number(session.tokens) || 0;
        return tokens >= minimum && tokens < bucket.maximum;
      }).length;
      minimum = bucket.maximum;
      return { label: bucket.label, count };
    });
  }

  function appendValueGrid(svg, {
    width,
    left,
    right,
    axisMax,
    valueToY,
    valueFormatter = String,
    labelGap = 5,
  }) {
    const grid = createSvgElement("g", { class: "trend-grid" });
    for (let index = 0; index <= 2; index += 1) {
      const value = (axisMax * index) / 2;
      const y = valueToY(value);
      grid.append(createSvgElement("line", { x1: left, x2: width - right, y1: y, y2: y }));
      const label = createSvgElement("text", { x: left - labelGap, y: y + 3, "text-anchor": "end" });
      label.textContent = valueFormatter(value);
      grid.append(label);
    }
    svg.append(grid);
  }

  function chartDimensions(target, { bottom = 24, minWidth = 320, minHeight = 108, left = 40, right = 12, top = 8 } = {}) {
    const width = Math.max(minWidth, Math.round(target.clientWidth) || minWidth);
    const height = Math.max(minHeight, Math.round(target.clientHeight) || minHeight);
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    return {
      width,
      height,
      left,
      right,
      top,
      plotWidth,
      plotHeight,
      valueToY: (value, axisMax) => top + plotHeight - (value / axisMax) * plotHeight,
    };
  }

  function createTrendTooltipContent(point) {
    const date = document.createElement("p");
    date.className = "trend-tooltip-date";
    date.textContent = `${t("tokenUsageTooltipDate")}：${point.day}`;
    const tokens = document.createElement("p");
    tokens.textContent = `${t("tokenUsageTooltipTokens")}：${formatTokens(point.tokens)}`;
    return [date, tokens];
  }

  function createDistributionTooltipContent(bucket) {
    const range = document.createElement("p");
    range.className = "trend-tooltip-date";
    range.textContent = `${bucket.label} Token`;
    const sessions = document.createElement("p");
    sessions.textContent = `${t("tokenUsageTooltipSessions")}：${bucket.count}`;
    return [range, sessions];
  }

  function appendEmpty(target, summary, message) {
    target.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "trend-empty";
    empty.textContent = message;
    target.append(empty);
    if (summary) summary.textContent = "";
  }

  function renderTrendChart(target, summary, compact = false) {
    target.replaceChildren();
    const points = pointsForRange();
    const hasUsageData = (response?.dailyUsageBuckets ?? []).length > 0;
    if (!hasUsageData) {
      appendEmpty(target, summary, t("tokenUsageNoData", { days: selectedDays }));
      return;
    }

    const totalTokens = points.reduce((sum, point) => sum + point.tokens, 0);
    if (summary) summary.textContent = t("tokenUsageTotal", { total: formatCompactTokens(totalTokens) });
    const valueMax = Math.max(...points.map((point) => point.tokens), 1);
    const axisMax = Math.max(2, Math.ceil(valueMax / 2) * 2);
    const dimensions = chartDimensions(target, compact
      ? { bottom: 17, minWidth: 156, minHeight: 72, left: 40, right: 7, top: 5 }
      : undefined);
    const { width, height, left, right, plotWidth, valueToY } = dimensions;
    const indexToX = (index) => left + (points.length === 1 ? plotWidth / 2 : (index * plotWidth) / (points.length - 1));
    const tooltip = createChartTooltip(target);
    const svg = createSvgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      preserveAspectRatio: "none",
      role: "img",
      "aria-label": t("tokenUsageTitle"),
    });
    appendValueGrid(svg, {
      width,
      left,
      right,
      axisMax,
      valueToY: (value) => valueToY(value, axisMax),
      valueFormatter: compact ? formatCompactTokens : formatCompactTokens,
      // 栏目标题因语言换行时图表会进入紧凑态，仍须完整容纳 M/K 级刻度。
      labelGap: 5,
    });
    const labels = createSvgElement("g", { class: "trend-labels" });
    svg.append(createSvgElement("polyline", {
      points: points.map((point, index) => `${indexToX(index)},${valueToY(point.tokens, axisMax)}`).join(" "),
      fill: "none",
      stroke: TOKEN_COLOR,
      "stroke-width": compact ? 2 : 2.4,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }));
    points.forEach((point, index) => {
      const dot = createSvgElement("circle", {
        class: "trend-point", cx: indexToX(index), cy: valueToY(point.tokens, axisMax), r: compact ? 2.6 : 3.6,
        fill: "#fff", stroke: TOKEN_COLOR, "stroke-width": compact ? 1.5 : 2,
      });
      dot.addEventListener("mouseenter", (event) => tooltip.show(createTrendTooltipContent(point), event));
      dot.addEventListener("mousemove", tooltip.move);
      dot.addEventListener("mouseleave", tooltip.hide);
      labels.append(dot);
      if (!shouldRenderDayLabel(index, selectedDays, compact)) return;
      const text = createSvgElement("text", {
        x: indexToX(index), y: height - (compact ? 4 : 9),
        "text-anchor": index === 0 ? "start" : index === points.length - 1 ? "end" : "middle",
        "font-size": compact ? 8 : 10,
      });
      text.textContent = compactDayLabel(point.day);
      labels.append(text);
    });
    svg.append(labels);
    target.append(svg, tooltip.tooltip);
  }

  function renderDistributionChart(target, summary, compact = false) {
    target.replaceChildren();
    const sessions = sessionUsageForRange();
    if (sessions.length === 0) {
      appendEmpty(target, summary, t("tokenUsageDistributionNoData", { days: selectedDays }));
      return;
    }

    const buckets = distributionForRange();
    if (summary) summary.textContent = t("tokenUsageDistributionSummary", { count: sessions.length });
    const valueMax = Math.max(...buckets.map((bucket) => bucket.count), 1);
    const axisMax = Math.max(2, Math.ceil(valueMax / 2) * 2);
    const dimensions = chartDimensions(target, compact
      ? { bottom: 17, minWidth: 156, minHeight: 72, left: 28, right: 6, top: 5 }
      : undefined);
    const { width, height, left, right, top, plotWidth, plotHeight, valueToY } = dimensions;
    const columnWidth = plotWidth / buckets.length;
    // 柱宽保持在分组宽度的约六成，并设置上限；宽屏放大后也不会变成笨重的色块。
    const barWidth = Math.max(
      compact ? 4 : 12,
      Math.min(compact ? 16 : 30, columnWidth * (compact ? .55 : .62)),
    );
    const tooltip = createChartTooltip(target);
    const svg = createSvgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      preserveAspectRatio: "none",
      role: "img",
      "aria-label": t("tokenUsageDistributionTitle"),
    });
    appendValueGrid(svg, {
      width,
      left,
      right,
      axisMax,
      valueToY: (value) => valueToY(value, axisMax),
      labelGap: compact ? 13 : 5,
    });

    const labels = createSvgElement("g", { class: "trend-labels" });
    buckets.forEach((bucket, index) => {
      const centerX = left + columnWidth * index + columnWidth / 2;
      const barY = valueToY(bucket.count, axisMax);
      const barHeight = top + plotHeight - barY;
      const bar = createSvgElement("rect", {
        class: "token-distribution-bar",
        x: centerX - barWidth / 2,
        y: barY,
        width: barWidth,
        height: barHeight,
        rx: compact ? 1.5 : 3,
        fill: "var(--token-distribution-color)",
      });
      bar.addEventListener("mouseenter", (event) => tooltip.show(createDistributionTooltipContent(bucket), event));
      bar.addEventListener("mousemove", tooltip.move);
      bar.addEventListener("mouseleave", tooltip.hide);
      labels.append(bar);
      if (!shouldRenderDistributionLabel(index, buckets.length, plotWidth, compact)) return;
      const label = createSvgElement("text", {
        x: centerX,
        y: height - (compact ? 4 : 9),
        "text-anchor": "middle",
        "font-size": compact ? 6.25 : width < 500 ? 7 : 7.5,
      });
      label.textContent = bucket.label;
      labels.append(label);
    });
    svg.append(labels);
    target.append(svg, tooltip.tooltip);
  }

  function renderChart({ chart, total, draw }) {
    chart.setAttribute("aria-busy", "false");
    chart.replaceChildren();
    const compact = !chart.closest(".trend-section").classList.contains("is-chart-expanded") && chart.clientHeight < 100;
    draw(chart, total, compact);
  }

  function render() {
    chartInteractions.forEach((interaction) => interaction.updateAccessibility());
    if (response) {
      chartViews.forEach(renderChart);
    } else if (loadError) showError();
    else renderLoading();
  }

  // Token 聚合需要等额度读取完成后才会发起请求；首屏保留加载状态，避免图表区域空白。
  function renderLoading() {
    for (const { chart, total } of chartViews) {
      chart.setAttribute("aria-busy", "true");
      appendEmpty(chart, total, t("tokenUsageLoading"));
    }
  }

  function showLoading() {
    loadError = false;
    chartInteractions.forEach((interaction) => interaction.updateAccessibility());
    if (response) return;
    renderLoading();
  }

  function showError() {
    // 导航、语言或尺寸变化重绘时保留失败提示，不能重新显示加载态或过期数据。
    loadError = true;
    response = null;
    chartInteractions.forEach((interaction) => interaction.updateAccessibility());
    for (const { chart, total } of chartViews) {
      chart.setAttribute("aria-busy", "false");
      appendEmpty(chart, total, t("tokenUsageUnavailable"));
      chart.firstElementChild.classList.add("trend-empty-error");
    }
  }

  function setRange(days) {
    if (![3, 7, 30].includes(days) || days === selectedDays) return;
    selectedDays = days;
    if (response) chartViews.forEach(renderChart);
  }

  render();
  return {
    render,
    clear: () => { response = null; loadError = false; render(); },
    setData: (data) => {
      loadError = false;
      response = data;
      render();
    },
    setRange,
    showLoading,
    showError,
  };
}
