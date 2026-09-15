const root = document.documentElement;
const languageButton = document.querySelector('#language');
const dashboard = document.querySelector('#dashboard');
const sessionDetails = document.querySelector('#session-details');
const descriptions = {
  'zh-CN': 'Codex Desk 是开源的 Codex CLI 桌面工具，提供悬浮额度监控、Token 用量统计与本地会话管理，支持 Windows、macOS 和 Linux。',
  en: 'Codex Desk is an open-source desktop companion for Codex CLI. Monitor your quota, explore token usage, and resume local sessions on Windows, macOS, and Linux.'
};
function setLanguage(language) {
  const chinese = language === 'zh-CN';
  root.lang = language;
  document.title = chinese ? 'Codex Desk — Codex CLI 额度监控与会话管理工具' : 'Codex Desk — Codex CLI Quota Monitor & Session Manager';
  document.querySelector('meta[name="description"]').content = descriptions[language];
  languageButton.textContent = chinese ? 'EN ↔' : '中文 ↔';
  languageButton.setAttribute('aria-label', chinese ? 'Switch to English' : '切换为中文');
  document.querySelector('nav').setAttribute('aria-label', chinese ? '主要导航' : 'Main navigation');
  dashboard.src = `screenshots/dashboard-light-${chinese ? 'zh' : 'en'}.png`;
  dashboard.alt = chinese ? 'Codex Desk 中文控制台，展示额度、用量趋势和会话列表' : 'Codex Desk dashboard showing quota, usage trends, and local sessions';
  sessionDetails.src = `screenshots/session-details-${chinese ? 'zh' : 'en'}.png`;
  sessionDetails.alt = chinese ? 'Codex Desk 中文会话详情，展示历史对话与 Token 用量概览' : 'Codex Desk session details showing conversation history and token usage';
  const quotaOrb = document.querySelector('#quota-orb');
  // 额度球中的重置时间与当前语言一致，切换语言时同步替换为对应的新版图标。
  quotaOrb.src = `screenshots/quota-orb-light-${chinese ? 'zh' : 'en'}.png`;
  quotaOrb.alt = chinese ? 'Codex Desk 桌面悬浮额度指示器' : 'Codex Desk floating quota indicator';
  document.querySelector('#docs-link').href = `https://github.com/xiaotao-xiaotao/codex-desk/blob/main/README${chinese ? '.zh-CN' : ''}.md`;
}
let savedLanguage;
// 存储不可用时仍允许切换语言，例如浏览器限制站点存储的情况。
try { savedLanguage = localStorage.getItem('codex-desk-language'); } catch {}
// 首次访问统一展示英文；仅恢复用户明确选择过的语言。
setLanguage(['zh-CN', 'en'].includes(savedLanguage) ? savedLanguage : 'en');
languageButton.hidden = false;
languageButton.addEventListener('click', () => {
  const language = root.lang === 'zh-CN' ? 'en' : 'zh-CN';
  setLanguage(language);
  try { localStorage.setItem('codex-desk-language', language); } catch {}
});
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)');

// 用固定底座计算指针位置，避免截图倾斜改变测量区域而产生抖动。
document.querySelectorAll('.screenshot-stage').forEach(stage => {
  let frame = 0;
  const reset = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    stage.style.removeProperty('--screen-rx');
    stage.style.removeProperty('--screen-ry');
  };
  stage.addEventListener('pointermove', event => {
    if (reducedMotion.matches || !finePointer.matches || event.pointerType === 'touch') return;
    const bounds = stage.getBoundingClientRect();
    const x = Math.max(-.5, Math.min(.5, (event.clientX - bounds.left) / bounds.width - .5));
    const y = Math.max(-.5, Math.min(.5, (event.clientY - bounds.top) / bounds.height - .5));
    cancelAnimationFrame(frame);
    // 截图最多倾斜 2 度，保留正文阅读所需的稳定性。
    frame = requestAnimationFrame(() => {
      stage.style.setProperty('--screen-rx', `${-y * 4}deg`);
      stage.style.setProperty('--screen-ry', `${x * 4}deg`);
      frame = 0;
    });
  });
  stage.addEventListener('pointerleave', reset);
  stage.addEventListener('pointercancel', reset);
  reducedMotion.addEventListener('change', reset);
  finePointer.addEventListener('change', reset);
});

// 分段进入视口时再显示，避免长页面在首次加载时同时抢夺注意力。
const revealTargets = document.querySelectorAll('[data-reveal]');
if (!reducedMotion.matches && 'IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: .12 });
  revealTargets.forEach(target => revealObserver.observe(target));
} else {
  revealTargets.forEach(target => target.classList.add('is-visible'));
}

// 官网截图保持原始分辨率，通过弹层查看细节，避免首屏为兼顾版式而牺牲可读性。
const imagePreview = document.createElement('dialog');
imagePreview.className = 'image-preview-dialog';
const previewImage = document.createElement('img');
previewImage.draggable = false;
const previewCanvas = document.createElement('div');
previewCanvas.className = 'image-preview-canvas';
const closePreview = document.createElement('button');
let previewScale = 1;
let previewOffsetX = 0;
let previewOffsetY = 0;
let panStart;
let previewBaseWidth = 0;
let previewBaseHeight = 0;
const PREVIEW_MAX_SCALE = 3.4;
const PREVIEW_ZOOM_STEP = .6;
// 首次放大至少让图片的两个方向都溢出画布，避免竖图只能上下拖动。
const PREVIEW_PAN_MARGIN = 1.12;
// 未缩放时仍允许少量原样平移，便于直接拖拽调整查看位置。
const PREVIEW_IDLE_PAN_RATIO = .14;
closePreview.type = 'button';
closePreview.textContent = '×';
closePreview.setAttribute('aria-label', '关闭图片预览');
previewCanvas.append(previewImage);
imagePreview.append(previewCanvas, closePreview);
document.body.append(imagePreview);

const fitPreviewImage = () => {
  const viewport = previewCanvas.getBoundingClientRect();
  if (!previewImage.naturalWidth || !viewport.width || !viewport.height) return;
  const fitRatio = Math.min(viewport.width / previewImage.naturalWidth, viewport.height / previewImage.naturalHeight);
  previewBaseWidth = previewImage.naturalWidth * fitRatio;
  previewBaseHeight = previewImage.naturalHeight * fitRatio;
  // 先按画布等比放大到最大，确保全屏预览不会在大屏上显示成小图。
  previewImage.style.width = `${previewBaseWidth}px`;
  previewImage.style.height = `${previewBaseHeight}px`;
  return viewport;
};

const applyPreviewScale = () => {
  // 拖拽只修改中心位置，缩放只作用于图片本身，两个状态互不影响。
  const viewport = fitPreviewImage();
  if (!viewport) return;
  const scaledWidth = previewBaseWidth * previewScale;
  const scaledHeight = previewBaseHeight * previewScale;
  const idlePanX = previewScale === 1 ? viewport.width * PREVIEW_IDLE_PAN_RATIO : 0;
  const idlePanY = previewScale === 1 ? viewport.height * PREVIEW_IDLE_PAN_RATIO : 0;
  const maxOffsetX = Math.max(idlePanX, (scaledWidth - viewport.width) / 2);
  const maxOffsetY = Math.max(idlePanY, (scaledHeight - viewport.height) / 2);
  previewOffsetX = Math.min(maxOffsetX, Math.max(-maxOffsetX, previewOffsetX));
  previewOffsetY = Math.min(maxOffsetY, Math.max(-maxOffsetY, previewOffsetY));
  previewImage.style.left = `calc(50% + ${previewOffsetX}px)`;
  previewImage.style.top = `calc(50% + ${previewOffsetY}px)`;
  previewImage.style.transform = `translate(-50%, -50%) scale(${previewScale})`;
};

const getMinimumPanScale = () => {
  const viewport = fitPreviewImage();
  if (!viewport) return 1;
  return Math.min(PREVIEW_MAX_SCALE, Math.max(1, PREVIEW_PAN_MARGIN * Math.max(
    viewport.width / previewBaseWidth,
    viewport.height / previewBaseHeight
  )));
};

const openImagePreview = image => {
  previewImage.src = image.currentSrc || image.src;
  previewImage.alt = image.alt;
  previewScale = 1;
  previewOffsetX = 0;
  previewOffsetY = 0;
  document.body.classList.add('image-preview-open');
  imagePreview.showModal();
  applyPreviewScale();
  closePreview.focus();
};

closePreview.addEventListener('click', () => imagePreview.close());
imagePreview.addEventListener('click', event => {
  if (event.target === imagePreview) imagePreview.close();
});
previewCanvas.addEventListener('wheel', event => {
  event.preventDefault();
  const zoomingIn = event.deltaY < 0;
  const nextScale = previewScale + (zoomingIn ? PREVIEW_ZOOM_STEP : -PREVIEW_ZOOM_STEP);
  previewScale = Math.min(PREVIEW_MAX_SCALE, Math.max(1, Number(nextScale.toFixed(1))));
  // 竖向截图在宽屏中必须放大得更多，才能和横向截图一样支持左右拖拽。
  if (zoomingIn && previewScale > 1) previewScale = Math.max(previewScale, getMinimumPanScale());
  applyPreviewScale();
}, { passive: false });
previewImage.addEventListener('dragstart', event => event.preventDefault());
previewCanvas.addEventListener('pointerdown', event => {
  event.preventDefault();
  panStart = { x: event.clientX, y: event.clientY, offsetX: previewOffsetX, offsetY: previewOffsetY };
  previewCanvas.setPointerCapture(event.pointerId);
  previewImage.classList.add('is-panning');
});
previewCanvas.addEventListener('pointermove', event => {
  if (!panStart) return;
  event.preventDefault();
  previewOffsetX = panStart.offsetX + event.clientX - panStart.x;
  previewOffsetY = panStart.offsetY + event.clientY - panStart.y;
  applyPreviewScale();
});
const stopPreviewPan = event => {
  if (!panStart) return;
  if (previewCanvas.hasPointerCapture(event.pointerId)) previewCanvas.releasePointerCapture(event.pointerId);
  panStart = undefined;
  previewImage.classList.remove('is-panning');
};
previewCanvas.addEventListener('pointerup', stopPreviewPan);
previewCanvas.addEventListener('pointercancel', stopPreviewPan);
previewImage.addEventListener('load', applyPreviewScale);
window.addEventListener('resize', () => {
  if (imagePreview.open) applyPreviewScale();
});
imagePreview.addEventListener('close', () => {
  document.body.classList.remove('image-preview-open');
  previewOffsetX = 0;
  previewOffsetY = 0;
  panStart = undefined;
  previewImage.style.removeProperty('left');
  previewImage.style.removeProperty('top');
  previewImage.style.removeProperty('width');
  previewImage.style.removeProperty('height');
  previewImage.style.removeProperty('transform');
  previewImage.classList.remove('is-panning');
});

document.querySelectorAll('[data-zoomable]').forEach(frame => {
  const image = frame.querySelector('img');
  if (!image) return;
  frame.tabIndex = 0;
  frame.setAttribute('role', 'button');
  frame.setAttribute('aria-label', `${image.alt}，点击放大`);
  frame.addEventListener('click', () => openImagePreview(image));
  frame.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openImagePreview(image);
  });
});
