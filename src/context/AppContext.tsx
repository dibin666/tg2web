import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { apiClient, authApiClient, clearAuthToken, getAuthToken, setAuthToken } from "../api/client";
import { AppEvent, AuthRole, BotSummary, ChatMessage, DownloadItem, PendingDraft, Settings, WorkspaceFile } from "../api/types";

const translations = {
  zh: {
    // LoginPage
    loginTitle: "TG 转发操作门户",
    loginSub: "仅限授权员工访问",
    securityWarning: "IP 监控已启用：未注册的连接尝试将被记录用于审计。请勿在会话建立期间关闭此终端。",
    userAccessTab: "用户访问端口",
    adminTerminalTab: "管理员终端",
    enterUserPortal: "进入用户端",
    loginAsAdmin: "登录管理员端",
    passwordLabel: "管理员密码",
    passwordPlaceholder: "输入管理员密码...",
    authorizing: "正在授权访问...",
    accessTerminal: "进入终端仪表盘",
    pleaseInputPass: "请输入密码",
    
    // Sidebar
    internalOps: "内部操作门户",
    chatsTooltip: "活动对话",
    fileHistoryTooltip: "文件历史",
    settingsTooltip: "系统设置",
    logoutTooltip: "登出系统",
    
    // ChatPage & Composer
    restrictedChat: "会话受限: 共享 Telegram 服务账号被禁止向该 Bot 发送消息。",
    typePrompt: "输入消息内容 (使用 / 呼出快捷命令)...",
    availableCommands: "可用快捷命令",
    commandsLoading: "正在读取机器人指令...",
    commandsEmpty: "该机器人没有公开指令",
    helpDesc: "获取机器人使用帮助",
    statusDesc: "显示连接和 TDLib 状态",
    scheduleDesc: "访问共享日历日程",
    downloadDesc: "获取完整报告文件",
    resetDesc: "清除中间提示词上下文",
    attachmentUnavailable: "附件上传暂未启用",
    attachTooltip: "添加附件占位符",
    send: "发送",
    
    // WorkspacePage (File History)
    fileHistoryTitle: "文件历史",
    fileHistoryDesc: "机器人接收到的所有文件的简档归档。",
    searchPlaceholder: "搜索文件名、发送者或标签...",
    botFilterLabel: "机器人:",
    allBots: "全部机器人",
    noFilesFound: "未找到文件",
    noFilesDesc: "没有符合过滤条件的文件。",
    colFileName: "文件名",
    colBot: "机器人",
    colSender: "发送者",
    colTag: "标签/分类",
    colDate: "接收日期",
    colDownloadStatus: "下载状态",
    addTag: "+ 添加标签",
    saveBtn: "保存",
    
    // SettingsPage
    settingsTitle: "系统设置",
    settingsDesc: "配置 Telegram API 接入秘钥、代理服务器及本地环境参数。",
    apiSettings: "API 密钥 & 凭证",
    botTokenLabel: "Bot 访问令牌 (Token)",
    apiHashLabel: "Telegram API Hash",
    apiIdLabel: "Telegram API ID",
    proxySettings: "网络代理设置",
    proxyUrlLabel: "MTProto / SOCKS5 代理 URL",
    systemPasscode: "系统管理访问密码",
    adminPasscodeLabel: "管理员修改密码",
    saveSettings: "保存系统配置",
    settingsSaved: "设置保存成功！",
    
    // DownloadProgress
    statusPreparing: "正在准备下载...",
    statusDownloading: "下载中...",
    statusSaved: "✓ 已保存到本地",
    statusFailed: "下载失败",
    statusPaused: "已暂停",
    statusStopped: "已停止",
    downloadBtn: "下载",
    pauseBtn: "暂停",
    resumeBtn: "继续",
    stopBtn: "停止",
    retryBtn: "重试",
    refetchBtn: "重新获取",
    expiredStatus: "已过期",
    downloadAgainTooltip: "重新下载",
    savedStatusShort: "已保存",

    // SettingsPage
    settingsTabTelegram: "Telegram 连接",
    settingsTabBots: "机器人与群组",
    settingsTabSecurity: "安全与密钥",
    settingsTabSystem: "系统与清理",
    tdlibStatus: "TDLib 控制器状态",
    processStatus: "TDLib 进程",
    websocketGateway: "前端连接",
    telegramCredentialsStatus: "API 凭证",
    telegramAuthorizationStatus: "登录状态",
    telegramAccount: "登录账号",
    telegramAccountSyncing: "已登录，正在同步账号信息",
    telegramAccountMissing: "未登录",
    telegramNextStep: "下一步",
    telegramLastSync: "最近同步",
    telegramLastError: "最近错误",
    reconnectTelegramBtn: "重新连接",
    logoutTelegramBtn: "退出 Telegram",
    sharedPhone: "账号手机号",
    tgApiCredentials: "TELEGRAM API 凭证",
    apiIdDesc: "API ID (Telegram 开发者控制台)",
    apiHashDesc: "API Hash (受保护密钥)",
    secretsNotice: "* 密钥由后端环境变量配置，编辑已被锁定。",
    auditPolicyAlert: "审计策略警报",
    auditPolicyDesc: "本门户提供共享团队访问权限。所有发送的指令都附带用户标识进行审计，请勿将登录凭据向授权运维团队之外的人分享。",
    dataRetentionPolicies: "数据保留策略",
    dbRetentionPeriod: "数据库消息保留期",
    retention7Days: "7 天 (严格合规)",
    retention30Days: "30 天 (标准默认)",
    retention90Days: "90 天 (延长缓存)",
    retentionPermanent: "永久 (保留历史)",
    localFileCaching: "本地文件缓存",
    storeDownloadsLocally: "在服务器磁盘本地存储下载的文件",
    clearDownloadCacheTitle: "本地下载缓存",
    clearDownloadCacheDesc: "删除服务器代理缓存中的已下载文件。消息记录会保留，文件可重新下载。",
    clearDownloadCacheBtn: "删除所有本地下载缓存",
    clearDownloadCacheDone: "已删除 {files} 个缓存文件，释放 {bytes}，并删除 {downloads} 条下载记录。",
    developerOptions: "开发者选项",
    devDebugMode: "开发者调试模式",
    exposesDecksLogs: "显示后端事件日志和调试状态",
    
    // User Access Keys
    accessKeyLabel: "访问密钥 (Access Key)",
    accessKeyPlaceholder: "输入访问密钥登录...",
    invalidKeyError: "访问密钥无效",
    incorrectAdminPass: "密码错误",
    keyMgmtTitle: "用户访问密钥管理",
    generateKeyBtn: "生成密钥",
    copyKeyBtn: "复制密钥",
    copyKeyUnavailable: "完整密钥仅在生成后当前页面会话内可复制",
    keyNamePlaceholder: "输入密钥名称 (如: 前台-01)...",
    colKeyName: "密钥名称",
    colKeySecret: "密钥内容",
    colLastLogin: "上次登录时间",
    neverLogin: "从未登录",
    revokeBtn: "撤销",
    sentViaKey: "发送者密钥:",
  },
  en: {
    // LoginPage
    loginTitle: "TG Relay Operations Portal",
    loginSub: "Authorized Staff Access Only",
    securityWarning: "IP MONITORING IN EFFECT: Unregistered connection attempts are recorded for auditing. Do not close this terminal during session handshakes.",
    userAccessTab: "User Access",
    adminTerminalTab: "Admin Terminal",
    enterUserPortal: "Enter User Portal",
    loginAsAdmin: "Login as Admin",
    passwordLabel: "Admin Password",
    passwordPlaceholder: "Enter admin password...",
    authorizing: "Authorizing Portal Access...",
    accessTerminal: "Access Terminal Dashboard",
    pleaseInputPass: "Please input credentials",
    
    // Sidebar
    internalOps: "Internal Ops Portal",
    chatsTooltip: "Active Chats",
    fileHistoryTooltip: "File History",
    settingsTooltip: "Settings",
    logoutTooltip: "Logout",
    
    // ChatPage & Composer
    restrictedChat: "Conversation Restricted: The shared Telegram service account is barred from sending messages to this bot.",
    typePrompt: "Type a prompt for the bot (use / for shortcuts)...",
    availableCommands: "AVAILABLE COMMAND SHUTTLES",
    commandsLoading: "Loading bot commands...",
    commandsEmpty: "This bot exposes no commands",
    helpDesc: "Get bot help instructions",
    statusDesc: "Show connection and TDLib status",
    scheduleDesc: "Access the shared calendar scheduler",
    downloadDesc: "Fetch complete report files",
    resetDesc: "Clear intermediate prompt contexts",
    attachmentUnavailable: "Attachment upload is not enabled yet",
    attachTooltip: "Attach media/file placeholder",
    send: "Send",
    
    // WorkspacePage (File History)
    fileHistoryTitle: "File History",
    fileHistoryDesc: "A simple archive of all files received by your bots.",
    searchPlaceholder: "Search files by name, sender, or tag...",
    botFilterLabel: "Bot:",
    allBots: "All Bots",
    noFilesFound: "No files found",
    noFilesDesc: "No files match your filters.",
    colFileName: "File Name",
    colBot: "Bot",
    colSender: "Sender",
    colTag: "Tag",
    colDate: "Date Received",
    colDownloadStatus: "Download Status",
    addTag: "+ Add Tag",
    saveBtn: "Save",
    
    // SettingsPage
    settingsTitle: "Portal Settings & Gateway Status",
    settingsDesc: "Configure connection endpoints, database message retention policies, and monitor TDLib subsystem status.",
    apiSettings: "API Keys & Credentials",
    botTokenLabel: "Bot Access Token",
    apiHashLabel: "Telegram API Hash",
    apiIdLabel: "Telegram API ID",
    proxySettings: "Network Proxy Settings",
    proxyUrlLabel: "MTProto / SOCKS5 Proxy URL",
    systemPasscode: "System Admin Passcode",
    adminPasscodeLabel: "Admin Access Passcode",
    saveSettings: "Save Configuration",
    settingsSaved: "Settings saved successfully!",
    settingsTabTelegram: "Telegram Connection",
    settingsTabBots: "Bot Management",
    settingsTabSecurity: "Security & Keys",
    settingsTabSystem: "System & Cache",
    tdlibStatus: "TDLIB CONTROLLER STATUS",
    processStatus: "TDLib process",
    websocketGateway: "Frontend connection",
    telegramCredentialsStatus: "API credentials",
    telegramAuthorizationStatus: "Login status",
    telegramAccount: "Logged-in account",
    telegramAccountSyncing: "Logged in, syncing account info",
    telegramAccountMissing: "Not logged in",
    telegramNextStep: "Next step",
    telegramLastSync: "Last sync",
    telegramLastError: "Last error",
    reconnectTelegramBtn: "Reconnect",
    logoutTelegramBtn: "Log out Telegram",
    sharedPhone: "Account phone",
    tgApiCredentials: "TELEGRAM API CREDENTIALS",
    apiIdDesc: "API ID (Telegram app-developer console)",
    apiHashDesc: "API Hash (Protected Secret Key)",
    secretsNotice: "* Secrets are configured via backend environment parameters. Editing is locked.",
    auditPolicyAlert: "Audit Policy Alert",
    auditPolicyDesc: "This portal provides shared team-wide access to client conversations. All outgoing commands are audited with internal user stamps. Do not share login invite credentials outside your authorized ops team.",
    dataRetentionPolicies: "DATA RETENTION POLICIES",
    dbRetentionPeriod: "Database Message Retention Period",
    retention7Days: "7 Days (Compliance strict)",
    retention30Days: "30 Days (Standard default)",
    retention90Days: "90 Days (Extended cache)",
    retentionPermanent: "Permanent (Audit history)",
    localFileCaching: "Local File Caching",
    storeDownloadsLocally: "Store downloads locally on server disk",
    clearDownloadCacheTitle: "Local Download Cache",
    clearDownloadCacheDesc: "Delete downloaded files from the server proxy cache. Message history stays available and files can be downloaded again.",
    clearDownloadCacheBtn: "Delete all local download cache",
    clearDownloadCacheDone: "Deleted {files} cached files, freed {bytes}, and removed {downloads} download records.",
    developerOptions: "DEVELOPER OPTIONS",
    devDebugMode: "Developer Debug Mode",
    exposesDecksLogs: "Shows backend event logs and diagnostic state",
    
    // DownloadProgress
    statusPreparing: "Preparing download...",
    statusDownloading: "Downloading...",
    statusSaved: "✓ Saved to local",
    statusFailed: "Download failed",
    statusPaused: "Paused",
    statusStopped: "Stopped",
    downloadBtn: "Download",
    pauseBtn: "Pause",
    resumeBtn: "Resume",
    stopBtn: "Stop",
    retryBtn: "Retry",
    refetchBtn: "Refetch",
    expiredStatus: "Expired",
    downloadAgainTooltip: "Download again",
    savedStatusShort: "Saved",
    
    // User Access Keys
    accessKeyLabel: "Access Key",
    accessKeyPlaceholder: "Enter access key...",
    invalidKeyError: "Invalid access key",
    incorrectAdminPass: "Incorrect passcode",
    keyMgmtTitle: "USER ACCESS KEYS",
    generateKeyBtn: "Generate",
    copyKeyBtn: "Copy key",
    copyKeyUnavailable: "Full key is only copyable in the page session where it was generated",
    keyNamePlaceholder: "Key label (e.g., FrontDesk-01)...",
    colKeyName: "Key Label",
    colKeySecret: "Secret Key",
    colLastLogin: "Last Login",
    neverLogin: "Never",
    revokeBtn: "Revoke",
    sentViaKey: "Sent via key:",
  }
};

export type TxKey = keyof typeof translations['en'];

const messagesReferToSameTelegramMessage = (left: ChatMessage, right: ChatMessage) =>
  Boolean(left.telegramMessageId && right.telegramMessageId && left.telegramMessageId === right.telegramMessageId);

const SEND_CONFIRMATION_DEDUPE_WINDOW_MS = 30_000;

const messageTimestamp = (message: ChatMessage) => {
  const timestamp = Date.parse(message.createdAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const chooseEarlierCreatedAt = (left: ChatMessage, right: ChatMessage) => {
  const leftTimestamp = messageTimestamp(left);
  const rightTimestamp = messageTimestamp(right);
  if (!leftTimestamp) return right.createdAt;
  if (!rightTimestamp) return left.createdAt;
  return leftTimestamp <= rightTimestamp ? left.createdAt : right.createdAt;
};

const messageStatusPriority: Record<ChatMessage["status"], number> = {
  pending: 0,
  received: 1,
  sent: 2,
  edited: 3,
  failed: 4,
  deleted: 5,
};

const chooseMessageStatus = (left: ChatMessage, right: ChatMessage) =>
  messageStatusPriority[right.status] >= messageStatusPriority[left.status]
    ? right.status
    : left.status;

const isClientRequestMessageId = (messageId: string) => messageId.startsWith("req_");

const chooseMessageId = (left: ChatMessage, right: ChatMessage) => {
  if (isClientRequestMessageId(left.id)) return left.id;
  if (isClientRequestMessageId(right.id)) return right.id;
  return right.id || left.id;
};

const chooseTelegramMessageId = (left: ChatMessage, right: ChatMessage) => {
  if (isClientRequestMessageId(right.id) && right.telegramMessageId) return right.telegramMessageId;
  if (isClientRequestMessageId(left.id) && left.telegramMessageId) return left.telegramMessageId;
  return right.telegramMessageId ?? left.telegramMessageId;
};

const messagesHaveCompatibleInternalSender = (left: ChatMessage, right: ChatMessage) =>
  !left.sentByInternalUser?.id
  || !right.sentByInternalUser?.id
  || left.sentByInternalUser.id === right.sentByInternalUser.id;

const messagesHaveCompatibleMediaShape = (left: ChatMessage, right: ChatMessage) =>
  (left.media?.length || 0) === (right.media?.length || 0);

const messagesLookLikeAppSendAndTelegramEcho = (left: ChatMessage, right: ChatMessage) => {
  const leftIsClientRequest = isClientRequestMessageId(left.id);
  const rightIsClientRequest = isClientRequestMessageId(right.id);
  const leftHasInternalSender = Boolean(left.sentByInternalUser);
  const rightHasInternalSender = Boolean(right.sentByInternalUser);

  return leftIsClientRequest !== rightIsClientRequest
    && leftHasInternalSender !== rightHasInternalSender;
};

const messagesHaveCompatibleTelegramIdsForRenderedSend = (left: ChatMessage, right: ChatMessage) =>
  Boolean(left.telegramMessageId) !== Boolean(right.telegramMessageId)
  || Boolean(left.telegramMessageId && right.telegramMessageId && (left.status === "pending" || right.status === "pending"))
  || messagesLookLikeAppSendAndTelegramEcho(left, right);

const messagesLookLikeSameRenderedSend = (left: ChatMessage, right: ChatMessage) =>
  left.botId === right.botId
  && left.direction === right.direction
  && left.direction === "outgoing"
  && messagesHaveCompatibleTelegramIdsForRenderedSend(left, right)
  && (left.text || "") === (right.text || "")
  && (left.replyToMessageId || "") === (right.replyToMessageId || "")
  && messagesHaveCompatibleInternalSender(left, right)
  && messagesHaveCompatibleMediaShape(left, right)
  && Math.abs(messageTimestamp(left) - messageTimestamp(right)) <= SEND_CONFIRMATION_DEDUPE_WINDOW_MS
  && (
    left.status === "pending"
    || right.status === "pending"
    || left.status === "sent"
    || right.status === "sent"
    || left.status === "edited"
    || right.status === "edited"
  );

const messagesRepresentSameLogicalMessage = (left: ChatMessage, right: ChatMessage) =>
  left.id === right.id
  || messagesReferToSameTelegramMessage(left, right)
  || messagesLookLikeSameRenderedSend(left, right);

const compareMessages = (left: ChatMessage, right: ChatMessage) => {
  const byTime = messageTimestamp(left) - messageTimestamp(right);
  return byTime || left.id.localeCompare(right.id);
};

const mergeMessage = (existing: ChatMessage, incoming: ChatMessage): ChatMessage => ({
  ...existing,
  ...incoming,
  id: chooseMessageId(existing, incoming),
  telegramMessageId: chooseTelegramMessageId(existing, incoming),
  text: incoming.text ?? existing.text,
  entities: incoming.entities.length > 0 ? incoming.entities : existing.entities,
  sentByInternalUser: incoming.sentByInternalUser ?? existing.sentByInternalUser,
  media: incoming.media ?? existing.media,
  status: chooseMessageStatus(existing, incoming),
  createdAt: chooseEarlierCreatedAt(existing, incoming),
  editedAt: incoming.editedAt ?? existing.editedAt,
  replyToMessageId: incoming.replyToMessageId ?? existing.replyToMessageId,
  rawAvailable: incoming.rawAvailable ?? existing.rawAvailable,
  inlineKeyboard: incoming.inlineKeyboard ?? existing.inlineKeyboard,
});

const upsertMessageOnce = (messages: ChatMessage[], incoming: ChatMessage) => {
  const matchingMessages = messages.filter((message) => messagesRepresentSameLogicalMessage(message, incoming));
  if (matchingMessages.length === 0) return [...messages, incoming];

  const mergedMessage = [...matchingMessages, incoming]
    .sort(compareMessages)
    .reduce((current, message) => mergeMessage(current, message));
  const remainingMessages = messages.filter((message) => !messagesRepresentSameLogicalMessage(message, incoming));

  return [...remainingMessages, mergedMessage];
};

const normalizeMessages = (messages: ChatMessage[]) =>
  [...messages]
    .sort(compareMessages)
    .reduce<ChatMessage[]>((current, message) => upsertMessageOnce(current, message), [])
    .sort(compareMessages);

const upsertMessage = (messages: ChatMessage[], incoming: ChatMessage) =>
  normalizeMessages([...messages, incoming]);

const mergeDownload = (downloads: DownloadItem[], incoming: DownloadItem) => {
  const sameScope = (download: DownloadItem) =>
    download.id === incoming.id
    || (download.fileId === incoming.fileId && (download.messageId || "") === (incoming.messageId || ""));

  return [incoming, ...downloads.filter((download) => !sameScope(download))];
};

const clientRequestId = () =>
  `req_${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;

interface AppContextType {
  bots: BotSummary[];
  messages: ChatMessage[];
  pendingDrafts: PendingDraft[];
  downloads: DownloadItem[];
  connectionStatus: "connecting" | "connected" | "reconnecting" | "offline";
  activeBotId: string | null;
  selectedMessage: ChatMessage | null;
  eventLog: AppEvent[];
  settings: Settings | null;
  loading: boolean;
  workspaceFiles: WorkspaceFile[];
  userRole: AuthRole | null;
  language: "zh" | "en";
  
  selectBot: (botId: string) => void;
  sendMessage: (text: string, replyToMessageId?: string) => Promise<void>;
  downloadMedia: (fileId: string, messageId?: string, fileName?: string, sizeBytes?: number) => Promise<void>;
  setSelectedMessage: (msg: ChatMessage | null) => void;
  updateSettings: (settings: Partial<Settings>) => Promise<void>;
  clearEventLog: () => void;
  updateFileStatus: (fileId: string, status: "pending" | "approved" | "rejected") => Promise<void>;
  updateFileTag: (fileId: string, tag: string) => Promise<void>;
  login: (role: AuthRole, credential?: string) => Promise<boolean>;
  logout: () => void;
  pauseDownload: (downloadId: string) => Promise<void>;
  resumeDownload: (downloadId: string) => Promise<void>;
  stopDownload: (downloadId: string) => Promise<void>;
  t: (key: TxKey) => string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [messagesMap, setMessagesMap] = useState<Record<string, ChatMessage[]>>({});
  const [pendingDrafts, setPendingDrafts] = useState<PendingDraft[]>([]);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "reconnecting" | "offline">("connecting");
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessageState] = useState<ChatMessage | null>(null);
  const [eventLog, setEventLog] = useState<AppEvent[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const activeBotIdRef = useRef<string | null>(null);

  // Persistent Role & i18n States
  const [userRole, setUserRole] = useState<AuthRole | null>(() => {
    const saved = localStorage.getItem("tg2web_user_role");
    return (saved === "admin" || saved === "user") ? saved : null;
  });

  const [language] = useState<"zh" | "en">(() => {
    const browserLang = navigator.language.toLowerCase();
    return browserLang.startsWith("zh") ? "zh" : "en";
  });

  useEffect(() => {
    activeBotIdRef.current = activeBotId;
  }, [activeBotId]);

  const loadBackendData = useCallback(async () => {
    const botsList = await apiClient.getBots();
    setBots(botsList);

    const msgs: Record<string, ChatMessage[]> = {};
    for (const bot of botsList) {
      msgs[bot.id] = normalizeMessages(await apiClient.getMessages(bot.id));
    }
    setMessagesMap(msgs);

    const dls = await apiClient.getDownloads();
    setDownloads(dls);

    const sets = await apiClient.getSettings();
    setSettings(sets);

    const filesList = await apiClient.getWorkspaceFiles();
    setWorkspaceFiles(filesList);

    setActiveBotId((current) => current || botsList[0]?.id || null);
  }, []);

  const login = useCallback(async (role: AuthRole, credential?: string) => {
    try {
      const response = role === "admin"
        ? await authApiClient.loginAdmin({ password: credential || "" })
        : await authApiClient.loginAccessKey({ accessKey: credential || "" });

      setAuthToken(response.token);
      setUserRole(response.user.role);
      localStorage.setItem("tg2web_user_role", response.user.role);
      setConnectionStatus("connecting");
      await loadBackendData();
      return true;
    } catch (error) {
      console.error("Login failed", error);
      clearAuthToken();
      setUserRole(null);
      localStorage.removeItem("tg2web_user_role");
      return false;
    }
  }, [loadBackendData]);

  const clearSessionState = useCallback(() => {
    setBots([]);
    setMessagesMap({});
    setPendingDrafts([]);
    setDownloads([]);
    setActiveBotId(null);
    setSelectedMessageState(null);
    setEventLog([]);
    setSettings(null);
    setWorkspaceFiles([]);
    setConnectionStatus("offline");
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    setUserRole(null);
    localStorage.removeItem("tg2web_user_role");
    clearSessionState();
  }, [clearSessionState]);

  const t = useCallback((key: TxKey) => {
    const langData = translations[language] || translations["en"];
    return langData[key] || translations["en"][key] || String(key);
  }, [language]);

  // Restore persisted backend session, then fetch initial data.
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const token = getAuthToken();
      if (!token) {
        clearAuthToken();
        localStorage.removeItem("tg2web_user_role");
        setUserRole(null);
        clearSessionState();
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const me = await apiClient.getMe();
        if (!me.role) {
          throw new Error("Session response did not include a role");
        }
        if (!cancelled) {
          setUserRole(me.role);
          localStorage.setItem("tg2web_user_role", me.role);
          await loadBackendData();
        }
      } catch (e) {
        console.error("Failed to initialize backend data", e);
        clearAuthToken();
        localStorage.removeItem("tg2web_user_role");
        if (!cancelled) {
          setUserRole(null);
          clearSessionState();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [clearSessionState, loadBackendData]);

  // Listen to backend WebSocket events
  useEffect(() => {
    if (!userRole || !getAuthToken()) return;

    const unsubscribe = apiClient.subscribeToEvents((event: AppEvent) => {
      // Append to raw Event Log Panel
      setEventLog((prev) => [event, ...prev].slice(0, 100)); // limit to 100 events

      const botId = event.botId;

      switch (event.type) {
        case "connection.status":
          setConnectionStatus(event.status);
          break;

        case "telegram.auth_state":
          break;

        case "bot.published":
        case "bot.updated":
          setBots((prevBots) => {
            const exists = prevBots.some((bot) => bot.id === event.bot.id);
            return exists
              ? prevBots.map((bot) => (bot.id === event.bot.id ? event.bot : bot))
              : [...prevBots, event.bot];
          });
          break;

        case "bot.unpublished":
          setBots((prevBots) => prevBots.filter((bot) => bot.id !== event.botId));
          break;

        case "message.new":
          if (botId && event.message.botId === botId) {
            setMessagesMap((prev) => {
              const currentList = prev[botId] || [];
              return { ...prev, [botId]: upsertMessage(currentList, event.message) };
            });

            // Update bot summary preview & unread count
            setBots((prevBots) =>
              prevBots.map((b) => {
                if (b.id === botId) {
                  return {
                    ...b,
                    lastMessagePreview: event.message.text || "[Media/Attachment]",
                    unreadCount: activeBotIdRef.current === botId ? 0 : b.unreadCount + (event.message.direction === "incoming" ? 1 : 0),
                  };
                }
                return b;
              })
            );
          }
          break;

        case "message.edited":
          if (botId && event.message.botId === botId) {
            setMessagesMap((prev) => {
              const currentList = prev[botId] || [];
              return { ...prev, [botId]: upsertMessage(currentList, event.message) };
            });

            // Sync with Inspector if selected
            setSelectedMessageState((prevSelected) => {
              if (prevSelected && prevSelected.id === event.message.id) {
                return event.message;
              }
              return prevSelected;
            });
          }
          break;

        case "message.deleted":
          if (botId) {
            setMessagesMap((prev) => {
              const currentList = prev[botId] || [];
              const updatedList = currentList.map((m) =>
                m.id === event.messageId || m.telegramMessageId === event.messageId
                  ? { ...m, status: "deleted" as const, text: "[Message deleted]" }
                  : m
              );
              return { ...prev, [botId]: normalizeMessages(updatedList) };
            });
          }
          break;

        case "message.send_ack":
          if (botId) {
            setMessagesMap((prev) => {
              const currentList = prev[botId] || [];
              return {
                ...prev,
                [botId]: normalizeMessages(currentList.map((m) =>
                  m.id === event.clientRequestId
                    ? { ...m, status: "sent" as const, telegramMessageId: event.messageId }
                    : m
                )),
              };
            });
          }
          break;

        case "message.send_failed":
          if (botId) {
            setMessagesMap((prev) => {
              const currentList = prev[botId] || [];
              return {
                ...prev,
                [botId]: normalizeMessages(currentList.map((m) =>
                  m.id === event.clientRequestId
                    ? { ...m, status: "failed" as const }
                    : m
                )),
              };
            });
          }
          break;

        case "draft.pending":
          setPendingDrafts((prev) => {
            const filtered = prev.filter((d) => !(d.botId === event.draft.botId && d.draftId === event.draft.draftId));
            return [...filtered, event.draft];
          });
          break;

        case "draft.expired":
          setPendingDrafts((prev) => prev.filter((d) => !(d.botId === botId && d.draftId === event.draftId)));
          break;

        case "draft.finalized":
          setPendingDrafts((prev) => prev.filter((d) => !(d.botId === botId && d.draftId === event.draftId)));
          // Note: the final message itself arrives via message.new event
          break;

        case "download.progress":
        case "download.ready":
        case "download.failed":
          setDownloads((prev) => mergeDownload(prev, event.download));
          if (event.type === "download.ready") {
            console.info("Download ready", event.download.proxyUrl || event.download.fileId);
          }
          break;

        case "download.deleted":
          setDownloads((prev) => prev.filter((download) => {
            if (download.id === event.downloadId) return false;
            if (download.fileId !== event.fileId) return true;
            return Boolean(event.messageId) && (download.messageId || "") !== event.messageId;
          }));
          break;

        case "file.new":
          setWorkspaceFiles((prev) => {
            const exists = prev.some((f) => f.id === event.file.id);
            if (exists) {
              return prev.map((f) => (f.id === event.file.id ? event.file : f));
            }
            return [
              event.file,
              ...prev.filter((f) => f.messageId !== event.file.messageId),
            ];
          });
          break;

        default:
          console.warn("Unhandled WebSocket event:", event);
      }
    }, logout);

    return unsubscribe;
  }, [logout, userRole]);

  // Select active bot
  const selectBot = useCallback((botId: string) => {
    activeBotIdRef.current = botId;
    setActiveBotId(botId);
    setSelectedMessageState(null); // Clear inspector
    // Mark as read
    setBots((prev) =>
      prev.map((b) => (b.id === botId ? { ...b, unreadCount: 0 } : b))
    );
  }, []);

  // Send message
  const sendMessage = useCallback(
    async (text: string, replyToMessageId?: string) => {
      if (!activeBotId || connectionStatus === "offline") return;
      
      const requestId = clientRequestId();
      const message = await apiClient.sendMessage(activeBotId, {
        clientRequestId: requestId,
        text,
        replyToMessageId,
      });
      setMessagesMap((prev) => ({
        ...prev,
        [activeBotId]: upsertMessage(prev[activeBotId] || [], message),
      }));
    },
    [activeBotId, connectionStatus]
  );

  // Trigger media proxy download
  const downloadMedia = useCallback(
    async (fileId: string, messageId?: string, fileName?: string, sizeBytes?: number) => {
      const download = await apiClient.triggerDownload(fileId, messageId, fileName, sizeBytes);
      setDownloads((prev) => mergeDownload(prev, download));
    },
    []
  );

  const pauseDownload = useCallback(async (downloadId: string) => {
    const download = await apiClient.pauseDownload(downloadId);
    setDownloads((prev) => mergeDownload(prev, download));
  }, []);

  const resumeDownload = useCallback(async (downloadId: string) => {
    const download = await apiClient.resumeDownload(downloadId);
    setDownloads((prev) => mergeDownload(prev, download));
  }, []);

  const stopDownload = useCallback(async (downloadId: string) => {
    const download = await apiClient.stopDownload(downloadId);
    setDownloads((prev) => mergeDownload(prev, download));
  }, []);

  // Set selected message for Inspector
  const setSelectedMessage = useCallback((msg: ChatMessage | null) => {
    setSelectedMessageState(msg);
  }, []);

  // Update Settings
  const updateSettings = useCallback(async (newSettings: Partial<Settings>) => {
    const updated = await apiClient.updateSettings(newSettings);
    setSettings(updated);
  }, []);

  // Clear Event Logs
  const clearEventLog = useCallback(() => {
    setEventLog([]);
  }, []);

  // Update File Status
  const updateFileStatus = useCallback(async (fileId: string, status: "pending" | "approved" | "rejected") => {
    try {
      const updated = await apiClient.updateFileStatus(fileId, status);
      setWorkspaceFiles((prev) => prev.map((f) => (f.id === fileId ? updated : f)));
    } catch (e) {
      console.error("Failed to update file status", e);
    }
  }, []);

  // Update File Tag
  const updateFileTag = useCallback(async (fileId: string, tag: string) => {
    try {
      const updated = await apiClient.updateFileTag(fileId, tag);
      setWorkspaceFiles((prev) => prev.map((f) => (f.id === fileId ? updated : f)));
    } catch (e) {
      console.error("Failed to update file tag", e);
    }
  }, []);

  const activeMessages = activeBotId ? messagesMap[activeBotId] || [] : [];

  return (
    <AppContext.Provider
      value={{
        bots,
        messages: activeMessages,
        pendingDrafts: pendingDrafts.filter((d) => d.botId === activeBotId),
        downloads,
        connectionStatus,
        activeBotId,
        selectedMessage,
        eventLog,
        settings,
        loading,
        workspaceFiles,
        userRole,
        language,
        selectBot,
        sendMessage,
        downloadMedia,
        setSelectedMessage,
        updateSettings,
        clearEventLog,
        updateFileStatus,
        updateFileTag,
        login,
        logout,
        pauseDownload,
        resumeDownload,
        stopDownload,
        t,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
