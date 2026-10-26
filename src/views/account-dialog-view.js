/**
 * 读取当前账户范围，供额度提醒使用。
 * 账户信息的展示统一由多账户额度卡负责，避免维护一套隐藏的旧 DOM。
 */
export function createAccountOverviewView({ invoke }) {
  let profile = null;
  let readFailed = false;
  let requestVersion = 0;

  async function refresh() {
    const version = ++requestVersion;
    try {
      const result = await invoke("read_account");
      if (version !== requestVersion) return;
      profile = result;
    } catch {
      if (version !== requestVersion) return;
      readFailed = true;
    }
  }

  return {
    refresh,
    getAccountScope: () => readFailed ? "unknown" : profile?.email ?? "unknown",
    invalidate: () => { requestVersion += 1; profile = null; readFailed = false; },
  };
}
