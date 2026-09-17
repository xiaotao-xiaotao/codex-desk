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
  wordCloudView,
  getExpanded,
  getSessionsExpanded,
  refreshThreadList,
  getTrendDays,
  setStatus,
  onRefreshingChange,
  onAvailabilityChange,
  statusElement,
  t,
  getAutoRefreshIntervalMs,
  onAutoRefreshScheduleChange,
  onRetryStatusChange,
}) {
  // 退避持续进行但设置上限，避免长期离线时把下一次重试推到不合理的未来。
  const MAX_AUTO_REFRESH_BACKOFF_MS = 24 * 60 * 60 * 1_000;
  // 启动时 CLI 的认证与 app-server 可能仍在初始化，先快速重连，避免瞬时失败直接占满页面。
  const INITIAL_QUOTA_RETRY_DELAYS_MS = [500, 1_500];
  let latestQuota = null;
  let refreshing = false;
  let nextAutoRefreshAt = Date.now() + getAutoRefreshIntervalMs();
  let consecutiveRefreshFailures = 0;
  let initialQuotaRead = true;
  let latestRefreshError = "";
  let trendRequestVersion = 0;
  let tokenUsageRequestVersion = 0;

  function scheduleNextAutoRefresh(delayMs) {
    nextAutoRefreshAt = Date.now() + delayMs;
    onAutoRefreshScheduleChange?.();
  }

  function retryDelayMs() {
    const baseDelay = Math.max(1_000, Number(getAutoRefreshIntervalMs()) || 60_000);
    return Math.min(baseDelay * (2 ** consecutiveRefreshFailures), MAX_AUTO_REFRESH_BACKOFF_MS);
  }

  function wait(delayMs) {
    return new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }

  async function readQuotaWithStartupRetry() {
    const retryDelays = initialQuotaRead ? INITIAL_QUOTA_RETRY_DELAYS_MS : [];
    initialQuotaRead = false;
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await invoke("read_quota");
      } catch (error) {
        if (attempt >= retryDelays.length) throw error;
        await wait(retryDelays[attempt]);
      }
    }
  }

  function renderSyncedStatus() {
    if (refreshing) return;
    const seconds = Math.max(0, Math.ceil((nextAutoRefreshAt - Date.now()) / 1_000));
    const countdown = document.createElement("span");
    countdown.className = "status-refresh-countdown";
    countdown.textContent = String(seconds);
    if (consecutiveRefreshFailures > 0) {
      onRetryStatusChange?.({
        error: latestRefreshError,
        seconds,
        count: consecutiveRefreshFailures,
      });
      statusElement.replaceChildren(
        document.createTextNode(t("autoRefreshRetryPrefix")),
        countdown,
        document.createTextNode(t("autoRefreshRetrySuffix", { count: consecutiveRefreshFailures })),
      );
      statusElement.dataset.kind = "warning";
      return;
    }

    onRetryStatusChange?.(null);

    if (!latestQuota) return;

    const plan = latestQuota.planType ? t("planPrefix", { plan: latestQuota.planType }) : "";
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
    wordCloudView.showLoading();
    try {
      const data = await invoke("read_thread_trends", {
        forceRefresh,
        days: getTrendDays(),
      });
      if (requestVersion !== trendRequestVersion) return;
      trendView.setData(data);
      wordCloudView.setData(data.wordCloud, data.days);
    } catch (error) {
      if (requestVersion !== trendRequestVersion) return;
      console.error(error);
      trendView.showError();
      wordCloudView.showError();
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

  async function refreshQuota(forceTrendRefresh = false) {
    if (refreshing) return;
    refreshing = true;
    onRefreshingChange(true);
    setStatus(t("readingLocalData"));
    try {
      latestQuota = await readQuotaWithStartupRetry();
      consecutiveRefreshFailures = 0;
      latestRefreshError = "";
      scheduleNextAutoRefresh(getAutoRefreshIntervalMs());
      onAvailabilityChange(true);
      quotaView.render(latestQuota);
      await quotaAlerts.notify(latestQuota);
      if (getExpanded()) {
        if (getSessionsExpanded()) await refreshThreadList(forceTrendRefresh);
        // 趋势和本地 Token 读取属于低优先级任务，不能阻塞额度主卡的可用状态。
        void refreshThreadTrends(forceTrendRefresh);
        void refreshTokenUsage();
      }
    } catch (error) {
      console.error(error);
      consecutiveRefreshFailures += 1;
      latestRefreshError = String(error);
      // 保留最近一次有效额度并持续退避重试；无缓存时才切换到全量错误态。
      quotaView.showReadFailure(!latestQuota);
      // 没有任何可回退数据时使用整页错误态，避免多个空卡片让请求失败看起来像无数据。
      if (!latestQuota) onAvailabilityChange(false);
      scheduleNextAutoRefresh(retryDelayMs());
    } finally {
      refreshing = false;
      onRefreshingChange(false);
      renderSyncedStatus();
    }
  }

  return {
    getLatestQuota: () => latestQuota,
    isRefreshing: () => refreshing,
    getNextAutoRefreshDelayMs: () => Math.max(0, nextAutoRefreshAt - Date.now()),
    refreshQuota,
    refreshThreadTrends,
    refreshTokenUsage,
    renderSyncedStatus,
    resetAutoRefreshSchedule: () => {
      nextAutoRefreshAt = Date.now() + getAutoRefreshIntervalMs();
      consecutiveRefreshFailures = 0;
      renderSyncedStatus();
    },
  };
}
