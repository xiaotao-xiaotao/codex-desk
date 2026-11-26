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
    compactQuotaWindowDays: "{count}天", compactQuotaWindowHours: "{count}小时",
    appTitle: "Codex 桌面控制台", secureAccess: "本机安全访问", remaining: "剩余", accountUsage: "账户用量",  quotaWindow: "额度窗口", quotaWindowDays: "{count} 天额度", quotaWindowHours: "{count} 小时额度", quotaWindowMinutes: "{count} 分钟额度",        minimize: "最小化到系统托盘", pinWindow: "置顶窗口", unpinWindow: "取消置顶", collapse: "收起为悬浮球", refresh: "立即刷新", quit: "退出程序", expandOrb: "展开 Codex 额度详情", collapseOrb: "收起 Codex 桌面控制台", orbTitle: "短按展开，按住后拖动", theme: "主题", themeLight: "白天", themeDark: "黑夜", language: "语言", languageSystem: "跟随系统", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "正在查询账户额度…",   readFailed: "读取失败：{error}",        copied: "已复制", copyFailed: "失败", copy: "复制", copyFailedLong: "复制失败",  resetUnknown: "重置时间未知", resetCredits: "可用重置额度：{credits}",  planPrefix: " · {plan}",    codex: "Codex", windowResizeFailed: "无法调整悬浮窗：{error}", windowMaximizeFailed: "无法切换窗口最大化：{error}", windowAlwaysOnTopFailed: "无法切换窗口置顶状态：{error}", initializationFailed: "初始化失败：{error}", clipboardDenied: "系统未允许复制到剪贴板",
  "syncedStatusPrefix": "账户额度已更新{plan}（", "autoRefreshCountdownPrefix": "", "autoRefreshCountdownSuffix": " 秒后自动刷新", "syncedStatusSuffix": "）", "autoRefreshRetryPrefix": "刷新失败，", "autoRefreshRetrySuffix": " 秒后重试（第 {count} 次退避）", "dashboardUnavailableTitle": "暂时无法连接 Codex", "dashboardUnavailableDescription": "Codex 数据暂时不可用，请检查登录状态或网络连接。", "dashboardUnavailableReason": "原因：{error}", "dashboardUnavailableRetry": "{seconds} 秒后自动重试（第 {count} 次退避）", "dashboardRetry": "立即重试"},
  "zh-TW": {
    compactQuotaWindowDays: "{count}天", compactQuotaWindowHours: "{count}小時",
    pinWindow: "置頂視窗", unpinWindow: "取消置頂", windowAlwaysOnTopFailed: "無法切換視窗置頂狀態：{error}",
    appTitle: "Codex 桌面控制台", secureAccess: "本機安全存取", remaining: "剩餘", accountUsage: "帳戶用量",  quotaWindow: "額度視窗", quotaWindowDays: "{count} 天額度", quotaWindowHours: "{count} 小時額度", quotaWindowMinutes: "{count} 分鐘額度",        minimize: "最小化到系統匣", collapse: "收合為浮動球", refresh: "立即重新整理", quit: "結束程式", expandOrb: "展開 Codex 額度詳情", collapseOrb: "收合 Codex 桌面控制台", orbTitle: "短按展開，按住後拖曳", theme: "主題", themeLight: "白天", themeDark: "黑夜", language: "語言", languageSystem: "跟隨系統", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "正在查詢帳戶額度…",   readFailed: "讀取失敗：{error}",       copied: "已複製", copyFailed: "失敗", copy: "複製", copyFailedLong: "複製失敗",  resetUnknown: "重設時間未知", resetCredits: "可用重設額度：{credits}",  planPrefix: " · {plan}",   codex: "Codex", windowResizeFailed: "無法調整浮動視窗：{error}", windowMaximizeFailed: "無法切換視窗最大化：{error}", initializationFailed: "初始化失敗：{error}", clipboardDenied: "系統未允許複製到剪貼簿",
  "syncedStatusPrefix": "帳戶額度已更新{plan}（", "autoRefreshCountdownPrefix": "", "autoRefreshCountdownSuffix": " 秒後自動重新整理", "syncedStatusSuffix": "）", "autoRefreshRetryPrefix": "重新整理失敗，", "autoRefreshRetrySuffix": " 秒後重試（第 {count} 次退避）", "dashboardUnavailableTitle": "暫時無法連線 Codex", "dashboardUnavailableDescription": "Codex 資料暫時無法使用，請檢查登入狀態或網路連線。", "dashboardUnavailableReason": "原因：{error}", "dashboardUnavailableRetry": "{seconds} 秒後自動重試（第 {count} 次退避）", "dashboardRetry": "立即重試"},
  en: {
    compactQuotaWindowDays: "{count}d", compactQuotaWindowHours: "{count}h",
    pinWindow: "Keep window on top", unpinWindow: "Stop keeping window on top", windowAlwaysOnTopFailed: "Could not change the always-on-top state: {error}",
    appTitle: "Codex Desk", secureAccess: "Local secure access", remaining: "Left", accountUsage: "Account usage",  quotaWindow: "Quota window", quotaWindowDays: "{count} days", quotaWindowHours: "{count} hours", quotaWindowMinutes: "{count} min",        minimize: "Minimize to system tray", collapse: "Collapse to floating orb", refresh: "Refresh now", quit: "Quit", expandOrb: "Expand Codex quota details", collapseOrb: "Collapse Codex Desk", orbTitle: "Click to expand, drag to move", theme: "Theme", themeLight: "Light", themeDark: "Dark", language: "Language", languageSystem: "System", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "Querying account quota…",   readFailed: "Read failed: {error}",       copied: "Copied", copyFailed: "Failed", copy: "Copy", copyFailedLong: "Copy failed",  resetUnknown: "Reset time unavailable", resetCredits: "Reset credits: {credits}",  planPrefix: " · {plan}",   codex: "Codex", windowResizeFailed: "Could not resize floating window: {error}", windowMaximizeFailed: "Could not toggle window maximization: {error}", initializationFailed: "Initialization failed: {error}", clipboardDenied: "The system did not allow clipboard access",
  "syncedStatusPrefix": "Account quota updated{plan} (", "autoRefreshCountdownPrefix": "refreshes in ", "autoRefreshCountdownSuffix": "s", "syncedStatusSuffix": ")", "autoRefreshRetryPrefix": "Refresh failed. Retrying in ", "autoRefreshRetrySuffix": "s (backoff #{count})", "dashboardUnavailableTitle": "Unable to connect to Codex", "dashboardUnavailableDescription": "Codex data is temporarily unavailable. Check your sign-in status or network connection.", "dashboardUnavailableReason": "Reason: {error}", "dashboardUnavailableRetry": "Retrying automatically in {seconds}s (backoff #{count})", "dashboardRetry": "Retry now"},
  ja: {
    compactQuotaWindowDays: "{count}日", compactQuotaWindowHours: "{count}時間",
    pinWindow: "常に最前面に表示", unpinWindow: "最前面表示を解除", windowAlwaysOnTopFailed: "最前面表示を切り替えられません：{error}",
    appTitle: "Codex デスク", secureAccess: "ローカルの安全なアクセス", remaining: "残り", accountUsage: "アカウント使用量",  quotaWindow: "クォータ枠", quotaWindowDays: "{count} 日枠", quotaWindowHours: "{count} 時間枠", quotaWindowMinutes: "{count} 分枠",        minimize: "システムトレイへ最小化", collapse: "フローティングボールに縮小", refresh: "今すぐ更新", quit: "終了", expandOrb: "Codex のクォータ詳細を開く", collapseOrb: "Codex デスクを縮小", orbTitle: "クリックで展開、ドラッグで移動", theme: "テーマ", themeLight: "ライト", themeDark: "ダーク", language: "言語", languageSystem: "システムに従う", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "アカウントのクォータを取得中…",   readFailed: "読み込みに失敗しました：{error}",       copied: "コピー済み", copyFailed: "失敗", copy: "コピー", copyFailedLong: "コピーに失敗",  resetUnknown: "リセット時刻は不明です",  planPrefix: " · {plan}",   codex: "Codex", windowResizeFailed: "フローティングウィンドウを変更できません：{error}", windowMaximizeFailed: "ウィンドウの最大化を切り替えられません：{error}", initializationFailed: "初期化に失敗しました：{error}", clipboardDenied: "システムでクリップボードへのアクセスが許可されていません",
  "syncedStatusPrefix": "クォータ更新済み{plan}（", "autoRefreshCountdownPrefix": "", "autoRefreshCountdownSuffix": " 秒後に自動更新", "syncedStatusSuffix": "）", "autoRefreshRetryPrefix": "更新に失敗しました。", "autoRefreshRetrySuffix": " 秒後に再試行します（{count} 回目のバックオフ）", "dashboardUnavailableTitle": "Codex に接続できません", "dashboardUnavailableDescription": "Codex データを取得できません。ログイン状態またはネットワーク接続を確認してください。", "dashboardUnavailableReason": "原因：{error}", "dashboardUnavailableRetry": "{seconds} 秒後に自動再試行します（{count} 回目のバックオフ）", "dashboardRetry": "今すぐ再試行"},
  ko: {
    compactQuotaWindowDays: "{count}일", compactQuotaWindowHours: "{count}시간",
    pinWindow: "창을 항상 위에 표시", unpinWindow: "항상 위 표시 해제", windowAlwaysOnTopFailed: "창 항상 위 상태를 전환할 수 없습니다: {error}",
    appTitle: "Codex 데스크", secureAccess: "로컬 보안 액세스", remaining: "남음", accountUsage: "계정 사용량",  quotaWindow: "할당량 창", quotaWindowDays: "{count}일 할당량", quotaWindowHours: "{count}시간 할당량", quotaWindowMinutes: "{count}분 할당량",        minimize: "시스템 트레이로 최소화", collapse: "플로팅 버튼으로 접기", refresh: "지금 새로 고침", quit: "종료", expandOrb: "Codex 할당량 세부 정보 펼치기", collapseOrb: "Codex 데스크 접기", orbTitle: "클릭하여 펼치고 드래그하여 이동", theme: "테마", themeLight: "라이트", themeDark: "다크", language: "언어", languageSystem: "시스템 설정", languageZhCN: "简体中文", languageZhTW: "繁體中文", languageEn: "English", languageJa: "日本語", languageKo: "한국어", readingLocalData: "계정 할당량 조회 중…",   readFailed: "읽기 실패: {error}",       copied: "복사됨", copyFailed: "실패", copy: "복사", copyFailedLong: "복사 실패",  resetUnknown: "재설정 시간을 알 수 없습니다", resetCredits: "사용 가능한 재설정 크레딧: {credits}",  planPrefix: " · {plan}",   codex: "Codex", windowResizeFailed: "플로팅 창 크기를 조정할 수 없습니다: {error}", windowMaximizeFailed: "창 최대화 전환 실패: {error}", initializationFailed: "초기화 실패: {error}", clipboardDenied: "시스템에서 클립보드 액세스를 허용하지 않았습니다",
  "syncedStatusPrefix": "계정 할당량 업데이트됨{plan} (", "autoRefreshCountdownPrefix": "", "autoRefreshCountdownSuffix": "초 후 자동 새로 고침", "syncedStatusSuffix": ")", "autoRefreshRetryPrefix": "새로 고침에 실패했습니다. ", "autoRefreshRetrySuffix": "초 후 재시도합니다(백오프 {count}회).", "dashboardUnavailableTitle": "Codex에 연결할 수 없음", "dashboardUnavailableDescription": "Codex 데이터를 사용할 수 없습니다. 로그인 상태 또는 네트워크 연결을 확인하세요.", "dashboardUnavailableReason": "원인: {error}", "dashboardUnavailableRetry": "{seconds}초 후 자동 재시도(백오프 {count}회)", "dashboardRetry": "지금 재시도"},
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
    accountSubscriptionExpiryTitle: "订阅有效期",
    accountSubscriptionExpiresAt: "{date} 到期",
    accountSubscriptionRenewsAt: "{date} 续费",
    accountSubscriptionExpiryCountdown: "到期：{value}", accountSubscriptionRenewalCountdown: "续费：{value}", accountSubscriptionExpired: "已到期", accountSubscriptionRenewalDue: "续费时间已到",
    accountFreePlanDescription: "免费账户",
    accountSubscriptionExpiry: "有效期至", accountSubscriptionExpiryUnknown: "订阅有效期未知", accountSubscriptionExpiryHint: "有效期可能随续费或订阅变更更新，请以账单页面为准。",
      accountPlan: "订阅方案",           accountPlanUnavailable: "未提供",  openBilling: "查看订阅到期时间", accountBillingOpenFailed: "无法打开账单页面：{error}",
  },
  "zh-TW": {
    accountLastSynced: "最近同步",
    accountSubscriptionExpiryTitle: "訂閱有效期",
    accountSubscriptionExpiresAt: "{date} 到期",
    accountSubscriptionRenewsAt: "{date} 續費",
    accountSubscriptionExpiryCountdown: "到期：{value}", accountSubscriptionRenewalCountdown: "續費：{value}", accountSubscriptionExpired: "已到期", accountSubscriptionRenewalDue: "續費時間已到",
    accountFreePlanDescription: "免費帳戶",
    accountSubscriptionExpiry: "有效期至", accountSubscriptionExpiryUnknown: "訂閱有效期未知", accountSubscriptionExpiryHint: "有效期可能隨續費或訂閱變更更新，請以帳單頁面為準。",
      accountPlan: "訂閱方案",           accountPlanUnavailable: "未提供",  openBilling: "查看訂閱到期時間", accountBillingOpenFailed: "無法開啟帳單頁面：{error}",
  },
  en: {
    accountLastSynced: "Last synced",
    accountSubscriptionExpiryTitle: "Subscription expiry",
    accountSubscriptionExpiresAt: "Expires {date}",
    accountSubscriptionRenewsAt: "Renews {date}",
    accountSubscriptionExpiryCountdown: "Expires {value}", accountSubscriptionRenewalCountdown: "Renews {value}", accountSubscriptionExpired: "Expired", accountSubscriptionRenewalDue: "Renewal due",
    accountFreePlanDescription: "Free account",
    accountSubscriptionExpiry: "Valid until", accountSubscriptionExpiryUnknown: "Subscription expiry unknown", accountSubscriptionExpiryHint: "Renewals or subscription changes may update this date. Check the billing page for the current status.",
      accountPlan: "Plan",           accountPlanUnavailable: "Unavailable",  openBilling: "View subscription expiry", accountBillingOpenFailed: "Could not open the billing page: {error}",
  },
  ja: {
    accountLastSynced: "最終同期",
    accountSubscriptionExpiryTitle: "契約の有効期限",
    accountSubscriptionExpiresAt: "{date} まで有効",
    accountSubscriptionRenewsAt: "{date} 更新",
    accountSubscriptionExpiryCountdown: "{value}に期限切れ", accountSubscriptionRenewalCountdown: "{value}に更新", accountSubscriptionExpired: "期限切れ", accountSubscriptionRenewalDue: "更新予定時刻を経過",
    accountFreePlanDescription: "無料アカウント",
    accountSubscriptionExpiry: "有効期限", accountSubscriptionExpiryUnknown: "契約の有効期限は不明", accountSubscriptionExpiryHint: "更新や契約変更により期限が変わる場合があります。最新の状態は請求ページでご確認ください。",
      accountPlan: "プラン",           accountPlanUnavailable: "利用不可",  openBilling: "契約の有効期限を確認", accountBillingOpenFailed: "請求ページを開けませんでした：{error}",
  },
  ko: {
    accountLastSynced: "최근 동기화",
    accountSubscriptionExpiryTitle: "구독 만료일",
    accountSubscriptionExpiresAt: "{date} 만료",
    accountSubscriptionRenewsAt: "{date} 갱신",
    accountSubscriptionExpiryCountdown: "{value} 만료", accountSubscriptionRenewalCountdown: "{value} 갱신", accountSubscriptionExpired: "만료됨", accountSubscriptionRenewalDue: "갱신 예정 시간 지남",
    accountFreePlanDescription: "무료 계정",
    accountSubscriptionExpiry: "유효 기한", accountSubscriptionExpiryUnknown: "구독 만료일 알 수 없음", accountSubscriptionExpiryHint: "갱신 또는 구독 변경에 따라 날짜가 바뀔 수 있습니다. 최신 상태는 청구 페이지에서 확인하세요.",
      accountPlan: "구독 플랜",           accountPlanUnavailable: "제공되지 않음",  openBilling: "구독 만료일 보기", accountBillingOpenFailed: "청구 페이지를 열 수 없습니다: {error}",
  },
};

// 一级模块使用统一的图标入口，标题栏空白区仍保留双击快捷操作。

const SETTINGS_TRANSLATIONS = {
  "zh-CN": { settingsTitle: "设置", openSettings: "打开设置", closeSettings: "关闭设置", settingsRefreshInterval: "自动刷新间隔", settingsRefreshIntervalHint: "控制账户用量和账户状态的自动刷新间隔。", settingsQuotaAlertThresholds: "额度提醒阈值", settingsQuotaAlertThresholdsHint: "固定三个提醒档次，数值需依次递增。", settingsQuotaAlertThresholdLow: "第一档", settingsQuotaAlertThresholdMedium: "第二档", settingsQuotaAlertThresholdHigh: "第三档", settingsQuotaAlertThresholdInvalid: "请输入 1–100 的整数，且三个档次需依次递增。", settingsCancel: "取消", settingsSave: "保存", settingsSaving: "正在保存设置…", settingsSaved: "设置已保存", settingsSaveFailed: "保存失败：{error}" },
  "zh-TW": { settingsTitle: "設定", openSettings: "開啟設定", closeSettings: "關閉設定", settingsRefreshInterval: "自動重新整理間隔", settingsRefreshIntervalHint: "控制帳戶用量與帳戶狀態的自動更新間隔。", settingsQuotaAlertThresholds: "額度提醒門檻", settingsQuotaAlertThresholdsHint: "固定三個提醒級別，數值需依序遞增。", settingsQuotaAlertThresholdLow: "第一級", settingsQuotaAlertThresholdMedium: "第二級", settingsQuotaAlertThresholdHigh: "第三級", settingsQuotaAlertThresholdInvalid: "請輸入 1–100 的整數，且三個級別需依序遞增。", settingsCancel: "取消", settingsSave: "儲存", settingsSaving: "正在儲存設定…", settingsSaved: "設定已儲存", settingsSaveFailed: "儲存失敗：{error}" },
  en: { settingsTitle: "Settings", openSettings: "Open settings", closeSettings: "Close settings", settingsRefreshInterval: "Auto-refresh interval", settingsRefreshIntervalHint: "Controls automatic refresh of account usage and account status.", settingsQuotaAlertThresholds: "Quota alert thresholds", settingsQuotaAlertThresholdsHint: "Three fixed alert levels. Values must increase in order.", settingsQuotaAlertThresholdLow: "Level 1", settingsQuotaAlertThresholdMedium: "Level 2", settingsQuotaAlertThresholdHigh: "Level 3", settingsQuotaAlertThresholdInvalid: "Enter integers from 1–100 in strictly increasing order.", settingsCancel: "Cancel", settingsSave: "Save", settingsSaving: "Saving settings…", settingsSaved: "Settings saved", settingsSaveFailed: "Could not save: {error}" },
  ja: { settingsTitle: "設定", openSettings: "設定を開く", closeSettings: "設定を閉じる", settingsRefreshInterval: "自動更新間隔", settingsRefreshIntervalHint: "アカウント使用量とアカウント状態の自動更新間隔を設定します。", settingsQuotaAlertThresholds: "クォータ通知しきい値", settingsQuotaAlertThresholdsHint: "通知は3段階固定です。値を昇順に設定してください。", settingsQuotaAlertThresholdLow: "第1段階", settingsQuotaAlertThresholdMedium: "第2段階", settingsQuotaAlertThresholdHigh: "第3段階", settingsQuotaAlertThresholdInvalid: "1～100の整数を昇順で入力してください。", settingsCancel: "キャンセル", settingsSave: "保存", settingsSaving: "設定を保存中…", settingsSaved: "設定を保存しました", settingsSaveFailed: "保存できませんでした：{error}" },
  ko: { settingsTitle: "설정", openSettings: "설정 열기", closeSettings: "설정 닫기", settingsRefreshInterval: "자동 새로 고침 간격", settingsRefreshIntervalHint: "계정 사용량과 계정 상태의 자동 새로 고침 간격을 설정합니다.", settingsQuotaAlertThresholds: "할당량 알림 임계값", settingsQuotaAlertThresholdsHint: "알림은 3단계로 고정되며 값은 오름차순이어야 합니다.", settingsQuotaAlertThresholdLow: "1단계", settingsQuotaAlertThresholdMedium: "2단계", settingsQuotaAlertThresholdHigh: "3단계", settingsQuotaAlertThresholdInvalid: "1–100 사이의 정수를 오름차순으로 입력하세요.", settingsCancel: "취소", settingsSave: "저장", settingsSaving: "설정 저장 중…", settingsSaved: "설정이 저장되었습니다", settingsSaveFailed: "저장 실패: {error}" },
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
  "zh-CN": { currentSignInHeading: "当前登录", mainNavigation: "主导航", collapseSidebar: "收起侧栏", expandSidebar: "展开侧栏", sidebarNarrow: "窗口较窄，侧栏已自动收起" },
  "zh-TW": { accountsTitle: "帳戶管理", accountsUnsavedHint: "偵測到未保存的帳戶，請保存目前帳戶", accountsCredentialsChangedHint: "登入憑證已更新，請更新保存的帳戶", currentSignInHeading: "目前登入", mainNavigation: "主導覽", collapseSidebar: "收起側欄", expandSidebar: "展開側欄", sidebarNarrow: "視窗較窄，側欄已自動收起" },
  en: { currentSignInHeading: "Current sign-in", mainNavigation: "Main navigation", collapseSidebar: "Collapse sidebar", expandSidebar: "Expand sidebar", sidebarNarrow: "Sidebar collapsed because the window is narrow" },
  ja: { accountsTitle: "アカウント管理", accountsUnsavedHint: "未保存のアカウントが見つかりました。現在のアカウントを保存してください。", accountsCredentialsChangedHint: "ログイン認証情報が更新されました。保存済みアカウントを更新してください。", currentSignInHeading: "現在のログイン", mainNavigation: "メインナビゲーション", collapseSidebar: "サイドバーを閉じる", expandSidebar: "サイドバーを開く", sidebarNarrow: "ウィンドウが狭いためサイドバーを折りたたみました" },
  ko: { accountsTitle: "계정 관리", accountsUnsavedHint: "저장되지 않은 계정이 있습니다. 현재 계정을 저장하세요.", accountsCredentialsChangedHint: "로그인 인증 정보가 변경되었습니다. 저장된 계정을 업데이트하세요.", currentSignInHeading: "현재 로그인", mainNavigation: "주 탐색", collapseSidebar: "사이드바 접기", expandSidebar: "사이드바 펼치기", sidebarNarrow: "창이 좁아 사이드바가 자동으로 접혔습니다" },
};

const ACCOUNT_SWITCH_TRANSLATIONS = {
  ko: {
    accountsCurrentCaption: "현재 로그인", accountsUnsavedCaption: "현재 로그인 · 저장되지 않음", accountsCredentialsChangedCaption: "현재 로그인 · 업데이트 필요", accountsCurrentUnknown: "저장할 ChatGPT 로그인이 없습니다", accountsSave: "현재 계정 저장", accountsUpdateSave: "저장된 계정 업데이트", accountsLoginTitle: "새 계정 로그인",
    accountsListTitle: "저장된 계정", accountsCount: "계정 {count}개", accountsSelected: "선택된 인증 정보", accountsSwitch: "전환", accountsReconnect: "다시 동기화", accountsRename: "이름 변경", accountsRemove: "계정 삭제", accountsEmailUnknown: "이메일을 확인할 수 없음", accountsLoading: "계정을 불러오는 중…", accountsLoadingHint: "이 기기에 저장된 로그인 정보를 확인합니다.", accountsLocalHint: "로그인 인증 정보는 이 기기에만 저장되며 업로드되지 않습니다. 기기를 안전하게 관리하세요.",
    accountsFlowKicker: "전환 과정", accountsFlowLocal: "로컬 인증 정보를 교체하고 서비스를 재시작합니다. Codex 요청은 중계하지 않습니다", accountsFlowSaved: "저장된 계정", accountsFlowSwitchLocal: "로컬 전환", accountsFlowSceneTarget: "재시작 후 새 인증 정보 사용", accountsFlowStepOne: "1 계정 선택", accountsFlowStepTwo: "2 인증 정보 교체", accountsFlowStepThree: "3 재시작 후 적용", accountsFlowValidate: "대상 계정을 확인하고 전환", accountsFlowAuthLocation: "CODEX_HOME의 현재 인증 정보", accountsFlowApplyHint: "인증 정보를 쓴 후 실행 중인 서비스 재시작", accountsFlowPrivacy: "계정과 auth.json은 이 기기에 보관됩니다. 이 애니메이션은 전환 과정을 보여줍니다.", accountsFlowDetails: "계정 식별 및 저장 방식 보기", accountsFlowRead: "새로 고칠 때 auth.json을 읽어 저장된 계정과 비교합니다", accountsFlowNew: "일치하는 계정 없음", accountsFlowNewHint: "현재 계정을 저장하여 추가", accountsFlowChanged: "동일 계정의 토큰 변경", accountsFlowChangedHint: "중복 없이 저장된 정보를 업데이트", accountsFlowNote: "전환 전에 저장된 정보를 업데이트하고 실행 중인 서비스만 재시작합니다.", accountsFlowSelect: "저장된 계정 선택",
    accountsManage: "계정 전환", accountsIntro: "자주 사용하는 계정을 저장하세요.", accountsEmptyTitle: "자주 사용하는 계정을 저장하세요", accountsEmptyHint: "현재 로그인을 저장하거나 새 계정으로 로그인하세요.", accountsStorageHint: "현재 저장 방식에서는 계정 전환을 지원하지 않습니다. 파일 관리를 활성화하고 로그인하세요.", accountsEnable: "파일 관리 활성화",
    accountsNameLabel: "계정 이름", accountsNamePlaceholder: "예: 개인 계정, 업무 계정", accountsNameInvalid: "계정 이름을 1~48자로 입력하세요.", accountsBack: "계정 목록으로", accountsCancel: "취소", accountsClose: "계정 관리 닫기", accountsSwitchRestart: "전환하고 재시작", accountsRestartLabel: "로컬 Codex 서비스도 재시작", accountsRestartHint: "공유 서비스를 재시작하면 다른 클라이언트의 작업이 중단될 수 있습니다.", accountsWorking: "처리 중…",
    accountsSaved: "계정이 저장되었습니다.", accountsRemoved: "저장된 기록이 삭제되었습니다. 현재 로그인은 유지됩니다.", accountsFileEnabled: "파일 관리가 활성화되었습니다. 로그인 후 계정을 전환하세요.", accountsRestartFailed: "인증 정보는 전환되었지만 서비스 상태 또는 재시작을 확인하지 못했습니다: {error}", accountsSyncFailed: "인증 정보가 전환되었습니다. 잠시 후 새로 고침하세요.", accountsFailed: "작업을 완료하지 못했습니다: {error}",
    accountsSaveTitle: "현재 계정 저장", accountsSaveHint: "알아보기 쉬운 이름을 입력하세요.", accountsRenameTitle: "계정 이름 변경", accountsRenameHint: "이름은 이 기기에만 표시됩니다.", accountsRemoveTitle: "저장된 계정을 삭제하시겠습니까?", accountsRemoveHint: "이 기기의 기록만 삭제되며 현재 로그인은 유지됩니다.", accountsSwitchTitle: "이 계정으로 전환", accountsSwitchHint: "로컬 로그인 정보가 변경됩니다. 실행 중인 클라이언트는 재시작이 필요할 수 있습니다.", accountsEnableTitle: "로컬 파일 관리 활성화", accountsEnableHint: "인증 정보를 파일에 저장합니다. 키체인 인증 정보는 자동으로 이전되지 않습니다.", accountsSaveConfirm: "계정 저장", accountsRenameConfirm: "이름 저장", accountsRemoveConfirm: "계정 삭제", accountsEnableConfirm: "파일 관리 활성화", accountsSwitchConfirm: "계정 전환", accountsSwitched: "로그인 정보가 전환되었습니다. 서비스를 다음에 시작할 때 적용됩니다.", accountsRestarted: "로그인 정보가 전환되고 로컬 서비스가 재시작되었습니다.",
    accountsLoginNameLabel: "계정 이름(선택)", accountsLoginNamePlaceholder: "비워 두면 이메일 앞부분 사용", accountsLoginMethodLabel: "로그인 방식", accountsLoginMethodBrowser: "브라우저 인증", accountsLoginMethodDevice: "기기 코드 로그인", accountsLoginDeviceHint: "기기 코드를 발급받아 브라우저에서 인증을 완료하세요.", accountsLoginDeviceConfirm: "기기 코드 받기", accountsDeviceReady: "기기 코드로 연결", accountsDeviceWaiting: "기기 인증 대기 중", accountsDeviceWaitingHint: "인증 페이지에서 로그인하고 코드를 입력하세요. 15분 내에 완료하지 못하면 다시 발급받으세요.", accountsDeviceCodeLabel: "일회용 기기 코드", accountsDeviceStepCode: "코드 받기", accountsDeviceOpen: "인증 페이지 열기", accountsDeviceCopied: "코드를 복사했습니다.", accountsDeviceCopyLabel: "코드 복사",
    accountsLoginReady: "ChatGPT 계정 연결", accountsLoginPreparing: "인증 준비 중…", accountsLoginSaving: "인증 완료, 저장 중…", accountsLoginWaiting: "브라우저 인증 대기 중", accountsLoginWaitingHint: "브라우저에서 인증을 완료하세요. 15분 후 시간이 만료됩니다.", accountsLoginLocalHint: "인증 정보는 이 기기에만 저장됩니다. 계정을 추가해도 현재 로그인은 전환되지 않습니다.", accountsLoginStepName: "이름(선택)", accountsLoginStepBrowser: "브라우저 인증", accountsLoginStepSave: "계정 저장", accountsLoginReopen: "인증 페이지 다시 열기", accountsLoginCancel: "로그인 취소", accountsLoginOpened: "브라우저에서 인증을 계속하세요.", accountsLoginSaved: "새 로그인이 저장되었습니다.", accountsLoginCleanup: "계정은 저장되었지만 임시 폴더를 정리하지 못했습니다.", accountsLoginStatusFailed: "로그인 상태를 읽지 못해 다시 시도 중입니다.", accountsLoginHint: "브라우저에서 ChatGPT 인증을 완료하세요.", accountsLoginConfirm: "브라우저 인증 시작", accountsCredentialsUpdateHint: "현재 인증 정보가 변경되어 저장된 기록을 업데이트합니다.",
    accountsSwitchGuideKicker: "전환 안내", accountsSwitchGuideTitle: "계정 전환 방법", accountsSwitchGuideHint: "로컬 인증 정보를 변경하고 실행 중인 서비스만 재시작합니다.", accountsSwitchGuideStepOne: "계정 선택", accountsSwitchGuideStepOneHint: "저장된 계정 선택", accountsSwitchGuideStepTwo: "인증 정보 교체", accountsSwitchGuideStepTwoHint: "auth.json 업데이트", accountsSwitchGuideStepThree: "재시작 후 적용", accountsSwitchGuideStepThreeHint: "실행 중인 서비스만 재시작",
  },
  "zh-TW": {
    accountsCurrentCaption: "目前登入", accountsUnsavedCaption: "目前登入 · 尚未儲存", accountsCredentialsChangedCaption: "目前登入 · 憑證待更新", accountsCurrentUnknown: "目前沒有可儲存的 ChatGPT 登入", accountsSave: "儲存目前帳戶", accountsUpdateSave: "更新儲存", accountsLoginTitle: "登入新帳戶",
    accountsListTitle: "已儲存帳戶", accountsCount: "{count} 個帳戶", accountsSelected: "已選憑證", accountsSwitch: "切換", accountsReconnect: "重新同步", accountsRename: "重新命名", accountsRemove: "移除帳戶", accountsEmailUnknown: "無法取得電子郵件", accountsLoading: "正在讀取帳戶…", accountsLoadingHint: "正在檢查本機儲存的登入資訊。", accountsLocalHint: "登入憑證僅儲存在本機，不會上傳；請妥善保管此裝置。",
    accountsFlowKicker: "切換流程", accountsFlowLocal: "替換本機憑證並重新啟動服務，不代理 Codex 請求", accountsFlowSaved: "已儲存帳戶", accountsFlowSwitchLocal: "本機切換", accountsFlowSceneTarget: "重新啟動後使用新憑證", accountsFlowStepOne: "1 選擇帳戶", accountsFlowStepTwo: "2 替換憑證", accountsFlowStepThree: "3 重新啟動後生效", accountsFlowValidate: "驗證目標帳戶並切換", accountsFlowAuthLocation: "CODEX_HOME 中的目前憑證", accountsFlowApplyHint: "寫入憑證後重新啟動執行中的服務", accountsFlowPrivacy: "帳戶庫與 auth.json 始終留在本機；此動畫示範切換過程。", accountsFlowDetails: "查看帳戶識別與儲存邏輯", accountsFlowRead: "重新整理時讀取 auth.json，並依帳戶身分比對已儲存帳戶", accountsFlowNew: "身分未比對", accountsFlowNewHint: "儲存目前帳戶後新增記錄", accountsFlowChanged: "身分相同，權杖已變更", accountsFlowChangedHint: "更新記錄，不會新增重複帳戶", accountsFlowNote: "切換前更新帳戶記錄，僅重新啟動執行中的服務。", accountsFlowSelect: "選擇已儲存帳戶",
    accountsManage: "切換帳戶", accountsIntro: "儲存常用帳戶，輕鬆切換。", accountsEmptyTitle: "在這裡儲存常用帳戶", accountsEmptyHint: "儲存目前登入，或登入新帳戶。", accountsStorageHint: "目前的儲存方式不支援切換帳戶。請啟用檔案管理後登入。", accountsEnable: "啟用檔案管理",
    accountsNameLabel: "帳戶名稱", accountsNamePlaceholder: "例如：個人帳戶、工作帳戶", accountsNameInvalid: "請輸入 1–48 個字元的帳戶名稱。", accountsBack: "返回帳戶列表", accountsCancel: "取消", accountsClose: "關閉帳戶管理", accountsSwitchRestart: "切換並重新啟動", accountsRestartLabel: "同時重新啟動本機 Codex 服務", accountsRestartHint: "重新啟動共用服務可能中斷其他用戶端的工作。", accountsWorking: "處理中…",
    accountsSaved: "帳戶已儲存。", accountsRemoved: "已移除儲存記錄，目前登入保持不變。", accountsFileEnabled: "已啟用檔案管理，請登入並切換帳戶。", accountsRestartFailed: "登入資訊已切換，但無法確認服務狀態或重新啟動：{error}", accountsSyncFailed: "登入資訊已切換，請稍後重新整理帳戶資料。", accountsFailed: "操作未完成：{error}",
    accountsSaveTitle: "儲存目前帳戶", accountsSaveHint: "請輸入容易辨識的名稱。", accountsRenameTitle: "重新命名帳戶", accountsRenameHint: "名稱僅顯示於本機。", accountsRemoveTitle: "移除此已儲存帳戶？", accountsRemoveHint: "僅移除本機記錄，不會登出目前帳戶。", accountsSwitchTitle: "切換至此帳戶", accountsSwitchHint: "將更新本機登入資訊，執行中的用戶端可能需要重新啟動。", accountsEnableTitle: "啟用本機檔案管理", accountsEnableHint: "登入憑證將儲存於檔案，鑰匙圈憑證不會自動遷移。", accountsSaveConfirm: "儲存帳戶", accountsRenameConfirm: "儲存名稱", accountsRemoveConfirm: "移除帳戶", accountsEnableConfirm: "啟用檔案管理", accountsSwitchConfirm: "切換帳戶", accountsSwitched: "登入資訊已切換，將於下次啟動服務時生效。", accountsRestarted: "登入資訊已切換，本機服務已重新啟動。",
    accountsLoginNameLabel: "帳戶名稱（選填）", accountsLoginNamePlaceholder: "留空時使用電子郵件前綴", accountsLoginMethodLabel: "登入方式", accountsLoginMethodBrowser: "瀏覽器授權", accountsLoginMethodDevice: "裝置碼登入", accountsLoginDeviceHint: "取得裝置碼後，在瀏覽器完成授權。", accountsLoginDeviceConfirm: "取得裝置碼", accountsDeviceReady: "使用裝置碼連線", accountsDeviceWaiting: "等待裝置碼授權", accountsDeviceWaitingHint: "在驗證頁面登入並輸入裝置碼，15 分鐘內未完成請重新取得。", accountsDeviceCodeLabel: "一次性裝置碼", accountsDeviceStepCode: "取得裝置碼", accountsDeviceOpen: "開啟驗證頁面", accountsDeviceCopied: "裝置碼已複製。", accountsDeviceCopyLabel: "複製裝置碼",
    accountsLoginReady: "連接 ChatGPT 帳戶", accountsLoginPreparing: "正在準備授權…", accountsLoginSaving: "授權完成，正在儲存…", accountsLoginWaiting: "等待瀏覽器授權", accountsLoginWaitingHint: "請在瀏覽器完成授權，15 分鐘後逾時。", accountsLoginLocalHint: "憑證僅儲存在本機；新增帳戶不會切換目前登入。", accountsLoginStepName: "命名（選填）", accountsLoginStepBrowser: "瀏覽器授權", accountsLoginStepSave: "儲存帳戶", accountsLoginReopen: "重新開啟授權頁面", accountsLoginCancel: "取消登入", accountsLoginOpened: "請在瀏覽器繼續授權。", accountsLoginSaved: "新登入已儲存。", accountsLoginCleanup: "帳戶已儲存，但無法清理暫存目錄。", accountsLoginStatusFailed: "暫時無法讀取登入進度，正在重試。", accountsLoginHint: "請在瀏覽器完成 ChatGPT 授權。", accountsLoginConfirm: "開始瀏覽器授權", accountsCredentialsUpdateHint: "目前憑證已變更，將更新原有記錄。",
    accountsSwitchGuideKicker: "切換說明", accountsSwitchGuideTitle: "如何切換帳戶", accountsSwitchGuideHint: "更新本機憑證，僅重新啟動執行中的服務。", accountsSwitchGuideStepOne: "選擇帳戶", accountsSwitchGuideStepOneHint: "選擇已儲存帳戶", accountsSwitchGuideStepTwo: "替換憑證", accountsSwitchGuideStepTwoHint: "更新 auth.json", accountsSwitchGuideStepThree: "重新啟動後生效", accountsSwitchGuideStepThreeHint: "僅重新啟動執行中的服務",
  },
  ja: {
    accountsCurrentCaption: "現在のログイン", accountsUnsavedCaption: "現在のログイン · 未保存", accountsCredentialsChangedCaption: "現在のログイン · 更新が必要", accountsCurrentUnknown: "保存できる ChatGPT ログインがありません", accountsSave: "現在のアカウントを保存", accountsUpdateSave: "保存内容を更新", accountsLoginTitle: "新しいアカウントでログイン",
    accountsListTitle: "保存済みアカウント", accountsCount: "{count} 件", accountsSelected: "選択中の認証情報", accountsSwitch: "切り替え", accountsReconnect: "再同期", accountsRename: "名前を変更", accountsRemove: "削除", accountsEmailUnknown: "メールアドレス不明", accountsLoading: "読み込み中…", accountsLoadingHint: "保存済みのログイン情報を確認しています。", accountsLocalHint: "認証情報はこの端末にのみ保存され、アップロードされません。端末を安全に管理してください。",
    accountsFlowKicker: "切り替えの流れ", accountsFlowLocal: "ローカルの認証情報を置き換えてサービスを再起動します。Codex の通信は中継しません", accountsFlowSaved: "保存済みアカウント", accountsFlowSwitchLocal: "ローカルで切り替え", accountsFlowSceneTarget: "再起動後に新しい認証情報を使用", accountsFlowStepOne: "1 アカウントを選択", accountsFlowStepTwo: "2 認証情報を置き換え", accountsFlowStepThree: "3 再起動して適用", accountsFlowValidate: "対象アカウントを確認して切り替え", accountsFlowAuthLocation: "CODEX_HOME 内の現在の認証情報", accountsFlowApplyHint: "書き込み後、実行中のサービスを再起動", accountsFlowPrivacy: "アカウントと auth.json は端末内に保存されます。このアニメーションは切り替えの説明です。", accountsFlowDetails: "アカウントの識別と保存の仕組み", accountsFlowRead: "更新時に auth.json を読み込み、保存済みアカウントと照合します", accountsFlowNew: "一致するアカウントなし", accountsFlowNewHint: "現在のアカウントを保存して追加", accountsFlowChanged: "同じアカウントでトークンが変更", accountsFlowChangedHint: "重複を作らず保存内容を更新", accountsFlowNote: "切り替え前に保存内容を更新し、実行中のサービスのみ再起動します。", accountsFlowSelect: "保存済みアカウントを選択",
    accountsManage: "アカウントを切り替え", accountsIntro: "よく使うアカウントを保存します。", accountsEmptyTitle: "アカウントを保存しましょう", accountsEmptyHint: "現在のログインを保存するか、新しいアカウントでログインしてください。", accountsStorageHint: "現在の保存方式では切り替えできません。ファイル管理を有効にしてログインしてください。", accountsEnable: "ファイル管理を有効化",
    accountsNameLabel: "アカウント名", accountsNamePlaceholder: "例：個人用、仕事用", accountsNameInvalid: "アカウント名を1〜48文字で入力してください。", accountsBack: "一覧に戻る", accountsCancel: "キャンセル", accountsClose: "アカウント管理を閉じる", accountsSwitchRestart: "切り替えて再起動", accountsRestartLabel: "ローカルの Codex サービスも再起動", accountsRestartHint: "共有サービスの再起動により、他のクライアントの作業が中断される場合があります。", accountsWorking: "処理中…",
    accountsSaved: "保存しました。", accountsRemoved: "保存済みの記録を削除しました。現在のログインは変わりません。", accountsFileEnabled: "ファイル管理を有効にしました。ログインしてアカウントを切り替えてください。", accountsRestartFailed: "認証情報は切り替わりましたが、サービスの状態または再起動を確認できません：{error}", accountsSyncFailed: "認証情報は切り替わりました。後ほど再読み込みしてください。", accountsFailed: "操作を完了できませんでした：{error}",
    accountsSaveTitle: "現在のアカウントを保存", accountsSaveHint: "識別しやすい名前を付けてください。", accountsRenameTitle: "アカウント名を変更", accountsRenameHint: "名前はこの端末にのみ表示されます。", accountsRemoveTitle: "保存済みアカウントを削除しますか？", accountsRemoveHint: "端末の保存記録のみ削除します。現在のログインは維持されます。", accountsSwitchTitle: "このアカウントに切り替え", accountsSwitchHint: "ローカルのログイン情報を更新します。実行中のクライアントは再起動が必要な場合があります。", accountsEnableTitle: "ローカルファイル管理を有効化", accountsEnableHint: "認証情報をファイルに保存します。キーチェーンの認証情報は自動移行されません。", accountsSaveConfirm: "保存", accountsRenameConfirm: "名前を保存", accountsRemoveConfirm: "削除", accountsEnableConfirm: "有効化", accountsSwitchConfirm: "切り替え", accountsSwitched: "ログイン情報を切り替えました。次回サービス起動時に適用されます。", accountsRestarted: "ログイン情報を切り替え、サービスを再起動しました。",
    accountsLoginNameLabel: "アカウント名（任意）", accountsLoginNamePlaceholder: "空欄の場合はメールアドレスの先頭部分を使用", accountsLoginMethodLabel: "ログイン方法", accountsLoginMethodBrowser: "ブラウザー認証", accountsLoginMethodDevice: "デバイスコード", accountsLoginDeviceHint: "デバイスコードを取得し、ブラウザーで認証を完了してください。", accountsLoginDeviceConfirm: "デバイスコードを取得", accountsDeviceReady: "デバイスコードで接続", accountsDeviceWaiting: "デバイス認証を待機中", accountsDeviceWaitingHint: "認証ページでログインし、コードを入力してください。15分以内に完了しない場合は再取得してください。", accountsDeviceCodeLabel: "ワンタイムデバイスコード", accountsDeviceStepCode: "コードを取得", accountsDeviceOpen: "認証ページを開く", accountsDeviceCopied: "コードをコピーしました。", accountsDeviceCopyLabel: "コードをコピー",
    accountsLoginReady: "ChatGPT アカウントに接続", accountsLoginPreparing: "認証を準備中…", accountsLoginSaving: "認証が完了しました。保存中…", accountsLoginWaiting: "ブラウザーでの認証待ち", accountsLoginWaitingHint: "ブラウザーで認証を完了してください。15分でタイムアウトします。", accountsLoginLocalHint: "認証情報は端末内にのみ保存されます。アカウントの追加では現在のログインは切り替わりません。", accountsLoginStepName: "名前（任意）", accountsLoginStepBrowser: "ブラウザー認証", accountsLoginStepSave: "アカウントを保存", accountsLoginReopen: "認証ページを再度開く", accountsLoginCancel: "ログインをキャンセル", accountsLoginOpened: "ブラウザーで認証を続けてください。", accountsLoginSaved: "新しいログインを保存しました。", accountsLoginCleanup: "保存しましたが、一時ディレクトリを削除できませんでした。", accountsLoginStatusFailed: "ログイン状況を取得できません。再試行中です。", accountsLoginHint: "ブラウザーで ChatGPT の認証を完了してください。", accountsLoginConfirm: "ブラウザー認証を開始", accountsCredentialsUpdateHint: "現在の認証情報が変わったため、保存済みの記録を更新します。",
    accountsSwitchGuideKicker: "切り替えガイド", accountsSwitchGuideTitle: "アカウントの切り替え", accountsSwitchGuideHint: "認証情報を更新し、実行中のサービスのみ再起動します。", accountsSwitchGuideStepOne: "アカウントを選択", accountsSwitchGuideStepOneHint: "保存済みアカウントから選択", accountsSwitchGuideStepTwo: "認証情報を置き換え", accountsSwitchGuideStepTwoHint: "auth.json を更新", accountsSwitchGuideStepThree: "再起動して適用", accountsSwitchGuideStepThreeHint: "実行中の場合のみ再起動",
  },
  "zh-CN": {
    accountsLoginTitle: "登录新账户",
    accountsLoginNameLabel: "账户名称（可选）", accountsLoginNamePlaceholder: "留空时使用登录邮箱前缀",
    accountsLoginMethodLabel: "登录方式", accountsLoginMethodBrowser: "浏览器授权", accountsLoginMethodDevice: "设备码登录",
    accountsLoginDeviceHint: "获取设备码后，在浏览器输入并完成 ChatGPT 授权。默认使用登录邮箱前缀命名。",
    accountsLoginDeviceConfirm: "获取设备码", accountsDeviceReady: "使用设备码连接账户", accountsDeviceWaiting: "等待设备码授权",
    accountsDeviceWaitingHint: "在验证页面登录要添加的 ChatGPT 账户，输入下方设备码并确认授权。完成后自动保存，15 分钟内未完成请重新获取。",
    accountsDeviceCodeLabel: "一次性设备码", accountsDeviceStepCode: "获取设备码", accountsDeviceOpen: "打开设备验证页面", accountsDeviceCopied: "设备码已复制，请在验证页面粘贴。",
    accountsDeviceCopyLabel: "复制设备码",
     accountsLoginReady: "连接你的 ChatGPT 账户", accountsLoginPreparing: "正在准备授权…",
    accountsLoginSaving: "授权已完成，正在保存…",
    accountsLoginWaiting: "等待浏览器授权", accountsLoginWaitingHint: "请在浏览器确认要添加的 ChatGPT 账户并完成授权。此窗口会自动更新，15 分钟后超时。",
    accountsLoginLocalHint: "直接连接授权服务，凭据仅保存在本机。添加账户不会切换当前登录。",
    accountsLoginStepName: "命名（可选）", accountsLoginStepBrowser: "浏览器授权", accountsLoginStepSave: "保存到账户库",
    accountsLoginReopen: "重新打开授权页面", accountsLoginCancel: "取消登录", accountsLoginOpened: "已打开授权页面，请在浏览器继续。",
    accountsLoginSaved: "新登录已保存，可在列表中选择切换。", accountsLoginCleanup: "账户已保存，但临时目录未能清理，请检查系统文件权限。",
    accountsLoginStatusFailed: "暂时无法读取登录进度，正在重试。你也可以取消后重新登录。",
    accountsManage: "切换账户", accountsTitle: "账户管理", accountsIntro: "保存常用账户，让工作与个人登录轻松切换。", accountsFlowKicker: "切换链路", accountsFlowLocal: "替换本机凭据并重启服务，不代理 Codex 请求", accountsFlowSaved: "已保存账户", accountsFlowSwitchLocal: "本地切换", accountsFlowSceneTarget: "重启后使用新凭据", accountsFlowStepOne: "1 选择账户", accountsFlowStepTwo: "2 替换凭据", accountsFlowStepThree: "3 重启后生效", accountsFlowValidate: "校验目标账户并执行切换", accountsFlowAuthLocation: "CODEX_HOME 中的当前凭据", accountsFlowApplyHint: "写入凭据后重启已运行的服务", accountsFlowPrivacy: "账户库与 auth.json 始终留在本机；此动画演示切换过程。", accountsFlowDetails: "查看账户识别与保存逻辑", accountsFlowRead: "自动刷新或手动刷新会读取 auth.json，并按账户身份匹配已保存账户", accountsFlowNew: "身份未匹配", accountsFlowNewHint: "保存当前账户后新增记录", accountsFlowChanged: "身份相同，Token 有变化", accountsFlowChangedHint: "更新保存记录，不会新增重复账户", accountsFlowNote: "切换前会更新账户记录，仅重启已运行的服务；未运行时下次启动生效。", accountsFlowSelect: "选择已保存账户", accountsSwitchGuideKicker: "切换说明", accountsSwitchGuideTitle: "账户如何切换", accountsSwitchGuideHint: "切换会更新本机登录凭据，仅重启已运行的服务，不会上传账户信息。", accountsSwitchGuideStepOne: "选择账户", accountsSwitchGuideStepOneHint: "从已保存账户中选择目标", accountsSwitchGuideStepTwo: "替换本机凭据", accountsSwitchGuideStepTwoHint: "安全更新当前 auth.json", accountsSwitchGuideStepThree: "重启后生效", accountsSwitchGuideStepThreeHint: "仅重启已运行的服务，未运行时下次启动生效",
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
    accountsStorageHint: "当前存储方式不支持账户切换。启用文件管理后，请在账户管理中登录并切换账户。", accountsEnable: "启用文件管理",

    accountsNameLabel: "账户名称", accountsNamePlaceholder: "例如：个人账户、工作账户", accountsNameInvalid: "请输入 1–48 个字符的账户名称。",
    accountsBack: "返回账户列表", accountsCancel: "取消", accountsClose: "关闭账户管理",
     accountsSwitchRestart: "切换并重启服务", accountsRestartLabel: "同时重启本机 Codex 服务",
    accountsRestartHint: "共享服务的重启可能中断其他客户端任务。取消勾选则仅更新登录信息，稍后手动重启。", accountsWorking: "正在处理…",
    accountsSaved: "账户已保存。", accountsRemoved: "已移除保存记录，当前登录保持不变。", accountsFileEnabled: "已启用文件管理，请在账户管理中登录并切换账户。",

    accountsRestartFailed: "登录信息已切换，但服务状态未能确认或重启未完成：{error}。请手动检查服务。",
    accountsSyncFailed: "登录信息已切换，账户数据尚未同步，请稍后刷新。", accountsFailed: "操作未完成：{error}",
  accountsLoginHint: "在浏览器完成 ChatGPT 授权，默认以登录邮箱前缀命名。保存后可从列表选择切换。", accountsLoginConfirm: "开始浏览器授权", accountsSaveTitle: "保存当前账户", accountsSaveHint: "取一个容易辨认的名称，下次切换时就能快速找到。", accountsRenameTitle: "给账户换个名称", accountsRenameHint: "名称只在本机显示，不会修改你的 ChatGPT 账户信息。", accountsRemoveTitle: "移除这个已保存账户？", accountsRemoveHint: "只移除本机保存的记录，不会注销正在使用的账户。之后可以重新保存。", accountsSwitchTitle: "切换到这个账户", accountsSwitchHint: "将更新本机登录信息。正在运行的 Codex 客户端可能需要重启，请先保存任务。", accountsEnableTitle: "启用本机文件管理", accountsEnableHint: "将 Codex 登录凭据存储方式改为文件。系统钥匙串中的登录不会自动迁移，请在账户管理中登录并切换账户。", accountsSaveConfirm: "保存账户", accountsRenameConfirm: "保存名称", accountsRemoveConfirm: "移除账户", accountsEnableConfirm: "启用文件管理", accountsSwitchConfirm: "切换账户", accountsSwitched: "登录信息已切换，将在下次启动服务时生效。", accountsRestarted: "登录信息已切换，本机服务已重启。请核对当前账户，其他 Codex 客户端可能仍需重启。"},
  en: {
    accountsLoginTitle: "Sign in to a new account", accountsLoginNameLabel: "Account name (optional)", accountsLoginNamePlaceholder: "Defaults to the email prefix", accountsLoginMethodLabel: "Sign-in method", accountsLoginMethodBrowser: "Browser authorization", accountsLoginMethodDevice: "Device code", accountsLoginDeviceHint: "Get a device code and complete authorization in your browser.", accountsLoginDeviceConfirm: "Get device code", accountsDeviceReady: "Connect with a device code", accountsDeviceWaiting: "Waiting for device authorization", accountsDeviceWaitingHint: "Sign in on the verification page and enter the code. Request a new code if 15 minutes pass.", accountsDeviceCodeLabel: "One-time device code", accountsDeviceStepCode: "Get code", accountsDeviceOpen: "Open verification page", accountsDeviceCopied: "Device code copied.", accountsDeviceCopyLabel: "Copy device code",
    accountsLoginReady: "Connect your ChatGPT account", accountsLoginPreparing: "Preparing authorization…", accountsLoginSaving: "Authorization complete. Saving…", accountsLoginWaiting: "Waiting for browser authorization", accountsLoginWaitingHint: "Complete authorization in your browser. This request expires after 15 minutes.", accountsLoginLocalHint: "Credentials stay on this device. Adding an account does not switch your current sign-in.", accountsLoginStepName: "Name (optional)", accountsLoginStepBrowser: "Browser authorization", accountsLoginStepSave: "Save account", accountsLoginReopen: "Reopen authorization page", accountsLoginCancel: "Cancel sign-in", accountsLoginOpened: "Continue authorization in your browser.", accountsLoginSaved: "New sign-in saved.", accountsLoginCleanup: "Account saved, but the temporary directory could not be removed.", accountsLoginStatusFailed: "Could not read sign-in status. Retrying…", accountsLoginHint: "Complete ChatGPT authorization in your browser.", accountsLoginConfirm: "Start browser authorization",
    accountsManage: "Switch account", accountsTitle: "Your accounts", accountsIntro: "Keep your everyday accounts ready for work and personal use.", accountsFlowKicker: "SWITCHING FLOW", accountsFlowLocal: "Local credentials and service restart; no Codex request proxy", accountsFlowSaved: "Saved accounts", accountsFlowSwitchLocal: "Local switch", accountsFlowSceneTarget: "New credentials after restart", accountsFlowStepOne: "1 Select account", accountsFlowStepTwo: "2 Replace credentials", accountsFlowStepThree: "3 Restart to apply", accountsFlowValidate: "Validate the target and switch", accountsFlowAuthLocation: "Current credentials in CODEX_HOME", accountsFlowApplyHint: "Restart a running service after writing credentials", accountsFlowPrivacy: "Saved accounts and auth.json stay on this device. This animation illustrates the switch.", accountsFlowDetails: "How accounts are detected and saved", accountsFlowRead: "Automatic or manual refresh reads auth.json and matches saved account identity", accountsFlowNew: "No matching identity", accountsFlowNewHint: "Save the current account to add a record", accountsFlowChanged: "Same identity, changed tokens", accountsFlowChangedHint: "Update the saved record without adding a duplicate", accountsFlowNote: "Update saved credentials and restart a running service. A stopped service applies them on its next start.", accountsFlowSelect: "Choose a saved account", accountsSwitchGuideKicker: "SWITCH GUIDE", accountsSwitchGuideTitle: "How account switching works", accountsSwitchGuideHint: "Switching updates local credentials and only restarts a running service. Account data is never uploaded.", accountsSwitchGuideStepOne: "Choose an account", accountsSwitchGuideStepOneHint: "Pick a saved target account", accountsSwitchGuideStepTwo: "Replace local credentials", accountsSwitchGuideStepTwoHint: "Update the current auth.json safely", accountsSwitchGuideStepThree: "Restart to apply", accountsSwitchGuideStepThreeHint: "Restart only if running; otherwise apply on next start",
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

    accountsRestartFailed: "Credentials switched, but the service state or restart could not be confirmed: {error}. Check the service manually.",
    accountsSyncFailed: "Credentials switched. Account data is not synced yet; refresh in a moment.", accountsFailed: "Could not complete this action: {error}",
  accountsSaveTitle: "Save current account", accountsSaveHint: "Choose a name that makes this account easy to recognize.", accountsRenameTitle: "Rename this account", accountsRenameHint: "This name stays on this device. Your ChatGPT profile will not change.", accountsRemoveTitle: "Remove this saved account?", accountsRemoveHint: "Only the saved record is removed. Your current sign-in stays active, and you can save it again later.", accountsSwitchTitle: "Switch to this account", accountsSwitchHint: "This updates local credentials. Running Codex clients may need a restart. Save your work first.", accountsEnableTitle: "Enable local file storage", accountsEnableHint: "Codex will store credentials in a local file. Keyring credentials are not migrated automatically. Sign in again before saving.", accountsSaveConfirm: "Save account", accountsRenameConfirm: "Save name", accountsRemoveConfirm: "Remove account", accountsEnableConfirm: "Enable file storage", accountsSwitchConfirm: "Switch account", accountsSwitched: "Credentials switched. They will apply the next time the service starts.", accountsRestarted: "Credentials switched and the local service restarted. Check the current account; other Codex clients may still need a restart."},
};

const ACCOUNT_QUOTA_TRANSLATIONS = {
  "zh-CN": {
    accountQuotaListTitle: "账户列表", accountQuotaFilterAll: "全部", accountQuotaFilterLabel: "按套餐筛选账户", accountQuotaResetCardsTitle: "重置卡",
    accountQuotaResetCardLabel: "重置卡{index}：",
    accountQuotaResetCardsExpand: "展开其余 {count} 张", accountQuotaResetCardsCollapse: "收起",
    accountQuotaResetCreditsUnavailable: "重置卡暂不可用",
    accountQuotaMonitorHint: "同时查看已保存账户的额度余量与重置时间，查询不会切换当前登录。", accountQuotaRefreshing: "正在查询账户额度…",  accountQuotaHealthy: "状态正常", accountQuotaAttention: "需要注意", accountQuotaRemaining: "剩余", accountQuotaCurrent: "当前账户", accountQuotaCreditsCount: "充值卡 {count} 次", accountQuotaCreditsExpiry: "最近到期：{value}", accountQuotaCreditsExpiryItem: "第 {index} 张：{value}", accountQuotaCreditsExpiryUnknown: "暂无到期时间", accountQuotaUnavailable: "额度暂不可用", accountQuotaNoAccounts: "还没有可监控的账户", accountQuotaNoAccountsHint: "先在账户管理中保存一个 ChatGPT 账户，再回来刷新额度。", accountQuotaQueryFailed: "额度查询失败：{error}",
  },
  "zh-TW": {
    accountQuotaListTitle: "帳戶列表", accountQuotaFilterAll: "全部", accountQuotaFilterLabel: "按方案篩選帳戶", accountQuotaResetCardsTitle: "重設卡",
    accountQuotaResetCardLabel: "重設卡{index}：",
    accountQuotaResetCardsExpand: "展開其餘 {count} 張", accountQuotaResetCardsCollapse: "收合",
    accountQuotaResetCreditsUnavailable: "重置卡暫無法使用",
    accountQuotaMonitorHint: "同時查看已保存帳戶的額度餘量與重設時間，查詢不會切換目前登入。", accountQuotaRefreshing: "正在查詢帳戶額度…",  accountQuotaHealthy: "狀態正常", accountQuotaAttention: "需要注意", accountQuotaRemaining: "剩餘", accountQuotaCurrent: "目前帳戶", accountQuotaCreditsCount: "充值卡 {count} 次", accountQuotaCreditsExpiry: "最近到期：{value}", accountQuotaCreditsExpiryUnknown: "暫無到期時間", accountQuotaUnavailable: "額度暫不可用", accountQuotaNoAccounts: "還沒有可監控的帳戶", accountQuotaNoAccountsHint: "先在帳戶管理中保存一個 ChatGPT 帳戶，再回來重新整理額度。", accountQuotaQueryFailed: "額度查詢失敗：{error}",
  },
  en: {
    accountQuotaListTitle: "Accounts", accountQuotaFilterAll: "All", accountQuotaFilterLabel: "Filter accounts by plan", accountQuotaResetCardsTitle: "Reset cards",
    accountQuotaResetCardLabel: "Reset card {index}:",
    accountQuotaResetCardsExpand: "Show {count} more", accountQuotaResetCardsCollapse: "Show less",
    accountQuotaResetCreditsUnavailable: "Reset credits unavailable",
    accountQuotaMonitorHint: "See saved account headroom and reset times together. Queries never switch the active sign-in.", accountQuotaRefreshing: "Querying account quotas…",  accountQuotaHealthy: "Healthy", accountQuotaAttention: "Needs attention", accountQuotaRemaining: "Remaining", accountQuotaCurrent: "Current", accountQuotaCreditsCount: "Recharge cards: {count}", accountQuotaCreditsExpiry: "Earliest expiry: {value}", accountQuotaCreditsExpiryItem: "Card {index}: {value}", accountQuotaCreditsExpiryUnknown: "Expiry unavailable", accountQuotaUnavailable: "Unavailable", accountQuotaNoAccounts: "No accounts to monitor", accountQuotaNoAccountsHint: "Save a ChatGPT account in account management, then refresh this view.", accountQuotaQueryFailed: "Quota query failed: {error}",
  },
  ja: {
    accountQuotaListTitle: "アカウント一覧", accountQuotaFilterAll: "すべて", accountQuotaFilterLabel: "プランで絞り込む", accountQuotaResetCardsTitle: "リセットカード",
    accountQuotaResetCardLabel: "リセットカード{index}：",
    accountQuotaResetCardsExpand: "残り{count}枚を表示", accountQuotaResetCardsCollapse: "折りたたむ",
    accountQuotaResetCreditsUnavailable: "リセットカードを取得できません",
    accountQuotaMonitorHint: "保存済みアカウントの残量とリセット時刻をまとめて確認できます。現在のログインは切り替わりません。", accountQuotaRefreshing: "アカウントのクォータを確認中…",  accountQuotaHealthy: "正常", accountQuotaAttention: "要確認", accountQuotaRemaining: "残り", accountQuotaCurrent: "現在", accountQuotaUnavailable: "利用不可", accountQuotaNoAccounts: "監視するアカウントがありません", accountQuotaNoAccountsHint: "アカウント管理で ChatGPT アカウントを保存してから更新してください。", accountQuotaQueryFailed: "クォータの確認に失敗：{error}",
  },
  ko: {
    accountQuotaListTitle: "계정 목록", accountQuotaFilterAll: "전체", accountQuotaFilterLabel: "요금제로 계정 필터링", accountQuotaResetCardsTitle: "재설정 카드",
    accountQuotaResetCardLabel: "재설정 카드 {index}:",
    accountQuotaResetCardsExpand: "나머지 {count}장 펼치기", accountQuotaResetCardsCollapse: "접기",
    accountQuotaResetCreditsUnavailable: "재설정 카드를 사용할 수 없음",
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

const ORB_RESET_TRANSLATIONS = {
  "zh-CN": { orbResetIn: "{value}后重置", orbResetSoon: "即将重置", orbResetNow: "正在重置", orbResetUnknown: "重置时间未知" },
  "zh-TW": { orbResetIn: "{value}後重設", orbResetSoon: "即將重設", orbResetNow: "正在重設", orbResetUnknown: "重設時間未知" },
  en: { orbResetIn: "Resets in {value}", orbResetSoon: "Resetting soon", orbResetNow: "Resetting", orbResetUnknown: "Reset time unknown" },
  ja: { orbResetIn: "{value}後にリセット", orbResetSoon: "まもなくリセット", orbResetNow: "リセット中", orbResetUnknown: "リセット時刻不明" },
  ko: { orbResetIn: "{value} 후 초기화", orbResetSoon: "곧 초기화", orbResetNow: "초기화 중", orbResetUnknown: "초기화 시간 미상" },
};

const NAV_MENU_TRANSLATIONS = {
  "zh-CN": { navQuota: "额度", navAccounts: "账号" },
  "zh-TW": { navQuota: "額度", navAccounts: "帳號" },
  en: { navQuota: "Quota", navAccounts: "Accounts" },
  ja: { navQuota: "利用枠", navAccounts: "アカウント" },
  ko: { navQuota: "할당량", navAccounts: "계정" },
};
// 低优先级文案先合并，后面的业务分组覆盖同名键，保持原有查询优先级。
const TRANSLATION_SOURCES = [
  NAV_MENU_TRANSLATIONS,
  ORB_RESET_TRANSLATIONS,
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
