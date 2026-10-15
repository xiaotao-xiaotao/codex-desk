import { readStoredJson, writeStoredValue } from "../utils/browser-storage.js";

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
  refreshTopics,
  getExpanded,
  getSessionsExpanded,
  refreshThreadList,
  refreshAccount,
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
  const INSIGHTS_CACHE_KEY = "codex-desk-insights-cache-v1";
  const TOKEN_USAGE_CACHE_KEY = "codex-desk-token-usage-cache-v3";
  // 温和增加重试间隔；上限不能短于用户选择的正常刷新间隔。
  const MAX_AUTO_REFRESH_BACKOFF_MS = 5 * 60 * 1_000;
  const AUTO_REFRESH_RETRY_MULTIPLIERS = [1, 1.5, 2, 3, 5];
  // 历史统计变化较慢，不必随每次额度轮询重复扫描；手动刷新仍可立即更新。
  const BACKGROUND_INSIGHTS_INTERVAL_MS = 5 * 60 * 1_000;
  // 启动时 CLI 的认证与 app-server 可能仍在初始化，先快速重连，避免瞬时失败直接占满页面。
  const INITIAL_QUOTA_RETRY_DELAYS_MS = [500, 1_500];
  const TRANSIENT_QUOTA_RETRY_DELAY_MS = 1_500;
  let latestQuota = null;
  let latestQuotaSyncedAt = null;
  let refreshing = false;
  let nextAutoRefreshAt = Date.now() + getAutoRefreshIntervalMs();
  let consecutiveRefreshFailures = 0;
  let initialQuotaRead = true;
  let latestRefreshError = "";
  let trendRequestVersion = 0;
  let tokenUsageRequestVersion = 0;
  let insightsCache = readStoredJson(INSIGHTS_CACHE_KEY, {});
  let tokenUsageCache = readStoredJson(TOKEN_USAGE_CACHE_KEY, null);
  let accountChangePaused = false;
  let accountVersion = 0;
  let refreshFinished = null;
  let backgroundRefreshRunning = false;
  let nextBackgroundRefreshAt = 0;

  function currentUtcDay() {
    return new Date().toISOString().slice(0, 10);
  }

  function restoreCachedThreadTrends(days) {
    const cached = insightsCache?.[days];
    const data = cached?.data;
    if (cached?.day !== currentUtcDay()
      || Number(data?.days) !== days
      || !Array.isArray(data?.points)
      || !data?.wordCloud) {
      return false;
    }
    trendView.setData(data);
    return true;
  }

  function cacheThreadTrends(data) {
    const days = Number(data?.days);
    if (![3, 7, 30].includes(days)) return;
    insightsCache = {
      ...insightsCache,
      [days]: { day: currentUtcDay(), data },
    };
    writeStoredValue(INSIGHTS_CACHE_KEY, JSON.stringify(insightsCache));
  }

  function restoreCachedTokenUsage() {
    const data = tokenUsageCache?.data;
    if (tokenUsageCache?.day !== currentUtcDay()
      || !Array.isArray(data?.dailyUsageBuckets)
      || !Array.isArray(data?.localSessionUsage)) {
      return false;
    }
    tokenUsageView.setData(data);
    return true;
  }

  function cacheTokenUsage(data) {
    tokenUsageCache = { day: currentUtcDay(), data };
    writeStoredValue(TOKEN_USAGE_CACHE_KEY, JSON.stringify(tokenUsageCache));
  }

  function scheduleNextAutoRefresh(delayMs) {
    nextAutoRefreshAt = Date.now() + delayMs;
    onAutoRefreshScheduleChange?.();
  }

  function retryDelayMs() {
    const baseDelay = Math.max(1_000, Number(getAutoRefreshIntervalMs()) || 60_000);
    const retryIndex = Math.min(Math.max(0, consecutiveRefreshFailures - 1), AUTO_REFRESH_RETRY_MULTIPLIERS.length - 1);
    const maximumDelay = Math.max(baseDelay, MAX_AUTO_REFRESH_BACKOFF_MS);
    return Math.min(baseDelay * AUTO_REFRESH_RETRY_MULTIPLIERS[retryIndex], maximumDelay);
  }

  function wait(delayMs) {
    return new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }

  async function readQuotaWithStartupRetry() {
    const startup = initialQuotaRead;
    const retryDelays = startup ? INITIAL_QUOTA_RETRY_DELAYS_MS : [TRANSIENT_QUOTA_RETRY_DELAY_MS];
    initialQuotaRead = false;
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await invoke("read_quota");
      } catch (error) {
        // 常规轮询只缓冲明确的网络发送失败；认证、限流与慢响应仍交给原有退避处理。
        const transientNetworkFailure = String(error).includes("failed to fetch codex rate limits: error sending request");
        if (attempt >= retryDelays.length || (!startup && !transientNetworkFailure) || accountChangePaused) throw error;
        await wait(retryDelays[attempt]);
        if (accountChangePaused) throw error;
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
      statusElement.title = latestRefreshError;
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
    statusElement.removeAttribute("title");

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
    if (accountChangePaused) return;
    const requestVersion = ++trendRequestVersion;
    const days = getTrendDays();
    // 同一天的上次结果先立即展示，后台完成后再无闪烁替换为最新统计。
    const restoredFromCache = restoreCachedThreadTrends(days);
    trendView.showLoading();
    try {
      const data = await invoke("read_thread_trends", {
        forceRefresh,
        days,
      });
      if (requestVersion !== trendRequestVersion) return;
      cacheThreadTrends(data);
      trendView.setData(data);
    } catch (error) {
      if (requestVersion !== trendRequestVersion) return;
      console.error(error);
      if (!restoredFromCache) {
        trendView.showError();
      }
    }
  }

  async function refreshTokenUsage() {
    if (accountChangePaused) return;
    const requestVersion = ++tokenUsageRequestVersion;
    const restoredFromCache = restoreCachedTokenUsage();
    tokenUsageView.showLoading();
    try {
      const data = await invoke("read_token_usage");
      if (requestVersion !== tokenUsageRequestVersion) return;
      cacheTokenUsage(data);
      tokenUsageView.setData(data);
    } catch (error) {
      if (requestVersion !== tokenUsageRequestVersion) return;
      console.error(error);
      if (!restoredFromCache) tokenUsageView.showError();
    }
  }

  async function refreshQuota(forceTrendRefresh = false, { manual = false } = {}) {
    if (refreshing || accountChangePaused) return;
    // 手动请求跳过旧退避历史；失败后从第一档重试，自动刷新继续累积失败次数。
    if (manual) {
      consecutiveRefreshFailures = 0;
      latestRefreshError = "";
    }
    const version = accountVersion;
    let finish;
    refreshFinished = new Promise((resolve) => { finish = resolve; });
    refreshing = true;
    onRefreshingChange(true);
    setStatus(t("readingLocalData"));
    try {
      // 提醒使用本轮运行中账户的归属，不能沿用切换前的邮箱。
      // 账户摘要读取失败不能否定已成功获取的额度；等待其完成后再判断提醒归属。
      const [quotaResult, accountResult] = await Promise.allSettled([readQuotaWithStartupRetry(), refreshAccount()]);
      if (quotaResult.status === "rejected") throw quotaResult.reason;
      if (accountResult.status === "rejected") console.warn("账户摘要刷新失败", accountResult.reason);
      const result = quotaResult.value;
      if (version !== accountVersion) return;
      latestQuota = result;
      // 仅成功读取额度时更新，失败重试保留上次成功时间，避免误导数据新鲜度。
      latestQuotaSyncedAt = Date.now();
      consecutiveRefreshFailures = 0;
      latestRefreshError = "";
      scheduleNextAutoRefresh(getAutoRefreshIntervalMs());
      onAvailabilityChange(true);
      quotaView.render(latestQuota);
      // 提醒与历史数据属于辅助任务，错误单独记录，不计入额度重试次数。
      try {
        if (accountResult.status === "fulfilled") await quotaAlerts.notify(latestQuota);
      } catch (error) {
        console.warn("额度提醒失败", error);
      }
      if (version !== accountVersion) return;
      if (getExpanded()) {
        if (getSessionsExpanded()) {
          try { await refreshThreadList(forceTrendRefresh); }
          catch (error) { console.warn("历史列表刷新失败", error); }
        }
        if (!backgroundRefreshRunning && (forceTrendRefresh || Date.now() >= nextBackgroundRefreshAt)) {
          backgroundRefreshRunning = true;
          nextBackgroundRefreshAt = Date.now() + BACKGROUND_INSIGHTS_INTERVAL_MS;
          void Promise.allSettled([
            Promise.resolve().then(() => refreshTokenUsage()),
            Promise.resolve().then(() => refreshTopics(forceTrendRefresh)),
            Promise.resolve().then(() => refreshThreadTrends(forceTrendRefresh)),
          ]).then((results) => {
            results.forEach((result) => {
              if (result.status === "rejected") console.warn("后台统计刷新失败", result.reason);
            });
          }).finally(() => { backgroundRefreshRunning = false; });
        }
      }
    } catch (error) {
      if (version !== accountVersion) return;
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
      finish();
      refreshFinished = null;
      onRefreshingChange(false);
      renderSyncedStatus();
    }
  }

  restoreCachedThreadTrends(getTrendDays());
  restoreCachedTokenUsage();

  return {
    pauseForAccountChange: async () => {
      accountChangePaused = true;
      ++accountVersion;
      ++trendRequestVersion;
      ++tokenUsageRequestVersion;
      // 等待旧刷新退出，防止 finally 与新账户刷新争用同一个状态。
      if (refreshFinished) await refreshFinished;
    },
    resumeAfterAccountChange: (changed) => {
      if (changed) {
        nextBackgroundRefreshAt = 0;
        latestQuota = null; latestQuotaSyncedAt = null;
        tokenUsageCache = null;
        writeStoredValue(TOKEN_USAGE_CACHE_KEY, "null");
        tokenUsageView.clear();
        quotaView.render({ windows: [] });
        consecutiveRefreshFailures = 0; latestRefreshError = "";
      }
      accountChangePaused = false;
    },
    getLatestQuota: () => latestQuota,
    getLatestQuotaSyncedAt: () => latestQuotaSyncedAt,
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
