import { readStoredEnum, writeStoredValue } from "./utils/browser-storage.js";

const LANGUAGE_STORAGE_KEY = "codex-desk-language";
const SUPPORTED_LANGUAGES = ["system", "zh-CN", "zh-TW", "en", "ja", "ko"];

export const LANGUAGE_OPTIONS = [
  { value: "system", labelKey: "languageSystem" },
  { value: "en", labelKey: "languageEn" },
  { value: "zh-CN", labelKey: "languageZhCN" },
  { value: "zh-TW", labelKey: "languageZhTW" },
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
    appTitle: "Codex 桌面控制台", secureAccess: "本机安全访问", remaining: "剩余", accountUsage: "账户用量", quotaOverview: "额度概览", quotaWindow: "额度窗口", quotaWindowDays: "{count} 天额度", quotaWindowHours: "{count} 小时额度", quotaWindowMinutes: "{count} 分钟额度", localHistory: "本地历史", searchPlaceholder: "搜索标题或会话 ID", localOnly: "仅从本机读取", previousPage: "上一页", nextPage: "下一页", threadDetail: "会话详情", closeThreadDetail: "关闭会话详情", minimize: "最小化到系统托盘", pinWindow: "置顶窗口", unpinWindow: "取消置顶", collapse: "收起为悬浮球", refresh: "立即刷新", quit: "退出程序", expandOrb: "展开 Codex 额度详情", collapseOrb: "收起 Codex 桌面控制台", orbTitle: "短按展开，按住后拖动", theme: "主题", themeLight: "白天", themeDark: "黑夜", language: "语言", languageSystem: "跟随系统", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "正在读取本地 Codex 数据…", readingThread: "正在读取会话…", readingSearch: "正在搜索…", readFailed: "读取失败：{error}", threadReadFailed: "会话读取失败，请确认当前 Codex 版本支持会话列表。", noMatches: "没有匹配的最近会话。", noThreads: "暂无可显示的本地会话。", searchMatches: "匹配到 {total} 条", viewingThread: "查看会话：{title}", copyId: "复制 ID", copyMessage: "复制消息", copied: "已复制", copyFailed: "失败", copy: "复制", copyFailedLong: "复制失败", updatedUnknown: "更新时间未知", resetUnknown: "重置时间未知", resetCredits: "可用重置额度：{credits}", syncedStatus: "本地 Codex 已同步{plan}（仅从本机读取 · {seconds} 秒后自动刷新）", planPrefix: " · {plan}", noMessages: "该会话没有可展示的用户消息或 Codex 回复。", threadImage: "会话图片", you: "你", codex: "Codex", windowResizeFailed: "无法调整悬浮窗：{error}", windowMaximizeFailed: "无法切换窗口最大化：{error}", windowAlwaysOnTopFailed: "无法切换窗口置顶状态：{error}", initializationFailed: "初始化失败：{error}", clipboardDenied: "系统未允许复制到剪贴板", localFilePreview: "预览本地文件", localFileLoading: "正在读取文件…", localFileTruncated: "文件较大，仅显示开头内容（原始大小 {size} 字节）", localFileReadFailed: "无法预览文件：{error}",
  },
  "zh-TW": {
    pinWindow: "置頂視窗", unpinWindow: "取消置頂", windowAlwaysOnTopFailed: "無法切換視窗置頂狀態：{error}",
    appTitle: "Codex 桌面控制台", secureAccess: "本機安全存取", remaining: "剩餘", accountUsage: "帳戶用量", quotaOverview: "額度總覽", quotaWindow: "額度視窗", quotaWindowDays: "{count} 天額度", quotaWindowHours: "{count} 小時額度", quotaWindowMinutes: "{count} 分鐘額度", localHistory: "本機歷程", searchPlaceholder: "搜尋標題或工作階段 ID", localOnly: "僅從本機讀取", previousPage: "上一頁", nextPage: "下一頁", threadDetail: "工作階段詳情", closeThreadDetail: "關閉工作階段詳情", minimize: "最小化到系統匣", collapse: "收合為浮動球", refresh: "立即重新整理", quit: "結束程式", expandOrb: "展開 Codex 額度詳情", collapseOrb: "收合 Codex 桌面控制台", orbTitle: "短按展開，按住後拖曳", theme: "主題", themeLight: "白天", themeDark: "黑夜", language: "語言", languageSystem: "跟隨系統", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "正在讀取本機 Codex 資料…", readingThread: "正在讀取工作階段…", readingSearch: "正在搜尋…", readFailed: "讀取失敗：{error}", threadReadFailed: "工作階段讀取失敗，請確認目前 Codex 版本支援工作階段清單。", noMatches: "沒有符合的最近工作階段。", noThreads: "暫無可顯示的本機工作階段。", searchMatches: "符合 {total} 筆", viewingThread: "檢視工作階段：{title}", copyId: "複製 ID", copied: "已複製", copyFailed: "失敗", copy: "複製", copyFailedLong: "複製失敗", updatedUnknown: "更新時間未知", resetUnknown: "重設時間未知", resetCredits: "可用重設額度：{credits}", syncedStatus: "本機 Codex 已同步{plan}（僅從本機讀取 · {seconds} 秒後自動重新整理）", planPrefix: " · {plan}", noMessages: "此工作階段沒有可顯示的使用者訊息或 Codex 回覆。", you: "你", codex: "Codex", windowResizeFailed: "無法調整浮動視窗：{error}", windowMaximizeFailed: "無法切換視窗最大化：{error}", initializationFailed: "初始化失敗：{error}", clipboardDenied: "系統未允許複製到剪貼簿", localFilePreview: "預覽本機檔案", localFileLoading: "正在讀取檔案…", localFileTruncated: "檔案較大，僅顯示開頭內容（原始大小 {size} 位元組）", localFileReadFailed: "無法預覽檔案：{error}",
  },
  en: {
    pinWindow: "Keep window on top", unpinWindow: "Stop keeping window on top", windowAlwaysOnTopFailed: "Could not change the always-on-top state: {error}",
    appTitle: "Codex Desk", secureAccess: "Local secure access", remaining: "Left", accountUsage: "Account usage", quotaOverview: "Quota overview", quotaWindow: "Quota window", quotaWindowDays: "{count} days", quotaWindowHours: "{count} hours", quotaWindowMinutes: "{count} min", localHistory: "Local history", searchPlaceholder: "Search title or session ID", localOnly: "Local data only", previousPage: "Previous", nextPage: "Next", threadDetail: "Session details", closeThreadDetail: "Close session details", minimize: "Minimize to system tray", collapse: "Collapse to floating orb", refresh: "Refresh now", quit: "Quit", expandOrb: "Expand Codex quota details", collapseOrb: "Collapse Codex Desk", orbTitle: "Click to expand, drag to move", theme: "Theme", themeLight: "Light", themeDark: "Dark", language: "Language", languageSystem: "System", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "Reading local Codex data…", readingThread: "Reading session…", readingSearch: "Searching…", readFailed: "Read failed: {error}", threadReadFailed: "Could not read sessions. Confirm that this Codex version supports session lists.", noMatches: "No matching recent sessions.", noThreads: "No local sessions to display.", searchMatches: "{total} matches", viewingThread: "View session: {title}", copyId: "Copy ID", copied: "Copied", copyFailed: "Failed", copy: "Copy", copyFailedLong: "Copy failed", updatedUnknown: "Update time unavailable", resetUnknown: "Reset time unavailable", resetCredits: "Reset credits: {credits}", syncedStatus: "Local Codex synced{plan} (local data only · refreshes in {seconds}s)", planPrefix: " · {plan}", noMessages: "This session has no user messages or Codex replies to display.", you: "You", codex: "Codex", windowResizeFailed: "Could not resize floating window: {error}", windowMaximizeFailed: "Could not toggle window maximization: {error}", initializationFailed: "Initialization failed: {error}", clipboardDenied: "The system did not allow clipboard access", localFilePreview: "Preview local file", localFileLoading: "Reading file…", localFileTruncated: "Large file: showing only the beginning ({size} bytes total)", localFileReadFailed: "Could not preview file: {error}",
  },
  ja: {
    pinWindow: "常に最前面に表示", unpinWindow: "最前面表示を解除", windowAlwaysOnTopFailed: "最前面表示を切り替えられません：{error}",
    appTitle: "Codex デスク", secureAccess: "ローカルの安全なアクセス", remaining: "残り", accountUsage: "アカウント使用量", quotaOverview: "クォータ概要", quotaWindow: "クォータ枠", quotaWindowDays: "{count} 日枠", quotaWindowHours: "{count} 時間枠", quotaWindowMinutes: "{count} 分枠", localHistory: "ローカル履歴", searchPlaceholder: "タイトルまたはセッション ID を検索", localOnly: "ローカルデータのみ", previousPage: "前へ", nextPage: "次へ", threadDetail: "セッション詳細", closeThreadDetail: "セッション詳細を閉じる", minimize: "システムトレイへ最小化", collapse: "フローティングボールに縮小", refresh: "今すぐ更新", quit: "終了", expandOrb: "Codex のクォータ詳細を開く", collapseOrb: "Codex デスクを縮小", orbTitle: "クリックで展開、ドラッグで移動", theme: "テーマ", themeLight: "ライト", themeDark: "ダーク", language: "言語", languageSystem: "システムに従う", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "ローカルの Codex データを読み込み中…", readingThread: "セッションを読み込み中…", readingSearch: "検索中…", readFailed: "読み込みに失敗しました：{error}", threadReadFailed: "セッションを読み込めません。現在の Codex バージョンがセッション一覧に対応しているか確認してください。", noMatches: "一致する最近のセッションはありません。", noThreads: "表示できるローカルセッションはありません。", searchMatches: "{total} 件一致", viewingThread: "セッションを表示：{title}", copyId: "ID をコピー", copied: "コピー済み", copyFailed: "失敗", copy: "コピー", copyFailedLong: "コピーに失敗", updatedUnknown: "更新時刻は不明です", resetUnknown: "リセット時刻は不明です", syncedStatus: "ローカル Codex を同期済み{plan}（ローカルデータのみ · {seconds} 秒後に自動更新）", planPrefix: " · {plan}", noMessages: "このセッションには表示できるユーザーメッセージまたは Codex の返信がありません。", you: "あなた", codex: "Codex", windowResizeFailed: "フローティングウィンドウを変更できません：{error}", windowMaximizeFailed: "ウィンドウの最大化を切り替えられません：{error}", initializationFailed: "初期化に失敗しました：{error}", clipboardDenied: "システムでクリップボードへのアクセスが許可されていません", localFilePreview: "ローカルファイルをプレビュー", localFileLoading: "ファイルを読み込み中…", localFileTruncated: "大きなファイルのため、先頭のみ表示しています（元のサイズ {size} バイト）", localFileReadFailed: "ファイルをプレビューできません：{error}",
  },
  ko: {
    pinWindow: "창을 항상 위에 표시", unpinWindow: "항상 위 표시 해제", windowAlwaysOnTopFailed: "창 항상 위 상태를 전환할 수 없습니다: {error}",
    appTitle: "Codex 데스크", secureAccess: "로컬 보안 액세스", remaining: "남음", accountUsage: "계정 사용량", quotaOverview: "할당량 개요", quotaWindow: "할당량 창", quotaWindowDays: "{count}일 할당량", quotaWindowHours: "{count}시간 할당량", quotaWindowMinutes: "{count}분 할당량", localHistory: "로컬 기록", searchPlaceholder: "제목 또는 세션 ID 검색", localOnly: "로컬 데이터만", previousPage: "이전", nextPage: "다음", threadDetail: "세션 세부 정보", closeThreadDetail: "세션 세부 정보 닫기", minimize: "시스템 트레이로 최소화", collapse: "플로팅 버튼으로 접기", refresh: "지금 새로 고침", quit: "종료", expandOrb: "Codex 할당량 세부 정보 펼치기", collapseOrb: "Codex 데스크 접기", orbTitle: "클릭하여 펼치고 드래그하여 이동", theme: "테마", themeLight: "라이트", themeDark: "다크", language: "언어", languageSystem: "시스템 설정", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "로컬 Codex 데이터를 읽는 중…", readingThread: "세션을 읽는 중…", readingSearch: "검색 중…", readFailed: "읽기 실패: {error}", threadReadFailed: "세션을 읽을 수 없습니다. 현재 Codex 버전이 세션 목록을 지원하는지 확인하세요.", noMatches: "일치하는 최근 세션이 없습니다.", noThreads: "표시할 로컬 세션이 없습니다.", searchMatches: "{total}개 일치", viewingThread: "세션 보기: {title}", copyId: "ID 복사", copied: "복사됨", copyFailed: "실패", copy: "복사", copyFailedLong: "복사 실패", updatedUnknown: "업데이트 시간을 알 수 없습니다", resetUnknown: "재설정 시간을 알 수 없습니다", resetCredits: "사용 가능한 재설정 크레딧: {credits}", syncedStatus: "로컬 Codex 동기화됨{plan}(로컬 데이터만 · {seconds}초 후 자동 새로 고침)", planPrefix: " · {plan}", noMessages: "표시할 사용자 메시지 또는 Codex 응답이 없습니다.", you: "나", codex: "Codex", windowResizeFailed: "플로팅 창 크기를 조정할 수 없습니다: {error}", windowMaximizeFailed: "창 최대화 전환 실패: {error}", initializationFailed: "초기화 실패: {error}", clipboardDenied: "시스템에서 클립보드 액세스를 허용하지 않았습니다", localFilePreview: "로컬 파일 미리보기", localFileLoading: "파일을 읽는 중…", localFileTruncated: "큰 파일이라 처음 부분만 표시합니다(원본 크기 {size}바이트)", localFileReadFailed: "파일을 미리 볼 수 없습니다: {error}",
  },
};

// 会话洞察独立于页面基础文案维护，后续新增数据卡片时无需展开每个页面翻译对象。
const ANALYTICS_TRANSLATIONS = {
  "zh-CN": {
    insightMessages: "消息",
    insightToolCalls: "工具",
    activitySummaryHint: "点击查看",
    messageActivitySummary: "执行了 {count} 项操作",
    messageFileActivitySummary: "已编辑 {count} 个文件",
    messageShowMoreFiles: "再显示 {count} 个文件",
    messageCollapseFiles: "收起文件",
    activityEditedFiles: "编辑了文件",
    activityRanCommands: "运行了命令",
    activityUsedTools: "调用了工具",
    activityCreatedFile: "已创建",
    activityEditedFile: "已编辑",
    activityDeletedFile: "已删除",
    activityRanCommand: "已运行",
    activityStatusCompleted: "完成",
    activityStatusInProgress: "进行中",
    activityStatusFailed: "失败",
    activityStatusInterrupted: "中断",
    activityStatusUnknown: "未知",
    trendKicker: "活动洞察",
    insightsOverview: "数据洞察",
    insightsOverviewTitle: "趋势总览",
    trendTitle: "近 {days} 天趋势",
    trendRangeLabel: "趋势范围",
    trendRange3: "近3天趋势",
    trendRange7: "近7天趋势",
    trendRange30: "近30天趋势",
    trendMessages: "消息",
    trendToolCalls: "工具",
    trendFileChanges: "文件变更",
    trendIssues: "异常",
    trendTooltipDate: "日期",
    trendLoading: "正在聚合近 {days} 天会话数据…",
    trendUnavailable: "趋势数据暂时不可用。",
    trendNoData: "近 {days} 天暂无可展示的会话活动。",
    trendExpand: "双击放大全窗口趋势图",
    trendCollapse: "双击图表或按 Esc 退出放大视图",
    trendTotal: "合计：{total}",
  },
  "zh-TW": {
    insightMessages: "訊息",
    insightToolCalls: "工具",
    activitySummaryHint: "點擊查看",
    messageActivitySummary: "已執行 {count} 項操作",
    messageFileActivitySummary: "已編輯 {count} 個檔案",
    messageShowMoreFiles: "再顯示 {count} 個檔案",
    messageCollapseFiles: "收合檔案",
    activityEditedFiles: "編輯了檔案",
    activityRanCommands: "執行了命令",
    activityUsedTools: "呼叫了工具",
    activityCreatedFile: "已建立",
    activityEditedFile: "已編輯",
    activityDeletedFile: "已刪除",
    activityRanCommand: "已執行",
    activityStatusCompleted: "完成",
    activityStatusInProgress: "進行中",
    activityStatusFailed: "失敗",
    activityStatusInterrupted: "中斷",
    activityStatusUnknown: "未知",
    trendKicker: "活動洞察",
    insightsOverview: "資料洞察",
    insightsOverviewTitle: "趨勢總覽",
    trendTitle: "近 {days} 天趨勢",
    trendRangeLabel: "趨勢範圍",
    trendRange3: "近3天趨勢",
    trendRange7: "近7天趨勢",
    trendRange30: "近30天趨勢",
    trendMessages: "訊息",
    trendToolCalls: "工具",
    trendFileChanges: "檔案變更",
    trendIssues: "異常",
    trendTooltipDate: "日期",
    trendLoading: "正在彙整近 {days} 天工作階段資料…",
    trendUnavailable: "趨勢資料暫時無法使用。",
    trendNoData: "近 {days} 天暫無可顯示的工作階段活動。",
    trendExpand: "按兩下放大全視窗趨勢圖",
    trendCollapse: "按兩下圖表或按 Esc 離開放大檢視",
    trendTotal: "合計：{total}",
  },
  en: {
    insightMessages: "Messages",
    insightToolCalls: "Tools",
    activitySummaryHint: "View details",
    messageActivitySummary: "Ran {count} operations",
    messageFileActivitySummary: "Edited {count} files",
    messageShowMoreFiles: "Show {count} more files",
    messageCollapseFiles: "Show fewer files",
    activityEditedFiles: "Edited files",
    activityRanCommands: "Ran commands",
    activityUsedTools: "Used tools",
    activityCreatedFile: "Created",
    activityEditedFile: "Edited",
    activityDeletedFile: "Deleted",
    activityRanCommand: "Ran",
    activityStatusCompleted: "Completed",
    activityStatusInProgress: "In progress",
    activityStatusFailed: "Failed",
    activityStatusInterrupted: "Interrupted",
    activityStatusUnknown: "Unknown",
    trendKicker: "ACTIVITY INSIGHTS",
    insightsOverview: "Data insights",
    insightsOverviewTitle: "Trend overview",
    trendTitle: "Last {days} days",
    trendRangeLabel: "Trend range",
    trendRange3: "Last 3 days",
    trendRange7: "Last 7 days",
    trendRange30: "Last 30 days",
    trendMessages: "Messages",
    trendToolCalls: "Tools",
    trendFileChanges: "File changes",
    trendIssues: "Issues",
    trendTooltipDate: "Date",
    trendLoading: "Aggregating the last {days} days…",
    trendUnavailable: "Trend data is temporarily unavailable.",
    trendNoData: "No session activity to show in the last {days} days.",
    trendExpand: "Double-click to expand the trend to the full window",
    trendCollapse: "Double-click the chart or press Esc to exit the expanded view",
    trendTotal: "Total: {total}",
  },
  ja: {
    insightMessages: "メッセージ",
    insightToolCalls: "ツール",
    activitySummaryHint: "クリックして表示",
    messageActivitySummary: "{count} 件の操作を実行",
    messageFileActivitySummary: "{count} 個のファイルを編集",
    messageShowMoreFiles: "さらに {count} 個のファイルを表示",
    messageCollapseFiles: "ファイルを折りたたむ",
    activityEditedFiles: "ファイルを編集",
    activityRanCommands: "コマンドを実行",
    activityUsedTools: "ツールを使用",
    activityCreatedFile: "作成",
    activityEditedFile: "編集",
    activityDeletedFile: "削除",
    activityRanCommand: "実行済み",
    activityStatusCompleted: "完了",
    activityStatusInProgress: "進行中",
    activityStatusFailed: "失敗",
    activityStatusInterrupted: "中断",
    activityStatusUnknown: "不明",
    trendKicker: "アクティビティ分析",
    insightsOverview: "データインサイト",
    insightsOverviewTitle: "トレンド概要",
    trendTitle: "過去 {days} 日間の推移",
    trendRangeLabel: "期間",
    trendRange3: "過去3日間",
    trendRange7: "過去7日間",
    trendRange30: "過去30日間",
    trendMessages: "メッセージ",
    trendToolCalls: "ツール",
    trendFileChanges: "ファイル変更",
    trendIssues: "問題",
    trendTooltipDate: "日付",
    trendLoading: "過去 {days} 日間のデータを集計中…",
    trendUnavailable: "推移データを一時的に取得できません。",
    trendNoData: "過去 {days} 日間に表示できるセッション活動はありません。",
    trendExpand: "ダブルクリックで推移グラフをウィンドウいっぱいに拡大",
    trendCollapse: "グラフをダブルクリックするか Esc キーで拡大表示を終了",
    trendTotal: "合計：{total}",
  },
  ko: {
    insightMessages: "메시지",
    insightToolCalls: "도구",
    activitySummaryHint: "클릭하여 보기",
    messageActivitySummary: "작업 {count}개 실행",
    messageFileActivitySummary: "파일 {count}개 편집",
    messageShowMoreFiles: "파일 {count}개 더 보기",
    messageCollapseFiles: "파일 접기",
    activityEditedFiles: "파일 편집",
    activityRanCommands: "명령 실행",
    activityUsedTools: "도구 사용",
    activityCreatedFile: "생성함",
    activityEditedFile: "편집함",
    activityDeletedFile: "삭제함",
    activityRanCommand: "실행함",
    activityStatusCompleted: "완료",
    activityStatusInProgress: "진행 중",
    activityStatusFailed: "실패",
    activityStatusInterrupted: "중단됨",
    activityStatusUnknown: "알 수 없음",
    trendKicker: "활동 인사이트",
    insightsOverview: "데이터 인사이트",
    insightsOverviewTitle: "추세 개요",
    trendTitle: "최근 {days}일 추이",
    trendRangeLabel: "추이 기간",
    trendRange3: "최근 3일",
    trendRange7: "최근 7일",
    trendRange30: "최근 30일",
    trendMessages: "메시지",
    trendToolCalls: "도구",
    trendFileChanges: "파일 변경",
    trendIssues: "문제",
    trendTooltipDate: "날짜",
    trendLoading: "최근 {days}일 데이터를 집계하는 중…",
    trendUnavailable: "추이 데이터를 일시적으로 사용할 수 없습니다.",
    trendNoData: "최근 {days}일 동안 표시할 세션 활동이 없습니다.",
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
  "zh-CN": { threadImagePreview: "图片预览", openImagePreview: "点击查看大图", closeImagePreview: "关闭图片预览" },
  "zh-TW": { threadImagePreview: "圖片預覽", openImagePreview: "點擊檢視大圖", closeImagePreview: "關閉圖片預覽" },
  en: { threadImagePreview: "Image preview", openImagePreview: "Click to view full size", closeImagePreview: "Close image preview" },
  ja: { threadImagePreview: "画像プレビュー", openImagePreview: "クリックして拡大表示", closeImagePreview: "画像プレビューを閉じる" },
  ko: { threadImagePreview: "이미지 미리보기", openImagePreview: "클릭하여 크게 보기", closeImagePreview: "이미지 미리보기 닫기" },
};

// 会话清单文案明确时间字段和消息总数，避免误读为会话数量。
const TOKEN_USAGE_TRANSLATIONS = {
  "zh-CN": { tokenUsageKicker: "Token洞察", tokenUsageTitle: "Token 使用趋势", tokenUsageTotal: "合计：{total} Token", tokenUsageTooltipDate: "日期", tokenUsageTooltipTokens: "Token", tokenUsageTooltipSessions: "会话数", tokenUsageTrendTab: "趋势", tokenUsageDistributionTab: "会话分布", tokenUsageDistributionTitle: "会话 Token 分布", tokenUsageDistributionSummary: "合计：{count} 个会话", tokenUsageDistributionNoData: "近 {days} 天暂无本机会话 Token 数据。", tokenUsageLoading: "正在读取 Token 使用数据…", tokenUsageUnavailable: "Token 使用数据暂时不可用。", tokenUsageNoData: "近 {days} 天暂无可展示的 Token 数据。" },
  "zh-TW": { tokenUsageKicker: "Token 洞察", tokenUsageTitle: "Token 使用趨勢", tokenUsageTotal: "合計：{total} Token", tokenUsageTooltipDate: "日期", tokenUsageTooltipTokens: "Token", tokenUsageTooltipSessions: "工作階段數", tokenUsageTrendTab: "趨勢", tokenUsageDistributionTab: "工作階段分布", tokenUsageDistributionTitle: "工作階段 Token 分布", tokenUsageDistributionSummary: "合計：{count} 個工作階段", tokenUsageDistributionNoData: "近 {days} 天沒有本機工作階段 Token 資料。", tokenUsageLoading: "正在讀取 Token 使用資料…", tokenUsageUnavailable: "Token 使用資料暫時無法使用。", tokenUsageNoData: "近 {days} 天沒有可顯示的 Token 資料。" },
  en: { tokenUsageKicker: "TOKEN INSIGHTS", tokenUsageTitle: "Token usage trend", tokenUsageTotal: "Total: {total} tokens", tokenUsageTooltipDate: "Date", tokenUsageTooltipTokens: "Tokens", tokenUsageTooltipSessions: "Sessions", tokenUsageTrendTab: "Trend", tokenUsageDistributionTab: "Sessions", tokenUsageDistributionTitle: "Session Token distribution", tokenUsageDistributionSummary: "Total: {count} sessions", tokenUsageDistributionNoData: "No local session Token data for the last {days} days.", tokenUsageLoading: "Reading token usage…", tokenUsageUnavailable: "Token usage is unavailable.", tokenUsageNoData: "No token data for the last {days} days." },
  ja: { tokenUsageKicker: "Token インサイト", tokenUsageTitle: "Token 使用量の推移", tokenUsageTotal: "合計：{total} Token", tokenUsageTooltipDate: "日付", tokenUsageTooltipTokens: "Token", tokenUsageTooltipSessions: "セッション数", tokenUsageTrendTab: "推移", tokenUsageDistributionTab: "セッション分布", tokenUsageDistributionTitle: "セッション Token 分布", tokenUsageDistributionSummary: "合計：{count} セッション", tokenUsageDistributionNoData: "過去 {days} 日のローカルセッション Token データはありません。", tokenUsageLoading: "Token 使用量を読み込み中…", tokenUsageUnavailable: "Token 使用量を取得できません。", tokenUsageNoData: "過去 {days} 日の Token データはありません。" },
  ko: { tokenUsageKicker: "Token 인사이트", tokenUsageTitle: "Token 사용량 추세", tokenUsageTotal: "합계: {total} Token", tokenUsageTooltipDate: "날짜", tokenUsageTooltipTokens: "Token", tokenUsageTooltipSessions: "세션 수", tokenUsageTrendTab: "추세", tokenUsageDistributionTab: "세션 분포", tokenUsageDistributionTitle: "세션 Token 분포", tokenUsageDistributionSummary: "합계: {count}개 세션", tokenUsageDistributionNoData: "최근 {days}일의 로컬 세션 Token 데이터가 없습니다.", tokenUsageLoading: "Token 사용량을 읽는 중…", tokenUsageUnavailable: "Token 사용량을 사용할 수 없습니다.", tokenUsageNoData: "최근 {days}일의 Token 데이터가 없습니다." },
};

// 三张洞察图共用同一时间范围；词云文案独立维护以保持卡片足够紧凑。
const WORD_CLOUD_TRANSLATIONS = {
  "zh-CN": { wordCloudKicker: "关键词词云", wordCloudSummary: "{messages} 条输入 · {unique} 个主题", wordCloudWordCount: "{word}：出现 {count} 次", wordCloudLoading: "正在聚合输入主题…", wordCloudUnavailable: "输入主题暂时不可用。", wordCloudNoData: "暂无可展示的输入主题。" },
  "zh-TW": { wordCloudKicker: "關鍵詞詞雲", wordCloudSummary: "{messages} 則輸入 · {unique} 個主題", wordCloudWordCount: "{word}：出現 {count} 次", wordCloudLoading: "正在彙整輸入主題…", wordCloudUnavailable: "輸入主題暫時無法使用。", wordCloudNoData: "暫無可顯示的輸入主題。" },
  en: { wordCloudKicker: "KEYWORD CLOUD", wordCloudSummary: "{messages} inputs · {unique} topics", wordCloudWordCount: "{word}: {count} occurrences", wordCloudLoading: "Collecting input topics…", wordCloudUnavailable: "Input topics are unavailable.", wordCloudNoData: "No input topics to display." },
  ja: { wordCloudKicker: "キーワードクラウド", wordCloudSummary: "{messages} 件の入力 · {unique} 件のテーマ", wordCloudWordCount: "{word}：{count} 回", wordCloudLoading: "入力テーマを集計中…", wordCloudUnavailable: "入力テーマを利用できません。", wordCloudNoData: "表示できる入力テーマはありません。" },
  ko: { wordCloudKicker: "키워드 워드클라우드", wordCloudSummary: "입력 {messages}개 · 주제 {unique}개", wordCloudWordCount: "{word}: {count}회", wordCloudLoading: "입력 주제를 집계하는 중…", wordCloudUnavailable: "입력 주제를 사용할 수 없습니다.", wordCloudNoData: "표시할 입력 주제가 없습니다." },
};

const SESSION_ANALYTICS_TRANSLATIONS = {
  "zh-CN": {
    threadExpandSidebar: "展开会话概览",
    threadCollapseSidebar: "收起会话概览",
    recentThreads: "最近更新的会话",
    searchThreads: "搜索最近更新的会话",
    searchTotal: "共 {total} 个本机会话",
    threadIdLabel: "会话ID：",
    updated: "最后更新时间：{value}",
    created: "创建时间：{value}",
    threadStatusUnknown: "未提供",
    threadFileChangesRecord: "文件变更记录", threadIssuesRecord: "失败与中断", threadRecordCount: "共 {count} 条", threadNoFileChanges: "暂无文件变更", threadNoIssues: "暂无异常记录", threadViewAllRecords: "查看全部", threadCollapseRecords: "收起", threadTokenUsage: "Token 用量", threadTokenCompact: "{total} Token", threadTokenTotal: "总消耗：{total} Token", threadTokenInputOutput: "输入：{input} ｜输出：{output}", threadTokenCached: "缓存输入：{tokens}", threadTokenReasoning: "推理输出：{tokens}", threadTokenUnavailable: "当前会话未保存 Token 快照。", threadMessageDuration: "用时 {value}", threadTurnId: "会话ID:", threadExport: "导出会话", threadCopyId: "复制会话 ID", threadRefresh: "刷新", threadMoreActions: "更多操作",
  },
  "zh-TW": {
    threadExpandSidebar: "展開工作階段總覽",
    threadCollapseSidebar: "收合工作階段總覽",
    recentThreads: "最近更新的工作階段",
    searchThreads: "搜尋最近更新的工作階段",
    searchTotal: "共 {total} 個本機工作階段",
    threadIdLabel: "工作階段 ID：",
    updated: "最後更新時間：{value}",
    created: "建立時間：{value}",
    threadStatusUnknown: "未提供",
    threadFileChangesRecord: "檔案變更記錄", threadIssuesRecord: "失敗與中斷", threadRecordCount: "共 {count} 筆", threadNoFileChanges: "暫無檔案變更", threadNoIssues: "暫無異常記錄", threadViewAllRecords: "檢視全部", threadCollapseRecords: "收合", threadTokenUsage: "Token 用量", threadTokenCompact: "{total} Token", threadTokenTotal: "總消耗：{total} Token", threadTokenInputOutput: "輸入：{input} ｜輸出：{output}", threadTokenCached: "快取輸入：{tokens}", threadTokenReasoning: "推理輸出：{tokens}", threadTokenUnavailable: "目前工作階段未儲存 Token 快照。", threadMessageDuration: "耗時 {value}", threadTurnId: "工作階段 ID：", threadExport: "匯出工作階段", threadCopyId: "複製工作階段 ID", threadRefresh: "重新整理", threadMoreActions: "更多操作",
  },
  en: {
    threadExpandSidebar: "Expand session overview",
    threadCollapseSidebar: "Collapse session overview",
    recentThreads: "Recently updated sessions",
    searchThreads: "Search recently updated sessions",
    searchTotal: "{total} local sessions",
    updated: "Last updated: {value}",
    threadIdLabel: "Session ID:",
    created: "Created: {value}",
    threadStatusUnknown: "Unavailable",
    threadFileChangesRecord: "FILE CHANGES", threadIssuesRecord: "FAILURES & INTERRUPTIONS", threadRecordCount: "{count} total", threadNoFileChanges: "No file changes", threadNoIssues: "No issues", threadViewAllRecords: "View all", threadCollapseRecords: "Collapse", threadTokenUsage: "TOKEN USAGE", threadTokenCompact: "{total} tokens", threadTokenTotal: "Total: {total} tokens", threadTokenInputOutput: "Input: {input} | Output: {output}", threadTokenCached: "Cached input: {tokens}", threadTokenReasoning: "Reasoning output: {tokens}", threadTokenUnavailable: "No Token snapshot is saved for this session.", threadMessageDuration: "Took {value}", threadTurnId: "Session ID:", threadExport: "Export", threadCopyId: "Copy session ID", threadRefresh: "Refresh", threadMoreActions: "More actions",
  },
  ja: {
    threadExpandSidebar: "セッション概要を展開",
    threadCollapseSidebar: "セッション概要を折りたたむ",
    recentThreads: "最近更新したセッション",
    searchThreads: "最近更新したセッションを検索",
    searchTotal: "ローカルセッション：{total} 件",
    updated: "最終更新：{value}",
    threadIdLabel: "セッション ID：",
    created: "作成：{value}",
    threadStatusUnknown: "未提供",
    threadFileChangesRecord: "ファイル変更", threadIssuesRecord: "失敗と中断", threadRecordCount: "{count} 件", threadNoFileChanges: "ファイル変更はありません", threadNoIssues: "例外はありません", threadViewAllRecords: "すべて表示", threadCollapseRecords: "折りたたむ", threadTokenUsage: "Token 使用量", threadTokenCompact: "{total} Token", threadTokenTotal: "合計：{total} Token", threadTokenInputOutput: "入力：{input} ｜出力：{output}", threadTokenCached: "キャッシュ入力：{tokens}", threadTokenReasoning: "推論出力：{tokens}", threadTokenUnavailable: "このセッションの Token スナップショットはありません。", threadMessageDuration: "所要時間 {value}", threadTurnId: "セッション ID：", threadExport: "エクスポート", threadCopyId: "セッション ID をコピー", threadRefresh: "更新", threadMoreActions: "その他の操作",
  },
  ko: {
    threadIdLabel: "세션 ID:",
    threadExpandSidebar: "세션 개요 펼치기",
    threadCollapseSidebar: "세션 개요 접기",
    recentThreads: "최근 업데이트된 세션",
    searchThreads: "최근 업데이트된 세션 검색",
    searchTotal: "로컬 세션 {total}개",
    updated: "마지막 업데이트: {value}",
    created: "생성: {value}",
    threadStatusUnknown: "제공되지 않음",
    threadFileChangesRecord: "파일 변경 기록", threadIssuesRecord: "실패 및 중단", threadRecordCount: "총 {count}개", threadNoFileChanges: "파일 변경 없음", threadNoIssues: "예외 없음", threadViewAllRecords: "모두 보기", threadCollapseRecords: "접기", threadTokenUsage: "Token 사용량", threadTokenCompact: "{total} Token", threadTokenTotal: "합계: {total} Token", threadTokenInputOutput: "입력: {input} ｜출력: {output}", threadTokenCached: "캐시 입력: {tokens}", threadTokenReasoning: "추론 출력: {tokens}", threadTokenUnavailable: "이 세션에 Token 스냅샷이 없습니다.", threadMessageDuration: "소요 시간 {value}", threadTurnId: "세션 ID:", threadExport: "내보내기", threadCopyId: "세션 ID 복사", threadRefresh: "새로고침", threadMoreActions: "추가 작업",
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
    quotaAlertEnableLabel: "开启提醒", quotaAlertEnabledLabel: "提醒已开启",
    openQuotaReset: "前往重置", accountQuotaResetOpenFailed: "无法打开官方重置页面：{error}",
    quotaAlerts: "额度提醒", notificationDenied: "系统未允许通知权限，请在系统设置中为 Codex Desk 打开通知。", quotaAlertTitle: "Codex 额度提醒", quotaAlertBody: "当前已使用 {used}% · {remaining}",
  },
  "zh-TW": {
    quotaAlertEnableLabel: "開啟提醒", quotaAlertEnabledLabel: "提醒已開啟",
    openQuotaReset: "前往重設", accountQuotaResetOpenFailed: "無法開啟官方重設頁面：{error}",
    quotaAlerts: "額度提醒", notificationDenied: "系統未允許通知權限，請在系統設定中為 Codex Desk 開啟通知。", quotaAlertTitle: "Codex 額度提醒", quotaAlertBody: "目前已使用 {used}% · {remaining}",
  },
  en: {
    quotaAlertEnableLabel: "Enable alerts", quotaAlertEnabledLabel: "Alerts on",
    openQuotaReset: "Reset limits", accountQuotaResetOpenFailed: "Could not open the official reset page: {error}",
    quotaAlerts: "Quota alerts", notificationDenied: "Notifications are not allowed. Enable them for Codex Desk in system settings.", quotaAlertTitle: "Codex quota alert", quotaAlertBody: "{used}% used · {remaining}",
  },
  ja: {
    quotaAlertEnableLabel: "通知を有効化", quotaAlertEnabledLabel: "通知オン",
    openQuotaReset: "リセットページへ", accountQuotaResetOpenFailed: "公式リセットページを開けません：{error}",
    quotaAlerts: "クォータ通知", notificationDenied: "通知が許可されていません。システム設定で Codex Desk の通知を有効にしてください。", quotaAlertTitle: "Codex クォータ通知", quotaAlertBody: "使用済み {used}% · {remaining}",
  },
  ko: {
    quotaAlertEnableLabel: "알림 켜기", quotaAlertEnabledLabel: "알림 켜짐",
    openQuotaReset: "재설정 페이지", accountQuotaResetOpenFailed: "공식 재설정 페이지를 열 수 없습니다: {error}",
    quotaAlerts: "할당량 알림", notificationDenied: "알림이 허용되지 않았습니다. 시스템 설정에서 Codex Desk 알림을 켜세요.", quotaAlertTitle: "Codex 할당량 알림", quotaAlertBody: "{used}% 사용 · {remaining}",
  },
};

const ACCOUNT_TRANSLATIONS = {
  "zh-CN": {
    accountEmail: "登录邮箱", hideAccountEmail: "隐藏登录邮箱", showAccountEmail: "显示登录邮箱", accountPlan: "订阅方案", resetCreditsTitle: "使用限额重置", resetCreditsExpand: "展开", resetCreditsCollapse: "收起", resetCreditsDescription: "使用重置功能可恢复 5 小时限额或每周限额。", resetCreditsFullReset: "完全重置（每周 + 5 小时）", resetCreditsCount: "{count} 次", resetCreditExpires: "到期：{value}", resetCreditExpiresUnknown: "未提供到期时间", accountLoading: "正在读取账号信息…", accountEmailUnavailable: "当前登录方式未提供邮箱", accountPlanUnavailable: "未提供", accountDataReadFailed: "读取失败", openBilling: "查看订阅到期时间", accountBillingOpenFailed: "无法打开账单页面：{error}",
  },
  "zh-TW": {
    accountEmail: "登入信箱", hideAccountEmail: "隱藏登入信箱", showAccountEmail: "顯示登入信箱", accountPlan: "訂閱方案", resetCreditsTitle: "使用限額重設", resetCreditsExpand: "展開", resetCreditsCollapse: "收合", resetCreditsDescription: "使用重設功能可恢復 5 小時限額、每週限額或兩者。", resetCreditsFullReset: "完全重設（每週 + 5 小時）", resetCreditsCount: "{count} 次", resetCreditExpires: "到期：{value}", resetCreditExpiresUnknown: "未提供到期時間", accountLoading: "正在讀取帳號資訊…", accountEmailUnavailable: "目前登入方式未提供信箱", accountPlanUnavailable: "未提供", accountDataReadFailed: "讀取失敗", openBilling: "查看訂閱到期時間", accountBillingOpenFailed: "無法開啟帳單頁面：{error}",
  },
  en: {
    accountEmail: "Email", hideAccountEmail: "Hide email", showAccountEmail: "Show email", accountPlan: "Plan", resetCreditsTitle: "Rate limit resets", resetCreditsExpand: "Expand", resetCreditsCollapse: "Collapse", resetCreditsDescription: "A reset can restore your 5-hour limit, weekly limit, or both.", resetCreditsFullReset: "Full reset (Weekly + 5 hr)", resetCreditsCount: "{count}", resetCreditExpires: "Expires {value}", resetCreditExpiresUnknown: "No expiry provided", accountLoading: "Reading account…", accountEmailUnavailable: "No email is available for this sign-in method", accountPlanUnavailable: "Unavailable", accountDataReadFailed: "Read failed", openBilling: "View subscription expiry", accountBillingOpenFailed: "Could not open the billing page: {error}",
  },
  ja: {
    accountEmail: "メールアドレス", hideAccountEmail: "メールアドレスを隠す", showAccountEmail: "メールアドレスを表示", accountPlan: "プラン", resetCreditsTitle: "レート制限のリセット", resetCreditsExpand: "展開", resetCreditsCollapse: "折りたたむ", resetCreditsDescription: "リセットすると、5 時間枠、週次枠、または両方を回復できます。", resetCreditsFullReset: "完全リセット（週次 + 5 時間）", resetCreditsCount: "{count} 回", resetCreditExpires: "有効期限：{value}", resetCreditExpiresUnknown: "有効期限は未提供", accountLoading: "アカウント情報を読み込み中…", accountEmailUnavailable: "このログイン方法ではメールアドレスを取得できません", accountPlanUnavailable: "利用不可", accountDataReadFailed: "読み込み失敗", openBilling: "契約の有効期限を確認", accountBillingOpenFailed: "請求ページを開けませんでした：{error}",
  },
  ko: {
    accountEmail: "로그인 이메일", hideAccountEmail: "이메일 숨기기", showAccountEmail: "이메일 표시", accountPlan: "구독 플랜", resetCreditsTitle: "사용 한도 재설정", resetCreditsExpand: "펼치기", resetCreditsCollapse: "접기", resetCreditsDescription: "재설정으로 5시간 한도, 주간 한도 또는 둘 다를 복원할 수 있습니다.", resetCreditsFullReset: "전체 재설정(주간 + 5시간)", resetCreditsCount: "{count}회", resetCreditExpires: "만료: {value}", resetCreditExpiresUnknown: "만료 시간이 제공되지 않음", accountLoading: "계정 정보를 읽는 중…", accountEmailUnavailable: "현재 로그인 방식은 이메일을 제공하지 않습니다", accountPlanUnavailable: "제공되지 않음", accountDataReadFailed: "읽기 실패", openBilling: "구독 만료일 보기", accountBillingOpenFailed: "청구 페이지를 열 수 없습니다: {error}",
  },
};

const SESSION_SECTION_TRANSLATIONS = {
  "zh-CN": { expandLocalHistory: "展开本地历史", collapseLocalHistory: "收起本地历史",  },
  "zh-TW": { expandLocalHistory: "展開本機歷程", collapseLocalHistory: "收合本機歷程",  },
  en: { expandLocalHistory: "Show local history", collapseLocalHistory: "Hide local history",  },
  ja: { expandLocalHistory: "ローカル履歴を開く", collapseLocalHistory: "ローカル履歴を閉じる",  },
  ko: { expandLocalHistory: "로컬 기록 펼치기", collapseLocalHistory: "로컬 기록 접기",  },
};

// 一级模块使用统一的图标入口，标题栏空白区仍保留双击快捷操作。
const MODULE_EXPAND_TRANSLATIONS = {
  "zh-CN": { moduleExpandLabel: "放大模块", moduleRestoreLabel: "还原模块（也可按 Esc）" },
  "zh-TW": { moduleExpandLabel: "放大模組", moduleRestoreLabel: "還原模組（也可按 Esc）" },
  en: { moduleExpandLabel: "Expand section", moduleRestoreLabel: "Restore section (Esc)" },
  ja: { moduleExpandLabel: "モジュールを拡大", moduleRestoreLabel: "モジュールを元に戻す（Esc）" },
  ko: { moduleExpandLabel: "모듈 확대", moduleRestoreLabel: "모듈 복원(Esc)" },
};

const SETTINGS_TRANSLATIONS = {
  "zh-CN": { settingsTitle: "设置", settingsKicker: "本机偏好", openSettings: "打开设置", closeSettings: "关闭设置", settingsIntro: "配置 Codex CLI、数据刷新和额度提醒，所有设置仅保存在本机。", settingsCliPath: "Codex CLI 路径", settingsCliPathHint: "留空时使用系统 PATH 中的 codex；支持可执行文件及 .cmd/.bat 启动脚本。", settingsCliPathPlaceholder: "使用系统 PATH", settingsBrowse: "浏览", settingsBrowseFailed: "无法选择 CLI 文件：{error}", settingsUsePath: "使用系统 PATH", settingsRefreshInterval: "自动刷新间隔", settingsRefreshIntervalHint: "影响额度、趋势和已展开的会话列表。", settingsRefresh30Seconds: "30 秒", settingsRefresh60Seconds: "1 分钟", settingsRefresh2Minutes: "2 分钟", settingsRefresh5Minutes: "5 分钟", settingsRefresh10Minutes: "10 分钟", settingsQuotaAlertThresholds: "额度提醒阈值", settingsQuotaAlertThresholdsHint: "固定三个提醒档次，数值需依次递增。", settingsQuotaAlertThresholdLow: "第一档", settingsQuotaAlertThresholdMedium: "第二档", settingsQuotaAlertThresholdHigh: "第三档", settingsQuotaAlertThresholdInvalid: "请输入 1–100 的整数，且三个档次需依次递增。", settingsCancel: "取消", settingsSave: "保存并验证", settingsSaving: "正在验证 Codex CLI…", settingsSaved: "设置已保存，CLI {version}", settingsSaveFailed: "保存失败：{error}" },
  "zh-TW": { settingsTitle: "設定", settingsKicker: "本機偏好", openSettings: "開啟設定", closeSettings: "關閉設定", settingsIntro: "設定 Codex CLI、資料重新整理與額度提醒，所有設定只保存在本機。", settingsCliPath: "Codex CLI 路徑", settingsCliPathHint: "留空時使用系統 PATH 中的 codex；支援執行檔及 .cmd/.bat 啟動指令碼。", settingsCliPathPlaceholder: "使用系統 PATH", settingsBrowse: "瀏覽", settingsBrowseFailed: "無法選擇 CLI 檔案：{error}", settingsUsePath: "使用系統 PATH", settingsRefreshInterval: "自動重新整理間隔", settingsRefreshIntervalHint: "影響額度、趨勢與已展開的工作階段清單。", settingsRefresh30Seconds: "30 秒", settingsRefresh60Seconds: "1 分鐘", settingsRefresh2Minutes: "2 分鐘", settingsRefresh5Minutes: "5 分鐘", settingsRefresh10Minutes: "10 分鐘", settingsQuotaAlertThresholds: "額度提醒門檻", settingsQuotaAlertThresholdsHint: "固定三個提醒級別，數值需依序遞增。", settingsQuotaAlertThresholdLow: "第一級", settingsQuotaAlertThresholdMedium: "第二級", settingsQuotaAlertThresholdHigh: "第三級", settingsQuotaAlertThresholdInvalid: "請輸入 1–100 的整數，且三個級別需依序遞增。", settingsCancel: "取消", settingsSave: "儲存並驗證", settingsSaving: "正在驗證 Codex CLI…", settingsSaved: "設定已儲存，CLI {version}", settingsSaveFailed: "儲存失敗：{error}" },
  en: { settingsTitle: "Settings", settingsKicker: "LOCAL PREFERENCES", openSettings: "Open settings", closeSettings: "Close settings", settingsIntro: "Configure Codex CLI, data refresh, and quota alerts. All settings stay on this device.", settingsCliPath: "Codex CLI path", settingsCliPathHint: "Leave empty to use codex from PATH. Executables and .cmd/.bat launchers are supported.", settingsCliPathPlaceholder: "Use system PATH", settingsBrowse: "Browse", settingsBrowseFailed: "Could not choose a CLI file: {error}", settingsUsePath: "Use system PATH", settingsRefreshInterval: "Auto-refresh interval", settingsRefreshIntervalHint: "Applies to quota, trends, and the expanded session list.", settingsRefresh30Seconds: "30 seconds", settingsRefresh60Seconds: "1 minute", settingsRefresh2Minutes: "2 minutes", settingsRefresh5Minutes: "5 minutes", settingsRefresh10Minutes: "10 minutes", settingsQuotaAlertThresholds: "Quota alert thresholds", settingsQuotaAlertThresholdsHint: "Three fixed alert levels. Values must increase in order.", settingsQuotaAlertThresholdLow: "Level 1", settingsQuotaAlertThresholdMedium: "Level 2", settingsQuotaAlertThresholdHigh: "Level 3", settingsQuotaAlertThresholdInvalid: "Enter integers from 1–100 in strictly increasing order.", settingsCancel: "Cancel", settingsSave: "Save & validate", settingsSaving: "Validating Codex CLI…", settingsSaved: "Settings saved. CLI {version}", settingsSaveFailed: "Could not save: {error}" },
  ja: { settingsTitle: "設定", settingsKicker: "ローカル設定", openSettings: "設定を開く", closeSettings: "設定を閉じる", settingsIntro: "Codex CLI、データ更新、クォータ通知を設定します。設定はこの端末にのみ保存されます。", settingsCliPath: "Codex CLI パス", settingsCliPathHint: "空欄の場合はシステム PATH の codex を使用します。.cmd/.bat も指定できます。", settingsCliPathPlaceholder: "システム PATH を使用", settingsBrowse: "参照", settingsBrowseFailed: "CLI ファイルを選択できませんでした：{error}", settingsUsePath: "システム PATH", settingsRefreshInterval: "自動更新間隔", settingsRefreshIntervalHint: "クォータ、トレンド、展開中のセッション一覧に適用されます。", settingsRefresh30Seconds: "30 秒", settingsRefresh60Seconds: "1 分", settingsRefresh2Minutes: "2 分", settingsRefresh5Minutes: "5 分", settingsRefresh10Minutes: "10 分", settingsQuotaAlertThresholds: "クォータ通知しきい値", settingsQuotaAlertThresholdsHint: "通知は3段階固定です。値を昇順に設定してください。", settingsQuotaAlertThresholdLow: "第1段階", settingsQuotaAlertThresholdMedium: "第2段階", settingsQuotaAlertThresholdHigh: "第3段階", settingsQuotaAlertThresholdInvalid: "1～100の整数を昇順で入力してください。", settingsCancel: "キャンセル", settingsSave: "保存して確認", settingsSaving: "Codex CLI を確認中…", settingsSaved: "設定を保存しました。CLI {version}", settingsSaveFailed: "保存できませんでした：{error}" },
  ko: { settingsTitle: "설정", settingsKicker: "로컬 환경설정", openSettings: "설정 열기", closeSettings: "설정 닫기", settingsIntro: "Codex CLI, 데이터 새로 고침 및 할당량 알림을 설정합니다. 모든 설정은 이 기기에만 저장됩니다.", settingsCliPath: "Codex CLI 경로", settingsCliPathHint: "비워 두면 시스템 PATH의 codex를 사용합니다. .cmd/.bat 실행 파일도 지원합니다.", settingsCliPathPlaceholder: "시스템 PATH 사용", settingsBrowse: "찾아보기", settingsBrowseFailed: "CLI 파일을 선택할 수 없습니다: {error}", settingsUsePath: "시스템 PATH", settingsRefreshInterval: "자동 새로 고침 간격", settingsRefreshIntervalHint: "할당량, 추세 및 펼친 세션 목록에 적용됩니다.", settingsRefresh30Seconds: "30초", settingsRefresh60Seconds: "1분", settingsRefresh2Minutes: "2분", settingsRefresh5Minutes: "5분", settingsRefresh10Minutes: "10분", settingsQuotaAlertThresholds: "할당량 알림 임계값", settingsQuotaAlertThresholdsHint: "알림은 3단계로 고정되며 값은 오름차순이어야 합니다.", settingsQuotaAlertThresholdLow: "1단계", settingsQuotaAlertThresholdMedium: "2단계", settingsQuotaAlertThresholdHigh: "3단계", settingsQuotaAlertThresholdInvalid: "1–100 사이의 정수를 오름차순으로 입력하세요.", settingsCancel: "취소", settingsSave: "저장 및 확인", settingsSaving: "Codex CLI 확인 중…", settingsSaved: "설정이 저장되었습니다. CLI {version}", settingsSaveFailed: "저장 실패: {error}" },
};

const READING_TRANSLATIONS = {
  "zh-CN": {
    settingsReadingReset: "恢复默认",
    settingsReadingTitle: "阅读设置", settingsReadingHint: "仅影响会话正文；代码块保留等宽字体，未安装的字体会自动回退。",
    settingsReadingFont: "字体", settingsReadingFontSize: "字号", settingsReadingLineHeight: "行距",
    settingsReadingFontSystem: "系统默认", settingsReadingFontYahei: "微软雅黑", settingsReadingFontSongti: "宋体",
    settingsReadingFontSimhei: "黑体", settingsReadingFontKaiti: "楷体", settingsReadingFontFangsong: "仿宋", settingsReadingFontDengxian: "等线", settingsReadingFontPingfang: "苹方",
    settingsReadingFontYaheiUI: "微软雅黑 UI", settingsReadingFontNSimsun: "新宋体", settingsReadingFontSTSong: "华文宋体", settingsReadingFontSTHeiti: "华文黑体", settingsReadingFontSTKaiti: "华文楷体", settingsReadingFontSTFangsong: "华文仿宋", settingsReadingFontSTZhongsong: "华文中宋", settingsReadingFontSTXihei: "华文细黑", settingsReadingFontSourceHanSans: "思源黑体", settingsReadingFontSourceHanSerif: "思源宋体",
    settingsReadingSizeSmall: "小 · 13px", settingsReadingSizeNormal: "标准 · 14px", settingsReadingSizeLarge: "大 · 16px",
    settingsReadingLineCompact: "紧凑", settingsReadingLineComfortable: "舒适", settingsReadingLineLoose: "宽松",
    settingsReadingPreview: "这是会话正文预览。调整字体、字号和行距，找到适合你的阅读方式。",
  },
  "zh-TW": {
    settingsReadingReset: "恢復預設",
    settingsReadingTitle: "閱讀設定", settingsReadingHint: "僅影響工作階段正文；程式碼區塊保留等寬字體，未安裝的字體會自動替代。",
    settingsReadingFont: "字體", settingsReadingFontSize: "字級", settingsReadingLineHeight: "行距",
    settingsReadingFontSystem: "系統預設", settingsReadingFontYahei: "微軟雅黑", settingsReadingFontSongti: "宋體",
    settingsReadingFontSimhei: "黑體", settingsReadingFontKaiti: "楷體", settingsReadingFontFangsong: "仿宋", settingsReadingFontDengxian: "等線", settingsReadingFontPingfang: "蘋方",
    settingsReadingFontYaheiUI: "微軟雅黑 UI", settingsReadingFontNSimsun: "新宋體", settingsReadingFontSTSong: "華文宋體", settingsReadingFontSTHeiti: "華文黑體", settingsReadingFontSTKaiti: "華文楷體", settingsReadingFontSTFangsong: "華文仿宋", settingsReadingFontSTZhongsong: "華文中宋", settingsReadingFontSTXihei: "華文細黑", settingsReadingFontSourceHanSans: "思源黑體", settingsReadingFontSourceHanSerif: "思源宋體",
    settingsReadingSizeSmall: "小 · 13px", settingsReadingSizeNormal: "標準 · 14px", settingsReadingSizeLarge: "大 · 16px",
    settingsReadingLineCompact: "緊湊", settingsReadingLineComfortable: "舒適", settingsReadingLineLoose: "寬鬆",
    settingsReadingPreview: "這是正文預覽。調整字體、字級與行距，找到適合你的閱讀方式。",
  },
  en: {
    settingsReadingReset: "Restore defaults",
    settingsReadingTitle: "Reading settings", settingsReadingHint: "Applies to message text only. Code blocks stay monospace; unavailable fonts use a fallback.",
    settingsReadingFont: "Font", settingsReadingFontSize: "Text size", settingsReadingLineHeight: "Line spacing",
    settingsReadingFontSystem: "System default", settingsReadingFontYahei: "Microsoft YaHei", settingsReadingFontSongti: "SimSun",
    settingsReadingFontSimhei: "SimHei", settingsReadingFontKaiti: "KaiTi", settingsReadingFontFangsong: "FangSong", settingsReadingFontDengxian: "DengXian", settingsReadingFontPingfang: "PingFang SC",
    settingsReadingFontYaheiUI: "Microsoft YaHei UI", settingsReadingFontNSimsun: "NSimSun", settingsReadingFontSTSong: "STSong", settingsReadingFontSTHeiti: "STHeiti", settingsReadingFontSTKaiti: "STKaiti", settingsReadingFontSTFangsong: "STFangsong", settingsReadingFontSTZhongsong: "STZhongsong", settingsReadingFontSTXihei: "STXihei", settingsReadingFontSourceHanSans: "Source Han Sans SC", settingsReadingFontSourceHanSerif: "Source Han Serif SC",
    settingsReadingSizeSmall: "Small · 13px", settingsReadingSizeNormal: "Standard · 14px", settingsReadingSizeLarge: "Large · 16px",
    settingsReadingLineCompact: "Compact", settingsReadingLineComfortable: "Comfortable", settingsReadingLineLoose: "Spacious",
    settingsReadingPreview: "This is a message preview. Adjust the font, text size and line spacing to suit your reading preferences.",
  },
  ja: {
    settingsReadingReset: "既定に戻す",
    settingsReadingTitle: "読みやすさの設定", settingsReadingHint: "メッセージ本文のみ適用します。コードは等幅のままで、未インストールのフォントは代替されます。",
    settingsReadingFont: "フォント", settingsReadingFontSize: "文字サイズ", settingsReadingLineHeight: "行間",
    settingsReadingFontSystem: "システム既定", settingsReadingFontYahei: "Microsoft YaHei", settingsReadingFontSongti: "SimSun",
    settingsReadingFontSimhei: "SimHei", settingsReadingFontKaiti: "KaiTi", settingsReadingFontFangsong: "FangSong", settingsReadingFontDengxian: "DengXian", settingsReadingFontPingfang: "PingFang SC",
    settingsReadingFontYaheiUI: "Microsoft YaHei UI", settingsReadingFontNSimsun: "NSimSun", settingsReadingFontSTSong: "STSong", settingsReadingFontSTHeiti: "STHeiti", settingsReadingFontSTKaiti: "STKaiti", settingsReadingFontSTFangsong: "STFangsong", settingsReadingFontSTZhongsong: "STZhongsong", settingsReadingFontSTXihei: "STXihei", settingsReadingFontSourceHanSans: "Source Han Sans SC", settingsReadingFontSourceHanSerif: "Source Han Serif SC",
    settingsReadingSizeSmall: "小 · 13px", settingsReadingSizeNormal: "標準 · 14px", settingsReadingSizeLarge: "大 · 16px",
    settingsReadingLineCompact: "狭め", settingsReadingLineComfortable: "標準", settingsReadingLineLoose: "広め",
    settingsReadingPreview: "本文のプレビューです。フォント、文字サイズ、行間を読みやすく調整できます。",
  },
  ko: {
    settingsReadingReset: "기본값 복원",
    settingsReadingTitle: "읽기 설정", settingsReadingHint: "메시지 본문에만 적용됩니다. 코드 블록은 고정폭 글꼴을 유지하며 없는 글꼴은 대체됩니다.",
    settingsReadingFont: "글꼴", settingsReadingFontSize: "글자 크기", settingsReadingLineHeight: "줄 간격",
    settingsReadingFontSystem: "시스템 기본", settingsReadingFontYahei: "Microsoft YaHei", settingsReadingFontSongti: "SimSun",
    settingsReadingFontSimhei: "SimHei", settingsReadingFontKaiti: "KaiTi", settingsReadingFontFangsong: "FangSong", settingsReadingFontDengxian: "DengXian", settingsReadingFontPingfang: "PingFang SC",
    settingsReadingFontYaheiUI: "Microsoft YaHei UI", settingsReadingFontNSimsun: "NSimSun", settingsReadingFontSTSong: "STSong", settingsReadingFontSTHeiti: "STHeiti", settingsReadingFontSTKaiti: "STKaiti", settingsReadingFontSTFangsong: "STFangsong", settingsReadingFontSTZhongsong: "STZhongsong", settingsReadingFontSTXihei: "STXihei", settingsReadingFontSourceHanSans: "Source Han Sans SC", settingsReadingFontSourceHanSerif: "Source Han Serif SC",
    settingsReadingSizeSmall: "작게 · 13px", settingsReadingSizeNormal: "표준 · 14px", settingsReadingSizeLarge: "크게 · 16px",
    settingsReadingLineCompact: "좁게", settingsReadingLineComfortable: "편안하게", settingsReadingLineLoose: "넓게",
    settingsReadingPreview: "메시지 본문 미리보기입니다. 글꼴, 글자 크기와 줄 간격을 편하게 조절하세요.",
  },
};

const UPDATE_TRANSLATIONS = {
  "zh-CN": { currentVersionLabel: "当前版本 v{version}", checkForUpdates: "检查版本更新", checkingUpdatesTitle: "正在检查更新", checkingUpdatesDescription: "正在连接 GitHub 获取最新版本…", upToDateTitle: "已是最新版本", upToDateSummary: "当前已安装 Codex Desk v{current}", updateCheckFailedTitle: "检查更新失败", updateCheckFailedDescription: "无法获取 GitHub 版本信息，请检查网络后重试。", updateAvailableTitle: "发现 Codex Desk 新版本", updateVersionSummary: "当前 v{current} · 最新 v{latest}", updatePublishedAt: "发布于 {date}", updateNotesUnavailable: "仓库版本已升级，发布说明暂未提供。", updateViewRelease: "查看更新", updateLater: "稍后", updateDismiss: "知道了" },
  "zh-TW": { currentVersionLabel: "目前版本 v{version}", checkForUpdates: "檢查版本更新", checkingUpdatesTitle: "正在檢查更新", checkingUpdatesDescription: "正在連線 GitHub 取得最新版本…", upToDateTitle: "已是最新版本", upToDateSummary: "目前已安裝 Codex Desk v{current}", updateCheckFailedTitle: "檢查更新失敗", updateCheckFailedDescription: "無法取得 GitHub 版本資訊，請檢查網路後重試。", updateAvailableTitle: "發現 Codex Desk 新版本", updateVersionSummary: "目前 v{current} · 最新 v{latest}", updatePublishedAt: "發佈於 {date}", updateNotesUnavailable: "儲存庫版本已升級，發佈說明暫未提供。", updateViewRelease: "查看更新", updateLater: "稍後", updateDismiss: "知道了" },
  en: { currentVersionLabel: "Current version v{version}", checkForUpdates: "Check for updates", checkingUpdatesTitle: "Checking for updates", checkingUpdatesDescription: "Connecting to GitHub for the latest version…", upToDateTitle: "You're up to date", upToDateSummary: "Codex Desk v{current} is installed", updateCheckFailedTitle: "Update check failed", updateCheckFailedDescription: "Could not get version information from GitHub. Check your connection and try again.", updateAvailableTitle: "A Codex Desk update is available", updateVersionSummary: "Current v{current} · Latest v{latest}", updatePublishedAt: "Published {date}", updateNotesUnavailable: "The repository version has been updated, but release notes are not available yet.", updateViewRelease: "View update", updateLater: "Later", updateDismiss: "Got it" },
  ja: { currentVersionLabel: "現在のバージョン v{version}", checkForUpdates: "更新を確認", checkingUpdatesTitle: "更新を確認中", checkingUpdatesDescription: "GitHub から最新バージョンを取得しています…", upToDateTitle: "最新バージョンです", upToDateSummary: "Codex Desk v{current} がインストールされています", updateCheckFailedTitle: "更新の確認に失敗しました", updateCheckFailedDescription: "GitHub からバージョン情報を取得できません。ネットワークを確認して再試行してください。", updateAvailableTitle: "Codex Desk の新しいバージョンがあります", updateVersionSummary: "現在 v{current} · 最新 v{latest}", updatePublishedAt: "{date} 公開", updateNotesUnavailable: "リポジトリのバージョンは更新されていますが、リリースノートはまだありません。", updateViewRelease: "更新を見る", updateLater: "後で", updateDismiss: "了解" },
  ko: { currentVersionLabel: "현재 버전 v{version}", checkForUpdates: "업데이트 확인", checkingUpdatesTitle: "업데이트 확인 중", checkingUpdatesDescription: "GitHub에서 최신 버전을 가져오는 중…", upToDateTitle: "최신 버전입니다", upToDateSummary: "Codex Desk v{current}이 설치되어 있습니다", updateCheckFailedTitle: "업데이트 확인 실패", updateCheckFailedDescription: "GitHub에서 버전 정보를 가져올 수 없습니다. 네트워크를 확인한 후 다시 시도하세요.", updateAvailableTitle: "새 Codex Desk 버전이 있습니다", updateVersionSummary: "현재 v{current} · 최신 v{latest}", updatePublishedAt: "{date} 출시", updateNotesUnavailable: "저장소 버전이 업데이트되었지만 릴리스 설명은 아직 없습니다.", updateViewRelease: "업데이트 보기", updateLater: "나중에", updateDismiss: "확인" },
};

// 首页摘要使用独立短文案，避免状态提示占用账户用量和本地历史的首屏空间。
const HOME_SUMMARY_TRANSLATIONS = {
  "zh-CN": { quotaAlertStatusEnabled: "提醒已开启（阈值{thresholds}）", quotaAlertStatusDisabled: "提醒未开启（阈值{thresholds}）", quotaAlertToggleEnable: "开启额度提醒", quotaAlertToggleDisable: "关闭额度提醒", syncedStatusPrefix: "本地 Codex 已同步{plan}（仅从本机读取 · ", autoRefreshCountdownPrefix: "", autoRefreshCountdownSuffix: " 秒后自动刷新", syncedStatusSuffix: "）", autoRefreshRetryPrefix: "刷新失败，", autoRefreshRetrySuffix: " 秒后重试（第 {count} 次退避）", dashboardUnavailableTitle: "暂时无法连接 Codex", dashboardUnavailableDescription: "Codex 数据暂时不可用，请检查登录状态或网络连接。", dashboardUnavailableReason: "原因：{error}", dashboardUnavailableRetry: "{seconds} 秒后自动重试（第 {count} 次退避）", dashboardRetry: "立即重试" },
  "zh-TW": { quotaAlertStatusEnabled: "提醒已開啟（門檻{thresholds}）", quotaAlertStatusDisabled: "提醒未開啟（門檻{thresholds}）", quotaAlertToggleEnable: "開啟額度提醒", quotaAlertToggleDisable: "關閉額度提醒", syncedStatusPrefix: "本機 Codex 已同步{plan}（僅從本機讀取 · ", autoRefreshCountdownPrefix: "", autoRefreshCountdownSuffix: " 秒後自動重新整理", syncedStatusSuffix: "）", autoRefreshRetryPrefix: "重新整理失敗，", autoRefreshRetrySuffix: " 秒後重試（第 {count} 次退避）", dashboardUnavailableTitle: "暫時無法連線 Codex", dashboardUnavailableDescription: "Codex 資料暫時無法使用，請檢查登入狀態或網路連線。", dashboardUnavailableReason: "原因：{error}", dashboardUnavailableRetry: "{seconds} 秒後自動重試（第 {count} 次退避）", dashboardRetry: "立即重試" },
  en: { quotaAlertStatusEnabled: "Alerts on ({thresholds})", quotaAlertStatusDisabled: "Alerts off ({thresholds})", quotaAlertToggleEnable: "Enable quota alerts", quotaAlertToggleDisable: "Disable quota alerts", syncedStatusPrefix: "Local Codex synced{plan} (local data only · ", autoRefreshCountdownPrefix: "refreshes in ", autoRefreshCountdownSuffix: "s", syncedStatusSuffix: ")", autoRefreshRetryPrefix: "Refresh failed. Retrying in ", autoRefreshRetrySuffix: "s (backoff #{count})", dashboardUnavailableTitle: "Unable to connect to Codex", dashboardUnavailableDescription: "Codex data is temporarily unavailable. Check your sign-in status or network connection.", dashboardUnavailableReason: "Reason: {error}", dashboardUnavailableRetry: "Retrying automatically in {seconds}s (backoff #{count})", dashboardRetry: "Retry now" },
  ja: { quotaAlertStatusEnabled: "通知オン（{thresholds}）", quotaAlertStatusDisabled: "通知オフ（{thresholds}）", quotaAlertToggleEnable: "クォータ通知を有効化", quotaAlertToggleDisable: "クォータ通知を無効化", syncedStatusPrefix: "ローカル Codex を同期済み{plan}（ローカルデータのみ · ", autoRefreshCountdownPrefix: "", autoRefreshCountdownSuffix: " 秒後に自動更新", syncedStatusSuffix: "）", autoRefreshRetryPrefix: "更新に失敗しました。", autoRefreshRetrySuffix: " 秒後に再試行します（{count} 回目のバックオフ）", dashboardUnavailableTitle: "Codex に接続できません", dashboardUnavailableDescription: "Codex データを取得できません。ログイン状態またはネットワーク接続を確認してください。", dashboardUnavailableReason: "原因：{error}", dashboardUnavailableRetry: "{seconds} 秒後に自動再試行します（{count} 回目のバックオフ）", dashboardRetry: "今すぐ再試行" },
  ko: { quotaAlertStatusEnabled: "알림 켜짐({thresholds})", quotaAlertStatusDisabled: "알림 꺼짐({thresholds})", quotaAlertToggleEnable: "할당량 알림 켜기", quotaAlertToggleDisable: "할당량 알림 끄기", syncedStatusPrefix: "로컬 Codex 동기화됨{plan}(로컬 데이터만 · ", autoRefreshCountdownPrefix: "", autoRefreshCountdownSuffix: "초 후 자동 새로 고침", syncedStatusSuffix: ")", autoRefreshRetryPrefix: "새로 고침에 실패했습니다. ", autoRefreshRetrySuffix: "초 후 재시도합니다(백오프 {count}회).", dashboardUnavailableTitle: "Codex에 연결할 수 없음", dashboardUnavailableDescription: "Codex 데이터를 사용할 수 없습니다. 로그인 상태 또는 네트워크 연결을 확인하세요.", dashboardUnavailableReason: "원인: {error}", dashboardUnavailableRetry: "{seconds}초 후 자동 재시도(백오프 {count}회)", dashboardRetry: "지금 재시도" },
};

const DIALOG_SEARCH_TRANSLATIONS = {
  "zh-CN": {
    threadBackToHistory: "返回历史",
    searchThreadMessages: "搜索当前会话", searchThreadMessagesPlaceholder: "搜索当前会话内容", threadSearchMatches: "{current} / {total}", threadSearchNoMatches: "无匹配", threadTruncated: "该会话较长，仅搜索并显示最近 500 条消息。",
  },
  "zh-TW": {
    threadBackToHistory: "返回歷史",
    searchThreadMessages: "搜尋目前工作階段", searchThreadMessagesPlaceholder: "搜尋目前工作階段內容", threadSearchMatches: "{current} / {total}", threadSearchNoMatches: "沒有符合項目", threadTruncated: "此工作階段較長，僅搜尋並顯示最近 500 則訊息。",
  },
  en: {
    threadBackToHistory: "Back to history",
    searchThreadMessages: "Search this session", searchThreadMessagesPlaceholder: "Search messages", threadSearchMatches: "{current} / {total}", threadSearchNoMatches: "No matches", threadTruncated: "This session is long; only the latest 500 messages can be searched and displayed.",
  },
  ja: {
    threadBackToHistory: "履歴に戻る",
    searchThreadMessages: "このセッションを検索", searchThreadMessagesPlaceholder: "メッセージを検索", threadSearchMatches: "{current} / {total}", threadSearchNoMatches: "一致なし", threadTruncated: "このセッションは長いため、最新 500 件のメッセージのみ検索・表示できます。",
  },
  ko: {
    threadBackToHistory: "기록으로 돌아가기",
    searchThreadMessages: "현재 세션 검색", searchThreadMessagesPlaceholder: "메시지 검색", threadSearchMatches: "{current} / {total}", threadSearchNoMatches: "일치 항목 없음", threadTruncated: "이 세션은 길어서 최근 500개 메시지만 검색하고 표시합니다.",
  },
};

// 额度区域采用独立短文案，保证进度与重置时间在不同语言下都能紧凑呈现。
const QUOTA_LABEL_TRANSLATIONS = {
  "zh-CN": { compactQuotaWindowDays: "{count} 天", compactQuotaWindowHours: "{count} 小时", usedPercent: "已使用 {used}%", resetTime: "下次重置时间：{value}", resetCountdown: "下次重置：{value}", quotaWarning: "额度偏低", quotaCritical: "额度不足", quotaDataUnavailable: "暂不可用", unknown: "未知" },
  "zh-TW": { compactQuotaWindowDays: "{count} 天", compactQuotaWindowHours: "{count} 小時", usedPercent: "已使用 {used}%", resetTime: "下次重設時間：{value}", resetCountdown: "下次重設：{value}", quotaWarning: "額度偏低", quotaCritical: "額度不足", quotaDataUnavailable: "暫時無法使用", unknown: "未知" },
  en: { compactQuotaWindowDays: "{count}d", compactQuotaWindowHours: "{count}h", usedPercent: "{used}% used", resetTime: "Next reset: {value}", resetCountdown: "Next reset: {value}", quotaWarning: "Low quota", quotaCritical: "Quota exhausted", quotaDataUnavailable: "Unavailable", unknown: "Unknown" },
  ja: { compactQuotaWindowDays: "{count}日", compactQuotaWindowHours: "{count}時間", resetCredits: "リセットクレジット：{credits}", usedPercent: "使用済み {used}%", resetTime: "次回リセット：{value}", resetCountdown: "次回リセット：{value}", quotaWarning: "残りわずか", quotaCritical: "クォータ不足", quotaDataUnavailable: "取得できません", unknown: "不明" },
  ko: { compactQuotaWindowDays: "{count}일", compactQuotaWindowHours: "{count}시간", usedPercent: "{used}% 사용", resetTime: "다음 재설정: {value}", resetCountdown: "다음 재설정: {value}", quotaWarning: "할당량 부족", quotaCritical: "할당량 소진", quotaDataUnavailable: "일시적으로 사용 불가", unknown: "알 수 없음" },
};

const SESSION_HISTORY_TRANSLATIONS = {
  "zh-CN": { threadProcessRecords: "过程记录", searchPlaceholder: "按会话标题搜索", pinThread: "固定会话", unpinThread: "取消固定", threadPinned: "会话已固定", threadUnpinned: "已取消固定", loadOlderTurns: "加载更早记录", loadingOlderTurns: "正在加载更早记录…", olderTurnsFailed: "加载更早记录失败：{error}", loadedHistoryOnly: "仅搜索已加载消息", loadedInsights: "已加载记录", loadingFullOverview: "正在汇总完整会话…" },
  "zh-TW": { threadProcessRecords: "過程記錄", searchPlaceholder: "依工作階段標題搜尋", pinThread: "釘選工作階段", unpinThread: "取消釘選", threadPinned: "工作階段已釘選", threadUnpinned: "已取消釘選", loadOlderTurns: "載入更早記錄", loadingOlderTurns: "正在載入更早記錄…", olderTurnsFailed: "載入更早記錄失敗：{error}", loadedHistoryOnly: "僅搜尋已載入訊息", loadedInsights: "已載入記錄", loadingFullOverview: "正在彙總完整工作階段…" },
  en: { threadProcessRecords: "Process history", searchPlaceholder: "Search session titles", pinThread: "Pin session", unpinThread: "Unpin session", threadPinned: "Session pinned", threadUnpinned: "Session unpinned", loadOlderTurns: "Load older history", loadingOlderTurns: "Loading older history…", olderTurnsFailed: "Could not load older history: {error}", loadedHistoryOnly: "Search covers loaded messages", loadedInsights: "Loaded history", loadingFullOverview: "Summarizing the full session…" },
  ja: { threadProcessRecords: "処理の記録", searchPlaceholder: "セッション名で検索", pinThread: "セッションを固定", unpinThread: "固定を解除", threadPinned: "セッションを固定しました", threadUnpinned: "固定を解除しました", loadOlderTurns: "古い履歴を読み込む", loadingOlderTurns: "古い履歴を読み込み中…", olderTurnsFailed: "古い履歴を読み込めません：{error}", loadedHistoryOnly: "読み込み済みのメッセージのみ検索", loadedInsights: "読み込み済みの履歴", loadingFullOverview: "セッション全体を集計中…" },
  ko: { threadProcessRecords: "처리 기록", searchPlaceholder: "세션 제목 검색", pinThread: "세션 고정", unpinThread: "고정 해제", threadPinned: "세션을 고정했습니다", threadUnpinned: "고정을 해제했습니다", loadOlderTurns: "이전 기록 불러오기", loadingOlderTurns: "이전 기록을 불러오는 중…", olderTurnsFailed: "이전 기록을 불러오지 못했습니다: {error}", loadedHistoryOnly: "불러온 메시지만 검색", loadedInsights: "불러온 기록", loadingFullOverview: "전체 세션을 집계하는 중…" },
};

const NAVIGATION_TRANSLATIONS = {
  "zh-CN": { mainNavigation: "主导航", collapseSidebar: "收起侧栏", expandSidebar: "展开侧栏" },
  "zh-TW": { mainNavigation: "主導覽", collapseSidebar: "收起側欄", expandSidebar: "展開側欄" },
  en: { mainNavigation: "Main navigation", collapseSidebar: "Collapse sidebar", expandSidebar: "Expand sidebar" },
  ja: { mainNavigation: "メインナビゲーション", collapseSidebar: "サイドバーを閉じる", expandSidebar: "サイドバーを開く" },
  ko: { mainNavigation: "주 탐색", collapseSidebar: "사이드바 접기", expandSidebar: "사이드바 펼치기" },
};

const ACCOUNT_USAGE_TRANSLATIONS = {
  "zh-CN": { accountLastSynced: "最近同步", accountUsageSummaryLabel: "历史使用概况", accountLifetimeTokens: "累计 Token", accountPeakTokens: "单日 Token 峰值", accountLongestTask: "最长任务用时", accountLongestStreak: "最长连续天数", accountCurrentStreak: "当前连续天数", accountUsageHoursMinutes: "{hours} 小时 {minutes} 分", accountUsageMinutes: "{minutes} 分钟", accountUsageSeconds: "{seconds} 秒", accountUsageDays: "{count} 天" },
  "zh-TW": { accountLastSynced: "最近同步", accountUsageSummaryLabel: "歷史使用概況", accountLifetimeTokens: "累計 Token", accountPeakTokens: "單日 Token 峰值", accountLongestTask: "最長任務用時", accountLongestStreak: "最長連續天數", accountCurrentStreak: "目前連續天數", accountUsageHoursMinutes: "{hours} 小時 {minutes} 分", accountUsageMinutes: "{minutes} 分鐘", accountUsageSeconds: "{seconds} 秒", accountUsageDays: "{count} 天" },
  en: { accountLastSynced: "Last synced", accountUsageSummaryLabel: "Usage history overview", accountLifetimeTokens: "Lifetime Tokens", accountPeakTokens: "Daily Token peak", accountLongestTask: "Longest task", accountLongestStreak: "Longest streak", accountCurrentStreak: "Current streak", accountUsageHoursMinutes: "{hours}h {minutes}m", accountUsageMinutes: "{minutes}m", accountUsageSeconds: "{seconds} seconds", accountUsageDays: "{count} days" },
  ja: { accountLastSynced: "最終同期", accountUsageSummaryLabel: "利用履歴の概要", accountLifetimeTokens: "累計 Token", accountPeakTokens: "1日の Token ピーク", accountLongestTask: "最長タスク時間", accountLongestStreak: "最長連続日数", accountCurrentStreak: "現在の連続日数", accountUsageHoursMinutes: "{hours}時間{minutes}分", accountUsageMinutes: "{minutes}分", accountUsageSeconds: "{seconds}秒", accountUsageDays: "{count}日" },
  ko: { accountLastSynced: "최근 동기화", accountUsageSummaryLabel: "사용 기록 개요", accountLifetimeTokens: "누적 Token", accountPeakTokens: "일일 Token 최대", accountLongestTask: "최장 작업 시간", accountLongestStreak: "최장 연속 일수", accountCurrentStreak: "현재 연속 일수", accountUsageHoursMinutes: "{hours}시간 {minutes}분", accountUsageMinutes: "{minutes}분", accountUsageSeconds: "{seconds}초", accountUsageDays: "{count}일" },
};

const TOKEN_HEATMAP_TRANSLATIONS = {
  "zh-CN": { tokenHeatmapTitle: "每日 Token 活跃度", tokenHeatmapPrevious: "上个月", tokenHeatmapNext: "下个月", tokenHeatmapNoData: "所选月份暂无 Token 用量记录", tokenHeatmapLess: "少", tokenHeatmapMore: "多", tokenHeatmapSummary: "累计 {total} Token · 活跃 {active} 天" },
  "zh-TW": { tokenHeatmapTitle: "每日 Token 活躍度", tokenHeatmapPrevious: "上個月", tokenHeatmapNext: "下個月", tokenHeatmapNoData: "所選月份暫無 Token 用量記錄", tokenHeatmapLess: "少", tokenHeatmapMore: "多", tokenHeatmapSummary: "累計 {total} Token · 活躍 {active} 天" },
  en: { tokenHeatmapTitle: "Daily Token activity", tokenHeatmapPrevious: "Previous month", tokenHeatmapNext: "Next month", tokenHeatmapNoData: "No Token usage recorded in the selected month", tokenHeatmapLess: "Less", tokenHeatmapMore: "More", tokenHeatmapSummary: "{total} Tokens · {active} active days" },
  ja: { tokenHeatmapTitle: "日別 Token アクティビティ", tokenHeatmapPrevious: "前の月", tokenHeatmapNext: "次の月", tokenHeatmapNoData: "選択した月の Token 使用記録はありません", tokenHeatmapLess: "少", tokenHeatmapMore: "多", tokenHeatmapSummary: "合計 {total} Token · {active}日間アクティブ" },
  ko: { tokenHeatmapTitle: "일별 Token 활동", tokenHeatmapPrevious: "이전 달", tokenHeatmapNext: "다음 달", tokenHeatmapNoData: "선택한 달의 Token 사용 기록이 없습니다", tokenHeatmapLess: "적음", tokenHeatmapMore: "많음", tokenHeatmapSummary: "총 {total} Token · {active}일 활동" },
};

const TOPIC_TRANSLATIONS = {
  "zh-CN": { conversationTopics: "会话主题", topicsHint: "点击主题查看会话 · 最近 100 个会话，每个会话最多 500 条用户输入", topicFilterSummary: "{word} · 近 {days} 天 · 出现 {occurrences} 次 · 涉及 {count} 个会话", topicWordSummary: "{word} · 出现 {occurrences} 次 · 涉及 {count} 个会话", topicMatchCount: "出现 {count} 次" },
  "zh-TW": { conversationTopics: "工作階段主題", topicsHint: "點擊主題查看工作階段 · 最近 100 個工作階段，每個最多 500 則使用者輸入", topicFilterSummary: "{word} · 近 {days} 天 · 出現 {occurrences} 次 · 涉及 {count} 個工作階段", topicWordSummary: "{word} · 出現 {occurrences} 次 · 涉及 {count} 個工作階段", topicMatchCount: "出現 {count} 次" },
  en: { conversationTopics: "Session topics", topicsHint: "Select a topic · Latest 100 sessions, up to 500 user messages each", topicFilterSummary: "{word} · {days} days · {occurrences} occurrences · {count} sessions", topicWordSummary: "{word} · {occurrences} occurrences · {count} sessions", topicMatchCount: "{count} occurrences" },
  ja: { conversationTopics: "セッションのテーマ", topicsHint: "テーマからセッションを表示 · 最新100件、各500件までのユーザー入力", topicFilterSummary: "{word} · 過去{days}日 · {occurrences}回 · {count}セッション", topicWordSummary: "{word} · {occurrences}回 · {count}セッション", topicMatchCount: "{count}回" },
  ko: { conversationTopics: "세션 주제", topicsHint: "주제로 세션 보기 · 최근 100개 세션, 각 사용자 입력 최대 500개", topicFilterSummary: "{word} · 최근 {days}일 · {occurrences}회 · {count}개 세션", topicWordSummary: "{word} · {occurrences}회 · {count}개 세션", topicMatchCount: "{count}회" },
};

const ACCOUNT_SWITCH_TRANSLATIONS = {
  "zh-CN": {
    accountsLoginTitle: "登录新账户", accountsLoginHint: "在浏览器完成 ChatGPT 授权，默认以登录邮箱前缀命名。保存后可从列表选择切换。",
    accountsLoginNameLabel: "账户名称（可选）", accountsLoginNamePlaceholder: "留空时使用登录邮箱前缀",
    accountsLoginMethodLabel: "登录方式", accountsLoginMethodBrowser: "浏览器授权", accountsLoginMethodDevice: "设备码登录",
    accountsLoginDeviceHint: "获取设备码后，在浏览器输入并完成 ChatGPT 授权。默认使用登录邮箱前缀命名。",
    accountsLoginDeviceConfirm: "获取设备码", accountsDeviceReady: "使用设备码连接账户", accountsDeviceWaiting: "等待设备码授权",
    accountsDeviceWaitingHint: "在验证页面登录要添加的 ChatGPT 账户，输入下方设备码并确认授权。完成后自动保存，10 分钟内未完成请重新获取。",
    accountsDeviceCodeLabel: "一次性设备码", accountsDeviceStepCode: "获取设备码", accountsDeviceOpen: "打开设备验证页面", accountsDeviceCopied: "设备码已复制，请在验证页面粘贴。",
    accountsDeviceCopyLabel: "复制设备码",
    accountsLoginConfirm: "开始浏览器授权", accountsLoginReady: "连接你的 ChatGPT 账户", accountsLoginPreparing: "正在准备授权…",
    accountsLoginSaving: "授权已完成，正在保存…",
    accountsLoginWaiting: "等待浏览器授权", accountsLoginWaitingHint: "请在浏览器确认要添加的 ChatGPT 账户并完成授权。此窗口会自动更新，10 分钟后超时。",
    accountsLoginLocalHint: "通过本机 Codex 完成登录，凭据仅保存在这台设备。当前使用的账户保持不变。",
    accountsLoginStepName: "命名（可选）", accountsLoginStepBrowser: "浏览器授权", accountsLoginStepSave: "保存到账户库",
    accountsLoginReopen: "重新打开授权页面", accountsLoginCancel: "取消登录", accountsLoginOpened: "已打开授权页面，请在浏览器继续。",
    accountsLoginSaved: "新登录已保存，可在列表中选择切换。", accountsLoginCleanup: "账户已保存，但临时目录未能清理，请检查系统文件权限。",
    accountsLoginStatusFailed: "暂时无法读取登录进度，正在重试。你也可以取消后重新登录。",
    accountsManage: "切换账户", accountsTitle: "账户管理", accountsIntro: "保存常用账户，让工作与个人登录轻松切换。",
    settingsEmailVisibility: "邮箱显示", settingsEmailVisibilityHint: "统一控制账户用量、账户管理及账户弹窗中的邮箱显示。账户名称不受影响。",
    settingsEmailShow: "显示完整邮箱", settingsEmailHide: "隐藏邮箱（脱敏显示）",
    accountsUnsavedHint: "识别到未保存的账户，点击保存当前账户", accountsUnsavedCaption: "当前登录 · 尚未保存",
    accountsCredentialsChangedHint: "登录凭据已更新，点击更新保存", accountsCredentialsChangedCaption: "当前登录 · 凭据待更新",
    accountsUpdateSave: "更新保存", accountsCredentialsUpdateHint: "当前账户的登录凭据有变化，将更新原保存记录，不会新增账户。",
    accountsFlowTitle: "账户如何切换", accountsFlowLocal: "只替换本机凭据，不代理 Codex 请求",
    accountsFlowKicker: "切换链路", accountsFlowSaved: "已保存账户", accountsFlowSwitchLocal: "本地切换", accountsFlowSceneTarget: "重启后使用新凭据",
    accountsFlowStepOne: "1 选择账户", accountsFlowStepTwo: "2 替换凭据", accountsFlowStepThree: "3 重启后生效",
    accountsFlowValidate: "校验目标账户并执行切换", accountsFlowAuthLocation: "CODEX_HOME 中的当前凭据",
    accountsFlowPrivacy: "账户库与 auth.json 始终留在本机；此动画仅演示切换过程，不代表服务实际状态。",
    accountsFlowSelect: "选择已保存账户", accountsFlowSelectHint: "从账户库读取凭据",
    accountsFlowReplace: "替换当前登录", accountsFlowReplaceHint: "原子写入 auth.json",
    accountsFlowApply: "重启后核对", accountsFlowApplyHint: "可勾选重启本机服务",
    accountsFlowDetails: "查看账户识别与保存逻辑",
    accountsFlowRead: "跟随自动刷新或手动刷新读取 auth.json → 按账户 ID 与用户标识对比已保存账户",
    accountsFlowNew: "身份未匹配", accountsFlowNewHint: "显示 +1 → 保存当前账户 → 新增账户记录",
    accountsFlowChanged: "身份相同，Token 有变化", accountsFlowChangedHint: "显示蓝色圆点 → 更新保存 → 更新原记录；仅刷新时间变化不提示。",
    accountsFlowNote: "凭据保存在 .codex-desk/saved-accounts.json；切换前自动更新，切换后请重启客户端核对。",
    accountsCurrentCaption: "当前登录", accountsCurrentUnknown: "暂无可保存的 ChatGPT 登录", accountsSave: "保存当前账户",
    accountsListTitle: "已保存账户", accountsCount: "{count} 个账户", accountsSelected: "已选凭据", accountsSwitch: "切换", accountsReconnect: "重新同步",
    accountsRename: "重命名", accountsRemove: "移除账户", accountsEmailUnknown: "邮箱信息不可用", accountsLoading: "正在读取账户…", accountsLoadingHint: "正在检查本机保存的登录信息。",
    accountsEmptyTitle: "把常用账户留在这里", accountsEmptyHint: "保存当前登录，或点击“登录新账户”完成浏览器授权。",
    accountsLocalHint: "登录凭据仅保存在本机，不会上传；请妥善保管此设备。",
    accountsStorageHint: "当前存储方式不支持账户切换。启用文件管理后，请重新登录 Codex，再保存账户。", accountsEnable: "启用文件管理",
    accountsSaveTitle: "保存当前账户", accountsSaveHint: "取一个容易辨认的名称，下次切换时就能快速找到。",
    accountsRenameTitle: "给账户换个名称", accountsRenameHint: "名称只在本机显示，不会修改你的 ChatGPT 账户信息。",
    accountsRemoveTitle: "移除这个已保存账户？", accountsRemoveHint: "只移除本机保存的记录，不会注销正在使用的账户。之后可以重新保存。",
    accountsSwitchTitle: "切换到这个账户", accountsSwitchHint: "将更新本机登录信息。正在运行的 Codex 客户端可能需要重启，请先保存任务。",
    accountsEnableTitle: "启用本机文件管理", accountsEnableHint: "将 Codex 登录凭据存储方式改为文件。系统钥匙串中的登录不会自动迁移，请重新登录后保存账户。",
    accountsNameLabel: "账户名称", accountsNamePlaceholder: "例如：个人账户、工作账户", accountsNameInvalid: "请输入 1–48 个字符的账户名称。",
    accountsBack: "返回账户列表", accountsCancel: "取消", accountsClose: "关闭账户管理", accountsSaveConfirm: "保存账户", accountsRenameConfirm: "保存名称", accountsRemoveConfirm: "移除账户", accountsEnableConfirm: "启用文件管理",
    accountsSwitchConfirm: "仅切换登录信息", accountsSwitchRestart: "切换并重启服务", accountsRestartLabel: "同时重启本机 Codex 服务",
    accountsRestartHint: "共享服务的重启可能中断其他客户端任务。取消勾选则仅更新登录信息，稍后手动重启。", accountsWorking: "正在处理…",
    accountsSaved: "账户已保存。", accountsRemoved: "已移除保存记录，当前登录保持不变。", accountsFileEnabled: "已启用文件管理，请重新登录 Codex 后保存账户。",
    accountsSwitched: "登录信息已切换。请重启正在使用的 Codex 客户端；运行中服务的账户可能尚未更新。",
    accountsRestarted: "登录信息已切换，本机服务已重启。请核对当前账户，其他 Codex 客户端可能仍需重启。",
    accountsRestartFailed: "登录信息已切换，但服务未能启动。请手动启动 Codex 后再刷新。",
    accountsSyncFailed: "登录信息已切换，账户数据尚未同步，请稍后刷新。", accountsFailed: "操作未完成：{error}",
  },
  en: {
    accountsManage: "Switch account", accountsTitle: "Your accounts", accountsIntro: "Keep your everyday accounts ready for work and personal use.",
    settingsEmailVisibility: "Email visibility", settingsEmailVisibilityHint: "Controls emails in account usage, account management, and account dialogs. Account labels stay unchanged.",
    settingsEmailShow: "Show full emails", settingsEmailHide: "Hide emails (masked)",
    accountsUnsavedHint: "An unsaved account was detected. Save your current account.", accountsUnsavedCaption: "Current sign-in · Not saved",
    accountsCredentialsChangedHint: "Sign-in credentials changed. Update the saved account.", accountsCredentialsChangedCaption: "Current sign-in · Update needed",
    accountsUpdateSave: "Update saved account", accountsCredentialsUpdateHint: "Your sign-in credentials changed. This updates the existing saved account without adding another account.",
    accountsFlowTitle: "How switching works", accountsFlowLocal: "Local credentials only; no Codex request proxy",
    accountsFlowKicker: "SWITCHING FLOW", accountsFlowSaved: "Saved accounts", accountsFlowSwitchLocal: "Local switch", accountsFlowSceneTarget: "New credentials after restart",
    accountsFlowStepOne: "1 Select account", accountsFlowStepTwo: "2 Replace credentials", accountsFlowStepThree: "3 Restart to apply",
    accountsFlowValidate: "Validate the target and switch", accountsFlowAuthLocation: "Current credentials in CODEX_HOME",
    accountsFlowPrivacy: "Saved accounts and auth.json stay on this device. This animation illustrates the process, not the actual service state.",
    accountsFlowSelect: "Choose a saved account", accountsFlowSelectHint: "Read saved credentials",
    accountsFlowReplace: "Replace current sign-in", accountsFlowReplaceHint: "Write auth.json atomically",
    accountsFlowApply: "Restart and verify", accountsFlowApplyHint: "Optional local service restart",
    accountsFlowDetails: "How accounts are detected and saved",
    accountsFlowRead: "Automatic or manual refresh reads auth.json → compares account ID and user identity with saved accounts",
    accountsFlowNew: "No matching identity", accountsFlowNewHint: "Show +1 → save current account → add a saved account",
    accountsFlowChanged: "Same identity, changed tokens", accountsFlowChangedHint: "Show a blue dot → update saved account → replace the existing record. Refresh timestamps alone do not trigger a hint.",
    accountsFlowNote: "Credentials: .codex-desk/saved-accounts.json. Updated before switching; restart clients and verify afterward.",
    accountsCurrentCaption: "Local sign-in credentials", accountsCurrentUnknown: "No ChatGPT sign-in available to save", accountsSave: "Save current account",
    accountsListTitle: "Saved accounts", accountsCount: "{count} accounts", accountsSelected: "Selected credentials", accountsSwitch: "Switch", accountsReconnect: "Sync again",
    accountsRename: "Rename", accountsRemove: "Remove account", accountsEmailUnknown: "Email unavailable", accountsLoading: "Reading accounts…", accountsLoadingHint: "Checking sign-in details saved on this device.",
    accountsEmptyTitle: "Keep your accounts close", accountsEmptyHint: "Save your current sign-in. Sign in to another account in Codex, then save it here too.",
    accountsLocalHint: "Credentials stay on this device and are never uploaded. Keep this device secure.",
    accountsStorageHint: "This storage mode does not support switching. Enable file storage, sign in to Codex again, then save your account.", accountsEnable: "Enable file storage",
    accountsSaveTitle: "Save current account", accountsSaveHint: "Choose a name that makes this account easy to recognize.",
    accountsRenameTitle: "Rename this account", accountsRenameHint: "This name stays on this device. Your ChatGPT profile will not change.",
    accountsRemoveTitle: "Remove this saved account?", accountsRemoveHint: "Only the saved record is removed. Your current sign-in stays active, and you can save it again later.",
    accountsSwitchTitle: "Switch to this account", accountsSwitchHint: "This updates local credentials. Running Codex clients may need a restart. Save your work first.",
    accountsEnableTitle: "Enable local file storage", accountsEnableHint: "Codex will store credentials in a local file. Keyring credentials are not migrated automatically. Sign in again before saving.",
    accountsNameLabel: "Account name", accountsNamePlaceholder: "For example: Personal, Work", accountsNameInvalid: "Enter an account name with 1–48 characters.",
    accountsBack: "Back to accounts", accountsCancel: "Cancel", accountsClose: "Close account manager", accountsSaveConfirm: "Save account", accountsRenameConfirm: "Save name", accountsRemoveConfirm: "Remove account", accountsEnableConfirm: "Enable file storage",
    accountsSwitchConfirm: "Switch credentials only", accountsSwitchRestart: "Switch and restart", accountsRestartLabel: "Restart the local Codex service",
    accountsRestartHint: "Restarting the shared service may interrupt other clients. Uncheck to update credentials only and restart manually later.", accountsWorking: "Working…",
    accountsSaved: "Account saved.", accountsRemoved: "Saved record removed. Your current sign-in is unchanged.", accountsFileEnabled: "File storage enabled. Sign in to Codex again, then save your account.",
    accountsSwitched: "Credentials switched. Restart running Codex clients; the service may still use the previous account.",
    accountsRestarted: "Credentials switched and the local service restarted. Check the current account; other Codex clients may still need a restart.",
    accountsRestartFailed: "Credentials switched, but the service could not start. Start Codex manually, then refresh.",
    accountsSyncFailed: "Credentials switched. Account data is not synced yet; refresh in a moment.", accountsFailed: "Could not complete this action: {error}",
  },
};

const SETTINGS_LAYOUT_TRANSLATIONS = {
  "zh-CN": { settingsLayoutIntro: "调整本机偏好，修改后点击保存生效。", settingsStorageHint: "所有设置均保存在本机：{path}", settingsStorageLoading: "正在读取设置保存目录…", settingsStorageReadFailed: "无法读取设置保存目录", settingsCategoryLabel: "设置分类", settingsConnectionTab: "连接与刷新", settingsAlertsTab: "提醒与隐私", settingsReadingTab: "阅读显示", settingsPreviewLabel: "实时预览" },
  "zh-TW": { settingsLayoutIntro: "調整本機偏好，修改後點擊儲存生效。", settingsStorageHint: "所有設定均保存在本機：{path}", settingsStorageLoading: "正在讀取設定儲存目錄…", settingsStorageReadFailed: "無法讀取設定儲存目錄", settingsCategoryLabel: "設定分類", settingsConnectionTab: "連線與更新", settingsAlertsTab: "提醒與隱私", settingsReadingTab: "閱讀顯示", settingsPreviewLabel: "即時預覽" },
  en: { settingsLayoutIntro: "Preferences stay on this device. Save to apply changes.", settingsStorageHint: "All settings are saved locally: {path}", settingsStorageLoading: "Reading settings directory…", settingsStorageReadFailed: "Could not read the settings directory", settingsCategoryLabel: "Settings categories", settingsConnectionTab: "Connection & refresh", settingsAlertsTab: "Alerts & privacy", settingsReadingTab: "Reading", settingsPreviewLabel: "Live preview" },
  ja: { settingsLayoutIntro: "この端末の設定を変更し、保存すると反映されます。", settingsStorageHint: "設定の保存先（この端末）：{path}", settingsStorageLoading: "設定の保存先を読み込み中…", settingsStorageReadFailed: "設定の保存先を読み込めません", settingsCategoryLabel: "設定カテゴリ", settingsConnectionTab: "接続と更新", settingsAlertsTab: "通知とプライバシー", settingsReadingTab: "読みやすさ", settingsPreviewLabel: "プレビュー" },
  ko: { settingsLayoutIntro: "이 기기의 설정을 변경한 후 저장하면 적용됩니다.", settingsStorageHint: "이 기기의 설정 저장 위치: {path}", settingsStorageLoading: "설정 저장 위치를 읽는 중…", settingsStorageReadFailed: "설정 저장 위치를 읽을 수 없습니다", settingsCategoryLabel: "설정 분류", settingsConnectionTab: "연결 및 새로 고침", settingsAlertsTab: "알림 및 개인정보", settingsReadingTab: "읽기 설정", settingsPreviewLabel: "실시간 미리보기" },
};

// 低优先级文案先合并，后面的业务分组覆盖同名键，保持原有查询优先级。
const TRANSLATION_SOURCES = [
  SETTINGS_LAYOUT_TRANSLATIONS,
  ACCOUNT_SWITCH_TRANSLATIONS,
  NAVIGATION_TRANSLATIONS,
  TOPIC_TRANSLATIONS,
  TOKEN_HEATMAP_TRANSLATIONS,
  ACCOUNT_USAGE_TRANSLATIONS,
  TRANSLATIONS,
  IMAGE_PREVIEW_TRANSLATIONS,
  FILE_DIFF_TRANSLATIONS,
  ANALYTICS_TRANSLATIONS,
  WORD_CLOUD_TRANSLATIONS,
  TOKEN_USAGE_TRANSLATIONS,
  SESSION_ANALYTICS_TRANSLATIONS,
  TRANSFER_TRANSLATIONS,
  PRODUCT_TRANSLATIONS,
  ACCOUNT_TRANSLATIONS,
  DIALOG_SEARCH_TRANSLATIONS,
  SESSION_HISTORY_TRANSLATIONS,
  HOME_SUMMARY_TRANSLATIONS,
  MODULE_EXPAND_TRANSLATIONS,
  SESSION_SECTION_TRANSLATIONS,
  SETTINGS_TRANSLATIONS,
  READING_TRANSLATIONS,
  UPDATE_TRANSLATIONS,
  QUOTA_LABEL_TRANSLATIONS,
];
const TRANSLATIONS_BY_LANGUAGE = Object.fromEntries(
  SUPPORTED_LANGUAGES
    .filter((language) => language !== "system")
    .map((language) => [
      language,
      Object.assign({}, ...TRANSLATION_SOURCES.map((source) => source[language])),
    ]),
);

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
    const text = TRANSLATIONS_BY_LANGUAGE[language]?.[key]
      ?? TRANSLATIONS_BY_LANGUAGE["zh-CN"][key]
      ?? key;
    return text.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
  };
  const setMode = (nextMode) => {
    mode = SUPPORTED_LANGUAGES.includes(nextMode) ? nextMode : "system";
    writeStoredValue(LANGUAGE_STORAGE_KEY, mode);
  };

  return { getLanguage, getLocale, getMode, getLabelKey, isSystemMode, setMode, t };
}
