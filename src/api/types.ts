export type BotSummary = {
  id: string;
  telegramChatId: string;
  username?: string;
  title: string;
  avatarUrl?: string;
  lastMessagePreview?: string;
  unreadCount: number;
  isPinned?: boolean;
  status: "available" | "restricted" | "unknown";
};

export type BotCommand = {
  command: string;
  description: string;
};

export type InternalUser = {
  id: string;
  displayName: string;
};

export type TelegramEntity = {
  type:
    | "bold"
    | "italic"
    | "underline"
    | "strikethrough"
    | "code"
    | "pre"
    | "text_link"
    | "mention"
    | "custom_emoji"
    | "spoiler"
    | "blockquote"
    | "unknown";
  offsetUtf16: number;
  lengthUtf16: number;
  url?: string;
  language?: string;
  customEmojiId?: string;
};

export type MessageMedia =
  | { kind: "photo"; fileId: string; thumbnailUrl?: string; width?: number; height?: number }
  | { kind: "video"; fileId: string; thumbnailUrl?: string; durationSec?: number; width?: number; height?: number }
  | { kind: "audio"; fileId: string; durationSec?: number; title?: string; performer?: string }
  | { kind: "voice"; fileId: string; durationSec?: number; waveform?: number[] }
  | { kind: "document"; fileId: string; fileName?: string; mimeType?: string; sizeBytes?: number }
  | { kind: "sticker"; fileId: string; emoji?: string; thumbnailUrl?: string }
  | { kind: "animation"; fileId: string; thumbnailUrl?: string; durationSec?: number }
  | { kind: "location"; latitude: number; longitude: number }
  | { kind: "unknown"; fileId?: string; label: string };

export type ChatMessage = {
  id: string;
  telegramMessageId?: string;
  botId: string;
  direction: "incoming" | "outgoing" | "system";
  text?: string;
  entities: TelegramEntity[];
  media?: MessageMedia[];
  sentByInternalUser?: InternalUser;
  status: "pending" | "sent" | "failed" | "received" | "edited" | "deleted";
  createdAt: string;
  editedAt?: string;
  replyToMessageId?: string;
  rawAvailable?: boolean;
  inlineKeyboard?: {
    inline_keyboard: Array<Array<{
      text: string;
      url?: string;
      callback_data?: string;
    }>>;
  };
};

export type PendingDraft = {
  id: string;
  botId: string;
  draftId: string;
  text: string;
  entities: TelegramEntity[];
  sentByInternalUser?: InternalUser;
  receivedAt: string;
  expiresAt?: string;
  replacesDraftId?: string;
};

export type DownloadItem = {
  id: string;
  fileId: string;
  messageId?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  downloadedBytes: number;
  status: "queued" | "downloading" | "paused" | "stopped" | "ready" | "failed" | "expired";
  proxyUrl?: string;
  error?: string;
};

export type ClearDownloadCacheResponse = {
  removedFiles: number;
  removedBytes: number;
  removedDownloads: number;
  expiredDownloads: number;
};

export type DownloadCacheItem = {
  id: string;
  downloadId?: string;
  fileId: string;
  messageId?: string;
  botId?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  downloadedBytes: number;
  status?: DownloadItem["status"];
  proxyUrl?: string;
  cachedBytes: number;
  serverFileExists: boolean;
  updatedAt: string;
};

export type DownloadCacheSummary = {
  totalCachedFiles: number;
  totalCachedBytes: number;
  cleanupIntervalHours: number;
  items: DownloadCacheItem[];
};

export type AccessKey = {
  id: string;
  key?: string;
  keyPreview: string;
  name: string;
  createdAt: string;
  lastLoginAt?: string;
  revokedAt?: string;
};

export type AuthRole = "admin" | "user";

export type AuthUser = {
  id: string;
  displayName: string;
  role: AuthRole;
  accessKeyId?: string;
  accessKeyName?: string;
};

export type AuthLoginResponse = {
  token: string;
  user: AuthUser;
};

export type MeResponse = {
  id: string;
  displayName: string;
  role?: AuthRole;
};

export type AdminLoginRequest = {
  password: string;
};

export type AccessKeyLoginRequest = {
  accessKey: string;
};

export type CreateAccessKeyRequest = {
  name: string;
};

export type SendMessageRequest = {
  clientRequestId: string;
  text: string;
  entities?: TelegramEntity[];
  replyToMessageId?: string;
  attachmentIds?: string[];
  sentByAccessKeyName?: string; // key label audit trace
};

export type InlineKeyboardClickRequest = {
  callbackData: string;
};

export type InlineKeyboardClickResponse = {
  text?: string;
  showAlert: boolean;
  url?: string;
};

export type Settings = {
  sharedAccountPhone: string;
  sharedAccountStatus: "connected" | "disconnected" | "connecting";
  tdlibStatus: "running" | "stopped" | "error";
  retentionDays: number;
  debugMode: boolean;
  cacheCleanupIntervalHours: number;
};

export type BaseEvent = {
  eventId: string;
  botId?: string;
  occurredAt: string;
};

export type AppEvent =
  | (BaseEvent & { type: "connection.status"; status: "connecting" | "connected" | "reconnecting" | "offline"; detail?: string })
  | (BaseEvent & { type: "telegram.auth_state"; authState: TelegramAuthState; tdlibState: TdlibRuntimeState; qrLink?: string })
  | (BaseEvent & { type: "bot.published"; bot: BotSummary })
  | (BaseEvent & { type: "bot.updated"; bot: BotSummary })
  | (BaseEvent & { type: "bot.unpublished"; botId: string })
  | (BaseEvent & { type: "message.new"; message: ChatMessage })
  | (BaseEvent & { type: "message.edited"; message: ChatMessage })
  | (BaseEvent & { type: "message.deleted"; messageId: string })
  | (BaseEvent & { type: "message.send_ack"; clientRequestId: string; messageId?: string })
  | (BaseEvent & { type: "message.send_failed"; clientRequestId: string; error: string })
  | (BaseEvent & { type: "draft.pending"; draft: PendingDraft })
  | (BaseEvent & { type: "draft.expired"; draftId: string })
  | (BaseEvent & { type: "draft.finalized"; draftId: string; finalMessageId: string })
  | (BaseEvent & { type: "download.progress"; download: DownloadItem })
  | (BaseEvent & { type: "download.ready"; download: DownloadItem })
  | (BaseEvent & { type: "download.failed"; download: DownloadItem })
  | (BaseEvent & { type: "download.deleted"; downloadId: string; fileId: string; messageId?: string })
  | (BaseEvent & { type: "download_queue.item_updated"; item: QueueItem })
  | (BaseEvent & { type: "download_queue.cleared" })
  | (BaseEvent & { type: "file.new"; file: WorkspaceFile })
  | (BaseEvent & { type: "telegram.error"; code?: string; message: string; raw?: unknown });

export type WorkspaceFile = {
  id: string;
  botId: string;
  messageId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  senderName: string;
  receivedAt: string;
  status: "pending" | "approved" | "rejected";
  tag?: string;
  thumbnailUrl?: string;
};

export type TelegramAuthState =
  | "not_configured"
  | "tdlib_starting"
  | "needs_phone"
  | "needs_code"
  | "needs_password"
  | "needs_qr_scan"
  | "ready"
  | "reconnecting"
  | "error"
  | "logged_out";

export type TdlibRuntimeState = "stopped" | "starting" | "running" | "reconnecting" | "error";

export type TelegramSetupNextStep =
  | "configure_credentials"
  | "submit_phone"
  | "submit_code"
  | "submit_password"
  | "scan_qr"
  | "wait"
  | "ready"
  | "resolve_error";

export type TelegramStatusResponse = {
  credentialsConfigured: boolean;
  authState: TelegramAuthState;
  tdlibState: TdlibRuntimeState;
  accountPhone?: string;
  accountLabel?: string;
  lastSyncAt?: string;
  lastError?: string;
  qrLink?: string;
  nextStep: TelegramSetupNextStep;
};

export type SaveTelegramCredentialsRequest = {
  apiId: string;
  apiHash: string;
};

export type LoginPhoneRequest = {
  phoneNumber: string;
};

export type LoginCodeRequest = {
  code: string;
};

export type LoginPasswordRequest = {
  password: string;
};

export type TelegramChatKind = "bot" | "user" | "group" | "channel" | "unknown";

export type DiscoveredTelegramChat = {
  id: string;
  telegramChatId: string;
  username?: string;
  title: string;
  kind: TelegramChatKind;
  isBot: boolean;
  alreadyPublished: boolean;
  status: BotSummary["status"];
};

export type HistorySyncPolicy = "latest_only" | "last_n" | "full_available_history";

export type PublishedBot = {
  id: string;
  telegramChatId: string;
  username?: string;
  title: string;
  displayTitle?: string;
  enabled: boolean;
  isPinned: boolean;
  sortOrder: number;
  historySyncPolicy: HistorySyncPolicy;
  status: BotSummary["status"];
};

export type PublishBotRequest = {
  telegramChatId: string;
  displayTitle?: string;
  enabled?: boolean;
  isPinned?: boolean;
  sortOrder?: number;
  historySyncPolicy?: HistorySyncPolicy;
};

export type PatchPublishedBotRequest = Partial<Omit<PublishBotRequest, "telegramChatId">>;

export type QobuzStoreRegion = {
  code: string;
  country: string;
  language: string;
  label: string;
};

export type QobuzAlbumSearchItem = {
  id: string;
  title: string;
  artist?: string;
  albumUrl: string;
  coverUrl?: string;
  price?: string;
  currency?: string;
  releaseDateDisplay?: string;
  genre?: string;
  trackCount?: number;
  quality?: string;
  bitDepth?: number;
  sampleRate?: string;
};

export type QobuzAlbumSearchResponse = {
  region: QobuzStoreRegion;
  query: string;
  page: number;
  perPage: number;
  total?: number;
  totalPages?: number;
  sourceUrl: string;
  albums: QobuzAlbumSearchItem[];
};

export type QueueItem = {
  id: string;
  albumId: string;
  title: string;
  artist: string;
  coverUrl?: string;
  albumUrl: string;
  status: "queued" | "downloading" | "completed" | "failed";
  targetBotId?: string;
  clientRequestId?: string;
  addedAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  logs: string[];
};

export type EnqueueDownloadQueueRequest = {
  albumId: string;
  title: string;
  artist?: string;
  coverUrl?: string;
  albumUrl: string;
};
