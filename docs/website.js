const root = document.documentElement;
const languagePicker = document.querySelector('#language-picker');
const languageButton = document.querySelector('#language');
const languageLabel = document.querySelector('#language-label');
const languageMenu = document.querySelector('#language-menu');
const languageOptions = [...languageMenu.querySelectorAll('[data-language]')];
const dashboard = document.querySelector('#dashboard');
const sessionDetails = document.querySelector('#session-details');
const localizedLabels = {
  'zh-TW': ['跳至內容', '工作區', '你的 Codex CLI 桌面助手', '額度、工作階段，盡在一處。', '隨時留意額度、了解 Token 用量，並接續本機對話。', '下載 Codex Desk', '探索功能', '在同一個視窗查看額度、趨勢和工作階段記錄。', '開放原始碼', '本機處理', '為你的桌面而生', '額度與用量', '掌握額度', '讓懸浮指示器留在桌面上；需要詳細資訊時再開啟控制台。', '查看限制', '查看額度視窗、使用百分比和重設時間。', '取得提醒', '在用量達到門檻時啟用通知提醒。', '了解用量', '探索每日 Token 用量和活動趨勢。', '小巧指示器，清楚掌握額度。', '懸浮指示器', '用量提醒', '本機工作階段', '接續思路', '找回之前的對話、檢視變更，然後在終端機繼續工作。', '尋找對話', '搜尋本機工作階段並檢視訊息與用量。', '檢視變更', '查看記錄中的檔案變更和差異。', '繼續工作', '複製恢復命令以在終端機接續工作階段。', '工作階段留在本機', '本機工作階段絕不會上傳至第三方服務。Codex Desk 不會讀取或儲存 auth.json；更新檢查只會要求 GitHub 的公開版本資訊。', '對話詳情與用量概覽', '立即開始', '把 Codex 帶到桌面', '安裝並登入 Codex CLI，然後開啟 Codex Desk。', '安裝指南與疑難排解', '下載 Codex Desk', 'Codex CLI 的桌面助手。', '意見回饋'],
  ko: ['콘텐츠로 건너뛰기', '작업 공간', 'CODEX CLI 데스크톱 도우미', '할당량과 세션을 한곳에서 관리하세요.', '할당량을 확인하고 토큰 사용량을 살펴보며 로컬 대화를 이어가세요.', 'Codex Desk 다운로드', '기능 살펴보기', '하나의 창에서 할당량, 추세, 세션 기록을 확인하세요.', '오픈 소스', '로컬 처리', '데스크톱을 위해 제작', '할당량 및 사용량', '할당량 파악하기', '데스크톱에 플로팅 표시기를 두고, 자세한 정보가 필요할 때 대시보드를 여세요.', '한도 보기', '할당량 기간, 사용률, 재설정 시간을 확인하세요.', '미리 알림 받기', '사용량이 기준에 도달하면 알림을 받으세요.', '사용량 이해하기', '일별 토큰 사용량과 활동 추세를 살펴보세요.', '작은 표시기 하나로 할당량을 명확하게 확인하세요.', '플로팅 표시기', '사용량 알림', '로컬 세션', '작업 이어가기', '이전 대화를 찾고 변경 사항을 검토한 뒤 터미널에서 계속 작업하세요.', '대화 찾기', '로컬 세션을 검색하고 메시지와 사용량을 검토하세요.', '변경 사항 검토', '기록된 파일 변경 사항과 차이를 확인하세요.', '작업 재개', '재개 명령을 복사해 터미널에서 세션을 계속하세요.', '세션은 로컬에 유지됩니다', '로컬 세션은 제3자 서비스에 업로드되지 않습니다. Codex Desk는 auth.json을 읽거나 저장하지 않으며, 업데이트 확인에는 GitHub의 공개 릴리스 정보만 요청합니다.', '대화 세부 정보 및 사용량 개요', '시작하기', 'Codex를 데스크톱으로', 'Codex CLI를 설치하고 로그인한 다음 Codex Desk를 여세요.', '설치 가이드 및 문제 해결', 'Codex Desk 다운로드', 'Codex CLI를 위한 데스크톱 도우미.', '피드백 및 제안'],
  ja: ['コンテンツへ移動', 'ワークスペース', 'CODEX CLI のデスクトップコンパニオン', '使用量もセッションも、一か所で。', '使用量を確認し、トークン利用状況を把握して、ローカルの会話を再開できます。', 'Codex Desk をダウンロード', '機能を見る', '使用量、推移、セッション履歴を一つのウィンドウで確認できます。', 'オープンソース', 'ローカル処理', 'デスクトップのために設計', '使用量とクォータ', '使用量を把握', 'フローティングインジケーターをデスクトップに置き、詳細が必要なときにダッシュボードを開きます。', '上限を確認', 'クォータ期間、使用率、リセット時刻を確認できます。', '事前通知を受け取る', '使用量がしきい値に達したときに通知を受け取れます。', '使用量を理解する', '日ごとのトークン使用量とアクティビティの推移を確認できます。', '小さなインジケーターで、使用量を明確に把握。', 'フローティングインジケーター', '使用量アラート', 'ローカルセッション', '作業を続ける', '以前の会話を見つけ、変更を確認して、ターミナルで作業を続けられます。', '会話を探す', 'ローカルセッションを検索し、メッセージと使用量を確認できます。', '変更を確認', '記録されたファイル変更と差分を確認できます。', '作業を再開', '再開コマンドをコピーして、ターミナルでセッションを続けます。', 'セッションはローカルに保持されます', 'ローカルセッションが第三者サービスにアップロードされることはありません。Codex Desk は auth.json を読み取り・保存せず、更新確認では GitHub の公開リリース情報のみを取得します。', '会話の詳細と使用量の概要', '今すぐ始める', 'Codex をデスクへ', 'Codex CLI をインストールしてサインインし、Codex Desk を開きます。', 'インストールガイドとトラブルシューティング', 'Codex Desk をダウンロード', 'Codex CLI のデスクトップコンパニオン。', 'フィードバックと提案']
};
const languageMetadata = {
  en: { title: 'Codex Desk — Codex CLI Quota Monitor & Session Manager', description: 'Codex Desk is an open-source desktop companion for Codex CLI. Monitor your quota, explore token usage, and resume local sessions on Windows, macOS, and Linux.', nav: 'Main navigation', dashboardAlt: 'Codex Desk dashboard showing quota, usage trends, and local sessions', sessionAlt: 'Codex Desk session details showing conversation history and token usage', orbAlt: 'Codex Desk floating quota indicator' },
  'zh-CN': { title: 'Codex Desk — Codex CLI 额度监控与会话管理工具', description: 'Codex Desk 是开源的 Codex CLI 桌面工具，提供悬浮额度监控、Token 用量统计与本地会话管理，支持 Windows、macOS 和 Linux。', nav: '主要导航', dashboardAlt: 'Codex Desk 中文控制台，展示额度、用量趋势和会话列表', sessionAlt: 'Codex Desk 中文会话详情，展示历史对话与 Token 用量概览', orbAlt: 'Codex Desk 桌面悬浮额度指示器' },
  'zh-TW': { title: 'Codex Desk — Codex CLI 額度監控與工作階段管理工具', description: 'Codex Desk 是開放原始碼的 Codex CLI 桌面工具，提供懸浮額度監控、Token 用量統計與本機工作階段管理，支援 Windows、macOS 和 Linux。', nav: '主要導覽', dashboardAlt: 'Codex Desk 控制台，顯示額度、用量趨勢和工作階段清單', sessionAlt: 'Codex Desk 工作階段詳細資料，顯示對話記錄與 Token 用量概覽', orbAlt: 'Codex Desk 桌面懸浮額度指示器' },
  ko: { title: 'Codex Desk — Codex CLI 할당량 모니터 및 세션 관리자', description: 'Codex Desk는 Codex CLI를 위한 오픈 소스 데스크톱 도우미입니다. 할당량을 모니터링하고 토큰 사용량을 살펴보며 로컬 세션을 이어가세요.', nav: '주요 탐색', dashboardAlt: '할당량, 사용량 추세 및 로컬 세션을 보여주는 Codex Desk 대시보드', sessionAlt: '대화 기록과 토큰 사용량을 보여주는 Codex Desk 세션 상세 정보', orbAlt: 'Codex Desk 플로팅 할당량 표시기' },
  ja: { title: 'Codex Desk — Codex CLI の使用量モニターとセッションマネージャー', description: 'Codex Desk は Codex CLI 向けのオープンソース・デスクトップコンパニオンです。使用量を確認し、トークン利用状況を把握して、ローカルセッションを再開できます。', nav: 'メインナビゲーション', dashboardAlt: '使用量、利用推移、ローカルセッションを表示する Codex Desk ダッシュボード', sessionAlt: '会話履歴とトークン使用量を表示する Codex Desk セッション詳細', orbAlt: 'Codex Desk のフローティング使用量インジケーター' }
};
const englishLabels = [...document.querySelectorAll('[data-en]')].map(element => element.textContent);
function setLanguage(language) {
  const chinese = language === 'zh-CN' || language === 'zh-TW';
  const metadata = languageMetadata[language];
  const labels = localizedLabels[language] || englishLabels;
  root.lang = language;
  document.querySelectorAll('[data-en]').forEach((element, index) => { element.textContent = labels[index]; });
  document.title = metadata.title;
  document.querySelector('meta[name="description"]').content = metadata.description;
  document.querySelector('nav').setAttribute('aria-label', metadata.nav);
  const languageMenuLabel = {
    en: 'Select language',
    'zh-CN': '选择语言',
    'zh-TW': '選擇語言',
    ko: '언어 선택',
    ja: '言語を選択'
  }[language];
  languageButton.setAttribute('aria-label', languageMenuLabel);
  languageMenu.setAttribute('aria-label', languageMenuLabel);
  const selectedOption = languageOptions.find(option => option.dataset.language === language);
  languageLabel.textContent = selectedOption.textContent;
  languageOptions.forEach(option => option.setAttribute('aria-selected', String(option === selectedOption)));
  dashboard.src = `screenshots/dashboard-light-${chinese ? 'zh' : 'en'}.png`;
  dashboard.alt = metadata.dashboardAlt;
  sessionDetails.src = `screenshots/session-details-${chinese ? 'zh' : 'en'}.png`;
  sessionDetails.alt = metadata.sessionAlt;
  const quotaOrb = document.querySelector('#quota-orb');
  // 现有产品截图仅有英文与简体中文版本，其他语言使用最接近的可读截图。
  quotaOrb.src = `screenshots/quota-orb-light-${chinese ? 'zh' : 'en'}.png`;
  quotaOrb.alt = metadata.orbAlt;
  document.querySelector('#docs-link').href = `https://github.com/xiaotao-xiaotao/codex-desk/blob/main/README${chinese ? '.zh-CN' : ''}.md`;
}
let savedLanguage;
// 存储不可用时仍允许切换语言，例如浏览器限制站点存储的情况。
try { savedLanguage = localStorage.getItem('codex-desk-language'); } catch {}
// 首次访问统一展示英文；仅恢复用户明确选择过的语言。
const supportedLanguages = Object.keys(languageMetadata);
const initialLanguage = supportedLanguages.includes(savedLanguage) ? savedLanguage : 'en';
setLanguage(initialLanguage);
languagePicker.hidden = false;
const closeLanguageMenu = () => {
  languageMenu.hidden = true;
  languageButton.setAttribute('aria-expanded', 'false');
};
languageButton.addEventListener('click', () => {
  const opening = languageMenu.hidden;
  languageMenu.hidden = !opening;
  languageButton.setAttribute('aria-expanded', String(opening));
});
languageOptions.forEach(option => option.addEventListener('click', () => {
  const language = option.dataset.language;
  setLanguage(language);
  try { localStorage.setItem('codex-desk-language', language); } catch {}
  closeLanguageMenu();
  languageButton.focus();
}));
document.addEventListener('pointerdown', event => {
  if (!languagePicker.contains(event.target)) closeLanguageMenu();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !languageMenu.hidden) {
    closeLanguageMenu();
    languageButton.focus();
  }
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
