import React from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { adminApiClient } from "../api/client";
import { AccessKey, DiscoveredTelegramChat, PublishedBot, Settings as AppSettings, TelegramStatusResponse } from "../api/types";
import { TxKey, useApp } from "../context/AppContext";
import { PageHeader } from "../components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Archive,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  KeyRound,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings as SettingsIcon,
  Shield,
  ToggleLeft,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  stopped: "未运行", starting: "启动中", running: "运行中", reconnecting: "重连中", error: "异常",
};
const authStateText: Record<TelegramStatusResponse["authState"], string> = {
  not_configured: "未配置", tdlib_starting: "TDLib 启动中", needs_phone: "等待输入手机号", needs_code: "等待验证码",
  needs_password: "等待两步验证密码", needs_qr_scan: "等待扫码登录", ready: "已登录", reconnecting: "正在重连",
  error: "异常", logged_out: "已退出",
};
const nextStepText: Record<TelegramStatusResponse["nextStep"], string> = {
  configure_credentials: "配置 API 凭证", submit_phone: "输入手机号", submit_code: "输入验证码",
  submit_password: "输入两步验证密码", scan_qr: "扫描二维码", wait: "等待 Telegram 响应", ready: "无需操作", resolve_error: "处理错误后重连",
};
const connectionStatusText: Record<"connecting" | "connected" | "reconnecting" | "offline", string> = {
  connecting: "连接中", connected: "已连接", reconnecting: "重连中", offline: "离线",
};

const statusTone = (value: string): StatusTone => {
  if (value === "ready" || value === "running" || value === "connected") return "good";
  if (value === "error" || value === "offline" || value === "not_configured" || value === "logged_out") return "danger";
  if (value === "reconnecting" || value === "starting" || value.startsWith("needs_") || value === "tdlib_starting") return "warning";
  return "neutral";
};

const TONE_CLASS: Record<StatusTone, string> = {
  good: "bg-[var(--success-soft)] text-success",
  warning: "bg-[var(--warning-soft)] text-warning",
  danger: "bg-[var(--danger-soft)] text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

const formatStatusTime = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const normalizeBotSearchQuery = (value: string) => value.trim().replace(/^@+/, "").toLowerCase();
const searchableBotText = (...values: Array<string | undefined>) =>
  values.filter((v): v is string => Boolean(v)).join(" ").toLowerCase();
const publishedBotMatchesSearch = (bot: PublishedBot, query: string) =>
  !query || searchableBotText(bot.displayTitle, bot.title, bot.username, bot.telegramChatId).includes(query);
const discoveredChatMatchesSearch = (chat: DiscoveredTelegramChat, query: string) =>
  !query || searchableBotText(chat.title, chat.username, chat.telegramChatId).includes(query);
const isDiscoveredBot = (chat: DiscoveredTelegramChat) => chat.isBot || chat.kind === "bot";

const upsertDiscoveredChat = (chats: DiscoveredTelegramChat[], incoming: DiscoveredTelegramChat) => {
  if (!isDiscoveredBot(incoming)) return chats;
  const incomingUsername = normalizeBotSearchQuery(incoming.username || "");
  const next = [
    incoming,
    ...chats.filter((chat) => {
      if (chat.telegramChatId === incoming.telegramChatId) return false;
      if (!incomingUsername) return true;
      return normalizeBotSearchQuery(chat.username || "") !== incomingUsername;
    }),
  ].filter(isDiscoveredBot);
  return next.sort((left, right) =>
    Number(right.isBot) - Number(left.isBot) || left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
  );
};

const isDiscoveryPendingError = (error: unknown) =>
  error instanceof Error && error.message.includes("username search was submitted");

const publishedBotForDiscoveredChat = (bots: PublishedBot[], chat: DiscoveredTelegramChat) => {
  const username = normalizeBotSearchQuery(chat.username || "");
  return (
    bots.find((bot) => bot.telegramChatId === chat.telegramChatId) ||
    (username ? bots.find((bot) => normalizeBotSearchQuery(bot.username || "") === username) : undefined)
  );
};

const ARCHIVE_TEMPLATE_SAMPLE: Record<string, string> = {
  artist: "Artist", album: "Album", year: "2025", provider: "Qobuz", source: "WEB",
  format: "FLAC", bitDepth: "16", sampleRate: "44.1", quality: "16B-44.1kHz",
};
const INVALID_FOLDER_NAME_CHARS = new Set(["\\", "/", ":", "*", "?", "\"", "<", ">", "|"]);
const sanitizePreviewFolderName = (value: string) => {
  const sanitized = value
    .split("")
    .map((char) => (char.charCodeAt(0) < 32 || INVALID_FOLDER_NAME_CHARS.has(char) ? "-" : char))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "");
  return sanitized || "Untitled Album";
};
const archiveTemplatePreview = (template: string) => {
  const rendered = Object.entries(ARCHIVE_TEMPLATE_SAMPLE).reduce(
    (value, [key, replacement]) => value.replaceAll(`{${key}}`, replacement),
    template.trim()
  );
  return sanitizePreviewFolderName(rendered.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, ""));
};

/* ---------- Shared building blocks ---------- */

const SettingsCard: React.FC<{ title?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  title,
  children,
  className,
}) => (
  <section className={cn("rounded-2xl border bg-card p-5", className)}>
    {title && <div className="mb-4 flex items-center justify-between text-sm font-semibold">{title}</div>}
    {children}
  </section>
);

const StatusRow: React.FC<{ label: string; children: React.ReactNode; full?: boolean }> = ({ label, children, full }) => (
  <div
    className={cn(
      "flex min-h-10 items-center justify-between gap-3 rounded-xl border bg-background/60 px-3 py-2 text-xs dark:bg-background/30",
      full && "col-span-full"
    )}
  >
    <span className="shrink-0 text-muted-foreground">{label}</span>
    <span className="text-right font-medium text-foreground">{children}</span>
  </div>
);

const StatusBadge: React.FC<{ tone: StatusTone; children: React.ReactNode }> = ({ tone, children }) => (
  <Badge className={cn("rounded-full border-transparent px-2.5 text-[11px] font-bold", TONE_CLASS[tone])}>{children}</Badge>
);

const FieldGroup: React.FC<{ label: string; htmlFor?: string; children: React.ReactNode }> = ({ label, htmlFor, children }) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor={htmlFor} className="text-xs font-semibold text-muted-foreground">
      {label}
    </Label>
    {children}
  </div>
);

/* ---------- Archive rename panel ---------- */

type ArchiveRenameSettingsPanelProps = {
  settings: AppSettings;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  setNotice: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: TxKey) => string;
};

const ArchiveRenameSettingsPanel: React.FC<ArchiveRenameSettingsPanelProps> = ({ settings, updateSettings, setNotice, t }) => {
  const [draftTemplate, setDraftTemplate] = React.useState(settings.archiveFolderTemplate);
  const [saving, setSaving] = React.useState(false);
  const preview = React.useMemo(() => archiveTemplatePreview(draftTemplate), [draftTemplate]);
  const trimmedTemplate = draftTemplate.trim();
  const templateChanged = trimmedTemplate !== settings.archiveFolderTemplate;
  const canSave = Boolean(trimmedTemplate) && templateChanged && !saving;

  const runArchiveSettingsUpdate = async (patch: Partial<AppSettings>, successMessage: string) => {
    try {
      setSaving(true);
      await updateSettings(patch);
      setNotice(successMessage);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border bg-background/60 p-4 dark:bg-background/30">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Archive className="size-4 text-primary" />
            <span>{t("archiveRenameTitle")}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{t("archiveRenameDesc")}</div>
        </div>
        <Switch
          checked={settings.archiveFolderRenameEnabled}
          disabled={saving}
          onCheckedChange={() =>
            runArchiveSettingsUpdate({ archiveFolderRenameEnabled: !settings.archiveFolderRenameEnabled }, t("archiveRenameSaved"))
          }
        />
      </div>

      <FieldGroup label={t("archiveRenameTemplate")} htmlFor="archive-folder-template">
        <div className="flex gap-2">
          <Input
            id="archive-folder-template"
            name="archive-folder-template"
            value={draftTemplate}
            onChange={(e) => setDraftTemplate(e.target.value)}
            spellCheck={false}
            className="h-9 flex-1 rounded-xl font-mono text-xs"
          />
          <Button
            variant="outline"
            size="icon"
            className="size-9 rounded-xl"
            disabled={!canSave}
            onClick={() => runArchiveSettingsUpdate({ archiveFolderTemplate: trimmedTemplate }, t("archiveRenameSaved"))}
            title={t("saveBtn")}
          >
            <Save className="size-3.5" />
          </Button>
        </div>
      </FieldGroup>

      <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <span>{t("archiveRenamePreview")}</span>
        <code className="break-all font-mono text-foreground">{preview}</code>
      </div>
    </div>
  );
};

/* ---------- Page ---------- */

const TABS: Array<{ key: "telegram" | "bots" | "security" | "system"; label: TxKey; icon: typeof Send }> = [
  { key: "telegram", label: "settingsTabTelegram", icon: Send },
  { key: "bots", label: "settingsTabBots", icon: Bot },
  { key: "security", label: "settingsTabSecurity", icon: Shield },
  { key: "system", label: "settingsTabSystem", icon: Database },
];

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
  const [botChatsLoaded, setBotChatsLoaded] = React.useState(false);

  const refreshAdminState = React.useCallback(async () => {
    const [status, bots, keys] = await Promise.all([
      adminApiClient.getTelegramStatus(),
      adminApiClient.listPublishedBots(),
      adminApiClient.listAccessKeys(),
    ]);
    setTelegramStatus(status);
    setPublishedBots(bots);
    setAccessKeys(keys);
  }, []);

  const refreshBotState = React.useCallback(async () => {
    const [bots, chats] = await Promise.all([adminApiClient.listPublishedBots(), adminApiClient.listTelegramChats()]);
    setPublishedBots(bots);
    setDiscoveredChats(chats.filter(isDiscoveredBot));
    setBotChatsLoaded(true);
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshAdminState().catch((error) => setNotice(error instanceof Error ? error.message : String(error)));
  }, [refreshAdminState]);

  React.useEffect(() => {
    if (activeTab !== "bots" || botChatsLoaded) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void refreshBotState().catch((error) => {
        if (active) setNotice(error instanceof Error ? error.message : String(error));
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [activeTab, botChatsLoaded, refreshBotState]);

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
      if (activeTab === "bots") await refreshBotState();
      else await refreshAdminState();
      setNotice(successMessage);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleCredentialsSave = (event: React.FormEvent) => {
    event.preventDefault();
    runAdminAction(async () => {
      await adminApiClient.saveTelegramCredentials({ apiId: apiId.trim(), apiHash });
      setApiHash("");
    }, "Telegram API 凭证已保存。");
  };

  const handleCreateAccessKey = (event: React.FormEvent) => {
    event.preventDefault();
    const name = newKeyName.trim();
    if (!name) return;
    runAdminAction(async () => {
      const created = await adminApiClient.createAccessKey({ name });
      setCreatedAccessKey(created);
      if (created.key) setKnownAccessKeySecrets((prev) => ({ ...prev, [created.id]: created.key as string }));
      setNewKeyName("");
    }, "访问密钥已创建,请立即复制,之后将不再显示。");
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
        if (!isDiscoveredBot(chat)) {
          setNotice("该用户名不是机器人。");
          return;
        }
      } catch (error) {
        if (!isDiscoveryPendingError(error)) throw error;
        discoveryPending = true;
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
      await refreshBotState();
      if (discoveryPending) {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        await refreshBotState();
      }
      setNotice(discoveryPending ? "已提交 Telegram 搜索请求,发现结果会刷新到下方列表。" : "搜索完成。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleCopyAccessKey = async (secret: string) => {
    try {
      await copyTextToClipboard(secret);
      setNotice("访问密钥已复制。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const statusValue = telegramStatus?.authState || "not_configured";
  const tdlibValue = telegramStatus?.tdlibState || "stopped";
  const nextStepValue = telegramStatus?.nextStep || "configure_credentials";
  const telegramAccountText =
    telegramStatus?.accountLabel && telegramStatus?.accountPhone
      ? `${telegramStatus.accountLabel} · ${telegramStatus.accountPhone}`
      : telegramStatus?.accountLabel ||
        telegramStatus?.accountPhone ||
        (statusValue === "ready" ? t("telegramAccountSyncing") : t("telegramAccountMissing"));

  const botSearchQuery = normalizeBotSearchQuery(username);
  const filteredPublishedBots = publishedBots.filter((bot) => publishedBotMatchesSearch(bot, botSearchQuery));
  const filteredDiscoveredChats = discoveredChats.filter(isDiscoveredBot).filter((chat) => discoveredChatMatchesSearch(chat, botSearchQuery));
  const publishedPageCount = Math.max(1, Math.ceil(filteredPublishedBots.length / BOT_LIST_PAGE_SIZE));
  const discoveredPageCount = Math.max(1, Math.ceil(filteredDiscoveredChats.length / BOT_LIST_PAGE_SIZE));
  const currentPublishedPage = Math.min(publishedPage, publishedPageCount);
  const currentDiscoveredPage = Math.min(discoveredPage, discoveredPageCount);
  const pagedPublishedBots = filteredPublishedBots.slice((currentPublishedPage - 1) * BOT_LIST_PAGE_SIZE, currentPublishedPage * BOT_LIST_PAGE_SIZE);
  const pagedDiscoveredChats = filteredDiscoveredChats.slice((currentDiscoveredPage - 1) * BOT_LIST_PAGE_SIZE, currentDiscoveredPage * BOT_LIST_PAGE_SIZE);

  const renderPagination = (
    page: number,
    pageCount: number,
    setPage: React.Dispatch<React.SetStateAction<number>>,
    total: number
  ) => {
    if (total <= BOT_LIST_PAGE_SIZE) return null;
    return (
      <div className="flex items-center justify-end gap-2 pt-2 text-xs text-muted-foreground">
        <Button variant="outline" size="icon" className="size-7 rounded-lg" disabled={page <= 1} onClick={() => setPage((c) => Math.max(1, c - 1))}>
          <ChevronLeft className="size-3.5" />
        </Button>
        <span>{page} / {pageCount} · {total}</span>
        <Button variant="outline" size="icon" className="size-7 rounded-lg" disabled={page >= pageCount} onClick={() => setPage((c) => Math.min(pageCount, c + 1))}>
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    );
  };

  const ListRow: React.FC<{ title: string; subtitle: string; action: React.ReactNode }> = ({ title, subtitle, action }) => (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-background/40 px-3 py-2.5">
      <div className="min-w-0">
        <strong className="block truncate text-sm">{title}</strong>
        <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>
      </div>
      {action}
    </div>
  );

  return (
    <div className="scrollbar-thin h-full overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-6 max-sm:p-4">
        <PageHeader
          icon={<SettingsIcon className="size-5" />}
          title={t("settingsTitle")}
          description={t("settingsDesc")}
        />

        {notice && <div className="rounded-xl border bg-card px-4 py-2.5 text-xs text-muted-foreground">{notice}</div>}

        <div className="flex gap-5 max-md:flex-col">
          {/* Tab rail */}
          <nav className="flex shrink-0 flex-col gap-1 md:w-48">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition-colors max-md:flex-1 max-md:justify-center",
                  activeTab === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                <span className="max-md:hidden">{t(label)}</span>
              </button>
            ))}
          </nav>

          {/* Tab content */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {activeTab === "telegram" && (
              <>
                <SettingsCard
                  title={
                    <>
                      <span>{t("tdlibStatus")}</span>
                      <Button variant="ghost" size="icon" className="size-8 rounded-lg" onClick={() => refreshAdminState()} disabled={busy} title="刷新状态">
                        <RefreshCw className={cn("size-4", busy && "animate-spin")} />
                      </Button>
                    </>
                  }
                >
                  <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                    <StatusRow label={t("telegramAccount")} full>
                      <span className="font-semibold">{telegramAccountText}</span>
                    </StatusRow>
                    <StatusRow label={t("telegramAuthorizationStatus")}>
                      <StatusBadge tone={statusTone(statusValue)}>{authStateText[statusValue]}</StatusBadge>
                    </StatusRow>
                    <StatusRow label={t("processStatus")}>
                      <StatusBadge tone={statusTone(tdlibValue)}>{tdlibStateText[tdlibValue]}</StatusBadge>
                    </StatusRow>
                    <StatusRow label={t("websocketGateway")}>
                      <StatusBadge tone={statusTone(connectionStatus)}>{connectionStatusText[connectionStatus]}</StatusBadge>
                    </StatusRow>
                    <StatusRow label={t("telegramCredentialsStatus")}>
                      <StatusBadge tone={telegramStatus?.credentialsConfigured ? "good" : "danger"}>
                        {telegramStatus?.credentialsConfigured ? "已配置" : "未配置"}
                      </StatusBadge>
                    </StatusRow>
                    <StatusRow label={t("telegramNextStep")}>{nextStepText[nextStepValue]}</StatusRow>
                    <StatusRow label={t("telegramLastSync")}>{formatStatusTime(telegramStatus?.lastSyncAt)}</StatusRow>
                    {telegramStatus?.lastError && (
                      <StatusRow label={t("telegramLastError")} full>
                        <span className="text-destructive">{telegramStatus.lastError}</span>
                      </StatusRow>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="rounded-xl" disabled={busy || !telegramStatus?.credentialsConfigured} onClick={() => runAdminAction(() => adminApiClient.reconnectTelegram(), "已请求重新连接 Telegram。")}>
                      {t("reconnectTelegramBtn")}
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-xl" disabled={busy || !telegramStatus?.credentialsConfigured} onClick={() => runAdminAction(() => adminApiClient.logoutTelegram(), "已请求退出 Telegram。")}>
                      {t("logoutTelegramBtn")}
                    </Button>
                  </div>
                </SettingsCard>

                <form onSubmit={handleCredentialsSave}>
                  <SettingsCard title={<span>{t("tgApiCredentials")}</span>}>
                    <div className="flex flex-col gap-3">
                      <FieldGroup label={t("apiIdDesc")} htmlFor="telegram-api-id">
                        <Input id="telegram-api-id" name="telegram-api-id" type="text" value={apiId} onChange={(e) => setApiId(e.target.value)} autoComplete="off" className="h-9 rounded-xl" />
                      </FieldGroup>
                      <FieldGroup label={t("apiHashDesc")} htmlFor="telegram-api-hash">
                        <Input id="telegram-api-hash" name="telegram-api-hash" type="password" value={apiHash} onChange={(e) => setApiHash(e.target.value)} autoComplete="new-password" className="h-9 rounded-xl" />
                      </FieldGroup>
                      <Button type="submit" className="gradient-brand w-fit rounded-xl text-white hover:opacity-90" disabled={busy || !apiId.trim() || !apiHash.trim()}>
                        <Save className="size-4" />
                        {t("saveSettings")}
                      </Button>
                      <span className="text-[11px] text-muted-foreground">{t("secretsNotice")}</span>
                    </div>
                  </SettingsCard>
                </form>

                <form onSubmit={(e) => e.preventDefault()}>
                  <SettingsCard title={<span>共享账号登录</span>}>
                    <div className="flex flex-col gap-3">
                      <FieldGroup label="手机号" htmlFor="telegram-phone-number">
                        <Input id="telegram-phone-number" name="telegram-phone-number" type="tel" autoComplete="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="h-9 rounded-xl" />
                      </FieldGroup>
                      <Button variant="outline" size="sm" className="w-fit rounded-xl" disabled={busy || !phoneNumber.trim()} onClick={() => runAdminAction(() => adminApiClient.loginPhone({ phoneNumber: phoneNumber.trim() }), "已提交手机号登录。")}>
                        提交手机号
                      </Button>
                      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                        <FieldGroup label="登录验证码" htmlFor="telegram-login-code">
                          <Input id="telegram-login-code" name="telegram-login-code" autoComplete="one-time-code" value={loginCode} onChange={(e) => setLoginCode(e.target.value)} className="h-9 rounded-xl" />
                        </FieldGroup>
                        <FieldGroup label="两步验证密码" htmlFor="telegram-2fa-password">
                          <Input id="telegram-2fa-password" name="telegram-2fa-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-9 rounded-xl" />
                        </FieldGroup>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" className="rounded-xl" disabled={busy || !loginCode.trim()} onClick={() => runAdminAction(() => adminApiClient.loginCode({ code: loginCode.trim() }), "已提交验证码。")}>
                          提交验证码
                        </Button>
                        <Button variant="outline" size="sm" className="rounded-xl" disabled={busy || !password} onClick={() => runAdminAction(() => adminApiClient.loginPassword({ password }), "已提交两步验证密码。")}>
                          提交 2FA
                        </Button>
                        <Button variant="outline" size="sm" className="rounded-xl" disabled={busy} onClick={() => runAdminAction(() => adminApiClient.startQrLogin(), "已请求二维码登录。")}>
                          扫码登录
                        </Button>
                      </div>
                      {telegramStatus?.qrLink && (
                        <div className="flex flex-col items-center gap-2 rounded-xl border bg-background/50 p-4">
                          <div className="rounded-lg bg-white p-2">
                            <QRCodeSVG value={telegramStatus.qrLink} size={176} level="M" marginSize={2} bgColor="#ffffff" fgColor="#141413" title="Telegram QR login code" />
                          </div>
                          <a className="break-all text-center text-[11px] text-primary" href={telegramStatus.qrLink}>
                            {telegramStatus.qrLink}
                          </a>
                        </div>
                      )}
                    </div>
                  </SettingsCard>
                </form>
              </>
            )}

            {activeTab === "bots" && (
              <SettingsCard title={<span>机器人</span>}>
                <form onSubmit={handleSearchTelegramUsername} className="mb-3 flex gap-2">
                  <Input id="telegram-bot-username" name="telegram-bot-username" aria-label="Telegram bot username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@bot_username" className="h-9 rounded-xl" />
                  <Button type="submit" variant="outline" size="icon" className="size-9 shrink-0 rounded-xl" disabled={busy || !username.trim()} title="搜索 Telegram 用户名">
                    <Search className="size-4" />
                  </Button>
                </form>

                <div className="flex flex-col gap-2">
                  {!botChatsLoaded ? (
                    <span className="text-xs text-muted-foreground">正在加载机器人...</span>
                  ) : filteredPublishedBots.length === 0 ? (
                    <span className="text-xs text-muted-foreground">{botSearchQuery ? "没有匹配的已发布机器人。" : "没有已发布机器人。"}</span>
                  ) : (
                    pagedPublishedBots.map((bot) => {
                      const keepVisibleInSearch = Boolean(botSearchQuery && bot.enabled);
                      return (
                        <ListRow
                          key={bot.id}
                          title={bot.displayTitle || bot.title}
                          subtitle={bot.username ? `@${bot.username}` : bot.telegramChatId}
                          action={
                            <Button variant="outline" size="icon" className="size-8 shrink-0 rounded-lg" disabled={busy || keepVisibleInSearch} onClick={() => runAdminAction(() => adminApiClient.patchPublishedBot(bot.id, { enabled: !bot.enabled }), "机器人可见性已更新。")} title={keepVisibleInSearch ? "已发布" : bot.enabled ? "禁用" : "启用"}>
                              {bot.enabled ? <Check className="size-4 text-success" /> : <ToggleLeft className="size-4" />}
                            </Button>
                          }
                        />
                      );
                    })
                  )}
                </div>
                {renderPagination(currentPublishedPage, publishedPageCount, setPublishedPage, filteredPublishedBots.length)}

                {filteredDiscoveredChats.length > 0 ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">可发布</div>
                    {pagedDiscoveredChats.map((chat) => {
                      const published = publishedBotForDiscoveredChat(publishedBots, chat);
                      const sameChatPublished = published?.telegramChatId === chat.telegramChatId;
                      const isRebinding = Boolean(published && !sameChatPublished);
                      return (
                        <ListRow
                          key={chat.telegramChatId}
                          title={chat.title}
                          subtitle={chat.username ? `@${chat.username}` : chat.telegramChatId}
                          action={
                            <Button variant="outline" size="sm" className="shrink-0 rounded-lg" disabled={busy || sameChatPublished} onClick={() => runAdminAction(() => adminApiClient.publishBot({ telegramChatId: chat.telegramChatId }), isRebinding ? "机器人绑定已刷新。" : "机器人已发布。")}>
                              {sameChatPublished ? "已发布" : isRebinding ? "重新绑定" : "发布"}
                            </Button>
                          }
                        />
                      );
                    })}
                    {renderPagination(currentDiscoveredPage, discoveredPageCount, setDiscoveredPage, filteredDiscoveredChats.length)}
                  </div>
                ) : (
                  botSearchQuery && (
                    <span className="mt-3 block text-xs text-muted-foreground">没有匹配的可发布机器人。点击搜索按钮向 Telegram 查询公开用户名。</span>
                  )
                )}
              </SettingsCard>
            )}

            {activeTab === "security" && (
              <>
                <SettingsCard>
                  <div className="flex gap-3 text-xs leading-relaxed text-muted-foreground">
                    <Shield className="mt-0.5 size-5 shrink-0 text-warning" />
                    <div>
                      <strong className="text-foreground">{t("auditPolicyAlert")}</strong>:{t("auditPolicyDesc")}
                    </div>
                  </div>
                </SettingsCard>

                <SettingsCard
                  title={
                    <>
                      <span>{t("keyMgmtTitle")}</span>
                      <KeyRound className="size-4 text-primary" />
                    </>
                  }
                >
                  <form onSubmit={handleCreateAccessKey} className="mb-3 flex gap-2">
                    <Input id="access-key-name" name="access-key-name" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder={t("keyNamePlaceholder")} className="h-9 rounded-xl" />
                    <Button type="submit" variant="outline" size="sm" className="shrink-0 rounded-xl" disabled={busy || !newKeyName.trim()}>
                      <KeyRound className="size-3.5" />
                      {t("generateKeyBtn")}
                    </Button>
                  </form>

                  {createdAccessKey?.key && (
                    <div className="mb-3 rounded-xl border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--success-soft)] p-3">
                      <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span>新访问密钥</span>
                        <Button variant="ghost" size="icon" className="size-7 rounded-lg" onClick={() => createdAccessKey.key && handleCopyAccessKey(createdAccessKey.key)} title={t("copyKeyBtn")}>
                          <Copy className="size-3.5" />
                        </Button>
                      </div>
                      <code className="block break-all font-mono text-xs text-foreground">{createdAccessKey.key}</code>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    {accessKeys.length === 0 ? (
                      <span className="text-xs text-muted-foreground">还没有用户访问密钥。</span>
                    ) : (
                      accessKeys.map((key) => {
                        const knownSecret = knownAccessKeySecrets[key.id] ?? key.key;
                        return (
                          <ListRow
                            key={key.id}
                            title={key.name}
                            subtitle={`${key.keyPreview} · ${key.lastLoginAt || t("neverLogin")}${key.revokedAt ? " · 已撤销" : ""}`}
                            action={
                              <div className="flex shrink-0 items-center gap-1.5">
                                <Button variant="ghost" size="icon" className="size-8 rounded-lg" disabled={!knownSecret || Boolean(key.revokedAt)} onClick={() => knownSecret && handleCopyAccessKey(knownSecret)} title={knownSecret ? t("copyKeyBtn") : t("copyKeyUnavailable")}>
                                  <Copy className="size-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="size-8 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy || Boolean(key.revokedAt)} onClick={() => runAdminAction(() => adminApiClient.revokeAccessKey(key.id), "访问密钥已撤销。")} title={t("revokeBtn")}>
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            }
                          />
                        );
                      })
                    )}
                  </div>
                </SettingsCard>
              </>
            )}

            {activeTab === "system" && (
              <SettingsCard title={<span>{t("dataRetentionPolicies")}</span>}>
                <div className="flex flex-col gap-4">
                  <FieldGroup label={t("dbRetentionPeriod")} htmlFor="retention-days">
                    <Select value={String(settings.retentionDays)} onValueChange={(v) => updateSettings({ retentionDays: parseInt(v, 10) })}>
                      <SelectTrigger className="h-9 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">{t("retention7Days")}</SelectItem>
                        <SelectItem value="30">{t("retention30Days")}</SelectItem>
                        <SelectItem value="90">{t("retention90Days")}</SelectItem>
                        <SelectItem value="0">{t("retentionPermanent")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldGroup>

                  <div className="flex items-center justify-between gap-3 rounded-xl border bg-background/40 px-3.5 py-3">
                    <div>
                      <div className="text-sm font-semibold">{t("clearDownloadCacheTitle")}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{t("clearDownloadCacheDesc")}</div>
                    </div>
                    <Button asChild variant="outline" size="sm" className="shrink-0 rounded-xl">
                      <Link to="/cache">
                        <RefreshCw className="size-3.5" />
                        查看缓存详情
                      </Link>
                    </Button>
                  </div>

                  <ArchiveRenameSettingsPanel key={settings.archiveFolderTemplate} settings={settings} updateSettings={updateSettings} setNotice={setNotice} t={t} />

                  <div className="flex items-center justify-between gap-3 rounded-xl border bg-background/40 px-3.5 py-3">
                    <div>
                      <div className="text-sm font-semibold">{t("devDebugMode")}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{t("exposesDecksLogs")}</div>
                    </div>
                    <Switch checked={settings.debugMode} onCheckedChange={() => updateSettings({ debugMode: !settings.debugMode })} />
                  </div>
                </div>
              </SettingsCard>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
