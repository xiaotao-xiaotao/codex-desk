import { readStoredEnum, writeStoredValue } from "./utils/browser-storage.js";

const LANGUAGE_STORAGE_KEY = "codex-desk-language";
const SUPPORTED_LANGUAGES = ["system", "zh-CN", "zh-TW", "en", "ja", "ko"];

export const LANGUAGE_OPTIONS = [
  { value: "system", labelKey: "languageSystem" },
  { value: "zh-CN", labelKey: "languageZhCN" },
  { value: "zh-TW", labelKey: "languageZhTW" },
  { value: "en", labelKey: "languageEn" },
  { value: "ja", labelKey: "languageJa" },
  { value: "ko", labelKey: "languageKo" },
];

const LOCALE_BY_LANGUAGE = {
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
  en: "en-US",
  ja: "ja-JP",
  ko: "ko-KR",
};

// 翻译资源独立维护，避免页面控制器混入大段文案与语言判断。
const TRANSLATIONS = {
  "zh-CN": {
    appTitle: "Codex 桌面控制台", secureAccess: "本机安全访问", remaining: "剩余", accountUsage: "账户用量", quotaOverview: "额度概览", quotaWindow: "额度窗口", quotaWindowDays: "{count} 天额度", quotaWindowHours: "{count} 小时额度", quotaWindowMinutes: "{count} 分钟额度", localHistory: "本地历史", recentThreads: "最近会话", searchThreads: "搜索最近会话", searchPlaceholder: "搜索标题或会话 ID", localOnly: "仅从本机读取", previousPage: "上一页", nextPage: "下一页", threadDetail: "会话详情", closeThreadDetail: "关闭会话详情", minimize: "最小化到系统托盘", collapse: "收起为悬浮球", refresh: "立即刷新", quit: "退出程序", expandOrb: "展开 Codex 额度详情", collapseOrb: "收起 Codex 桌面控制台", orbTitle: "短按展开，按住后拖动", theme: "主题", themeSystem: "跟随系统", themeLight: "浅色", themeDark: "深色", language: "语言", languageSystem: "跟随系统", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "正在读取本地 Codex 数据…", readingThread: "正在读取会话…", readingSearch: "正在搜索…", readFailed: "读取失败：{error}", threadReadFailed: "会话读取失败，请确认当前 Codex 版本支持会话列表。", noMatches: "没有匹配的最近会话。", noThreads: "暂无可显示的本地会话。", searchMatches: "匹配到 {total} 条", searchTotal: "共 {total} 条", viewingThread: "查看会话：{title}", copyId: "复制 ID", copied: "已复制", copyFailed: "失败", copy: "复制", copyFailedLong: "复制失败", updated: "最近更新：{value}", updatedUnknown: "更新时间未知", resetUnknown: "重置时间未知", resetTime: "重置时间：{value}", usedRemaining: "已使用 {used}% · {remaining}", resetCredits: "可用重置额度：{credits}", syncedStatus: "本地 Codex 已同步{plan}（仅从本机读取 · {seconds} 秒后自动刷新）", planPrefix: " · {plan}", threadTruncated: "该会话较长，仅显示最近 120 条消息。", noMessages: "该会话没有可展示的用户消息或 Codex 回复。", you: "你", codex: "Codex", windowResizeFailed: "无法调整悬浮窗：{error}", initializationFailed: "初始化失败：{error}", clipboardDenied: "系统未允许复制到剪贴板",
  },
  "zh-TW": {
    appTitle: "Codex 桌面控制台", secureAccess: "本機安全存取", remaining: "剩餘", accountUsage: "帳戶用量", quotaOverview: "額度總覽", quotaWindow: "額度視窗", quotaWindowDays: "{count} 天額度", quotaWindowHours: "{count} 小時額度", quotaWindowMinutes: "{count} 分鐘額度", localHistory: "本機歷程", recentThreads: "最近工作階段", searchThreads: "搜尋最近工作階段", searchPlaceholder: "搜尋標題或工作階段 ID", localOnly: "僅從本機讀取", previousPage: "上一頁", nextPage: "下一頁", threadDetail: "工作階段詳情", closeThreadDetail: "關閉工作階段詳情", minimize: "最小化到系統匣", collapse: "收合為浮動球", refresh: "立即重新整理", quit: "結束程式", expandOrb: "展開 Codex 額度詳情", collapseOrb: "收合 Codex 桌面控制台", orbTitle: "短按展開，按住後拖曳", theme: "主題", themeSystem: "跟隨系統", themeLight: "淺色", themeDark: "深色", language: "語言", languageSystem: "跟隨系統", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "正在讀取本機 Codex 資料…", readingThread: "正在讀取工作階段…", readingSearch: "正在搜尋…", readFailed: "讀取失敗：{error}", threadReadFailed: "工作階段讀取失敗，請確認目前 Codex 版本支援工作階段清單。", noMatches: "沒有符合的最近工作階段。", noThreads: "暫無可顯示的本機工作階段。", searchMatches: "符合 {total} 筆", searchTotal: "共 {total} 筆", viewingThread: "檢視工作階段：{title}", copyId: "複製 ID", copied: "已複製", copyFailed: "失敗", copy: "複製", copyFailedLong: "複製失敗", updated: "最近更新：{value}", updatedUnknown: "更新時間未知", resetUnknown: "重設時間未知", resetTime: "重設時間：{value}", usedRemaining: "已使用 {used}% · {remaining}", resetCredits: "可用重設額度：{credits}", syncedStatus: "本機 Codex 已同步{plan}（僅從本機讀取 · {seconds} 秒後自動重新整理）", planPrefix: " · {plan}", threadTruncated: "此工作階段較長，僅顯示最近 120 則訊息。", noMessages: "此工作階段沒有可顯示的使用者訊息或 Codex 回覆。", you: "你", codex: "Codex", windowResizeFailed: "無法調整浮動視窗：{error}", initializationFailed: "初始化失敗：{error}", clipboardDenied: "系統未允許複製到剪貼簿",
  },
  en: {
    appTitle: "Codex Desk", secureAccess: "Local secure access", remaining: "Left", accountUsage: "ACCOUNT USAGE", quotaOverview: "Quota overview", quotaWindow: "Quota window", quotaWindowDays: "{count} days", quotaWindowHours: "{count} hours", quotaWindowMinutes: "{count} min", localHistory: "LOCAL HISTORY", recentThreads: "Recent sessions", searchThreads: "Search recent sessions", searchPlaceholder: "Search title or session ID", localOnly: "Local data only", previousPage: "Previous", nextPage: "Next", threadDetail: "Session details", closeThreadDetail: "Close session details", minimize: "Minimize to system tray", collapse: "Collapse to floating orb", refresh: "Refresh now", quit: "Quit", expandOrb: "Expand Codex quota details", collapseOrb: "Collapse Codex Desk", orbTitle: "Click to expand, drag to move", theme: "Theme", themeSystem: "System", themeLight: "Light", themeDark: "Dark", language: "Language", languageSystem: "System", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "Reading local Codex data…", readingThread: "Reading session…", readingSearch: "Searching…", readFailed: "Read failed: {error}", threadReadFailed: "Could not read sessions. Confirm that this Codex version supports session lists.", noMatches: "No matching recent sessions.", noThreads: "No local sessions to display.", searchMatches: "{total} matches", searchTotal: "{total} total", viewingThread: "View session: {title}", copyId: "Copy ID", copied: "Copied", copyFailed: "Failed", copy: "Copy", copyFailedLong: "Copy failed", updated: "Last updated: {value}", updatedUnknown: "Update time unavailable", resetUnknown: "Reset time unavailable", resetTime: "Resets: {value}", usedRemaining: "{used}% used · {remaining}", resetCredits: "Reset credits available: {credits}", syncedStatus: "Local Codex synced{plan} (local data only · refreshes in {seconds}s)", planPrefix: " · {plan}", threadTruncated: "This session is long; only the latest 120 messages are shown.", noMessages: "This session has no user messages or Codex replies to display.", you: "You", codex: "Codex", windowResizeFailed: "Could not resize floating window: {error}", initializationFailed: "Initialization failed: {error}", clipboardDenied: "The system did not allow clipboard access",
  },
  ja: {
    appTitle: "Codex デスク", secureAccess: "ローカルの安全なアクセス", remaining: "残り", accountUsage: "アカウント使用量", quotaOverview: "クォータ概要", quotaWindow: "クォータ枠", quotaWindowDays: "{count} 日枠", quotaWindowHours: "{count} 時間枠", quotaWindowMinutes: "{count} 分枠", localHistory: "ローカル履歴", recentThreads: "最近のセッション", searchThreads: "最近のセッションを検索", searchPlaceholder: "タイトルまたはセッション ID を検索", localOnly: "ローカルデータのみ", previousPage: "前へ", nextPage: "次へ", threadDetail: "セッション詳細", closeThreadDetail: "セッション詳細を閉じる", minimize: "システムトレイへ最小化", collapse: "フローティングボールに縮小", refresh: "今すぐ更新", quit: "終了", expandOrb: "Codex のクォータ詳細を開く", collapseOrb: "Codex デスクを縮小", orbTitle: "クリックで展開、ドラッグで移動", theme: "テーマ", themeSystem: "システム", themeLight: "ライト", themeDark: "ダーク", language: "言語", languageSystem: "システムに従う", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "ローカルの Codex データを読み込み中…", readingThread: "セッションを読み込み中…", readingSearch: "検索中…", readFailed: "読み込みに失敗しました：{error}", threadReadFailed: "セッションを読み込めません。現在の Codex バージョンがセッション一覧に対応しているか確認してください。", noMatches: "一致する最近のセッションはありません。", noThreads: "表示できるローカルセッションはありません。", searchMatches: "{total} 件一致", searchTotal: "合計 {total} 件", viewingThread: "セッションを表示：{title}", copyId: "ID をコピー", copied: "コピー済み", copyFailed: "失敗", copy: "コピー", copyFailedLong: "コピーに失敗", updated: "最終更新：{value}", updatedUnknown: "更新時刻は不明です", resetUnknown: "リセット時刻は不明です", resetTime: "リセット：{value}", usedRemaining: "使用済み {used}% · {remaining}", resetCredits: "利用可能なリセットクレジット：{credits}", syncedStatus: "ローカル Codex を同期済み{plan}（ローカルデータのみ · {seconds} 秒後に自動更新）", planPrefix: " · {plan}", threadTruncated: "このセッションは長いため、最新 120 件のメッセージのみ表示します。", noMessages: "このセッションには表示できるユーザーメッセージまたは Codex の返信がありません。", you: "あなた", codex: "Codex", windowResizeFailed: "フローティングウィンドウを変更できません：{error}", initializationFailed: "初期化に失敗しました：{error}", clipboardDenied: "システムでクリップボードへのアクセスが許可されていません",
  },
  ko: {
    appTitle: "Codex 데스크", secureAccess: "로컬 보안 액세스", remaining: "남음", accountUsage: "계정 사용량", quotaOverview: "할당량 개요", quotaWindow: "할당량 창", quotaWindowDays: "{count}일 할당량", quotaWindowHours: "{count}시간 할당량", quotaWindowMinutes: "{count}분 할당량", localHistory: "로컬 기록", recentThreads: "최근 세션", searchThreads: "최근 세션 검색", searchPlaceholder: "제목 또는 세션 ID 검색", localOnly: "로컬 데이터만", previousPage: "이전", nextPage: "다음", threadDetail: "세션 세부 정보", closeThreadDetail: "세션 세부 정보 닫기", minimize: "시스템 트레이로 최소화", collapse: "플로팅 버튼으로 접기", refresh: "지금 새로 고침", quit: "종료", expandOrb: "Codex 할당량 세부 정보 펼치기", collapseOrb: "Codex 데스크 접기", orbTitle: "클릭하여 펼치고 드래그하여 이동", theme: "테마", themeSystem: "시스템", themeLight: "라이트", themeDark: "다크", language: "언어", languageSystem: "시스템 설정", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "로컬 Codex 데이터를 읽는 중…", readingThread: "세션을 읽는 중…", readingSearch: "검색 중…", readFailed: "읽기 실패: {error}", threadReadFailed: "세션을 읽을 수 없습니다. 현재 Codex 버전이 세션 목록을 지원하는지 확인하세요.", noMatches: "일치하는 최근 세션이 없습니다.", noThreads: "표시할 로컬 세션이 없습니다.", searchMatches: "{total}개 일치", searchTotal: "총 {total}개", viewingThread: "세션 보기: {title}", copyId: "ID 복사", copied: "복사됨", copyFailed: "실패", copy: "복사", copyFailedLong: "복사 실패", updated: "최근 업데이트: {value}", updatedUnknown: "업데이트 시간을 알 수 없습니다", resetUnknown: "재설정 시간을 알 수 없습니다", resetTime: "재설정: {value}", usedRemaining: "{used}% 사용 · {remaining}", resetCredits: "사용 가능한 재설정 크레딧: {credits}", syncedStatus: "로컬 Codex 동기화됨{plan}(로컬 데이터만 · {seconds}초 후 자동 새로 고침)", planPrefix: " · {plan}", threadTruncated: "세션이 길어 최근 메시지 120개만 표시합니다.", noMessages: "표시할 사용자 메시지 또는 Codex 응답이 없습니다.", you: "나", codex: "Codex", windowResizeFailed: "플로팅 창 크기를 조정할 수 없습니다: {error}", initializationFailed: "초기화 실패: {error}", clipboardDenied: "시스템에서 클립보드 액세스를 허용하지 않았습니다",
  },
};

// 会话洞察独立于页面基础文案维护，后续新增数据卡片时无需展开每个页面翻译对象。
const ANALYTICS_TRANSLATIONS = {
  "zh-CN": {
    insightMessages: "消息",
    insightToolCalls: "工具",
    insightFileChanges: "文件变更",
    insightIssues: "异常",
    recentActivity: "近期操作",
    activitySummaryHint: "展开查看结构化记录",
    noStructuredActivity: "此会话暂未记录可展示的工具、文件或异常操作。",
    activityStatusCompleted: "完成",
    activityStatusInProgress: "进行中",
    activityStatusFailed: "失败",
    activityStatusInterrupted: "中断",
    activityStatusUnknown: "未知",
    trendKicker: "活动洞察",
    trendTitle: "近 7 天趋势",
    trendMessages: "消息",
    trendToolCalls: "工具",
    trendFileChanges: "文件变更",
    trendIssues: "异常",
    trendLoading: "正在聚合近 7 天会话数据…",
    trendUnavailable: "趋势数据暂时不可用。",
    trendNoData: "近 7 天暂无可展示的会话活动。",
    trendTotal: "近 {days} 天合计 {total}",
  },
  "zh-TW": {
    insightMessages: "訊息",
    insightToolCalls: "工具",
    insightFileChanges: "檔案變更",
    insightIssues: "異常",
    recentActivity: "近期操作",
    activitySummaryHint: "展開檢視結構化記錄",
    noStructuredActivity: "此工作階段暫未記錄可顯示的工具、檔案或異常操作。",
    activityStatusCompleted: "完成",
    activityStatusInProgress: "進行中",
    activityStatusFailed: "失敗",
    activityStatusInterrupted: "中斷",
    activityStatusUnknown: "未知",
    trendKicker: "活動洞察",
    trendTitle: "近 7 天趨勢",
    trendMessages: "訊息",
    trendToolCalls: "工具",
    trendFileChanges: "檔案變更",
    trendIssues: "異常",
    trendLoading: "正在彙整近 7 天工作階段資料…",
    trendUnavailable: "趨勢資料暫時無法使用。",
    trendNoData: "近 7 天暫無可顯示的工作階段活動。",
    trendTotal: "近 {days} 天合計 {total}",
  },
  en: {
    insightMessages: "Messages",
    insightToolCalls: "Tools",
    insightFileChanges: "File changes",
    insightIssues: "Issues",
    recentActivity: "Recent activity",
    activitySummaryHint: "Show structured events",
    noStructuredActivity: "No tools, file changes, or issues were recorded for this session.",
    activityStatusCompleted: "Completed",
    activityStatusInProgress: "In progress",
    activityStatusFailed: "Failed",
    activityStatusInterrupted: "Interrupted",
    activityStatusUnknown: "Unknown",
    trendKicker: "ACTIVITY INSIGHTS",
    trendTitle: "Last 7 days",
    trendMessages: "Messages",
    trendToolCalls: "Tools",
    trendFileChanges: "File changes",
    trendIssues: "Issues",
    trendLoading: "Aggregating the last 7 days…",
    trendUnavailable: "Trend data is temporarily unavailable.",
    trendNoData: "No session activity to show in the last 7 days.",
    trendTotal: "{total} in {days} days",
  },
  ja: {
    insightMessages: "メッセージ",
    insightToolCalls: "ツール",
    insightFileChanges: "ファイル変更",
    insightIssues: "問題",
    recentActivity: "最近の操作",
    activitySummaryHint: "構造化ログを表示",
    noStructuredActivity: "このセッションには表示できるツール、ファイル変更、問題の記録がありません。",
    activityStatusCompleted: "完了",
    activityStatusInProgress: "進行中",
    activityStatusFailed: "失敗",
    activityStatusInterrupted: "中断",
    activityStatusUnknown: "不明",
    trendKicker: "アクティビティ分析",
    trendTitle: "過去 7 日間の推移",
    trendMessages: "メッセージ",
    trendToolCalls: "ツール",
    trendFileChanges: "ファイル変更",
    trendIssues: "問題",
    trendLoading: "過去 7 日間のデータを集計中…",
    trendUnavailable: "推移データを一時的に取得できません。",
    trendNoData: "過去 7 日間に表示できるセッション活動はありません。",
    trendTotal: "過去 {days} 日間の合計 {total}",
  },
  ko: {
    insightMessages: "메시지",
    insightToolCalls: "도구",
    insightFileChanges: "파일 변경",
    insightIssues: "문제",
    recentActivity: "최근 작업",
    activitySummaryHint: "구조화된 기록 펼치기",
    noStructuredActivity: "이 세션에는 표시할 도구, 파일 변경 또는 문제 기록이 없습니다.",
    activityStatusCompleted: "완료",
    activityStatusInProgress: "진행 중",
    activityStatusFailed: "실패",
    activityStatusInterrupted: "중단됨",
    activityStatusUnknown: "알 수 없음",
    trendKicker: "활동 인사이트",
    trendTitle: "최근 7일 추이",
    trendMessages: "메시지",
    trendToolCalls: "도구",
    trendFileChanges: "파일 변경",
    trendIssues: "문제",
    trendLoading: "최근 7일 데이터를 집계하는 중…",
    trendUnavailable: "추이 데이터를 일시적으로 사용할 수 없습니다.",
    trendNoData: "최근 7일 동안 표시할 세션 활동이 없습니다.",
    trendTotal: "최근 {days}일 합계 {total}",
  },
};

// 会话清单文案明确时间字段和消息总数，避免误读为会话数量。
const SESSION_ANALYTICS_TRANSLATIONS = {
  "zh-CN": {
    recentThreads: "最近更新的会话",
    searchThreads: "搜索最近更新的会话",
    searchTotal: "已加载 {total} 个会话（最多 {limit} 个）",
    updated: "最后更新：{value}",
    created: "创建：{value}",
    threadTruncated: "该会话较长，仅显示最近 500 条消息。",
  },
  "zh-TW": {
    recentThreads: "最近更新的工作階段",
    searchThreads: "搜尋最近更新的工作階段",
    searchTotal: "已載入 {total} 個工作階段（最多 {limit} 個）",
    updated: "最後更新：{value}",
    created: "建立：{value}",
    threadTruncated: "此工作階段較長，僅顯示最近 500 則訊息。",
  },
  en: {
    recentThreads: "Recently updated sessions",
    searchThreads: "Search recently updated sessions",
    searchTotal: "Loaded {total} sessions (up to {limit})",
    updated: "Last updated: {value}",
    created: "Created: {value}",
    threadTruncated: "This session is long; only the latest 500 messages are shown.",
  },
  ja: {
    recentThreads: "最近更新したセッション",
    searchThreads: "最近更新したセッションを検索",
    searchTotal: "読み込み済み {total} セッション（最大 {limit}）",
    updated: "最終更新：{value}",
    created: "作成：{value}",
    threadTruncated: "このセッションは長いため、最新 500 件のメッセージのみ表示します。",
  },
  ko: {
    recentThreads: "최근 업데이트된 세션",
    searchThreads: "최근 업데이트된 세션 검색",
    searchTotal: "{total}개 세션 로드됨(최대 {limit}개)",
    updated: "마지막 업데이트: {value}",
    created: "생성: {value}",
    threadTruncated: "세션이 길어 최근 메시지 500개만 표시합니다.",
  },
};

function resolveSystemLanguage() {
  const locales = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const locale of locales) {
    const normalized = String(locale || "").toLowerCase();
    if (normalized.startsWith("zh-hant") || normalized.startsWith("zh-tw") || normalized.startsWith("zh-hk") || normalized.startsWith("zh-mo")) return "zh-TW";
    if (normalized.startsWith("zh")) return "zh-CN";
    if (normalized.startsWith("ja")) return "ja";
    if (normalized.startsWith("ko")) return "ko";
    if (normalized.startsWith("en")) return "en";
  }
  return "en";
}

/**
 * 将系统语言识别、用户偏好与文案插值统一在同一控制器中。
 * Windows WebView2 和 macOS WKWebView 均通过 navigator.language(s) 提供系统语言。
 */
export function createI18n() {
  let mode = readStoredEnum(LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES, "system");

  const getLanguage = () => (mode === "system" ? resolveSystemLanguage() : mode);
  const getLocale = () => LOCALE_BY_LANGUAGE[getLanguage()];
  const isSystemMode = () => mode === "system";
  const getMode = () => mode;
  const getLabelKey = (language = mode) => {
    const option = LANGUAGE_OPTIONS.find((item) => item.value === language);
    return option?.labelKey ?? "languageSystem";
  };
  const t = (key, values = {}) => {
    const language = getLanguage();
    const text = SESSION_ANALYTICS_TRANSLATIONS[language]?.[key]
      ?? ANALYTICS_TRANSLATIONS[language]?.[key]
      ?? TRANSLATIONS[language][key]
      ?? SESSION_ANALYTICS_TRANSLATIONS["zh-CN"]?.[key]
      ?? ANALYTICS_TRANSLATIONS["zh-CN"]?.[key]
      ?? TRANSLATIONS["zh-CN"][key]
      ?? key;
    return text.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
  };
  const setMode = (nextMode) => {
    mode = SUPPORTED_LANGUAGES.includes(nextMode) ? nextMode : "system";
    writeStoredValue(LANGUAGE_STORAGE_KEY, mode);
  };

  return { getLanguage, getLocale, getMode, getLabelKey, isSystemMode, setMode, t };
}
