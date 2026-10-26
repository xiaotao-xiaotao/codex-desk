import test from "node:test";
import assert from "node:assert/strict";
import { createRefreshController } from "./refresh-controller.js";

globalThis.document = {
  createElement: () => ({ textContent: "" }),
  createTextNode: (textContent) => ({ textContent }),
};

function setup(read) {
  const calls = [];
  const state = { snapshots: [], rendered: null, notified: [], error: null };
  const status = {
    dataset: {},
    replaceChildren(...children) { this.textContent = children.map((child) => child.textContent).join(""); },
    removeAttribute(name) { delete this[name]; },
  };
  const controller = createRefreshController({
    invoke: async (command) => { calls.push(command); return read(); },
    quotaView: {
      render: (result) => { state.rendered = result; },
      showReadFailure: () => { state.orbFailed = true; },
    },
    accountQuotaView: {
      setLoading: () => { state.loading = true; },
      setSnapshots: (snapshots) => { state.snapshots = snapshots; state.loading = false; },
      setError: (error) => { state.error = String(error); state.loading = false; },
      clear: () => { state.snapshots = []; },
    },
    quotaAlerts: { notify: async (snapshot) => { state.notified.push(snapshot); } },
    refreshAccount: async () => {},
    setStatus: () => {},
    onRefreshingChange: () => {},
    onAvailabilityChange: () => {},
    statusElement: status,
    t: (key) => key,
    getAutoRefreshIntervalMs: () => 180_000,
  });
  return { controller, state, status, calls };
}

const current = (overrides = {}) => ({ id: "current", accountId: "workspace", selected: true, success: true, queriedAt: 1_700_000_000, windows: [{ remainingPercent: 70 }], ...overrides });

test("每轮只查询一次，顶部、列表、提醒使用同一快照；其他账户失败不影响当前账户", async () => {
  const snapshot = current();
  const snapshots = [snapshot, { id: "other", selected: false, success: false }];
  const { controller, state, status, calls } = setup(() => snapshots);
  await controller.refreshQuota();
  assert.deepEqual(calls, ["read_account_quotas"]);
  assert.equal(state.snapshots, snapshots);
  assert.equal(state.rendered, snapshot);
  assert.equal(state.notified[0], snapshot);
  assert.equal(controller.getLatestQuotaSyncedAt(), 1_700_000_000_000);
  assert.equal(status.dataset.kind, "normal");
});

test("当前账户失败时底部保持失败，重置计时器和其他账户成功都不能伪装已同步", async (context) => {
  context.mock.method(console, "error", () => {});
  const { controller, state, status } = setup(() => [current({ success: false, error: "query timeout" }), { selected: false, success: true }]);
  await controller.refreshQuota();
  controller.resetAutoRefreshSchedule();
  assert.equal(status.dataset.kind, "warning");
  assert.equal(controller.getLatestQuota(), null);
  assert.equal(controller.getLatestQuotaSyncedAt(), null);
  assert.equal(state.snapshots.length, 2);
  assert.equal(state.orbFailed, true);
  assert.equal(state.notified.length, 0);
});

test("没有当前登录时保留其他账户列表，不将其冒充当前账户", async (context) => {
  context.mock.method(console, "error", () => {});
  const other = { id: "other", selected: false, success: true };
  const { controller, state, status } = setup(() => [other]);
  await controller.refreshQuota();
  assert.deepEqual(state.snapshots, [other]);
  assert.equal(controller.getLatestQuota(), null);
  assert.equal(status.dataset.kind, "warning");
});

test("首次成功后刷新失败不更新最近同步，悬浮球明确标记失败", async (context) => {
  context.mock.method(console, "error", () => {});
  let results = [current()];
  const { controller, state } = setup(() => results);
  await controller.refreshQuota();
  const syncedAt = controller.getLatestQuotaSyncedAt();
  results = [current({ success: false, error: "expired" })];
  await controller.refreshQuota();
  assert.equal(controller.getLatestQuotaSyncedAt(), syncedAt);
  assert.equal(controller.getLatestQuota(), null);
  assert.equal(state.orbFailed, true);
});

test("重叠刷新只发一次请求，账户切换前的旧结果不会覆盖新账户", async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const { controller, state, calls } = setup(() => pending);
  const first = controller.refreshQuota();
  await controller.refreshQuota();
  assert.equal(calls.length, 1);
  const paused = controller.pauseForAccountChange();
  resolve([current()]);
  await Promise.all([first, paused]);
  assert.equal(controller.getLatestQuota(), null);
  assert.equal(state.notified.length, 0);
  controller.resumeAfterAccountChange(true);
  assert.deepEqual(state.snapshots, []);
});

test("批量调用失败会结束加载并进入可重试状态", async (context) => {
  context.mock.method(console, "error", () => {});
  const { controller, state, status } = setup(() => { throw new Error("IPC failure"); });
  await controller.refreshQuota();
  assert.equal(state.loading, false);
  assert.equal(status.dataset.kind, "warning");
  assert.equal(controller.isRefreshing(), false);
  assert.ok(controller.getNextAutoRefreshDelayMs() > 0);
});
