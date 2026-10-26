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
    compactQuotaWindowDays: "{count} 天", compactQuotaWindowHours: "{count} 小时",
    appTitle: "Codex 桌面控制台", secureAccess: "本机安全访问", remaining: "剩余", accountUsage: "账户用量",  quotaWindow: "额度窗口", quotaWindowDays: "{count} 天额度", quotaWindowHours: "{count} 小时额度", quotaWindowMinutes: "{count} 分钟额度",        minimize: "最小化到系统托盘", pinWindow: "置顶窗口", unpinWindow: "取消置顶", collapse: "收起为悬浮球", refresh: "立即刷新", quit: "退出程序", expandOrb: "展开 Codex 额度详情", collapseOrb: "收起 Codex 桌面控制台", orbTitle: "短按展开，按住后拖动", theme: "主题", themeLight: "白天", themeDark: "黑夜", language: "语言", languageSystem: "跟随系统", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "正在读取本地 Codex 数据…",   readFailed: "读取失败：{error}",        copied: "已复制", copyFailed: "失败", copy: "复制", copyFailedLong: "复制失败",  resetUnknown: "重置时间未知", resetCredits: "可用重置额度：{credits}",  planPrefix: " · {plan}",    codex: "Codex", windowResizeFailed: "无法调整悬浮窗：{error}", windowMaximizeFailed: "无法切换窗口最大化：{error}", windowAlwaysOnTopFailed: "无法切换窗口置顶状态：{error}", initializationFailed: "初始化失败：{error}", clipboardDenied: "系统未允许复制到剪贴板",
  "syncedStatusPrefix": "本地 Codex 已同步{plan}（仅从本机读取 · ", "autoRefreshCountdownPrefix": "", "autoRefreshCountdownSuffix": " 秒后自动刷新", "syncedStatusSuffix": "）", "autoRefreshRetryPrefix": "刷新失败，", "autoRefreshRetrySuffix": " 秒后重试（第 {count} 次退避）", "dashboardUnavailableTitle": "暂时无法连接 Codex", "dashboardUnavailableDescription": "Codex 数据暂时不可用，请检查登录状态或网络连接。", "dashboardUnavailableReason": "原因：{error}", "dashboardUnavailableRetry": "{seconds} 秒后自动重试（第 {count} 次退避）", "dashboardRetry": "立即重试"},
  "zh-TW": {
    compactQuotaWindowDays: "{count} 天", compactQuotaWindowHours: "{count} 小時",
    pinWindow: "置頂視窗", unpinWindow: "取消置頂", windowAlwaysOnTopFailed: "無法切換視窗置頂狀態：{error}",
    appTitle: "Codex 桌面控制台", secureAccess: "本機安全存取", remaining: "剩餘", accountUsage: "帳戶用量",  quotaWindow: "額度視窗", quotaWindowDays: "{count} 天額度", quotaWindowHours: "{count} 小時額度", quotaWindowMinutes: "{count} 分鐘額度",        minimize: "最小化到系統匣", collapse: "收合為浮動球", refresh: "立即重新整理", quit: "結束程式", expandOrb: "展開 Codex 額度詳情", collapseOrb: "收合 Codex 桌面控制台", orbTitle: "短按展開，按住後拖曳", theme: "主題", themeLight: "白天", themeDark: "黑夜", language: "語言", languageSystem: "跟隨系統", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "正在讀取本機 Codex 資料…",   readFailed: "讀取失敗：{error}",       copied: "已複製", copyFailed: "失敗", copy: "複製", copyFailedLong: "複製失敗",  resetUnknown: "重設時間未知", resetCredits: "可用重設額度：{credits}",  planPrefix: " · {plan}",   codex: "Codex", windowResizeFailed: "無法調整浮動視窗：{error}", windowMaximizeFailed: "無法切換視窗最大化：{error}", initializationFailed: "初始化失敗：{error}", clipboardDenied: "系統未允許複製到剪貼簿",
  "syncedStatusPrefix": "本機 Codex 已同步{plan}（僅從本機讀取 · ", "autoRefreshCountdownPrefix": "", "autoRefreshCountdownSuffix": " 秒後自動重新整理", "syncedStatusSuffix": "）", "autoRefreshRetryPrefix": "重新整理失敗，", "autoRefreshRetrySuffix": " 秒後重試（第 {count} 次退避）", "dashboardUnavailableTitle": "暫時無法連線 Codex", "dashboardUnavailableDescription": "Codex 資料暫時無法使用，請檢查登入狀態或網路連線。", "dashboardUnavailableReason": "原因：{error}", "dashboardUnavailableRetry": "{seconds} 秒後自動重試（第 {count} 次退避）", "dashboardRetry": "立即重試"},
  en: {
    compactQuotaWindowDays: "{count}d", compactQuotaWindowHours: "{count}h",
    pinWindow: "Keep window on top", unpinWindow: "Stop keeping window on top", windowAlwaysOnTopFailed: "Could not change the always-on-top state: {error}",
    appTitle: "Codex Desk", secureAccess: "Local secure access", remaining: "Left", accountUsage: "Account usage",  quotaWindow: "Quota window", quotaWindowDays: "{count} days", quotaWindowHours: "{count} hours", quotaWindowMinutes: "{count} min",        minimize: "Minimize to system tray", collapse: "Collapse to floating orb", refresh: "Refresh now", quit: "Quit", expandOrb: "Expand Codex quota details", collapseOrb: "Collapse Codex Desk", orbTitle: "Click to expand, drag to move", theme: "Theme", themeLight: "Light", themeDark: "Dark", language: "Language", languageSystem: "System", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "Reading local Codex data…",   readFailed: "Read failed: {error}",       copied: "Copied", copyFailed: "Failed", copy: "Copy", copyFailedLong: "Copy failed",  resetUnknown: "Reset time unavailable", resetCredits: "Reset credits: {credits}",  planPrefix: " · {plan}",   codex: "Codex", windowResizeFailed: "Could not resize floating window: {error}", windowMaximizeFailed: "Could not toggle window maximization: {error}", initializationFailed: "Initialization failed: {error}", clipboardDenied: "The system did not allow clipboard access",
  "syncedStatusPrefix": "Local Codex synced{plan} (local data only · ", "autoRefreshCountdownPrefix": "refreshes in ", "autoRefreshCountdownSuffix": "s", "syncedStatusSuffix": ")", "autoRefreshRetryPrefix": "Refresh failed. Retrying in ", "autoRefreshRetrySuffix": "s (backoff #{count})", "dashboardUnavailableTitle": "Unable to connect to Codex", "dashboardUnavailableDescription": "Codex data is temporarily unavailable. Check your sign-in status or network connection.", "dashboardUnavailableReason": "Reason: {error}", "dashboardUnavailableRetry": "Retrying automatically in {seconds}s (backoff #{count})", "dashboardRetry": "Retry now"},
  ja: {
    compactQuotaWindowDays: "{count}日", compactQuotaWindowHours: "{count}時間",
    pinWindow: "常に最前面に表示", unpinWindow: "最前面表示を解除", windowAlwaysOnTopFailed: "最前面表示を切り替えられません：{error}",
    appTitle: "Codex デスク", secureAccess: "ローカルの安全なアクセス", remaining: "残り", accountUsage: "アカウント使用量",  quotaWindow: "クォータ枠", quotaWindowDays: "{count} 日枠", quotaWindowHours: "{count} 時間枠", quotaWindowMinutes: "{count} 分枠",        minimize: "システムトレイへ最小化", collapse: "フローティングボールに縮小", refresh: "今すぐ更新", quit: "終了", expandOrb: "Codex のクォータ詳細を開く", collapseOrb: "Codex デスクを縮小", orbTitle: "クリックで展開、ドラッグで移動", theme: "テーマ", themeLight: "ライト", themeDark: "ダーク", language: "言語", languageSystem: "システムに従う", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "ローカルの Codex データを読み込み中…",   readFailed: "読み込みに失敗しました：{error}",       copied: "コピー済み", copyFailed: "失敗", copy: "コピー", copyFailedLong: "コピーに失敗",  resetUnknown: "リセット時刻は不明です",  planPrefix: " · {plan}",   codex: "Codex", windowResizeFailed: "フローティングウィンドウを変更できません：{error}", windowMaximizeFailed: "ウィンドウの最大化を切り替えられません：{error}", initializationFailed: "初期化に失敗しました：{error}", clipboardDenied: "システムでクリップボードへのアクセスが許可されていません",
  "syncedStatusPrefix": "ローカル Codex を同期済み{plan}（ローカルデータのみ · ", "autoRefreshCountdownPrefix": "", "autoRefreshCountdownSuffix": " 秒後に自動更新", "syncedStatusSuffix": "）", "autoRefreshRetryPrefix": "更新に失敗しました。", "autoRefreshRetrySuffix": " 秒後に再試行します（{count} 回目のバックオフ）", "dashboardUnavailableTitle": "Codex に接続できません", "dashboardUnavailableDescription": "Codex データを取得できません。ログイン状態またはネットワーク接続を確認してください。", "dashboardUnavailableReason": "原因：{error}", "dashboardUnavailableRetry": "{seconds} 秒後に自動再試行します（{count} 回目のバックオフ）", "dashboardRetry": "今すぐ再試行"},
  ko: {
    compactQuotaWindowDays: "{count}일", compactQuotaWindowHours: "{count}시간",
    pinWindow: "창을 항상 위에 표시", unpinWindow: "항상 위 표시 해제", windowAlwaysOnTopFailed: "창 항상 위 상태를 전환할 수 없습니다: {error}",
    appTitle: "Codex 데스크", secureAccess: "로컬 보안 액세스", remaining: "남음", accountUsage: "계정 사용량",  quotaWindow: "할당량 창", quotaWindowDays: "{count}일 할당량", quotaWindowHours: "{count}시간 할당량", quotaWindowMinutes: "{count}분 할당량",        minimize: "시스템 트레이로 최소화", collapse: "플로팅 버튼으로 접기", refresh: "지금 새로 고침", quit: "종료", expandOrb: "Codex 할당량 세부 정보 펼치기", collapseOrb: "Codex 데스크 접기", orbTitle: "클릭하여 펼치고 드래그하여 이동", theme: "테마", themeLight: "라이트", themeDark: "다크", language: "언어", languageSystem: "시스템 설정", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "로컬 Codex 데이터를 읽는 중…",   readFailed: "읽기 실패: {error}",       copied: "복사됨", copyFailed: "실패", copy: "복사", copyFailedLong: "복사 실패",  resetUnknown: "재설정 시간을 알 수 없습니다", resetCredits: "사용 가능한 재설정 크레딧: {credits}",  planPrefix: " · {plan}",   codex: "Codex", windowResizeFailed: "플로팅 창 크기를 조정할 수 없습니다: {error}", windowMaximizeFailed: "창 최대화 전환 실패: {error}", initializationFailed: "초기화 실패: {error}", clipboardDenied: "시스템에서 클립보드 액세스를 허용하지 않았습니다",
  "syncedStatusPrefix": "로컬 Codex 동기화됨{plan}(로컬 데이터만 · ", "autoRefreshCountdownPrefix": "", "autoRefreshCountdownSuffix": "초 후 자동 새로 고침", "syncedStatusSuffix": ")", "autoRefreshRetryPrefix": "새로 고침에 실패했습니다. ", "autoRefreshRetrySuffix": "초 후 재시도합니다(백오프 {count}회).", "dashboardUnavailableTitle": "Codex에 연결할 수 없음", "dashboardUnavailableDescription": "Codex 데이터를 사용할 수 없습니다. 로그인 상태 또는 네트워크 연결을 확인하세요.", "dashboardUnavailableReason": "원인: {error}", "dashboardUnavailableRetry": "{seconds}초 후 자동 재시도(백오프 {count}회)", "dashboardRetry": "지금 재시도"},
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
    accountLastSynced: "最近同步",
      accountPlan: "订阅方案",           accountPlanUnavailable: "未提供",  openBilling: "查看订阅到期时间", accountBillingOpenFailed: "无法打开账单页面：{error}",
  },
  "zh-TW": {
    accountLastSynced: "最近同步",
      accountPlan: "訂閱方案",           accountPlanUnavailable: "未提供",  openBilling: "查看訂閱到期時間", accountBillingOpenFailed: "無法開啟帳單頁面：{error}",
  },
  en: {
    accountLastSynced: "Last synced",
      accountPlan: "Plan",           accountPlanUnavailable: "Unavailable",  openBilling: "View subscription expiry", accountBillingOpenFailed: "Could not open the billing page: {error}",
  },
  ja: {
    accountLastSynced: "最終同期",
      accountPlan: "プラン",           accountPlanUnavailable: "利用不可",  openBilling: "契約の有効期限を確認", accountBillingOpenFailed: "請求ページを開けませんでした：{error}",
  },
  ko: {
    accountLastSynced: "최근 동기화",
      accountPlan: "구독 플랜",           accountPlanUnavailable: "제공되지 않음",  openBilling: "구독 만료일 보기", accountBillingOpenFailed: "청구 페이지를 열 수 없습니다: {error}",
  },
};

// 一级模块使用统一的图标入口，标题栏空白区仍保留双击快捷操作。

const SETTINGS_TRANSLATIONS = {
  "zh-CN": { settingsTitle: "设置", openSettings: "打开设置", closeSettings: "关闭设置",  settingsCliPath: "Codex CLI 路径", settingsCliPathHint: "留空时使用系统 PATH 中的 codex；支持可执行文件及 .cmd/.bat 启动脚本。", settingsCliPathPlaceholder: "使用系统 PATH", settingsBrowse: "浏览", settingsBrowseFailed: "无法选择 CLI 文件：{error}", settingsUsePath: "使用系统 PATH", settingsRefreshInterval: "自动刷新间隔", settingsRefreshIntervalHint: "控制账户用量和账户状态的自动刷新间隔。", settingsQuotaAlertThresholds: "额度提醒阈值", settingsQuotaAlertThresholdsHint: "固定三个提醒档次，数值需依次递增。", settingsQuotaAlertThresholdLow: "第一档", settingsQuotaAlertThresholdMedium: "第二档", settingsQuotaAlertThresholdHigh: "第三档", settingsQuotaAlertThresholdInvalid: "请输入 1–100 的整数，且三个档次需依次递增。", settingsCancel: "取消", settingsSave: "保存并验证", settingsSaving: "正在验证 Codex CLI…", settingsSaved: "设置已保存，CLI {version}", settingsSaveFailed: "保存失败：{error}" },
  "zh-TW": { settingsTitle: "設定", openSettings: "開啟設定", closeSettings: "關閉設定",  settingsCliPath: "Codex CLI 路徑", settingsCliPathHint: "留空時使用系統 PATH 中的 codex；支援執行檔及 .cmd/.bat 啟動指令碼。", settingsCliPathPlaceholder: "使用系統 PATH", settingsBrowse: "瀏覽", settingsBrowseFailed: "無法選擇 CLI 檔案：{error}", settingsUsePath: "使用系統 PATH", settingsRefreshInterval: "自動重新整理間隔", settingsRefreshIntervalHint: "控制帳戶用量與帳戶狀態的自動更新間隔。", settingsQuotaAlertThresholds: "額度提醒門檻", settingsQuotaAlertThresholdsHint: "固定三個提醒級別，數值需依序遞增。", settingsQuotaAlertThresholdLow: "第一級", settingsQuotaAlertThresholdMedium: "第二級", settingsQuotaAlertThresholdHigh: "第三級", settingsQuotaAlertThresholdInvalid: "請輸入 1–100 的整數，且三個級別需依序遞增。", settingsCancel: "取消", settingsSave: "儲存並驗證", settingsSaving: "正在驗證 Codex CLI…", settingsSaved: "設定已儲存，CLI {version}", settingsSaveFailed: "儲存失敗：{error}" },
  en: { settingsTitle: "Settings", openSettings: "Open settings", closeSettings: "Close settings",  settingsCliPath: "Codex CLI path", settingsCliPathHint: "Leave empty to use codex from PATH. Executables and .cmd/.bat launchers are supported.", settingsCliPathPlaceholder: "Use system PATH", settingsBrowse: "Browse", settingsBrowseFailed: "Could not choose a CLI file: {error}", settingsUsePath: "Use system PATH", settingsRefreshInterval: "Auto-refresh interval", settingsRefreshIntervalHint: "Controls automatic refresh of account usage and account status.", settingsQuotaAlertThresholds: "Quota alert thresholds", settingsQuotaAlertThresholdsHint: "Three fixed alert levels. Values must increase in order.", settingsQuotaAlertThresholdLow: "Level 1", settingsQuotaAlertThresholdMedium: "Level 2", settingsQuotaAlertThresholdHigh: "Level 3", settingsQuotaAlertThresholdInvalid: "Enter integers from 1–100 in strictly increasing order.", settingsCancel: "Cancel", settingsSave: "Save & validate", settingsSaving: "Validating Codex CLI…", settingsSaved: "Settings saved. CLI {version}", settingsSaveFailed: "Could not save: {error}" },
  ja: { settingsTitle: "設定", openSettings: "設定を開く", closeSettings: "設定を閉じる",  settingsCliPath: "Codex CLI パス", settingsCliPathHint: "空欄の場合はシステム PATH の codex を使用します。.cmd/.bat も指定できます。", settingsCliPathPlaceholder: "システム PATH を使用", settingsBrowse: "参照", settingsBrowseFailed: "CLI ファイルを選択できませんでした：{error}", settingsUsePath: "システム PATH", settingsRefreshInterval: "自動更新間隔", settingsRefreshIntervalHint: "アカウント使用量とアカウント状態の自動更新間隔を設定します。", settingsQuotaAlertThresholds: "クォータ通知しきい値", settingsQuotaAlertThresholdsHint: "通知は3段階固定です。値を昇順に設定してください。", settingsQuotaAlertThresholdLow: "第1段階", settingsQuotaAlertThresholdMedium: "第2段階", settingsQuotaAlertThresholdHigh: "第3段階", settingsQuotaAlertThresholdInvalid: "1～100の整数を昇順で入力してください。", settingsCancel: "キャンセル", settingsSave: "保存して確認", settingsSaving: "Codex CLI を確認中…", settingsSaved: "設定を保存しました。CLI {version}", settingsSaveFailed: "保存できませんでした：{error}" },
  ko: { settingsTitle: "설정", openSettings: "설정 열기", closeSettings: "설정 닫기",  settingsCliPath: "Codex CLI 경로", settingsCliPathHint: "비워 두면 시스템 PATH의 codex를 사용합니다. .cmd/.bat 실행 파일도 지원합니다.", settingsCliPathPlaceholder: "시스템 PATH 사용", settingsBrowse: "찾아보기", settingsBrowseFailed: "CLI 파일을 선택할 수 없습니다: {error}", settingsUsePath: "시스템 PATH", settingsRefreshInterval: "자동 새로 고침 간격", settingsRefreshIntervalHint: "계정 사용량과 계정 상태의 자동 새로 고침 간격을 설정합니다.", settingsQuotaAlertThresholds: "할당량 알림 임계값", settingsQuotaAlertThresholdsHint: "알림은 3단계로 고정되며 값은 오름차순이어야 합니다.", settingsQuotaAlertThresholdLow: "1단계", settingsQuotaAlertThresholdMedium: "2단계", settingsQuotaAlertThresholdHigh: "3단계", settingsQuotaAlertThresholdInvalid: "1–100 사이의 정수를 오름차순으로 입력하세요.", settingsCancel: "취소", settingsSave: "저장 및 확인", settingsSaving: "Codex CLI 확인 중…", settingsSaved: "설정이 저장되었습니다. CLI {version}", settingsSaveFailed: "저장 실패: {error}" },
};

// 额度区域采用独立短文案，保证进度与重置时间在不同语言下都能紧凑呈现。
const QUOTA_LABEL_TRANSLATIONS = {
  "zh-CN": {   usedPercent: "已使用 {used}%", resetTime: "下次重置时间：{value}", resetCountdown: "下次重置：{value}",   quotaDataUnavailable: "暂不可用", unknown: "未知" },
  "zh-TW": {   usedPercent: "已使用 {used}%", resetTime: "下次重設時間：{value}", resetCountdown: "下次重設：{value}",   quotaDataUnavailable: "暫時無法使用", unknown: "未知" },
  en: {   usedPercent: "{used}% used", resetTime: "Next reset: {value}", resetCountdown: "Next reset: {value}",   quotaDataUnavailable: "Unavailable", unknown: "Unknown" },
  ja: {   resetCredits: "リセットクレジット：{credits}", usedPercent: "使用済み {used}%", resetTime: "次回リセット：{value}", resetCountdown: "次回リセット：{value}",   quotaDataUnavailable: "取得できません", unknown: "不明" },
  ko: {   usedPercent: "{used}% 사용", resetTime: "다음 재설정: {value}", resetCountdown: "다음 재설정: {value}",   quotaDataUnavailable: "일시적으로 사용 불가", unknown: "알 수 없음" },
};

const NAVIGATION_TRANSLATIONS = {
  "zh-CN": { mainNavigation: "主导航", collapseSidebar: "收起侧栏", expandSidebar: "展开侧栏" },
  "zh-TW": { mainNavigation: "主導覽", collapseSidebar: "收起側欄", expandSidebar: "展開側欄" },
  en: { mainNavigation: "Main navigation", collapseSidebar: "Collapse sidebar", expandSidebar: "Expand sidebar" },
  ja: { mainNavigation: "メインナビゲーション", collapseSidebar: "サイドバーを閉じる", expandSidebar: "サイドバーを開く" },
  ko: { mainNavigation: "주 탐색", collapseSidebar: "사이드바 접기", expandSidebar: "사이드바 펼치기" },
};

const ACCOUNT_SWITCH_TRANSLATIONS = {
  "zh-CN": {
    accountsLoginTitle: "登录新账户",
    accountsLoginNameLabel: "账户名称（可选）", accountsLoginNamePlaceholder: "留空时使用登录邮箱前缀",
    accountsLoginMethodLabel: "登录方式", accountsLoginMethodBrowser: "浏览器授权", accountsLoginMethodDevice: "设备码登录",
    accountsLoginDeviceHint: "获取设备码后，在浏览器输入并完成 ChatGPT 授权。默认使用登录邮箱前缀命名。",
    accountsLoginDeviceConfirm: "获取设备码", accountsDeviceReady: "使用设备码连接账户", accountsDeviceWaiting: "等待设备码授权",
    accountsDeviceWaitingHint: "在验证页面登录要添加的 ChatGPT 账户，输入下方设备码并确认授权。完成后自动保存，10 分钟内未完成请重新获取。",
    accountsDeviceCodeLabel: "一次性设备码", accountsDeviceStepCode: "获取设备码", accountsDeviceOpen: "打开设备验证页面", accountsDeviceCopied: "设备码已复制，请在验证页面粘贴。",
    accountsDeviceCopyLabel: "复制设备码",
     accountsLoginReady: "连接你的 ChatGPT 账户", accountsLoginPreparing: "正在准备授权…",
    accountsLoginSaving: "授权已完成，正在保存…",
    accountsLoginWaiting: "等待浏览器授权", accountsLoginWaitingHint: "请在浏览器确认要添加的 ChatGPT 账户并完成授权。此窗口会自动更新，10 分钟后超时。",
    accountsLoginLocalHint: "通过本机 Codex 完成登录，凭据仅保存在这台设备。当前使用的账户保持不变。",
    accountsLoginStepName: "命名（可选）", accountsLoginStepBrowser: "浏览器授权", accountsLoginStepSave: "保存到账户库",
    accountsLoginReopen: "重新打开授权页面", accountsLoginCancel: "取消登录", accountsLoginOpened: "已打开授权页面，请在浏览器继续。",
    accountsLoginSaved: "新登录已保存，可在列表中选择切换。", accountsLoginCleanup: "账户已保存，但临时目录未能清理，请检查系统文件权限。",
    accountsLoginStatusFailed: "暂时无法读取登录进度，正在重试。你也可以取消后重新登录。",
    accountsManage: "切换账户", accountsTitle: "账户管理", accountsIntro: "保存常用账户，让工作与个人登录轻松切换。", accountsFlowKicker: "切换链路", accountsFlowLocal: "只替换本机凭据，不代理 Codex 请求", accountsFlowSaved: "已保存账户", accountsFlowSwitchLocal: "本地切换", accountsFlowSceneTarget: "重启后使用新凭据", accountsFlowStepOne: "1 选择账户", accountsFlowStepTwo: "2 替换凭据", accountsFlowStepThree: "3 重启后生效", accountsFlowValidate: "校验目标账户并执行切换", accountsFlowAuthLocation: "CODEX_HOME 中的当前凭据", accountsFlowApplyHint: "可勾选重启本机服务", accountsFlowPrivacy: "账户库与 auth.json 始终留在本机；此动画演示切换过程。", accountsFlowDetails: "查看账户识别与保存逻辑", accountsFlowRead: "自动刷新或手动刷新会读取 auth.json，并按账户身份匹配已保存账户", accountsFlowNew: "身份未匹配", accountsFlowNewHint: "保存当前账户后新增记录", accountsFlowChanged: "身份相同，Token 有变化", accountsFlowChangedHint: "更新保存记录，不会新增重复账户", accountsFlowNote: "切换前会更新账户记录，切换后可重启客户端核对。", accountsFlowSelect: "选择已保存账户", accountsSwitchGuideKicker: "切换说明", accountsSwitchGuideTitle: "账户如何切换", accountsSwitchGuideHint: "切换只修改本机登录凭据，不会上传账户信息。", accountsSwitchGuideStepOne: "选择账户", accountsSwitchGuideStepOneHint: "从已保存账户中选择目标", accountsSwitchGuideStepTwo: "替换本机凭据", accountsSwitchGuideStepTwoHint: "安全更新当前 auth.json", accountsSwitchGuideStepThree: "重启后生效", accountsSwitchGuideStepThreeHint: "可按需重启本机 Codex 服务",
    settingsEmailVisibility: "邮箱显示", settingsEmailVisibilityHint: "统一控制账户用量和账户管理中的邮箱显示。账户名称不受影响。",
    settingsEmailShow: "显示完整邮箱", settingsEmailHide: "隐藏邮箱（脱敏显示）",
    accountsUnsavedHint: "识别到未保存的账户，点击保存当前账户", accountsUnsavedCaption: "当前登录 · 尚未保存",
    accountsCredentialsChangedHint: "登录凭据已更新，点击更新保存", accountsCredentialsChangedCaption: "当前登录 · 凭据待更新",
    accountsUpdateSave: "更新保存", accountsCredentialsUpdateHint: "当前账户的登录凭据有变化，将更新原保存记录，不会新增账户。",
    accountsCurrentCaption: "当前登录", accountsCurrentUnknown: "暂无可保存的 ChatGPT 登录", accountsSave: "保存当前账户",
    accountsListTitle: "已保存账户", accountsCount: "{count} 个账户", accountsSelected: "已选凭据", accountsSwitch: "切换", accountsReconnect: "重新同步",
    accountsRename: "重命名", accountsRemove: "移除账户", accountsEmailUnknown: "邮箱信息不可用", accountsLoading: "正在读取账户…", accountsLoadingHint: "正在检查本机保存的登录信息。",
    accountsEmptyTitle: "把常用账户留在这里", accountsEmptyHint: "保存当前登录，或点击“登录新账户”完成浏览器授权。",
    accountsLocalHint: "登录凭据仅保存在本机，不会上传；请妥善保管此设备。",
    accountsStorageHint: "当前存储方式不支持账户切换。启用文件管理后，请重新登录 Codex，再保存账户。", accountsEnable: "启用文件管理",

    accountsNameLabel: "账户名称", accountsNamePlaceholder: "例如：个人账户、工作账户", accountsNameInvalid: "请输入 1–48 个字符的账户名称。",
    accountsBack: "返回账户列表", accountsCancel: "取消", accountsClose: "关闭账户管理",
     accountsSwitchRestart: "切换并重启服务", accountsRestartLabel: "同时重启本机 Codex 服务",
    accountsRestartHint: "共享服务的重启可能中断其他客户端任务。取消勾选则仅更新登录信息，稍后手动重启。", accountsWorking: "正在处理…",
    accountsSaved: "账户已保存。", accountsRemoved: "已移除保存记录，当前登录保持不变。", accountsFileEnabled: "已启用文件管理，请重新登录 Codex 后保存账户。",

    accountsRestartFailed: "登录信息已切换，但服务未能启动。请手动启动 Codex 后再刷新。",
    accountsSyncFailed: "登录信息已切换，账户数据尚未同步，请稍后刷新。", accountsFailed: "操作未完成：{error}",
  accountsLoginHint: "在浏览器完成 ChatGPT 授权，默认以登录邮箱前缀命名。保存后可从列表选择切换。", accountsLoginConfirm: "开始浏览器授权", accountsSaveTitle: "保存当前账户", accountsSaveHint: "取一个容易辨认的名称，下次切换时就能快速找到。", accountsRenameTitle: "给账户换个名称", accountsRenameHint: "名称只在本机显示，不会修改你的 ChatGPT 账户信息。", accountsRemoveTitle: "移除这个已保存账户？", accountsRemoveHint: "只移除本机保存的记录，不会注销正在使用的账户。之后可以重新保存。", accountsSwitchTitle: "切换到这个账户", accountsSwitchHint: "将更新本机登录信息。正在运行的 Codex 客户端可能需要重启，请先保存任务。", accountsEnableTitle: "启用本机文件管理", accountsEnableHint: "将 Codex 登录凭据存储方式改为文件。系统钥匙串中的登录不会自动迁移，请重新登录后保存账户。", accountsSaveConfirm: "保存账户", accountsRenameConfirm: "保存名称", accountsRemoveConfirm: "移除账户", accountsEnableConfirm: "启用文件管理", accountsSwitchConfirm: "仅切换登录信息", accountsSwitched: "登录信息已切换。请重启正在使用的 Codex 客户端；运行中服务的账户可能尚未更新。"},
  en: {
    accountsManage: "Switch account", accountsTitle: "Your accounts", accountsIntro: "Keep your everyday accounts ready for work and personal use.", accountsFlowKicker: "SWITCHING FLOW", accountsFlowLocal: "Local credentials only; no Codex request proxy", accountsFlowSaved: "Saved accounts", accountsFlowSwitchLocal: "Local switch", accountsFlowSceneTarget: "New credentials after restart", accountsFlowStepOne: "1 Select account", accountsFlowStepTwo: "2 Replace credentials", accountsFlowStepThree: "3 Restart to apply", accountsFlowValidate: "Validate the target and switch", accountsFlowAuthLocation: "Current credentials in CODEX_HOME", accountsFlowApplyHint: "Optional local service restart", accountsFlowPrivacy: "Saved accounts and auth.json stay on this device. This animation illustrates the switch.", accountsFlowDetails: "How accounts are detected and saved", accountsFlowRead: "Automatic or manual refresh reads auth.json and matches saved account identity", accountsFlowNew: "No matching identity", accountsFlowNewHint: "Save the current account to add a record", accountsFlowChanged: "Same identity, changed tokens", accountsFlowChangedHint: "Update the saved record without adding a duplicate", accountsFlowNote: "Update the saved record before switching, then restart and verify.", accountsFlowSelect: "Choose a saved account", accountsSwitchGuideKicker: "SWITCH GUIDE", accountsSwitchGuideTitle: "How account switching works", accountsSwitchGuideHint: "Switching updates local credentials only. Account data is never uploaded.", accountsSwitchGuideStepOne: "Choose an account", accountsSwitchGuideStepOneHint: "Pick a saved target account", accountsSwitchGuideStepTwo: "Replace local credentials", accountsSwitchGuideStepTwoHint: "Update the current auth.json safely", accountsSwitchGuideStepThree: "Restart to apply", accountsSwitchGuideStepThreeHint: "Restart the local Codex service when needed",
    settingsEmailVisibility: "Email visibility", settingsEmailVisibilityHint: "Controls emails in account usage and account management. Account labels stay unchanged.",
    settingsEmailShow: "Show full emails", settingsEmailHide: "Hide emails (masked)",
    accountsUnsavedHint: "An unsaved account was detected. Save your current account.", accountsUnsavedCaption: "Current sign-in · Not saved",
    accountsCredentialsChangedHint: "Sign-in credentials changed. Update the saved account.", accountsCredentialsChangedCaption: "Current sign-in · Update needed",
    accountsUpdateSave: "Update saved account", accountsCredentialsUpdateHint: "Your sign-in credentials changed. This updates the existing saved account without adding another account.",
    accountsCurrentCaption: "Local sign-in credentials", accountsCurrentUnknown: "No ChatGPT sign-in available to save", accountsSave: "Save current account",
    accountsListTitle: "Saved accounts", accountsCount: "{count} accounts", accountsSelected: "Selected credentials", accountsSwitch: "Switch", accountsReconnect: "Sync again",
    accountsRename: "Rename", accountsRemove: "Remove account", accountsEmailUnknown: "Email unavailable", accountsLoading: "Reading accounts…", accountsLoadingHint: "Checking sign-in details saved on this device.",
    accountsEmptyTitle: "Keep your accounts close", accountsEmptyHint: "Save your current sign-in. Sign in to another account in Codex, then save it here too.",
    accountsLocalHint: "Credentials stay on this device and are never uploaded. Keep this device secure.",
    accountsStorageHint: "This storage mode does not support switching. Enable file storage, sign in to Codex again, then save your account.", accountsEnable: "Enable file storage",

    accountsNameLabel: "Account name", accountsNamePlaceholder: "For example: Personal, Work", accountsNameInvalid: "Enter an account name with 1–48 characters.",
    accountsBack: "Back to accounts", accountsCancel: "Cancel", accountsClose: "Close account manager",
     accountsSwitchRestart: "Switch and restart", accountsRestartLabel: "Restart the local Codex service",
    accountsRestartHint: "Restarting the shared service may interrupt other clients. Uncheck to update credentials only and restart manually later.", accountsWorking: "Working…",
    accountsSaved: "Account saved.", accountsRemoved: "Saved record removed. Your current sign-in is unchanged.", accountsFileEnabled: "File storage enabled. Sign in to Codex again, then save your account.",

    accountsRestartFailed: "Credentials switched, but the service could not start. Start Codex manually, then refresh.",
    accountsSyncFailed: "Credentials switched. Account data is not synced yet; refresh in a moment.", accountsFailed: "Could not complete this action: {error}",
  accountsSaveTitle: "Save current account", accountsSaveHint: "Choose a name that makes this account easy to recognize.", accountsRenameTitle: "Rename this account", accountsRenameHint: "This name stays on this device. Your ChatGPT profile will not change.", accountsRemoveTitle: "Remove this saved account?", accountsRemoveHint: "Only the saved record is removed. Your current sign-in stays active, and you can save it again later.", accountsSwitchTitle: "Switch to this account", accountsSwitchHint: "This updates local credentials. Running Codex clients may need a restart. Save your work first.", accountsEnableTitle: "Enable local file storage", accountsEnableHint: "Codex will store credentials in a local file. Keyring credentials are not migrated automatically. Sign in again before saving.", accountsSaveConfirm: "Save account", accountsRenameConfirm: "Save name", accountsRemoveConfirm: "Remove account", accountsEnableConfirm: "Enable file storage", accountsSwitchConfirm: "Switch credentials only", accountsSwitched: "Credentials switched. Restart running Codex clients; the service may still use the previous account."},
};

const ACCOUNT_QUOTA_TRANSLATIONS = {
  "zh-CN": {
    accountQuotaMonitorHint: "同时查看已保存账户的额度余量与重置时间，查询不会切换当前登录。", accountQuotaRefreshing: "正在查询账户额度…",  accountQuotaHealthy: "状态正常", accountQuotaAttention: "需要注意", accountQuotaRemaining: "剩余", accountQuotaCurrent: "当前账户", accountQuotaCreditsCount: "充值卡 {count} 次", accountQuotaCreditsExpiry: "最近到期：{value}", accountQuotaCreditsExpiryItem: "第 {index} 张：{value}", accountQuotaCreditsExpiryUnknown: "暂无到期时间", accountQuotaUnavailable: "额度暂不可用", accountQuotaNoAccounts: "还没有可监控的账户", accountQuotaNoAccountsHint: "先在账户管理中保存一个 ChatGPT 账户，再回来刷新额度。", accountQuotaQueryFailed: "额度查询失败：{error}",
  },
  "zh-TW": {
    accountQuotaMonitorHint: "同時查看已保存帳戶的額度餘量與重設時間，查詢不會切換目前登入。", accountQuotaRefreshing: "正在查詢帳戶額度…",  accountQuotaHealthy: "狀態正常", accountQuotaAttention: "需要注意", accountQuotaRemaining: "剩餘", accountQuotaCurrent: "目前帳戶", accountQuotaCreditsCount: "充值卡 {count} 次", accountQuotaCreditsExpiry: "最近到期：{value}", accountQuotaCreditsExpiryUnknown: "暫無到期時間", accountQuotaUnavailable: "額度暫不可用", accountQuotaNoAccounts: "還沒有可監控的帳戶", accountQuotaNoAccountsHint: "先在帳戶管理中保存一個 ChatGPT 帳戶，再回來重新整理額度。", accountQuotaQueryFailed: "額度查詢失敗：{error}",
  },
  en: {
    accountQuotaMonitorHint: "See saved account headroom and reset times together. Queries never switch the active sign-in.", accountQuotaRefreshing: "Querying account quotas…",  accountQuotaHealthy: "Healthy", accountQuotaAttention: "Needs attention", accountQuotaRemaining: "Remaining", accountQuotaCurrent: "Current", accountQuotaCreditsCount: "Recharge cards: {count}", accountQuotaCreditsExpiry: "Earliest expiry: {value}", accountQuotaCreditsExpiryItem: "Card {index}: {value}", accountQuotaCreditsExpiryUnknown: "Expiry unavailable", accountQuotaUnavailable: "Unavailable", accountQuotaNoAccounts: "No accounts to monitor", accountQuotaNoAccountsHint: "Save a ChatGPT account in account management, then refresh this view.", accountQuotaQueryFailed: "Quota query failed: {error}",
  },
  ja: {
    accountQuotaMonitorHint: "保存済みアカウントの残量とリセット時刻をまとめて確認できます。現在のログインは切り替わりません。", accountQuotaRefreshing: "アカウントのクォータを確認中…",  accountQuotaHealthy: "正常", accountQuotaAttention: "要確認", accountQuotaRemaining: "残り", accountQuotaCurrent: "現在", accountQuotaUnavailable: "利用不可", accountQuotaNoAccounts: "監視するアカウントがありません", accountQuotaNoAccountsHint: "アカウント管理で ChatGPT アカウントを保存してから更新してください。", accountQuotaQueryFailed: "クォータの確認に失敗：{error}",
  },
  ko: {
    accountQuotaMonitorHint: "저장된 계정의 잔여량과 재설정 시간을 함께 확인합니다. 현재 로그인은 전환되지 않습니다.", accountQuotaRefreshing: "계정 할당량을 확인하는 중…",  accountQuotaHealthy: "정상", accountQuotaAttention: "확인 필요", accountQuotaRemaining: "남은 할당량", accountQuotaCurrent: "현재", accountQuotaUnavailable: "사용할 수 없음", accountQuotaNoAccounts: "모니터링할 계정이 없음", accountQuotaNoAccountsHint: "계정 관리에서 ChatGPT 계정을 저장한 후 새로 고침하세요.", accountQuotaQueryFailed: "할당량 조회 실패: {error}",
  },
};

const SETTINGS_LAYOUT_TRANSLATIONS = {
  "zh-CN": { settingsLayoutIntro: "调整本机偏好，修改后点击保存生效。", settingsStorageHint: "所有设置均保存在本机：{path}", settingsStorageLoading: "正在读取设置保存目录…", settingsStorageReadFailed: "无法读取设置保存目录", settingsCategoryLabel: "设置分类", settingsConnectionTab: "连接与刷新", settingsAlertsTab: "提醒与隐私" },
  "zh-TW": { settingsLayoutIntro: "調整本機偏好，修改後點擊儲存生效。", settingsStorageHint: "所有設定均保存在本機：{path}", settingsStorageLoading: "正在讀取設定儲存目錄…", settingsStorageReadFailed: "無法讀取設定儲存目錄", settingsCategoryLabel: "設定分類", settingsConnectionTab: "連線與更新", settingsAlertsTab: "提醒與隱私" },
  en: { settingsLayoutIntro: "Preferences stay on this device. Save to apply changes.", settingsStorageHint: "All settings are saved locally: {path}", settingsStorageLoading: "Reading settings directory…", settingsStorageReadFailed: "Could not read the settings directory", settingsCategoryLabel: "Settings categories", settingsConnectionTab: "Connection & refresh", settingsAlertsTab: "Alerts & privacy" },
  ja: { settingsLayoutIntro: "この端末の設定を変更し、保存すると反映されます。", settingsStorageHint: "設定の保存先（この端末）：{path}", settingsStorageLoading: "設定の保存先を読み込み中…", settingsStorageReadFailed: "設定の保存先を読み込めません", settingsCategoryLabel: "設定カテゴリ", settingsConnectionTab: "接続と更新", settingsAlertsTab: "通知とプライバシー" },
  ko: { settingsLayoutIntro: "이 기기의 설정을 변경한 후 저장하면 적용됩니다.", settingsStorageHint: "이 기기의 설정 저장 위치: {path}", settingsStorageLoading: "설정 저장 위치를 읽는 중…", settingsStorageReadFailed: "설정 저장 위치를 읽을 수 없습니다", settingsCategoryLabel: "설정 분류", settingsConnectionTab: "연결 및 새로 고침", settingsAlertsTab: "알림 및 개인정보" },
};

const PROXY_SETTINGS_TRANSLATIONS = {
  "zh-CN": {
    "settingsProxyTitle": "网络代理",
    "settingsProxyOff": "关闭",
    "settingsProxyToggle": "系统代理",
    "settingsProxyCustom": "自定义代理",
    "settingsProxyAddress": "代理地址",
    "settingsProxyAddressHint": "支持 HTTP / HTTPS，不填写账号密码或路径。",
    "settingsProxyInvalid": "请输入有效的 HTTP/HTTPS 代理地址，仅包含主机与端口。",
    "settingsProxyRestart": "保存时重启 Codex 服务",
    "settingsProxyRestartHint": "立即生效，会中断共享任务。"
  },
  "zh-TW": {
    "settingsProxyTitle": "網路代理",
    "settingsProxyOff": "關閉",
    "settingsProxyToggle": "系統代理",
    "settingsProxyCustom": "自訂代理",
    "settingsProxyAddress": "代理位址",
    "settingsProxyAddressHint": "支援 HTTP / HTTPS，請勿填寫帳號密碼或路徑。",
    "settingsProxyInvalid": "請輸入有效的 HTTP/HTTPS 代理位址，僅包含主機與連接埠。",
    "settingsProxyRestart": "儲存時重新啟動 Codex 服務",
    "settingsProxyRestartHint": "立即生效，會中斷共用工作。"
  },
  "en": {
    "settingsProxyTitle": "Network proxy",
    "settingsProxyOff": "Off",
    "settingsProxyToggle": "System proxy",
    "settingsProxyCustom": "Custom proxy",
    "settingsProxyAddress": "Proxy address",
    "settingsProxyAddressHint": "HTTP / HTTPS only. Do not include credentials or a path.",
    "settingsProxyInvalid": "Enter a valid HTTP/HTTPS proxy URL with a host and optional port.",
    "settingsProxyRestart": "Restart Codex service when saving",
    "settingsProxyRestartHint": "Applies now; interrupts shared tasks."
  },
  "ja": {
    "settingsProxyTitle": "ネットワークプロキシ",
    "settingsProxyOff": "オフ",
    "settingsProxyToggle": "システム",
    "settingsProxyCustom": "カスタム",
    "settingsProxyAddress": "プロキシアドレス",
    "settingsProxyAddressHint": "HTTP / HTTPS 対応。認証情報やパスは含めないでください。",
    "settingsProxyInvalid": "ホストとポートを含む有効な HTTP/HTTPS アドレスを入力してください。",
    "settingsProxyRestart": "保存時に Codex サービスを再起動",
    "settingsProxyRestartHint": "すぐに反映し、共有タスクを中断します。"
  },
  "ko": {
    "settingsProxyTitle": "네트워크 프록시",
    "settingsProxyOff": "꺼짐",
    "settingsProxyToggle": "시스템",
    "settingsProxyCustom": "사용자 지정",
    "settingsProxyAddress": "프록시 주소",
    "settingsProxyAddressHint": "HTTP / HTTPS 지원. 인증 정보나 경로는 넣지 마세요.",
    "settingsProxyInvalid": "호스트와 포트를 포함한 유효한 HTTP/HTTPS 주소를 입력하세요.",
    "settingsProxyRestart": "저장할 때 Codex 서비스 재시작",
    "settingsProxyRestartHint": "즉시 적용하며 공유 작업이 중단됩니다."
  }
};

// 低优先级文案先合并，后面的业务分组覆盖同名键，保持原有查询优先级。
const TRANSLATION_SOURCES = [
  SETTINGS_LAYOUT_TRANSLATIONS,
  PROXY_SETTINGS_TRANSLATIONS,
  ACCOUNT_SWITCH_TRANSLATIONS,
  ACCOUNT_QUOTA_TRANSLATIONS,
  NAVIGATION_TRANSLATIONS,
  TRANSLATIONS,
  PRODUCT_TRANSLATIONS,
  ACCOUNT_TRANSLATIONS,
  SETTINGS_TRANSLATIONS,
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
