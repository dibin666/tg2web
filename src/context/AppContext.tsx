import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { mockApiClient, simulateDraftStream, simulateDraftExpiry, simulateMessageEdit, simulateFailedSend, simulateConnectionStatusToggle, simulateIncomingFileEvent } from "../api/mock";
import { BotSummary, ChatMessage, PendingDraft, DownloadItem, Settings, AppEvent, WorkspaceFile, AccessKey } from "../api/types";

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
    helpDesc: "获取机器人使用帮助",
    statusDesc: "显示连接和 TDLib 状态",
    scheduleDesc: "访问共享日历日程",
    downloadDesc: "获取完整报告文件",
    resetDesc: "清除中间提示词上下文",
    attachmentMock: "附件上传模拟触发成功！",
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
    downloadBtn: "下载",
    retryBtn: "重试",
    refetchBtn: "重新获取",
    expiredStatus: "已过期",
    downloadAgainTooltip: "重新下载",
    savedStatusShort: "已保存",

    // SettingsPage
    tdlibStatus: "TDLib 控制器状态",
    processStatus: "进程状态:",
    websocketGateway: "WebSocket 网关:",
    sharedPhone: "共享电话:",
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
    developerOptions: "开发者选项",
    devDebugMode: "开发者调试模式",
    exposesDecksLogs: "显示 WebSocket 模拟器控制面板和日志流",
    
    // User Access Keys
    accessKeyLabel: "访问密钥 (Access Key)",
    accessKeyPlaceholder: "输入访问密钥登录...",
    invalidKeyError: "访问密钥无效",
    incorrectAdminPass: "密码错误",
    keyMgmtTitle: "用户访问密钥管理",
    generateKeyBtn: "生成密钥",
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
    helpDesc: "Get bot help instructions",
    statusDesc: "Show connection and TDLib status",
    scheduleDesc: "Access the shared calendar scheduler",
    downloadDesc: "Fetch complete report files",
    resetDesc: "Clear intermediate prompt contexts",
    attachmentMock: "Attachment Uploader Scaffolding Mock Triggered!",
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
    tdlibStatus: "TDLIB CONTROLLER STATUS",
    processStatus: "Process Status:",
    websocketGateway: "WebSocket Gateway:",
    sharedPhone: "Shared Phone:",
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
    developerOptions: "DEVELOPER OPTIONS",
    devDebugMode: "Developer Debug Mode",
    exposesDecksLogs: "Exposes WebSocket simulator decks and log feeds",
    
    // DownloadProgress
    statusPreparing: "Preparing download...",
    statusDownloading: "Downloading...",
    statusSaved: "✓ Saved to local",
    statusFailed: "Download failed",
    downloadBtn: "Download",
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
  userRole: "admin" | "user" | null;
  language: "zh" | "en";
  accessKeys: AccessKey[];
  activeUserKey: string | null;
  
  selectBot: (botId: string) => void;
  sendMessage: (text: string, replyToMessageId?: string) => Promise<void>;
  downloadMedia: (fileId: string, messageId?: string, fileName?: string, sizeBytes?: number) => Promise<void>;
  setSelectedMessage: (msg: ChatMessage | null) => void;
  updateSettings: (settings: Partial<Settings>) => Promise<void>;
  clearEventLog: () => void;
  updateFileStatus: (fileId: string, status: "pending" | "approved" | "rejected") => Promise<void>;
  updateFileTag: (fileId: string, tag: string) => Promise<void>;
  triggerSimulation: (type: "draft_stream" | "draft_expiry" | "msg_edit" | "failed_send" | "connection" | "file_new") => void;
  login: (role: "admin" | "user", credential?: string) => boolean;
  logout: () => void;
  t: (key: TxKey) => string;
  generateAccessKey: (name: string) => void;
  revokeAccessKey: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bots, setBots] = useState<BotSummary[]>([]);
  const [messagesMap, setMessagesMap] = useState<Record<string, ChatMessage[]>>({});
  const [pendingDrafts, setPendingDrafts] = useState<PendingDraft[]>([]);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "reconnecting" | "offline">("connected");
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessageState] = useState<ChatMessage | null>(null);
  const [eventLog, setEventLog] = useState<AppEvent[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);

  // Persistent Role & i18n States
  const [userRole, setUserRole] = useState<"admin" | "user" | null>(() => {
    const saved = localStorage.getItem("tg2web_user_role");
    return (saved === "admin" || saved === "user") ? saved : null;
  });

  const [language] = useState<"zh" | "en">(() => {
    const browserLang = navigator.language.toLowerCase();
    return browserLang.startsWith("zh") ? "zh" : "en";
  });

  const [accessKeys, setAccessKeys] = useState<AccessKey[]>(() => {
    const saved = localStorage.getItem("tg2web_access_keys");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse access keys", e);
      }
    }
    const defaultKeys: AccessKey[] = [
      { id: "key_1", key: "tg_usr_k8s9p2q1r0s7t6", name: "FrontDesk-01", createdAt: new Date().toISOString() },
      { id: "key_2", key: "tg_usr_m3n4o5p6q7r8s9", name: "Billing-02", createdAt: new Date().toISOString() },
    ];
    localStorage.setItem("tg2web_access_keys", JSON.stringify(defaultKeys));
    return defaultKeys;
  });

  const [activeUserKey, setActiveUserKey] = useState<string | null>(() => {
    return localStorage.getItem("tg2web_active_user_key");
  });

  const generateAccessKey = useCallback((name: string) => {
    const rand = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const newKey: AccessKey = {
      id: `key_${Date.now()}`,
      key: `tg_usr_${rand}`,
      name,
      createdAt: new Date().toISOString(),
    };
    setAccessKeys((prev) => {
      const next = [...prev, newKey];
      localStorage.setItem("tg2web_access_keys", JSON.stringify(next));
      return next;
    });
  }, []);

  const revokeAccessKey = useCallback((id: string) => {
    setAccessKeys((prev) => {
      const next = prev.filter((k) => k.id !== id);
      localStorage.setItem("tg2web_access_keys", JSON.stringify(next));
      return next;
    });
  }, []);

  const login = useCallback((role: "admin" | "user", credential?: string) => {
    if (role === "admin") {
      if (credential === "123456") {
        setUserRole("admin");
        localStorage.setItem("tg2web_user_role", "admin");
        return true;
      }
      return false;
    } else {
      let matchedKey: AccessKey | undefined;
      setAccessKeys((prev) => {
        const found = prev.find((k) => k.key === credential);
        if (found) {
          matchedKey = found;
          const next = prev.map((k) =>
            k.id === found.id
              ? { ...k, lastLoginAt: new Date().toISOString() }
              : k
          );
          localStorage.setItem("tg2web_access_keys", JSON.stringify(next));
          return next;
        }
        return prev;
      });

      if (matchedKey) {
        setUserRole("user");
        localStorage.setItem("tg2web_user_role", "user");
        setActiveUserKey(matchedKey.name);
        localStorage.setItem("tg2web_active_user_key", matchedKey.name);
        return true;
      }
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setUserRole(null);
    localStorage.removeItem("tg2web_user_role");
    setActiveUserKey(null);
    localStorage.removeItem("tg2web_active_user_key");
  }, []);

  const t = useCallback((key: TxKey) => {
    const langData = translations[language] || translations["en"];
    return langData[key] || translations["en"][key] || String(key);
  }, [language]);

  // Fetch initial data
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const botsList = await mockApiClient.getBots();
        setBots(botsList);
        
        // Load initial messages for all bots
        const msgs: Record<string, ChatMessage[]> = {};
        for (const bot of botsList) {
          msgs[bot.id] = await mockApiClient.getMessages(bot.id);
        }
        setMessagesMap(msgs);

        const dls = await mockApiClient.getDownloads();
        setDownloads(dls);

        const sets = await mockApiClient.getSettings();
        setSettings(sets);

        const filesList = await mockApiClient.getWorkspaceFiles();
        setWorkspaceFiles(filesList);

        // Auto select first bot
        if (botsList.length > 0) {
          setActiveBotId(botsList[0].id);
        }
      } catch (e) {
        console.error("Failed to initialize mock client data", e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Listen to WebSocket mock events
  useEffect(() => {
    const unsubscribe = mockApiClient.subscribeToEvents((event: AppEvent) => {
      // Append to raw Event Log Panel
      setEventLog((prev) => [event, ...prev].slice(0, 100)); // limit to 100 events

      const botId = event.botId;

      switch (event.type) {
        case "connection.status":
          setConnectionStatus(event.status);
          break;

        case "message.new":
          if (botId) {
            setMessagesMap((prev) => {
              const currentList = prev[botId] || [];
              // Avoid duplicates
              const exists = currentList.some((m) => m.id === event.message.id);
              const updatedList = exists
                ? currentList.map((m) => (m.id === event.message.id ? event.message : m))
                : [...currentList, event.message];

              return { ...prev, [botId]: updatedList };
            });

            // Update bot summary preview & unread count
            setBots((prevBots) =>
              prevBots.map((b) => {
                if (b.id === botId) {
                  return {
                    ...b,
                    lastMessagePreview: event.message.text || "[Media/Attachment]",
                    unreadCount: activeBotId === botId ? 0 : b.unreadCount + (event.message.direction === "incoming" ? 1 : 0),
                  };
                }
                return b;
              })
            );
          }
          break;

        case "message.edited":
          if (botId) {
            setMessagesMap((prev) => {
              const currentList = prev[botId] || [];
              const updatedList = currentList.map((m) =>
                m.id === event.message.id ? event.message : m
              );
              return { ...prev, [botId]: updatedList };
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
                m.id === event.messageId ? { ...m, status: "deleted" as const, text: "[Message deleted]" } : m
              );
              return { ...prev, [botId]: updatedList };
            });
          }
          break;

        case "message.send_ack":
          if (botId) {
            setMessagesMap((prev) => {
              const currentList = prev[botId] || [];
              return {
                ...prev,
                [botId]: currentList.map((m) =>
                  m.id === event.clientRequestId || m.id.startsWith("msg_client_")
                    ? { ...m, status: "sent" as const, telegramMessageId: event.messageId }
                    : m
                ),
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
                [botId]: currentList.map((m) =>
                  m.id.startsWith("msg_client_") // find the pending outgoing message
                    ? { ...m, status: "failed" as const }
                    : m
                ),
              };
            });
          }
          break;

        case "draft.pending":
          setPendingDrafts((prev) => {
            const filtered = prev.filter((d) => d.draftId !== event.draft.draftId);
            return [...filtered, event.draft];
          });
          break;

        case "draft.expired":
          setPendingDrafts((prev) => prev.filter((d) => d.draftId !== event.draftId));
          break;

        case "draft.finalized":
          setPendingDrafts((prev) => prev.filter((d) => d.draftId !== event.draftId));
          // Note: the final message itself arrives via message.new event
          break;

        case "download.progress":
        case "download.ready":
        case "download.failed":
          setDownloads((prev) => {
            const exists = prev.some((d) => d.id === event.download.id);
            if (exists) {
              return prev.map((d) => (d.id === event.download.id ? event.download : d));
            } else {
              return [...prev, event.download];
            }
          });
          if (event.type === "download.ready") {
            try {
              const fileName = event.download.fileName || "telegram_file.bin";
              const blob = new Blob([
                `Mock file content for: ${fileName}\n` +
                `Size: ${event.download.sizeBytes || 0} bytes\n` +
                `Downloaded successfully via Telegram Web Relay.`
              ], { type: "text/plain" });
              const url = window.URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.setAttribute("download", fileName);
              document.body.appendChild(link);
              link.click();
              link.remove();
              window.URL.revokeObjectURL(url);
            } catch (err) {
              console.error("Local browser download failed", err);
            }
          }
          break;

        case "file.new":
          setWorkspaceFiles((prev) => {
            const exists = prev.some((f) => f.id === event.file.id);
            if (exists) {
              return prev.map((f) => (f.id === event.file.id ? event.file : f));
            }
            return [event.file, ...prev];
          });
          break;

        default:
          console.warn("Unhandled WebSocket event:", event);
      }
    });

    return unsubscribe;
  }, [activeBotId]);

  // Select active bot
  const selectBot = useCallback((botId: string) => {
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
      
      const clientRequestId = `req_${Date.now()}`;
      await mockApiClient.sendMessage(activeBotId, {
        clientRequestId,
        text,
        replyToMessageId,
        sentByAccessKeyName: userRole === "user" ? (activeUserKey || undefined) : undefined,
      });
    },
    [activeBotId, connectionStatus, userRole, activeUserKey]
  );

  // Trigger media proxy download
  const downloadMedia = useCallback(
    async (fileId: string, messageId?: string, fileName?: string, sizeBytes?: number) => {
      await mockApiClient.triggerDownload(fileId, messageId, fileName, sizeBytes);
    },
    []
  );

  // Set selected message for Inspector
  const setSelectedMessage = useCallback((msg: ChatMessage | null) => {
    setSelectedMessageState(msg);
  }, []);

  // Update Settings
  const updateSettings = useCallback(async (newSettings: Partial<Settings>) => {
    const updated = await mockApiClient.updateSettings(newSettings);
    setSettings(updated);
  }, []);

  // Clear Event Logs
  const clearEventLog = useCallback(() => {
    setEventLog([]);
  }, []);

  // Update File Status
  const updateFileStatus = useCallback(async (fileId: string, status: "pending" | "approved" | "rejected") => {
    try {
      const updated = await mockApiClient.updateFileStatus(fileId, status);
      setWorkspaceFiles((prev) => prev.map((f) => (f.id === fileId ? updated : f)));
    } catch (e) {
      console.error("Failed to update file status", e);
    }
  }, []);

  // Update File Tag
  const updateFileTag = useCallback(async (fileId: string, tag: string) => {
    try {
      const updated = await mockApiClient.updateFileTag(fileId, tag);
      setWorkspaceFiles((prev) => prev.map((f) => (f.id === fileId ? updated : f)));
    } catch (e) {
      console.error("Failed to update file tag", e);
    }
  }, []);

  // Run Mocks Live Simulations
  const triggerSimulation = useCallback(
    (type: "draft_stream" | "draft_expiry" | "msg_edit" | "failed_send" | "connection" | "file_new") => {
      if (!activeBotId) return;

      switch (type) {
        case "draft_stream":
          simulateDraftStream(activeBotId);
          break;
        case "draft_expiry":
          simulateDraftExpiry(activeBotId);
          break;
        case "msg_edit":
          simulateMessageEdit(activeBotId);
          break;
        case "failed_send":
          simulateFailedSend(activeBotId);
          break;
        case "connection":
          simulateConnectionStatusToggle();
          break;
        case "file_new":
          simulateIncomingFileEvent(activeBotId);
          break;
      }
    },
    [activeBotId]
  );

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
        accessKeys,
        activeUserKey,
        selectBot,
        sendMessage,
        downloadMedia,
        setSelectedMessage,
        updateSettings,
        clearEventLog,
        updateFileStatus,
        updateFileTag,
        triggerSimulation,
        login,
        logout,
        t,
        generateAccessKey,
        revokeAccessKey,
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
