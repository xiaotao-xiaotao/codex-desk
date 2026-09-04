/**
 * 集中管理额度、趋势与 Token 用量的刷新状态。
 *
 * 入口文件只负责将页面事件接到控制器，避免刷新计时、失败退避和异步请求版本
 * 分散在窗口、会话等不同职责中，导致后续修改时遗漏边界状态。
 */
export function createRefreshController({
  invoke,
  quotaView,
  quotaAlerts,
  trendView,
  tokenUsageView,
  getExpanded,
  getSessionsExpanded,
  refreshThreadList,
  getTrendDays,
  setStatus,
  onRefreshingChange,
  statusElement,
  t,
  autoRefreshIntervalMs,
  maxConsecutiveFailures,
}) {
  let latestQuota = null;
  let refreshing = false;
  let nextAutoRefreshAt = Date.now() + autoRefreshIntervalMs;
  let consecutiveRefreshFailures = 0;
  let autoRefreshPaused = false;
  let trendRequestVersion = 0;
  let tokenUsageRequestVersion = 0;

  function renderSyncedStatus() {
    if (!latestQuota || refreshing || autoRefreshPaused) return;
    const seconds = Math.max(0, Math.ceil((nextAutoRefreshAt - Date.now()) / 1_000));
    const plan = latestQuota.planType ? t("planPrefix", { plan: latestQuota.planType }) : "";
    const countdown = document.createElement("span");
    countdown.className = "status-refresh-countdown";
    countdown.textContent = String(seconds);
    statusElement.replaceChildren(
      document.createTextNode(t("syncedStatusPrefix", { plan })),
      document.createTextNode(t("autoRefreshCountdownPrefix")),
      countdown,
      document.createTextNode(`${t("autoRefreshCountdownSuffix")}${t("syncedStatusSuffix")}`),
    );
    statusElement.dataset.kind = "normal";
  }

  async function refreshThreadTrends(forceRefresh = false) {
    const requestVersion = ++trendRequestVersion;
    trendView.showLoading();
    try {
      const data = await invoke("read_thread_trends", {
        forceRefresh,
        days: getTrendDays(),
      });
      if (requestVersion !== trendRequestVersion) return;
      trendView.setData(data);
    } catch (error) {
      if (requestVersion !== trendRequestVersion) return;
      console.error(error);
      trendView.showError();
    }
  }

  async function refreshTokenUsage() {
    const requestVersion = ++tokenUsageRequestVersion;
    tokenUsageView.showLoading();
    try {
      const data = await invoke("read_token_usage");
      if (requestVersion !== tokenUsageRequestVersion) return;
      tokenUsageView.setData(data);
    } catch (error) {
      if (requestVersion !== tokenUsageRequestVersion) return;
      console.error(error);
      tokenUsageView.showError();
    }
  }

  async function refreshQuota(forceTrendRefresh = false, automatic = false) {
    if (refreshing || (automatic && autoRefreshPaused)) return;
    refreshing = true;
    onRefreshingChange(true);
    let refreshSucceeded = false;
    setStatus(t("readingLocalData"));
    try {
      latestQuota = await invoke("read_quota");
      nextAutoRefreshAt = Date.now() + autoRefreshIntervalMs;
      consecutiveRefreshFailures = 0;
      autoRefreshPaused = false;
      quotaView.render(latestQuota);
      await quotaAlerts.notify(latestQuota);
      refreshSucceeded = true;
      if (getExpanded()) {
        if (getSessionsExpanded()) await refreshThreadList(forceTrendRefresh);
        // 趋势和本地 Token 读取属于低优先级任务，不能阻塞额度主卡的可用状态。
        void refreshThreadTrends(forceTrendRefresh);
        void refreshTokenUsage();
      }
    } catch (error) {
      console.error(error);
      quotaView.showReadFailure(Boolean(latestQuota));
      consecutiveRefreshFailures += 1;
      if (consecutiveRefreshFailures >= maxConsecutiveFailures) {
        autoRefreshPaused = true;
        // 熔断提示必须保留底层错误，否则第三次失败后无法区分超时、登录失效等原因。
        setStatus(t("autoRefreshPaused", {
          count: maxConsecutiveFailures,
          error: String(error),
        }), "error");
      } else {
        setStatus(t("readFailed", { error: String(error) }), "error");
      }
    } finally {
      refreshing = false;
      onRefreshingChange(false);
      if (refreshSucceeded) renderSyncedStatus();
    }
  }

  return {
    getLatestQuota: () => latestQuota,
    isRefreshing: () => refreshing,
    isAutoRefreshPaused: () => autoRefreshPaused,
    refreshQuota,
    refreshThreadTrends,
    refreshTokenUsage,
    renderSyncedStatus,
  };
}
