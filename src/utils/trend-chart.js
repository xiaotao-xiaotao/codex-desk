const SVG_NS = "http://www.w3.org/2000/svg";

export function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

export function compactDayLabel(day) {
  return typeof day === "string" && day.length >= 10 ? day.slice(5) : day;
}

export function createChartTooltip(target) {
  const tooltip = document.createElement("div");
  tooltip.className = "trend-tooltip";
  tooltip.hidden = true;

  const move = (event) => {
    const bounds = target.getBoundingClientRect();
    const maximumLeft = Math.max(8, bounds.width - tooltip.offsetWidth - 8);
    tooltip.style.left = `${Math.min(Math.max(8, event.clientX - bounds.left + 12), maximumLeft)}px`;
    tooltip.style.top = `${Math.max(tooltip.offsetHeight + 4, event.clientY - bounds.top - 10)}px`;
  };

  return {
    tooltip,
    show(content, event) {
      tooltip.replaceChildren(...content);
      tooltip.hidden = false;
      move(event);
    },
    move,
    hide: () => { tooltip.hidden = true; },
  };
}

/**
 * 两类趋势图共用相同的键盘、双击放大和尺寸变化重绘行为。
 * 具体图表只提供标题与渲染函数，避免交互状态在视图中重复维护。
 */
export function createExpandableChart({ chart, section, getTitle, getActionLabel, canRender, render }) {
  let expanded = false;
  let resizeFrame = null;

  function updateAccessibility() {
    chart.tabIndex = 0;
    chart.setAttribute("role", "button");
    chart.setAttribute("aria-expanded", String(expanded));
    chart.setAttribute("aria-label", `${getTitle()}：${getActionLabel(expanded)}`);
    chart.removeAttribute("title");
  }

  function scheduleRender() {
    if (!canRender()) return;
    if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = null;
      render();
    });
  }

  function toggle() {
    expanded = !expanded;
    section.classList.toggle("is-chart-expanded", expanded);
    updateAccessibility();
    scheduleRender();
  }

  chart.addEventListener("dblclick", (event) => {
    event.preventDefault();
    toggle();
  });
  chart.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && expanded) toggle();
  });
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(scheduleRender).observe(chart);
  } else {
    window.addEventListener("resize", scheduleRender);
  }

  updateAccessibility();
  return { updateAccessibility };
}
