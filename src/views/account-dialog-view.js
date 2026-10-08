import { displayEmail } from "../utils/email-privacy.js";

/**
 * 主界面账户区只读取用于展示的邮箱和套餐。
 * 不缓存认证数据，也不会将 app-server 返回的原始响应传到页面。
 */
export function createAccountOverviewView({ t, invoke, getHideEmails = () => false }) {
  const email = document.querySelector("#account-email");
  const plan = document.querySelector("#account-plan");
  const billingButton = document.querySelector("#account-billing");
  const quotaResetButton = document.querySelector("#account-quota-reset");
  const message = document.querySelector("#account-message");
  let profile = null;
  let loading = false;
  let readFailed = false;
  let error = null;
  let requestVersion = 0;

  function render() {
    if (loading && !profile) {
      email.textContent = plan.textContent = t("accountLoading");
      message.hidden = true;
      return;
    }

    const hasEmail = Boolean(profile?.email);
    email.textContent = displayEmail(profile?.email, getHideEmails()) ?? t(readFailed ? "accountDataReadFailed" : "accountEmailUnavailable");
    // 脱敏状态下不保留完整邮箱的悬浮提示，避免看似隐藏但仍可直接读到原文。
    email.title = hasEmail && !getHideEmails() ? profile.email : "";
    plan.textContent = profile?.planType ?? t(readFailed ? "accountDataReadFailed" : "accountPlanUnavailable");
    message.hidden = !error;
    message.textContent = error ? t(error.key, { error: error.detail }) : "";
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    readFailed = false;
    const version = ++requestVersion;
    error = null;
    render();
    try {
      const result = await invoke("read_account");
      if (version !== requestVersion) return;
      profile = result;
    } catch {
      if (version !== requestVersion) return;
      profile = null;
      readFailed = true;
    } finally {
      if (version === requestVersion) { loading = false; render(); }
    }
  }

  async function openBillingPage() {
    error = null;
    render();
    try {
      // 账单门户会按浏览器登录态和购买渠道动态跳转，桌面端只打开官方账单入口。
      await invoke("open_billing_page");
    } catch (openError) {
      error = { key: "accountBillingOpenFailed", detail: String(openError) };
      render();
    }
  }

  billingButton.addEventListener("click", () => void openBillingPage());
  quotaResetButton.addEventListener("click", async () => {
    error = null;
    render();
    try {
      // 只跳转官方用量页，权益的实际兑换由用户在浏览器中完成。
      await invoke("open_quota_reset_page");
    } catch (openError) {
      error = { key: "accountQuotaResetOpenFailed", detail: String(openError) };
      render();
    }
  });

  return {
    refresh,
    getAccountScope: () => profile?.email ?? "unknown",
    invalidate: () => { ++requestVersion; loading = false; readFailed = false; profile = null; error = null; render(); },
    updateLanguage: render,
  };
}
