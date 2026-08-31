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
    appTitle: "Codex 桌面控制台", secureAccess: "本机安全访问", remaining: "剩余", accountUsage: "账户用量", quotaOverview: "额度概览", quotaWindow: "额度窗口", quotaWindowDays: "{count} 天额度", quotaWindowHours: "{count} 小时额度", quotaWindowMinutes: "{count} 分钟额度", localHistory: "本地历史", recentThreads: "最近会话", searchThreads: "搜索最近会话", searchPlaceholder: "搜索标题或会话 ID", localOnly: "仅从本机读取", previousPage: "上一页", nextPage: "下一页", threadDetail: "会话详情", closeThreadDetail: "关闭会话详情", minimize: "最小化到系统托盘", collapse: "收起为悬浮球", refresh: "立即刷新", quit: "退出程序", expandOrb: "展开 Codex 额度详情", collapseOrb: "收起 Codex 桌面控制台", orbTitle: "短按展开，按住后拖动", theme: "主题", themeSystem: "跟随系统", themeLight: "浅色", themeDark: "深色", language: "语言", languageSystem: "跟随系统", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "正在读取本地 Codex 数据…", readingThread: "正在读取会话…", readingSearch: "正在搜索…", readFailed: "读取失败：{error}", threadReadFailed: "会话读取失败，请确认当前 Codex 版本支持会话列表。", noMatches: "没有匹配的最近会话。", noThreads: "暂无可显示的本地会话。", searchMatches: "匹配到 {total} 条", searchTotal: "共 {total} 条", viewingThread: "查看会话：{title}", copyId: "复制 ID", copyMessage: "复制消息", copied: "已复制", copyFailed: "失败", copy: "复制", copyFailedLong: "复制失败", updated: "最近更新：{value}", updatedUnknown: "更新时间未知", resetUnknown: "重置时间未知", resetTime: "重置时间：{value}", usedRemaining: "已使用 {used}% · {remaining}", resetCredits: "可用重置额度：{credits}", syncedStatus: "本地 Codex 已同步{plan}（仅从本机读取 · {seconds} 秒后自动刷新）", planPrefix: " · {plan}", threadTruncated: "该会话较长，仅显示最近 120 条消息。", noMessages: "该会话没有可展示的用户消息或 Codex 回复。", threadImage: "会话图片", you: "你", codex: "Codex", windowResizeFailed: "无法调整悬浮窗：{error}", windowMaximizeFailed: "无法切换窗口最大化：{error}", initializationFailed: "初始化失败：{error}", clipboardDenied: "系统未允许复制到剪贴板",
  },
  "zh-TW": {
    appTitle: "Codex 桌面控制台", secureAccess: "本機安全存取", remaining: "剩餘", accountUsage: "帳戶用量", quotaOverview: "額度總覽", quotaWindow: "額度視窗", quotaWindowDays: "{count} 天額度", quotaWindowHours: "{count} 小時額度", quotaWindowMinutes: "{count} 分鐘額度", localHistory: "本機歷程", recentThreads: "最近工作階段", searchThreads: "搜尋最近工作階段", searchPlaceholder: "搜尋標題或工作階段 ID", localOnly: "僅從本機讀取", previousPage: "上一頁", nextPage: "下一頁", threadDetail: "工作階段詳情", closeThreadDetail: "關閉工作階段詳情", minimize: "最小化到系統匣", collapse: "收合為浮動球", refresh: "立即重新整理", quit: "結束程式", expandOrb: "展開 Codex 額度詳情", collapseOrb: "收合 Codex 桌面控制台", orbTitle: "短按展開，按住後拖曳", theme: "主題", themeSystem: "跟隨系統", themeLight: "淺色", themeDark: "深色", language: "語言", languageSystem: "跟隨系統", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "正在讀取本機 Codex 資料…", readingThread: "正在讀取工作階段…", readingSearch: "正在搜尋…", readFailed: "讀取失敗：{error}", threadReadFailed: "工作階段讀取失敗，請確認目前 Codex 版本支援工作階段清單。", noMatches: "沒有符合的最近工作階段。", noThreads: "暫無可顯示的本機工作階段。", searchMatches: "符合 {total} 筆", searchTotal: "共 {total} 筆", viewingThread: "檢視工作階段：{title}", copyId: "複製 ID", copied: "已複製", copyFailed: "失敗", copy: "複製", copyFailedLong: "複製失敗", updated: "最近更新：{value}", updatedUnknown: "更新時間未知", resetUnknown: "重設時間未知", resetTime: "重設時間：{value}", usedRemaining: "已使用 {used}% · {remaining}", resetCredits: "可用重設額度：{credits}", syncedStatus: "本機 Codex 已同步{plan}（僅從本機讀取 · {seconds} 秒後自動重新整理）", planPrefix: " · {plan}", threadTruncated: "此工作階段較長，僅顯示最近 120 則訊息。", noMessages: "此工作階段沒有可顯示的使用者訊息或 Codex 回覆。", you: "你", codex: "Codex", windowResizeFailed: "無法調整浮動視窗：{error}", windowMaximizeFailed: "無法切換視窗最大化：{error}", initializationFailed: "初始化失敗：{error}", clipboardDenied: "系統未允許複製到剪貼簿",
  },
  en: {
    appTitle: "Codex Desk", secureAccess: "Local secure access", remaining: "Left", accountUsage: "ACCOUNT USAGE", quotaOverview: "Quota overview", quotaWindow: "Quota window", quotaWindowDays: "{count} days", quotaWindowHours: "{count} hours", quotaWindowMinutes: "{count} min", localHistory: "LOCAL HISTORY", recentThreads: "Recent sessions", searchThreads: "Search recent sessions", searchPlaceholder: "Search title or session ID", localOnly: "Local data only", previousPage: "Previous", nextPage: "Next", threadDetail: "Session details", closeThreadDetail: "Close session details", minimize: "Minimize to system tray", collapse: "Collapse to floating orb", refresh: "Refresh now", quit: "Quit", expandOrb: "Expand Codex quota details", collapseOrb: "Collapse Codex Desk", orbTitle: "Click to expand, drag to move", theme: "Theme", themeSystem: "System", themeLight: "Light", themeDark: "Dark", language: "Language", languageSystem: "System", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "Reading local Codex data…", readingThread: "Reading session…", readingSearch: "Searching…", readFailed: "Read failed: {error}", threadReadFailed: "Could not read sessions. Confirm that this Codex version supports session lists.", noMatches: "No matching recent sessions.", noThreads: "No local sessions to display.", searchMatches: "{total} matches", searchTotal: "{total} total", viewingThread: "View session: {title}", copyId: "Copy ID", copied: "Copied", copyFailed: "Failed", copy: "Copy", copyFailedLong: "Copy failed", updated: "Last updated: {value}", updatedUnknown: "Update time unavailable", resetUnknown: "Reset time unavailable", resetTime: "Resets: {value}", usedRemaining: "{used}% used · {remaining}", resetCredits: "Reset credits: {credits}", syncedStatus: "Local Codex synced{plan} (local data only · refreshes in {seconds}s)", planPrefix: " · {plan}", threadTruncated: "This session is long; only the latest 120 messages are shown.", noMessages: "This session has no user messages or Codex replies to display.", you: "You", codex: "Codex", windowResizeFailed: "Could not resize floating window: {error}", windowMaximizeFailed: "Could not toggle window maximization: {error}", initializationFailed: "Initialization failed: {error}", clipboardDenied: "The system did not allow clipboard access",
  },
  ja: {
    appTitle: "Codex デスク", secureAccess: "ローカルの安全なアクセス", remaining: "残り", accountUsage: "アカウント使用量", quotaOverview: "クォータ概要", quotaWindow: "クォータ枠", quotaWindowDays: "{count} 日枠", quotaWindowHours: "{count} 時間枠", quotaWindowMinutes: "{count} 分枠", localHistory: "ローカル履歴", recentThreads: "最近のセッション", searchThreads: "最近のセッションを検索", searchPlaceholder: "タイトルまたはセッション ID を検索", localOnly: "ローカルデータのみ", previousPage: "前へ", nextPage: "次へ", threadDetail: "セッション詳細", closeThreadDetail: "セッション詳細を閉じる", minimize: "システムトレイへ最小化", collapse: "フローティングボールに縮小", refresh: "今すぐ更新", quit: "終了", expandOrb: "Codex のクォータ詳細を開く", collapseOrb: "Codex デスクを縮小", orbTitle: "クリックで展開、ドラッグで移動", theme: "テーマ", themeSystem: "システム", themeLight: "ライト", themeDark: "ダーク", language: "言語", languageSystem: "システムに従う", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "ローカルの Codex データを読み込み中…", readingThread: "セッションを読み込み中…", readingSearch: "検索中…", readFailed: "読み込みに失敗しました：{error}", threadReadFailed: "セッションを読み込めません。現在の Codex バージョンがセッション一覧に対応しているか確認してください。", noMatches: "一致する最近のセッションはありません。", noThreads: "表示できるローカルセッションはありません。", searchMatches: "{total} 件一致", searchTotal: "合計 {total} 件", viewingThread: "セッションを表示：{title}", copyId: "ID をコピー", copied: "コピー済み", copyFailed: "失敗", copy: "コピー", copyFailedLong: "コピーに失敗", updated: "最終更新：{value}", updatedUnknown: "更新時刻は不明です", resetUnknown: "リセット時刻は不明です", resetTime: "リセット：{value}", usedRemaining: "使用済み {used}% · {remaining}", resetCredits: "利用可能なリセットクレジット：{credits}", syncedStatus: "ローカル Codex を同期済み{plan}（ローカルデータのみ · {seconds} 秒後に自動更新）", planPrefix: " · {plan}", threadTruncated: "このセッションは長いため、最新 120 件のメッセージのみ表示します。", noMessages: "このセッションには表示できるユーザーメッセージまたは Codex の返信がありません。", you: "あなた", codex: "Codex", windowResizeFailed: "フローティングウィンドウを変更できません：{error}", windowMaximizeFailed: "ウィンドウの最大化を切り替えられません：{error}", initializationFailed: "初期化に失敗しました：{error}", clipboardDenied: "システムでクリップボードへのアクセスが許可されていません",
  },
  ko: {
    appTitle: "Codex 데스크", secureAccess: "로컬 보안 액세스", remaining: "남음", accountUsage: "계정 사용량", quotaOverview: "할당량 개요", quotaWindow: "할당량 창", quotaWindowDays: "{count}일 할당량", quotaWindowHours: "{count}시간 할당량", quotaWindowMinutes: "{count}분 할당량", localHistory: "로컬 기록", recentThreads: "최근 세션", searchThreads: "최근 세션 검색", searchPlaceholder: "제목 또는 세션 ID 검색", localOnly: "로컬 데이터만", previousPage: "이전", nextPage: "다음", threadDetail: "세션 세부 정보", closeThreadDetail: "세션 세부 정보 닫기", minimize: "시스템 트레이로 최소화", collapse: "플로팅 버튼으로 접기", refresh: "지금 새로 고침", quit: "종료", expandOrb: "Codex 할당량 세부 정보 펼치기", collapseOrb: "Codex 데스크 접기", orbTitle: "클릭하여 펼치고 드래그하여 이동", theme: "테마", themeSystem: "시스템", themeLight: "라이트", themeDark: "다크", language: "언어", languageSystem: "시스템 설정", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "로컬 Codex 데이터를 읽는 중…", readingThread: "세션을 읽는 중…", readingSearch: "검색 중…", readFailed: "읽기 실패: {error}", threadReadFailed: "세션을 읽을 수 없습니다. 현재 Codex 버전이 세션 목록을 지원하는지 확인하세요.", noMatches: "일치하는 최근 세션이 없습니다.", noThreads: "표시할 로컬 세션이 없습니다.", searchMatches: "{total}개 일치", searchTotal: "총 {total}개", viewingThread: "세션 보기: {title}", copyId: "ID 복사", copied: "복사됨", copyFailed: "실패", copy: "복사", copyFailedLong: "복사 실패", updated: "최근 업데이트: {value}", updatedUnknown: "업데이트 시간을 알 수 없습니다", resetUnknown: "재설정 시간을 알 수 없습니다", resetTime: "재설정: {value}", usedRemaining: "{used}% 사용 · {remaining}", resetCredits: "사용 가능한 재설정 크레딧: {credits}", syncedStatus: "로컬 Codex 동기화됨{plan}(로컬 데이터만 · {seconds}초 후 자동 새로 고침)", planPrefix: " · {plan}", threadTruncated: "세션이 길어 최근 메시지 120개만 표시합니다.", noMessages: "표시할 사용자 메시지 또는 Codex 응답이 없습니다.", you: "나", codex: "Codex", windowResizeFailed: "플로팅 창 크기를 조정할 수 없습니다: {error}", windowMaximizeFailed: "창 최대화 전환 실패: {error}", initializationFailed: "초기화 실패: {error}", clipboardDenied: "시스템에서 클립보드 액세스를 허용하지 않았습니다",
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
    activitySummaryHint: "点击查看",
    messageActivitySummary: "执行了 {count} 项操作",
    messageFileActivitySummary: "已编辑 {count} 个文件",
    noStructuredActivity: "此会话暂未记录可展示的工具、文件或异常操作。",
    activityStatusCompleted: "完成",
    activityStatusInProgress: "进行中",
    activityStatusFailed: "失败",
    activityStatusInterrupted: "中断",
    activityStatusUnknown: "未知",
    trendKicker: "活动洞察",
    trendTitle: "近 7 天趋势",
    trendRangeLabel: "趋势范围",
    trendRange3: "近3天趋势",
    trendRange7: "近7天趋势",
    trendRange30: "近30天趋势",
    trendMessages: "消息",
    trendToolCalls: "工具",
    trendFileChanges: "文件变更",
    trendIssues: "异常",
    trendTooltipDate: "日期",
    trendLoading: "正在聚合近 7 天会话数据…",
    trendUnavailable: "趋势数据暂时不可用。",
    trendNoData: "近 7 天暂无可展示的会话活动。",
    trendExpand: "双击放大全窗口趋势图",
    trendCollapse: "双击图表或按 Esc 退出放大视图",
    trendTotal: "合计：{total}",
  },
  "zh-TW": {
    insightMessages: "訊息",
    insightToolCalls: "工具",
    insightFileChanges: "檔案變更",
    insightIssues: "異常",
    recentActivity: "近期操作",
    activitySummaryHint: "點擊查看",
    messageActivitySummary: "已執行 {count} 項操作",
    messageFileActivitySummary: "已編輯 {count} 個檔案",
    noStructuredActivity: "此工作階段暫未記錄可顯示的工具、檔案或異常操作。",
    activityStatusCompleted: "完成",
    activityStatusInProgress: "進行中",
    activityStatusFailed: "失敗",
    activityStatusInterrupted: "中斷",
    activityStatusUnknown: "未知",
    trendKicker: "活動洞察",
    trendTitle: "近 7 天趨勢",
    trendRangeLabel: "趨勢範圍",
    trendRange3: "近3天趨勢",
    trendRange7: "近7天趨勢",
    trendRange30: "近30天趨勢",
    trendMessages: "訊息",
    trendToolCalls: "工具",
    trendFileChanges: "檔案變更",
    trendIssues: "異常",
    trendTooltipDate: "日期",
    trendLoading: "正在彙整近 7 天工作階段資料…",
    trendUnavailable: "趨勢資料暫時無法使用。",
    trendNoData: "近 7 天暫無可顯示的工作階段活動。",
    trendExpand: "按兩下放大全視窗趨勢圖",
    trendCollapse: "按兩下圖表或按 Esc 離開放大檢視",
    trendTotal: "合計：{total}",
  },
  en: {
    insightMessages: "Messages",
    insightToolCalls: "Tools",
    insightFileChanges: "File changes",
    insightIssues: "Issues",
    recentActivity: "Recent activity",
    activitySummaryHint: "View details",
    messageActivitySummary: "Ran {count} operations",
    messageFileActivitySummary: "Edited {count} files",
    noStructuredActivity: "No tools, file changes, or issues were recorded for this session.",
    activityStatusCompleted: "Completed",
    activityStatusInProgress: "In progress",
    activityStatusFailed: "Failed",
    activityStatusInterrupted: "Interrupted",
    activityStatusUnknown: "Unknown",
    trendKicker: "ACTIVITY INSIGHTS",
    trendTitle: "Last 7 days",
    trendRangeLabel: "Trend range",
    trendRange3: "Last 3 days",
    trendRange7: "Last 7 days",
    trendRange30: "Last 30 days",
    trendMessages: "Messages",
    trendToolCalls: "Tools",
    trendFileChanges: "File changes",
    trendIssues: "Issues",
    trendTooltipDate: "Date",
    trendLoading: "Aggregating the last 7 days…",
    trendUnavailable: "Trend data is temporarily unavailable.",
    trendNoData: "No session activity to show in the last 7 days.",
    trendExpand: "Double-click to expand the trend to the full window",
    trendCollapse: "Double-click the chart or press Esc to exit the expanded view",
    trendTotal: "Total: {total}",
  },
  ja: {
    insightMessages: "メッセージ",
    insightToolCalls: "ツール",
    insightFileChanges: "ファイル変更",
    insightIssues: "問題",
    recentActivity: "最近の操作",
    activitySummaryHint: "クリックして表示",
    messageActivitySummary: "{count} 件の操作を実行",
    messageFileActivitySummary: "{count} 個のファイルを編集",
    noStructuredActivity: "このセッションには表示できるツール、ファイル変更、問題の記録がありません。",
    activityStatusCompleted: "完了",
    activityStatusInProgress: "進行中",
    activityStatusFailed: "失敗",
    activityStatusInterrupted: "中断",
    activityStatusUnknown: "不明",
    trendKicker: "アクティビティ分析",
    trendTitle: "過去 7 日間の推移",
    trendRangeLabel: "期間",
    trendRange3: "過去3日間",
    trendRange7: "過去7日間",
    trendRange30: "過去30日間",
    trendMessages: "メッセージ",
    trendToolCalls: "ツール",
    trendFileChanges: "ファイル変更",
    trendIssues: "問題",
    trendTooltipDate: "日付",
    trendLoading: "過去 7 日間のデータを集計中…",
    trendUnavailable: "推移データを一時的に取得できません。",
    trendNoData: "過去 7 日間に表示できるセッション活動はありません。",
    trendExpand: "ダブルクリックで推移グラフをウィンドウいっぱいに拡大",
    trendCollapse: "グラフをダブルクリックするか Esc キーで拡大表示を終了",
    trendTotal: "合計：{total}",
  },
  ko: {
    insightMessages: "메시지",
    insightToolCalls: "도구",
    insightFileChanges: "파일 변경",
    insightIssues: "문제",
    recentActivity: "최근 작업",
    activitySummaryHint: "클릭하여 보기",
    messageActivitySummary: "작업 {count}개 실행",
    messageFileActivitySummary: "파일 {count}개 편집",
    noStructuredActivity: "이 세션에는 표시할 도구, 파일 변경 또는 문제 기록이 없습니다.",
    activityStatusCompleted: "완료",
    activityStatusInProgress: "진행 중",
    activityStatusFailed: "실패",
    activityStatusInterrupted: "중단됨",
    activityStatusUnknown: "알 수 없음",
    trendKicker: "활동 인사이트",
    trendTitle: "최근 7일 추이",
    trendRangeLabel: "추이 기간",
    trendRange3: "최근 3일",
    trendRange7: "최근 7일",
    trendRange30: "최근 30일",
    trendMessages: "메시지",
    trendToolCalls: "도구",
    trendFileChanges: "파일 변경",
    trendIssues: "문제",
    trendTooltipDate: "날짜",
    trendLoading: "최근 7일 데이터를 집계하는 중…",
    trendUnavailable: "추이 데이터를 일시적으로 사용할 수 없습니다.",
    trendNoData: "최근 7일 동안 표시할 세션 활동이 없습니다.",
    trendExpand: "두 번 클릭하여 추이를 전체 창으로 확대",
    trendCollapse: "차트를 두 번 클릭하거나 Esc를 눌러 확대 보기 종료",
    trendTotal: "합계: {total}",
  },
};

const FILE_DIFF_TRANSLATIONS = {
  "zh-CN": { fileDiffTitle: "文件变更对比", fileDiffSummary: "本次操作涉及 {count} 个文件", openFileDiff: "查看 {count} 个文件的变更对比", closeFileDiff: "关闭文件变更对比", fileDiffSideBySide: "左右", fileDiffUnified: "上下", fileDiffBefore: "变更前", fileDiffAfter: "变更后", fileChangeTypeAdd: "新增", fileChangeTypeDelete: "删除", fileChangeTypeUpdate: "修改", fileChangeMovedTo: "移动至：", fileDiffUnavailable: "该历史记录未保存可展示的差异内容。" },
  "zh-TW": { fileDiffTitle: "檔案變更比較", fileDiffSummary: "這次操作涉及 {count} 個檔案", openFileDiff: "檢視 {count} 個檔案的變更比較", closeFileDiff: "關閉檔案變更比較", fileDiffSideBySide: "左右", fileDiffUnified: "上下", fileDiffBefore: "變更前", fileDiffAfter: "變更後", fileChangeTypeAdd: "新增", fileChangeTypeDelete: "刪除", fileChangeTypeUpdate: "修改", fileChangeMovedTo: "移動至：", fileDiffUnavailable: "此歷程記錄未儲存可顯示的差異內容。" },
  en: { fileDiffTitle: "File changes", fileDiffSummary: "{count} files changed in this operation", openFileDiff: "View changes for {count} files", closeFileDiff: "Close file changes", fileDiffSideBySide: "Side by side", fileDiffUnified: "Inline", fileDiffBefore: "Before", fileDiffAfter: "After", fileChangeTypeAdd: "Added", fileChangeTypeDelete: "Deleted", fileChangeTypeUpdate: "Modified", fileChangeMovedTo: "Moved to:", fileDiffUnavailable: "This history entry does not contain a displayable diff." },
  ja: { fileDiffTitle: "ファイル変更の比較", fileDiffSummary: "この操作では {count} ファイルが変更されました", openFileDiff: "{count} ファイルの変更を表示", closeFileDiff: "ファイル変更の比較を閉じる", fileDiffSideBySide: "左右", fileDiffUnified: "上下", fileDiffBefore: "変更前", fileDiffAfter: "変更後", fileChangeTypeAdd: "追加", fileChangeTypeDelete: "削除", fileChangeTypeUpdate: "変更", fileChangeMovedTo: "移動先：", fileDiffUnavailable: "この履歴には表示可能な差分が保存されていません。" },
  ko: { fileDiffTitle: "파일 변경 비교", fileDiffSummary: "이 작업에서 {count}개 파일이 변경되었습니다", openFileDiff: "{count}개 파일의 변경 비교 보기", closeFileDiff: "파일 변경 비교 닫기", fileDiffSideBySide: "좌우", fileDiffUnified: "상하", fileDiffBefore: "변경 전", fileDiffAfter: "변경 후", fileChangeTypeAdd: "추가", fileChangeTypeDelete: "삭제", fileChangeTypeUpdate: "수정", fileChangeMovedTo: "이동 위치:", fileDiffUnavailable: "이 기록에는 표시할 수 있는 diff가 저장되지 않았습니다." },
};

const IMAGE_PREVIEW_TRANSLATIONS = {
  "zh-CN": { threadImagePreview: "图片预览", openImagePreview: "双击放大图片", closeImagePreview: "关闭图片预览" },
  "zh-TW": { threadImagePreview: "圖片預覽", openImagePreview: "按兩下放大圖片", closeImagePreview: "關閉圖片預覽" },
  en: { threadImagePreview: "Image preview", openImagePreview: "Double-click to enlarge image", closeImagePreview: "Close image preview" },
  ja: { threadImagePreview: "画像プレビュー", openImagePreview: "ダブルクリックで画像を拡大", closeImagePreview: "画像プレビューを閉じる" },
  ko: { threadImagePreview: "이미지 미리보기", openImagePreview: "두 번 클릭하여 이미지 확대", closeImagePreview: "이미지 미리보기 닫기" },
};

// 会话清单文案明确时间字段和消息总数，避免误读为会话数量。
const TOKEN_USAGE_TRANSLATIONS = {
  "zh-CN": { tokenUsageKicker: "Token 洞察", tokenUsageTitle: "Token 使用趋势", tokenUsageRangeLabel: "Token 趋势范围", tokenUsageRange3: "近3天趋势", tokenUsageRange7: "近7天趋势", tokenUsageRange30: "近30天趋势", tokenUsageTotal: "合计：{total} Token", tokenUsageTooltipDate: "日期", tokenUsageTooltipTokens: "Token", tokenUsageLoading: "正在读取 Token 使用数据…", tokenUsageUnavailable: "Token 使用数据暂时不可用。", tokenUsageNoData: "近 {days} 天暂无可展示的 Token 数据。" },
  "zh-TW": { tokenUsageKicker: "Token 洞察", tokenUsageTitle: "Token 使用趨勢", tokenUsageRangeLabel: "Token 趨勢範圍", tokenUsageRange3: "近3天趨勢", tokenUsageRange7: "近7天趨勢", tokenUsageRange30: "近30天趨勢", tokenUsageTotal: "合計：{total} Token", tokenUsageTooltipDate: "日期", tokenUsageTooltipTokens: "Token", tokenUsageLoading: "正在讀取 Token 使用資料…", tokenUsageUnavailable: "Token 使用資料暫時無法使用。", tokenUsageNoData: "近 {days} 天沒有可顯示的 Token 資料。" },
  en: { tokenUsageKicker: "TOKEN INSIGHTS", tokenUsageTitle: "Token usage trend", tokenUsageRangeLabel: "Token range", tokenUsageRange3: "Last 3 days", tokenUsageRange7: "Last 7 days", tokenUsageRange30: "Last 30 days", tokenUsageTotal: "Total: {total} tokens", tokenUsageTooltipDate: "Date", tokenUsageTooltipTokens: "Tokens", tokenUsageLoading: "Reading token usage…", tokenUsageUnavailable: "Token usage is unavailable.", tokenUsageNoData: "No token data for the last {days} days." },
  ja: { tokenUsageKicker: "Token インサイト", tokenUsageTitle: "Token 使用量の推移", tokenUsageRangeLabel: "Token の期間", tokenUsageRange3: "過去3日", tokenUsageRange7: "過去7日", tokenUsageRange30: "過去30日", tokenUsageTotal: "合計：{total} Token", tokenUsageTooltipDate: "日付", tokenUsageTooltipTokens: "Token", tokenUsageLoading: "Token 使用量を読み込み中…", tokenUsageUnavailable: "Token 使用量を取得できません。", tokenUsageNoData: "過去 {days} 日の Token データはありません。" },
  ko: { tokenUsageKicker: "Token 인사이트", tokenUsageTitle: "Token 사용량 추세", tokenUsageRangeLabel: "Token 기간", tokenUsageRange3: "최근 3일", tokenUsageRange7: "최근 7일", tokenUsageRange30: "최근 30일", tokenUsageTotal: "합계: {total} Token", tokenUsageTooltipDate: "날짜", tokenUsageTooltipTokens: "Token", tokenUsageLoading: "Token 사용량을 읽는 중…", tokenUsageUnavailable: "Token 사용량을 사용할 수 없습니다.", tokenUsageNoData: "최근 {days}일의 Token 데이터가 없습니다." },
};

const SESSION_ANALYTICS_TRANSLATIONS = {
  "zh-CN": {
    recentThreads: "最近更新的会话",
    searchThreads: "搜索最近更新的会话",
    searchTotal: "共 {total} 个本机会话",
    updated: "最后更新：{value}",
    created: "创建：{value}",
    threadTruncated: "该会话较长，仅显示最近 500 条消息。",
  },
  "zh-TW": {
    recentThreads: "最近更新的工作階段",
    searchThreads: "搜尋最近更新的工作階段",
    searchTotal: "共 {total} 個本機工作階段",
    updated: "最後更新：{value}",
    created: "建立：{value}",
    threadTruncated: "此工作階段較長，僅顯示最近 500 則訊息。",
  },
  en: {
    recentThreads: "Recently updated sessions",
    searchThreads: "Search recently updated sessions",
    searchTotal: "{total} local sessions",
    updated: "Last updated: {value}",
    created: "Created: {value}",
    threadTruncated: "This session is long; only the latest 500 messages are shown.",
  },
  ja: {
    recentThreads: "最近更新したセッション",
    searchThreads: "最近更新したセッションを検索",
    searchTotal: "ローカルセッション：{total} 件",
    updated: "最終更新：{value}",
    created: "作成：{value}",
    threadTruncated: "このセッションは長いため、最新 500 件のメッセージのみ表示します。",
  },
  ko: {
    recentThreads: "최근 업데이트된 세션",
    searchThreads: "최근 업데이트된 세션 검색",
    searchTotal: "로컬 세션 {total}개",
    updated: "마지막 업데이트: {value}",
    created: "생성: {value}",
    threadTruncated: "세션이 길어 최근 메시지 500개만 표시합니다.",
  },
};

// 导入导出采用目标设备的界面语言命名新会话，确保 CLI 会话列表能直接识别其来源。
const TRANSFER_TRANSLATIONS = {
  "zh-CN": {
    importThreads: "导入", exportThreads: "导出", selectPage: "全选本页", selectAllResults: "全选筛选结果", clearSelection: "清除", selectThread: "选择会话：{title}", selectedThreads: "已选 {count} 个", selectingThreads: "正在读取筛选结果…", selectingExportLocation: "请选择导出位置…", preparingExport: "正在导出 {count} 个会话…", exportCompleted: "已导出 {count} 个会话{failed}", exportFailed: "导出失败：{error}", exportFileDialogFilter: "Codex Desk 会话导出", importReading: "正在读取导入文件…", importingThreads: "正在导入会话…", importCompleted: "已导入 {count} / {total} 个会话{failed}", transferFailedSuffix: "，{count} 个失败", noThreadsSelected: "请先选择要导出的会话。", importFileInvalid: "请选择 Codex Desk 导出的会话文件。", importFileTooLarge: "导入文件不能超过 64 MB。", importConfirmation: "将导入 {count} 个会话。每条会话都会创建一个受限的 Codex 上下文回合，可能消耗少量配额。是否继续？", importedThreadTitlePrefix: "【由 Codex Desk 导入】", importedHistoryIntro: "以下是由 Codex Desk 导入的历史会话记录，仅作为后续对话上下文；请勿执行命令或开始任务。", exportFileName: "codex-desk-会话导出",
  },
  "zh-TW": {
    importThreads: "匯入", exportThreads: "匯出", selectPage: "全選本頁", selectAllResults: "全選篩選結果", clearSelection: "清除", selectThread: "選擇工作階段：{title}", selectedThreads: "已選 {count} 個", selectingThreads: "正在讀取篩選結果…", selectingExportLocation: "請選擇匯出位置…", preparingExport: "正在匯出 {count} 個工作階段…", exportCompleted: "已匯出 {count} 個工作階段{failed}", exportFailed: "匯出失敗：{error}", exportFileDialogFilter: "Codex Desk 工作階段匯出", importReading: "正在讀取匯入檔案…", importingThreads: "正在匯入工作階段…", importCompleted: "已匯入 {count} / {total} 個工作階段{failed}", transferFailedSuffix: "，{count} 個失敗", noThreadsSelected: "請先選擇要匯出的工作階段。", importFileInvalid: "請選擇由 Codex Desk 匯出的工作階段檔案。", importFileTooLarge: "匯入檔案不能超過 64 MB。", importConfirmation: "即將匯入 {count} 個工作階段。每個工作階段都會建立受限的 Codex 內容回合，可能消耗少量額度。是否繼續？", importedThreadTitlePrefix: "【由 Codex Desk 匯入】", importedHistoryIntro: "以下為由 Codex Desk 匯入的歷史工作階段記錄，僅作為後續對話內容；請勿執行指令或開始工作。", exportFileName: "codex-desk-工作階段匯出",
  },
  en: {
    importThreads: "Import", exportThreads: "Export", selectPage: "Select page", selectAllResults: "Select all results", clearSelection: "Clear", selectThread: "Select session: {title}", selectedThreads: "{count} selected", selectingThreads: "Reading filtered sessions…", selectingExportLocation: "Choose where to save the export…", preparingExport: "Exporting {count} sessions…", exportCompleted: "Exported {count} sessions{failed}", exportFailed: "Export failed: {error}", exportFileDialogFilter: "Codex Desk session export", importReading: "Reading import file…", importingThreads: "Importing sessions…", importCompleted: "Imported {count} of {total} sessions{failed}", transferFailedSuffix: ", {count} failed", noThreadsSelected: "Select at least one session to export.", importFileInvalid: "Choose a session file exported by Codex Desk.", importFileTooLarge: "The import file cannot exceed 64 MB.", importConfirmation: "Import {count} sessions? Each one creates a restricted Codex context turn and may use a small amount of quota.", importedThreadTitlePrefix: "[Imported by Codex Desk] ", importedHistoryIntro: "This is a historical session imported by Codex Desk. Treat it only as context for the next conversation; do not run commands or start work.", exportFileName: "codex-desk-session-export",
  },
  ja: {
    importThreads: "インポート", exportThreads: "エクスポート", selectPage: "このページを選択", selectAllResults: "検索結果をすべて選択", clearSelection: "クリア", selectThread: "セッションを選択：{title}", selectedThreads: "{count} 件を選択", selectingThreads: "検索結果を読み込み中…", selectingExportLocation: "エクスポート先を選択してください…", preparingExport: "{count} 件のセッションをエクスポート中…", exportCompleted: "{count} 件のセッションをエクスポートしました{failed}", exportFailed: "エクスポートに失敗しました：{error}", exportFileDialogFilter: "Codex Desk セッションのエクスポート", importReading: "インポートファイルを読み込み中…", importingThreads: "セッションをインポート中…", importCompleted: "{total} 件中 {count} 件のセッションをインポートしました{failed}", transferFailedSuffix: "、{count} 件失敗", noThreadsSelected: "エクスポートするセッションを選択してください。", importFileInvalid: "Codex Desk でエクスポートしたセッションファイルを選択してください。", importFileTooLarge: "インポートファイルは 64 MB 以下にしてください。", importConfirmation: "{count} 件のセッションをインポートします。各セッションで制限付きの Codex コンテキスト回合を作成するため、少量のクォータを消費する場合があります。続行しますか？", importedThreadTitlePrefix: "【Codex Desk からインポート】", importedHistoryIntro: "以下は Codex Desk からインポートされた過去のセッション記録です。以後の会話の文脈としてのみ扱い、コマンド実行や作業開始はしないでください。", exportFileName: "codex-desk-セッションエクスポート",
  },
  ko: {
    importThreads: "가져오기", exportThreads: "내보내기", selectPage: "이 페이지 선택", selectAllResults: "검색 결과 모두 선택", clearSelection: "지우기", selectThread: "세션 선택: {title}", selectedThreads: "{count}개 선택됨", selectingThreads: "검색 결과를 읽는 중…", selectingExportLocation: "내보낼 위치를 선택하세요…", preparingExport: "{count}개 세션을 내보내는 중…", exportCompleted: "{count}개 세션을 내보냈습니다{failed}", exportFailed: "내보내기 실패: {error}", exportFileDialogFilter: "Codex Desk 세션 내보내기", importReading: "가져오기 파일을 읽는 중…", importingThreads: "세션을 가져오는 중…", importCompleted: "총 {total}개 중 {count}개 세션을 가져왔습니다{failed}", transferFailedSuffix: ", {count}개 실패", noThreadsSelected: "내보낼 세션을 하나 이상 선택하세요.", importFileInvalid: "Codex Desk에서 내보낸 세션 파일을 선택하세요.", importFileTooLarge: "가져오기 파일은 64 MB를 초과할 수 없습니다.", importConfirmation: "{count}개 세션을 가져옵니다. 각 세션은 제한된 Codex 컨텍스트 턴을 만들며 소량의 할당량을 사용할 수 있습니다. 계속할까요?", importedThreadTitlePrefix: "[Codex Desk에서 가져옴] ", importedHistoryIntro: "다음은 Codex Desk에서 가져온 과거 세션 기록입니다. 이후 대화의 문맥으로만 사용하고 명령을 실행하거나 작업을 시작하지 마세요.", exportFileName: "codex-desk-세션-내보내기",
  },
};

const PRODUCT_TRANSLATIONS = {
  "zh-CN": {
    diagnostics: "Codex 环境诊断", diagnosticsKicker: "本机连接", openDiagnostics: "诊断 Codex CLI", closeDiagnostics: "关闭诊断", diagnosticsIntro: "仅检查本机 Codex CLI、app-server 和当前登录态，不会读取认证文件或上传数据。", diagnosticsChecking: "正在检查…", diagnosticCli: "Codex CLI", diagnosticAppServer: "本地 app-server", diagnosticQuota: "额度读取", diagnosticReady: "正常", diagnosticUnavailable: "不可用", diagnosticVersion: "版本：{version}", diagnosticAdvice: "请安装并登录 Codex CLI 后重新检查。", runDiagnostics: "重新检查", copyDiagnostics: "复制诊断", diagnosticsCopied: "诊断已复制", quotaAlerts: "额度提醒", quotaAlertsEnabled: "已启用：80% / 90% / 100%", quotaAlertsDisabled: "未启用", enableQuotaAlerts: "启用提醒", disableQuotaAlerts: "关闭提醒", notificationDenied: "系统未允许通知权限，请在系统设置中为 Codex Desk 打开通知。", quotaAlertTitle: "Codex 额度提醒", quotaAlertBody: "当前已使用 {used}% · {remaining}",
  },
  "zh-TW": {
    diagnostics: "Codex 環境診斷", diagnosticsKicker: "本機連線", openDiagnostics: "診斷 Codex CLI", closeDiagnostics: "關閉診斷", diagnosticsIntro: "僅檢查本機 Codex CLI、app-server 與目前登入狀態，不會讀取驗證檔案或上傳資料。", diagnosticsChecking: "正在檢查…", diagnosticCli: "Codex CLI", diagnosticAppServer: "本機 app-server", diagnosticQuota: "額度讀取", diagnosticReady: "正常", diagnosticUnavailable: "不可用", diagnosticVersion: "版本：{version}", diagnosticAdvice: "請安裝並登入 Codex CLI 後重新檢查。", runDiagnostics: "重新檢查", copyDiagnostics: "複製診斷", diagnosticsCopied: "診斷已複製", quotaAlerts: "額度提醒", quotaAlertsEnabled: "已啟用：80% / 90% / 100%", quotaAlertsDisabled: "未啟用", enableQuotaAlerts: "啟用提醒", disableQuotaAlerts: "關閉提醒", notificationDenied: "系統未允許通知權限，請在系統設定中為 Codex Desk 開啟通知。", quotaAlertTitle: "Codex 額度提醒", quotaAlertBody: "目前已使用 {used}% · {remaining}",
  },
  en: {
    diagnostics: "Codex diagnostics", diagnosticsKicker: "LOCAL CONNECTION", openDiagnostics: "Diagnose Codex CLI", closeDiagnostics: "Close diagnostics", diagnosticsIntro: "Checks your local Codex CLI, app-server, and sign-in state only. No auth file is read or data uploaded.", diagnosticsChecking: "Checking…", diagnosticCli: "Codex CLI", diagnosticAppServer: "Local app-server", diagnosticQuota: "Quota access", diagnosticReady: "Ready", diagnosticUnavailable: "Unavailable", diagnosticVersion: "Version: {version}", diagnosticAdvice: "Install and sign in to Codex CLI, then run the check again.", runDiagnostics: "Run again", copyDiagnostics: "Copy diagnostics", diagnosticsCopied: "Diagnostics copied", quotaAlerts: "Quota alerts", quotaAlertsEnabled: "Enabled: 80% / 90% / 100%", quotaAlertsDisabled: "Disabled", enableQuotaAlerts: "Enable alerts", disableQuotaAlerts: "Disable alerts", notificationDenied: "Notifications are not allowed. Enable them for Codex Desk in system settings.", quotaAlertTitle: "Codex quota alert", quotaAlertBody: "{used}% used · {remaining}",
  },
  ja: {
    diagnostics: "Codex 診断", diagnosticsKicker: "ローカル接続", openDiagnostics: "Codex CLI を診断", closeDiagnostics: "診断を閉じる", diagnosticsIntro: "ローカルの Codex CLI、app-server、ログイン状態のみを確認します。認証ファイルの読み取りやデータ送信は行いません。", diagnosticsChecking: "確認中…", diagnosticCli: "Codex CLI", diagnosticAppServer: "ローカル app-server", diagnosticQuota: "クォータ取得", diagnosticReady: "正常", diagnosticUnavailable: "利用不可", diagnosticVersion: "バージョン：{version}", diagnosticAdvice: "Codex CLI をインストールしてログイン後、もう一度確認してください。", runDiagnostics: "再確認", copyDiagnostics: "診断をコピー", diagnosticsCopied: "診断をコピーしました", quotaAlerts: "クォータ通知", quotaAlertsEnabled: "有効：80% / 90% / 100%", quotaAlertsDisabled: "無効", enableQuotaAlerts: "通知を有効化", disableQuotaAlerts: "通知を無効化", notificationDenied: "通知が許可されていません。システム設定で Codex Desk の通知を有効にしてください。", quotaAlertTitle: "Codex クォータ通知", quotaAlertBody: "使用済み {used}% · {remaining}",
  },
  ko: {
    diagnostics: "Codex 진단", diagnosticsKicker: "로컬 연결", openDiagnostics: "Codex CLI 진단", closeDiagnostics: "진단 닫기", diagnosticsIntro: "로컬 Codex CLI, app-server 및 로그인 상태만 확인합니다. 인증 파일을 읽거나 데이터를 업로드하지 않습니다.", diagnosticsChecking: "확인 중…", diagnosticCli: "Codex CLI", diagnosticAppServer: "로컬 app-server", diagnosticQuota: "할당량 읽기", diagnosticReady: "정상", diagnosticUnavailable: "사용 불가", diagnosticVersion: "버전: {version}", diagnosticAdvice: "Codex CLI를 설치하고 로그인한 뒤 다시 확인하세요.", runDiagnostics: "다시 확인", copyDiagnostics: "진단 복사", diagnosticsCopied: "진단을 복사했습니다", quotaAlerts: "할당량 알림", quotaAlertsEnabled: "활성화됨: 80% / 90% / 100%", quotaAlertsDisabled: "비활성화됨", enableQuotaAlerts: "알림 켜기", disableQuotaAlerts: "알림 끄기", notificationDenied: "알림이 허용되지 않았습니다. 시스템 설정에서 Codex Desk 알림을 켜세요.", quotaAlertTitle: "Codex 할당량 알림", quotaAlertBody: "{used}% 사용 · {remaining}",
  },
};

const ACCOUNT_TRANSLATIONS = {
  "zh-CN": {
    personalCenter: "个人中心", openPersonalCenter: "打开个人中心", closePersonalCenter: "关闭个人中心", accountEmail: "登录邮箱", accountPlan: "订阅方案", resetCreditsTitle: "使用限额重置", resetCreditsDescription: "使用重置功能可恢复 5 小时限额或每周限额。", resetCreditsFullReset: "完全重置（每周 + 5 小时）", resetCreditsCount: "{count} 次", resetCreditsAvailable: "可用重置次数：{count}", resetCreditTooltipItem: "第 {index} 次：{title} · {expires}", resetCreditExpires: "到期：{value}", resetCreditExpiresUnknown: "未提供到期时间", accountType: "登录方式", accountLoading: "正在读取账号信息…", accountEmailUnavailable: "当前登录方式未提供邮箱", accountPlanUnavailable: "未提供", accountTypeChatgpt: "ChatGPT", accountTypeApiKey: "API 密钥", accountTypeBedrock: "Amazon Bedrock", accountTypeUnknown: "未登录", accountReadFailed: "读取账号信息失败：{error}", openBilling: "查看订阅到期时间", accountBillingOpenFailed: "无法打开账单页面：{error}",
  },
  "zh-TW": {
    personalCenter: "個人中心", openPersonalCenter: "開啟個人中心", closePersonalCenter: "關閉個人中心", accountEmail: "登入信箱", accountPlan: "訂閱方案", resetCreditsTitle: "使用限額重設", resetCreditsDescription: "使用重設功能可恢復 5 小時限額、每週限額或兩者。", resetCreditsFullReset: "完全重設（每週 + 5 小時）", resetCreditsCount: "{count} 次", resetCreditsAvailable: "可用重設次數：{count}", resetCreditTooltipItem: "第 {index} 次：{title} · {expires}", resetCreditExpires: "到期：{value}", resetCreditExpiresUnknown: "未提供到期時間", accountType: "登入方式", accountLoading: "正在讀取帳號資訊…", accountEmailUnavailable: "目前登入方式未提供信箱", accountPlanUnavailable: "未提供", accountTypeChatgpt: "ChatGPT", accountTypeApiKey: "API 金鑰", accountTypeBedrock: "Amazon Bedrock", accountTypeUnknown: "未登入", accountReadFailed: "讀取帳號資訊失敗：{error}", openBilling: "查看訂閱到期時間", accountBillingOpenFailed: "無法開啟帳單頁面：{error}",
  },
  en: {
    personalCenter: "Account", openPersonalCenter: "Open account", closePersonalCenter: "Close account", accountEmail: "Email", accountPlan: "Plan", resetCreditsTitle: "Rate limit resets", resetCreditsDescription: "A reset can restore your 5-hour limit, weekly limit, or both.", resetCreditsFullReset: "Full reset (Weekly + 5 hr)", resetCreditsCount: "{count}", resetCreditsAvailable: "Available resets: {count}", resetCreditTooltipItem: "Reset {index}: {title} · {expires}", resetCreditExpires: "Expires {value}", resetCreditExpiresUnknown: "No expiry provided", accountType: "Sign-in method", accountLoading: "Reading account…", accountEmailUnavailable: "No email is available for this sign-in method", accountPlanUnavailable: "Unavailable", accountTypeChatgpt: "ChatGPT", accountTypeApiKey: "API key", accountTypeBedrock: "Amazon Bedrock", accountTypeUnknown: "Not signed in", accountReadFailed: "Could not read account: {error}", openBilling: "View subscription expiry", accountBillingOpenFailed: "Could not open the billing page: {error}",
  },
  ja: {
    personalCenter: "アカウント", openPersonalCenter: "アカウントを開く", closePersonalCenter: "アカウントを閉じる", accountEmail: "メールアドレス", accountPlan: "プラン", resetCreditsTitle: "レート制限のリセット", resetCreditsDescription: "リセットすると、5 時間枠、週次枠、または両方を回復できます。", resetCreditsFullReset: "完全リセット（週次 + 5 時間）", resetCreditsCount: "{count} 回", resetCreditsAvailable: "利用可能なリセット：{count}", resetCreditTooltipItem: "{index} 回目：{title} · {expires}", resetCreditExpires: "有効期限：{value}", resetCreditExpiresUnknown: "有効期限は未提供", accountType: "ログイン方法", accountLoading: "アカウント情報を読み込み中…", accountEmailUnavailable: "このログイン方法ではメールアドレスを取得できません", accountPlanUnavailable: "利用不可", accountTypeChatgpt: "ChatGPT", accountTypeApiKey: "API キー", accountTypeBedrock: "Amazon Bedrock", accountTypeUnknown: "未ログイン", accountReadFailed: "アカウント情報の読み込みに失敗しました：{error}", openBilling: "契約の有効期限を確認", accountBillingOpenFailed: "請求ページを開けませんでした：{error}",
  },
  ko: {
    personalCenter: "개인 센터", openPersonalCenter: "개인 센터 열기", closePersonalCenter: "개인 센터 닫기", accountEmail: "로그인 이메일", accountPlan: "구독 플랜", resetCreditsTitle: "사용 한도 재설정", resetCreditsDescription: "재설정으로 5시간 한도, 주간 한도 또는 둘 다를 복원할 수 있습니다.", resetCreditsFullReset: "전체 재설정(주간 + 5시간)", resetCreditsCount: "{count}회", resetCreditsAvailable: "사용 가능한 재설정: {count}", resetCreditTooltipItem: "{index}회: {title} · {expires}", resetCreditExpires: "만료: {value}", resetCreditExpiresUnknown: "만료 시간이 제공되지 않음", accountType: "로그인 방식", accountLoading: "계정 정보를 읽는 중…", accountEmailUnavailable: "현재 로그인 방식은 이메일을 제공하지 않습니다", accountPlanUnavailable: "제공되지 않음", accountTypeChatgpt: "ChatGPT", accountTypeApiKey: "API 키", accountTypeBedrock: "Amazon Bedrock", accountTypeUnknown: "로그인되지 않음", accountReadFailed: "계정 정보를 읽지 못했습니다: {error}", openBilling: "구독 만료일 보기", accountBillingOpenFailed: "청구 페이지를 열 수 없습니다: {error}",
  },
};

const SESSION_SECTION_TRANSLATIONS = {
  "zh-CN": { expandLocalHistory: "展开本地历史", collapseLocalHistory: "收起本地历史", openBillingPortal: "打开账单" },
  "zh-TW": { expandLocalHistory: "展開本機歷程", collapseLocalHistory: "收合本機歷程", openBillingPortal: "開啟帳單" },
  en: { expandLocalHistory: "Show local history", collapseLocalHistory: "Hide local history", openBillingPortal: "Open billing" },
  ja: { expandLocalHistory: "ローカル履歴を開く", collapseLocalHistory: "ローカル履歴を閉じる", openBillingPortal: "請求を開く" },
  ko: { expandLocalHistory: "로컬 기록 펼치기", collapseLocalHistory: "로컬 기록 접기", openBillingPortal: "청구 열기" },
};

// 首页摘要使用独立短文案，避免状态提示占用账户用量和本地历史的首屏空间。
const HOME_SUMMARY_TRANSLATIONS = {
  "zh-CN": { quotaAlertStatusEnabled: "提醒已开启（阈值80%/90%/100%）", quotaAlertStatusDisabled: "提醒未开启（阈值80%/90%/100%）", quotaAlertToggleEnable: "开启额度提醒", quotaAlertToggleDisable: "关闭额度提醒", syncedStatusPrefix: "本地 Codex 已同步{plan}（仅从本机读取 · ", autoRefreshCountdownPrefix: "", autoRefreshCountdownSuffix: " 秒后自动刷新", syncedStatusSuffix: "）" },
  "zh-TW": { quotaAlertStatusEnabled: "提醒已開啟（門檻80%/90%/100%）", quotaAlertStatusDisabled: "提醒未開啟（門檻80%/90%/100%）", quotaAlertToggleEnable: "開啟額度提醒", quotaAlertToggleDisable: "關閉額度提醒", syncedStatusPrefix: "本機 Codex 已同步{plan}（僅從本機讀取 · ", autoRefreshCountdownPrefix: "", autoRefreshCountdownSuffix: " 秒後自動重新整理", syncedStatusSuffix: "）" },
  en: { quotaAlertStatusEnabled: "Alerts on (80%/90%/100%)", quotaAlertStatusDisabled: "Alerts off (80%/90%/100%)", quotaAlertToggleEnable: "Enable quota alerts", quotaAlertToggleDisable: "Disable quota alerts", syncedStatusPrefix: "Local Codex synced{plan} (local data only · ", autoRefreshCountdownPrefix: "refreshes in ", autoRefreshCountdownSuffix: "s", syncedStatusSuffix: ")" },
  ja: { quotaAlertStatusEnabled: "通知オン（80%/90%/100%）", quotaAlertStatusDisabled: "通知オフ（80%/90%/100%）", quotaAlertToggleEnable: "クォータ通知を有効化", quotaAlertToggleDisable: "クォータ通知を無効化", syncedStatusPrefix: "ローカル Codex を同期済み{plan}（ローカルデータのみ · ", autoRefreshCountdownPrefix: "", autoRefreshCountdownSuffix: " 秒後に自動更新", syncedStatusSuffix: "）" },
  ko: { quotaAlertStatusEnabled: "알림 켜짐(80%/90%/100%)", quotaAlertStatusDisabled: "알림 꺼짐(80%/90%/100%)", quotaAlertToggleEnable: "할당량 알림 켜기", quotaAlertToggleDisable: "할당량 알림 끄기", syncedStatusPrefix: "로컬 Codex 동기화됨{plan}(로컬 데이터만 · ", autoRefreshCountdownPrefix: "", autoRefreshCountdownSuffix: "초 후 자동 새로 고침", syncedStatusSuffix: ")" },
};

const DIALOG_SEARCH_TRANSLATIONS = {
  "zh-CN": {
    searchThreadMessages: "搜索当前会话", searchThreadMessagesPlaceholder: "搜索当前会话内容", threadSearchMatches: "{current} / {total}", threadSearchNoMatches: "无匹配", threadTruncated: "该会话较长，仅搜索并显示最近 500 条消息。",
  },
  "zh-TW": {
    searchThreadMessages: "搜尋目前工作階段", searchThreadMessagesPlaceholder: "搜尋目前工作階段內容", threadSearchMatches: "{current} / {total}", threadSearchNoMatches: "沒有符合項目", threadTruncated: "此工作階段較長，僅搜尋並顯示最近 500 則訊息。",
  },
  en: {
    searchThreadMessages: "Search this session", searchThreadMessagesPlaceholder: "Search messages", threadSearchMatches: "{current} / {total}", threadSearchNoMatches: "No matches", threadTruncated: "This session is long; only the latest 500 messages can be searched and displayed.",
  },
  ja: {
    searchThreadMessages: "このセッションを検索", searchThreadMessagesPlaceholder: "メッセージを検索", threadSearchMatches: "{current} / {total}", threadSearchNoMatches: "一致なし", threadTruncated: "このセッションは長いため、最新 500 件のメッセージのみ検索・表示できます。",
  },
  ko: {
    searchThreadMessages: "현재 세션 검색", searchThreadMessagesPlaceholder: "메시지 검색", threadSearchMatches: "{current} / {total}", threadSearchNoMatches: "일치 항목 없음", threadTruncated: "이 세션은 길어서 최근 500개 메시지만 검색하고 표시합니다.",
  },
};

// 额度区域采用独立短文案，保证进度与重置时间在不同语言下都能紧凑呈现。
const QUOTA_LABEL_TRANSLATIONS = {
  "zh-CN": { compactQuotaWindowDays: "{count} 天", compactQuotaWindowHours: "{count} 小时", usedPercent: "已使用 {used}%", resetTime: "下次重置时间：{value}", resetCountdown: "下次重置：{value}", resetCreditsLabel: "可用重置额度", quotaWarning: "额度偏低", quotaCritical: "额度不足" },
  "zh-TW": { compactQuotaWindowDays: "{count} 天", compactQuotaWindowHours: "{count} 小時", usedPercent: "已使用 {used}%", resetTime: "下次重設時間：{value}", resetCountdown: "下次重設：{value}", resetCreditsLabel: "可用重設額度", quotaWarning: "額度偏低", quotaCritical: "額度不足" },
  en: { compactQuotaWindowDays: "{count}d", compactQuotaWindowHours: "{count}h", usedPercent: "{used}% used", resetTime: "Next reset: {value}", resetCountdown: "Next reset: {value}", resetCreditsLabel: "Reset credits", quotaWarning: "Low quota", quotaCritical: "Quota exhausted" },
  ja: { compactQuotaWindowDays: "{count}日", compactQuotaWindowHours: "{count}時間", resetCredits: "リセットクレジット：{credits}", usedPercent: "使用済み {used}%", resetTime: "次回リセット：{value}", resetCountdown: "次回リセット：{value}", resetCreditsLabel: "リセットクレジット", quotaWarning: "残りわずか", quotaCritical: "クォータ不足" },
  ko: { compactQuotaWindowDays: "{count}일", compactQuotaWindowHours: "{count}시간", usedPercent: "{used}% 사용", resetTime: "다음 재설정: {value}", resetCountdown: "다음 재설정: {value}", resetCreditsLabel: "재설정 크레딧", quotaWarning: "할당량 부족", quotaCritical: "할당량 소진" },
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
    const text = QUOTA_LABEL_TRANSLATIONS[language]?.[key]
      ?? SESSION_SECTION_TRANSLATIONS[language]?.[key]
      ?? HOME_SUMMARY_TRANSLATIONS[language]?.[key]
      ?? DIALOG_SEARCH_TRANSLATIONS[language]?.[key]
      ?? ACCOUNT_TRANSLATIONS[language]?.[key]
      ?? PRODUCT_TRANSLATIONS[language]?.[key]
      ?? TRANSFER_TRANSLATIONS[language]?.[key]
      ?? SESSION_ANALYTICS_TRANSLATIONS[language]?.[key]
      ?? TOKEN_USAGE_TRANSLATIONS[language]?.[key]
      ?? ANALYTICS_TRANSLATIONS[language]?.[key]
      ?? FILE_DIFF_TRANSLATIONS[language]?.[key]
      ?? IMAGE_PREVIEW_TRANSLATIONS[language]?.[key]
      ?? TRANSLATIONS[language][key]
      ?? QUOTA_LABEL_TRANSLATIONS["zh-CN"]?.[key]
      ?? SESSION_SECTION_TRANSLATIONS["zh-CN"]?.[key]
      ?? HOME_SUMMARY_TRANSLATIONS["zh-CN"]?.[key]
      ?? DIALOG_SEARCH_TRANSLATIONS["zh-CN"]?.[key]
      ?? ACCOUNT_TRANSLATIONS["zh-CN"]?.[key]
      ?? PRODUCT_TRANSLATIONS["zh-CN"]?.[key]
      ?? TRANSFER_TRANSLATIONS["zh-CN"]?.[key]
      ?? SESSION_ANALYTICS_TRANSLATIONS["zh-CN"]?.[key]
      ?? TOKEN_USAGE_TRANSLATIONS["zh-CN"]?.[key]
      ?? ANALYTICS_TRANSLATIONS["zh-CN"]?.[key]
      ?? FILE_DIFF_TRANSLATIONS["zh-CN"]?.[key]
      ?? IMAGE_PREVIEW_TRANSLATIONS["zh-CN"]?.[key]
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
