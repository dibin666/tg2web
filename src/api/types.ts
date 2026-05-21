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
  status: "queued" | "downloading" | "ready" | "failed" | "expired";
  proxyUrl?: string;
  error?: string;
};

export type SendMessageRequest = {
  clientRequestId: string;
  text: string;
  entities?: TelegramEntity[];
  replyToMessageId?: string;
  attachmentIds?: string[];
};

export type Settings = {
  sharedAccountPhone: string;
  sharedAccountStatus: "connected" | "disconnected" | "connecting";
  tdlibStatus: "running" | "stopped" | "error";
  retentionDays: number;
  debugMode: boolean;
};

export type BaseEvent = {
  eventId: string;
  botId?: string;
  occurredAt: string;
};

export type AppEvent =
  | (BaseEvent & { type: "connection.status"; status: "connecting" | "connected" | "reconnecting" | "offline"; detail?: string })
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
  | (BaseEvent & { type: "telegram.error"; code?: string; message: string; raw?: unknown });
