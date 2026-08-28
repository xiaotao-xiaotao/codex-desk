/**
 * 主界面账户区只读取用于展示的邮箱和套餐。
 * 不缓存认证数据，也不会将 app-server 返回的原始响应传到页面。
 */
export function createAccountOverviewView({ t, invoke }) {
  const email = document.querySelector("#account-email");
  const plan = document.querySelector("#account-plan");
  const billingButton = document.querySelector("#account-billing");
  const message = document.querySelector("#account-message");
  let profile = null;
  let loading = false;
  let error = null;

  function maskEmail(value) {
    const [localPart, domain] = String(value ?? "").split("@");
    if (!localPart || !domain) return value;
    // 账户区仅用于确认当前登录身份；展示时保留少量前缀和域名，避免暴露完整邮箱。
    const visiblePrefix = localPart.slice(0, Math.min(3, localPart.length));
    return `${visiblePrefix}***@${domain}`;
  }

  function render() {
    if (loading) {
      email.textContent = plan.textContent = t("accountLoading");
      message.hidden = true;
      return;
    }

    email.textContent = profile?.email ? maskEmail(profile.email) : t("accountEmailUnavailable");
    plan.textContent = profile?.planType ?? t("accountPlanUnavailable");
    message.hidden = !error;
    message.textContent = error ? t(error.key, { error: error.detail }) : "";
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    error = null;
    render();
    try {
      profile = await invoke("read_account");
    } catch (readError) {
      profile = null;
      error = { key: "accountReadFailed", detail: String(readError) };
    } finally {
      loading = false;
      render();
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

  return { refresh, updateLanguage: render };
}
