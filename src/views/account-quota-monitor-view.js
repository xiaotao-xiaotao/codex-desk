import { displayEmail } from "../utils/email-privacy.js";

/** 多账户额度监控。只接收后端脱敏快照，单账户刷新仍通过同一批查询完成。 */
export function createAccountQuotaMonitorView({
  t,
  invoke,
  formatQuotaWindow,
  formatResetAt,
  formatResetCountdown,
  getHideEmails = () => false,
  onToggleAlerts = async () => {},
  getAlertsEnabled = () => false,
}) {
  const page = document.querySelector("#account-section");
  const monitor = document.createElement("section");
  monitor.className = "account-quota-monitor-inline";
  monitor.innerHTML = `
    <div class="account-quota-featured-heading"><h2></h2></div>
    <div class="account-quota-feedback" role="status" hidden></div>
    <section class="account-quota-featured" aria-live="polite"></section>
    <div class="account-quota-list" aria-live="polite" aria-busy="false"></div>`;
  page.prepend(monitor);

  const feedback = monitor.querySelector(".account-quota-feedback");
  const featuredHeading = monitor.querySelector(".account-quota-featured-heading h2");
  const list = monitor.querySelector(".account-quota-list");
  const featured = monitor.querySelector(".account-quota-featured");
  let focusedAccountId = null;
  let snapshots = [];
  let loading = false;

  const setFeedback = (message = "", kind = "normal") => {
    feedback.hidden = !message;
    feedback.textContent = message;
    feedback.dataset.kind = kind;
  };

  const avatar = (label) => (label || "?").trim().slice(0, 1).toUpperCase();
  const percent = (value) => value != null && Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : "—";
  const statusOf = (snapshot) => {
    if (!snapshot?.success) return "unavailable";
    const lowest = Math.min(...(snapshot.windows || []).map((window) => Number(window.remainingPercent)).filter(Number.isFinite));
    return lowest <= 20 ? "attention" : "healthy";
  };

  function renderWindow(window, index, { showAlert = false } = {}) {
    const card = document.createElement("div");
    card.className = "account-quota-window";
    const heading = document.createElement("div");
    heading.className = "account-quota-window-heading";
    const name = document.createElement("span");
    name.textContent = formatQuotaWindow(window.durationMinutes);
    heading.append(name);
    if (showAlert) {
      const alertButton = document.createElement("button");
      alertButton.type = "button";
      alertButton.className = "quota-alert-toggle";
      alertButton.addEventListener("click", () => void onToggleAlerts());
      renderAlertButton(alertButton);
      heading.append(alertButton);
    }
    const value = document.createElement("strong");
    value.className = "account-quota-percent";
    value.textContent = percent(window.remainingPercent);
    const caption = document.createElement("span");
    caption.className = "account-quota-percent-label";
    caption.textContent = t("accountQuotaRemaining");
    const used = document.createElement("span");
    used.className = "account-quota-used";
    used.textContent = window.usedPercent == null ? "" : `（${t("usedPercent", { used: Math.round(Number(window.usedPercent)) })}）`;
    const valueRow = document.createElement("div");
    valueRow.className = "account-quota-value-row";
    valueRow.append(value, caption, used);
    const meter = document.createElement("div");
    meter.className = "account-quota-meter";
    const bar = document.createElement("span");
    const remaining = Number(window.remainingPercent);
    bar.style.width = `${Number.isFinite(remaining) ? Math.max(0, Math.min(100, remaining)) : 0}%`;
    meter.append(bar);
    const resetAt = document.createElement("small");
    const resetCountdown = document.createElement("span");
    resetCountdown.className = "account-quota-window-reset";
    resetCountdown.textContent = window.resetsAt ? formatResetCountdown(window.resetsAt) : t("resetUnknown");
    const resetDate = document.createElement("span");
    resetDate.textContent = window.resetsAt ? formatResetAt(window.resetsAt) : "";
    resetAt.append(resetCountdown, resetDate);
    card.dataset.window = String(index);
    card.append(heading, valueRow, meter, resetAt);
    return card;
  }

  function renderAlertButton(button) {
    const enabled = getAlertsEnabled();
    button.replaceChildren();
    button.insertAdjacentHTML("afterbegin", '<svg class="quota-alert-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg><span class="quota-alert-toggle-label"></span>');
    button.querySelector(".quota-alert-toggle-label").textContent = enabled ? t("quotaAlertEnabledLabel") : t("quotaAlertEnableLabel");
    button.classList.toggle("is-enabled", enabled);
    button.setAttribute("aria-pressed", String(enabled));
  }

  async function openAccountAction(command, errorKey) {
    setFeedback();
    try {
      await invoke(command);
    } catch (error) {
      setFeedback(t(errorKey, { error: String(error) }), "error");
    }
  }

  // 后台控制台布局：顶部聚焦账户，下面用紧凑行承载其他账户。
  function renderList() {
    list.replaceChildren();
    featured.replaceChildren();
    list.classList.toggle("is-empty", !snapshots.length);
    if (!snapshots.length) {
      const empty = document.createElement("div");
      empty.className = "account-quota-empty";
      empty.innerHTML = `<strong></strong><p></p>`;
      empty.classList.toggle("is-loading", loading);
      empty.querySelector("strong").textContent = t(loading ? "accountQuotaRefreshing" : "accountQuotaNoAccounts");
      empty.querySelector("p").textContent = t(loading ? "accountQuotaMonitorHint" : "accountQuotaNoAccountsHint");
      featured.append(empty);
      return;
    }
    const rank = (snapshot) => !snapshot.success ? 3 : statusOf(snapshot) === "attention" ? 2 : 1;
    const ordered = [...snapshots].sort((a, b) => Number(b.selected) - Number(a.selected) || rank(a) - rank(b) || a.label.localeCompare(b.label));
    const focused = ordered.find((item) => item.id === focusedAccountId) || ordered.find((item) => item.selected) || ordered[0];
    focusedAccountId = focused.id;
    const detail = document.createElement("article");
    detail.className = `account-quota-featured-card is-${statusOf(focused)}`;
    const detailHeader = document.createElement("header");
    detailHeader.className = "account-quota-featured-header";
    const detailIdentity = document.createElement("div");
    detailIdentity.className = "account-quota-identity";
    const detailAvatar = document.createElement("span");
    detailAvatar.className = "account-quota-avatar";
    detailAvatar.textContent = avatar(focused.label);
    const detailName = document.createElement("div");
    detailName.innerHTML = `<strong></strong><span></span><em></em>`;
    detailName.querySelector("strong").textContent = focused.label;
    detailName.querySelector("span").textContent = displayEmail(focused.email || t("accountsEmailUnknown"), getHideEmails());
    const detailPlan = detailName.querySelector("em");
    detailPlan.hidden = !focused.success;
    if (focused.success) detailPlan.textContent = `${t("accountPlan")}：${focused.planType || t("accountPlanUnavailable")}`;
    const creditCount = focused.resetCredits == null ? 0 : Number(focused.resetCredits);
    const creditDetails = Array.isArray(focused.resetCreditDetails) ? focused.resetCreditDetails : [];
    detailIdentity.append(detailAvatar, detailName);
    if (focused.selected) {
      const currentMark = document.createElement("span");
      currentMark.className = "account-quota-featured-current-mark";
      currentMark.setAttribute("role", "img");
      currentMark.setAttribute("aria-label", t("accountQuotaCurrent"));
      currentMark.title = t("accountQuotaCurrent");
      currentMark.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"/></svg>';
      detail.append(currentMark);
    }
    detailHeader.append(detailIdentity);
    const detailActions = document.createElement("div");
    detailActions.className = "account-quota-featured-actions";
    detailHeader.append(detailActions);
    detail.append(detailHeader);
    if (creditCount > 0) {
      const creditsPanel = document.createElement("div");
      creditsPanel.className = "account-quota-featured-credits";
      const creditsHeading = document.createElement("strong");
      creditsHeading.className = "account-quota-featured-credits-heading";
      creditsHeading.textContent = t("accountQuotaCreditsCount", { count: creditCount });
      creditsPanel.append(creditsHeading);
      for (let index = 0; index < creditCount; index += 1) {
        const item = document.createElement("span");
        item.className = "account-quota-featured-credit";
        const label = document.createElement("strong");
        label.textContent = t("accountQuotaCreditsExpiryItem", { index: index + 1, value: "" }).replace(/[：:、].*$/, "");
        const expiry = document.createElement("time");
        expiry.textContent = creditDetails[index]?.expiresAt
          ? formatResetAt(creditDetails[index].expiresAt)
          : t("accountQuotaCreditsExpiryUnknown");
        item.append(label, expiry);
        creditsPanel.append(item);
      }
      detailActions.append(creditsPanel);
    }
    const detailWindows = document.createElement("div");
    detailWindows.className = "account-quota-windows";
    if (focused.success) (focused.windows || []).forEach((window, index) => detailWindows.append(renderWindow(window, index, {
      showAlert: focused.selected && index === 0,
    })));
    else {
      const error = document.createElement("div"); error.className = "account-quota-unavailable"; error.textContent = focused.error || t("accountQuotaUnavailable"); detailWindows.append(error);
    }
    detail.append(detailWindows);
    if (focused.selected) {
      const detailFooter = document.createElement("div");
      detailFooter.className = "account-quota-featured-footer";
      const resetButton = document.createElement("button");
      resetButton.type = "button";
      resetButton.className = "account-quota-featured-link";
      resetButton.textContent = t("openQuotaReset");
      resetButton.addEventListener("click", () => void openAccountAction("open_quota_reset_page", "accountQuotaResetOpenFailed"));
      const billingButton = document.createElement("button");
      billingButton.type = "button";
      billingButton.className = "account-quota-featured-link";
      billingButton.textContent = t("openBilling");
      billingButton.addEventListener("click", () => void openAccountAction("open_billing_page", "accountBillingOpenFailed"));
      detailFooter.append(resetButton, billingButton);
      detail.append(detailFooter);
    }
    featured.append(detail);

    ordered.forEach((snapshot) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `account-quota-list-row${snapshot.id === focused.id ? " is-active" : ""}${snapshot.success ? "" : " is-unavailable"}`;
      row.addEventListener("click", () => { focusedAccountId = snapshot.id; renderList(); });
      if (snapshot.selected) {
        const currentMark = document.createElement("span");
        currentMark.className = "account-quota-list-current-mark";
        currentMark.setAttribute("role", "img");
        currentMark.setAttribute("aria-label", t("accountQuotaCurrent"));
        currentMark.title = t("accountQuotaCurrent");
        currentMark.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"/></svg>';
        row.append(currentMark);
      }
      const rowIdentity = document.createElement("span"); rowIdentity.className = "account-quota-list-identity";
      const rowAvatar = document.createElement("i"); rowAvatar.textContent = avatar(snapshot.label);
      const rowText = document.createElement("span"); rowText.innerHTML = `<strong></strong><small></small>`;
      rowText.querySelector("strong").textContent = snapshot.label;
      rowText.querySelector("small").textContent = displayEmail(snapshot.email || t("accountsEmailUnknown"), getHideEmails());
      rowIdentity.append(rowAvatar, rowText);
      const state = document.createElement("span"); state.className = `account-quota-list-state is-${statusOf(snapshot)}`; state.textContent = snapshot.success ? t(statusOf(snapshot) === "attention" ? "accountQuotaAttention" : "accountQuotaHealthy") : t("accountQuotaUnavailable");
      const mini = document.createElement("span"); mini.className = "account-quota-list-mini";
      const listWindows = [...(snapshot.windows || [])]
        .sort((a, b) => Number(a.durationMinutes || 0) - Number(b.durationMinutes || 0))
        .slice(0, 2);
      listWindows.forEach((window) => {
        const item = document.createElement("span"); item.className = "account-quota-list-mini-item";
        const percentLabel = document.createElement("strong"); percentLabel.textContent = `${formatQuotaWindow(window.durationMinutes)} ${percent(window.remainingPercent)}`;
        const bar = document.createElement("i"); bar.style.setProperty("--mini-progress", `${Math.max(0, Math.min(100, Number(window.remainingPercent) || 0))}%`);
        const resetLabel = document.createElement("small"); resetLabel.textContent = window.resetsAt ? formatResetCountdown(window.resetsAt) : t("resetUnknown");
        item.append(percentLabel, bar, resetLabel);
        mini.append(item);
      });
      row.append(rowIdentity);
      if (snapshot.success) {
        const plan = document.createElement("span"); plan.className = "account-quota-list-plan";
        const planLabel = document.createElement("small"); planLabel.textContent = t("accountPlan");
        const planValue = document.createElement("strong"); planValue.textContent = snapshot.planType || t("accountPlanUnavailable");
        plan.append(planLabel, planValue);
        row.append(plan, state, mini);
      } else {
        row.append(state);
      }
      // 查询失败时不展示充值卡信息，避免把“不可用”账户误解成有可用的充值额度。
      if (snapshot.success) {
        const rowCredits = document.createElement("span"); rowCredits.className = "account-quota-list-credits";
        const creditCount = snapshot.resetCredits == null ? "—" : t("accountQuotaCreditsCount", { count: snapshot.resetCredits });
        const earliest = (snapshot.resetCreditDetails || []).map((item) => item.expiresAt).filter(Boolean).sort((a, b) => Number(a) - Number(b))[0];
        rowCredits.innerHTML = `<strong></strong><small></small>`;
        rowCredits.querySelector("strong").textContent = creditCount;
        rowCredits.querySelector("small").textContent = earliest
          ? t("accountQuotaCreditsExpiry", { value: formatResetAt(earliest) })
          : t("accountQuotaCreditsExpiryUnknown");
        row.append(rowCredits);
      }
      list.append(row);
    });
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    list.setAttribute("aria-busy", "true");
    renderList();
    try {
      snapshots = await invoke("read_account_quotas");
      renderList();
    } catch (error) {
      snapshots = [];
      renderList();
      setFeedback(t("accountQuotaQueryFailed", { error: String(error) }), "error");
    } finally {
      loading = false;
      list.setAttribute("aria-busy", "false");
    }
  }

  function updateLanguage() {
    featuredHeading.textContent = "当前登录";
    renderList();
  }

  updateLanguage();
  return {
    refresh,
    activate: () => { if (!loading && !snapshots.length) void refresh(); },
    updateLanguage,
    updateAlertStatus: renderList,
  };
}
