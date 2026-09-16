// 以水平词为主，穿插不同倾角，形成自然发散的词云而非规则标签矩阵。
const ROTATIONS = [0, 0, 0, 0, -16, 16, -28, 28, -42, 42, -56, 56];

function wordHash(word) {
  let hash = 0;
  for (const character of word) {
    hash = ((hash << 5) - hash + character.codePointAt(0)) | 0;
  }
  return Math.abs(hash);
}

function fontSizeFor(value, minimum, maximum, scale = 1) {
  if (maximum <= minimum) return 17 * scale;
  // 开平方让最高频词突出，但不会把其余主题压缩得难以辨识。
  const ratio = Math.sqrt((value - minimum) / (maximum - minimum));
  return (11 + ratio * 14) * scale;
}

function estimatedTextWidth(name, fontSize) {
  // 不调用 Canvas 测量，避免 WebView 首帧字体尚未就绪时得到错误尺寸。
  return Array.from(name).reduce((width, character) => (
    width + (character.codePointAt(0) <= 0x7f ? fontSize * 0.58 : fontSize)
  ), 0);
}

function measureWord(word) {
  const textWidth = estimatedTextWidth(word.name, word.fontSize);
  const textHeight = word.fontSize * 1.16;
  const radians = (word.rotation * Math.PI) / 180;
  return {
    width: Math.abs(textWidth * Math.cos(radians)) + Math.abs(textHeight * Math.sin(radians)) + 4,
    height: Math.abs(textWidth * Math.sin(radians)) + Math.abs(textHeight * Math.cos(radians)) + 4,
  };
}

function intersects(left, right) {
  return !(
    left.x + left.width / 2 <= right.x - right.width / 2
    || left.x - left.width / 2 >= right.x + right.width / 2
    || left.y + left.height / 2 <= right.y - right.height / 2
    || left.y - left.height / 2 >= right.y + right.height / 2
  );
}

function staysInsideBounds(box, width, height, padding = 5) {
  return (
    box.x - box.width / 2 >= padding
    && box.x + box.width / 2 <= width - padding
    && box.y - box.height / 2 >= padding
    && box.y + box.height / 2 <= height - padding
  );
}

function placeWord(word, occupied, width, height, index) {
  // 螺旋半径以短边为基准；长边额外展开，最大化后的宽词云不会只聚成中央圆团。
  const shortestSide = Math.max(1, Math.min(width, height));
  const horizontalSpread = width / shortestSide;
  const verticalSpread = height / shortestSide;
  // 发生碰撞时逐步缩字后重试；词云中的词保持单行，不能退化成竖排标签。
  for (let sizeAttempt = 0; sizeAttempt < 4; sizeAttempt += 1) {
    const metrics = measureWord(word);
    const phase = (wordHash(word.name) % 360) * (Math.PI / 180) + index * 0.21;
    for (let step = 0; step < 1_800; step += 1) {
      const angle = phase + step * 0.31;
      // 扩张速度覆盖整张卡片；比圆形边界下的紧凑词团更接近自然散开的阅读感。
      const distance = step === 0 ? 0 : 2 + angle * 0.3;
      const box = {
        x: width / 2 + Math.cos(angle) * distance * horizontalSpread,
        y: height / 2 + Math.sin(angle) * distance * verticalSpread,
        ...metrics,
      };
      if (!staysInsideBounds(box, width, height)) continue;
      if (occupied.some((placed) => intersects(box, placed))) continue;
      return box;
    }
    word.fontSize -= 1.5;
    if (word.fontSize < 9) break;
  }
  return null;
}

/**
 * 词云使用普通 HTML 文字和 CSS 定位，而非 Canvas/SVG。
 * Windows WebView 在首次显示无边框窗口时可能会延后 SVG 绘制，普通文字能稳定呈现。
 * 螺旋寻位在整张卡片内散开，并保留碰撞检测和逐词悬停提示。
 */
export function createWordCloudView({ t }) {
  const cloud = document.querySelector("#word-cloud");
  const summary = document.querySelector("#word-cloud-summary");
  const tooltip = document.createElement("div");
  let response = null;
  let selectedDays = 7;
  let renderFrame = null;

  tooltip.className = "word-cloud-tooltip";
  tooltip.hidden = true;
  cloud.setAttribute("aria-live", "polite");

  function renderSummary() {
    if (!response) {
      summary.textContent = "";
      return;
    }
    summary.textContent = t("wordCloudSummary", {
      days: selectedDays,
      messages: Number(response.totalMessages) || 0,
      unique: Number(response.totalUnique) || 0,
    });
  }

  function renderMessage(key, className = "word-cloud-empty") {
    cloud.replaceChildren();
    const message = document.createElement("p");
    message.className = className;
    message.textContent = t(key, { days: selectedDays });
    cloud.append(message);
  }

  function hideTooltip() {
    tooltip.hidden = true;
  }

  function showTooltip(word, event) {
    const bounds = cloud.getBoundingClientRect();
    tooltip.textContent = t("wordCloudWordCount", { word: word.name, count: word.value });
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(Math.max(6, event.clientX - bounds.left + 10), Math.max(6, bounds.width - tooltip.offsetWidth - 6))}px`;
    tooltip.style.top = `${Math.max(tooltip.offsetHeight + 5, event.clientY - bounds.top - 8)}px`;
  }

  function drawCloud() {
    renderFrame = null;
    if (!response) return;

    const items = Array.isArray(response.items) ? response.items : [];
    if (items.length === 0) {
      renderMessage("wordCloudNoData");
      return;
    }

    // 首帧若父层尚未完成 Grid 布局，使用与右栏比例一致的默认尺寸，而不是中断渲染留下空白。
    const width = Math.max(180, Math.floor(cloud.clientWidth) || 284);
    const height = Math.max(200, Math.floor(cloud.clientHeight) || 280);
    const values = items.map((item) => Number(item.value) || 0);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    // 卡片变大时同步放大文字，但设置上限，避免宽屏下高频词占据整个画布。
    const fontScale = Math.min(1.28, Math.max(1, Math.sqrt((width * height) / (340 * 260))));
    const isDark = document.documentElement.dataset.theme === "dark";
    const occupied = [];
    const placedWords = [];

    for (const [index, item] of items.entries()) {
      const name = String(item.name ?? "").trim();
      const value = Number(item.value) || 0;
      if (!name || value <= 0) continue;
      const word = {
        name,
        value,
        fontSize: fontSizeFor(value, minimum, maximum, fontScale),
        rotation: ROTATIONS[wordHash(name) % ROTATIONS.length],
        hue: 188 + (wordHash(name) % 138),
      };
      const position = placeWord(word, occupied, width, height, index);
      if (!position) continue;
      occupied.push(position);
      placedWords.push({ ...word, ...position });
    }

    const stage = document.createElement("div");
    stage.className = "word-cloud-stage";
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    stage.setAttribute("role", "img");
    stage.setAttribute(
      "aria-label",
      `${t("wordCloudKicker")}：${placedWords.map((word) => word.name).join("、") || t("wordCloudNoData", { days: selectedDays })}`,
    );

    for (const word of placedWords) {
      const label = document.createElement("span");
      label.className = "word-cloud-word";
      label.textContent = word.name;
      label.style.left = `${word.x}px`;
      label.style.top = `${word.y}px`;
      label.style.color = `hsl(${word.hue} 68% ${isDark ? 72 : 43}%)`;
      label.style.fontSize = `${word.fontSize}px`;
      label.style.transform = `translate(-50%, -50%) rotate(${word.rotation}deg)`;
      label.addEventListener("mouseenter", (event) => showTooltip(word, event));
      label.addEventListener("mousemove", (event) => showTooltip(word, event));
      label.addEventListener("mouseleave", hideTooltip);
      stage.append(label);
    }
    stage.addEventListener("mouseleave", hideTooltip);

    // 算法无法容纳所有词时至少展示一个明确的空态，杜绝无内容白块。
    if (placedWords.length === 0) {
      const empty = document.createElement("p");
      empty.className = "word-cloud-empty";
      empty.textContent = t("wordCloudNoData", { days: selectedDays });
      stage.append(empty);
    }
    cloud.replaceChildren(stage, tooltip);
  }

  function scheduleDraw() {
    if (renderFrame !== null) window.cancelAnimationFrame(renderFrame);
    renderFrame = window.requestAnimationFrame(drawCloud);
  }

  function render() {
    renderSummary();
    if (response) scheduleDraw();
  }

  function setRange(days) {
    if (![3, 7, 30].includes(days)) return;
    selectedDays = days;
    response = null;
    renderSummary();
    renderMessage("wordCloudLoading");
  }

  function setData(nextResponse, days) {
    response = nextResponse && typeof nextResponse === "object" ? nextResponse : null;
    if ([3, 7, 30].includes(days)) selectedDays = days;
    if (!response) {
      renderSummary();
      renderMessage("wordCloudUnavailable", "word-cloud-empty word-cloud-empty-error");
      return;
    }
    render();
  }

  function showLoading() {
    if (response) return;
    renderSummary();
    renderMessage("wordCloudLoading");
  }

  function showError() {
    response = null;
    renderSummary();
    renderMessage("wordCloudUnavailable", "word-cloud-empty word-cloud-empty-error");
  }

  const scheduleResizeDraw = () => {
    if (response) scheduleDraw();
  };
  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(scheduleResizeDraw);
    resizeObserver.observe(cloud);
  } else {
    window.addEventListener("resize", scheduleResizeDraw);
  }
  showLoading();
  return { render, setRange, setData, showLoading, showError };
}
