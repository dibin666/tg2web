use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const DEFAULT_ARCHIVE_FOLDER_TEMPLATE: &str =
    "{artist} - {album} ({year}) [WEB][{format} {bitDepth}B-{sampleRate}kHz]";
pub const MAX_ARCHIVE_FOLDER_TEMPLATE_LEN: usize = 240;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum BotStatus {
    Available,
    Restricted,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BotSummary {
    pub id: String,
    pub telegram_chat_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_message_preview: Option<String>,
    pub unread_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_pinned: Option<bool>,
    pub status: BotStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InternalUser {
    pub id: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TelegramEntityType {
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Code,
    Pre,
    TextLink,
    Mention,
    CustomEmoji,
    Spoiler,
    Blockquote,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TelegramEntity {
    #[serde(rename = "type")]
    pub entity_type: TelegramEntityType,
    pub offset_utf16: u32,
    pub length_utf16: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_emoji_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum MessageMedia {
    Photo {
        file_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        thumbnail_url: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        width: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        height: Option<u32>,
    },
    Video {
        file_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        thumbnail_url: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        duration_sec: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        width: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        height: Option<u32>,
    },
    Audio {
        file_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        duration_sec: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        title: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        performer: Option<String>,
    },
    Voice {
        file_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        duration_sec: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        waveform: Option<Vec<u8>>,
    },
    Document {
        file_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        file_name: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        mime_type: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        size_bytes: Option<u64>,
    },
    Sticker {
        file_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        emoji: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        thumbnail_url: Option<String>,
    },
    Animation {
        file_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        thumbnail_url: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        duration_sec: Option<u32>,
    },
    Location {
        latitude: f64,
        longitude: f64,
    },
    Unknown {
        #[serde(skip_serializing_if = "Option::is_none")]
        file_id: Option<String>,
        label: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MessageDirection {
    Incoming,
    Outgoing,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MessageStatus {
    Pending,
    Sent,
    Failed,
    Received,
    Edited,
    Deleted,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub telegram_message_id: Option<String>,
    pub bot_id: String,
    pub direction: MessageDirection,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    pub entities: Vec<TelegramEntity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media: Option<Vec<MessageMedia>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sent_by_internal_user: Option<InternalUser>,
    pub status: MessageStatus,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edited_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to_message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_available: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inline_keyboard: Option<InlineKeyboardMarkup>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InlineKeyboardMarkup {
    pub inline_keyboard: Vec<Vec<InlineKeyboardButton>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct InlineKeyboardButton {
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub callback_data: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PendingDraft {
    pub id: String,
    pub bot_id: String,
    pub draft_id: String,
    pub text: String,
    pub entities: Vec<TelegramEntity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sent_by_internal_user: Option<InternalUser>,
    pub received_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replaces_draft_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Paused,
    Stopped,
    Ready,
    Failed,
    Expired,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadItem {
    pub id: String,
    pub file_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    pub downloaded_bytes: u64,
    pub status: DownloadStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClearDownloadCacheResponse {
    pub removed_files: u64,
    pub removed_bytes: u64,
    pub removed_downloads: u64,
    pub expired_downloads: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadCacheItem {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_id: Option<String>,
    pub file_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bot_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    pub downloaded_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<DownloadStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy_url: Option<String>,
    pub cached_bytes: u64,
    pub server_file_exists: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadCacheSummary {
    pub total_cached_files: u64,
    pub total_cached_bytes: u64,
    pub cleanup_interval_hours: u16,
    pub items: Vec<DownloadCacheItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadQueueStatus {
    Queued,
    Downloading,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadQueueItem {
    pub id: String,
    pub album_id: String,
    pub title: String,
    pub artist: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<String>,
    pub album_url: String,
    pub status: DownloadQueueStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_bot_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_request_id: Option<String>,
    pub added_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
    pub updated_at: String,
    pub logs: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueDownloadQueueRequest {
    pub album_id: String,
    pub title: String,
    #[serde(default)]
    pub artist: Option<String>,
    #[serde(default)]
    pub cover_url: Option<String>,
    pub album_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AccessKey {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    pub key_preview: String,
    pub name: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_login_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revoked_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuthRole {
    Admin,
    User,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
    pub id: String,
    pub display_name: String,
    pub role: AuthRole,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_key_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_key_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthSession {
    pub token: String,
    pub user: AuthUser,
    pub issued_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthLoginResponse {
    pub token: String,
    pub user: AuthUser,
}

impl From<AuthSession> for AuthLoginResponse {
    fn from(session: AuthSession) -> Self {
        Self {
            token: session.token,
            user: session.user,
        }
    }
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AdminLoginRequest {
    pub password: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AccessKeyLoginRequest {
    pub access_key: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreateAccessKeyRequest {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    pub client_request_id: String,
    pub text: String,
    #[serde(default)]
    pub entities: Vec<TelegramEntity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to_message_id: Option<String>,
    #[serde(default)]
    pub attachment_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sent_by_access_key_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InlineKeyboardClickRequest {
    pub callback_data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InlineKeyboardClickResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    pub show_alert: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BotCommand {
    pub command: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SharedAccountStatus {
    Connected,
    Disconnected,
    Connecting,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TdlibStatus {
    Running,
    Stopped,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub shared_account_phone: String,
    pub shared_account_status: SharedAccountStatus,
    pub tdlib_status: TdlibStatus,
    pub retention_days: u16,
    pub debug_mode: bool,
    pub cache_cleanup_interval_hours: u16,
    pub archive_folder_rename_enabled: bool,
    pub archive_folder_template: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            shared_account_phone: String::new(),
            shared_account_status: SharedAccountStatus::Disconnected,
            tdlib_status: TdlibStatus::Stopped,
            retention_days: 30,
            debug_mode: false,
            cache_cleanup_interval_hours: 0,
            archive_folder_rename_enabled: true,
            archive_folder_template: DEFAULT_ARCHIVE_FOLDER_TEMPLATE.to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFile {
    pub id: String,
    pub bot_id: String,
    pub message_id: String,
    pub file_id: String,
    pub file_name: String,
    pub mime_type: String,
    pub size_bytes: u64,
    pub sender_name: String,
    pub received_at: String,
    pub status: WorkspaceFileStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceFileStatus {
    Pending,
    Approved,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: String,
    pub service: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MeResponse {
    pub id: String,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<AuthRole>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all_fields = "camelCase")]
pub enum AppEvent {
    #[serde(rename = "connection.status")]
    ConnectionStatus {
        event_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        bot_id: Option<String>,
        occurred_at: String,
        status: ConnectionStatus,
        #[serde(skip_serializing_if = "Option::is_none")]
        detail: Option<String>,
    },
    #[serde(rename = "telegram.auth_state")]
    TelegramAuthState {
        event_id: String,
        occurred_at: String,
        auth_state: TelegramAuthState,
        tdlib_state: TdlibRuntimeState,
        #[serde(skip_serializing_if = "Option::is_none")]
        qr_link: Option<String>,
    },
    #[serde(rename = "bot.published")]
    BotPublished {
        event_id: String,
        occurred_at: String,
        bot: BotSummary,
    },
    #[serde(rename = "bot.updated")]
    BotUpdated {
        event_id: String,
        occurred_at: String,
        bot: BotSummary,
    },
    #[serde(rename = "bot.unpublished")]
    BotUnpublished {
        event_id: String,
        occurred_at: String,
        bot_id: String,
    },
    #[serde(rename = "message.new")]
    MessageNew {
        event_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        bot_id: Option<String>,
        occurred_at: String,
        message: ChatMessage,
    },
    #[serde(rename = "message.edited")]
    MessageEdited {
        event_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        bot_id: Option<String>,
        occurred_at: String,
        message: ChatMessage,
    },
    #[serde(rename = "message.deleted")]
    MessageDeleted {
        event_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        bot_id: Option<String>,
        occurred_at: String,
        message_id: String,
    },
    #[serde(rename = "message.send_ack")]
    MessageSendAck {
        event_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        bot_id: Option<String>,
        occurred_at: String,
        client_request_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        message_id: Option<String>,
    },
    #[serde(rename = "message.send_failed")]
    MessageSendFailed {
        event_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        bot_id: Option<String>,
        occurred_at: String,
        client_request_id: String,
        error: String,
    },
    #[serde(rename = "draft.pending")]
    DraftPending {
        event_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        bot_id: Option<String>,
        occurred_at: String,
        draft: PendingDraft,
    },
    #[serde(rename = "draft.expired")]
    DraftExpired {
        event_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        bot_id: Option<String>,
        occurred_at: String,
        draft_id: String,
    },
    #[serde(rename = "draft.finalized")]
    DraftFinalized {
        event_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        bot_id: Option<String>,
        occurred_at: String,
        draft_id: String,
        final_message_id: String,
    },
    #[serde(rename = "download.progress")]
    DownloadProgress {
        event_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        bot_id: Option<String>,
        occurred_at: String,
        download: DownloadItem,
    },
    #[serde(rename = "download.ready")]
    DownloadReady {
        event_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        bot_id: Option<String>,
        occurred_at: String,
        download: DownloadItem,
    },
    #[serde(rename = "download.failed")]
    DownloadFailed {
        event_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        bot_id: Option<String>,
        occurred_at: String,
        download: DownloadItem,
    },
    #[serde(rename = "download.deleted")]
    DownloadDeleted {
        event_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        bot_id: Option<String>,
        occurred_at: String,
        download_id: String,
        file_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        message_id: Option<String>,
    },
    #[serde(rename = "download_queue.item_updated")]
    DownloadQueueItemUpdated {
        event_id: String,
        occurred_at: String,
        item: DownloadQueueItem,
    },
    #[serde(rename = "download_queue.cleared")]
    DownloadQueueCleared {
        event_id: String,
        occurred_at: String,
    },
    #[serde(rename = "file.new")]
    FileNew {
        event_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        bot_id: Option<String>,
        occurred_at: String,
        file: WorkspaceFile,
    },
    #[serde(rename = "telegram.error")]
    TelegramError {
        event_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        bot_id: Option<String>,
        occurred_at: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        code: Option<String>,
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        raw: Option<serde_json::Value>,
    },
}

impl AppEvent {
    pub fn connection(status: ConnectionStatus, detail: Option<String>) -> Self {
        Self::ConnectionStatus {
            event_id: new_event_id(),
            bot_id: None,
            occurred_at: now_rfc3339(),
            status,
            detail,
        }
    }

    pub fn event_id(&self) -> &str {
        match self {
            AppEvent::ConnectionStatus { event_id, .. }
            | AppEvent::TelegramAuthState { event_id, .. }
            | AppEvent::BotPublished { event_id, .. }
            | AppEvent::BotUpdated { event_id, .. }
            | AppEvent::BotUnpublished { event_id, .. }
            | AppEvent::MessageNew { event_id, .. }
            | AppEvent::MessageEdited { event_id, .. }
            | AppEvent::MessageDeleted { event_id, .. }
            | AppEvent::MessageSendAck { event_id, .. }
            | AppEvent::MessageSendFailed { event_id, .. }
            | AppEvent::DraftPending { event_id, .. }
            | AppEvent::DraftExpired { event_id, .. }
            | AppEvent::DraftFinalized { event_id, .. }
            | AppEvent::DownloadProgress { event_id, .. }
            | AppEvent::DownloadReady { event_id, .. }
            | AppEvent::DownloadFailed { event_id, .. }
            | AppEvent::DownloadDeleted { event_id, .. }
            | AppEvent::DownloadQueueItemUpdated { event_id, .. }
            | AppEvent::DownloadQueueCleared { event_id, .. }
            | AppEvent::FileNew { event_id, .. }
            | AppEvent::TelegramError { event_id, .. } => event_id,
        }
    }

    pub fn bot_id(&self) -> Option<&str> {
        match self {
            AppEvent::ConnectionStatus { bot_id, .. }
            | AppEvent::MessageNew { bot_id, .. }
            | AppEvent::MessageEdited { bot_id, .. }
            | AppEvent::MessageDeleted { bot_id, .. }
            | AppEvent::MessageSendAck { bot_id, .. }
            | AppEvent::MessageSendFailed { bot_id, .. }
            | AppEvent::DraftPending { bot_id, .. }
            | AppEvent::DraftExpired { bot_id, .. }
            | AppEvent::DraftFinalized { bot_id, .. }
            | AppEvent::DownloadProgress { bot_id, .. }
            | AppEvent::DownloadReady { bot_id, .. }
            | AppEvent::DownloadFailed { bot_id, .. }
            | AppEvent::DownloadDeleted { bot_id, .. }
            | AppEvent::FileNew { bot_id, .. }
            | AppEvent::TelegramError { bot_id, .. } => bot_id.as_deref(),
            AppEvent::BotPublished { bot, .. } | AppEvent::BotUpdated { bot, .. } => {
                Some(bot.id.as_str())
            }
            AppEvent::BotUnpublished { bot_id, .. } => Some(bot_id.as_str()),
            AppEvent::TelegramAuthState { .. }
            | AppEvent::DownloadQueueItemUpdated { .. }
            | AppEvent::DownloadQueueCleared { .. } => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionStatus {
    Connecting,
    Connected,
    Reconnecting,
    Offline,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TelegramAuthState {
    NotConfigured,
    TdlibStarting,
    NeedsPhone,
    NeedsCode,
    NeedsPassword,
    NeedsQrScan,
    Ready,
    Reconnecting,
    Error,
    LoggedOut,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TdlibRuntimeState {
    Stopped,
    Starting,
    Running,
    Reconnecting,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TelegramSetupNextStep {
    ConfigureCredentials,
    SubmitPhone,
    SubmitCode,
    SubmitPassword,
    ScanQr,
    Wait,
    Ready,
    ResolveError,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TelegramStatusResponse {
    pub credentials_configured: bool,
    pub auth_state: TelegramAuthState,
    pub tdlib_state: TdlibRuntimeState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_phone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_sync_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qr_link: Option<String>,
    pub next_step: TelegramSetupNextStep,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SaveTelegramCredentialsRequest {
    pub api_id: String,
    pub api_hash: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LoginPhoneRequest {
    pub phone_number: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LoginCodeRequest {
    pub code: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LoginPasswordRequest {
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredTelegramChat {
    pub id: String,
    pub telegram_chat_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    pub title: String,
    pub kind: TelegramChatKind,
    pub is_bot: bool,
    pub already_published: bool,
    pub status: BotStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TelegramChatKind {
    Bot,
    User,
    Group,
    Channel,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HistorySyncPolicy {
    LatestOnly,
    LastN,
    FullAvailableHistory,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PublishedBot {
    pub id: String,
    pub telegram_chat_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_title: Option<String>,
    pub enabled: bool,
    pub is_pinned: bool,
    pub sort_order: i32,
    pub history_sync_policy: HistorySyncPolicy,
    pub status: BotStatus,
}

impl PublishedBot {
    pub fn summary(&self) -> BotSummary {
        BotSummary {
            id: self.id.clone(),
            telegram_chat_id: self.telegram_chat_id.clone(),
            username: self.username.clone(),
            title: self
                .display_title
                .clone()
                .unwrap_or_else(|| self.title.clone()),
            avatar_url: None,
            last_message_preview: None,
            unread_count: 0,
            is_pinned: Some(self.is_pinned),
            status: self.status.clone(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PublishBotRequest {
    pub telegram_chat_id: String,
    #[serde(default)]
    pub display_title: Option<String>,
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub is_pinned: Option<bool>,
    #[serde(default)]
    pub sort_order: Option<i32>,
    #[serde(default)]
    pub history_sync_policy: Option<HistorySyncPolicy>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PatchPublishedBotRequest {
    #[serde(default)]
    pub display_title: Option<String>,
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub is_pinned: Option<bool>,
    #[serde(default)]
    pub sort_order: Option<i32>,
    #[serde(default)]
    pub history_sync_policy: Option<HistorySyncPolicy>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchUsernameRequest {
    pub username: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    #[serde(default)]
    pub retention_days: Option<u16>,
    #[serde(default)]
    pub debug_mode: Option<bool>,
    #[serde(default)]
    pub cache_cleanup_interval_hours: Option<u16>,
    #[serde(default)]
    pub archive_folder_rename_enabled: Option<bool>,
    #[serde(default)]
    pub archive_folder_template: Option<String>,
}

impl SettingsPatch {
    pub fn has_admin_only_fields(&self) -> bool {
        self.retention_days.is_some()
            || self.debug_mode.is_some()
            || self.cache_cleanup_interval_hours.is_some()
    }
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TriggerDownloadRequest {
    pub file_id: String,
    #[serde(default)]
    pub message_id: Option<String>,
    #[serde(default)]
    pub file_name: Option<String>,
    #[serde(default)]
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QobuzStoreRegion {
    pub code: String,
    pub country: String,
    pub language: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QobuzAlbumSearchItem {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    pub album_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_date_display: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bit_depth: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sample_rate: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QobuzAlbumSearchResponse {
    pub region: QobuzStoreRegion,
    pub query: String,
    pub page: u32,
    pub per_page: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_pages: Option<u32>,
    pub source_url: String,
    pub albums: Vec<QobuzAlbumSearchItem>,
}

pub fn now_rfc3339() -> String {
    Utc::now().to_rfc3339()
}

pub fn new_event_id() -> String {
    format!("ev_{}", Uuid::new_v4())
}

pub fn new_id(prefix: &str) -> String {
    format!("{prefix}_{}", Uuid::new_v4())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn settings_serialize_with_frontend_field_names() {
        let value = serde_json::to_value(Settings::default()).expect("serialize settings");

        assert_eq!(value["sharedAccountPhone"], json!(""));
        assert_eq!(value["sharedAccountStatus"], json!("disconnected"));
        assert_eq!(value["tdlibStatus"], json!("stopped"));
        assert_eq!(value["retentionDays"], json!(30));
        assert_eq!(value["debugMode"], json!(false));
    }

    #[test]
    fn media_uses_kind_discriminator_and_camel_case_fields() {
        let media = MessageMedia::Document {
            file_id: "file_1".to_string(),
            file_name: Some("report.pdf".to_string()),
            mime_type: Some("application/pdf".to_string()),
            size_bytes: Some(1024),
        };

        let value = serde_json::to_value(media).expect("serialize media");

        assert_eq!(value["kind"], json!("document"));
        assert_eq!(value["fileId"], json!("file_1"));
        assert_eq!(value["fileName"], json!("report.pdf"));
        assert_eq!(value["sizeBytes"], json!(1024));
    }
}
