import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LANGUAGE_OPTIONS, createI18n } from "./i18n.js";
import { THEME_ICONS, createThemeController } from "./theme.js";
import { renderCloseIconButton } from "./utils/close-icon-button.js";
import { createDateFormatters } from "./utils/date-formatters.js";
import { createLoadingOverlay } from "./utils/loading-overlay.js";
import { renderRefreshIconButton, setRefreshIconButtonLoading } from "./utils/refresh-icon-button.js";
import { createQuotaAlertController } from "./features/quota-alert-controller.js";
import { createRefreshController } from "./features/refresh-controller.js";
import { createSettingsController } from "./features/settings-controller.js";
import { createAccountSwitchView } from "./views/account-switch-view.js";
import { createAccountQuotaMonitorView } from "./views/account-quota-monitor-view.js";
import { createQuotaView } from "./views/quota-view.js";
import { createSettingsDialogView } from "./views/settings-dialog-view.js";

const DRAG_THRESHOLD_PX = 4;

const app = document.querySelector("#app");
const orb = document.querySelector("#quota-orb");
const status = document.querySelector("#status");
const panel = document.querySelector(".panel");
const windowDragRegion = document.querySelector("#window-drag-region");
const languageSelect = document.querySelector("#language-select");
const themeButton = document.querySelector("#theme-button");
const themeIcon = document.querySelector("#theme-icon");
const alwaysOnTopButton = document.querySelector("#always-on-top-button");
const minimizeButton = document.querySelector("#minimize-button");
const collapseButton = document.querySelector("#collapse-button");
const refreshButton = document.querySelector("#refresh-button");
const quitButton = document.querySelector("#quit-button");
const dashboardLayout = document.querySelector(".dashboard-layout");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const sidebarMediaQuery = window.matchMedia("(max-width: 760px)");
// 首次打开默认收起侧栏，为账户额度留出更多空间；用户可手动展开。
let sidebarCollapsedPreference = true;
const dashboardNav = document.querySelector(".dashboard-nav");
const dashboardNavButtons = [...document.querySelectorAll("[data-dashboard-section]")];
const dashboardSections = {
  account: document.querySelector("#account-section"),
  accounts: document.querySelector("#accounts-section"),
};
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
const { formatQuotaWindow, formatResetAt, formatResetCountdown, formatResetTime } = createDateFormatters({
  getLocale: i18n.getLocale,
  t,
});
const quotaView = createQuotaView({ t, formatQuotaWindow });
let refreshController;
let autoRefreshTimer = null;
const settingsController = createSettingsController({
  invoke,
  onSettingsChanged: () => {
    accountSwitchView.updateLanguage();
    accountQuotaMonitorView?.updateLanguage();
    restartAutoRefreshTimer();
    renderQuotaAlertStatus();
  },
});
const quotaAlerts = createQuotaAlertController({
  t,
  formatResetTime,
  setStatus,
  getThresholds: () => settingsController.getSettings().quotaAlertThresholds,
  getAccountScope: () => {
    const current = refreshController?.getLatestQuota();
    return current ? `${current.accountId}:${current.email ?? current.id}` : "unknown";
  },
});
const accountQuotaMonitorView = createAccountQuotaMonitorView({
  t,
  invoke,
  formatQuotaWindow,
  formatResetAt,
  formatResetCountdown,
  getHideEmails: () => settingsController.getSettings().hideEmails,
  onToggleAlerts: () => toggleQuotaAlerts(),
  getAlertsEnabled: () => quotaAlerts.isEnabled(),
});
const accountSwitchView = createAccountSwitchView({
  t,
  invoke,
  getHideEmails: () => settingsController.getSettings().hideEmails,
  onOpen: () => setDashboardSection("accounts"),
  onBeforeSwitch: async () => {
    if (autoRefreshTimer !== null) window.clearTimeout(autoRefreshTimer);
    autoRefreshTimer = null;
    await refreshController.pauseForAccountChange();
  },
  onAccountsChanged: () => refreshController.refreshQuota(),
  onAfterSwitch: async ({ changed }) => {
    refreshController.resumeAfterAccountChange(changed);
    await refreshController.refreshQuota();
    restartAutoRefreshTimer();
  },
});
const settingsView = createSettingsDialogView({
  t,
  onReadStoragePath: () => invoke("read_settings_directory"),
  getSettings: settingsController.getSettings,
  onSave: async (settings) => {
    await refreshController.pauseForAccountChange();
    try { await settingsController.save(settings); }
    finally { refreshController.resumeAfterAccountChange(false); }
    void refreshController.refreshQuota();
  },
});
// 页面状态集中在入口层：视图模块保持无状态，方便被语言切换和刷新复用。
let expanded = true;
let alwaysOnTop = false;
let activeDashboardSection = "account";
let windowMaximized = false;
let orbDragStart = null;
let panelDragStart = null;
let suppressOrbClick = false;
let dashboardUnavailable = false;
let dashboardRetryStatus = null;

function setStatus(text, kind = "normal") {
  status.textContent = text;
  status.dataset.kind = kind;
}

function renderDashboardAvailability() {
  panel.classList.toggle("is-dashboard-unavailable", dashboardUnavailable);
  dashboardError.hidden = !dashboardUnavailable || activeDashboardSection === "accounts";
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
    await refreshController.refreshQuota({ manual: true });
  } finally {
    dashboardLoadingOverlay.hide();
  }
}

refreshController = createRefreshController({
  invoke,
  quotaView,
  quotaAlerts,
  // 新账户识别共用已有刷新周期，手动刷新也同步检查，不额外启动轮询。
  refreshAccount: () => accountSwitchView.checkCurrentAccount(),
  accountQuotaView: accountQuotaMonitorView,
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
  const date = syncedAt == null ? null : new Date(syncedAt);
  // 标签和时间一起隐藏，避免首次加载或切换账户时短暂显示“最近同步 --”。
  element.parentElement.hidden = date === null || Number.isNaN(date.getTime());
  if (element.parentElement.hidden) {
    element.textContent = "";
    element.removeAttribute("datetime");
    element.removeAttribute("title");
    return;
  }
  element.textContent = new Intl.DateTimeFormat(i18n.getLocale(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  element.dateTime = date.toISOString();
  element.title = new Intl.DateTimeFormat(i18n.getLocale(), { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
}

function renderQuotaAlertStatus() {
  accountQuotaMonitorView?.updateAlertStatus();
}

async function toggleQuotaAlerts() {
  const updated = await quotaAlerts.toggle();
  // 用户在高用量时开启提醒，应立即检查当前额度而非等待下一轮自动刷新。
  if (updated && quotaAlerts.isEnabled()) await quotaAlerts.notify(refreshController.getLatestQuota());
  renderQuotaAlertStatus();
}

/** 栏目切换只改变内容可见性，避免调整原生窗口尺寸。 */
function setDashboardSection(nextSection) {
  if (!Object.prototype.hasOwnProperty.call(dashboardSections, nextSection)) return;
  const changed = activeDashboardSection !== nextSection;
  activeDashboardSection = nextSection;
  dashboardError.hidden = !dashboardUnavailable || nextSection === "accounts";
  if (changed && nextSection === "accounts") {
    accountSwitchView.activate();
  }
  Object.entries(dashboardSections).forEach(([name, section]) => {
    section.hidden = name !== nextSection;
  });
  dashboardNavButtons.forEach((button) => {
    const selected = button.dataset.dashboardSection === nextSection;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
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
  dashboardNavButtons.forEach((button) => {
    button.addEventListener("click", () => {
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
    setDashboardSection(nextButton.dataset.dashboardSection);
  });
  setDashboardSection("account");
}

function renderTheme() {
  const mode = theme.getMode();
  document.documentElement.dataset.theme = theme.getResolvedTheme();
  themeButton.title = `${t("theme")}：${t(`theme${mode[0].toUpperCase()}${mode.slice(1)}`)}`;
  themeButton.ariaLabel = themeButton.title;
  document.querySelector("#theme-label").textContent = t(`theme${mode[0].toUpperCase()}${mode.slice(1)}`);
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
  accountSwitchView.updateLanguage();
  accountQuotaMonitorView.updateLanguage();
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

  renderDashboardAvailability();
  renderTheme();
  if (refreshController.getLatestQuota() && !refreshController.isRefreshing()) {
    quotaView.render(refreshController.getLatestQuota());
    refreshController.renderSyncedStatus();
  } else if (!refreshController.isRefreshing()) {
    setStatus("");
  }
  setDashboardSection(activeDashboardSection);
}

function selectLanguage(nextLanguage) {
  i18n.setMode(nextLanguage);
  applyLanguage();
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
  windowMaximized = expectedMaximized;
  try {
    const maximized = await invoke("toggle_window_maximized");
    windowMaximized = maximized;
  } catch (error) {
    windowMaximized = previousMaximized;
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
  setupLanguageControls();
  setupDashboardNavigation();
  themeButton.addEventListener("click", () => {
    theme.cycleMode();
    renderTheme();
  });
  windowDragRegion.addEventListener("dblclick", (event) => {
    if (event.button !== 0) return;
    // 双击最大化仅限空白拖动区，标题文字可用于双击选词与复制。
    event.preventDefault();
    void toggleWindowMaximized();
  });
  minimizeButton.addEventListener("click", () => invoke("hide_window"));
  alwaysOnTopButton.addEventListener("click", () => void toggleAlwaysOnTop());
  collapseButton.addEventListener("click", () => setExpanded(false));
  refreshButton.addEventListener("click", () => refreshController.refreshQuota({ manual: true }));
  dashboardRetry.addEventListener("click", () => void retryDashboard());
  quitButton.addEventListener("click", () => invoke("quit_app"));
  setupWindowDragging();
  await listen("quota://refresh", async () => {
    if (!expanded) await setExpanded(true);
    await refreshController.refreshQuota();
  });
  // 应用启动时直接展示看板，网络配置恢复完成后才发起查询。
  await setExpanded(true);
  window.setInterval(() => refreshController.renderSyncedStatus(), 1_000);
  try {
    await settingsController.initialize();
  } catch (error) {
    // 保留无效网络设置供用户修正，不静默替换用户选择的代理。
    console.error("应用网络设置失败", error);
    setStatus(t("settingsSaveFailed", { error: String(error) }), "error");
    accountQuotaMonitorView.setError(error);
    quotaView.showReadFailure(true);
    return;
  }
  // 首次启动需要立即读取；后续从悬浮球展开只恢复视图，刷新仍由定时器或用户操作触发。
  await refreshController.refreshQuota({ showLoadingStatus: false });
  restartAutoRefreshTimer();
}

bootstrap().catch((error) => {
  console.error("初始化悬浮窗失败", error);
  setStatus(t("initializationFailed", { error: String(error) }), "error");
});
