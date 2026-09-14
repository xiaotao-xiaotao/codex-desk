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
  document.querySelector('#release-preview').alt = chinese ? 'Codex Desk 产品展示，包含悬浮额度球、账户额度和 Token 活动控制台' : 'Codex Desk product overview with floating quota indicator, account usage, and token activity dashboard';
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
const scene = document.querySelector('.scene');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(pointer: fine)');
// 只在鼠标设备上启用有限幅度的空间倾斜，触屏保持自然滚动。
scene.addEventListener('pointermove', event => {
  if (reducedMotion.matches || !finePointer.matches) return;
  const bounds = scene.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - .5;
  const y = (event.clientY - bounds.top) / bounds.height - .5;
  scene.style.setProperty('--rx', `${-y * 12}deg`);
  scene.style.setProperty('--ry', `${x * 16}deg`);
});
scene.addEventListener('pointerleave', () => {
  scene.style.setProperty('--rx', '0deg');
  scene.style.setProperty('--ry', '0deg');
});

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
