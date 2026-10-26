import { displayEmail } from "../utils/email-privacy.js";

const QUOTA_WARNING_REMAINING_PERCENT = 20;
const QUOTA_CRITICAL_REMAINING_PERCENT = 10;
const RESET_CARD_PREVIEW_LIMIT = 5;

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
  let snapshots = [];
  // 等待启动配置恢复时也属于未完成状态，不能提前判定为没有账户。
  let queryState = "pending";
  // 展开状态按区域和账户隔离，刷新额度或切换语言时保留用户的选择。
  const expandedCreditAccounts = new Set();

  const setFeedback = (message = "", kind = "normal") => {
    feedback.hidden = !message;
    feedback.textContent = message;
    feedback.dataset.kind = kind;
  };

  const avatar = (label) => (label || "?").trim().slice(0, 1).toUpperCase();
  const percent = (value) => value != null && Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : "—";
  const quotaStateOf = (value) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) return "unavailable";
    // 颜色与界面显示的整数百分比使用同一口径，缺失值不能误判为额度耗尽。
    const remaining = Math.round(value);
    if (remaining <= QUOTA_CRITICAL_REMAINING_PERCENT) return "critical";
    return remaining <= QUOTA_WARNING_REMAINING_PERCENT ? "attention" : "healthy";
  };
  const statusOf = (snapshot) => {
    if (!snapshot?.success) return "unavailable";
    const lowest = Math.min(...(snapshot.windows || []).map((window) => Number(window.remainingPercent)).filter(Number.isFinite));
    return lowest <= QUOTA_WARNING_REMAINING_PERCENT ? "attention" : "healthy";
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

  function renderResetCredits(snapshot, { featured = false } = {}) {
    const count = snapshot.resetCredits ?? snapshot.resetCreditDetails?.length ?? 0;
    const expansionKey = `${featured ? "featured" : "list"}:${snapshot.id}`;
    if (count <= RESET_CARD_PREVIEW_LIMIT) expandedCreditAccounts.delete(expansionKey);
    if (!snapshot.success || count <= 0) return null;

    const footer = document.createElement("span"); footer.className = `account-quota-list-credits${featured ? " account-quota-featured-credits" : ""}`;
    const entries = document.createElement("span"); entries.className = "account-quota-list-credit-entries";
    entries.id = `account-quota-${featured ? "featured" : "list"}-credits-${snapshot.id}`;
    footer.append(entries);
    const toggle = count > RESET_CARD_PREVIEW_LIMIT ? document.createElement("button") : null;
    if (toggle) {
      toggle.type = "button";
      toggle.className = "account-quota-list-credits-toggle";
      toggle.setAttribute("aria-controls", entries.id);
      footer.append(toggle);
    }

    const renderEntries = () => {
      const expanded = expandedCreditAccounts.has(expansionKey);
      const visibleCount = expanded ? count : Math.min(count, RESET_CARD_PREVIEW_LIMIT);
      entries.replaceChildren();
      for (let index = 0; index < visibleCount; index += 1) {
        const credit = document.createElement("span"); credit.className = "account-quota-list-credit";
        const label = document.createElement("span"); label.textContent = t("accountQuotaResetCardLabel", { index: index + 1 });
        const expiry = document.createElement("time");
        const expiresAt = snapshot.resetCreditDetails?.[index]?.expiresAt;
        expiry.textContent = expiresAt ? formatResetAt(expiresAt) : t("accountQuotaCreditsExpiryUnknown");
        credit.append(label, expiry);
        entries.append(credit);
      }
      if (toggle) {
        toggle.textContent = expanded ? t("accountQuotaResetCardsCollapse") : t("accountQuotaResetCardsExpand", { count: count - RESET_CARD_PREVIEW_LIMIT });
        toggle.setAttribute("aria-expanded", String(expanded));
      }
    };
    toggle?.addEventListener("click", (event) => {
      // 只更新此账户的明细，保留展开按钮的键盘焦点。
      event.stopPropagation();
      if (expandedCreditAccounts.has(expansionKey)) expandedCreditAccounts.delete(expansionKey);
      else expandedCreditAccounts.add(expansionKey);
      renderEntries();
    });
    renderEntries();
    return footer;
  }

  // 顶部仅展示当前登录，其他账户列表只读，避免点击后错标为“当前登录”。
  function renderList() {
    const pending = queryState === "pending" || queryState === "loading";
    list.setAttribute("aria-busy", String(pending));
    list.replaceChildren();
    featured.replaceChildren();
    // 当前登录已在顶部展示；没有其他账户时连同列表标题一起隐藏。
    list.classList.toggle("is-empty", snapshots.every((snapshot) => snapshot.selected));
    if (!snapshots.length) {
      const empty = document.createElement("div");
      empty.className = "account-quota-empty";
      empty.innerHTML = `<strong></strong><p></p>`;
      empty.classList.toggle("is-loading", pending);
      empty.querySelector("strong").textContent = t(pending ? "accountQuotaRefreshing" : queryState === "error" ? "accountQuotaUnavailable" : "accountQuotaNoAccounts");
      empty.querySelector("p").hidden = queryState === "error";
      empty.querySelector("p").textContent = t(pending ? "accountQuotaMonitorHint" : "accountQuotaNoAccountsHint");
      featured.append(empty);
      return;
    }
    const rank = (snapshot) => !snapshot.success ? 3 : statusOf(snapshot) === "attention" ? 2 : 1;
    const ordered = [...snapshots].sort((a, b) => Number(b.selected) - Number(a.selected) || rank(a) - rank(b) || a.label.localeCompare(b.label));
    const focused = ordered.find((item) => item.selected);
    if (!focused) {
      const empty = document.createElement("div");
      empty.className = "account-quota-empty";
      empty.innerHTML = `<strong></strong><p></p>`;
      empty.querySelector("strong").textContent = t("accountsCurrentUnknown");
      empty.querySelector("p").textContent = t("accountQuotaNoAccountsHint");
      featured.append(empty);
    } else {
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
      detailName.innerHTML = `<div class="account-quota-featured-name"><strong></strong><em></em></div><span></span>`;
      detailName.querySelector("strong").textContent = focused.label;
      detailName.querySelector("strong").title = focused.label;
      detailName.querySelector("span").textContent = displayEmail(focused.email || t("accountsEmailUnknown"), getHideEmails());
      const detailPlan = detailName.querySelector("em");
      detailPlan.hidden = !focused.success;
      if (focused.success) {
        const planName = focused.planType || t("accountPlanUnavailable");
        detailPlan.textContent = `(${planName})`;
        detailPlan.title = `${t("accountPlan")}：${planName}`;
      }
      detailIdentity.append(detailAvatar, detailName);
      detailHeader.append(detailIdentity);
      const detailActions = document.createElement("div");
      detailActions.className = "account-quota-featured-actions";
      detailHeader.append(detailActions);
      detail.append(detailHeader);
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
        detailActions.append(resetButton, billingButton);
      }
      const detailCredits = renderResetCredits(focused, { featured: true });
      if (detailCredits) detail.append(detailCredits);
      featured.append(detail);
    }

    ordered.filter((snapshot) => !snapshot.selected).forEach((snapshot) => {
      const row = document.createElement("div");
      row.className = `account-quota-list-row${snapshot.success ? "" : " is-unavailable"}`;
      const rowIdentity = document.createElement("span"); rowIdentity.className = "account-quota-list-identity";
      const rowAvatar = document.createElement("i"); rowAvatar.textContent = avatar(snapshot.label);
      const rowText = document.createElement("span"); rowText.innerHTML = `<span class="account-quota-list-name"><strong></strong></span><small></small>`;
      rowText.querySelector("strong").textContent = snapshot.label;
      rowText.querySelector("strong").title = snapshot.label;
      rowText.querySelector("small").textContent = displayEmail(snapshot.email || t("accountsEmailUnknown"), getHideEmails());
      rowIdentity.append(rowAvatar, rowText);
      const quotaDetails = document.createElement("span"); quotaDetails.className = "account-quota-list-details";
      const mini = document.createElement("span"); mini.className = "account-quota-list-mini";
      quotaDetails.append(mini);
      const listWindows = [...(snapshot.windows || [])]
        .sort((a, b) => Number(a.durationMinutes || 0) - Number(b.durationMinutes || 0))
        .slice(0, 2);
      listWindows.forEach((window) => {
        const item = document.createElement("span"); item.className = "account-quota-list-mini-item";
        item.dataset.state = quotaStateOf(window.remainingPercent);
        const percentLabel = document.createElement("strong"); percentLabel.textContent = `${formatQuotaWindow(window.durationMinutes)} ${percent(window.remainingPercent)}`;
        const bar = document.createElement("i"); bar.style.setProperty("--mini-progress", `${item.dataset.state === "unavailable" ? 0 : window.remainingPercent}%`);
        const resetLabel = document.createElement("small"); resetLabel.textContent = window.resetsAt ? formatResetCountdown(window.resetsAt) : t("resetUnknown");
        item.append(percentLabel, bar, resetLabel);
        mini.append(item);
      });
      row.append(rowIdentity);
      if (snapshot.success) {
        const plan = document.createElement("span"); plan.className = "account-quota-list-plan";
        const planName = snapshot.planType || t("accountPlanUnavailable");
        plan.textContent = `(${planName})`;
        plan.title = `${t("accountPlan")}：${planName}`;
        rowText.querySelector(".account-quota-list-name").append(plan);
        row.append(quotaDetails);
      } else {
        const state = document.createElement("span"); state.className = "account-quota-list-state is-unavailable"; state.textContent = t("accountQuotaUnavailable");
        row.append(state);
      }
      const resetCredits = renderResetCredits(snapshot);
      if (resetCredits) row.append(resetCredits);
      list.append(row);
    });
  }

  async function refresh() {
    if (queryState === "loading") return;
    queryState = "loading";
    setFeedback();
    renderList();
    try {
      snapshots = await invoke("read_account_quotas");
      queryState = "success";
    } catch (error) {
      snapshots = [];
      queryState = "error";
      setFeedback(t("accountQuotaQueryFailed", { error: String(error) }), "error");
    } finally {
      renderList();
    }
  }

  function updateLanguage() {
    featuredHeading.textContent = "当前登录";
    renderList();
  }

  updateLanguage();
  return {
    refresh,
    activate: () => { if (queryState !== "loading" && !snapshots.length) void refresh(); },
    updateLanguage,
    updateAlertStatus: renderList,
  };
}
