import React from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { adminApiClient } from "../api/client";
import { AccessKey, DiscoveredTelegramChat, PublishedBot, TelegramStatusResponse } from "../api/types";
import { useApp } from "../context/AppContext";
import { Bot, Check, ChevronLeft, ChevronRight, Copy, Database, KeyRound, RefreshCw, Save, Search, Send, Settings, Shield, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";

const BOT_LIST_PAGE_SIZE = 8;

const copyTextToClipboard = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
};

type StatusTone = "good" | "warning" | "danger" | "neutral";

const tdlibStateText: Record<TelegramStatusResponse["tdlibState"], string> = {
  stopped: "未运行",
  starting: "启动中",
  running: "运行中",
  reconnecting: "重连中",
  error: "异常",
};

const authStateText: Record<TelegramStatusResponse["authState"], string> = {
  not_configured: "未配置",
  tdlib_starting: "TDLib 启动中",
  needs_phone: "等待输入手机号",
  needs_code: "等待验证码",
  needs_password: "等待两步验证密码",
  needs_qr_scan: "等待扫码登录",
  ready: "已登录",
  reconnecting: "正在重连",
  error: "异常",
  logged_out: "已退出",
};

const nextStepText: Record<TelegramStatusResponse["nextStep"], string> = {
  configure_credentials: "配置 API 凭证",
  submit_phone: "输入手机号",
  submit_code: "输入验证码",
  submit_password: "输入两步验证密码",
  scan_qr: "扫描二维码",
  wait: "等待 Telegram 响应",
  ready: "无需操作",
  resolve_error: "处理错误后重连",
};

const connectionStatusText: Record<"connecting" | "connected" | "reconnecting" | "offline", string> = {
  connecting: "连接中",
  connected: "已连接",
  reconnecting: "重连中",
  offline: "离线",
};

const statusTone = (value: string): StatusTone => {
  if (value === "ready" || value === "running" || value === "connected") return "good";
  if (value === "error" || value === "offline" || value === "not_configured" || value === "logged_out") return "danger";
  if (value === "reconnecting" || value === "starting" || value.startsWith("needs_") || value === "tdlib_starting") return "warning";
  return "neutral";
};

const formatStatusTime = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const normalizeBotSearchQuery = (value: string) => value.trim().replace(/^@+/, "").toLowerCase();

const searchableBotText = (...values: Array<string | undefined>) =>
  values
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

const publishedBotMatchesSearch = (bot: PublishedBot, query: string) => {
  if (!query) return true;
  return searchableBotText(bot.displayTitle, bot.title, bot.username, bot.telegramChatId).includes(query);
};

const discoveredChatMatchesSearch = (chat: DiscoveredTelegramChat, query: string) => {
  if (!query) return true;
  return searchableBotText(chat.title, chat.username, chat.telegramChatId).includes(query);
};

const upsertDiscoveredChat = (chats: DiscoveredTelegramChat[], incoming: DiscoveredTelegramChat) => {
  const next = [
    incoming,
    ...chats.filter((chat) => chat.telegramChatId !== incoming.telegramChatId),
  ];
  return next.sort((left, right) =>
    Number(right.isBot) - Number(left.isBot)
    || left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
  );
};

const isDiscoveryPendingError = (error: unknown) =>
  error instanceof Error && error.message.includes("username search was submitted");

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, connectionStatus, t } = useApp();
  const [activeTab, setActiveTab] = React.useState<"telegram" | "bots" | "security" | "system">("telegram");
  const [telegramStatus, setTelegramStatus] = React.useState<TelegramStatusResponse | null>(null);
  const [publishedBots, setPublishedBots] = React.useState<PublishedBot[]>([]);
  const [discoveredChats, setDiscoveredChats] = React.useState<DiscoveredTelegramChat[]>([]);
  const [accessKeys, setAccessKeys] = React.useState<AccessKey[]>([]);
  const [newKeyName, setNewKeyName] = React.useState("");
  const [createdAccessKey, setCreatedAccessKey] = React.useState<AccessKey | null>(null);
  const [knownAccessKeySecrets, setKnownAccessKeySecrets] = React.useState<Record<string, string>>({});
  const [apiId, setApiId] = React.useState("");
  const [apiHash, setApiHash] = React.useState("");
  const [phoneNumber, setPhoneNumber] = React.useState("");
  const [loginCode, setLoginCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [publishedPage, setPublishedPage] = React.useState(1);
  const [discoveredPage, setDiscoveredPage] = React.useState(1);

  const refreshAdminState = React.useCallback(async () => {
    const [status, bots, chats, keys] = await Promise.all([
      adminApiClient.getTelegramStatus(),
      adminApiClient.listPublishedBots(),
      adminApiClient.listTelegramChats(),
      adminApiClient.listAccessKeys(),
    ]);
    setTelegramStatus(status);
    setPublishedBots(bots);
    setDiscoveredChats(chats);
    setAccessKeys(keys);
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshAdminState().catch((error) => setNotice(error instanceof Error ? error.message : String(error)));
  }, [refreshAdminState]);

  React.useEffect(() => {
    const needsAccountInfo = telegramStatus?.nextStep === "ready" && !telegramStatus.accountPhone && !telegramStatus.accountLabel;
    if (telegramStatus?.nextStep !== "scan_qr" && telegramStatus?.nextStep !== "wait" && !needsAccountInfo) return;
    const intervalId = window.setInterval(() => {
      void adminApiClient.getTelegramStatus().then(setTelegramStatus).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(intervalId);
  }, [telegramStatus?.accountLabel, telegramStatus?.accountPhone, telegramStatus?.nextStep]);

  if (!settings) return null;

  const runAdminAction = async (action: () => Promise<unknown>, successMessage: string) => {
    try {
      setBusy(true);
      setNotice(null);
      await action();
      await refreshAdminState();
      setNotice(successMessage);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleCredentialsSave = (event: React.FormEvent) => {
    event.preventDefault();
    runAdminAction(
      async () => {
        await adminApiClient.saveTelegramCredentials({ apiId: apiId.trim(), apiHash });
        setApiHash("");
      },
      "Telegram API credentials saved."
    );
  };

  const handleCreateAccessKey = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newKeyName.trim();
    if (!name) return;

    runAdminAction(
      async () => {
        const created = await adminApiClient.createAccessKey({ name });
        setCreatedAccessKey(created);
        if (created.key) {
          setKnownAccessKeySecrets((prev) => ({ ...prev, [created.id]: created.key as string }));
        }
        setNewKeyName("");
      },
      "Access key created. Copy it now; it will not be shown again."
    );
  };

  const handleSearchTelegramUsername = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = username.trim();
    if (!query) return;

    try {
      setBusy(true);
      setNotice(null);
      let discoveryPending = false;

      try {
        const chat = await adminApiClient.searchTelegramUsername(query);
        setDiscoveredChats((prev) => upsertDiscoveredChat(prev, chat));
      } catch (error) {
        if (!isDiscoveryPendingError(error)) {
          throw error;
        }
        discoveryPending = true;
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }

      await refreshAdminState();
      setNotice(discoveryPending ? "已提交 Telegram 搜索请求，发现结果会刷新到下方列表。" : "搜索完成。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleCopyAccessKey = async (secret: string) => {
    try {
      await copyTextToClipboard(secret);
      setNotice("Access key copied.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const handleRetentionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    updateSettings({ retentionDays: parseInt(event.target.value, 10) });
  };

  const toggleDebug = () => {
    updateSettings({ debugMode: !settings.debugMode });
  };

  const statusValue = telegramStatus?.authState || "not_configured";
  const tdlibValue = telegramStatus?.tdlibState || "stopped";
  const nextStepValue = telegramStatus?.nextStep || "configure_credentials";
  const telegramAccountText = telegramStatus?.accountLabel && telegramStatus?.accountPhone
    ? `${telegramStatus.accountLabel} · ${telegramStatus.accountPhone}`
    : telegramStatus?.accountLabel
      || telegramStatus?.accountPhone
      || (statusValue === "ready" ? t("telegramAccountSyncing") : t("telegramAccountMissing"));
  const botSearchQuery = normalizeBotSearchQuery(username);
  const filteredPublishedBots = publishedBots.filter((bot) => publishedBotMatchesSearch(bot, botSearchQuery));
  const filteredDiscoveredChats = discoveredChats.filter((chat) => discoveredChatMatchesSearch(chat, botSearchQuery));
  const publishedPageCount = Math.max(1, Math.ceil(filteredPublishedBots.length / BOT_LIST_PAGE_SIZE));
  const discoveredPageCount = Math.max(1, Math.ceil(filteredDiscoveredChats.length / BOT_LIST_PAGE_SIZE));
  const currentPublishedPage = Math.min(publishedPage, publishedPageCount);
  const currentDiscoveredPage = Math.min(discoveredPage, discoveredPageCount);
  const pagedPublishedBots = filteredPublishedBots.slice(
    (currentPublishedPage - 1) * BOT_LIST_PAGE_SIZE,
    currentPublishedPage * BOT_LIST_PAGE_SIZE
  );
  const pagedDiscoveredChats = filteredDiscoveredChats.slice(
    (currentDiscoveredPage - 1) * BOT_LIST_PAGE_SIZE,
    currentDiscoveredPage * BOT_LIST_PAGE_SIZE
  );
  const renderPagination = (
    page: number,
    pageCount: number,
    setPage: React.Dispatch<React.SetStateAction<number>>,
    total: number
  ) => {
    if (total <= BOT_LIST_PAGE_SIZE) return null;

    return (
      <div className="settings-pagination">
        <button
          className="icon-button"
          disabled={page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          title="Previous page"
        >
          <ChevronLeft size={14} />
        </button>
        <span>
          {page} / {pageCount} · {total}
        </span>
        <button
          className="icon-button"
          disabled={page >= pageCount}
          onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
          title="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    );
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg-chat)",
        padding: "24px",
        overflow: "hidden",
      }}
    >
      <div style={{ marginBottom: "24px", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px" }}>
        <h1 style={{ fontSize: "1.2rem", fontWeight: "700", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
          <Settings size={20} style={{ color: "var(--accent-blue)" }} />
          <span>{t("settingsTitle")}</span>
        </h1>
        <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "6px", lineHeight: "1.4" }}>
          {t("settingsDesc")}
        </p>
      </div>

      {notice && (
        <div
          style={{
            marginBottom: "16px",
            border: "1px solid var(--border-color)",
            borderRadius: "8px",
            padding: "10px 12px",
            fontSize: "0.78rem",
            color: "var(--text-secondary)",
            backgroundColor: "var(--bg-sidebar)",
          }}
        >
          {notice}
        </div>
      )}

      <div className="settings-layout">
        <div className="settings-sidebar">
          <button
            className={`settings-tab-btn ${activeTab === "telegram" ? "active" : ""}`}
            onClick={() => setActiveTab("telegram")}
          >
            <Send size={16} />
            <span>{t("settingsTabTelegram")}</span>
          </button>
          <button
            className={`settings-tab-btn ${activeTab === "bots" ? "active" : ""}`}
            onClick={() => setActiveTab("bots")}
          >
            <Bot size={16} />
            <span>{t("settingsTabBots")}</span>
          </button>
          <button
            className={`settings-tab-btn ${activeTab === "security" ? "active" : ""}`}
            onClick={() => setActiveTab("security")}
          >
            <Shield size={16} />
            <span>{t("settingsTabSecurity")}</span>
          </button>
          <button
            className={`settings-tab-btn ${activeTab === "system" ? "active" : ""}`}
            onClick={() => setActiveTab("system")}
          >
            <Database size={16} />
            <span>{t("settingsTabSystem")}</span>
          </button>
        </div>

        <div className="settings-content">
          {activeTab === "telegram" && (
            <>
              <section className="settings-card">
                <div className="settings-card-title">
                  <span>{t("tdlibStatus")}</span>
                  <button className="icon-button" onClick={() => refreshAdminState()} disabled={busy} title="刷新状态" aria-label="刷新状态">
                    <RefreshCw size={15} />
                  </button>
                </div>
                <div className="telegram-status-grid">
                  <div className="telegram-status-row account">
                    <span>{t("telegramAccount")}</span>
                    <strong>{telegramAccountText}</strong>
                  </div>
                  <div className="telegram-status-row">
                    <span>{t("telegramAuthorizationStatus")}</span>
                    <strong className={`telegram-status-badge ${statusTone(statusValue)}`}>{authStateText[statusValue]}</strong>
                  </div>
                  <div className="telegram-status-row">
                    <span>{t("processStatus")}</span>
                    <strong className={`telegram-status-badge ${statusTone(tdlibValue)}`}>{tdlibStateText[tdlibValue]}</strong>
                  </div>
                  <div className="telegram-status-row">
                    <span>{t("websocketGateway")}</span>
                    <strong className={`telegram-status-badge ${statusTone(connectionStatus)}`}>{connectionStatusText[connectionStatus]}</strong>
                  </div>
                  <div className="telegram-status-row">
                    <span>{t("telegramCredentialsStatus")}</span>
                    <strong className={`telegram-status-badge ${telegramStatus?.credentialsConfigured ? "good" : "danger"}`}>
                      {telegramStatus?.credentialsConfigured ? "已配置" : "未配置"}
                    </strong>
                  </div>
                  <div className="telegram-status-row">
                    <span>{t("telegramNextStep")}</span>
                    <strong>{nextStepText[nextStepValue]}</strong>
                  </div>
                  <div className="telegram-status-row">
                    <span>{t("telegramLastSync")}</span>
                    <strong>{formatStatusTime(telegramStatus?.lastSyncAt)}</strong>
                  </div>
                  {telegramStatus?.lastError && (
                    <div className="telegram-status-row error">
                      <span>{t("telegramLastError")}</span>
                      <strong>{telegramStatus.lastError}</strong>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
                  <button
                    className="btn-secondary"
                    disabled={busy || !telegramStatus?.credentialsConfigured}
                    onClick={() => runAdminAction(() => adminApiClient.reconnectTelegram(), "已请求重新连接 Telegram。")}
                  >
                    {t("reconnectTelegramBtn")}
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={busy || !telegramStatus?.credentialsConfigured}
                    onClick={() => runAdminAction(() => adminApiClient.logoutTelegram(), "已请求退出 Telegram。")}
                  >
                    {t("logoutTelegramBtn")}
                  </button>
                </div>
              </section>

              <form className="settings-card" onSubmit={handleCredentialsSave}>
                <div className="settings-card-title">{t("tgApiCredentials")}</div>
                <div className="settings-group">
                  <label htmlFor="telegram-api-id">{t("apiIdDesc")}</label>
                  <input
                    id="telegram-api-id"
                    name="telegram-api-id"
                    type="text"
                    value={apiId}
                    onChange={(event) => setApiId(event.target.value)}
                    className="settings-input"
                    autoComplete="off"
                  />
                </div>
                <div className="settings-group">
                  <label htmlFor="telegram-api-hash">{t("apiHashDesc")}</label>
                  <input
                    id="telegram-api-hash"
                    name="telegram-api-hash"
                    type="password"
                    value={apiHash}
                    onChange={(event) => setApiHash(event.target.value)}
                    className="settings-input"
                    autoComplete="new-password"
                  />
                </div>
                <button type="submit" className="btn-primary" disabled={busy || !apiId.trim() || !apiHash.trim()}>
                  <Save size={15} />
                  <span>{t("saveSettings")}</span>
                </button>
                <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "8px", display: "block" }}>
                  {t("secretsNotice")}
                </span>
              </form>

              <form className="settings-card" onSubmit={(event) => event.preventDefault()}>
                <div className="settings-card-title">Shared Account Login</div>
                <div className="settings-group">
                  <label htmlFor="telegram-phone-number">Phone number</label>
                  <input
                    id="telegram-phone-number"
                    name="telegram-phone-number"
                    type="tel"
                    className="settings-input"
                    autoComplete="tel"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                  />
                </div>
                <button
                  className="btn-secondary"
                  disabled={busy || !phoneNumber.trim()}
                  onClick={() => runAdminAction(() => adminApiClient.loginPhone({ phoneNumber: phoneNumber.trim() }), "Phone login submitted.")}
                >
                  Submit phone
                </button>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "12px" }}>
                  <div className="settings-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="telegram-login-code">Login code</label>
                    <input
                      id="telegram-login-code"
                      name="telegram-login-code"
                      className="settings-input"
                      autoComplete="one-time-code"
                      value={loginCode}
                      onChange={(event) => setLoginCode(event.target.value)}
                    />
                  </div>
                  <div className="settings-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="telegram-2fa-password">2FA password</label>
                    <input
                      id="telegram-2fa-password"
                      name="telegram-2fa-password"
                      type="password"
                      className="settings-input"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
                  <button className="btn-secondary" disabled={busy || !loginCode.trim()} onClick={() => runAdminAction(() => adminApiClient.loginCode({ code: loginCode.trim() }), "Login code submitted.")}>
                    Submit code
                  </button>
                  <button className="btn-secondary" disabled={busy || !password} onClick={() => runAdminAction(() => adminApiClient.loginPassword({ password }), "2FA password submitted.")}>
                    Submit 2FA
                  </button>
                  <button className="btn-secondary" disabled={busy} onClick={() => runAdminAction(() => adminApiClient.startQrLogin(), "QR login requested.")}>
                    QR login
                  </button>
                </div>
                {telegramStatus?.qrLink && (
                  <div className="settings-group telegram-qr-login">
                    <label>QR confirmation</label>
                    <div className="telegram-qr-login-panel">
                      <div className="telegram-qr-code" aria-label="Telegram QR login code">
                        <QRCodeSVG
                          value={telegramStatus.qrLink}
                          size={176}
                          level="M"
                          marginSize={2}
                          bgColor="#ffffff"
                          fgColor="#0f172a"
                          title="Telegram QR login code"
                        />
                      </div>
                      <a className="telegram-qr-link" href={telegramStatus.qrLink}>
                        {telegramStatus.qrLink}
                      </a>
                    </div>
                  </div>
                )}
              </form>
            </>
          )}

          {activeTab === "bots" && (
            <section className="settings-card">
              <div className="settings-card-title">Published Bot Chats</div>
              <form onSubmit={handleSearchTelegramUsername} style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                <input
                  id="telegram-bot-username"
                  name="telegram-bot-username"
                  aria-label="Telegram bot username"
                  className="settings-input"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="@bot_username"
                  style={{ margin: 0 }}
                />
                <button
                  type="submit"
                  className="btn-secondary"
                  disabled={busy || !username.trim()}
                  title="搜索 Telegram 用户名"
                >
                  <Search size={14} />
                </button>
              </form>
              <div className="settings-list">
                {filteredPublishedBots.length === 0 ? (
                  <span className="settings-empty">
                    {botSearchQuery ? "没有匹配的已发布机器人。" : "No published bot chats."}
                  </span>
                ) : (
                  pagedPublishedBots.map((bot) => (
                    <div className="settings-list-row" key={bot.id}>
                      <div>
                        <strong>{bot.displayTitle || bot.title}</strong>
                        <span>{bot.username ? `@${bot.username}` : bot.telegramChatId}</span>
                      </div>
                      <button
                        className="icon-button"
                        onClick={() => runAdminAction(() => adminApiClient.patchPublishedBot(bot.id, { enabled: !bot.enabled }), "Bot visibility updated.")}
                        title={bot.enabled ? "Disable" : "Enable"}
                      >
                        {bot.enabled ? <Check size={14} /> : <ToggleLeft size={16} />}
                      </button>
                    </div>
                  ))
                )}
              </div>
              {renderPagination(currentPublishedPage, publishedPageCount, setPublishedPage, filteredPublishedBots.length)}
              {filteredDiscoveredChats.length > 0 ? (
                <div className="settings-list" style={{ marginTop: "12px" }}>
                  {pagedDiscoveredChats.map((chat) => (
                    <div className="settings-list-row" key={chat.telegramChatId}>
                      <div>
                        <strong>{chat.title}</strong>
                        <span>{chat.username ? `@${chat.username}` : chat.telegramChatId}</span>
                      </div>
                      <button
                        className="btn-secondary"
                        onClick={() => runAdminAction(() => adminApiClient.publishBot({ telegramChatId: chat.telegramChatId }), "Bot published.")}
                      >
                        Publish
                      </button>
                    </div>
                  ))}
                  {renderPagination(currentDiscoveredPage, discoveredPageCount, setDiscoveredPage, filteredDiscoveredChats.length)}
                </div>
              ) : (
                botSearchQuery && (
                  <span className="settings-empty" style={{ marginTop: "12px" }}>
                    没有匹配的可发布机器人。可点击搜索按钮向 Telegram 查询公开用户名。
                  </span>
                )
              )}
            </section>
          )}

          {activeTab === "security" && (
            <>
              <section className="settings-card">
                <div style={{ display: "flex", gap: "10px", fontSize: "0.75rem", lineHeight: "1.5", color: "var(--text-secondary)" }}>
                  <Shield size={20} style={{ color: "var(--accent-yellow)", flexShrink: 0 }} />
                  <div>
                    <strong>{t("auditPolicyAlert")}</strong>: {t("auditPolicyDesc")}
                  </div>
                </div>
              </section>

              <section className="settings-card">
                <div className="settings-card-title">
                  <span>{t("keyMgmtTitle")}</span>
                  <KeyRound size={15} style={{ color: "var(--accent-blue)" }} />
                </div>
                <form onSubmit={handleCreateAccessKey} className="access-key-create-form">
                  <input
                    id="access-key-name"
                    name="access-key-name"
                    className="settings-input"
                    value={newKeyName}
                    onChange={(event) => setNewKeyName(event.target.value)}
                    placeholder={t("keyNamePlaceholder")}
                    style={{ margin: 0 }}
                  />
                  <button className="btn-secondary access-key-generate-button" type="submit" disabled={busy || !newKeyName.trim()}>
                    <KeyRound size={14} />
                    <span>{t("generateKeyBtn")}</span>
                  </button>
                </form>
                {createdAccessKey?.key && (
                  <div className="access-key-created-card">
                    <div className="access-key-created-header">
                      <div>New access key</div>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => createdAccessKey.key && handleCopyAccessKey(createdAccessKey.key)}
                        title={t("copyKeyBtn")}
                        aria-label={t("copyKeyBtn")}
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                    <code className="access-key-secret">
                      {createdAccessKey.key}
                    </code>
                  </div>
                )}
                <div className="settings-list">
                  {accessKeys.length === 0 ? (
                    <span className="settings-empty">No user access keys.</span>
                  ) : (
                    accessKeys.map((key) => {
                      const knownSecret = knownAccessKeySecrets[key.id] ?? key.key;

                      return (
                        <div className="settings-list-row" key={key.id}>
                          <div>
                            <strong>{key.name}</strong>
                            <span>
                              {key.keyPreview} · {key.lastLoginAt || t("neverLogin")}
                              {key.revokedAt ? " · revoked" : ""}
                            </span>
                          </div>
                          <div className="access-key-row-actions">
                            <button
                              type="button"
                              className="icon-button"
                              disabled={!knownSecret || Boolean(key.revokedAt)}
                              onClick={() => knownSecret && handleCopyAccessKey(knownSecret)}
                              title={knownSecret ? t("copyKeyBtn") : t("copyKeyUnavailable")}
                              aria-label={knownSecret ? t("copyKeyBtn") : t("copyKeyUnavailable")}
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              className="icon-button"
                              disabled={busy || Boolean(key.revokedAt)}
                              onClick={() => runAdminAction(() => adminApiClient.revokeAccessKey(key.id), "Access key revoked.")}
                              title={t("revokeBtn")}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            </>
          )}

          {activeTab === "system" && (
            <section className="settings-card">
              <div className="settings-card-title">{t("dataRetentionPolicies")}</div>
              <div className="settings-group">
                <label htmlFor="retention-days">{t("dbRetentionPeriod")}</label>
                <select
                  id="retention-days"
                  name="retention-days"
                  value={settings.retentionDays}
                  onChange={handleRetentionChange}
                  className="settings-input"
                  style={{ cursor: "pointer", appearance: "auto" }}
                >
                  <option value={7}>{t("retention7Days")}</option>
                  <option value={30}>{t("retention30Days")}</option>
                  <option value={90}>{t("retention90Days")}</option>
                  <option value={0}>{t("retentionPermanent")}</option>
                </select>
              </div>
              <div className="settings-cache-control">
                <div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: "600" }}>
                    {t("clearDownloadCacheTitle")}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px", lineHeight: 1.4 }}>
                    {t("clearDownloadCacheDesc")}
                  </div>
                </div>
                <Link className="btn-secondary" to="/cache">
                  <RefreshCw size={14} />
                  <span>查看缓存详情</span>
                </Link>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "16px" }}>
                <div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: "600" }}>{t("devDebugMode")}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>
                    {t("exposesDecksLogs")}
                  </div>
                </div>
                <button onClick={toggleDebug} style={{ color: settings.debugMode ? "var(--accent-blue)" : "var(--text-muted)", cursor: "pointer", display: "flex" }}>
                  {settings.debugMode ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>

      <style>{`
        .telegram-status-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .telegram-status-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-height: 38px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 8px 10px;
          background-color: #ffffff;
          font-size: 0.76rem;
        }
        .telegram-status-row.account,
        .telegram-status-row.error {
          grid-column: 1 / -1;
        }
        .telegram-status-row span {
          color: var(--text-secondary);
          flex-shrink: 0;
        }
        .telegram-status-row strong {
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 0.76rem;
          text-align: right;
          overflow-wrap: anywhere;
        }
        .telegram-status-row.account strong {
          font-family: inherit;
          font-size: 0.82rem;
          font-weight: 700;
        }
        .telegram-status-row.error {
          border-color: rgba(244, 63, 94, 0.25);
          background-color: rgba(244, 63, 94, 0.04);
        }
        .telegram-status-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 70px;
          border-radius: 999px;
          padding: 3px 8px;
          border: 1px solid transparent;
          font-family: inherit !important;
          font-size: 0.72rem !important;
          font-weight: 700;
          white-space: nowrap;
        }
        .telegram-status-badge.good {
          color: var(--accent-green);
          background-color: rgba(16, 185, 129, 0.08);
          border-color: rgba(16, 185, 129, 0.18);
        }
        .telegram-status-badge.warning {
          color: var(--accent-yellow);
          background-color: rgba(245, 158, 11, 0.08);
          border-color: rgba(245, 158, 11, 0.2);
        }
        .telegram-status-badge.danger {
          color: var(--accent-red);
          background-color: rgba(244, 63, 94, 0.08);
          border-color: rgba(244, 63, 94, 0.18);
        }
        .telegram-status-badge.neutral {
          color: var(--text-secondary);
          background-color: rgba(148, 163, 184, 0.08);
          border-color: rgba(148, 163, 184, 0.18);
        }
        .settings-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          font-size: 0.8rem;
          padding: 5px 0;
        }
        .settings-row span {
          color: var(--text-secondary);
        }
        .settings-row strong {
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 0.76rem;
          text-align: right;
        }
        .settings-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .access-key-create-form {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 8px;
          margin-bottom: 12px;
        }
        .access-key-generate-button {
          min-width: 112px;
          justify-content: center;
          white-space: nowrap;
        }
        .access-key-created-card {
          border: 1px solid rgba(34, 197, 94, 0.25);
          border-radius: 6px;
          padding: 10px;
          margin-bottom: 12px;
          background-color: rgba(34, 197, 94, 0.04);
        }
        .access-key-created-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
          font-size: 0.72rem;
          color: var(--text-secondary);
        }
        .access-key-secret {
          display: block;
          font-size: 0.72rem;
          color: var(--text-primary);
          word-break: break-all;
        }
        .access-key-row-actions {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .settings-list-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 10px;
        }
        .settings-list-row strong {
          display: block;
          color: var(--text-primary);
          font-size: 0.8rem;
        }
        .settings-list-row span,
        .settings-empty {
          display: block;
          color: var(--text-muted);
          font-size: 0.72rem;
          margin-top: 2px;
        }
        .icon-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          width: 30px;
          height: 30px;
          color: var(--text-secondary);
          cursor: pointer;
          background-color: transparent;
        }
        .icon-button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }
        .settings-pagination {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 10px;
          color: var(--text-muted);
          font-size: 0.72rem;
        }
        .settings-cache-control {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 10px;
          margin-top: 14px;
        }
        .danger-button {
          color: #dc2626;
        }
        .danger-button:hover {
          border-color: rgba(220, 38, 38, 0.35);
          background-color: rgba(220, 38, 38, 0.06);
        }
        @media (max-width: 768px) {
          .settings-grid {
            grid-template-columns: 1fr !important;
          }
          .telegram-status-grid {
            grid-template-columns: 1fr;
          }
          .telegram-status-row {
            align-items: flex-start;
            flex-direction: column;
            gap: 5px;
          }
          .telegram-status-row.account,
          .telegram-status-row.error {
            grid-column: auto;
          }
          .telegram-status-row strong {
            text-align: left;
          }
          .settings-cache-control {
            align-items: flex-start;
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};
