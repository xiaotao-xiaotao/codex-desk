/**
 * 主界面个人中心只读取用于展示的邮箱、套餐和登录方式。
 * 不缓存认证数据，也不会将 app-server 返回的原始响应传到页面。
 */
export function createAccountOverviewView({ t, invoke }) {
  const email = document.querySelector("#account-email");
  const plan = document.querySelector("#account-plan");
  const accountType = document.querySelector("#account-type");
  const billingButton = document.querySelector("#account-billing");
  const message = document.querySelector("#account-message");
  let profile = null;
  let loading = false;
  let error = null;

  function accountTypeLabel(type) {
    const key = {
      chatgpt: "accountTypeChatgpt",
      apiKey: "accountTypeApiKey",
      amazonBedrock: "accountTypeBedrock",
    }[type];
    return t(key ?? "accountTypeUnknown");
  }

  function render() {
    if (loading) {
      email.textContent = plan.textContent = accountType.textContent = t("accountLoading");
      message.hidden = true;
      return;
    }

    email.textContent = profile?.email ?? t("accountEmailUnavailable");
    plan.textContent = profile?.planType ?? t("accountPlanUnavailable");
    accountType.textContent = accountTypeLabel(profile?.accountType);
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
