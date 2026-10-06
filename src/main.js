import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LANGUAGE_OPTIONS, createI18n } from "./i18n.js";
import { THEME_ICONS, createThemeController } from "./theme.js";
import { copyMessageContent, copyText } from "./utils/clipboard.js";
import { renderCloseIconButton } from "./utils/close-icon-button.js";
import { createDateFormatters } from "./utils/date-formatters.js";
import { createLoadingOverlay } from "./utils/loading-overlay.js";
import { renderRefreshIconButton, setRefreshIconButtonLoading } from "./utils/refresh-icon-button.js";
import { createQuotaAlertController } from "./features/quota-alert-controller.js";
import { createRefreshController } from "./features/refresh-controller.js";
import { createSettingsController } from "./features/settings-controller.js";
import { createAccountOverviewView } from "./views/account-dialog-view.js";
import { createQuotaView } from "./views/quota-view.js";
import { createSettingsDialogView } from "./views/settings-dialog-view.js";
import { createThreadDialogView } from "./views/thread-dialog-view.js";
import { createThreadListView } from "./views/thread-list-view.js";
import { createThreadTrendView } from "./views/thread-trend-view.js";
import { createTokenUsageTrendView } from "./views/token-usage-trend-view.js";
import { createUpdateBannerView } from "./views/update-banner-view.js";
import { createWordCloudView } from "./views/word-cloud-view.js";

const DRAG_THRESHOLD_PX = 4;
const AUTO_DISMISS_DURATION_MS = 4_000;
const THREAD_PAGE_SIZE = 10;

const app = document.querySelector("#app");
const orb = document.querySelector("#quota-orb");
const status = document.querySelector("#status");
const panel = document.querySelector(".panel");
const appVersionElement = document.querySelector("#app-version");
const windowDragRegion = document.querySelector("#window-drag-region");
const languageSelect = document.querySelector("#language-select");
const themeButton = document.querySelector("#theme-button");
const themeIcon = document.querySelector("#theme-icon");
const alwaysOnTopButton = document.querySelector("#always-on-top-button");
const minimizeButton = document.querySelector("#minimize-button");
const collapseButton = document.querySelector("#collapse-button");
const updateCheckButton = document.querySelector("#update-check-button");
const refreshButton = document.querySelector("#refresh-button");
const quitButton = document.querySelector("#quit-button");
const importThreadsButton = document.querySelector("#import-threads");
const exportThreadsButton = document.querySelector("#export-threads");
const importFileInput = document.querySelector("#import-file-input");
const threadListElement = document.querySelector("#thread-list");
const threadSelectionBar = document.querySelector("#thread-selection-bar");
const selectPageThreadsButton = document.querySelector("#select-page-threads");
const selectAllThreadsButton = document.querySelector("#select-all-threads");
const clearThreadSelectionButton = document.querySelector("#clear-thread-selection");
const selectedThreadCount = document.querySelector("#selected-thread-count");
const dashboardLayout = document.querySelector(".dashboard-layout");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const sidebarMediaQuery = window.matchMedia("(max-width: 760px)");
// 窄屏默认收起；手动切换后尊重用户选择，避免尺寸变化反复覆盖状态。
let sidebarCollapsedPreference = null;
const dashboardNav = document.querySelector(".dashboard-nav");
const dashboardNavButtons = [...document.querySelectorAll("[data-dashboard-section]")];
const dashboardSections = {
  account: document.querySelector("#account-section"),
  insights: document.querySelector("#insights-section"),
  topics: document.querySelector("#topics-section"),
  sessions: document.querySelector("#sessions-section"),
};
const quotaAlertStatus = document.querySelector("#quota-alert-status");
const quotaAlertToggle = document.querySelector("#quota-alert-toggle");
const dashboardError = document.querySelector("#dashboard-error");
const dashboardErrorTitle = document.querySelector("#dashboard-error-title");
const dashboardErrorDescription = document.querySelector("#dashboard-error-description");
const dashboardRetry = document.querySelector("#dashboard-retry");

const i18n = createI18n();
const theme = createThemeController();
const { t } = i18n;
const dashboardLoadingOverlay = createLoadingOverlay({
  container: panel,
  className: "dashboard-loading-overlay",
});
const { formatQuotaWindow, formatResetAt, formatResetCountdown, formatResetTime, formatUpdated } = createDateFormatters({
  getLocale: i18n.getLocale,
  t,
});
const copyToClipboard = (text) => copyText(text, t("clipboardDenied"));
const copyMessageToClipboard = (message) => copyMessageContent(message, t("clipboardDenied"));
const quotaView = createQuotaView({ t, formatQuotaWindow, formatResetAt, formatResetCountdown });
let refreshController;
let autoRefreshTimer = null;
const settingsController = createSettingsController({
  invoke,
  onSettingsChanged: () => {
    restartAutoRefreshTimer();
    renderQuotaAlertStatus();
  },
});
const quotaAlerts = createQuotaAlertController({
  t,
  formatResetTime,
  setStatus,
  getThresholds: () => settingsController.getSettings().quotaAlertThresholds,
});
const accountView = createAccountOverviewView({ t, invoke });
const updateView = createUpdateBannerView({
  t,
  invoke,
  triggerButton: updateCheckButton,
  getLanguage: i18n.getLanguage,
  getCurrentVersion: getVersion,
  autoDismissDurationMs: AUTO_DISMISS_DURATION_MS,
});
const dialogView = createThreadDialogView({
  t,
  formatUpdated,
  copyText: copyToClipboard,
  copyMessage: copyMessageToClipboard,
  onRefreshThread: (threadId) => invoke("read_thread", { threadId }),
  onLoadOlderTurns: (threadId, cursor) => invoke("read_thread_page", { threadId, cursor }),
  onReadFullOverview: (threadId) => invoke("read_thread_full_overview", { threadId }),
  onReadLocalFile: (path) => invoke("read_local_text_preview", { path }),
  onExportThread: exportThreadFromDialog,
  onOpen: () => {
    Object.values(dashboardSections).forEach((section) => { section.hidden = true; });
  },
  onClose: (restoreHistory) => {
    threadReadVersion += 1;
    renderCurrentThreadPage();
    if (restoreHistory) setDashboardSection(activeDashboardSection);
  },
});
const settingsView = createSettingsDialogView({
  t,
  getSettings: settingsController.getSettings,
  onBrowseCli: () => invoke("choose_cli_path"),
  onSave: async (settings) => {
    const version = await settingsController.save(settings);
    void refreshController.refreshQuota(true);
    return version;
  },
});
const trendView = createThreadTrendView({
  t,
  onRangeChange: (days) => {
    tokenUsageView.setRange(days);
    void refreshController?.refreshThreadTrends();
  },
});
const tokenUsageView = createTokenUsageTrendView({ t });
const wordCloudView = createWordCloudView({ t, onSelectTopic: selectTopic });
const threadListView = createThreadListView({
  t,
  formatUpdated,
  copyText: copyToClipboard,
  onOpenThread: openThread,
  onSelectionChange: setThreadSelected,
  onTogglePinned: toggleThreadPinned,
});

// 页面状态集中在入口层：视图模块保持无状态，方便被语言切换和刷新复用。
let expanded = true;
let alwaysOnTop = false;
let activeDashboardSection = "account";
let threadReadVersion = 0;
let lastOpenedThreadId = null;
let windowMaximized = false;
let topicFilter = null;
let topicRequestVersion = 0;
let topicDays = 7;
const topicsRange = document.querySelector("#topics-range");
let searchTimer = null;
let searchRequestVersion = 0;
let currentThreadPage = 1;
let currentPageThreads = [];
let currentThreadEmptyMessage = "";
let selectedThreadIds = new Set();
let transferInProgress = false;
let orbDragStart = null;
let panelDragStart = null;
let suppressOrbClick = false;
let dashboardUnavailable = false;
let dashboardRetryStatus = null;
let currentAppVersion = "";

function setStatus(text, kind = "normal") {
  status.textContent = text;
  status.dataset.kind = kind;
}

function renderAppVersion() {
  appVersionElement.hidden = !currentAppVersion;
  if (!currentAppVersion) return;
  appVersionElement.textContent = `v${currentAppVersion}`;
  appVersionElement.title = t("currentVersionLabel", { version: currentAppVersion });
}

async function loadAppVersion() {
  try {
    currentAppVersion = await getVersion();
    renderAppVersion();
  } catch (error) {
    console.warn("读取 Codex Desk 版本失败", error);
  }
}

function renderDashboardAvailability() {
  panel.classList.toggle("is-dashboard-unavailable", dashboardUnavailable);
  dashboardError.hidden = !dashboardUnavailable;
  dashboardErrorTitle.textContent = t("dashboardUnavailableTitle");
  const details = [t("dashboardUnavailableDescription")];
  if (dashboardRetryStatus?.error) {
    details.push(t("dashboardUnavailableReason", { error: dashboardRetryStatus.error }));
  }
  if (dashboardRetryStatus) {
    details.push(t("dashboardUnavailableRetry", dashboardRetryStatus));
  }
  dashboardErrorDescription.textContent = details.join("\n");
  dashboardRetry.textContent = t("dashboardRetry");
  if (!dashboardUnavailable) setDashboardSection(activeDashboardSection);
}

async function retryDashboard() {
  dashboardLoadingOverlay.show(t("readingLocalData"));
  try {
    await refreshController.refreshQuota(true);
  } finally {
    dashboardLoadingOverlay.hide();
  }
}

refreshController = createRefreshController({
  invoke,
  quotaView,
  quotaAlerts,
  trendView,
  tokenUsageView,
  refreshTopics,
  getExpanded: () => expanded,
  getSessionsExpanded: () => activeDashboardSection === "sessions",
  refreshThreadList: (forceRefresh) => searchThreads(
    threadListView.getSearchQuery(),
    currentThreadPage,
    forceRefresh,
  ),
  refreshAccount: () => accountView.refresh(),
  getTrendDays: () => Number(document.querySelector("#insights-range").value),
  setStatus,
  onRefreshingChange: (isRefreshing) => {
    setRefreshIconButtonLoading(refreshButton, isRefreshing);
    if (!isRefreshing) renderAccountSyncTime();
  },
  onAvailabilityChange: (available) => {
    dashboardUnavailable = !available;
    renderDashboardAvailability();
  },
  statusElement: status,
  t,
  getAutoRefreshIntervalMs: settingsController.getRefreshIntervalMs,
  onAutoRefreshScheduleChange: scheduleNextAutoRefresh,
  onRetryStatusChange: (retryStatus) => {
    dashboardRetryStatus = retryStatus;
    if (dashboardUnavailable) renderDashboardAvailability();
  },
});

function renderAccountSyncTime() {
  const element = document.querySelector("#account-last-synced");
  const syncedAt = refreshController?.getLatestQuotaSyncedAt();
  if (syncedAt == null) {
    element.textContent = "--";
    element.removeAttribute("datetime");
    element.removeAttribute("title");
    return;
  }
  const date = new Date(syncedAt);
  element.textContent = new Intl.DateTimeFormat(i18n.getLocale(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  element.dateTime = date.toISOString();
  element.title = new Intl.DateTimeFormat(i18n.getLocale(), { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
}

function renderQuotaAlertStatus() {
  const enabled = quotaAlerts.isEnabled();
  const thresholds = quotaAlerts.getThresholds().map((threshold) => `${threshold}%`).join("/");
  quotaAlertStatus.textContent = t(enabled ? "quotaAlertStatusEnabled" : "quotaAlertStatusDisabled", { thresholds });
  quotaAlertStatus.classList.toggle("is-enabled", enabled);
  quotaAlertStatus.title = t("quotaAlerts");
  quotaAlertToggle.textContent = t(enabled ? "quotaAlertToggleDisable" : "quotaAlertToggleEnable");
  quotaAlertToggle.classList.toggle("is-enabled", enabled);
  quotaAlertToggle.ariaLabel = t("quotaAlerts");
}

async function toggleQuotaAlerts() {
  const updated = await quotaAlerts.toggle();
  // 用户在高用量时开启提醒，应立即检查当前额度而非等待下一轮自动刷新。
  if (updated && quotaAlerts.isEnabled()) await quotaAlerts.notify(refreshController.getLatestQuota());
  renderQuotaAlertStatus();
}

function renderCurrentThreadPage() {
  threadListView.renderThreads(currentPageThreads, currentThreadEmptyMessage, selectedThreadIds, lastOpenedThreadId);
}

/** 栏目切换只改变内容可见性，保留筛选和选择状态，并避免调整原生窗口尺寸。 */
function setDashboardSection(nextSection) {
  if (!Object.prototype.hasOwnProperty.call(dashboardSections, nextSection)) return;
  const changed = activeDashboardSection !== nextSection;
  // 侧栏收起和自动同步会重复选择当前栏目，不应打断正在阅读的详情。
  if (dialogView.isOpen()) {
    if (!changed) return;
    dialogView.close(false);
  }
  activeDashboardSection = nextSection;
  // 离开历史页后使未完成的搜索失效，避免旧请求覆盖下一次进入时的结果。
  if (changed) searchRequestVersion += 1;
  Object.entries(dashboardSections).forEach(([name, section]) => {
    section.hidden = name !== nextSection;
  });
  dashboardNavButtons.forEach((button) => {
    const selected = button.dataset.dashboardSection === nextSection;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  window.requestAnimationFrame(() => {
    // 隐藏栏目没有有效尺寸；恢复可见后再重绘，保证 SVG 与 Canvas 使用实际容器大小。
    if (activeDashboardSection === "insights") {
      trendView.render();
      tokenUsageView.render();
    } else if (activeDashboardSection === "topics") {
      wordCloudView.render();
    } else if (activeDashboardSection === "sessions" && !dashboardUnavailable) {
      if (changed) {
        void searchThreads(threadListView.getSearchQuery(), currentThreadPage);
      }
    }
  });
}

function renderSidebar() {
  const collapsed = sidebarCollapsedPreference ?? sidebarMediaQuery.matches;
  dashboardLayout.classList.toggle("is-sidebar-collapsed", collapsed);
  sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  sidebarToggle.title = sidebarToggle.ariaLabel = t(collapsed ? "expandSidebar" : "collapseSidebar");
}

function setupDashboardNavigation() {
  sidebarToggle.addEventListener("click", () => {
    sidebarCollapsedPreference = !dashboardLayout.classList.contains("is-sidebar-collapsed");
    renderSidebar();
    setDashboardSection(activeDashboardSection);
  });
  sidebarMediaQuery.addEventListener("change", () => {
    renderSidebar();
    setDashboardSection(activeDashboardSection);
  });
  renderSidebar();
  threadListElement.style.setProperty("--thread-row-count", String(THREAD_PAGE_SIZE));
  dashboardNavButtons.forEach((button) => {
    button.addEventListener("click", () => {
      dialogView.close(false);
      setDashboardSection(button.dataset.dashboardSection);
    });
  });
  dashboardNav.addEventListener("keydown", (event) => {
    const currentIndex = dashboardNavButtons.indexOf(event.target);
    if (currentIndex < 0) return;
    let nextIndex = currentIndex;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % dashboardNavButtons.length;
    else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + dashboardNavButtons.length) % dashboardNavButtons.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = dashboardNavButtons.length - 1;
    else return;
    event.preventDefault();
    const nextButton = dashboardNavButtons[nextIndex];
    nextButton.focus();
    dialogView.close(false);
    setDashboardSection(nextButton.dataset.dashboardSection);
  });
  setDashboardSection("account");
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

async function exportThreadsToFile(threadIds) {
  setStatus(t("selectingExportLocation"));
  const outputPath = await invoke("choose_export_path", {
    defaultFileName: createExportFileName(),
    filterName: t("exportFileDialogFilter"),
  });
  if (!outputPath) {
    refreshController.renderSyncedStatus();
    return null;
  }
  setStatus(t("preparingExport", { count: threadIds.length }));
  const result = await invoke("export_threads", {
    threadIds,
    outputPath,
  });
  setStatus(t("exportCompleted", {
    count: result.exported,
    failed: transferFailureSuffix(result.failures),
  }));
  return result;
}

async function exportThreadFromDialog(threadId) {
  await exportThreadsToFile([threadId]);
}

async function exportSelectedThreads() {
  if (selectedThreadIds.size === 0) {
    setStatus(t("noThreadsSelected"), "error");
    return;
  }
  transferInProgress = true;
  updateTransferControls();
  try {
    const result = await exportThreadsToFile([...selectedThreadIds]);
    if (!result) return;
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
      refreshController.renderSyncedStatus();
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
      void refreshController.refreshThreadTrends(true);
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
    const threads = topicFilter ? topicFilter.threads : await invoke("list_threads_for_selection", {
      query: threadListView.getSearchQuery().trim(),
    });
    selectedThreadIds = new Set(threads.map((thread) => thread.id));
    renderCurrentThreadPage();
    refreshController.renderSyncedStatus();
  } catch (error) {
    console.error(error);
    setStatus(t("readFailed", { error: String(error) }), "error");
  } finally {
    transferInProgress = false;
    updateTransferControls();
  }
}

function renderTheme() {
  const mode = theme.getMode();
  document.documentElement.dataset.theme = theme.getResolvedTheme();
  themeButton.title = `${t("theme")}：${t(`theme${mode[0].toUpperCase()}${mode.slice(1)}`)}`;
  themeButton.ariaLabel = themeButton.title;
  document.querySelector("#theme-label").textContent = t(`theme${mode[0].toUpperCase()}${mode.slice(1)}`);
  themeIcon.innerHTML = THEME_ICONS[mode];
  // 词云颜色由当前主题计算，主题切换后按已有数据重新排版并更新颜色。
  wordCloudView.render();
}

/**
 * 托盘菜单由 Rust 原生层创建，不能直接复用网页 DOM 的翻译结果。
 * 仅传递已解析的语言代码，由原生层原地替换菜单文案与 tooltip。
 */
function syncNativeTrayLanguage() {
  invoke("set_tray_language", { language: i18n.getLanguage() })
    .catch((error) => console.error("同步托盘语言失败", error));
}

/** 将语言控制器的当前状态投射到静态页面文案及相关辅助信息。 */
function applyLanguage() {
  document.documentElement.lang = i18n.getLocale();
  document.title = t("appTitle");
  renderSidebar();
  syncNativeTrayLanguage();
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nLabel));
  });
  dashboardNavButtons.forEach((button) => {
    button.title = t(button.querySelector("[data-i18n]").dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });

  minimizeButton.title = minimizeButton.ariaLabel = t("minimize");
  alwaysOnTopButton.title = alwaysOnTopButton.ariaLabel = t(alwaysOnTop ? "unpinWindow" : "pinWindow");
  collapseButton.title = collapseButton.ariaLabel = t("collapse");
  renderRefreshIconButton(refreshButton, { label: t("refresh") });
  renderCloseIconButton(quitButton, { label: t("quit") });
  settingsView.updateLanguage();
  accountView.updateLanguage();
  updateView.updateLanguage();
  renderAppVersion();
  if (dashboardLoadingOverlay.isVisible()) {
    dashboardLoadingOverlay.setMessage(t("readingLocalData"));
  }
  renderQuotaAlertStatus();
  orb.title = t("orbTitle");
  renderAccountSyncTime();
  orb.ariaLabel = expanded ? t("collapseOrb") : t("expandOrb");

  const languageMode = i18n.getMode();
  languageSelect.value = languageMode;
  languageSelect.title = languageSelect.ariaLabel = `${t("language")}：${t(i18n.getLabelKey())}`;
  for (const option of languageSelect.options) {
    const configuredOption = LANGUAGE_OPTIONS.find((item) => item.value === option.value);
    option.textContent = t(configuredOption?.labelKey ?? "languageSystem");
  }

  dialogView.updateLanguage();
  renderDashboardAvailability();
  trendView.render();
  tokenUsageView.render();
  renderTheme();
  renderTopicsControls();
  renderCurrentThreadPage();
  updateTransferControls();
  if (refreshController.getLatestQuota() && !refreshController.isRefreshing()) {
    quotaView.render(refreshController.getLatestQuota());
    refreshController.renderSyncedStatus();
  } else if (!refreshController.isRefreshing()) {
    setStatus(t("readingLocalData"));
  }
  setDashboardSection(activeDashboardSection);
  if (expanded && activeDashboardSection === "sessions") void searchThreads(threadListView.getSearchQuery(), currentThreadPage);
}

function selectLanguage(nextLanguage) {
  i18n.setMode(nextLanguage);
  applyLanguage();
}

function renderTopicsControls() {
  topicsRange.replaceChildren(...[3, 7, 30].map((days) => {
    const option = document.createElement("option");
    option.value = days;
    option.textContent = t(`trendRange${days}`);
    return option;
  }));
  topicsRange.value = topicDays;
  topicsRange.ariaLabel = t("conversationTopics");
  const bar = document.querySelector("#topic-filter-bar");
  bar.hidden = !topicFilter;
  document.querySelector("#topic-filter-summary").textContent = topicFilter ? t("topicFilterSummary", {
    word: topicFilter.name, days: topicFilter.days, occurrences: topicFilter.value, count: topicFilter.threads.length,
  }) : "";
}

async function refreshTopics(forceRefresh = false) {
  const requestVersion = ++topicRequestVersion;
  const days = topicDays;
  wordCloudView.showLoading();
  try {
    const data = await invoke("read_thread_trends", { days, forceRefresh });
    if (requestVersion !== topicRequestVersion) return;
    wordCloudView.setData(data.wordCloud, days);
  } catch (error) {
    if (requestVersion !== topicRequestVersion) return;
    console.error("读取会话主题失败", error);
    wordCloudView.showError();
  }
}

function selectTopic(topic) {
  window.clearTimeout(searchTimer);
  searchRequestVersion += 1;
  topicFilter = { ...topic, threads: topic.threads.map((thread) => ({ ...thread })) };
  currentThreadPage = 1;
  selectedThreadIds.clear();
  document.querySelector("#thread-search").value = topic.name;
  renderTopicsControls();
  setDashboardSection("sessions");
}

topicsRange.addEventListener("change", () => {
  topicDays = Number(topicsRange.value);
  wordCloudView.setRange(topicDays);
  void refreshTopics();
});

async function searchThreads(query, page = 1, forceRefresh = false) {
  if (!expanded || activeDashboardSection !== "sessions" || dashboardUnavailable) return;
  const requestVersion = ++searchRequestVersion;
  const keyword = query.trim();
  threadListView.setSearchResult(t("readingSearch"));
  try {
    // 主题结果来自词云快照，避免标题搜索和统计分词使用不同口径。
    const total = topicFilter?.threads.length ?? 0;
    const snapshotPage = Math.max(1, Math.min(page, Math.max(1, Math.ceil(total / THREAD_PAGE_SIZE))));
    const data = topicFilter ? {
      threads: topicFilter.threads.slice((snapshotPage - 1) * THREAD_PAGE_SIZE, snapshotPage * THREAD_PAGE_SIZE),
      page: snapshotPage, total, totalPages: Math.ceil(total / THREAD_PAGE_SIZE),
    } : await invoke("search_threads", { query: keyword, page, pageSize: THREAD_PAGE_SIZE, forceRefresh });
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
  lastOpenedThreadId = thread.id;
  const version = ++threadReadVersion;
  dialogView.openLoading(thread);
  try {
    const detail = await invoke("read_thread", { threadId: thread.id });
    if (version === threadReadVersion) dialogView.showDetail(detail);
  } catch (error) {
    if (version === threadReadVersion) dialogView.showReadFailure(error);
  }
}

async function setExpanded(nextExpanded) {
  // 收起时必须先在 WebView 隐藏完整面板，再让原生窗口缩为 56px。
  // 否则 Windows 会先裁切旧面板的一帧，产生“Codex”标题残影。
  if (!nextExpanded) {
    app.classList.add("is-collapsing");
    app.classList.remove("is-expanded");
    // 将隐藏状态提交给渲染队列后再发起原生缩窗，避免尺寸变化抢在样式更新之前。
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  }

  try {
    // 原生层统一控制窗口尺寸和锚点；展开时保持先扩窗、后显示面板的原有顺序。
    await invoke("resize_float_window", {
      expanded: nextExpanded,
      // 导航栏目共用紧凑窗口，重新展开也不因停留在历史页而增高。
      sessionsExpanded: false,
    });
  } catch (error) {
    if (!nextExpanded) {
      // 原生层调整失败时还原面板，不能让用户停留在一个透明的大窗口中。
      app.classList.remove("is-collapsing", "is-compact");
      app.classList.add("is-expanded");
    }
    console.error("调整悬浮窗尺寸失败", error);
    setStatus(t("windowResizeFailed", { error: String(error) }), "error");
    return;
  }
  expanded = nextExpanded;
  if (!expanded && windowMaximized) {
    windowMaximized = false;
  }
  app.classList.toggle("is-compact", !expanded);
  app.classList.toggle("is-expanded", expanded);
  app.classList.remove("is-collapsing");
  orb.ariaLabel = expanded ? t("collapseOrb") : t("expandOrb");
}

async function toggleThreadPinned(thread) {
  try {
    await invoke("set_thread_pinned", {
      threadId: thread.id,
      isPinned: !thread.isPinned,
    });
    const wasPinned = thread.isPinned;
    if (topicFilter) thread.isPinned = !wasPinned;
    await searchThreads(threadListView.getSearchQuery(), currentThreadPage, true);
    setStatus(t(wasPinned ? "threadUnpinned" : "threadPinned"));
  } catch (error) {
    setStatus(t("readFailed", { error: String(error) }), "error");
  }
}

function setupLanguageControls() {
  languageSelect.addEventListener("change", () => selectLanguage(languageSelect.value));
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
  windowDragRegion.addEventListener("mousedown", (event) => {
    if (!expanded || event.button !== 0) return;
    panelDragStart = { x: event.clientX, y: event.clientY };
  });
  window.addEventListener("mousemove", (event) => {
    for (const dragState of [
      { start: orbDragStart, clear: () => { orbDragStart = null; }, suppress: () => { suppressOrbClick = true; }, name: "额度球" },
      { start: panelDragStart, clear: () => { panelDragStart = null; }, suppress: () => {}, name: "窗口" },
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
}

async function toggleWindowMaximized() {
  if (!expanded) return;
  const previousMaximized = windowMaximized;
  const expectedMaximized = !previousMaximized;
  wordCloudView.setWindowResizeTransitioning(true);
  // 原生窗口动画期间暂停词云排版，完成后按最终尺寸重绘一次。
  windowMaximized = expectedMaximized;
  try {
    const maximized = await invoke("toggle_window_maximized");
    windowMaximized = maximized;
    wordCloudView.setWindowResizeTransitioning(false);
  } catch (error) {
    windowMaximized = previousMaximized;
    wordCloudView.setWindowResizeTransitioning(false);
    console.error("切换窗口最大化失败", error);
    setStatus(t("windowMaximizeFailed", { error: String(error) }), "error");
  }
}

function scheduleNextAutoRefresh() {
  if (!refreshController) return;
  if (autoRefreshTimer !== null) window.clearTimeout(autoRefreshTimer);
  const delayMs = refreshController.getNextAutoRefreshDelayMs();
  autoRefreshTimer = window.setTimeout(() => {
    autoRefreshTimer = null;
    void refreshController.refreshQuota();
  }, delayMs);
}

async function toggleAlwaysOnTop() {
  const nextAlwaysOnTop = !alwaysOnTop;
  try {
    // 面板和悬浮球共用同一个原生窗口，因此设置一次即可在两种形态间保持置顶状态。
    await invoke("set_window_always_on_top", { alwaysOnTop: nextAlwaysOnTop });
    alwaysOnTop = nextAlwaysOnTop;
    alwaysOnTopButton.classList.toggle("is-active", alwaysOnTop);
    alwaysOnTopButton.setAttribute("aria-pressed", String(alwaysOnTop));
    alwaysOnTopButton.title = alwaysOnTopButton.ariaLabel = t(alwaysOnTop ? "unpinWindow" : "pinWindow");
  } catch (error) {
    console.error("切换窗口置顶失败", error);
    setStatus(t("windowAlwaysOnTopFailed", { error: String(error) }), "error");
  }
}

function restartAutoRefreshTimer() {
  if (autoRefreshTimer !== null) window.clearTimeout(autoRefreshTimer);
  autoRefreshTimer = null;
  refreshController?.resetAutoRefreshSchedule();
  scheduleNextAutoRefresh();
}

async function bootstrap() {
  applyLanguage();
  void loadAppVersion();
  setupLanguageControls();
  setupDashboardNavigation();
  themeButton.addEventListener("click", () => {
    theme.cycleMode();
    renderTheme();
  });
  theme.onSystemThemeChange(renderTheme);
  windowDragRegion.addEventListener("dblclick", (event) => {
    if (event.button !== 0) return;
    // 双击最大化仅限空白拖动区，标题文字可用于双击选词与复制。
    event.preventDefault();
    void toggleWindowMaximized();
  });
  minimizeButton.addEventListener("click", () => invoke("hide_window"));
  alwaysOnTopButton.addEventListener("click", () => void toggleAlwaysOnTop());
  collapseButton.addEventListener("click", () => setExpanded(false));
  refreshButton.addEventListener("click", () => refreshController.refreshQuota(true));
  dashboardRetry.addEventListener("click", () => void retryDashboard());
  quotaAlertToggle.addEventListener("click", () => void toggleQuotaAlerts());
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
    searchRequestVersion += 1;
    topicFilter = null;
    renderTopicsControls();
    currentThreadPage = 1;
    clearThreadSelection();
    searchTimer = window.setTimeout(() => searchThreads(threadListView.getSearchQuery(), 1), 260);
  });
  threadListView.onPreviousPage(() => searchThreads(threadListView.getSearchQuery(), currentThreadPage - 1));
  threadListView.onNextPage(() => searchThreads(threadListView.getSearchQuery(), currentThreadPage + 1));

  await listen("quota://refresh", async () => {
    if (!expanded) await setExpanded(true);
    await refreshController.refreshQuota();
  });
  // 应用启动时直接展示看板；用户可通过标题栏的收起按钮主动切换为悬浮球。
  try {
    await settingsController.initialize();
  } catch (error) {
    // 自定义路径失效时保留设置供用户修正，同时继续尝试系统 PATH。
    console.error("应用 Codex CLI 路径失败", error);
    setStatus(t("settingsSaveFailed", { error: String(error) }), "error");
  }
  await setExpanded(true);
  // 首次启动需要立即读取；后续从悬浮球展开只恢复视图，刷新仍由定时器或用户操作触发。
  await refreshController.refreshQuota(true);
  restartAutoRefreshTimer();
  window.setInterval(() => refreshController.renderSyncedStatus(), 1_000);
}

bootstrap().catch((error) => {
  console.error("初始化悬浮窗失败", error);
  setStatus(t("initializationFailed", { error: String(error) }), "error");
});
