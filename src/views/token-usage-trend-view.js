const SVG_NS = "http://www.w3.org/2000/svg";
const TOKEN_COLOR = "#1677ff";

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

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

function compactDayLabel(day) {
  return typeof day === "string" && day.length >= 10 ? day.slice(5) : day;
}

function shouldRenderDayLabel(index, totalDays) {
  return totalDays !== 30 || index % 5 === 0 || index === totalDays - 1;
}

/**
 * 账户 Token 使用量由 app-server 按日聚合；洞察总览统一传入时间范围，
 * 因此范围切换只需按日筛选并重绘，无需额外发起网络请求。
 */
export function createTokenUsageTrendView({ t }) {
  const chart = document.querySelector("#token-usage-chart");
  const total = document.querySelector("#token-usage-total");
  const trendSection = chart.closest(".trend-section");
  let response = null;
  let selectedDays = 7;
  let chartExpanded = false;
  let resizeFrame = null;

  function updateChartAccessibility() {
    const actionKey = chartExpanded ? "trendCollapse" : "trendExpand";
    chart.tabIndex = 0;
    chart.setAttribute("role", "button");
    chart.setAttribute("aria-expanded", String(chartExpanded));
    chart.setAttribute("aria-label", `${t("tokenUsageTitle")}：${t(actionKey)}`);
    chart.removeAttribute("title");
  }

  function toggleChartExpanded() {
    chartExpanded = !chartExpanded;
    trendSection.classList.toggle("is-chart-expanded", chartExpanded);
    updateChartAccessibility();
    // 覆盖层完成布局后使用真实尺寸重绘，保证放大后的坐标轴与数据点清晰。
    window.requestAnimationFrame(() => {
      if (response) renderChart();
    });
  }

  function formatTokens(value) {
    return String(Math.round(Number(value) || 0));
  }

  // 标题摘要保持紧凑，悬停明细仍使用完整数值，避免大用量挤占图表头部空间。
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

  function createTooltip() {
    const tooltip = document.createElement("div");
    tooltip.className = "trend-tooltip";
    tooltip.hidden = true;
    const show = (point, event) => {
      tooltip.replaceChildren();
      const date = document.createElement("p");
      date.className = "trend-tooltip-date";
      date.textContent = `${t("tokenUsageTooltipDate")}：${point.day}`;
      const tokens = document.createElement("p");
      tokens.textContent = `${t("tokenUsageTooltipTokens")}：${formatTokens(point.tokens)}`;
      tooltip.append(date, tokens);
      tooltip.hidden = false;
      move(event);
    };
    const move = (event) => {
      const bounds = chart.getBoundingClientRect();
      const maximumLeft = Math.max(8, bounds.width - tooltip.offsetWidth - 8);
      tooltip.style.left = `${Math.min(Math.max(8, event.clientX - bounds.left + 12), maximumLeft)}px`;
      tooltip.style.top = `${Math.max(tooltip.offsetHeight + 4, event.clientY - bounds.top - 10)}px`;
    };
    return { tooltip, show, move, hide: () => { tooltip.hidden = true; } };
  }

  function renderChart() {
    chart.replaceChildren();
    const points = pointsForRange();
    const hasUsageData = (response?.dailyUsageBuckets ?? []).length > 0;
    if (!hasUsageData) {
      const empty = document.createElement("p");
      empty.className = "trend-empty";
      empty.textContent = t("tokenUsageNoData", { days: selectedDays });
      chart.append(empty);
      total.textContent = "";
      return;
    }

    const totalTokens = points.reduce((sum, point) => sum + point.tokens, 0);
    total.textContent = t("tokenUsageTotal", { total: formatCompactTokens(totalTokens) });
    const valueMax = Math.max(...points.map((point) => point.tokens), 1);
    const axisMax = Math.max(2, Math.ceil(valueMax / 2) * 2);
    // Token 趋势位于双列洞察区左栏，不能继续按全窗口宽度创建 viewBox。
    const width = Math.max(320, Math.round(chart.clientWidth) || 320);
    const height = Math.max(108, Math.round(chart.clientHeight) || 108);
    const left = 40;
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
      preserveAspectRatio: "none",
      role: "img",
      "aria-label": t("tokenUsageTitle"),
    });
    const grid = createSvgElement("g", { class: "trend-grid" });
    for (let index = 0; index <= 2; index += 1) {
      const value = (axisMax * index) / 2;
      const y = valueToY(value);
      grid.append(createSvgElement("line", { x1: left, x2: width - right, y1: y, y2: y }));
      const label = createSvgElement("text", { x: left - 7, y: y + 3, "text-anchor": "end" });
      // 纵轴空间有限，使用紧凑单位避免大数值超出图表左边界；悬停仍展示完整 Token 数。
      label.textContent = formatCompactTokens(value);
      grid.append(label);
    }
    svg.append(grid);
    const labels = createSvgElement("g", { class: "trend-labels" });
    svg.append(createSvgElement("polyline", {
      points: points.map((point, index) => `${indexToX(index)},${valueToY(point.tokens)}`).join(" "),
      fill: "none",
      stroke: TOKEN_COLOR,
      "stroke-width": 2.4,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }));
    points.forEach((point, index) => {
      const dot = createSvgElement("circle", {
        class: "trend-point", cx: indexToX(index), cy: valueToY(point.tokens), r: 3.6,
        fill: "#fff", stroke: TOKEN_COLOR, "stroke-width": 2,
      });
      dot.addEventListener("mouseenter", (event) => tooltip.show(point, event));
      dot.addEventListener("mousemove", (event) => tooltip.move(event));
      dot.addEventListener("mouseleave", tooltip.hide);
      labels.append(dot);
      if (!shouldRenderDayLabel(index, selectedDays)) return;
      const text = createSvgElement("text", {
        x: indexToX(index), y: height - 9,
        "text-anchor": index === 0 ? "start" : index === points.length - 1 ? "end" : "middle",
      });
      text.textContent = compactDayLabel(point.day);
      labels.append(text);
    });
    svg.append(labels);
    chart.append(svg, tooltip.tooltip);
  }

  function scheduleResizeRender() {
    if (!response) return;
    if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    // 容器变宽后重建 SVG，避免旧 viewBox 被 CSS 放大而导致坐标轴和曲线模糊。
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = null;
      renderChart();
    });
  }

  function render() {
    updateChartAccessibility();
    if (response) renderChart();
  }

  function showLoading() {
    updateChartAccessibility();
    if (response) return;
    chart.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "trend-empty";
    loading.textContent = t("tokenUsageLoading");
    chart.append(loading);
  }

  function showError() {
    updateChartAccessibility();
    chart.replaceChildren();
    const error = document.createElement("p");
    error.className = "trend-empty trend-empty-error";
    error.textContent = t("tokenUsageUnavailable");
    chart.append(error);
    total.textContent = "";
  }

  function setRange(days) {
    if (![3, 7, 30].includes(days) || days === selectedDays) return;
    selectedDays = days;
    if (response) renderChart();
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
  if (typeof ResizeObserver === "function") {
    const chartResizeObserver = new ResizeObserver(scheduleResizeRender);
    chartResizeObserver.observe(chart);
  } else {
    window.addEventListener("resize", scheduleResizeRender);
  }
  updateChartAccessibility();
  return { render, setData: (data) => { response = data; renderChart(); }, setRange, showLoading, showError };
}
