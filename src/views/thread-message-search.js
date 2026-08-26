/**
 * 管理会话消息搜索的关键词、命中项与导航状态。
 * 通过回调请求外层重绘，因而不耦合消息卡片的 DOM 结构或滚动容器。
 */
export function createThreadMessageSearch({
  t,
  input,
  result,
  onChange,
}) {
  let messages = [];
  let matchedIndexes = [];
  let activeMatchIndex = 0;

  function normalize(value) {
    return String(value ?? "").toLocaleLowerCase();
  }

  function updateMatches(resetActiveMatch = false) {
    const keyword = normalize(input.value.trim());
    matchedIndexes = !keyword
      ? []
      : messages
        .map((message, index) => (normalize(message.text).includes(keyword) ? index : -1))
        .filter((index) => index >= 0);
    if (resetActiveMatch || activeMatchIndex >= matchedIndexes.length) activeMatchIndex = 0;
  }

  function renderControls() {
    const hasKeyword = Boolean(input.value.trim());
    const hasMatches = matchedIndexes.length > 0;
    input.ariaLabel = t("searchThreadMessages");
    result.textContent = !hasKeyword
      ? ""
      : hasMatches
        ? t("threadSearchMatches", { current: activeMatchIndex + 1, total: matchedIndexes.length })
        : t("threadSearchNoMatches");
  }

  function notifyChange(focusCurrentMatch) {
    onChange({ focusCurrentMatch });
  }

  function moveToMatch(direction) {
    if (matchedIndexes.length === 0) return;
    activeMatchIndex = (activeMatchIndex + direction + matchedIndexes.length) % matchedIndexes.length;
    renderControls();
    notifyChange(true);
  }

  function reset() {
    input.value = "";
    messages = [];
    matchedIndexes = [];
    activeMatchIndex = 0;
    renderControls();
  }

  function setMessages(nextMessages, { resetActiveMatch = false } = {}) {
    messages = Array.isArray(nextMessages) ? nextMessages : [];
    updateMatches(resetActiveMatch);
    renderControls();
  }

  function getState() {
    const activeMessageIndex = matchedIndexes[activeMatchIndex];
    return {
      keyword: normalize(input.value.trim()),
      matchingIndexes: new Set(matchedIndexes),
      activeMessageIndex,
    };
  }

  function appendHighlightedText(target, value) {
    const text = String(value ?? "");
    const { keyword } = getState();
    if (!keyword) {
      target.textContent = text;
      return;
    }
    const normalizedText = normalize(text);
    let start = 0;
    let matchAt = normalizedText.indexOf(keyword, start);
    while (matchAt >= 0) {
      target.append(document.createTextNode(text.slice(start, matchAt)));
      const match = document.createElement("mark");
      match.textContent = text.slice(matchAt, matchAt + keyword.length);
      target.append(match);
      start = matchAt + keyword.length;
      matchAt = normalizedText.indexOf(keyword, start);
    }
    target.append(document.createTextNode(text.slice(start)));
  }

  input.addEventListener("input", () => {
    updateMatches(true);
    renderControls();
    notifyChange(true);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    moveToMatch(event.shiftKey ? -1 : 1);
  });
  return { reset, setMessages, getState, appendHighlightedText, updateLanguage: renderControls };
}
