const SIDEBAR_FILE_LIMIT = 6;

function formatTokens(value) {
  return String(Math.round(Number(value) || 0));
}

function createSection(title, className = "") {
  const section = document.createElement("section");
  section.className = `thread-overview-section ${className}`.trim();
  const heading = document.createElement("h4");
  heading.textContent = title;
  section.append(heading);
  return section;
}

function createInfoRow(label, value, { code = false } = {}) {
  const row = document.createElement("div");
  row.className = "thread-overview-info-row";
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement(code ? "code" : "dd");
  description.textContent = value || "—";
  description.title = value || "";
  row.append(term, description);
  return row;
}

function fileEntries(detail) {
  if (Array.isArray(detail.fileChanges)) {
    return detail.fileChanges.map((change) => ({ activity: { changes: [change] }, change }));
  }
  return (detail.messages ?? []).flatMap((message) => (message.activities ?? [])
    .filter((activity) => activity.kind === "file")
    .flatMap((activity) => (activity.changes ?? []).map((change) => ({ activity, change }))));
}

function issueEntries(detail) {
  if (Array.isArray(detail.issues)) return detail.issues;
  return (detail.messages ?? []).flatMap((message) => (message.activities ?? [])
    .filter((activity) => activity.kind === "issue" || ["failed", "interrupted"].includes(activity.status)));
}

function fileChangeTypeLabel(t, changeType) {
  const key = {
    add: "fileChangeTypeAdd",
    delete: "fileChangeTypeDelete",
    update: "fileChangeTypeUpdate",
  }[changeType];
  return t(key ?? "fileChangeTypeUpdate");
}

/**
 * 左栏会话概览独立管理基础信息、文件、异常和 Token 明细，避免详情弹窗承担过多渲染职责。
 */
export function createThreadOverviewView({ t, formatUpdated, onViewFileChange }) {
  const overview = document.querySelector("#thread-overview");
  let currentDetail = null;
  let showAllFiles = false;
  let filesOpen = false;
  let issuesOpen = false;
  let tokenOpen = true;

  function renderBasicInfo(detail) {
    const section = createSection(t("threadBasicInfo"));
    const list = document.createElement("dl");
    list.className = "thread-overview-info-list";
    list.append(
      createInfoRow(t("threadCreatedLabel"), formatUpdated(detail.createdAt)),
      createInfoRow(t("threadUpdatedLabel"), formatUpdated(detail.updatedAt)),
      createInfoRow(t("threadIdLabel"), detail.id, { code: true }),
    );
    section.append(list);
    return section;
  }

  function renderFileChanges(detail) {
    const files = fileEntries(detail);
    const disclosure = document.createElement("details");
    disclosure.className = "thread-overview-disclosure";
    disclosure.open = filesOpen;
    disclosure.addEventListener("toggle", () => { filesOpen = disclosure.open; });
    const summary = document.createElement("summary");
    const title = document.createElement("strong");
    title.textContent = t("threadFileChangesRecord");
    const count = document.createElement("span");
    count.textContent = t("threadRecordCount", { count: files.length });
    summary.append(title, count);
    disclosure.append(summary);

    const list = document.createElement("div");
    list.className = "thread-overview-record-list";
    const visibleFiles = showAllFiles ? files : files.slice(0, SIDEBAR_FILE_LIMIT);
    if (visibleFiles.length === 0) {
      const empty = document.createElement("p");
      empty.className = "thread-overview-empty";
      empty.textContent = t("threadNoFileChanges");
      list.append(empty);
    }
    for (const { activity, change } of visibleFiles) {
      const row = document.createElement("button");
      row.className = "thread-overview-file-row";
      row.type = "button";
      row.title = change.path;
      const path = document.createElement("code");
      path.textContent = change.path;
      const kind = document.createElement("span");
      kind.textContent = fileChangeTypeLabel(t, change.changeType);
      row.append(path, kind);
      row.addEventListener("click", () => onViewFileChange({ ...activity, changes: [change] }));
      list.append(row);
    }
    if (files.length > SIDEBAR_FILE_LIMIT) {
      const toggle = document.createElement("button");
      toggle.className = "thread-overview-view-all";
      toggle.type = "button";
      toggle.textContent = showAllFiles ? t("threadCollapseRecords") : t("threadViewAllRecords");
      toggle.addEventListener("click", () => {
        showAllFiles = !showAllFiles;
        render();
      });
      list.append(toggle);
    }
    disclosure.append(list);
    return disclosure;
  }

  function renderIssues(detail) {
    const issues = issueEntries(detail);
    const disclosure = document.createElement("details");
    disclosure.className = "thread-overview-disclosure thread-overview-issues";
    disclosure.open = issuesOpen;
    disclosure.addEventListener("toggle", () => { issuesOpen = disclosure.open; });
    const summary = document.createElement("summary");
    const title = document.createElement("strong");
    title.textContent = t("threadIssuesRecord");
    const count = document.createElement("span");
    count.textContent = t("threadRecordCount", { count: issues.length });
    summary.append(title, count);
    disclosure.append(summary);

    const list = document.createElement("div");
    list.className = "thread-overview-record-list";
    if (issues.length === 0) {
      const empty = document.createElement("p");
      empty.className = "thread-overview-empty";
      empty.textContent = t("threadNoIssues");
      list.append(empty);
    }
    for (const issue of issues) {
      const row = document.createElement("article");
      row.className = "thread-overview-issue-row";
      const title = document.createElement("strong");
      title.textContent = issue.title || t("threadStatusUnknown");
      row.append(title);
      if (issue.detail) {
        const detailText = document.createElement("span");
        detailText.textContent = issue.detail;
        row.append(detailText);
      }
      list.append(row);
    }
    disclosure.append(list);
    return disclosure;
  }

  function renderTokenUsage(detail) {
    const disclosure = document.createElement("details");
    disclosure.className = "thread-overview-disclosure";
    disclosure.open = tokenOpen;
    disclosure.addEventListener("toggle", () => { tokenOpen = disclosure.open; });
    const summary = document.createElement("summary");
    const title = document.createElement("strong");
    title.textContent = t("threadTokenUsage");
    summary.append(title);
    disclosure.append(summary);

    const usage = detail.tokenUsage;
    const content = document.createElement("div");
    content.className = "thread-token-usage";
    if (!usage) {
      const empty = document.createElement("p");
      empty.className = "thread-overview-empty";
      empty.textContent = t("threadTokenUnavailable");
      content.append(empty);
    } else {
      const total = document.createElement("strong");
      total.textContent = t("threadTokenTotal", { total: formatTokens(usage.totalTokens) });
      const inputOutput = document.createElement("span");
      inputOutput.textContent = t("threadTokenInputOutput", {
        input: formatTokens(usage.inputTokens),
        output: formatTokens(usage.outputTokens),
      });
      const cached = document.createElement("span");
      cached.textContent = t("threadTokenCached", { tokens: formatTokens(usage.cachedInputTokens) });
      const reasoning = document.createElement("span");
      reasoning.textContent = t("threadTokenReasoning", { tokens: formatTokens(usage.reasoningOutputTokens) });
      const tool = document.createElement("span");
      tool.textContent = t("threadTokenToolsUnavailable");
      content.append(total, inputOutput, cached, reasoning, tool);
    }
    disclosure.append(content);
    return disclosure;
  }

  function render() {
    overview.replaceChildren();
    if (!currentDetail) return;
    overview.append(
      renderBasicInfo(currentDetail),
      renderFileChanges(currentDetail),
      renderIssues(currentDetail),
      renderTokenUsage(currentDetail),
    );
  }

  function setDetail(detail) {
    currentDetail = detail;
    showAllFiles = false;
    render();
  }

  function clear() {
    currentDetail = null;
    showAllFiles = false;
    filesOpen = false;
    issuesOpen = false;
    tokenOpen = true;
    overview.replaceChildren();
  }

  return { setDetail, clear, updateLanguage: render };
}
