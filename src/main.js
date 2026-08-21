import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LANGUAGE_OPTIONS, createI18n } from "./i18n.js";
import { THEME_ICONS, createThemeController } from "./theme.js";
import { copyText } from "./utils/clipboard.js";
import { createDateFormatters } from "./utils/date-formatters.js";
import { createQuotaView } from "./views/quota-view.js";
import { createThreadDialogView } from "./views/thread-dialog-view.js";
import { createThreadListView } from "./views/thread-list-view.js";
import { createThreadTrendView } from "./views/thread-trend-view.js";

const AUTO_REFRESH_INTERVAL_MS = 60_000;
const DRAG_THRESHOLD_PX = 4;

const app = document.querySelector("#app");
const orb = document.querySelector("#quota-orb");
const status = document.querySelector("#status");
const panel = document.querySelector(".panel");
const panelHeader = document.querySelector(".panel-header");
const languageButton = document.querySelector("#language-button");
const languageMenu = document.querySelector("#language-menu");
const languageOptions = document.querySelectorAll("[data-language]");
const themeButton = document.querySelector("#theme-button");
const themeIcon = document.querySelector("#theme-icon");
const minimizeButton = document.querySelector("#minimize-button");
const collapseButton = document.querySelector("#collapse-button");
const refreshButton = document.querySelector("#refresh-button");
const quitButton = document.querySelector("#quit-button");
const importThreadsButton = document.querySelector("#import-threads");
const exportThreadsButton = document.querySelector("#export-threads");
const importFileInput = document.querySelector("#import-file-input");
const threadSelectionBar = document.querySelector("#thread-selection-bar");
const selectPageThreadsButton = document.querySelector("#select-page-threads");
const selectAllThreadsButton = document.querySelector("#select-all-threads");
const clearThreadSelectionButton = document.querySelector("#clear-thread-selection");
const selectedThreadCount = document.querySelector("#selected-thread-count");

const i18n = createI18n();
const theme = createThemeController();
const { t } = i18n;
const { formatQuotaWindow, formatResetTime, formatUpdated } = createDateFormatters({
  getLocale: i18n.getLocale,
  t,
});
const copyToClipboard = (text) => copyText(text, t("clipboardDenied"));
const quotaView = createQuotaView({ t, formatQuotaWindow, formatResetTime });
const dialogView = createThreadDialogView({ t, formatUpdated, copyText: copyToClipboard });
const trendView = createThreadTrendView({ t });
const threadListView = createThreadListView({
  t,
  formatUpdated,
  copyText: copyToClipboard,
  onOpenThread: openThread,
  onSelectionChange: setThreadSelected,
});

// 页面状态集中在入口层：视图模块保持无状态，方便被语言切换和刷新复用。
let expanded = false;
let latestQuota = null;
let refreshing = false;
let searchTimer = null;
let searchRequestVersion = 0;
let trendRequestVersion = 0;
let currentThreadPage = 1;
let currentPageThreads = [];
let currentThreadEmptyMessage = "";
let selectedThreadIds = new Set();
let transferInProgress = false;
let nextAutoRefreshAt = Date.now() + AUTO_REFRESH_INTERVAL_MS;
let orbDragStart = null;
let panelDragStart = null;
let suppressOrbClick = false;
let suppressPanelClick = false;

function setStatus(text, kind = "normal") {
  status.textContent = text;
  status.dataset.kind = kind;
}

function renderCurrentThreadPage() {
  threadListView.renderThreads(currentPageThreads, currentThreadEmptyMessage, selectedThreadIds);
}

function updateTransferControls() {
  const selectedCount = selectedThreadIds.size;
  const hasVisibleThreads = currentPageThreads.length > 0;
  threadSelectionBar.hidden = !hasVisibleThreads && selectedCount === 0;
  selectedThreadCount.textContent = t("selectedThreads", { count: selectedCount });
  exportThreadsButton.disabled = transferInProgress || selectedCount === 0;
  importThreadsButton.disabled = transferInProgress;
  selectPageThreadsButton.disabled = transferInProgress || !hasVisibleThreads;
  selectAllThreadsButton.disabled = transferInProgress || !hasVisibleThreads;
  clearThreadSelectionButton.disabled = transferInProgress || selectedCount === 0;
}

function setThreadSelected(thread, selected) {
  if (selected) selectedThreadIds.add(thread.id);
  else selectedThreadIds.delete(thread.id);
  updateTransferControls();
}

function clearThreadSelection() {
  selectedThreadIds = new Set();
  renderCurrentThreadPage();
  updateTransferControls();
}

function transferFailureSuffix(failures) {
  return failures.length === 0
    ? ""
    : t("transferFailedSuffix", { count: failures.length });
}

function createExportFileName() {
  const date = new Date().toISOString().slice(0, 10);
  return `${t("exportFileName")}-${date}.codex-desk.json`;
}

async function exportSelectedThreads() {
  if (selectedThreadIds.size === 0) {
    setStatus(t("noThreadsSelected"), "error");
    return;
  }
  transferInProgress = true;
  updateTransferControls();
  try {
    setStatus(t("selectingExportLocation"));
    const outputPath = await invoke("choose_export_path", {
      defaultFileName: createExportFileName(),
      filterName: t("exportFileDialogFilter"),
    });
    if (!outputPath) {
      renderSyncedStatus();
      return;
    }
    setStatus(t("preparingExport", { count: selectedThreadIds.size }));
    const result = await invoke("export_threads", {
      threadIds: [...selectedThreadIds],
      outputPath,
    });
    setStatus(t("exportCompleted", {
      count: result.exported,
      failed: transferFailureSuffix(result.failures),
    }));
    clearThreadSelection();
  } catch (error) {
    console.error(error);
    setStatus(t("exportFailed", { error: String(error) }), "error");
  } finally {
    transferInProgress = false;
    updateTransferControls();
  }
}

async function importTransferFile(file) {
  const maxBytes = 64 * 1_024 * 1_024;
  if (!file) return;
  if (file.size === 0) {
    setStatus(t("importFileInvalid"), "error");
    return;
  }
  if (file.size > maxBytes) {
    setStatus(t("importFileTooLarge"), "error");
    return;
  }

  transferInProgress = true;
  updateTransferControls();
  setStatus(t("importReading"));
  try {
    const bundleJson = await file.text();
    let threadCount = 0;
    try {
      const preview = JSON.parse(bundleJson);
      threadCount = Array.isArray(preview?.threads) ? preview.threads.length : 0;
    } catch {
      // 文件格式由原生层统一校验；这里仅用于在可识别的批量包上显示配额提示。
    }
    if (threadCount > 0 && !window.confirm(t("importConfirmation", { count: threadCount }))) {
      renderSyncedStatus();
      return;
    }
    setStatus(t("importingThreads"));
    const result = await invoke("import_threads", {
      bundleJson,
      importedTitlePrefix: t("importedThreadTitlePrefix"),
      importedHistoryIntro: t("importedHistoryIntro"),
    });
    setStatus(t("importCompleted", {
      count: result.imported,
      total: result.total,
      failed: transferFailureSuffix(result.failures),
    }), result.imported === 0 ? "error" : "normal");
    if (result.imported > 0) {
      currentThreadPage = 1;
      await searchThreads(threadListView.getSearchQuery(), currentThreadPage);
      void refreshThreadTrends(true);
    }
  } catch (error) {
    console.error(error);
    setStatus(t("readFailed", { error: String(error) }), "error");
  } finally {
    transferInProgress = false;
    updateTransferControls();
  }
}

async function selectAllFilteredThreads() {
  if (transferInProgress) return;
  transferInProgress = true;
  updateTransferControls();
  setStatus(t("selectingThreads"));
  try {
    const threads = await invoke("list_threads_for_selection", {
      query: threadListView.getSearchQuery().trim(),
    });
    selectedThreadIds = new Set(threads.map((thread) => thread.id));
    renderCurrentThreadPage();
    renderSyncedStatus();
  } catch (error) {
    console.error(error);
    setStatus(t("readFailed", { error: String(error) }), "error");
  } finally {
    transferInProgress = false;
    updateTransferControls();
  }
}

function renderSyncedStatus() {
  if (!latestQuota || refreshing) return;
  const seconds = Math.max(0, Math.ceil((nextAutoRefreshAt - Date.now()) / 1_000));
  const plan = latestQuota.planType ? t("planPrefix", { plan: latestQuota.planType }) : "";
  setStatus(t("syncedStatus", { plan, seconds }));
}

function renderTheme() {
  const mode = theme.getMode();
  document.documentElement.dataset.theme = theme.getResolvedTheme();
  themeButton.title = `${t("theme")}：${t(`theme${mode[0].toUpperCase()}${mode.slice(1)}`)}`;
  themeButton.ariaLabel = themeButton.title;
  themeIcon.innerHTML = THEME_ICONS[mode];
}

/**
 * 托盘菜单由 Rust 原生层创建，不能直接复用网页 DOM 的翻译结果。
 * 仅传递已解析的语言代码，由原生层原地替换菜单文案与 tooltip。
 */
function syncNativeTrayLanguage() {
  invoke("set_tray_language", { language: i18n.getLanguage() })
    .catch((error) => console.error("同步托盘语言失败", error));
}

function setLanguageMenuOpen(open) {
  languageMenu.hidden = !open;
  languageButton.setAttribute("aria-expanded", String(open));
  if (!open) languageButton.blur();
}

/** 将语言控制器的当前状态投射到静态页面文案及相关辅助信息。 */
function applyLanguage() {
  document.documentElement.lang = i18n.getLocale();
  document.title = t("appTitle");
  syncNativeTrayLanguage();
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });

  minimizeButton.title = minimizeButton.ariaLabel = t("minimize");
  collapseButton.title = collapseButton.ariaLabel = t("collapse");
  refreshButton.title = refreshButton.ariaLabel = t("refresh");
  quitButton.title = quitButton.ariaLabel = t("quit");
  orb.title = t("orbTitle");
  orb.ariaLabel = expanded ? t("collapseOrb") : t("expandOrb");

  const languageMode = i18n.getMode();
  languageButton.title = languageButton.ariaLabel = `${t("language")}：${t(i18n.getLabelKey())}`;
  languageOptions.forEach((option) => {
    const configuredOption = LANGUAGE_OPTIONS.find((item) => item.value === option.dataset.language);
    option.textContent = t(configuredOption?.labelKey ?? "languageSystem");
    option.classList.toggle("is-active", option.dataset.language === languageMode);
  });

  dialogView.updateLanguage();
  trendView.render();
  renderTheme();
  renderCurrentThreadPage();
  updateTransferControls();
  if (latestQuota && !refreshing) quotaView.render(latestQuota);
  else if (!refreshing) setStatus(t("readingLocalData"));
  if (expanded) searchThreads(threadListView.getSearchQuery(), currentThreadPage);
}

function selectLanguage(nextLanguage) {
  i18n.setMode(nextLanguage);
  setLanguageMenuOpen(false);
  applyLanguage();
}

async function refreshQuota(forceTrendRefresh = false) {
  if (refreshing) return;
  refreshing = true;
  let refreshSucceeded = false;
  refreshButton.classList.add("is-loading");
  setStatus(t("readingLocalData"));
  try {
    latestQuota = await invoke("read_quota");
    nextAutoRefreshAt = Date.now() + AUTO_REFRESH_INTERVAL_MS;
    quotaView.render(latestQuota);
    refreshSucceeded = true;
    if (expanded) {
      await searchThreads(threadListView.getSearchQuery(), currentThreadPage);
      void refreshThreadTrends(forceTrendRefresh);
    }
  } catch (error) {
    console.error(error);
    quotaView.showReadFailure(Boolean(latestQuota));
    setStatus(t("readFailed", { error: String(error) }), "error");
  } finally {
    refreshing = false;
    refreshButton.classList.remove("is-loading");
    if (refreshSucceeded) renderSyncedStatus();
  }
}

async function refreshThreadTrends(forceRefresh = false) {
  const requestVersion = ++trendRequestVersion;
  trendView.showLoading();
  try {
    const data = await invoke("read_thread_trends", { forceRefresh });
    if (requestVersion !== trendRequestVersion) return;
    trendView.setData(data);
  } catch (error) {
    if (requestVersion !== trendRequestVersion) return;
    console.error(error);
    trendView.showError();
  }
}

async function searchThreads(query, page = 1) {
  if (!expanded) return;
  const requestVersion = ++searchRequestVersion;
  const keyword = query.trim();
  threadListView.setSearchResult(t("readingSearch"));
  try {
    const data = await invoke("search_threads", { query: keyword, page });
    if (requestVersion !== searchRequestVersion) return;
    currentThreadPage = data.page;
    currentPageThreads = data.threads;
    currentThreadEmptyMessage = keyword ? t("noMatches") : t("noThreads");
    renderCurrentThreadPage();
    threadListView.renderPagination(data.page, data.totalPages);
    threadListView.setSearchResult(keyword
      ? t("searchMatches", { total: data.total })
      : t("searchTotal", { total: data.total }));
    updateTransferControls();
  } catch (error) {
    if (requestVersion !== searchRequestVersion) return;
    console.error(error);
    currentPageThreads = [];
    currentThreadEmptyMessage = t("threadReadFailed");
    renderCurrentThreadPage();
    threadListView.hidePagination();
    threadListView.setSearchResult(String(error));
    updateTransferControls();
  }
}

async function openThread(thread) {
  dialogView.openLoading(thread);
  try {
    dialogView.showDetail(await invoke("read_thread", { threadId: thread.id }));
  } catch (error) {
    dialogView.showReadFailure(error);
  }
}

async function setExpanded(nextExpanded) {
  try {
    // 由原生层统一控制窗口尺寸和锚点，前端仅在成功后更新自身状态。
    await invoke("resize_float_window", { expanded: nextExpanded });
  } catch (error) {
    console.error("调整悬浮窗尺寸失败", error);
    setStatus(t("windowResizeFailed", { error: String(error) }), "error");
    return;
  }
  expanded = nextExpanded;
  if (!expanded) setLanguageMenuOpen(false);
  app.classList.toggle("is-compact", !expanded);
  app.classList.toggle("is-expanded", expanded);
  orb.ariaLabel = expanded ? t("collapseOrb") : t("expandOrb");
  if (expanded) {
    currentThreadPage = 1;
    await refreshQuota(true);
  }
}

function setupLanguageControls() {
  languageButton.addEventListener("click", (event) => {
    event.stopPropagation();
    setLanguageMenuOpen(languageMenu.hidden);
  });
  languageOptions.forEach((option) => {
    option.addEventListener("click", (event) => {
      event.stopPropagation();
      selectLanguage(option.dataset.language);
    });
  });
  // 不依赖 composedPath：Windows/macOS 的不同 WebView 都可稳定处理菜单外点击。
  window.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!languageMenu.hidden && !languageButton.contains(target) && !languageMenu.contains(target)) {
      setLanguageMenuOpen(false);
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !languageMenu.hidden) setLanguageMenuOpen(false);
  });
  window.addEventListener("blur", () => setLanguageMenuOpen(false));
  // 浏览器语言变化时，只在“跟随系统”模式下重新翻译页面。
  window.addEventListener("languagechange", () => {
    if (i18n.isSystemMode()) applyLanguage();
  });
}

function setupWindowDragging() {
  orb.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    suppressOrbClick = false;
    orbDragStart = { x: event.clientX, y: event.clientY };
  });
  orb.addEventListener("click", (event) => {
    if (suppressOrbClick) {
      event.preventDefault();
      suppressOrbClick = false;
      return;
    }
    setExpanded(!expanded);
  });
  panel.addEventListener("mousedown", (event) => {
    if (!expanded || event.button !== 0) return;
    suppressPanelClick = false;
    panelDragStart = { x: event.clientX, y: event.clientY };
  });
  window.addEventListener("mousemove", (event) => {
    for (const dragState of [
      { start: orbDragStart, clear: () => { orbDragStart = null; }, suppress: () => { suppressOrbClick = true; }, name: "额度球" },
      { start: panelDragStart, clear: () => { panelDragStart = null; }, suppress: () => { suppressPanelClick = true; }, name: "窗口" },
    ]) {
      if (!dragState.start) continue;
      const moved = Math.hypot(event.clientX - dragState.start.x, event.clientY - dragState.start.y);
      if (moved < DRAG_THRESHOLD_PX) continue;
      dragState.clear();
      dragState.suppress();
      // 达到阈值立即交给原生窗口拖动，避免长按等待造成卡顿感。
      invoke("start_dragging").catch((error) => console.error(`拖动${dragState.name}失败`, error));
    }
  });
  window.addEventListener("mouseup", () => {
    orbDragStart = null;
    panelDragStart = null;
  });
  panel.addEventListener("click", (event) => {
    if (!suppressPanelClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressPanelClick = false;
  }, true);
}

async function toggleWindowMaximized() {
  if (!expanded) return;
  try {
    await invoke("toggle_window_maximized");
  } catch (error) {
    console.error("切换窗口最大化失败", error);
    setStatus(t("windowMaximizeFailed", { error: String(error) }), "error");
  }
}

async function bootstrap() {
  applyLanguage();
  setupLanguageControls();
  themeButton.addEventListener("click", () => {
    theme.cycleMode();
    renderTheme();
  });
  theme.onSystemThemeChange(renderTheme);
  panelHeader.addEventListener("dblclick", (event) => {
    if (event.button !== 0) return;
    // 右侧图标组保留各自的双击/点击行为，标题栏其余区域遵循原生窗口的最大化习惯。
    if (event.target.closest(".header-actions")) return;
    event.preventDefault();
    void toggleWindowMaximized();
  });
  minimizeButton.addEventListener("click", () => invoke("hide_window"));
  collapseButton.addEventListener("click", () => setExpanded(false));
  refreshButton.addEventListener("click", () => refreshQuota(true));
  quitButton.addEventListener("click", () => invoke("quit_app"));
  importThreadsButton.addEventListener("click", () => importFileInput.click());
  exportThreadsButton.addEventListener("click", exportSelectedThreads);
  selectPageThreadsButton.addEventListener("click", () => {
    currentPageThreads.forEach((thread) => selectedThreadIds.add(thread.id));
    renderCurrentThreadPage();
    updateTransferControls();
  });
  selectAllThreadsButton.addEventListener("click", selectAllFilteredThreads);
  clearThreadSelectionButton.addEventListener("click", clearThreadSelection);
  importFileInput.addEventListener("change", async () => {
    const [file] = importFileInput.files;
    importFileInput.value = "";
    await importTransferFile(file);
  });
  setupWindowDragging();
  threadListView.onSearchInput(() => {
    window.clearTimeout(searchTimer);
    currentThreadPage = 1;
    clearThreadSelection();
    searchTimer = window.setTimeout(() => searchThreads(threadListView.getSearchQuery(), 1), 260);
  });
  threadListView.onPreviousPage(() => searchThreads(threadListView.getSearchQuery(), currentThreadPage - 1));
  threadListView.onNextPage(() => searchThreads(threadListView.getSearchQuery(), currentThreadPage + 1));

  await listen("quota://refresh", async () => {
    if (!expanded) await setExpanded(true);
    else await refreshQuota();
  });
  await setExpanded(false);
  await refreshQuota();
  window.setInterval(refreshQuota, AUTO_REFRESH_INTERVAL_MS);
  window.setInterval(renderSyncedStatus, 1_000);
}

bootstrap().catch((error) => {
  console.error("初始化悬浮窗失败", error);
  setStatus(t("initializationFailed", { error: String(error) }), "error");
});
