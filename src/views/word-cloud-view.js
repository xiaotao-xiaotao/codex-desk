// 以水平词为主，穿插不同倾角，形成自然发散的词云而非规则标签矩阵。
const ROTATIONS = [0, 0, 0, 0, -16, 16, -28, 28, -42, 42, -56, 56];
const WORD_CLOUD_ITEM_LIMIT = 200;
// 以前 60 个高频词决定中心字号，额外词只补充外圈，避免为了展示更多词而压小主体。
const WORD_CLOUD_CORE_ITEM_COUNT = 60;
const PERIPHERAL_REGION_RADIUS = .25;
// 维持原 100 词布局的排名衰减；新增词固定使用长尾字号，只负责填充外围空位。
const WORD_CLOUD_RANK_REFERENCE_COUNT = 100;
// 词与词之间仅保留极窄安全间隙，视觉上连续聚合，悬停时也不会误触相邻词。
const WORD_CLEARANCE = 1.5;
// 适度提高画布占用率；外围小词用于延展到宽卡两侧，不退化成满屏文字墙。
const WORD_CLOUD_FILL_RATIO = .95;
const MIN_WORD_FONT_SIZE = 8.5;
const MAX_WORD_FONT_SCALE = 2.4;
const MIN_WORD_FONT_SCALE = .72;
const FONT_REDUCTION_PER_ATTEMPT = 1.25;
const MAX_FONT_REDUCTION_ATTEMPTS = 5;
const WORD_GRID_SIZE = 3;
const WORD_MASK_PADDING = WORD_GRID_SIZE;
const WORD_FONT_FAMILY = 'Inter, "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif';
const LIGHT_WORD_COLORS = ["#1d4ed8", "#2563eb", "#0f79a8", "#1f70b8", "#4269bf", "#5b52b8"];
const DARK_WORD_COLORS = ["#7cb9ff", "#8eb8ff", "#6ed0ee", "#91a9ff", "#aa9aff", "#76c5ff"];

function wordHash(word) {
  let hash = 0;
  for (const character of word) {
    hash = ((hash << 5) - hash + character.codePointAt(0)) | 0;
  }
  return Math.abs(hash);
}

function fontSizeFor(value, minimum, maximum, rank, scale = 1) {
  // 频次决定主字号，环形排名再逐层收缩：最高频词始终是视觉中心，外圈词更轻。
  const frequencyRatio = maximum <= minimum
    ? .5
    : Math.sqrt((value - minimum) / (maximum - minimum));
  const coreSize = 11 + frequencyRatio * 18;
  // 外圈词额外收缩，使横向扩散后仍保持“中间大、两边小”的阅读层级。
  const ringDamping = 1 - rank * .24;
  return Math.max(MIN_WORD_FONT_SIZE, coreSize * ringDamping * scale);
}

function rankForIndex(index) {
  return Math.min(1, index / Math.max(1, WORD_CLOUD_RANK_REFERENCE_COUNT - 1));
}

function estimatedTextWidth(name, fontSize) {
  // 不调用 Canvas 测量，避免 WebView 首帧字体尚未就绪时得到错误尺寸。
  return Array.from(name).reduce((width, character) => (
    width + (character.codePointAt(0) <= 0x7f ? fontSize * 0.58 : fontSize)
  ), 0);
}

function estimatedWordArea(word) {
  const textWidth = estimatedTextWidth(word.name, word.fontSize);
  const textHeight = word.fontSize * 1.16;
  const radians = (word.rotation * Math.PI) / 180;
  const width = Math.abs(textWidth * Math.cos(radians)) + Math.abs(textHeight * Math.sin(radians)) + WORD_CLEARANCE;
  const height = Math.abs(textWidth * Math.sin(radians)) + Math.abs(textHeight * Math.cos(radians)) + WORD_CLEARANCE;
  return width * height;
}

function fontScaleForCanvas(items, minimum, maximum, width, height) {
  let estimatedArea = 0;
  const coreItems = items.slice(0, WORD_CLOUD_CORE_ITEM_COUNT);
  for (const [index, item] of coreItems.entries()) {
    // 排名仍按全部词条计算，使补充到外圈的长尾词自然更小。
    const rank = rankForIndex(index);
    const fontSize = fontSizeFor(item.value, minimum, maximum, rank);
    const rotation = ROTATIONS[wordHash(item.name) % ROTATIONS.length];
    estimatedArea += estimatedWordArea({ name: item.name, fontSize, rotation });
  }
  // 根据实际词数和画布面积放大字号，尽量利用画布，同时保留自然词云所需的呼吸感。
  return Math.min(
    MAX_WORD_FONT_SCALE,
    Math.max(MIN_WORD_FONT_SCALE, Math.sqrt((width * height * WORD_CLOUD_FILL_RATIO) / Math.max(1, estimatedArea))),
  );
}

function fontDeclaration(fontSize) {
  return `700 ${fontSize}px ${WORD_FONT_FAMILY}`;
}

function createWordMask(word) {
  const metricsCanvas = document.createElement("canvas");
  const metricsContext = metricsCanvas.getContext("2d", { willReadFrequently: true });
  if (!metricsContext) return null;

  metricsContext.font = fontDeclaration(word.fontSize);
  const textMetrics = metricsContext.measureText(word.name);
  const textWidth = Math.max(1, Math.ceil(textMetrics.actualBoundingBoxLeft + textMetrics.actualBoundingBoxRight || textMetrics.width));
  const textHeight = Math.max(1, Math.ceil(textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent || word.fontSize * 1.2));
  const radians = (word.rotation * Math.PI) / 180;
  const width = Math.ceil(
    Math.abs(textWidth * Math.cos(radians)) + Math.abs(textHeight * Math.sin(radians)) + WORD_MASK_PADDING * 2,
  );
  const height = Math.ceil(
    Math.abs(textWidth * Math.sin(radians)) + Math.abs(textHeight * Math.cos(radians)) + WORD_MASK_PADDING * 2,
  );
  metricsCanvas.width = width;
  metricsCanvas.height = height;

  metricsContext.font = fontDeclaration(word.fontSize);
  metricsContext.textAlign = "center";
  metricsContext.textBaseline = "middle";
  metricsContext.fillStyle = "#000";
  metricsContext.translate(width / 2, height / 2);
  metricsContext.rotate(radians);
  metricsContext.fillText(word.name, 0, 0);

  const imageData = metricsContext.getImageData(0, 0, width, height).data;
  const columns = Math.ceil(width / WORD_GRID_SIZE);
  const rows = Math.ceil(height / WORD_GRID_SIZE);
  const cells = [];
  const cellMap = new Set();
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const maxY = Math.min(height, (row + 1) * WORD_GRID_SIZE);
      const maxX = Math.min(width, (column + 1) * WORD_GRID_SIZE);
      let painted = false;
      for (let y = row * WORD_GRID_SIZE; y < maxY && !painted; y += 1) {
        for (let x = column * WORD_GRID_SIZE; x < maxX; x += 1) {
          if (imageData[(y * width + x) * 4 + 3] > 0) {
            painted = true;
            break;
          }
        }
      }
      if (painted) {
        cells.push([column, row]);
        cellMap.add(row * columns + column);
      }
    }
  }
  return { width, height, columns, rows, cells, cellMap };
}

function createCenterFirstCandidates(columns, rows) {
  const centerX = (columns - 1) / 2;
  const centerY = (rows - 1) / 2;
  const candidates = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const horizontalDistance = (column - centerX) / Math.max(1, centerX);
      const verticalDistance = (row - centerY) / Math.max(1, centerY);
      candidates.push({
        column,
        row,
        // 按矩形等距向外扩展，避免优先填满十字轴而把四角留到最后。
        distance: Math.max(Math.abs(horizontalDistance), Math.abs(verticalDistance)),
      });
    }
  }
  // 圆角矩形轮廓从中心连续生长，兼顾中心聚合感与卡片边角利用率。
  candidates.sort((left, right) => left.distance - right.distance || left.row - right.row || left.column - right.column);
  return candidates;
}

function createPeripheralCandidates(candidates, columns, rows) {
  // 只排序八个外围局部区域，避免大窗口为每个区域复制整张画布的候选点。
  const anchors = [[.12, .12], [.88, .88], [.88, .12], [.12, .88], [.5, .12], [.5, .88], [.12, .5], [.88, .5]];
  return anchors.map(([x, y]) => candidates.filter((candidate) => (
    Math.abs(candidate.column / columns - x) <= PERIPHERAL_REGION_RADIUS
      && Math.abs(candidate.row / rows - y) <= PERIPHERAL_REGION_RADIUS
  )).map((candidate) => ({
    ...candidate,
    distance: ((candidate.column / columns - x) ** 2) + ((candidate.row / rows - y) ** 2),
  })).sort((left, right) => left.distance - right.distance || left.row - right.row || left.column - right.column));
}

function tryPlaceMask(mask, occupied, columns, rows, owner, candidate) {
  const offsetX = candidate.column - Math.floor(mask.columns / 2);
  const offsetY = candidate.row - Math.floor(mask.rows / 2);

  let fits = true;
  for (const [cellX, cellY] of mask.cells) {
    const targetX = offsetX + cellX;
    const targetY = offsetY + cellY;
    if (targetX < 0 || targetY < 0 || targetX >= columns || targetY >= rows || occupied[targetY * columns + targetX] !== 0) {
      fits = false;
      break;
    }
  }
  if (!fits) return null;

  for (const [cellX, cellY] of mask.cells) {
    occupied[(offsetY + cellY) * columns + offsetX + cellX] = owner;
  }
  return {
    x: offsetX * WORD_GRID_SIZE + mask.width / 2,
    y: offsetY * WORD_GRID_SIZE + mask.height / 2,
  };
}

function placeMask(mask, occupied, columns, rows, owner, candidates) {
  for (const candidate of candidates) {
    const position = tryPlaceMask(mask, occupied, columns, rows, owner, candidate);
    if (position) return position;
  }
  return null;
}

function placeWord(word, occupied, columns, rows, owner, candidates, fallbackCandidates = candidates) {
  // 使用文字实际像素占用的网格，而非整块外接矩形；这样小词会进入大词笔画周边的空位。
  for (let sizeAttempt = 0; sizeAttempt < MAX_FONT_REDUCTION_ATTEMPTS; sizeAttempt += 1) {
    const mask = createWordMask(word);
    if (mask) {
      // 外围区域满了再查全图，不因局部拥挤而提前缩小字号或丢掉词条。
      const position = placeMask(mask, occupied, columns, rows, owner, candidates)
        ?? (fallbackCandidates !== candidates ? placeMask(mask, occupied, columns, rows, owner, fallbackCandidates) : null);
      if (position) return { ...position, mask };
    }
    word.fontSize = Math.max(MIN_WORD_FONT_SIZE, word.fontSize - FONT_REDUCTION_PER_ATTEMPT);
    if (word.fontSize === MIN_WORD_FONT_SIZE) break;
  }
  return null;
}

function wordAtCanvasPoint(words, x, y) {
  for (let index = words.length - 1; index >= 0; index -= 1) {
    const word = words[index];
    const localX = x - word.x + word.mask.width / 2;
    const localY = y - word.y + word.mask.height / 2;
    if (localX < 0 || localY < 0 || localX >= word.mask.width || localY >= word.mask.height) continue;
    const column = Math.floor(localX / WORD_GRID_SIZE);
    const row = Math.floor(localY / WORD_GRID_SIZE);
    if (word.mask.cellMap.has(row * word.mask.columns + column)) return word;
  }
  return null;
}

function wordColor(word, isDark) {
  const palette = isDark ? DARK_WORD_COLORS : LIGHT_WORD_COLORS;
  return palette[wordHash(word.name) % palette.length];
}

/**
 * 词云先将真实文字像素转为小网格再排布，而不是拿整块文本外接矩形碰撞。
 * 这与专业词云组件的核心做法一致：小词可填入大词笔画周边，避免中心出现空洞。
 */
export function createWordCloudView({ t, onSelectTopic }) {
  const cloud = document.querySelector("#word-cloud");
  const summary = document.querySelector("#word-cloud-summary");
  const cloudSection = cloud.closest(".word-cloud-section");
  const topicButtons = document.createElement("div");
  topicButtons.className = "topic-buttons";
  cloudSection.append(topicButtons);
  const tooltip = document.createElement("div");
  let response = null;
  let selectedDays = 7;
  let windowResizeTransitioning = false;
  let renderFrame = null;

  tooltip.className = "word-cloud-tooltip";
  tooltip.hidden = true;
  cloud.setAttribute("aria-live", "polite");

  // 独立主题页始终保留空态，避免没有用户输入时整个栏目消失。
  function setCloudHidden() {
    cloudSection.hidden = false;
  }

  function updateCloudAccessibility() {
    cloud.setAttribute("role", "group");
    cloud.setAttribute("aria-label", t("wordCloudKicker"));
  }

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
    topicButtons.replaceChildren();
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
    tooltip.textContent = t("topicWordSummary", { word: word.name, occurrences: word.value, count: word.threads.length });
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(Math.max(6, event.clientX - bounds.left + 10), Math.max(6, bounds.width - tooltip.offsetWidth - 6))}px`;
    tooltip.style.top = `${Math.max(tooltip.offsetHeight + 5, event.clientY - bounds.top - 8)}px`;
  }

  function drawCloud() {
    renderFrame = null;
    if (!response) return;

    const availableItems = Array.isArray(response.items) ? response.items : [];
    const items = availableItems
      .slice(0, WORD_CLOUD_ITEM_LIMIT)
      .map((item) => ({
        name: String(item?.name ?? "").trim(),
        value: Number(item?.value) || 0,
        threads: Array.isArray(item?.threads) ? item.threads : [],
      }))
      .filter((item) => item.name && item.value > 0);
    if (items.length === 0) {
      renderMessage("wordCloudNoData");
      return;
    }

    // 词云改为横向卡片后，画布必须服从实际高度，避免旧的 200px 下限裁掉上下文字。
    // 隐藏栏目尚无有效尺寸时延后绘制；栏目切换与 ResizeObserver 会在可见后重新渲染。
    const cloudStyle = getComputedStyle(cloud);
    const width = Math.floor(cloud.clientWidth - parseFloat(cloudStyle.paddingLeft) - parseFloat(cloudStyle.paddingRight));
    const height = Math.floor(cloud.clientHeight - parseFloat(cloudStyle.paddingTop) - parseFloat(cloudStyle.paddingBottom));
    if (width <= 0 || height <= 0) return;
    const values = items.map((item) => item.value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    // 以当前画布和词量求字号比例，常规卡和放大态都能得到紧凑而不拥挤的密度。
    const fontScale = fontScaleForCanvas(items, minimum, maximum, width, height);
    const isDark = document.documentElement.dataset.theme === "dark";
    // 边缘只使用完整网格，防止不足一格的空间承载文字像素后被 Canvas 裁切。
    const gridColumns = Math.floor(width / WORD_GRID_SIZE);
    const gridRows = Math.floor(height / WORD_GRID_SIZE);
    const occupied = new Uint16Array(gridColumns * gridRows);
    const candidates = createCenterFirstCandidates(gridColumns, gridRows);
    const peripheralCandidates = items.length > WORD_CLOUD_CORE_ITEM_COUNT
      ? createPeripheralCandidates(candidates, gridColumns, gridRows) : [];
    const placedWords = [];

    for (const [index, item] of items.entries()) {
      const { name, value } = item;
      const rank = rankForIndex(index);
      const word = {
        name,
        value,
        threads: item.threads,
        fontSize: fontSizeFor(value, minimum, maximum, rank, fontScale),
        rotation: ROTATIONS[wordHash(name) % ROTATIONS.length],
      };
      const position = placeWord(
        word,
        occupied,
        gridColumns,
        gridRows,
        placedWords.length + 1,
        index < WORD_CLOUD_CORE_ITEM_COUNT ? candidates
          : peripheralCandidates[(index - WORD_CLOUD_CORE_ITEM_COUNT) % peripheralCandidates.length],
        candidates,
      );
      if (!position) continue;
      placedWords.push({ ...word, ...position });
    }
    if (placedWords.length === 0) {
      renderMessage("wordCloudNoData");
      return;
    }
    const stage = document.createElement("canvas");
    stage.className = "word-cloud-stage";
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    stage.width = Math.round(width * pixelRatio);
    stage.height = Math.round(height * pixelRatio);
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    stage.setAttribute("role", "img");
    stage.setAttribute(
      "aria-label",
      `${t("wordCloudKicker")}：${placedWords.map((word) => word.name).join("、") || t("wordCloudNoData", { days: selectedDays })}`,
    );

    const context = stage.getContext("2d");
    if (context) {
      context.scale(pixelRatio, pixelRatio);
      context.textAlign = "center";
      context.textBaseline = "middle";
      for (const word of placedWords) {
        context.save();
        context.font = fontDeclaration(word.fontSize);
        context.fillStyle = wordColor(word, isDark);
        context.translate(word.x, word.y);
        context.rotate((word.rotation * Math.PI) / 180);
        context.fillText(word.name, 0, 0);
        context.restore();
      }
    }
    stage.addEventListener("mousemove", (event) => {
      const bounds = stage.getBoundingClientRect();
      const word = wordAtCanvasPoint(placedWords, event.clientX - bounds.left, event.clientY - bounds.top);
      stage.style.cursor = word?.threads.length ? "pointer" : "default";
      if (word) showTooltip(word, event);
      else hideTooltip();
    });
    stage.addEventListener("click", (event) => {
      const bounds = stage.getBoundingClientRect();
      const word = wordAtCanvasPoint(placedWords, event.clientX - bounds.left, event.clientY - bounds.top);
      if (word?.threads.length) {
        onSelectTopic({ name: word.name, value: word.value, threads: word.threads, days: selectedDays });
      }
    });
    stage.addEventListener("mouseleave", hideTooltip);
    cloud.replaceChildren(stage, tooltip);
  }

  function scheduleDraw() {
    // 窗口最大化/还原期间，任何来源（ResizeObserver、模块更新、主题重绘）都不能提前排版。
    if (windowResizeTransitioning) return;
    if (renderFrame !== null) window.cancelAnimationFrame(renderFrame);
    renderFrame = window.requestAnimationFrame(drawCloud);
  }

  function renderTopicButtons() {
    if (!response) return;
    topicButtons.replaceChildren(...(response.items || []).filter((item) => item.threads?.length).slice(0, 10).map((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "selection-button";
      button.textContent = `${item.name} · ${item.threads.length}`;
      button.title = t("topicWordSummary", { word: item.name, occurrences: item.value, count: item.threads.length });
      button.addEventListener("click", () => {
        onSelectTopic({ ...item, days: selectedDays });
      });
      return button;
    }));
  }

  function render() {
    updateCloudAccessibility();
    renderSummary();
    renderTopicButtons();
    if (response && !cloudSection.hidden) scheduleDraw();
  }

  function setRange(days) {
    if (![3, 7, 30].includes(days)) return;
    selectedDays = days;
    response = null;
    topicButtons.replaceChildren();
    setCloudHidden(false);
    renderSummary();
    renderMessage("wordCloudLoading");
  }

  function setData(nextResponse, days) {
    response = nextResponse && typeof nextResponse === "object" ? nextResponse : null;
    if ([3, 7, 30].includes(days)) selectedDays = days;
    if (!response) {
      setCloudHidden(false);
      renderSummary();
      renderMessage("wordCloudUnavailable", "word-cloud-empty word-cloud-empty-error");
      return;
    }
    setCloudHidden(false);

    render();
  }

  function showLoading() {
    if (response) return;
    setCloudHidden(false);
    renderSummary();
    renderMessage("wordCloudLoading");
  }

  function showError() {
    response = null;
    topicButtons.replaceChildren();
    setCloudHidden(false);
    renderSummary();
    renderMessage("wordCloudUnavailable", "word-cloud-empty word-cloud-empty-error");
  }

  function setWindowResizeTransitioning(nextTransitioning) {
    const normalized = Boolean(nextTransitioning);
    if (windowResizeTransitioning === normalized) return;
    windowResizeTransitioning = normalized;
    if (windowResizeTransitioning && renderFrame !== null) {
      window.cancelAnimationFrame(renderFrame);
      renderFrame = null;
    }
    // 原生窗口动画结束后只绘制一次最终尺寸，避免 Canvas 在每个中间尺寸重复排版。
    if (!windowResizeTransitioning && response && !cloudSection.hidden) scheduleDraw();
  }

  const scheduleResizeDraw = () => {
    if (response && !cloudSection.hidden && !windowResizeTransitioning) scheduleDraw();
  };
  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(scheduleResizeDraw);
    resizeObserver.observe(cloud);
  } else {
    window.addEventListener("resize", scheduleResizeDraw);
  }
  updateCloudAccessibility();
  showLoading();
  return {
    render,
    setRange,
    setData,
    setWindowResizeTransitioning,
    showLoading,
    showError,
  };
}
