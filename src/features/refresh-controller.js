/**
 * 集中管理账户额度的刷新、失败重试与账户切换状态。
 *
 * 入口文件只负责将页面事件接到控制器，避免刷新计时、失败退避和异步请求版本
 * 分散在窗口、账户等不同职责中，导致后续修改时遗漏边界状态。
 */
export function createRefreshController({
  invoke,
  quotaView,
  accountQuotaView,
  quotaAlerts,
  refreshAccount,
  setStatus,
  onRefreshingChange,
  onAvailabilityChange,
  statusElement,
  t,
  getAutoRefreshIntervalMs,
  onAutoRefreshScheduleChange,
  onRetryStatusChange,
}) {
  // 温和增加重试间隔；上限不能短于用户选择的正常刷新间隔。
  const MAX_AUTO_REFRESH_BACKOFF_MS = 5 * 60 * 1_000;
  const AUTO_REFRESH_RETRY_MULTIPLIERS = [1, 1.5, 2, 3, 5];
  let latestQuota = null;
  let latestQuotaSyncedAt = null;
  let refreshing = false;
  let nextAutoRefreshAt = Date.now() + getAutoRefreshIntervalMs();
  let consecutiveRefreshFailures = 0;
  let latestRefreshError = "";
  let accountChangePaused = false;
  let accountVersion = 0;
  let refreshFinished = null;

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

  async function refreshQuota({ manual = false, showLoadingStatus = true } = {}) {
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
    // 首次进入首页已有内容区加载提示；后续刷新在底部显示查询状态。
    setStatus(showLoadingStatus ? t("readingLocalData") : "");
    accountQuotaView.setLoading();
    try {
      // 一轮查询的快照同时供顶部、列表、悬浮球、同步状态和提醒使用。
      const [snapshots, accountResult] = await Promise.all([
        invoke("read_account_quotas"),
        Promise.resolve().then(refreshAccount).then(() => true, () => false),
      ]);
      if (version !== accountVersion) return;
      accountQuotaView.setSnapshots(snapshots);
      onAvailabilityChange(true);
      const result = snapshots.find((snapshot) => snapshot.selected);
      if (!result) {
        latestQuota = null;
        latestQuotaSyncedAt = null;
        quotaView.render({ windows: [] });
        throw new Error(t("accountsCurrentUnknown"));
      }
      if (latestQuota && latestQuota.id !== result.id) {
        latestQuota = null;
        latestQuotaSyncedAt = null;
      }
      if (!result.success) throw new Error(result.error || t("accountQuotaUnavailable"));
      latestQuota = result;
      // 仅成功读取额度时更新，失败重试保留上次成功时间，避免误导数据新鲜度。
      latestQuotaSyncedAt = Number.isFinite(result.queriedAt) ? result.queriedAt * 1_000 : Date.now();
      consecutiveRefreshFailures = 0;
      latestRefreshError = "";
      scheduleNextAutoRefresh(getAutoRefreshIntervalMs());
      onAvailabilityChange(true);
      quotaView.render(latestQuota);
      // 额度提醒属于辅助任务，错误单独记录，不计入额度重试次数。
      try {
        if (accountResult) await quotaAlerts.notify(latestQuota);
      } catch (error) {
        console.warn("额度提醒失败", error);
      }
    } catch (error) {
      if (version !== accountVersion) return;
      console.error(error);
      consecutiveRefreshFailures += 1;
      latestRefreshError = String(error);
      // 最近同步保留成功时间，悬浮球明确标记失败，避免继续展示其他账户或过期额度。
      latestQuota = null;
      quotaView.showReadFailure(true);
      accountQuotaView.setError(error);
      // 单账户失败仍保留其他账户卡片，错误由卡片和底部状态共同呈现。
      scheduleNextAutoRefresh(retryDelayMs());
    } finally {
      refreshing = false;
      finish();
      refreshFinished = null;
      onRefreshingChange(false);
      renderSyncedStatus();
    }
  }

  return {
    pauseForAccountChange: async () => {
      accountChangePaused = true;
      ++accountVersion;
      // 等待旧刷新退出，防止 finally 与新账户刷新争用同一个状态。
      if (refreshFinished) await refreshFinished;
    },
    resumeAfterAccountChange: (changed) => {
      if (changed) {
        latestQuota = null; latestQuotaSyncedAt = null;
        quotaView.render({ windows: [] });
        accountQuotaView.clear();
        consecutiveRefreshFailures = 0; latestRefreshError = "";
      }
      accountChangePaused = false;
    },
    getLatestQuota: () => latestQuota,
    getLatestQuotaSyncedAt: () => latestQuotaSyncedAt,
    isRefreshing: () => refreshing,
    getNextAutoRefreshDelayMs: () => Math.max(0, nextAutoRefreshAt - Date.now()),
    refreshQuota,
    renderSyncedStatus,
    resetAutoRefreshSchedule: () => {
      nextAutoRefreshAt = Date.now() + (consecutiveRefreshFailures > 0 ? retryDelayMs() : getAutoRefreshIntervalMs());
      renderSyncedStatus();
    },
  };
}
