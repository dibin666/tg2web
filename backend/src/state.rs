use crate::{
    auth::AuthService,
    config::AppConfig,
    error::{AppError, AppResult},
    models::{
        new_event_id, new_id, now_rfc3339, AccessKey, AppEvent, AuthSession, BotCommand, BotStatus,
        BotSummary, ChatMessage, ClearDownloadCacheResponse, ConnectionStatus,
        CreateAccessKeyRequest, DiscoveredTelegramChat, DownloadCacheItem, DownloadCacheSummary,
        DownloadItem, DownloadStatus, HistorySyncPolicy, InlineKeyboardClickRequest,
        InlineKeyboardClickResponse, InlineKeyboardMarkup, InternalUser, MeResponse,
        MessageDirection, MessageMedia, MessageStatus, PendingDraft, PublishedBot,
        SendMessageRequest, Settings, SettingsPatch, TdlibRuntimeState, TelegramAuthState,
        TelegramChatKind, TelegramEntity, TelegramEntityType, TelegramSetupNextStep,
        TelegramStatusResponse, TriggerDownloadRequest, WorkspaceFile, WorkspaceFileStatus,
    },
    storage,
    telegram::{TdJsonRuntimeEvent, TelegramBridge, TelegramCredentials},
};
use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::Path,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::{broadcast, RwLock};

const TELEGRAM_API_HASH_SECRET: &str = "telegram_api_hash";
const EVENT_REPLAY_LIMIT: usize = 500;
const DEFAULT_PENDING_DRAFT_TTL_SECONDS: i64 = 30;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub db: SqlitePool,
    pub auth: AuthService,
    telegram_bridge: TelegramBridge,
    runtime: Arc<RwLock<RuntimeState>>,
    events: broadcast::Sender<AppEvent>,
    event_log: Arc<Mutex<VecDeque<AppEvent>>>,
}

#[derive(Debug, Clone, Default)]
struct RuntimeState {
    settings: Settings,
    telegram: TelegramRuntime,
    discovered_chats: Vec<DiscoveredTelegramChat>,
    published_bots: Vec<PublishedBot>,
    bot_commands: HashMap<String, Vec<BotCommand>>,
    bot_command_user_ids: HashMap<String, i64>,
    downloads: Vec<DownloadItem>,
    workspace_files: Vec<WorkspaceFile>,
    pending_drafts: Vec<PendingDraft>,
}

#[derive(Debug, Clone)]
struct TelegramRuntime {
    credentials_configured: bool,
    auth_state: TelegramAuthState,
    tdlib_state: TdlibRuntimeState,
    account_phone: Option<String>,
    account_label: Option<String>,
    last_sync_at: Option<String>,
    last_error: Option<String>,
    qr_link: Option<String>,
}

#[derive(Debug, Clone)]
struct DownloadMessageContext {
    telegram_chat_id: i64,
    telegram_message_id: i64,
}

#[derive(Debug, Clone)]
struct DownloadMessageExtra {
    download_id: String,
    requested_file_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TdjsonDownloadFileRole {
    Main,
    Thumbnail,
}

#[derive(Debug, Clone)]
struct TdjsonDownloadFileCandidate {
    file_id: String,
    role: TdjsonDownloadFileRole,
    file: Value,
}

impl Default for TelegramRuntime {
    fn default() -> Self {
        Self {
            credentials_configured: false,
            auth_state: TelegramAuthState::NotConfigured,
            tdlib_state: TdlibRuntimeState::Stopped,
            account_phone: None,
            account_label: None,
            last_sync_at: None,
            last_error: None,
            qr_link: None,
        }
    }
}

impl RuntimeState {
    async fn load(db: &SqlitePool) -> AppResult<Self> {
        let settings = load_settings(db).await?;
        let published_bots = load_published_bots(db).await?;
        let discovered_chats = load_discovered_chats(db, &published_bots).await?;
        let downloads = load_downloads(db).await?;
        let workspace_files = load_workspace_files(db).await?;

        Ok(Self {
            settings,
            telegram: TelegramRuntime::load(db).await?,
            discovered_chats,
            published_bots,
            downloads,
            workspace_files,
            ..Self::default()
        })
    }
}

impl TelegramRuntime {
    async fn load(db: &SqlitePool) -> AppResult<Self> {
        let credentials = sqlx::query(
            "SELECT c.api_id, c.api_hash_secret_ref, s.value AS api_hash \
             FROM telegram_credentials c \
             LEFT JOIN telegram_secret_values s ON s.name = c.api_hash_secret_ref \
             WHERE c.id = 1",
        )
        .fetch_optional(db)
        .await?;

        let credentials_configured = credentials.as_ref().is_some_and(|row| {
            let api_id = row.try_get::<Option<String>, _>("api_id").ok().flatten();
            let api_hash = row.try_get::<Option<String>, _>("api_hash").ok().flatten();
            api_id.is_some_and(|value| !value.trim().is_empty())
                && api_hash.is_some_and(|value| !value.trim().is_empty())
        });

        let mut runtime = Self {
            credentials_configured,
            auth_state: if credentials_configured {
                TelegramAuthState::NeedsPhone
            } else {
                TelegramAuthState::NotConfigured
            },
            ..Self::default()
        };

        if let Some(row) = sqlx::query(
            "SELECT state, tdlib_state, account_phone, account_label, last_sync_at, last_error \
             FROM telegram_auth_state WHERE id = 1",
        )
        .fetch_optional(db)
        .await?
        {
            runtime.auth_state = if credentials_configured {
                telegram_auth_state_from_db(row.try_get::<String, _>("state")?.as_str())
            } else {
                TelegramAuthState::NotConfigured
            };
            runtime.tdlib_state =
                tdlib_runtime_state_from_db(row.try_get::<String, _>("tdlib_state")?.as_str());
            runtime.account_phone = row.try_get("account_phone")?;
            runtime.account_label = row.try_get("account_label")?;
            runtime.last_sync_at = row.try_get("last_sync_at")?;
            runtime.last_error = row.try_get("last_error")?;
        }

        Ok(runtime)
    }

    async fn persist(&self, db: &SqlitePool) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO telegram_auth_state \
             (id, state, tdlib_state, account_phone, account_label, last_sync_at, last_error, updated_at) \
             VALUES (1, ?, ?, ?, ?, ?, ?, ?) \
             ON CONFLICT(id) DO UPDATE SET \
             state = excluded.state, \
             tdlib_state = excluded.tdlib_state, \
             account_phone = excluded.account_phone, \
             account_label = excluded.account_label, \
             last_sync_at = excluded.last_sync_at, \
             last_error = excluded.last_error, \
             updated_at = excluded.updated_at",
        )
        .bind(telegram_auth_state_to_db(&self.auth_state))
        .bind(tdlib_runtime_state_to_db(&self.tdlib_state))
        .bind(&self.account_phone)
        .bind(&self.account_label)
        .bind(&self.last_sync_at)
        .bind(&self.last_error)
        .bind(now_rfc3339())
        .execute(db)
        .await?;
        Ok(())
    }
}

async fn load_published_bots(db: &SqlitePool) -> AppResult<Vec<PublishedBot>> {
    let rows = sqlx::query(
        "SELECT id, telegram_chat_id, username, title, display_title, enabled, is_pinned, sort_order, history_sync_policy, status \
         FROM published_bots ORDER BY is_pinned DESC, sort_order ASC, title COLLATE NOCASE ASC",
    )
    .fetch_all(db)
    .await?;

    rows.into_iter()
        .map(|row| {
            Ok(PublishedBot {
                id: row.try_get("id")?,
                telegram_chat_id: row.try_get("telegram_chat_id")?,
                username: row.try_get("username")?,
                title: row.try_get("title")?,
                display_title: row.try_get("display_title")?,
                enabled: row.try_get::<i64, _>("enabled")? != 0,
                is_pinned: row.try_get::<i64, _>("is_pinned")? != 0,
                sort_order: row.try_get("sort_order")?,
                history_sync_policy: history_sync_policy_from_db(
                    row.try_get::<String, _>("history_sync_policy")?.as_str(),
                ),
                status: bot_status_from_db(row.try_get::<String, _>("status")?.as_str()),
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()
        .map_err(AppError::from)
}

async fn load_discovered_chats(
    db: &SqlitePool,
    published_bots: &[PublishedBot],
) -> AppResult<Vec<DiscoveredTelegramChat>> {
    let rows = sqlx::query(
        "SELECT telegram_chat_id, username, title, kind, is_bot, status \
         FROM discovered_telegram_chats ORDER BY is_bot DESC, title COLLATE NOCASE ASC",
    )
    .fetch_all(db)
    .await?;

    rows.into_iter()
        .map(|row| {
            let telegram_chat_id: String = row.try_get("telegram_chat_id")?;
            Ok(DiscoveredTelegramChat {
                id: telegram_chat_id.clone(),
                already_published: published_bots
                    .iter()
                    .any(|bot| bot.telegram_chat_id == telegram_chat_id),
                telegram_chat_id,
                username: row.try_get("username")?,
                title: row.try_get("title")?,
                kind: telegram_chat_kind_from_db(row.try_get::<String, _>("kind")?.as_str()),
                is_bot: row.try_get::<i64, _>("is_bot")? != 0,
                status: bot_status_from_db(row.try_get::<String, _>("status")?.as_str()),
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()
        .map_err(AppError::from)
}

async fn load_downloads(db: &SqlitePool) -> AppResult<Vec<DownloadItem>> {
    let rows = sqlx::query(
        "SELECT id, file_id, message_id, file_name, mime_type, size_bytes, downloaded_bytes, status, error \
         FROM downloads ORDER BY updated_at DESC, created_at DESC",
    )
    .fetch_all(db)
    .await?;

    rows.into_iter().map(download_from_row).collect()
}

async fn load_settings(db: &SqlitePool) -> AppResult<Settings> {
    let mut settings = Settings::default();
    let rows = sqlx::query("SELECT key, value FROM app_settings")
        .fetch_all(db)
        .await?;

    for row in rows {
        let key: String = row.try_get("key")?;
        let value: String = row.try_get("value")?;
        match key.as_str() {
            "retention_days" => {
                if let Ok(retention_days) = value.parse::<u16>() {
                    settings.retention_days = retention_days;
                }
            }
            "debug_mode" => {
                settings.debug_mode = matches!(value.as_str(), "1" | "true" | "yes");
            }
            "cache_cleanup_interval_hours" => {
                if let Ok(interval) = value.parse::<u16>() {
                    settings.cache_cleanup_interval_hours = interval;
                }
            }
            _ => {}
        }
    }

    Ok(settings)
}

async fn persist_app_setting(
    db: &SqlitePool,
    key: &str,
    value: &str,
    updated_at: &str,
) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(key)
    .bind(value)
    .bind(updated_at)
    .execute(db)
    .await?;
    Ok(())
}

async fn app_setting(db: &SqlitePool, key: &str) -> AppResult<Option<String>> {
    sqlx::query("SELECT value FROM app_settings WHERE key = ? LIMIT 1")
        .bind(key)
        .fetch_optional(db)
        .await?
        .map(|row| row.try_get("value"))
        .transpose()
        .map_err(AppError::from)
}

async fn load_workspace_files(db: &SqlitePool) -> AppResult<Vec<WorkspaceFile>> {
    let rows = sqlx::query(
        "SELECT id, bot_id, message_id, file_id, file_name, mime_type, size_bytes, sender_name, \
         received_at, status, tag, thumbnail_url \
         FROM workspace_files ORDER BY received_at DESC, id DESC",
    )
    .fetch_all(db)
    .await?;

    rows.into_iter().map(workspace_file_from_row).collect()
}

impl AppState {
    pub async fn new(config: AppConfig) -> AppResult<Self> {
        tokio::fs::create_dir_all(&config.media_cache_path).await?;
        tokio::fs::create_dir_all(&config.tdlib_database_path).await?;
        let db = storage::connect(&config.database_path).await?;
        let (events, _) = broadcast::channel(512);
        let auth = AuthService::new();
        auth.initialize_admin(&db).await?;
        let runtime = RuntimeState::load(&db).await?;
        let telegram_bridge = TelegramBridge::new(&config);

        tracing::info!(
            database_path = %config.database_path.display(),
            media_cache_path = %config.media_cache_path.display(),
            tdlib_database_path = %config.tdlib_database_path.display(),
            tdlib_engine = "tdlib-rs/download-tdlib",
            tdlib_encryption_key_ref_configured = config.tdlib_encryption_key_ref.is_some(),
            admin_password_configured = config.admin_password_configured,
            "backend storage paths configured"
        );

        let state = Self {
            config: Arc::new(config),
            db,
            auth,
            telegram_bridge,
            runtime: Arc::new(RwLock::new(runtime)),
            events,
            event_log: Arc::new(Mutex::new(VecDeque::with_capacity(EVENT_REPLAY_LIMIT))),
        };
        state.backfill_workspace_files_from_messages().await?;
        state.spawn_telegram_update_pump();
        state.spawn_download_recovery();
        state.spawn_cache_cleanup_scheduler();
        Ok(state)
    }

    pub fn subscribe_events(&self) -> broadcast::Receiver<AppEvent> {
        self.events.subscribe()
    }

    pub fn emit(&self, event: AppEvent) {
        if let Ok(mut event_log) = self.event_log.lock() {
            if event_log.len() >= EVENT_REPLAY_LIMIT {
                event_log.pop_front();
            }
            event_log.push_back(event.clone());
        }
        let _ = self.events.send(event);
    }

    pub fn replay_events(&self, bot_id: Option<&str>, after: Option<&str>) -> Vec<AppEvent> {
        let Ok(event_log) = self.event_log.lock() else {
            return Vec::new();
        };

        let start_index = after
            .and_then(|after| {
                event_log
                    .iter()
                    .position(|event| event.event_id() == after)
                    .map(|index| index + 1)
            })
            .unwrap_or(0);

        event_log
            .iter()
            .skip(start_index)
            .filter(|event| match bot_id {
                Some(bot_id) => event.bot_id() == Some(bot_id),
                None => true,
            })
            .cloned()
            .collect()
    }

    pub async fn replay_events_for_session(
        &self,
        session: &AuthSession,
        bot_id: Option<&str>,
        after: Option<&str>,
    ) -> Vec<AppEvent> {
        let events = self.replay_events(bot_id, after);
        let mut visible = Vec::with_capacity(events.len());

        for event in events {
            if self.event_visible_to_session(session, &event).await {
                visible.push(event);
            }
        }

        visible
    }

    pub async fn event_visible_to_session(&self, session: &AuthSession, event: &AppEvent) -> bool {
        if session.user.role == crate::models::AuthRole::Admin {
            return true;
        }

        match event {
            AppEvent::ConnectionStatus { .. }
            | AppEvent::BotPublished { .. }
            | AppEvent::BotUpdated { .. }
            | AppEvent::BotUnpublished { .. } => true,
            AppEvent::TelegramAuthState { .. } => false,
            AppEvent::MessageNew { message, .. } | AppEvent::MessageEdited { message, .. } => {
                message_visible_to_session(message, session)
            }
            AppEvent::MessageDeleted {
                bot_id, message_id, ..
            } => self
                .message_id_visible_to_session(bot_id.as_deref(), message_id, session)
                .await
                .unwrap_or(false),
            AppEvent::MessageSendAck {
                bot_id,
                client_request_id,
                ..
            }
            | AppEvent::MessageSendFailed {
                bot_id,
                client_request_id,
                ..
            } => self
                .message_id_visible_to_session(bot_id.as_deref(), client_request_id, session)
                .await
                .unwrap_or(false),
            AppEvent::DraftPending { draft, .. } => draft
                .sent_by_internal_user
                .as_ref()
                .is_some_and(|user| user.id == session.user.id),
            AppEvent::DraftExpired { .. } | AppEvent::DraftFinalized { .. } => true,
            AppEvent::DownloadProgress { download, .. }
            | AppEvent::DownloadReady { download, .. }
            | AppEvent::DownloadFailed { download, .. } => {
                if let Some(message_id) = download.message_id.as_deref() {
                    self.message_id_visible_to_session(event.bot_id(), message_id, session)
                        .await
                        .unwrap_or(false)
                } else {
                    false
                }
            }
            AppEvent::FileNew { file, .. } => self
                .message_id_visible_to_session(Some(&file.bot_id), &file.message_id, session)
                .await
                .unwrap_or(false),
            AppEvent::TelegramError { .. } => false,
        }
    }

    pub fn connection_event(&self, status: ConnectionStatus, detail: Option<String>) -> AppEvent {
        AppEvent::connection(status, detail)
    }

    pub fn database_pool_size(&self) -> u32 {
        self.db.size()
    }

    pub async fn me(&self, session: Option<&AuthSession>) -> MeResponse {
        if let Some(session) = session {
            return MeResponse {
                id: session.user.id.clone(),
                display_name: session.user.display_name.clone(),
                role: Some(session.user.role.clone()),
            };
        }

        MeResponse {
            id: "internal_user".to_string(),
            display_name: "Internal User".to_string(),
            role: None,
        }
    }

    pub async fn create_access_key(&self, request: CreateAccessKeyRequest) -> AppResult<AccessKey> {
        self.auth.create_access_key(&self.db, &request.name).await
    }

    pub async fn list_access_keys(&self) -> AppResult<Vec<AccessKey>> {
        self.auth.list_access_keys(&self.db).await
    }

    pub async fn revoke_access_key(&self, key_id: &str) -> AppResult<()> {
        self.auth.revoke_access_key(&self.db, key_id).await
    }

    pub async fn settings(&self) -> Settings {
        self.runtime.read().await.settings.clone()
    }

    pub async fn update_settings(&self, patch: SettingsPatch) -> AppResult<Settings> {
        let mut runtime = self.runtime.write().await;
        let now = now_rfc3339();

        if let Some(retention_days) = patch.retention_days {
            if retention_days > 3650 {
                return Err(AppError::bad_request(
                    "invalid_retention_days",
                    "retentionDays must be between 0 and 3650",
                ));
            }
            runtime.settings.retention_days = retention_days;
            persist_app_setting(
                &self.db,
                "retention_days",
                &retention_days.to_string(),
                &now,
            )
            .await?;
        }

        if let Some(debug_mode) = patch.debug_mode {
            runtime.settings.debug_mode = debug_mode;
            persist_app_setting(
                &self.db,
                "debug_mode",
                if debug_mode { "true" } else { "false" },
                &now,
            )
            .await?;
        }

        if let Some(interval) = patch.cache_cleanup_interval_hours {
            if interval > 8760 {
                return Err(AppError::bad_request(
                    "invalid_cache_cleanup_interval",
                    "cacheCleanupIntervalHours must be between 0 and 8760",
                ));
            }
            runtime.settings.cache_cleanup_interval_hours = interval;
            persist_app_setting(
                &self.db,
                "cache_cleanup_interval_hours",
                &interval.to_string(),
                &now,
            )
            .await?;
            persist_app_setting(&self.db, "cache_last_cleanup_at", &now, &now).await?;
        }

        Ok(runtime.settings.clone())
    }

    pub async fn telegram_status(&self) -> TelegramStatusResponse {
        let status = self.runtime.read().await.telegram.status_response();
        if status.auth_state == TelegramAuthState::Ready
            && status.tdlib_state == TdlibRuntimeState::Running
            && status.account_phone.is_none()
            && status.account_label.is_none()
        {
            if let Err(error) = self.request_telegram_account_info().await {
                tracing::debug!(%error, "failed to request Telegram account info refresh");
            }
        }
        status
    }

    pub async fn save_telegram_credentials(
        &self,
        api_id: &str,
        api_hash: &str,
    ) -> AppResult<TelegramStatusResponse> {
        if api_id.trim().is_empty() {
            return Err(AppError::bad_request("missing_api_id", "apiId is required"));
        }
        if api_hash.trim().is_empty() {
            return Err(AppError::bad_request(
                "missing_api_hash",
                "apiHash is required",
            ));
        }
        if api_id.trim().parse::<i32>().is_err() {
            return Err(AppError::bad_request(
                "invalid_api_id",
                "apiId must be a valid 32-bit Telegram API id",
            ));
        }

        let now = now_rfc3339();
        sqlx::query(
            "INSERT INTO telegram_secret_values (name, value, updated_at) VALUES (?, ?, ?) \
             ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        )
        .bind(TELEGRAM_API_HASH_SECRET)
        .bind(api_hash.trim())
        .bind(&now)
        .execute(&self.db)
        .await?;

        sqlx::query(
            "INSERT INTO telegram_credentials (id, api_id, api_hash_secret_ref, configured_at) VALUES (1, ?, ?, ?) \
             ON CONFLICT(id) DO UPDATE SET api_id = excluded.api_id, api_hash_secret_ref = excluded.api_hash_secret_ref, configured_at = excluded.configured_at",
        )
        .bind(api_id.trim())
        .bind(TELEGRAM_API_HASH_SECRET)
        .bind(&now)
        .execute(&self.db)
        .await?;

        if let Err(error) = self.telegram_bridge.reset_runtime() {
            tracing::warn!(%error, "failed to reset TDLib runtime after credentials update");
        }

        let status = {
            let mut runtime = self.runtime.write().await;
            runtime.telegram.credentials_configured = true;
            runtime.telegram.auth_state = TelegramAuthState::NeedsPhone;
            runtime.telegram.tdlib_state = TdlibRuntimeState::Stopped;
            runtime.telegram.last_error = None;
            runtime.telegram.qr_link = None;
            runtime.telegram.persist(&self.db).await?;
            runtime.telegram.status_response()
        };

        self.emit(AppEvent::TelegramAuthState {
            event_id: new_event_id(),
            occurred_at: now_rfc3339(),
            auth_state: status.auth_state.clone(),
            tdlib_state: status.tdlib_state.clone(),
            qr_link: status.qr_link.clone(),
        });

        Ok(status)
    }

    pub async fn start_telegram_phone_login(
        &self,
        phone_number: &str,
    ) -> AppResult<TelegramStatusResponse> {
        self.ensure_telegram_credentials().await?;
        if phone_number.trim().is_empty() {
            return Err(AppError::bad_request(
                "missing_phone_number",
                "phoneNumber is required",
            ));
        }

        let phone_number = phone_number.trim().to_string();
        self.execute_telegram_authorization_step(
            TelegramAuthState::TdlibStarting,
            TdlibRuntimeState::Starting,
            |bridge, credentials| bridge.start_phone_login(credentials, phone_number),
        )
        .await
    }

    pub async fn submit_telegram_login_code(
        &self,
        code: &str,
    ) -> AppResult<TelegramStatusResponse> {
        self.ensure_telegram_credentials().await?;
        if code.trim().is_empty() {
            return Err(AppError::bad_request(
                "missing_login_code",
                "code is required",
            ));
        }

        let code = code.trim().to_string();
        self.execute_telegram_authorization_step(
            TelegramAuthState::TdlibStarting,
            TdlibRuntimeState::Running,
            |bridge, credentials| bridge.submit_login_code(credentials, code),
        )
        .await
    }

    pub async fn submit_telegram_2fa_password(
        &self,
        password: &str,
    ) -> AppResult<TelegramStatusResponse> {
        self.ensure_telegram_credentials().await?;
        if password.is_empty() {
            return Err(AppError::bad_request(
                "missing_2fa_password",
                "password is required",
            ));
        }

        let password = password.to_string();
        self.execute_telegram_authorization_step(
            TelegramAuthState::TdlibStarting,
            TdlibRuntimeState::Running,
            |bridge, credentials| bridge.submit_password(credentials, password),
        )
        .await
    }

    pub async fn start_telegram_qr_login(&self) -> AppResult<TelegramStatusResponse> {
        self.execute_telegram_authorization_step(
            TelegramAuthState::NeedsQrScan,
            TdlibRuntimeState::Running,
            |bridge, credentials| bridge.start_qr_login(credentials),
        )
        .await
    }

    pub async fn reconnect_telegram(&self) -> AppResult<TelegramStatusResponse> {
        self.execute_telegram_authorization_step(
            TelegramAuthState::Reconnecting,
            TdlibRuntimeState::Reconnecting,
            |bridge, credentials| bridge.reconnect(credentials),
        )
        .await
    }

    pub async fn logout_telegram(&self) -> AppResult<TelegramStatusResponse> {
        self.ensure_telegram_credentials().await?;
        if let Err(error) = self.telegram_bridge.logout() {
            tracing::warn!(%error, "failed to enqueue TDLib logout request");
        }
        let status = {
            let mut runtime = self.runtime.write().await;
            runtime.telegram.auth_state = TelegramAuthState::LoggedOut;
            runtime.telegram.tdlib_state = TdlibRuntimeState::Stopped;
            runtime.telegram.account_phone = None;
            runtime.telegram.account_label = None;
            runtime.telegram.last_error = None;
            runtime.telegram.qr_link = None;
            runtime.telegram.persist(&self.db).await?;
            runtime.telegram.status_response()
        };
        self.emit_telegram_status(&status);
        Ok(status)
    }

    async fn execute_telegram_authorization_step<F>(
        &self,
        queued_auth_state: TelegramAuthState,
        queued_tdlib_state: TdlibRuntimeState,
        action: F,
    ) -> AppResult<TelegramStatusResponse>
    where
        F: FnOnce(&TelegramBridge, TelegramCredentials) -> AppResult<()>,
    {
        let credentials = self.telegram_credentials().await?;
        match action(&self.telegram_bridge, credentials) {
            Ok(()) => {
                self.mark_telegram_status(queued_auth_state, queued_tdlib_state, None, None)
                    .await
            }
            Err(error) => {
                self.mark_telegram_error(error.to_string()).await?;
                Err(error)
            }
        }
    }

    async fn ensure_telegram_credentials(&self) -> AppResult<()> {
        let credentials_configured = self.runtime.read().await.telegram.credentials_configured;
        if credentials_configured {
            Ok(())
        } else {
            Err(AppError::conflict(
                "telegram_credentials_required",
                "Telegram API credentials must be configured first",
            ))
        }
    }

    async fn telegram_credentials(&self) -> AppResult<TelegramCredentials> {
        self.ensure_telegram_credentials().await?;
        let row = sqlx::query(
            "SELECT c.api_id, s.value AS api_hash \
             FROM telegram_credentials c \
             LEFT JOIN telegram_secret_values s ON s.name = c.api_hash_secret_ref \
             WHERE c.id = 1",
        )
        .fetch_optional(&self.db)
        .await?;

        let Some(row) = row else {
            return Err(AppError::conflict(
                "telegram_credentials_required",
                "Telegram API credentials must be configured first",
            ));
        };

        let api_id = row
            .try_get::<Option<String>, _>("api_id")?
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                AppError::conflict(
                    "telegram_credentials_required",
                    "Telegram API id must be configured first",
                )
            })?;
        let api_hash = row
            .try_get::<Option<String>, _>("api_hash")?
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                AppError::conflict(
                    "telegram_credentials_required",
                    "Telegram API hash must be configured first",
                )
            })?;

        Ok(TelegramCredentials {
            api_id: api_id.trim().parse::<i32>().map_err(|_| {
                AppError::bad_request(
                    "invalid_api_id",
                    "apiId must be a valid 32-bit Telegram API id",
                )
            })?,
            api_hash,
        })
    }

    async fn mark_telegram_status(
        &self,
        auth_state: TelegramAuthState,
        tdlib_state: TdlibRuntimeState,
        last_error: Option<String>,
        qr_link: Option<String>,
    ) -> AppResult<TelegramStatusResponse> {
        let (status, became_ready) = {
            let mut runtime = self.runtime.write().await;
            let was_ready = runtime.telegram.auth_state == TelegramAuthState::Ready
                && runtime.telegram.tdlib_state == TdlibRuntimeState::Running;
            runtime.telegram.auth_state = auth_state;
            runtime.telegram.tdlib_state = tdlib_state;
            runtime.telegram.last_error = last_error;
            runtime.telegram.qr_link =
                if runtime.telegram.auth_state == TelegramAuthState::NeedsQrScan {
                    qr_link
                } else {
                    None
                };
            if runtime.telegram.auth_state == TelegramAuthState::Ready {
                runtime.telegram.last_sync_at = Some(now_rfc3339());
            }
            runtime.telegram.persist(&self.db).await?;
            let is_ready = runtime.telegram.auth_state == TelegramAuthState::Ready
                && runtime.telegram.tdlib_state == TdlibRuntimeState::Running;
            (runtime.telegram.status_response(), is_ready && !was_ready)
        };
        self.emit_telegram_status(&status);
        if became_ready {
            if let Err(error) = self.request_telegram_account_info().await {
                tracing::debug!(%error, "failed to request Telegram account info after authorization ready");
            }
            self.spawn_download_recovery();
        }
        Ok(status)
    }

    async fn mark_telegram_error(&self, message: String) -> AppResult<TelegramStatusResponse> {
        let status = {
            let mut runtime = self.runtime.write().await;
            runtime.telegram.auth_state = TelegramAuthState::Error;
            runtime.telegram.tdlib_state = TdlibRuntimeState::Error;
            runtime.telegram.last_error = Some(message);
            runtime.telegram.qr_link = None;
            runtime.telegram.persist(&self.db).await?;
            runtime.telegram.status_response()
        };
        self.emit_telegram_status(&status);
        Ok(status)
    }

    fn emit_telegram_status(&self, status: &TelegramStatusResponse) {
        self.emit(AppEvent::TelegramAuthState {
            event_id: new_event_id(),
            occurred_at: now_rfc3339(),
            auth_state: status.auth_state.clone(),
            tdlib_state: status.tdlib_state.clone(),
            qr_link: status.qr_link.clone(),
        });
    }

    async fn request_telegram_account_info(&self) -> AppResult<()> {
        let credentials = self.telegram_credentials().await?;
        self.telegram_bridge.send_request(
            credentials,
            json!({
                "@type": "getMe",
                "@extra": "account:self"
            }),
        )
    }

    fn spawn_telegram_update_pump(&self) {
        let mut receiver = self.telegram_bridge.subscribe_updates();
        let state = self.clone();
        tokio::spawn(async move {
            loop {
                match receiver.recv().await {
                    Ok(event) => state.handle_tdjson_event(event).await,
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        tracing::warn!(skipped, "telegram TDLib event pump lagged");
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        });
    }

    fn spawn_download_recovery(&self) {
        let state = self.clone();
        tokio::spawn(async move {
            if let Err(error) = state.recover_interrupted_downloads().await {
                tracing::warn!(%error, "failed to recover interrupted Telegram downloads");
            }
        });
    }

    fn spawn_cache_cleanup_scheduler(&self) {
        let state = self.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                if let Err(error) = state.run_due_cache_cleanup().await {
                    tracing::warn!(%error, "failed to run scheduled cache cleanup");
                }
            }
        });
    }

    async fn run_due_cache_cleanup(&self) -> AppResult<()> {
        let interval_hours = self
            .runtime
            .read()
            .await
            .settings
            .cache_cleanup_interval_hours;
        if interval_hours == 0 {
            return Ok(());
        }

        let now = Utc::now();
        let last_cleanup = app_setting(&self.db, "cache_last_cleanup_at")
            .await?
            .and_then(|value| DateTime::parse_from_rfc3339(&value).ok())
            .map(|value| value.with_timezone(&Utc));

        let Some(last_cleanup) = last_cleanup else {
            let now_string = now.to_rfc3339();
            persist_app_setting(&self.db, "cache_last_cleanup_at", &now_string, &now_string)
                .await?;
            return Ok(());
        };

        if now.signed_duration_since(last_cleanup).num_hours() < i64::from(interval_hours) {
            return Ok(());
        }

        self.clear_download_cache().await?;
        let now_string = now.to_rfc3339();
        persist_app_setting(&self.db, "cache_last_cleanup_at", &now_string, &now_string).await?;
        Ok(())
    }

    async fn recover_interrupted_downloads(&self) -> AppResult<()> {
        let downloads = {
            let runtime = self.runtime.read().await;
            runtime
                .downloads
                .iter()
                .filter(|download| {
                    matches!(
                        download.status,
                        DownloadStatus::Queued | DownloadStatus::Downloading
                    )
                })
                .cloned()
                .collect::<Vec<_>>()
        };

        for download in downloads {
            if let Err(error) = self
                .request_or_queue_download(&download.id, &download.file_id)
                .await
            {
                tracing::warn!(
                    %error,
                    download_id = %download.id,
                    file_id = %download.file_id,
                    "failed to recover one interrupted Telegram download"
                );
            }
        }

        Ok(())
    }

    async fn handle_tdjson_event(&self, event: TdJsonRuntimeEvent) {
        let result = match event {
            TdJsonRuntimeEvent::AuthorizationState {
                auth_state,
                tdlib_state,
                raw,
            } => self
                .mark_telegram_status(
                    auth_state.clone(),
                    tdlib_state,
                    None,
                    (auth_state == TelegramAuthState::NeedsQrScan)
                        .then(|| non_empty_string(raw.get("link")))
                        .flatten(),
                )
                .await
                .map(|_| ()),
            TdJsonRuntimeEvent::Update(update) => self.apply_tdjson_update(update).await,
            TdJsonRuntimeEvent::Response(response) => self.apply_tdjson_response(response).await,
            TdJsonRuntimeEvent::Error(message) => {
                self.emit(AppEvent::TelegramError {
                    event_id: new_event_id(),
                    bot_id: None,
                    occurred_at: now_rfc3339(),
                    code: Some("tdlib_error".to_string()),
                    message: message.clone(),
                    raw: None,
                });
                self.mark_telegram_error(message).await.map(|_| ())
            }
            TdJsonRuntimeEvent::Closed => Ok(()),
        };

        if let Err(error) = result {
            tracing::warn!(%error, "failed to handle TDLib runtime event");
        }
    }

    async fn apply_tdjson_update(&self, update: Value) -> AppResult<()> {
        match tdjson_value_type(&update) {
            Some("updateNewChat") => {
                if let Some(chat) = discovered_chat_from_tdjson_chat_update(&update) {
                    self.upsert_discovered_chat(chat).await?;
                }
            }
            Some("updateUser") => {
                if let Some(chat) = discovered_bot_from_tdjson_user_update(&update) {
                    self.upsert_discovered_chat(chat).await?;
                }
            }
            Some("updateNewMessage") => {
                if let Some(message) = update.get("message").cloned() {
                    self.persist_tdjson_message(message).await?;
                }
            }
            Some("updateMessageContent") => {
                self.apply_tdjson_message_content_update(update).await?;
            }
            Some("updateMessageEdited") => {
                self.apply_tdjson_message_edited_update(update).await?;
            }
            Some("updateDeleteMessages") => {
                self.apply_tdjson_delete_messages_update(update).await?;
            }
            Some("updateMessageSendSucceeded") => {
                self.apply_tdjson_message_send_succeeded(update).await?;
            }
            Some("updateMessageSendFailed") => {
                self.apply_tdjson_message_send_failed(update).await?;
            }
            Some("updatePendingTextMessage") => {
                self.apply_tdjson_pending_text_message(update).await?;
            }
            Some("updateFile") => {
                self.apply_tdjson_file_update(update).await?;
            }
            _ => {}
        }
        Ok(())
    }

    async fn apply_tdjson_response(&self, response: Value) -> AppResult<()> {
        match tdjson_value_type(&response) {
            Some("message") => {
                if self
                    .apply_tdjson_download_message_response(&response)
                    .await?
                {
                    return Ok(());
                }
                self.persist_tdjson_message(response).await?;
            }
            Some("messages") => {
                if let Some(messages) = response.get("messages").and_then(Value::as_array) {
                    for message in messages {
                        self.persist_tdjson_message(message.clone()).await?;
                    }
                }
            }
            Some("user") => {
                self.apply_tdjson_account_user_response(response).await?;
            }
            Some("userFullInfo") => {
                self.apply_tdjson_user_full_info_response(response).await?;
            }
            Some("chat") => {
                self.apply_tdjson_chat_response(response).await?;
            }
            Some("file") => {
                self.apply_tdjson_file_object(&response).await?;
            }
            Some("error") => {
                self.apply_tdjson_optional_error_response(response).await?;
            }
            _ => {}
        }
        Ok(())
    }

    async fn apply_tdjson_download_message_response(&self, response: &Value) -> AppResult<bool> {
        let Some(extra) = response
            .get("@extra")
            .and_then(Value::as_str)
            .and_then(parse_download_message_extra)
        else {
            return Ok(false);
        };

        let mut message = response.clone();
        if let Some(object) = message.as_object_mut() {
            object.remove("@extra");
        }
        self.persist_tdjson_message(message.clone()).await?;

        let Some(candidate) = self
            .select_tdjson_download_candidate(&extra, &message)
            .await?
        else {
            self.update_download_status(
                &extra.download_id,
                DownloadStatus::Failed,
                Some(
                    "Telegram message media could not be safely matched for download; refresh history and retry"
                        .to_string(),
                ),
            )
            .await?;
            return Ok(true);
        };

        self.update_download_file_identity(
            &extra.download_id,
            &candidate.file_id,
            tdjson_file_size(Some(&candidate.file)),
        )
        .await?;
        self.apply_tdjson_file_object(&candidate.file).await?;

        let refreshed = self.download(&extra.download_id).await?;
        if refreshed.status == DownloadStatus::Ready {
            return Ok(true);
        }

        self.request_resolved_tdlib_download(&extra.download_id, &candidate.file_id)
            .await?;
        Ok(true)
    }

    async fn apply_tdjson_account_user_response(&self, response: Value) -> AppResult<()> {
        if non_empty_string(response.get("@extra")).as_deref() != Some("account:self") {
            return Ok(());
        }

        let (account_phone, account_label) = tdjson_account_identity_from_user(&response);
        let status = {
            let mut runtime = self.runtime.write().await;
            runtime.telegram.account_phone = account_phone;
            runtime.telegram.account_label = account_label;
            runtime.telegram.persist(&self.db).await?;
            runtime.telegram.status_response()
        };
        self.emit_telegram_status(&status);
        Ok(())
    }

    async fn select_tdjson_download_candidate(
        &self,
        extra: &DownloadMessageExtra,
        message: &Value,
    ) -> AppResult<Option<TdjsonDownloadFileCandidate>> {
        let candidates = tdjson_download_file_candidates(message);
        if candidates.is_empty() {
            return Ok(None);
        }

        let download = self.download(&extra.download_id).await?;
        if let Some(candidate) = candidates
            .iter()
            .find(|candidate| {
                tdjson_candidate_matches_file_id(candidate, &extra.requested_file_id)
                    || tdjson_candidate_matches_file_id(candidate, &download.file_id)
            })
            .cloned()
        {
            return Ok(Some(candidate));
        }

        let thumbnail_candidates = candidates
            .iter()
            .filter(|candidate| candidate.role == TdjsonDownloadFileRole::Thumbnail)
            .cloned()
            .collect::<Vec<_>>();
        let wants_thumbnail = download.file_name.as_deref().is_some_and(|name| {
            name.eq_ignore_ascii_case("telegram-preview.jpg")
                || name.to_ascii_lowercase().contains("thumbnail")
        });
        if wants_thumbnail && thumbnail_candidates.len() == 1 {
            return Ok(thumbnail_candidates.into_iter().next());
        }

        let main_candidates = candidates
            .iter()
            .filter(|candidate| candidate.role == TdjsonDownloadFileRole::Main)
            .cloned()
            .collect::<Vec<_>>();
        if main_candidates.len() == 1 {
            return Ok(main_candidates.into_iter().next());
        }

        if candidates.len() == 1 {
            return Ok(candidates.into_iter().next());
        }

        Ok(None)
    }

    async fn apply_tdjson_user_full_info_response(&self, response: Value) -> AppResult<()> {
        let Some(extra) = non_empty_string(response.get("@extra")) else {
            return Ok(());
        };
        let Some(bot_id) = extra.strip_prefix("bot_commands:") else {
            return Ok(());
        };

        let commands = tdjson_bot_commands_from_user_full_info(&response);
        let mut runtime = self.runtime.write().await;
        if runtime.published_bots.iter().any(|bot| bot.id == bot_id) {
            runtime.bot_commands.insert(bot_id.to_string(), commands);
        }

        Ok(())
    }

    async fn apply_tdjson_chat_response(&self, response: Value) -> AppResult<()> {
        let Some(extra) = non_empty_string(response.get("@extra")) else {
            return Ok(());
        };
        let Some(bot_id) = extra.strip_prefix("bot_commands_chat:") else {
            return Ok(());
        };
        let Some(user_id) = tdjson_chat_private_user_id(&response) else {
            return Ok(());
        };

        {
            let mut runtime = self.runtime.write().await;
            if !runtime.published_bots.iter().any(|bot| bot.id == bot_id) {
                return Ok(());
            }
            runtime
                .bot_command_user_ids
                .insert(bot_id.to_string(), user_id);
        }

        let credentials = self.telegram_credentials().await?;
        self.telegram_bridge.send_request(
            credentials,
            json!({
                "@type": "getUserFullInfo",
                "@extra": format!("bot_commands:{bot_id}"),
                "user_id": user_id
            }),
        )?;

        Ok(())
    }

    async fn apply_tdjson_optional_error_response(&self, response: Value) -> AppResult<()> {
        let Some(extra) = non_empty_string(response.get("@extra")) else {
            return Ok(());
        };
        if extra.starts_with("bot_commands") {
            tracing::debug!(raw = %response, "optional bot command TDLib request failed");
            return Ok(());
        }
        if extra == "account:self" {
            tracing::debug!(raw = %response, "optional Telegram account info request failed");
            return Ok(());
        }

        if let Some(extra) = parse_download_message_extra(&extra) {
            let message = non_empty_string(response.get("message"))
                .unwrap_or_else(|| "TDLib message lookup failed".to_string());
            let code = response
                .get("code")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            self.update_download_status(
                &extra.download_id,
                DownloadStatus::Failed,
                Some(format!(
                    "failed to resolve Telegram message before download: TDLib error {code}: {message}"
                )),
            )
            .await?;
            return Ok(());
        }

        if let Some(file_id) = extra.strip_prefix("download:") {
            let message = non_empty_string(response.get("message"))
                .unwrap_or_else(|| "TDLib download request failed".to_string());
            let code = response
                .get("code")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            let error = format!("TDLib download error {code}: {message}");
            let now = now_rfc3339();
            sqlx::query(
                "UPDATE downloads SET status = 'failed', error = ?, updated_at = ? \
                 WHERE file_id = ? AND status NOT IN ('paused', 'stopped', 'ready')",
            )
            .bind(error)
            .bind(&now)
            .bind(file_id)
            .execute(&self.db)
            .await?;
            self.refresh_and_emit_downloads_for_file(file_id).await?;
        }

        Ok(())
    }

    async fn apply_tdjson_file_update(&self, update: Value) -> AppResult<()> {
        let Some(file) = update.get("file") else {
            return Ok(());
        };
        self.apply_tdjson_file_object(file).await
    }

    async fn apply_tdjson_file_object(&self, file: &Value) -> AppResult<()> {
        let Some(file_id) = tdjson_id_to_string(file.get("id")) else {
            return Ok(());
        };

        let completed = file
            .get("local")
            .and_then(|local| local.get("is_downloading_completed"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let downloaded_bytes = file
            .get("local")
            .and_then(|local| local.get("downloaded_size"))
            .and_then(Value::as_u64)
            .unwrap_or_default();
        let size_bytes = tdjson_file_size(Some(file));
        let local_path = file
            .get("local")
            .and_then(|local| non_empty_string(local.get("path")));

        let (status, error, downloaded_bytes) = if completed {
            match local_path {
                Some(path) => match tokio::fs::copy(path, self.cached_file_path(&file_id)).await {
                    Ok(_) => {
                        let cached_size = self.cached_file_state(&file_id).await?.1;
                        (
                            DownloadStatus::Ready,
                            None,
                            cached_size
                                .max(downloaded_bytes)
                                .max(size_bytes.unwrap_or_default()),
                        )
                    }
                    Err(error) => (
                        DownloadStatus::Failed,
                        Some(format!(
                            "failed to copy TDLib file into media cache: {error}"
                        )),
                        downloaded_bytes,
                    ),
                },
                None => (
                    DownloadStatus::Failed,
                    Some(
                        "TDLib reported a completed download without a local file path".to_string(),
                    ),
                    downloaded_bytes,
                ),
            }
        } else if file
            .get("local")
            .and_then(|local| local.get("is_downloading_active"))
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            (DownloadStatus::Downloading, None, downloaded_bytes)
        } else {
            (DownloadStatus::Queued, None, downloaded_bytes)
        };

        let now = now_rfc3339();
        sqlx::query(
            "UPDATE downloads SET downloaded_bytes = ?, size_bytes = COALESCE(?, size_bytes), \
             status = ?, error = ?, updated_at = ? \
             WHERE file_id = ? AND status NOT IN ('paused', 'stopped')",
        )
        .bind(downloaded_bytes as i64)
        .bind(size_bytes.map(|value| value as i64))
        .bind(download_status_to_db(&status))
        .bind(&error)
        .bind(&now)
        .bind(&file_id)
        .execute(&self.db)
        .await?;

        self.refresh_and_emit_downloads_for_file(&file_id).await?;

        Ok(())
    }

    async fn refresh_and_emit_downloads_for_file(&self, file_id: &str) -> AppResult<()> {
        let rows = sqlx::query(
            "SELECT id, file_id, message_id, file_name, mime_type, size_bytes, downloaded_bytes, status, error \
             FROM downloads WHERE file_id = ? ORDER BY updated_at DESC, created_at DESC",
        )
        .bind(file_id)
        .fetch_all(&self.db)
        .await?;
        let downloads = rows
            .into_iter()
            .map(download_from_row)
            .collect::<AppResult<Vec<_>>>()?;

        {
            let mut runtime = self.runtime.write().await;
            for download in &downloads {
                if let Some(existing) = runtime
                    .downloads
                    .iter_mut()
                    .find(|existing| existing.id == download.id)
                {
                    *existing = download.clone();
                } else {
                    runtime.downloads.insert(0, download.clone());
                }
            }
        }

        for download in downloads {
            let bot_id = self
                .message_bot_id(download.message_id.as_deref())
                .await?
                .or_else(|| self.bot_id_for_file(&download.file_id));
            self.emit(download_event_for_item(download, bot_id));
        }

        Ok(())
    }

    async fn apply_tdjson_message_content_update(&self, update: Value) -> AppResult<()> {
        let Some(telegram_chat_id) = tdjson_id_to_string(update.get("chat_id")) else {
            return Ok(());
        };
        let Some(bot) = self
            .published_bot_by_telegram_chat_id(&telegram_chat_id)
            .await
        else {
            return Ok(());
        };
        let Some(telegram_message_id) = tdjson_id_to_string(update.get("message_id")) else {
            return Ok(());
        };

        let row = sqlx::query(
            "SELECT id, telegram_message_id, bot_id, direction, text, entities_json, media_json, \
             sent_by_internal_user_json, status, created_at, edited_at, reply_to_message_id, \
             raw_available, inline_keyboard_json \
             FROM chat_messages \
             WHERE bot_id = ? AND telegram_message_id = ? LIMIT 1",
        )
        .bind(&bot.id)
        .bind(&telegram_message_id)
        .fetch_optional(&self.db)
        .await?;

        let Some(row) = row else {
            return Ok(());
        };

        let mut message = chat_message_from_row(row)?;
        let (text, entities) = tdjson_content_text_and_entities(update.get("new_content"));
        message.text = text;
        message.entities = entities;
        message.media = tdjson_content_media(update.get("new_content"));
        message.status = MessageStatus::Edited;
        message.edited_at = Some(now_rfc3339());
        message.raw_available = Some(true);

        self.persist_chat_message(&mut message, &telegram_chat_id, false)
            .await?;
        self.emit(AppEvent::MessageEdited {
            event_id: new_event_id(),
            bot_id: Some(bot.id),
            occurred_at: now_rfc3339(),
            message,
        });

        Ok(())
    }

    async fn apply_tdjson_message_edited_update(&self, update: Value) -> AppResult<()> {
        let Some(telegram_chat_id) = tdjson_id_to_string(update.get("chat_id")) else {
            return Ok(());
        };
        let Some(bot) = self
            .published_bot_by_telegram_chat_id(&telegram_chat_id)
            .await
        else {
            return Ok(());
        };
        let Some(telegram_message_id) = tdjson_id_to_string(update.get("message_id")) else {
            return Ok(());
        };

        let Some(mut message) = self
            .chat_message_by_telegram_message_id(&bot.id, &telegram_message_id)
            .await?
        else {
            return Ok(());
        };

        message.status = MessageStatus::Edited;
        message.edited_at = update
            .get("edit_date")
            .and_then(Value::as_i64)
            .filter(|value| *value > 0)
            .map(|value| tdjson_unix_time_to_rfc3339(Some(value)))
            .or_else(|| Some(now_rfc3339()));
        if let Some(reply_markup) = update.get("reply_markup") {
            message.inline_keyboard = tdjson_inline_keyboard_from_reply_markup(Some(reply_markup));
        }

        self.persist_chat_message(&mut message, &telegram_chat_id, false)
            .await?;
        self.emit(AppEvent::MessageEdited {
            event_id: new_event_id(),
            bot_id: Some(bot.id),
            occurred_at: now_rfc3339(),
            message,
        });

        Ok(())
    }

    async fn apply_tdjson_delete_messages_update(&self, update: Value) -> AppResult<()> {
        let is_permanent = update
            .get("is_permanent")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let from_cache = update
            .get("from_cache")
            .and_then(Value::as_bool)
            .unwrap_or(false);

        if !is_permanent || from_cache {
            return Ok(());
        }

        let Some(telegram_chat_id) = tdjson_id_to_string(update.get("chat_id")) else {
            return Ok(());
        };
        let Some(bot) = self
            .published_bot_by_telegram_chat_id(&telegram_chat_id)
            .await
        else {
            return Ok(());
        };
        let Some(message_ids) = update.get("message_ids").and_then(Value::as_array) else {
            return Ok(());
        };

        let now = now_rfc3339();
        for message_id in message_ids {
            let Some(telegram_message_id) = tdjson_id_to_string(Some(message_id)) else {
                continue;
            };
            let local_id = sqlx::query(
                "SELECT id FROM chat_messages WHERE bot_id = ? AND telegram_message_id = ? LIMIT 1",
            )
            .bind(&bot.id)
            .bind(&telegram_message_id)
            .fetch_optional(&self.db)
            .await?
            .map(|row| row.try_get::<String, _>("id"))
            .transpose()?
            .unwrap_or_else(|| tdjson_message_local_id_for_parts(&bot.id, &telegram_message_id));

            sqlx::query(
                "UPDATE chat_messages SET status = 'deleted', deleted_at = ?, updated_at = ? \
                 WHERE bot_id = ? AND telegram_message_id = ?",
            )
            .bind(&now)
            .bind(&now)
            .bind(&bot.id)
            .bind(&telegram_message_id)
            .execute(&self.db)
            .await?;

            self.emit(AppEvent::MessageDeleted {
                event_id: new_event_id(),
                bot_id: Some(bot.id.clone()),
                occurred_at: now_rfc3339(),
                message_id: local_id,
            });
        }

        Ok(())
    }

    async fn apply_tdjson_message_send_succeeded(&self, update: Value) -> AppResult<()> {
        let client_request_id = non_empty_string(update.get("@extra"));
        let old_message_id = tdjson_id_to_string(update.get("old_message_id"));

        let mut td_message = update
            .get("message")
            .cloned()
            .unwrap_or_else(|| json!({ "@type": "message" }));
        if let Some(client_request_id) = client_request_id.as_ref() {
            td_message["@extra"] = Value::String(client_request_id.clone());
        }

        self.persist_tdjson_message(td_message).await?;

        if let (Some(chat_id), Some(old_message_id)) =
            (tdjson_id_to_string(update.get("chat_id")), old_message_id)
        {
            if let Some(bot) = self.published_bot_by_telegram_chat_id(&chat_id).await {
                let old_local_id = tdjson_message_local_id_for_parts(&bot.id, &old_message_id);
                let ack_client_request_id = client_request_id
                    .clone()
                    .unwrap_or_else(|| old_local_id.clone());
                if let Some(client_request_id) = client_request_id.as_ref() {
                    self.remove_superseded_tdlib_outgoing_row(
                        &bot.id,
                        &old_local_id,
                        &old_message_id,
                        client_request_id,
                    )
                    .await?;
                }
                self.emit(AppEvent::MessageSendAck {
                    event_id: new_event_id(),
                    bot_id: Some(bot.id),
                    occurred_at: now_rfc3339(),
                    client_request_id: ack_client_request_id,
                    message_id: update
                        .get("message")
                        .and_then(|message| tdjson_id_to_string(message.get("id"))),
                });
            }
        }

        Ok(())
    }

    async fn remove_superseded_tdlib_outgoing_row(
        &self,
        bot_id: &str,
        old_local_id: &str,
        old_message_id: &str,
        client_request_id: &str,
    ) -> AppResult<()> {
        sqlx::query(
            "DELETE FROM chat_messages \
             WHERE bot_id = ? AND id != ? AND (id = ? OR telegram_message_id = ?)",
        )
        .bind(bot_id)
        .bind(client_request_id)
        .bind(old_local_id)
        .bind(old_message_id)
        .execute(&self.db)
        .await?;
        Ok(())
    }

    async fn apply_tdjson_message_send_failed(&self, update: Value) -> AppResult<()> {
        let Some(telegram_chat_id) = tdjson_id_to_string(update.get("chat_id")).or_else(|| {
            update
                .get("message")
                .and_then(|message| tdjson_id_to_string(message.get("chat_id")))
        }) else {
            return Ok(());
        };
        let Some(bot) = self
            .published_bot_by_telegram_chat_id(&telegram_chat_id)
            .await
        else {
            return Ok(());
        };

        let client_request_id = non_empty_string(update.get("@extra"))
            .or_else(|| {
                update
                    .get("message")
                    .and_then(|message| non_empty_string(message.get("@extra")))
            })
            .or_else(|| tdjson_id_to_string(update.get("old_message_id")))
            .unwrap_or_else(|| new_id("failed_send"));
        let error = update
            .get("error_message")
            .and_then(Value::as_str)
            .or_else(|| {
                update
                    .get("error")
                    .and_then(|error| error.get("message"))
                    .and_then(Value::as_str)
            })
            .unwrap_or("Telegram message send failed")
            .to_string();

        if let Some(mut message) = self
            .chat_message_by_id_or_telegram_id(&bot.id, &client_request_id)
            .await?
        {
            message.status = MessageStatus::Failed;
            self.persist_chat_message(&mut message, &telegram_chat_id, false)
                .await?;
        }

        self.emit(AppEvent::MessageSendFailed {
            event_id: new_event_id(),
            bot_id: Some(bot.id),
            occurred_at: now_rfc3339(),
            client_request_id,
            error,
        });

        Ok(())
    }

    async fn apply_tdjson_pending_text_message(&self, update: Value) -> AppResult<()> {
        let Some(telegram_chat_id) = tdjson_id_to_string(update.get("chat_id")) else {
            return Ok(());
        };
        let Some(bot) = self
            .published_bot_by_telegram_chat_id(&telegram_chat_id)
            .await
        else {
            return Ok(());
        };

        let draft_id = tdjson_id_to_string(update.get("draft_id"))
            .or_else(|| tdjson_id_to_string(update.get("message_id")))
            .or_else(|| non_empty_string(update.get("id")))
            .unwrap_or_else(|| format!("{}:{}", telegram_chat_id, stable_json_hash(&update)));
        let (text, entities) = pending_text_update_text_and_entities(&update);

        if text.as_deref().unwrap_or_default().is_empty() {
            self.expire_pending_draft(&bot.id, &draft_id).await?;
            return Ok(());
        }

        let received_at = now_rfc3339();
        let expires_at = DateTime::<Utc>::from_timestamp(
            Utc::now().timestamp() + DEFAULT_PENDING_DRAFT_TTL_SECONDS,
            0,
        )
        .map(|value| value.to_rfc3339());
        let replaces_draft_id = {
            let runtime = self.runtime.read().await;
            runtime
                .pending_drafts
                .iter()
                .any(|draft| draft.bot_id == bot.id && draft.draft_id == draft_id)
                .then(|| draft_id.clone())
        };
        let sent_by_internal_user = self
            .latest_outgoing_visibility_owner(&ChatMessage {
                id: String::new(),
                telegram_message_id: None,
                bot_id: bot.id.clone(),
                direction: MessageDirection::Incoming,
                text: None,
                entities: Vec::new(),
                media: None,
                sent_by_internal_user: None,
                status: MessageStatus::Received,
                created_at: received_at.clone(),
                edited_at: None,
                reply_to_message_id: None,
                raw_available: None,
                inline_keyboard: None,
            })
            .await?
            .and_then(|owner| owner.user);
        let draft = PendingDraft {
            id: format!(
                "draft_{}_{}",
                stable_identifier_segment(&bot.id),
                stable_identifier_segment(&draft_id)
            ),
            bot_id: bot.id.clone(),
            draft_id: draft_id.clone(),
            text: text.unwrap_or_default(),
            entities,
            sent_by_internal_user,
            received_at,
            expires_at,
            replaces_draft_id,
        };

        {
            let mut runtime = self.runtime.write().await;
            runtime.pending_drafts.retain(|existing| {
                !(existing.bot_id == draft.bot_id && existing.draft_id == draft.draft_id)
            });
            runtime.pending_drafts.push(draft.clone());
        }

        self.emit(AppEvent::DraftPending {
            event_id: new_event_id(),
            bot_id: Some(bot.id.clone()),
            occurred_at: now_rfc3339(),
            draft: draft.clone(),
        });
        self.spawn_pending_draft_expiry(bot.id, draft_id);

        Ok(())
    }

    async fn upsert_discovered_chat(&self, mut chat: DiscoveredTelegramChat) -> AppResult<()> {
        let now = now_rfc3339();
        {
            let runtime = self.runtime.read().await;
            chat.already_published = runtime
                .published_bots
                .iter()
                .any(|bot| bot.telegram_chat_id == chat.telegram_chat_id);
        }

        sqlx::query(
            "INSERT INTO discovered_telegram_chats \
             (telegram_chat_id, username, title, kind, is_bot, status, discovered_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?) \
             ON CONFLICT(telegram_chat_id) DO UPDATE SET \
             username = COALESCE(excluded.username, discovered_telegram_chats.username), \
             title = excluded.title, \
             kind = CASE WHEN excluded.is_bot = 1 OR discovered_telegram_chats.is_bot = 1 THEN 'bot' ELSE excluded.kind END, \
             is_bot = CASE WHEN excluded.is_bot = 1 THEN 1 ELSE discovered_telegram_chats.is_bot END, \
             status = CASE WHEN excluded.status = 'unknown' THEN discovered_telegram_chats.status ELSE excluded.status END, \
             updated_at = excluded.updated_at",
        )
        .bind(&chat.telegram_chat_id)
        .bind(&chat.username)
        .bind(&chat.title)
        .bind(telegram_chat_kind_to_db(&chat.kind))
        .bind(chat.is_bot)
        .bind(bot_status_to_db(&chat.status))
        .bind(&now)
        .bind(&now)
        .execute(&self.db)
        .await?;

        let mut runtime = self.runtime.write().await;
        chat.already_published = runtime
            .published_bots
            .iter()
            .any(|bot| bot.telegram_chat_id == chat.telegram_chat_id);

        if let Some(existing) = runtime
            .discovered_chats
            .iter_mut()
            .find(|existing| existing.telegram_chat_id == chat.telegram_chat_id)
        {
            if chat.username.is_some() {
                existing.username = chat.username;
            }
            existing.title = chat.title;
            existing.is_bot |= chat.is_bot;
            existing.kind = if existing.is_bot {
                TelegramChatKind::Bot
            } else {
                chat.kind
            };
            if chat.status != BotStatus::Unknown {
                existing.status = chat.status;
            }
            existing.already_published = chat.already_published;
        } else {
            runtime.discovered_chats.push(chat);
        }

        runtime.discovered_chats.sort_by(|left, right| {
            right
                .is_bot
                .cmp(&left.is_bot)
                .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
        });

        Ok(())
    }

    pub async fn list_bots(&self) -> Vec<BotSummary> {
        self.runtime
            .read()
            .await
            .published_bots
            .iter()
            .filter(|bot| bot.enabled)
            .map(PublishedBot::summary)
            .collect()
    }

    pub async fn ensure_published_bot(&self, bot_id: &str) -> AppResult<PublishedBot> {
        self.runtime
            .read()
            .await
            .published_bots
            .iter()
            .find(|bot| bot.id == bot_id && bot.enabled)
            .cloned()
            .ok_or_else(|| AppError::not_found("bot_not_found", "published bot was not found"))
    }

    pub async fn list_messages(
        &self,
        bot_id: &str,
        before: Option<&str>,
        limit: usize,
    ) -> AppResult<Vec<ChatMessage>> {
        self.ensure_published_bot(bot_id).await?;
        let limit = limit.clamp(1, 100) as i64;

        let rows = if let Some(before) = before.filter(|value| !value.trim().is_empty()) {
            let cursor = sqlx::query(
                "SELECT id, created_at FROM chat_messages \
                 WHERE bot_id = ? AND is_ephemeral = 0 AND (id = ? OR telegram_message_id = ?)",
            )
            .bind(bot_id)
            .bind(before)
            .bind(before)
            .fetch_optional(&self.db)
            .await?;

            let Some(cursor) = cursor else {
                return Ok(Vec::new());
            };
            let cursor_id: String = cursor.try_get("id")?;
            let cursor_created_at: String = cursor.try_get("created_at")?;

            sqlx::query(
                "SELECT id, telegram_message_id, bot_id, direction, text, entities_json, media_json, \
                 sent_by_internal_user_json, status, created_at, edited_at, reply_to_message_id, \
                 raw_available, inline_keyboard_json \
                 FROM chat_messages \
                 WHERE bot_id = ? AND is_ephemeral = 0 \
                   AND (created_at < ? OR (created_at = ? AND id < ?)) \
                 ORDER BY created_at DESC, id DESC LIMIT ?",
            )
            .bind(bot_id)
            .bind(&cursor_created_at)
            .bind(&cursor_created_at)
            .bind(&cursor_id)
            .bind(limit)
            .fetch_all(&self.db)
            .await?
        } else {
            sqlx::query(
                "SELECT id, telegram_message_id, bot_id, direction, text, entities_json, media_json, \
                 sent_by_internal_user_json, status, created_at, edited_at, reply_to_message_id, \
                 raw_available, inline_keyboard_json \
                 FROM chat_messages \
                 WHERE bot_id = ? AND is_ephemeral = 0 \
                 ORDER BY created_at DESC, id DESC LIMIT ?",
            )
            .bind(bot_id)
            .bind(limit)
            .fetch_all(&self.db)
            .await?
        };

        let mut messages = rows
            .into_iter()
            .map(chat_message_from_row)
            .collect::<AppResult<Vec<_>>>()?;
        messages.reverse();
        Ok(messages)
    }

    pub async fn list_messages_for_session(
        &self,
        session: &AuthSession,
        bot_id: &str,
        before: Option<&str>,
        limit: usize,
    ) -> AppResult<Vec<ChatMessage>> {
        if session.user.role == crate::models::AuthRole::Admin {
            return self.list_messages(bot_id, before, limit).await;
        }

        self.ensure_published_bot(bot_id).await?;
        let limit = limit.clamp(1, 100) as i64;
        let owner_id = &session.user.id;

        let rows = if let Some(before) = before.filter(|value| !value.trim().is_empty()) {
            let cursor = sqlx::query(
                "SELECT id, created_at FROM chat_messages \
                 WHERE bot_id = ? AND is_ephemeral = 0 AND visible_to_internal_user_id = ? \
                   AND (id = ? OR telegram_message_id = ?)",
            )
            .bind(bot_id)
            .bind(owner_id)
            .bind(before)
            .bind(before)
            .fetch_optional(&self.db)
            .await?;

            let Some(cursor) = cursor else {
                return Ok(Vec::new());
            };
            let cursor_id: String = cursor.try_get("id")?;
            let cursor_created_at: String = cursor.try_get("created_at")?;

            sqlx::query(
                "SELECT id, telegram_message_id, bot_id, direction, text, entities_json, media_json, \
                 sent_by_internal_user_json, status, created_at, edited_at, reply_to_message_id, \
                 raw_available, inline_keyboard_json \
                 FROM chat_messages \
                 WHERE bot_id = ? AND is_ephemeral = 0 AND visible_to_internal_user_id = ? \
                   AND (created_at < ? OR (created_at = ? AND id < ?)) \
                 ORDER BY created_at DESC, id DESC LIMIT ?",
            )
            .bind(bot_id)
            .bind(owner_id)
            .bind(&cursor_created_at)
            .bind(&cursor_created_at)
            .bind(&cursor_id)
            .bind(limit)
            .fetch_all(&self.db)
            .await?
        } else {
            sqlx::query(
                "SELECT id, telegram_message_id, bot_id, direction, text, entities_json, media_json, \
                 sent_by_internal_user_json, status, created_at, edited_at, reply_to_message_id, \
                 raw_available, inline_keyboard_json \
                 FROM chat_messages \
                 WHERE bot_id = ? AND is_ephemeral = 0 AND visible_to_internal_user_id = ? \
                 ORDER BY created_at DESC, id DESC LIMIT ?",
            )
            .bind(bot_id)
            .bind(owner_id)
            .bind(limit)
            .fetch_all(&self.db)
            .await?
        };

        let mut messages = rows
            .into_iter()
            .map(chat_message_from_row)
            .collect::<AppResult<Vec<_>>>()?;
        messages.reverse();
        Ok(messages)
    }

    pub async fn send_message_to_bot(
        &self,
        session: &AuthSession,
        bot: &PublishedBot,
        request: SendMessageRequest,
    ) -> AppResult<ChatMessage> {
        if request.client_request_id.trim().is_empty() {
            return Err(AppError::bad_request(
                "missing_client_request_id",
                "clientRequestId is required",
            ));
        }

        if request.attachment_ids.len() > 1 {
            return Err(AppError::bad_request(
                "multiple_attachments_not_supported",
                "send one attachment per message",
            ));
        }

        let attachment_path = request
            .attachment_ids
            .first()
            .map(|file_id| (file_id.clone(), self.cached_file_path(file_id)));
        if let Some((file_id, path)) = attachment_path.as_ref() {
            if tokio::fs::metadata(path).await.is_err() {
                return Err(AppError::not_found(
                    "attachment_not_found",
                    format!("uploaded attachment {file_id} is not in the media cache"),
                ));
            }
        }

        let credentials = match self.telegram_credentials().await {
            Ok(credentials) => credentials,
            Err(error) => {
                self.record_outgoing_message_audit(
                    session,
                    bot,
                    &request,
                    "failed",
                    Some("telegram_unavailable"),
                )
                .await?;
                self.emit(AppEvent::MessageSendFailed {
                    event_id: new_event_id(),
                    bot_id: Some(bot.id.clone()),
                    occurred_at: now_rfc3339(),
                    client_request_id: request.client_request_id.clone(),
                    error: error.to_string(),
                });
                return Err(AppError::telegram_unavailable(error.to_string()));
            }
        };
        let reply_to_message_id = self
            .resolve_reply_to_telegram_message_id(bot, request.reply_to_message_id.as_deref())
            .await?;
        let send_request = tdjson_send_message_request(
            bot,
            &request,
            reply_to_message_id,
            attachment_path.as_ref().map(|(_, path)| path.as_path()),
        )?;

        if let Err(error) = self.telegram_bridge.send_request(credentials, send_request) {
            self.record_outgoing_message_audit(
                session,
                bot,
                &request,
                "failed",
                Some("telegram_unavailable"),
            )
            .await?;
            self.emit(AppEvent::MessageSendFailed {
                event_id: new_event_id(),
                bot_id: Some(bot.id.clone()),
                occurred_at: now_rfc3339(),
                client_request_id: request.client_request_id,
                error: error.to_string(),
            });
            return Err(error);
        }

        self.record_outgoing_message_audit(session, bot, &request, "queued", None)
            .await?;

        let mut message = ChatMessage {
            id: request.client_request_id.clone(),
            telegram_message_id: None,
            bot_id: bot.id.clone(),
            direction: MessageDirection::Outgoing,
            text: Some(request.text.trim().to_string()),
            entities: request.entities.clone(),
            media: request.attachment_ids.first().map(|file_id| {
                vec![MessageMedia::Document {
                    file_id: file_id.clone(),
                    file_name: None,
                    mime_type: None,
                    size_bytes: None,
                }]
            }),
            sent_by_internal_user: Some(InternalUser {
                id: session.user.id.clone(),
                display_name: request
                    .sent_by_access_key_name
                    .clone()
                    .unwrap_or_else(|| session.user.display_name.clone()),
            }),
            status: MessageStatus::Pending,
            created_at: now_rfc3339(),
            edited_at: None,
            reply_to_message_id: request.reply_to_message_id,
            raw_available: Some(false),
            inline_keyboard: None,
        };

        self.persist_chat_message(&mut message, &bot.telegram_chat_id, false)
            .await?;
        self.emit(AppEvent::MessageNew {
            event_id: new_event_id(),
            bot_id: Some(bot.id.clone()),
            occurred_at: now_rfc3339(),
            message: message.clone(),
        });

        Ok(message)
    }

    pub async fn click_inline_keyboard_button(
        &self,
        session: &AuthSession,
        bot_id: &str,
        message_id: &str,
        request: InlineKeyboardClickRequest,
    ) -> AppResult<InlineKeyboardClickResponse> {
        let bot = self.ensure_published_bot(bot_id).await?;
        let callback_data = request.callback_data.trim();
        if callback_data.is_empty() {
            return Err(AppError::bad_request(
                "missing_callback_data",
                "callbackData is required",
            ));
        }

        let Some(message) = self
            .chat_message_by_id_or_telegram_id(&bot.id, message_id)
            .await?
        else {
            return Err(AppError::not_found(
                "message_not_found",
                "message was not found",
            ));
        };

        if !message_visible_to_session(&message, session) {
            return Err(AppError::not_found(
                "message_not_found",
                "message was not found",
            ));
        }

        let telegram_message_id = message
            .telegram_message_id
            .as_deref()
            .ok_or_else(|| {
                AppError::bad_request(
                    "message_not_interactive",
                    "message does not have a Telegram message id yet",
                )
            })?
            .parse::<i64>()
            .map_err(|_| {
                AppError::bad_request(
                    "invalid_telegram_message_id",
                    "message has an invalid Telegram message id",
                )
            })?;
        let telegram_chat_id = bot.telegram_chat_id.parse::<i64>().map_err(|_| {
            AppError::bad_request(
                "invalid_telegram_chat_id",
                "published bot has an invalid Telegram chat id",
            )
        })?;
        let credentials = self.telegram_credentials().await?;

        self.telegram_bridge.send_request(
            credentials,
            json!({
                "@type": "getCallbackQueryAnswer",
                "@extra": new_id("callback"),
                "chat_id": telegram_chat_id,
                "message_id": telegram_message_id,
                "payload": {
                    "@type": "callbackQueryPayloadData",
                    "data": callback_data
                }
            }),
        )?;

        Ok(InlineKeyboardClickResponse {
            text: Some("Callback sent to Telegram.".to_string()),
            show_alert: false,
            url: None,
        })
    }

    pub async fn bot_commands(&self, bot_id: &str) -> AppResult<Vec<BotCommand>> {
        let bot = self.ensure_published_bot(bot_id).await?;
        let cached = self.cached_bot_commands(&bot.id).await;

        let credentials = match self.telegram_credentials().await {
            Ok(credentials) => credentials,
            Err(_) if !cached.is_empty() => return Ok(cached),
            Err(error) => return Err(AppError::telegram_unavailable(error.to_string())),
        };

        let telegram_ready = {
            let runtime = self.runtime.read().await;
            runtime.telegram.auth_state == TelegramAuthState::Ready
                && runtime.telegram.tdlib_state == TdlibRuntimeState::Running
        };

        if !self.telegram_bridge.is_runtime_started() || !telegram_ready {
            self.telegram_bridge.reconnect(credentials)?;
            return Ok(cached);
        }

        let user_id = self.cached_bot_command_user_id(&bot.id).await;
        let Some(user_id) = user_id else {
            let chat_id = bot.telegram_chat_id.parse::<i64>().map_err(|_| {
                AppError::bad_request(
                    "invalid_telegram_chat_id",
                    "published bot has an invalid Telegram chat id",
                )
            })?;

            self.telegram_bridge.send_request(
                credentials.clone(),
                json!({
                    "@type": "getChat",
                    "@extra": format!("bot_commands_chat:{}", bot.id),
                    "chat_id": chat_id
                }),
            )?;

            if let Some(username) = bot.username.as_deref().filter(|value| !value.is_empty()) {
                self.telegram_bridge.send_request(
                    credentials,
                    json!({
                        "@type": "searchPublicChat",
                        "@extra": format!("bot_commands_chat:{}", bot.id),
                        "username": username.trim_start_matches('@')
                    }),
                )?;
            }

            return Ok(cached);
        };

        self.telegram_bridge.send_request(
            credentials,
            json!({
                "@type": "getUserFullInfo",
                "@extra": format!("bot_commands:{}", bot.id),
                "user_id": user_id
            }),
        )?;

        if !cached.is_empty() {
            return Ok(cached);
        }

        tokio::time::sleep(Duration::from_millis(350)).await;
        Ok(self.cached_bot_commands(&bot.id).await)
    }

    async fn cached_bot_commands(&self, bot_id: &str) -> Vec<BotCommand> {
        self.runtime
            .read()
            .await
            .bot_commands
            .get(bot_id)
            .cloned()
            .unwrap_or_default()
    }

    async fn cached_bot_command_user_id(&self, bot_id: &str) -> Option<i64> {
        self.runtime
            .read()
            .await
            .bot_command_user_ids
            .get(bot_id)
            .copied()
    }

    async fn resolve_reply_to_telegram_message_id(
        &self,
        bot: &PublishedBot,
        reply_to_message_id: Option<&str>,
    ) -> AppResult<Option<i64>> {
        let Some(reply_to_message_id) =
            reply_to_message_id.filter(|value| !value.trim().is_empty())
        else {
            return Ok(None);
        };

        let telegram_message_id = sqlx::query(
            "SELECT telegram_message_id FROM chat_messages \
             WHERE bot_id = ? AND (id = ? OR telegram_message_id = ?) LIMIT 1",
        )
        .bind(&bot.id)
        .bind(reply_to_message_id)
        .bind(reply_to_message_id)
        .fetch_optional(&self.db)
        .await?
        .and_then(|row| {
            row.try_get::<Option<String>, _>("telegram_message_id")
                .ok()
                .flatten()
        })
        .unwrap_or_else(|| reply_to_message_id.to_string());

        telegram_message_id.parse::<i64>().map(Some).map_err(|_| {
            AppError::bad_request(
                "invalid_reply_to_message_id",
                "replyToMessageId must reference a Telegram message id",
            )
        })
    }

    async fn persist_tdjson_message(&self, td_message: Value) -> AppResult<()> {
        let Some(telegram_chat_id) = tdjson_id_to_string(td_message.get("chat_id")) else {
            return Ok(());
        };
        let Some(bot) = self
            .published_bot_by_telegram_chat_id(&telegram_chat_id)
            .await
        else {
            return Ok(());
        };

        let client_request_id = non_empty_string(td_message.get("@extra"));
        let local_id = client_request_id
            .clone()
            .unwrap_or_else(|| tdjson_message_local_id(&bot, &td_message));
        let update_existing = client_request_id.is_some()
            || self
                .chat_message_exists(&bot.id, td_message.get("id"))
                .await?;

        let Some(mut message) = chat_message_from_tdjson_message(&bot, &td_message, local_id)
        else {
            return Ok(());
        };

        self.persist_chat_message(&mut message, &telegram_chat_id, false)
            .await?;

        if let Some(client_request_id) = client_request_id {
            self.emit(AppEvent::MessageSendAck {
                event_id: new_event_id(),
                bot_id: Some(bot.id.clone()),
                occurred_at: now_rfc3339(),
                client_request_id,
                message_id: message.telegram_message_id.clone(),
            });
        }

        if update_existing {
            self.emit(AppEvent::MessageEdited {
                event_id: new_event_id(),
                bot_id: Some(bot.id.clone()),
                occurred_at: now_rfc3339(),
                message: message.clone(),
            });
        } else {
            self.emit(AppEvent::MessageNew {
                event_id: new_event_id(),
                bot_id: Some(bot.id.clone()),
                occurred_at: now_rfc3339(),
                message: message.clone(),
            });
        }

        if message.direction == MessageDirection::Incoming
            && message.status != MessageStatus::Pending
        {
            self.finalize_pending_drafts_for_message(&bot.id, &message.id)
                .await?;
        }

        Ok(())
    }

    async fn published_bot_by_telegram_chat_id(
        &self,
        telegram_chat_id: &str,
    ) -> Option<PublishedBot> {
        self.runtime
            .read()
            .await
            .published_bots
            .iter()
            .find(|bot| bot.enabled && bot.telegram_chat_id == telegram_chat_id)
            .cloned()
    }

    async fn chat_message_exists(
        &self,
        bot_id: &str,
        telegram_message_id: Option<&Value>,
    ) -> AppResult<bool> {
        let Some(telegram_message_id) = tdjson_id_to_string(telegram_message_id) else {
            return Ok(false);
        };

        let exists = sqlx::query(
            "SELECT 1 FROM chat_messages \
             WHERE bot_id = ? AND telegram_message_id = ? LIMIT 1",
        )
        .bind(bot_id)
        .bind(telegram_message_id)
        .fetch_optional(&self.db)
        .await?
        .is_some();
        Ok(exists)
    }

    async fn chat_message_by_telegram_message_id(
        &self,
        bot_id: &str,
        telegram_message_id: &str,
    ) -> AppResult<Option<ChatMessage>> {
        sqlx::query(
            "SELECT id, telegram_message_id, bot_id, direction, text, entities_json, media_json, \
             sent_by_internal_user_json, status, created_at, edited_at, reply_to_message_id, \
             raw_available, inline_keyboard_json \
             FROM chat_messages \
             WHERE bot_id = ? AND telegram_message_id = ? LIMIT 1",
        )
        .bind(bot_id)
        .bind(telegram_message_id)
        .fetch_optional(&self.db)
        .await?
        .map(chat_message_from_row)
        .transpose()
    }

    async fn chat_message_by_id_or_telegram_id(
        &self,
        bot_id: &str,
        message_id: &str,
    ) -> AppResult<Option<ChatMessage>> {
        sqlx::query(
            "SELECT id, telegram_message_id, bot_id, direction, text, entities_json, media_json, \
             sent_by_internal_user_json, status, created_at, edited_at, reply_to_message_id, \
             raw_available, inline_keyboard_json \
             FROM chat_messages \
             WHERE bot_id = ? AND (id = ? OR telegram_message_id = ?) LIMIT 1",
        )
        .bind(bot_id)
        .bind(message_id)
        .bind(message_id)
        .fetch_optional(&self.db)
        .await?
        .map(chat_message_from_row)
        .transpose()
    }

    async fn message_visibility_owner(
        &self,
        message: &mut ChatMessage,
    ) -> AppResult<Option<String>> {
        if let Some(user) = message.sent_by_internal_user.as_ref() {
            return Ok(Some(user.id.clone()));
        }

        if let Some(existing) = self
            .message_visibility_owner_row(
                &message.bot_id,
                &message.id,
                message.telegram_message_id.as_deref(),
            )
            .await?
        {
            if message.sent_by_internal_user.is_none() {
                message.sent_by_internal_user = existing.user.clone();
            }
            return Ok(existing.owner_id);
        }

        if message.direction != MessageDirection::Incoming {
            return Ok(None);
        }

        if let Some(reply_to_message_id) = message.reply_to_message_id.as_deref() {
            if let Some(existing) = self
                .message_visibility_owner_row(
                    &message.bot_id,
                    reply_to_message_id,
                    Some(reply_to_message_id),
                )
                .await?
            {
                if message.sent_by_internal_user.is_none() {
                    message.sent_by_internal_user = existing.user.clone();
                }
                return Ok(existing.owner_id);
            }
        }

        if let Some(existing) = self.latest_outgoing_visibility_owner(message).await? {
            if message.sent_by_internal_user.is_none() {
                message.sent_by_internal_user = existing.user.clone();
            }
            return Ok(existing.owner_id);
        }

        Ok(None)
    }

    async fn message_visibility_owner_row(
        &self,
        bot_id: &str,
        local_id: &str,
        telegram_message_id: Option<&str>,
    ) -> AppResult<Option<MessageVisibilityOwner>> {
        let row = sqlx::query(
            "SELECT visible_to_internal_user_id, sent_by_internal_user_json FROM chat_messages \
             WHERE bot_id = ? AND (id = ? OR telegram_message_id = ?) LIMIT 1",
        )
        .bind(bot_id)
        .bind(local_id)
        .bind(telegram_message_id.unwrap_or(local_id))
        .fetch_optional(&self.db)
        .await?;

        row.map(message_visibility_owner_from_row).transpose()
    }

    async fn latest_outgoing_visibility_owner(
        &self,
        message: &ChatMessage,
    ) -> AppResult<Option<MessageVisibilityOwner>> {
        let row = sqlx::query(
            "SELECT visible_to_internal_user_id, sent_by_internal_user_json FROM chat_messages \
             WHERE bot_id = ? AND direction = 'outgoing' AND is_ephemeral = 0 \
               AND visible_to_internal_user_id IS NOT NULL AND created_at <= ? \
             ORDER BY created_at DESC, id DESC LIMIT 1",
        )
        .bind(&message.bot_id)
        .bind(&message.created_at)
        .fetch_optional(&self.db)
        .await?;

        row.map(message_visibility_owner_from_row).transpose()
    }

    async fn expire_pending_draft(&self, bot_id: &str, draft_id: &str) -> AppResult<()> {
        let removed = {
            let mut runtime = self.runtime.write().await;
            let before = runtime.pending_drafts.len();
            runtime
                .pending_drafts
                .retain(|draft| !(draft.bot_id == bot_id && draft.draft_id == draft_id));
            before != runtime.pending_drafts.len()
        };

        if removed {
            self.emit(AppEvent::DraftExpired {
                event_id: new_event_id(),
                bot_id: Some(bot_id.to_string()),
                occurred_at: now_rfc3339(),
                draft_id: draft_id.to_string(),
            });
        }

        Ok(())
    }

    fn spawn_pending_draft_expiry(&self, bot_id: String, draft_id: String) {
        let state = self.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(
                DEFAULT_PENDING_DRAFT_TTL_SECONDS as u64,
            ))
            .await;
            if let Err(error) = state.expire_pending_draft(&bot_id, &draft_id).await {
                tracing::warn!(%error, "failed to expire pending TDLib draft");
            }
        });
    }

    async fn finalize_pending_drafts_for_message(
        &self,
        bot_id: &str,
        final_message_id: &str,
    ) -> AppResult<()> {
        let finalized = {
            let mut runtime = self.runtime.write().await;
            let mut finalized = Vec::new();
            runtime.pending_drafts.retain(|draft| {
                if draft.bot_id == bot_id {
                    finalized.push(draft.clone());
                    false
                } else {
                    true
                }
            });
            finalized
        };

        for draft in finalized {
            self.emit(AppEvent::DraftFinalized {
                event_id: new_event_id(),
                bot_id: Some(bot_id.to_string()),
                occurred_at: now_rfc3339(),
                draft_id: draft.draft_id,
                final_message_id: final_message_id.to_string(),
            });
        }

        Ok(())
    }

    async fn persist_chat_message(
        &self,
        message: &mut ChatMessage,
        telegram_chat_id: &str,
        is_ephemeral: bool,
    ) -> AppResult<()> {
        if let Some(telegram_message_id) = message.telegram_message_id.as_deref() {
            let existing_id = sqlx::query(
                "SELECT id FROM chat_messages \
                 WHERE bot_id = ? AND telegram_message_id = ? LIMIT 1",
            )
            .bind(&message.bot_id)
            .bind(telegram_message_id)
            .fetch_optional(&self.db)
            .await?
            .map(|row| row.try_get::<String, _>("id"))
            .transpose()?;

            if let Some(existing_id) = existing_id {
                if existing_id != message.id {
                    let incoming_id_exists = sqlx::query(
                        "SELECT 1 FROM chat_messages WHERE bot_id = ? AND id = ? LIMIT 1",
                    )
                    .bind(&message.bot_id)
                    .bind(&message.id)
                    .fetch_optional(&self.db)
                    .await?
                    .is_some();

                    if incoming_id_exists {
                        sqlx::query("DELETE FROM chat_messages WHERE bot_id = ? AND id = ?")
                            .bind(&message.bot_id)
                            .bind(existing_id)
                            .execute(&self.db)
                            .await?;
                    } else {
                        message.id = existing_id;
                    }
                }
            } else if let Some(pending_id) = self
                .matching_pending_outgoing_request_for_tdlib_message(message)
                .await?
            {
                message.id = pending_id;
            }
        }

        let visible_to_internal_user_id = self.message_visibility_owner(message).await?;
        let entities_json = serde_json::to_string(&message.entities)?;
        let media_json = message
            .media
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let sent_by_internal_user_json = message
            .sent_by_internal_user
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let inline_keyboard_json = message
            .inline_keyboard
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;

        sqlx::query(
            "INSERT INTO chat_messages \
             (id, telegram_message_id, bot_id, telegram_chat_id, direction, text, entities_json, media_json, \
              sent_by_internal_user_json, status, created_at, edited_at, reply_to_message_id, raw_available, \
              inline_keyboard_json, is_ephemeral, deleted_at, updated_at, visible_to_internal_user_id) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?) \
             ON CONFLICT(id) DO UPDATE SET \
             telegram_message_id = COALESCE(excluded.telegram_message_id, chat_messages.telegram_message_id), \
             telegram_chat_id = excluded.telegram_chat_id, \
             direction = excluded.direction, \
             text = excluded.text, \
             entities_json = excluded.entities_json, \
             media_json = excluded.media_json, \
             sent_by_internal_user_json = COALESCE(excluded.sent_by_internal_user_json, chat_messages.sent_by_internal_user_json), \
             status = excluded.status, \
             created_at = excluded.created_at, \
             edited_at = excluded.edited_at, \
             reply_to_message_id = excluded.reply_to_message_id, \
             raw_available = excluded.raw_available, \
             inline_keyboard_json = excluded.inline_keyboard_json, \
             is_ephemeral = excluded.is_ephemeral, \
             updated_at = excluded.updated_at, \
             visible_to_internal_user_id = COALESCE(excluded.visible_to_internal_user_id, chat_messages.visible_to_internal_user_id)",
        )
        .bind(&message.id)
        .bind(&message.telegram_message_id)
        .bind(&message.bot_id)
        .bind(telegram_chat_id)
        .bind(message_direction_to_db(&message.direction))
        .bind(&message.text)
        .bind(entities_json)
        .bind(media_json)
        .bind(sent_by_internal_user_json)
        .bind(message_status_to_db(&message.status))
        .bind(&message.created_at)
        .bind(&message.edited_at)
        .bind(&message.reply_to_message_id)
        .bind(message.raw_available)
        .bind(inline_keyboard_json)
        .bind(is_ephemeral)
        .bind(now_rfc3339())
        .bind(visible_to_internal_user_id)
        .execute(&self.db)
        .await?;

        if !is_ephemeral {
            self.upsert_workspace_files_for_message(message).await?;
        }

        Ok(())
    }

    async fn backfill_workspace_files_from_messages(&self) -> AppResult<()> {
        let rows = sqlx::query(
            "SELECT id, telegram_message_id, bot_id, direction, text, entities_json, media_json, \
             sent_by_internal_user_json, status, created_at, edited_at, reply_to_message_id, \
             raw_available, inline_keyboard_json \
             FROM chat_messages \
             WHERE is_ephemeral = 0 AND media_json IS NOT NULL \
             ORDER BY created_at DESC, id DESC",
        )
        .fetch_all(&self.db)
        .await?;

        for message in rows.into_iter().map(chat_message_from_row) {
            self.upsert_workspace_files_for_message(&message?).await?;
        }

        Ok(())
    }

    async fn upsert_workspace_files_for_message(&self, message: &ChatMessage) -> AppResult<()> {
        let files = workspace_files_for_message(message);
        if files.is_empty() {
            return Ok(());
        }

        let desired_ids = files
            .iter()
            .map(|file| file.id.clone())
            .collect::<HashSet<_>>();
        let existing_rows = sqlx::query("SELECT id FROM workspace_files WHERE message_id = ?")
            .bind(&message.id)
            .fetch_all(&self.db)
            .await?;
        let mut removed_ids = Vec::new();
        for row in existing_rows {
            let existing_id: String = row.try_get("id")?;
            if desired_ids.contains(&existing_id) {
                continue;
            }
            sqlx::query("DELETE FROM workspace_files WHERE id = ?")
                .bind(&existing_id)
                .execute(&self.db)
                .await?;
            removed_ids.push(existing_id);
        }
        if !removed_ids.is_empty() {
            let mut runtime = self.runtime.write().await;
            runtime
                .workspace_files
                .retain(|file| !removed_ids.iter().any(|removed| removed == &file.id));
        }

        let mut emitted = Vec::new();
        for file in files {
            let existed = sqlx::query("SELECT 1 FROM workspace_files WHERE id = ? LIMIT 1")
                .bind(&file.id)
                .fetch_optional(&self.db)
                .await?
                .is_some();

            sqlx::query(
                "INSERT INTO workspace_files \
                 (id, bot_id, message_id, file_id, file_name, mime_type, size_bytes, sender_name, \
                  received_at, status, tag, thumbnail_url) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) \
                 ON CONFLICT(id) DO UPDATE SET \
                 bot_id = excluded.bot_id, \
                 message_id = excluded.message_id, \
                 file_id = excluded.file_id, \
                 file_name = excluded.file_name, \
                 mime_type = excluded.mime_type, \
                 size_bytes = CASE WHEN excluded.size_bytes > 0 THEN excluded.size_bytes ELSE workspace_files.size_bytes END, \
                 sender_name = excluded.sender_name, \
                 received_at = excluded.received_at, \
                 thumbnail_url = COALESCE(excluded.thumbnail_url, workspace_files.thumbnail_url)",
            )
            .bind(&file.id)
            .bind(&file.bot_id)
            .bind(&file.message_id)
            .bind(&file.file_id)
            .bind(&file.file_name)
            .bind(&file.mime_type)
            .bind(file.size_bytes as i64)
            .bind(&file.sender_name)
            .bind(&file.received_at)
            .bind(workspace_file_status_to_db(&file.status))
            .bind(&file.tag)
            .bind(&file.thumbnail_url)
            .execute(&self.db)
            .await?;

            let stored = self.workspace_file_by_id(&file.id).await?.unwrap_or(file);
            {
                let mut runtime = self.runtime.write().await;
                if let Some(existing) = runtime
                    .workspace_files
                    .iter_mut()
                    .find(|existing| existing.id == stored.id)
                {
                    *existing = stored.clone();
                } else {
                    runtime.workspace_files.insert(0, stored.clone());
                }
                runtime.workspace_files.sort_by(|left, right| {
                    right
                        .received_at
                        .cmp(&left.received_at)
                        .then_with(|| right.id.cmp(&left.id))
                });
            }

            if !existed {
                emitted.push(stored);
            }
        }

        for file in emitted {
            self.emit(AppEvent::FileNew {
                event_id: new_event_id(),
                bot_id: Some(file.bot_id.clone()),
                occurred_at: now_rfc3339(),
                file,
            });
        }

        Ok(())
    }

    async fn workspace_file_by_id(&self, id: &str) -> AppResult<Option<WorkspaceFile>> {
        sqlx::query(
            "SELECT id, bot_id, message_id, file_id, file_name, mime_type, size_bytes, sender_name, \
             received_at, status, tag, thumbnail_url \
             FROM workspace_files WHERE id = ? LIMIT 1",
        )
        .bind(id)
        .fetch_optional(&self.db)
        .await?
        .map(workspace_file_from_row)
        .transpose()
    }

    async fn matching_pending_outgoing_request_for_tdlib_message(
        &self,
        message: &ChatMessage,
    ) -> AppResult<Option<String>> {
        if message.direction != MessageDirection::Outgoing
            || is_client_request_id(&message.id)
            || message.telegram_message_id.is_none()
        {
            return Ok(None);
        }

        let cutoff = DateTime::parse_from_rfc3339(&message.created_at)
            .ok()
            .map(|created_at| {
                (created_at.with_timezone(&Utc) - chrono::Duration::seconds(120)).to_rfc3339()
            })
            .unwrap_or_else(|| message.created_at.clone());

        sqlx::query(
            "SELECT id FROM chat_messages \
             WHERE bot_id = ? AND direction = 'outgoing' AND status = 'pending' \
               AND telegram_message_id IS NULL AND text IS ? AND created_at >= ? \
             ORDER BY created_at DESC, id DESC LIMIT 1",
        )
        .bind(&message.bot_id)
        .bind(&message.text)
        .bind(cutoff)
        .fetch_optional(&self.db)
        .await?
        .map(|row| row.try_get::<String, _>("id"))
        .transpose()
        .map_err(AppError::from)
    }

    pub async fn list_discovered_chats(
        &self,
        query: Option<String>,
    ) -> Vec<DiscoveredTelegramChat> {
        let normalized_query = query.map(|value| value.trim().to_lowercase());
        self.runtime
            .read()
            .await
            .discovered_chats
            .iter()
            .filter(|chat| match &normalized_query {
                Some(query) if !query.is_empty() => {
                    chat.title.to_lowercase().contains(query)
                        || chat
                            .username
                            .as_ref()
                            .is_some_and(|username| username.to_lowercase().contains(query))
                }
                _ => true,
            })
            .cloned()
            .collect()
    }

    pub async fn search_telegram_username(
        &self,
        username: &str,
    ) -> AppResult<DiscoveredTelegramChat> {
        let username = username.trim().trim_start_matches('@').to_lowercase();
        if username.is_empty() {
            return Err(AppError::bad_request(
                "missing_username",
                "username is required",
            ));
        }

        if let Some(chat) = self
            .runtime
            .read()
            .await
            .discovered_chats
            .iter()
            .find(|chat| {
                chat.username
                    .as_deref()
                    .is_some_and(|value| value.eq_ignore_ascii_case(&username))
            })
            .cloned()
        {
            return Ok(chat);
        }

        let credentials = self.telegram_credentials().await.map_err(|error| {
            AppError::telegram_unavailable(format!(
                "username search requires the TDLib runtime: {error}"
            ))
        })?;
        self.telegram_bridge.send_request(
            credentials,
            json!({
                "@type": "searchPublicChat",
                "@extra": format!("search:{}", username),
                "username": username,
            }),
        )?;

        Err(AppError::conflict(
            "telegram_chat_discovery_pending",
            "username search was submitted to TDLib; refresh the chat list after discovery updates arrive",
        ))
    }

    pub async fn sync_published_bot_history(&self, bot_id: &str) -> AppResult<()> {
        let bot = self.ensure_published_bot(bot_id).await?;
        let credentials = self.telegram_credentials().await?;
        let chat_id = bot.telegram_chat_id.parse::<i64>().map_err(|_| {
            AppError::bad_request(
                "invalid_telegram_chat_id",
                "published bot has an invalid Telegram chat id",
            )
        })?;

        self.telegram_bridge.send_request(
            credentials,
            json!({
                "@type": "getChatHistory",
                "@extra": format!("history:{}", bot.id),
                "chat_id": chat_id,
                "from_message_id": 0,
                "offset": 0,
                "limit": 50,
                "only_local": false,
            }),
        )
    }

    pub async fn list_published_bots(&self) -> Vec<PublishedBot> {
        self.runtime.read().await.published_bots.clone()
    }

    pub async fn publish_bot(
        &self,
        telegram_chat_id: &str,
        display_title: Option<String>,
        enabled: Option<bool>,
        is_pinned: Option<bool>,
        sort_order: Option<i32>,
        history_sync_policy: Option<HistorySyncPolicy>,
    ) -> AppResult<PublishedBot> {
        let mut runtime = self.runtime.write().await;
        let Some(chat) = runtime
            .discovered_chats
            .iter()
            .find(|chat| chat.telegram_chat_id == telegram_chat_id && chat.is_bot)
            .cloned()
        else {
            return Err(AppError::conflict(
                "telegram_chat_not_discovered",
                "the shared Telegram account has not discovered this bot chat yet",
            ));
        };

        if runtime
            .published_bots
            .iter()
            .any(|bot| bot.telegram_chat_id == telegram_chat_id)
        {
            return Err(AppError::conflict(
                "bot_already_published",
                "this Telegram bot chat is already published",
            ));
        }

        let bot = PublishedBot {
            id: crate::models::new_id("bot"),
            telegram_chat_id: chat.telegram_chat_id,
            username: chat.username,
            title: chat.title,
            display_title,
            enabled: enabled.unwrap_or(true),
            is_pinned: is_pinned.unwrap_or(false),
            sort_order: sort_order.unwrap_or(0),
            history_sync_policy: history_sync_policy.unwrap_or(HistorySyncPolicy::LatestOnly),
            status: chat.status,
        };

        let now = now_rfc3339();
        sqlx::query(
            "INSERT INTO published_bots \
             (id, telegram_chat_id, username, title, display_title, enabled, is_pinned, sort_order, history_sync_policy, status, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&bot.id)
        .bind(&bot.telegram_chat_id)
        .bind(&bot.username)
        .bind(&bot.title)
        .bind(&bot.display_title)
        .bind(bot.enabled)
        .bind(bot.is_pinned)
        .bind(bot.sort_order)
        .bind(history_sync_policy_to_db(&bot.history_sync_policy))
        .bind(bot_status_to_db(&bot.status))
        .bind(&now)
        .bind(&now)
        .execute(&self.db)
        .await?;

        for discovered in &mut runtime.discovered_chats {
            if discovered.telegram_chat_id == bot.telegram_chat_id {
                discovered.already_published = true;
            }
        }
        runtime.published_bots.push(bot.clone());
        drop(runtime);

        self.emit(AppEvent::BotPublished {
            event_id: new_event_id(),
            occurred_at: now_rfc3339(),
            bot: bot.summary(),
        });
        Ok(bot)
    }

    pub async fn patch_published_bot(
        &self,
        bot_id: &str,
        display_title: Option<String>,
        enabled: Option<bool>,
        is_pinned: Option<bool>,
        sort_order: Option<i32>,
        history_sync_policy: Option<HistorySyncPolicy>,
    ) -> AppResult<PublishedBot> {
        let mut runtime = self.runtime.write().await;
        let Some(bot) = runtime
            .published_bots
            .iter_mut()
            .find(|bot| bot.id == bot_id)
        else {
            return Err(AppError::not_found(
                "published_bot_not_found",
                "published bot was not found",
            ));
        };

        if display_title.is_some() {
            bot.display_title = display_title;
        }
        if let Some(enabled) = enabled {
            bot.enabled = enabled;
        }
        if let Some(is_pinned) = is_pinned {
            bot.is_pinned = is_pinned;
        }
        if let Some(sort_order) = sort_order {
            bot.sort_order = sort_order;
        }
        if let Some(history_sync_policy) = history_sync_policy {
            bot.history_sync_policy = history_sync_policy;
        }

        let updated = bot.clone();
        sqlx::query(
            "UPDATE published_bots SET \
             display_title = ?, enabled = ?, is_pinned = ?, sort_order = ?, history_sync_policy = ?, status = ?, updated_at = ? \
             WHERE id = ?",
        )
        .bind(&updated.display_title)
        .bind(updated.enabled)
        .bind(updated.is_pinned)
        .bind(updated.sort_order)
        .bind(history_sync_policy_to_db(&updated.history_sync_policy))
        .bind(bot_status_to_db(&updated.status))
        .bind(now_rfc3339())
        .bind(&updated.id)
        .execute(&self.db)
        .await?;
        drop(runtime);

        self.emit(AppEvent::BotUpdated {
            event_id: new_event_id(),
            occurred_at: now_rfc3339(),
            bot: updated.summary(),
        });
        Ok(updated)
    }

    pub async fn unpublish_bot(&self, bot_id: &str) -> AppResult<()> {
        let mut runtime = self.runtime.write().await;
        let Some(removed) = runtime
            .published_bots
            .iter()
            .find(|bot| bot.id == bot_id)
            .cloned()
        else {
            return Err(AppError::not_found(
                "published_bot_not_found",
                "published bot was not found",
            ));
        };

        runtime.published_bots.retain(|bot| bot.id != bot_id);

        for discovered in &mut runtime.discovered_chats {
            if discovered.telegram_chat_id == removed.telegram_chat_id {
                discovered.already_published = false;
            }
        }

        sqlx::query("DELETE FROM published_bots WHERE id = ?")
            .bind(bot_id)
            .execute(&self.db)
            .await?;
        drop(runtime);

        self.emit(AppEvent::BotUnpublished {
            event_id: new_event_id(),
            occurred_at: now_rfc3339(),
            bot_id: bot_id.to_string(),
        });
        Ok(())
    }

    pub async fn record_outgoing_message_audit(
        &self,
        session: &AuthSession,
        bot: &PublishedBot,
        request: &crate::models::SendMessageRequest,
        status: &str,
        error_code: Option<&str>,
    ) -> AppResult<()> {
        let text_sha256 = hex_sha256(request.text.as_bytes());
        sqlx::query(
            "INSERT INTO outgoing_message_audit \
             (id, bot_id, telegram_chat_id, client_request_id, auth_user_id, access_key_id, access_key_name, text_sha256, attachment_count, status, error_code, created_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(crate::models::new_id("audit"))
        .bind(&bot.id)
        .bind(&bot.telegram_chat_id)
        .bind(&request.client_request_id)
        .bind(&session.user.id)
        .bind(&session.user.access_key_id)
        .bind(&session.user.access_key_name)
        .bind(text_sha256)
        .bind(request.attachment_ids.len() as i64)
        .bind(status)
        .bind(error_code)
        .bind(now_rfc3339())
        .execute(&self.db)
        .await?;
        Ok(())
    }

    pub async fn downloads(&self) -> Vec<DownloadItem> {
        self.runtime.read().await.downloads.clone()
    }

    pub async fn downloads_for_session(&self, session: &AuthSession) -> Vec<DownloadItem> {
        if session.user.role == crate::models::AuthRole::Admin {
            return self.downloads().await;
        }

        let downloads = self.downloads().await;
        let mut visible = Vec::with_capacity(downloads.len());
        for download in downloads {
            if let Some(message_id) = download.message_id.as_deref() {
                let bot_id = self.message_bot_id(Some(message_id)).await.ok().flatten();
                let is_visible = self
                    .message_id_visible_to_session(bot_id.as_deref(), message_id, session)
                    .await
                    .unwrap_or(false);
                if is_visible {
                    visible.push(download);
                }
            }
        }
        visible
    }

    pub async fn download(&self, download_id: &str) -> AppResult<DownloadItem> {
        self.runtime
            .read()
            .await
            .downloads
            .iter()
            .find(|download| download.id == download_id)
            .cloned()
            .ok_or_else(|| AppError::not_found("download_not_found", "download was not found"))
    }

    pub async fn trigger_download(
        &self,
        request: TriggerDownloadRequest,
    ) -> AppResult<DownloadItem> {
        if request.file_id.trim().is_empty() {
            return Err(AppError::bad_request(
                "missing_file_id",
                "fileId is required",
            ));
        }

        let file_id = request.file_id.trim().to_string();
        let message_id = request.message_id;
        let file_name = request.file_name;
        let requested_size_bytes = request.size_bytes;
        let has_message_context = message_id
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty());

        if let Some(existing_id) = self
            .download_id_for_scope(&file_id, message_id.as_deref())
            .await?
        {
            self.update_download_metadata(
                &existing_id,
                message_id.as_deref(),
                file_name.as_deref(),
                requested_size_bytes,
            )
            .await?;
            return self.request_or_queue_download(&existing_id, &file_id).await;
        }

        let cache_path = self.cached_file_path(&file_id);
        let cached_size = tokio::fs::metadata(&cache_path)
            .await
            .ok()
            .map(|metadata| metadata.len());
        let now = now_rfc3339();
        let (status, downloaded_bytes, proxy_url, error, should_request_download) =
            if let Some(size) = cached_size {
                (
                    DownloadStatus::Ready,
                    size,
                    Some(proxy_url_for_file(&file_id)),
                    None,
                    false,
                )
            } else if file_id.parse::<i32>().is_err() && !has_message_context {
                (
                    DownloadStatus::Failed,
                    0,
                    None,
                    Some(
                        "download requires a numeric TDLib file id from a Telegram media message"
                            .to_string(),
                    ),
                    false,
                )
            } else {
                match self.telegram_credentials().await {
                    Ok(_) => (DownloadStatus::Queued, 0, None, None, true),
                    Err(error) => (
                        DownloadStatus::Failed,
                        0,
                        None,
                        Some(format!(
                            "download requires the TDLib media integration phase: {error}"
                        )),
                        false,
                    ),
                }
            };

        let download = DownloadItem {
            id: crate::models::new_id("download"),
            file_id,
            message_id,
            file_name,
            mime_type: None,
            size_bytes: cached_size.or(requested_size_bytes),
            downloaded_bytes,
            status,
            proxy_url,
            error,
        };

        sqlx::query(
            "INSERT INTO downloads \
             (id, file_id, message_id, file_name, mime_type, size_bytes, downloaded_bytes, status, error, created_at, updated_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&download.id)
        .bind(&download.file_id)
        .bind(&download.message_id)
        .bind(&download.file_name)
        .bind(&download.mime_type)
        .bind(download.size_bytes.map(|value| value as i64))
        .bind(download.downloaded_bytes as i64)
        .bind(download_status_to_db(&download.status))
        .bind(&download.error)
        .bind(&now)
        .bind(&now)
        .execute(&self.db)
        .await?;

        let bot_id = self
            .message_bot_id(download.message_id.as_deref())
            .await?
            .or_else(|| self.bot_id_for_file(&download.file_id));

        {
            let mut runtime = self.runtime.write().await;
            runtime.downloads.insert(0, download.clone());
        }

        self.emit(download_event_for_item(download.clone(), bot_id));

        if should_request_download {
            return self
                .request_or_queue_download(&download.id, &download.file_id)
                .await;
        }

        Ok(download)
    }

    pub async fn pause_download(&self, download_id: &str) -> AppResult<DownloadItem> {
        let download = self.download(download_id).await?;
        self.cancel_tdlib_download(&download.file_id).await;
        self.update_download_status(download_id, DownloadStatus::Paused, None)
            .await
    }

    pub async fn resume_download(&self, download_id: &str) -> AppResult<DownloadItem> {
        let download = self.download(download_id).await?;
        self.request_or_queue_download(download_id, &download.file_id)
            .await
    }

    pub async fn stop_download(&self, download_id: &str) -> AppResult<DownloadItem> {
        let download = self.download(download_id).await?;
        self.cancel_tdlib_download(&download.file_id).await;
        self.update_download_status(download_id, DownloadStatus::Stopped, None)
            .await
    }

    async fn request_tdlib_download(&self, file_id: &str) -> AppResult<()> {
        let file_id_number = file_id.parse::<i32>().map_err(|_| {
            AppError::bad_request(
                "invalid_tdlib_file_id",
                "download requires a numeric TDLib file id from a Telegram media message",
            )
        })?;
        let credentials = self.telegram_credentials().await?;
        self.telegram_bridge.send_request(
            credentials,
            json!({
                "@type": "downloadFile",
                "@extra": format!("download:{file_id}"),
                "file_id": file_id_number,
                "priority": 16,
                "offset": 0,
                "limit": 0,
                "synchronous": false,
            }),
        )
    }

    async fn request_tdlib_message_for_download(
        &self,
        download_id: &str,
        file_id: &str,
        context: DownloadMessageContext,
    ) -> AppResult<DownloadItem> {
        let credentials = self.telegram_credentials().await?;
        match self.telegram_bridge.send_request(
            credentials,
            json!({
                "@type": "getMessage",
                "@extra": format!("download_message:{download_id}:{file_id}"),
                "chat_id": context.telegram_chat_id,
                "message_id": context.telegram_message_id,
            }),
        ) {
            Ok(()) => {
                self.update_download_status(
                    download_id,
                    DownloadStatus::Queued,
                    Some("resolving Telegram message media before download".to_string()),
                )
                .await
            }
            Err(error) => {
                self.update_download_status(
                    download_id,
                    DownloadStatus::Queued,
                    Some(format!(
                        "waiting to resolve Telegram message media before download: {error}"
                    )),
                )
                .await
            }
        }
    }

    async fn telegram_download_runtime_ready(&self) -> bool {
        if !self.telegram_bridge.is_runtime_started() {
            return false;
        }

        let runtime = self.runtime.read().await;
        runtime.telegram.auth_state == TelegramAuthState::Ready
            && runtime.telegram.tdlib_state == TdlibRuntimeState::Running
    }

    async fn ensure_download_runtime_started(&self) -> AppResult<()> {
        if self.telegram_bridge.is_runtime_started() {
            return Ok(());
        }

        let credentials = self.telegram_credentials().await?;
        self.telegram_bridge.reconnect(credentials)?;
        self.mark_telegram_status(
            TelegramAuthState::Reconnecting,
            TdlibRuntimeState::Reconnecting,
            None,
            None,
        )
        .await?;
        Ok(())
    }

    async fn request_resolved_tdlib_download(
        &self,
        download_id: &str,
        file_id: &str,
    ) -> AppResult<DownloadItem> {
        match self.request_tdlib_download(file_id).await {
            Ok(()) => {
                self.update_download_status(download_id, DownloadStatus::Downloading, None)
                    .await
            }
            Err(error @ AppError::BadRequest { .. }) => Err(error),
            Err(error) => {
                self.update_download_status(
                    download_id,
                    DownloadStatus::Queued,
                    Some(format!("waiting for Telegram download runtime: {error}")),
                )
                .await
            }
        }
    }

    async fn request_or_queue_download(
        &self,
        download_id: &str,
        file_id: &str,
    ) -> AppResult<DownloadItem> {
        if tokio::fs::metadata(self.cached_file_path(file_id))
            .await
            .is_ok()
        {
            return self
                .mark_download_ready_from_cache(download_id, file_id)
                .await;
        }

        if !self.telegram_download_runtime_ready().await {
            return match self.ensure_download_runtime_started().await {
                Ok(()) => {
                    self.update_download_status(
                        download_id,
                        DownloadStatus::Queued,
                        Some(
                            "waiting for Telegram download runtime: Telegram account is not ready"
                                .to_string(),
                        ),
                    )
                    .await
                }
                Err(error @ AppError::Conflict { .. }) => {
                    self.update_download_status(
                        download_id,
                        DownloadStatus::Failed,
                        Some(format!(
                            "download requires the TDLib media integration phase: {error}"
                        )),
                    )
                    .await
                }
                Err(error) => {
                    self.update_download_status(
                        download_id,
                        DownloadStatus::Queued,
                        Some(format!("waiting for Telegram download runtime: {error}")),
                    )
                    .await
                }
            };
        }

        let download = self.download(download_id).await?;
        if download
            .message_id
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
        {
            if let Some(context) = self.download_message_context(&download).await? {
                return self
                    .request_tdlib_message_for_download(download_id, file_id, context)
                    .await;
            }

            return self
                .update_download_status(
                    download_id,
                    DownloadStatus::Failed,
                    Some(
                        "download cannot safely resolve the original Telegram message; refresh history and retry"
                            .to_string(),
                    ),
                )
                .await;
        }

        self.request_resolved_tdlib_download(download_id, file_id)
            .await
    }

    async fn mark_download_ready_from_cache(
        &self,
        download_id: &str,
        file_id: &str,
    ) -> AppResult<DownloadItem> {
        let size = tokio::fs::metadata(self.cached_file_path(file_id))
            .await?
            .len();
        let now = now_rfc3339();
        sqlx::query(
            "UPDATE downloads SET downloaded_bytes = ?, size_bytes = COALESCE(size_bytes, ?), \
             status = 'ready', error = NULL, updated_at = ? WHERE id = ?",
        )
        .bind(size as i64)
        .bind(size as i64)
        .bind(&now)
        .bind(download_id)
        .execute(&self.db)
        .await?;

        self.refresh_download_after_update(download_id).await
    }

    async fn cancel_tdlib_download(&self, file_id: &str) {
        let Ok(file_id_number) = file_id.parse::<i32>() else {
            return;
        };
        let Ok(credentials) = self.telegram_credentials().await else {
            return;
        };
        if let Err(error) = self.telegram_bridge.send_request(
            credentials,
            json!({
                "@type": "cancelDownloadFile",
                "file_id": file_id_number,
                "only_if_pending": false,
            }),
        ) {
            tracing::warn!(%error, file_id, "failed to request TDLib download cancellation");
        }
    }

    async fn update_download_status(
        &self,
        download_id: &str,
        status: DownloadStatus,
        error: Option<String>,
    ) -> AppResult<DownloadItem> {
        let now = now_rfc3339();
        sqlx::query("UPDATE downloads SET status = ?, error = ?, updated_at = ? WHERE id = ?")
            .bind(download_status_to_db(&status))
            .bind(&error)
            .bind(&now)
            .bind(download_id)
            .execute(&self.db)
            .await?;

        self.refresh_download_after_update(download_id).await
    }

    async fn refresh_download_after_update(&self, download_id: &str) -> AppResult<DownloadItem> {
        let updated = sqlx::query(
            "SELECT id, file_id, message_id, file_name, mime_type, size_bytes, downloaded_bytes, status, error \
             FROM downloads WHERE id = ? LIMIT 1",
        )
        .bind(download_id)
        .fetch_optional(&self.db)
        .await?
        .map(download_from_row)
        .transpose()?
        .ok_or_else(|| AppError::not_found("download_not_found", "download was not found"))?;

        {
            let mut runtime = self.runtime.write().await;
            if let Some(existing) = runtime
                .downloads
                .iter_mut()
                .find(|download| download.id == updated.id)
            {
                *existing = updated.clone();
            } else {
                runtime.downloads.insert(0, updated.clone());
            }
        }

        let bot_id = self
            .message_bot_id(updated.message_id.as_deref())
            .await?
            .or_else(|| self.bot_id_for_file(&updated.file_id));
        self.emit(download_event_for_item(updated.clone(), bot_id));

        Ok(updated)
    }

    async fn download_id_for_scope(
        &self,
        file_id: &str,
        message_id: Option<&str>,
    ) -> AppResult<Option<String>> {
        sqlx::query(
            "SELECT id FROM downloads \
             WHERE file_id = ? AND ((message_id = ?) OR (message_id IS NULL AND ? IS NULL)) \
             ORDER BY updated_at DESC, created_at DESC LIMIT 1",
        )
        .bind(file_id)
        .bind(message_id)
        .bind(message_id)
        .fetch_optional(&self.db)
        .await?
        .map(|row| row.try_get("id"))
        .transpose()
        .map_err(AppError::from)
    }

    async fn download_message_context(
        &self,
        download: &DownloadItem,
    ) -> AppResult<Option<DownloadMessageContext>> {
        let Some(message_id) = download
            .message_id
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        else {
            return Ok(None);
        };

        let Some(row) = sqlx::query(
            "SELECT telegram_chat_id, telegram_message_id FROM chat_messages \
             WHERE is_ephemeral = 0 AND (id = ? OR telegram_message_id = ?) LIMIT 1",
        )
        .bind(message_id)
        .bind(message_id)
        .fetch_optional(&self.db)
        .await?
        else {
            return Ok(None);
        };

        let telegram_chat_id: String = row.try_get("telegram_chat_id")?;
        let telegram_message_id: Option<String> = row.try_get("telegram_message_id")?;
        let Some(telegram_message_id) =
            telegram_message_id.filter(|value| !value.trim().is_empty())
        else {
            return Ok(None);
        };

        let telegram_chat_id = telegram_chat_id.parse::<i64>().map_err(|_| {
            AppError::bad_request(
                "invalid_telegram_chat_id",
                "message has an invalid Telegram chat id",
            )
        })?;
        let telegram_message_id = telegram_message_id.parse::<i64>().map_err(|_| {
            AppError::bad_request(
                "invalid_telegram_message_id",
                "message has an invalid Telegram message id",
            )
        })?;

        Ok(Some(DownloadMessageContext {
            telegram_chat_id,
            telegram_message_id,
        }))
    }

    async fn update_download_metadata(
        &self,
        download_id: &str,
        message_id: Option<&str>,
        file_name: Option<&str>,
        size_bytes: Option<u64>,
    ) -> AppResult<()> {
        sqlx::query(
            "UPDATE downloads SET \
             message_id = COALESCE(message_id, ?), \
             file_name = COALESCE(?, file_name), \
             size_bytes = COALESCE(size_bytes, ?) \
             WHERE id = ?",
        )
        .bind(message_id)
        .bind(file_name)
        .bind(size_bytes.map(|value| value as i64))
        .bind(download_id)
        .execute(&self.db)
        .await?;
        Ok(())
    }

    async fn update_download_file_identity(
        &self,
        download_id: &str,
        file_id: &str,
        size_bytes: Option<u64>,
    ) -> AppResult<DownloadItem> {
        let now = now_rfc3339();
        sqlx::query(
            "UPDATE downloads SET file_id = ?, size_bytes = COALESCE(size_bytes, ?), updated_at = ? \
             WHERE id = ?",
        )
        .bind(file_id)
        .bind(size_bytes.map(|value| value as i64))
        .bind(&now)
        .bind(download_id)
        .execute(&self.db)
        .await?;

        self.refresh_download_after_update(download_id).await
    }

    pub async fn cached_file_bytes(&self, file_id: &str) -> AppResult<Vec<u8>> {
        if file_id.trim().is_empty() {
            return Err(AppError::bad_request(
                "missing_file_id",
                "fileId is required",
            ));
        }

        let path = self.cached_file_path(file_id.trim());
        match tokio::fs::read(path).await {
            Ok(bytes) => Ok(bytes),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Err(AppError::not_found(
                "file_not_cached",
                "file is not available in the server media cache yet",
            )),
            Err(error) => Err(error.into()),
        }
    }

    pub async fn clear_download_cache(&self) -> AppResult<ClearDownloadCacheResponse> {
        let mut removed_files = 0_u64;
        let mut removed_bytes = 0_u64;

        match tokio::fs::read_dir(&self.config.media_cache_path).await {
            Ok(mut entries) => {
                while let Some(entry) = entries.next_entry().await? {
                    let file_type = entry.file_type().await?;
                    if !file_type.is_file() {
                        continue;
                    }

                    let size = entry
                        .metadata()
                        .await
                        .map(|metadata| metadata.len())
                        .unwrap_or(0);
                    tokio::fs::remove_file(entry.path()).await?;
                    removed_files += 1;
                    removed_bytes += size;
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                tokio::fs::create_dir_all(&self.config.media_cache_path).await?;
            }
            Err(error) => return Err(error.into()),
        }

        let now = now_rfc3339();
        let expired_downloads = sqlx::query(
            "UPDATE downloads SET status = 'expired', downloaded_bytes = 0, error = NULL, updated_at = ? \
             WHERE status = 'ready'",
        )
        .bind(&now)
        .execute(&self.db)
        .await?
        .rows_affected();

        let rows = sqlx::query(
            "SELECT id, file_id, message_id, file_name, mime_type, size_bytes, downloaded_bytes, status, error \
             FROM downloads ORDER BY updated_at DESC, created_at DESC",
        )
        .fetch_all(&self.db)
        .await?;
        let downloads = rows
            .into_iter()
            .map(download_from_row)
            .collect::<AppResult<Vec<_>>>()?;

        {
            let mut runtime = self.runtime.write().await;
            runtime.downloads = downloads.clone();
        }

        for download in downloads
            .into_iter()
            .filter(|download| download.status == DownloadStatus::Expired)
        {
            let bot_id = self
                .message_bot_id(download.message_id.as_deref())
                .await?
                .or_else(|| self.bot_id_for_file(&download.file_id));
            self.emit(download_event_for_item(download, bot_id));
        }

        Ok(ClearDownloadCacheResponse {
            removed_files,
            removed_bytes,
            expired_downloads,
        })
    }

    pub async fn download_cache_summary(&self) -> AppResult<DownloadCacheSummary> {
        let (total_cached_files, total_cached_bytes) = self.media_cache_totals().await?;
        let cleanup_interval_hours = self
            .runtime
            .read()
            .await
            .settings
            .cache_cleanup_interval_hours;
        let rows = sqlx::query(
            "SELECT id, file_id, message_id, file_name, mime_type, size_bytes, downloaded_bytes, \
             status, error, updated_at \
             FROM downloads ORDER BY updated_at DESC, created_at DESC",
        )
        .fetch_all(&self.db)
        .await?;
        let workspace_files = self.workspace_files().await;
        let mut items = Vec::new();
        let mut seen = HashSet::new();

        for row in rows {
            let updated_at: String = row.try_get("updated_at")?;
            let download = download_from_row(row)?;
            let workspace_file = workspace_files.iter().find(|file| {
                file.file_id == download.file_id
                    && download
                        .message_id
                        .as_deref()
                        .map(|message_id| message_id == file.message_id)
                        .unwrap_or(true)
            });
            let file_name = download
                .file_name
                .clone()
                .or_else(|| workspace_file.map(|file| file.file_name.clone()));
            let mime_type = download
                .mime_type
                .clone()
                .or_else(|| workspace_file.map(|file| file.mime_type.clone()));
            let size_bytes = download.size_bytes.or_else(|| {
                workspace_file
                    .map(|file| file.size_bytes)
                    .filter(|value| *value > 0)
            });
            let (server_file_exists, cached_bytes) =
                self.cached_file_state(&download.file_id).await?;
            items.push(DownloadCacheItem {
                id: download.id.clone(),
                download_id: Some(download.id.clone()),
                file_id: download.file_id.clone(),
                message_id: download
                    .message_id
                    .clone()
                    .or_else(|| workspace_file.map(|file| file.message_id.clone())),
                bot_id: workspace_file.map(|file| file.bot_id.clone()),
                file_name,
                mime_type,
                size_bytes,
                downloaded_bytes: download.downloaded_bytes,
                status: Some(download.status.clone()),
                proxy_url: server_file_exists.then(|| proxy_url_for_file(&download.file_id)),
                cached_bytes,
                server_file_exists,
                updated_at,
            });
            seen.insert((download.file_id, download.message_id.unwrap_or_default()));
        }

        for file in workspace_files {
            let key = (file.file_id.clone(), file.message_id.clone());
            if seen.contains(&key) {
                continue;
            }

            let (server_file_exists, cached_bytes) = self.cached_file_state(&file.file_id).await?;
            items.push(DownloadCacheItem {
                id: file.id.clone(),
                download_id: None,
                file_id: file.file_id.clone(),
                message_id: Some(file.message_id.clone()),
                bot_id: Some(file.bot_id.clone()),
                file_name: Some(file.file_name),
                mime_type: Some(file.mime_type),
                size_bytes: (file.size_bytes > 0).then_some(file.size_bytes),
                downloaded_bytes: cached_bytes,
                status: None,
                proxy_url: server_file_exists.then(|| proxy_url_for_file(&file.file_id)),
                cached_bytes,
                server_file_exists,
                updated_at: file.received_at,
            });
        }

        items.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));

        Ok(DownloadCacheSummary {
            total_cached_files,
            total_cached_bytes,
            cleanup_interval_hours,
            items,
        })
    }

    pub async fn clear_download_cache_file(
        &self,
        file_id: &str,
    ) -> AppResult<ClearDownloadCacheResponse> {
        if file_id.trim().is_empty() {
            return Err(AppError::bad_request(
                "missing_file_id",
                "fileId is required",
            ));
        }

        let file_id = file_id.trim();
        let mut removed_files = 0_u64;
        let mut removed_bytes = 0_u64;
        let path = self.cached_file_path(file_id);
        match tokio::fs::metadata(&path).await {
            Ok(metadata) => {
                removed_bytes = metadata.len();
                tokio::fs::remove_file(path).await?;
                removed_files = 1;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }

        let now = now_rfc3339();
        let expired_downloads = sqlx::query(
            "UPDATE downloads SET status = 'expired', downloaded_bytes = 0, error = NULL, updated_at = ? \
             WHERE file_id = ? AND status = 'ready'",
        )
        .bind(&now)
        .bind(file_id)
        .execute(&self.db)
        .await?
        .rows_affected();

        let rows = sqlx::query(
            "SELECT id, file_id, message_id, file_name, mime_type, size_bytes, downloaded_bytes, status, error \
             FROM downloads WHERE file_id = ?",
        )
        .bind(file_id)
        .fetch_all(&self.db)
        .await?;
        let refreshed = rows
            .into_iter()
            .map(download_from_row)
            .collect::<AppResult<Vec<_>>>()?;

        {
            let mut runtime = self.runtime.write().await;
            for updated in &refreshed {
                if let Some(existing) = runtime
                    .downloads
                    .iter_mut()
                    .find(|download| download.id == updated.id)
                {
                    *existing = updated.clone();
                }
            }
        }

        for download in refreshed
            .into_iter()
            .filter(|download| download.status == DownloadStatus::Expired)
        {
            let bot_id = self
                .message_bot_id(download.message_id.as_deref())
                .await?
                .or_else(|| self.bot_id_for_file(&download.file_id));
            self.emit(download_event_for_item(download, bot_id));
        }

        Ok(ClearDownloadCacheResponse {
            removed_files,
            removed_bytes,
            expired_downloads,
        })
    }

    async fn media_cache_totals(&self) -> AppResult<(u64, u64)> {
        let mut files = 0_u64;
        let mut bytes = 0_u64;
        match tokio::fs::read_dir(&self.config.media_cache_path).await {
            Ok(mut entries) => {
                while let Some(entry) = entries.next_entry().await? {
                    let file_type = entry.file_type().await?;
                    if !file_type.is_file() {
                        continue;
                    }
                    files += 1;
                    bytes += entry
                        .metadata()
                        .await
                        .map(|metadata| metadata.len())
                        .unwrap_or(0);
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                tokio::fs::create_dir_all(&self.config.media_cache_path).await?;
            }
            Err(error) => return Err(error.into()),
        }

        Ok((files, bytes))
    }

    async fn cached_file_state(&self, file_id: &str) -> AppResult<(bool, u64)> {
        match tokio::fs::metadata(self.cached_file_path(file_id)).await {
            Ok(metadata) => Ok((true, metadata.len())),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok((false, 0)),
            Err(error) => Err(error.into()),
        }
    }

    pub(crate) fn cached_file_path(&self, file_id: &str) -> std::path::PathBuf {
        self.config
            .media_cache_path
            .join(format!("{}.bin", hex_sha256(file_id.as_bytes())))
    }

    async fn message_bot_id(&self, message_id: Option<&str>) -> AppResult<Option<String>> {
        let Some(message_id) = message_id.filter(|value| !value.trim().is_empty()) else {
            return Ok(None);
        };

        sqlx::query(
            "SELECT bot_id FROM chat_messages \
             WHERE is_ephemeral = 0 AND (id = ? OR telegram_message_id = ?) LIMIT 1",
        )
        .bind(message_id)
        .bind(message_id)
        .fetch_optional(&self.db)
        .await?
        .map(|row| row.try_get("bot_id"))
        .transpose()
        .map_err(AppError::from)
    }

    async fn message_id_visible_to_session(
        &self,
        bot_id: Option<&str>,
        message_id: &str,
        session: &AuthSession,
    ) -> AppResult<bool> {
        if session.user.role == crate::models::AuthRole::Admin {
            return Ok(true);
        }

        let Some(bot_id) = bot_id.filter(|value| !value.trim().is_empty()) else {
            return Ok(false);
        };

        let visible = sqlx::query(
            "SELECT 1 FROM chat_messages \
             WHERE bot_id = ? AND is_ephemeral = 0 AND visible_to_internal_user_id = ? \
               AND (id = ? OR telegram_message_id = ?) LIMIT 1",
        )
        .bind(bot_id)
        .bind(&session.user.id)
        .bind(message_id)
        .bind(message_id)
        .fetch_optional(&self.db)
        .await?
        .is_some();

        Ok(visible)
    }

    pub async fn file_visible_to_session(
        &self,
        session: &AuthSession,
        file_id: &str,
    ) -> AppResult<bool> {
        if session.user.role == crate::models::AuthRole::Admin {
            return Ok(true);
        }

        let media_pattern = format!("%{}%", file_id.replace('%', "\\%").replace('_', "\\_"));
        let visible_in_message = sqlx::query(
            "SELECT 1 FROM chat_messages \
             WHERE is_ephemeral = 0 AND visible_to_internal_user_id = ? \
               AND media_json LIKE ? ESCAPE '\\' LIMIT 1",
        )
        .bind(&session.user.id)
        .bind(media_pattern)
        .fetch_optional(&self.db)
        .await?
        .is_some();
        if visible_in_message {
            return Ok(true);
        }

        let rows = sqlx::query("SELECT message_id FROM downloads WHERE file_id = ?")
            .bind(file_id)
            .fetch_all(&self.db)
            .await?;

        for row in rows {
            let message_id: Option<String> = row.try_get("message_id")?;
            if let Some(message_id) = message_id {
                let bot_id = self.message_bot_id(Some(&message_id)).await?;
                if self
                    .message_id_visible_to_session(bot_id.as_deref(), &message_id, session)
                    .await?
                {
                    return Ok(true);
                }
            }
        }

        Ok(false)
    }

    fn bot_id_for_file(&self, file_id: &str) -> Option<String> {
        self.runtime.try_read().ok().and_then(|runtime| {
            runtime
                .workspace_files
                .iter()
                .find_map(|file| (file.file_id == file_id).then(|| file.bot_id.clone()))
        })
    }

    pub async fn workspace_files(&self) -> Vec<WorkspaceFile> {
        self.runtime.read().await.workspace_files.clone()
    }

    pub async fn workspace_files_for_session(
        &self,
        session: &AuthSession,
    ) -> AppResult<Vec<WorkspaceFile>> {
        let files = self.workspace_files().await;
        if session.user.role == crate::models::AuthRole::Admin {
            return Ok(files);
        }

        let mut visible = Vec::with_capacity(files.len());
        for file in files {
            if self
                .message_id_visible_to_session(Some(&file.bot_id), &file.message_id, session)
                .await?
            {
                visible.push(file);
            }
        }

        Ok(visible)
    }

    pub async fn update_workspace_file_status(
        &self,
        file_id: &str,
        status: WorkspaceFileStatus,
    ) -> AppResult<WorkspaceFile> {
        let updated = sqlx::query(
            "UPDATE workspace_files SET status = ? WHERE id = ? OR file_id = ? RETURNING \
             id, bot_id, message_id, file_id, file_name, mime_type, size_bytes, sender_name, \
             received_at, status, tag, thumbnail_url",
        )
        .bind(workspace_file_status_to_db(&status))
        .bind(file_id)
        .bind(file_id)
        .fetch_optional(&self.db)
        .await?
        .map(workspace_file_from_row)
        .transpose()?;

        let Some(updated) = updated else {
            return Err(AppError::not_found(
                "workspace_file_not_found",
                "workspace file was not found",
            ));
        };

        {
            let mut runtime = self.runtime.write().await;
            if let Some(file) = runtime
                .workspace_files
                .iter_mut()
                .find(|file| file.id == updated.id)
            {
                *file = updated.clone();
            }
        }

        Ok(updated)
    }

    pub async fn update_workspace_file_tag(
        &self,
        file_id: &str,
        tag: String,
    ) -> AppResult<WorkspaceFile> {
        let tag = tag.trim().to_string();
        let updated = sqlx::query(
            "UPDATE workspace_files SET tag = ? WHERE id = ? OR file_id = ? RETURNING \
             id, bot_id, message_id, file_id, file_name, mime_type, size_bytes, sender_name, \
             received_at, status, tag, thumbnail_url",
        )
        .bind(if tag.is_empty() { None } else { Some(tag) })
        .bind(file_id)
        .bind(file_id)
        .fetch_optional(&self.db)
        .await?
        .map(workspace_file_from_row)
        .transpose()?;

        let Some(updated) = updated else {
            return Err(AppError::not_found(
                "workspace_file_not_found",
                "workspace file was not found",
            ));
        };

        {
            let mut runtime = self.runtime.write().await;
            if let Some(file) = runtime
                .workspace_files
                .iter_mut()
                .find(|file| file.id == updated.id)
            {
                *file = updated.clone();
            }
        }

        Ok(updated)
    }
}

#[derive(Debug, Clone)]
struct MessageVisibilityOwner {
    owner_id: Option<String>,
    user: Option<InternalUser>,
}

fn message_visible_to_session(message: &ChatMessage, session: &AuthSession) -> bool {
    session.user.role == crate::models::AuthRole::Admin
        || message
            .sent_by_internal_user
            .as_ref()
            .is_some_and(|user| user.id == session.user.id)
}

fn message_visibility_owner_from_row(
    row: sqlx::sqlite::SqliteRow,
) -> AppResult<MessageVisibilityOwner> {
    let owner_id: Option<String> = row.try_get("visible_to_internal_user_id")?;
    let sent_by_internal_user_json: Option<String> = row.try_get("sent_by_internal_user_json")?;
    let user = parse_optional_json::<InternalUser>(sent_by_internal_user_json.as_deref())?;

    Ok(MessageVisibilityOwner { owner_id, user })
}

fn chat_message_from_row(row: sqlx::sqlite::SqliteRow) -> AppResult<ChatMessage> {
    let entities_json: String = row.try_get("entities_json")?;
    let media_json: Option<String> = row.try_get("media_json")?;
    let sent_by_internal_user_json: Option<String> = row.try_get("sent_by_internal_user_json")?;
    let inline_keyboard_json: Option<String> = row.try_get("inline_keyboard_json")?;
    let raw_available = row
        .try_get::<Option<i64>, _>("raw_available")?
        .map(|value| value != 0);

    Ok(ChatMessage {
        id: row.try_get("id")?,
        telegram_message_id: row.try_get("telegram_message_id")?,
        bot_id: row.try_get("bot_id")?,
        direction: message_direction_from_db(row.try_get::<String, _>("direction")?.as_str()),
        text: row.try_get("text")?,
        entities: serde_json::from_str::<Vec<TelegramEntity>>(&entities_json)?,
        media: parse_optional_json::<Vec<MessageMedia>>(media_json.as_deref())?,
        sent_by_internal_user: parse_optional_json::<InternalUser>(
            sent_by_internal_user_json.as_deref(),
        )?,
        status: message_status_from_db(row.try_get::<String, _>("status")?.as_str()),
        created_at: row.try_get("created_at")?,
        edited_at: row.try_get("edited_at")?,
        reply_to_message_id: row.try_get("reply_to_message_id")?,
        raw_available,
        inline_keyboard: parse_optional_json::<InlineKeyboardMarkup>(
            inline_keyboard_json.as_deref(),
        )?,
    })
}

fn workspace_file_from_row(row: sqlx::sqlite::SqliteRow) -> AppResult<WorkspaceFile> {
    Ok(WorkspaceFile {
        id: row.try_get("id")?,
        bot_id: row.try_get("bot_id")?,
        message_id: row.try_get("message_id")?,
        file_id: row.try_get("file_id")?,
        file_name: row.try_get("file_name")?,
        mime_type: row.try_get("mime_type")?,
        size_bytes: u64::try_from(row.try_get::<i64, _>("size_bytes")?).unwrap_or_default(),
        sender_name: row.try_get("sender_name")?,
        received_at: row.try_get("received_at")?,
        status: workspace_file_status_from_db(row.try_get::<String, _>("status")?.as_str()),
        tag: row.try_get("tag")?,
        thumbnail_url: row.try_get("thumbnail_url")?,
    })
}

fn workspace_files_for_message(message: &ChatMessage) -> Vec<WorkspaceFile> {
    let Some(media) = message.media.as_ref() else {
        return Vec::new();
    };

    media
        .iter()
        .filter_map(|media| workspace_file_for_media(message, media))
        .collect()
}

fn workspace_file_for_media(message: &ChatMessage, media: &MessageMedia) -> Option<WorkspaceFile> {
    let metadata = workspace_file_metadata(media)?;
    let sender_name = message
        .sent_by_internal_user
        .as_ref()
        .map(|user| user.display_name.clone())
        .unwrap_or_else(|| "Telegram Bot".to_string());

    Some(WorkspaceFile {
        id: workspace_file_local_id(&message.id, &metadata.file_id),
        bot_id: message.bot_id.clone(),
        message_id: message.id.clone(),
        file_id: metadata.file_id,
        file_name: metadata.file_name,
        mime_type: metadata.mime_type,
        size_bytes: metadata.size_bytes,
        sender_name,
        received_at: message.created_at.clone(),
        status: WorkspaceFileStatus::Pending,
        tag: None,
        thumbnail_url: metadata.thumbnail_url,
    })
}

#[derive(Debug, Clone)]
struct WorkspaceFileMetadata {
    file_id: String,
    file_name: String,
    mime_type: String,
    size_bytes: u64,
    thumbnail_url: Option<String>,
}

fn workspace_file_metadata(media: &MessageMedia) -> Option<WorkspaceFileMetadata> {
    match media {
        MessageMedia::Photo { file_id, .. } => Some(WorkspaceFileMetadata {
            file_id: file_id.clone(),
            file_name: format!("telegram_photo_{}.jpg", short_stable_segment(file_id)),
            mime_type: "image/jpeg".to_string(),
            size_bytes: 0,
            thumbnail_url: Some(proxy_url_for_file(file_id)),
        }),
        MessageMedia::Video {
            file_id,
            thumbnail_url,
            ..
        } => Some(WorkspaceFileMetadata {
            file_id: file_id.clone(),
            file_name: format!("telegram_video_{}.mp4", short_stable_segment(file_id)),
            mime_type: "video/mp4".to_string(),
            size_bytes: 0,
            thumbnail_url: thumbnail_url.clone(),
        }),
        MessageMedia::Audio {
            file_id,
            title,
            performer,
            ..
        } => Some(WorkspaceFileMetadata {
            file_id: file_id.clone(),
            file_name: audio_file_name(title.as_deref(), performer.as_deref()),
            mime_type: "audio/mpeg".to_string(),
            size_bytes: 0,
            thumbnail_url: None,
        }),
        MessageMedia::Voice { file_id, .. } => Some(WorkspaceFileMetadata {
            file_id: file_id.clone(),
            file_name: format!("voice_note_{}.ogg", short_stable_segment(file_id)),
            mime_type: "audio/ogg".to_string(),
            size_bytes: 0,
            thumbnail_url: None,
        }),
        MessageMedia::Document {
            file_id,
            file_name,
            mime_type,
            size_bytes,
        } => Some(WorkspaceFileMetadata {
            file_id: file_id.clone(),
            file_name: file_name
                .clone()
                .unwrap_or_else(|| format!("document_{}.bin", short_stable_segment(file_id))),
            mime_type: mime_type
                .clone()
                .unwrap_or_else(|| "application/octet-stream".to_string()),
            size_bytes: size_bytes.unwrap_or(0),
            thumbnail_url: None,
        }),
        MessageMedia::Sticker {
            file_id,
            thumbnail_url,
            ..
        } => Some(WorkspaceFileMetadata {
            file_id: file_id.clone(),
            file_name: format!("sticker_{}.webp", short_stable_segment(file_id)),
            mime_type: "image/webp".to_string(),
            size_bytes: 0,
            thumbnail_url: thumbnail_url.clone(),
        }),
        MessageMedia::Animation {
            file_id,
            thumbnail_url,
            ..
        } => Some(WorkspaceFileMetadata {
            file_id: file_id.clone(),
            file_name: format!("animation_{}.mp4", short_stable_segment(file_id)),
            mime_type: "video/mp4".to_string(),
            size_bytes: 0,
            thumbnail_url: thumbnail_url.clone(),
        }),
        MessageMedia::Unknown {
            file_id: Some(file_id),
            label,
        } => Some(WorkspaceFileMetadata {
            file_id: file_id.clone(),
            file_name: format!(
                "{}_{}.bin",
                stable_identifier_segment(label),
                short_stable_segment(file_id)
            ),
            mime_type: "application/octet-stream".to_string(),
            size_bytes: 0,
            thumbnail_url: None,
        }),
        MessageMedia::Location { .. } | MessageMedia::Unknown { file_id: None, .. } => None,
    }
}

fn workspace_file_local_id(message_id: &str, file_id: &str) -> String {
    format!(
        "file_{}_{}",
        stable_identifier_segment(message_id),
        stable_identifier_segment(file_id)
    )
}

fn short_stable_segment(value: &str) -> String {
    stable_identifier_segment(value).chars().take(10).collect()
}

fn audio_file_name(title: Option<&str>, performer: Option<&str>) -> String {
    let mut parts = Vec::new();
    if let Some(performer) = performer.filter(|value| !value.trim().is_empty()) {
        parts.push(performer.trim());
    }
    if let Some(title) = title.filter(|value| !value.trim().is_empty()) {
        parts.push(title.trim());
    }
    let base = if parts.is_empty() {
        "audio".to_string()
    } else {
        stable_identifier_segment(&parts.join(" - "))
    };
    format!("{base}.mp3")
}

fn download_from_row(row: sqlx::sqlite::SqliteRow) -> AppResult<DownloadItem> {
    let file_id: String = row.try_get("file_id")?;
    let status = download_status_from_db(row.try_get::<String, _>("status")?.as_str());
    let proxy_url = if status == DownloadStatus::Ready {
        Some(proxy_url_for_file(&file_id))
    } else {
        None
    };

    Ok(DownloadItem {
        id: row.try_get("id")?,
        file_id,
        message_id: row.try_get("message_id")?,
        file_name: row.try_get("file_name")?,
        mime_type: row.try_get("mime_type")?,
        size_bytes: row
            .try_get::<Option<i64>, _>("size_bytes")?
            .and_then(|value| u64::try_from(value).ok()),
        downloaded_bytes: u64::try_from(row.try_get::<i64, _>("downloaded_bytes")?)
            .unwrap_or_default(),
        status,
        proxy_url,
        error: row.try_get("error")?,
    })
}

fn download_event_for_item(download: DownloadItem, bot_id: Option<String>) -> AppEvent {
    match &download.status {
        DownloadStatus::Ready => AppEvent::DownloadReady {
            event_id: new_event_id(),
            bot_id,
            occurred_at: now_rfc3339(),
            download,
        },
        DownloadStatus::Failed => AppEvent::DownloadFailed {
            event_id: new_event_id(),
            bot_id,
            occurred_at: now_rfc3339(),
            download,
        },
        _ => AppEvent::DownloadProgress {
            event_id: new_event_id(),
            bot_id,
            occurred_at: now_rfc3339(),
            download,
        },
    }
}

fn parse_optional_json<T>(value: Option<&str>) -> AppResult<Option<T>>
where
    T: serde::de::DeserializeOwned,
{
    value
        .filter(|value| !value.trim().is_empty())
        .map(serde_json::from_str)
        .transpose()
        .map_err(AppError::from)
}

fn parse_download_message_extra(extra: &str) -> Option<DownloadMessageExtra> {
    let rest = extra.strip_prefix("download_message:")?;
    let (download_id, requested_file_id) = rest.split_once(':')?;
    if download_id.trim().is_empty() || requested_file_id.trim().is_empty() {
        return None;
    }

    Some(DownloadMessageExtra {
        download_id: download_id.to_string(),
        requested_file_id: requested_file_id.to_string(),
    })
}

fn proxy_url_for_file(file_id: &str) -> String {
    format!("/api/files/{}/proxy", percent_encode_path_segment(file_id))
}

fn percent_encode_path_segment(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                encoded.push(byte as char);
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

fn tdjson_value_type(value: &Value) -> Option<&str> {
    value.get("@type").and_then(Value::as_str)
}

fn discovered_chat_from_tdjson_chat_update(update: &Value) -> Option<DiscoveredTelegramChat> {
    let chat = update.get("chat")?;
    let telegram_chat_id = tdjson_id_to_string(chat.get("id"))?;
    let title = non_empty_string(chat.get("title"))
        .or_else(|| tdjson_username(chat))
        .unwrap_or_else(|| format!("Chat {telegram_chat_id}"));
    let chat_type = chat.get("type");
    let kind = match chat_type.and_then(tdjson_value_type).unwrap_or_default() {
        "chatTypePrivate" | "chatTypeSecret" => TelegramChatKind::User,
        "chatTypeBasicGroup" => TelegramChatKind::Group,
        "chatTypeSupergroup" => {
            if chat_type
                .and_then(|value| value.get("is_channel"))
                .and_then(Value::as_bool)
                .unwrap_or(false)
            {
                TelegramChatKind::Channel
            } else {
                TelegramChatKind::Group
            }
        }
        _ => TelegramChatKind::Unknown,
    };

    Some(DiscoveredTelegramChat {
        id: telegram_chat_id.clone(),
        telegram_chat_id,
        username: tdjson_username(chat),
        title,
        kind,
        is_bot: false,
        already_published: false,
        status: BotStatus::Unknown,
    })
}

fn discovered_bot_from_tdjson_user_update(update: &Value) -> Option<DiscoveredTelegramChat> {
    let user = update.get("user")?;
    let telegram_chat_id = tdjson_id_to_string(user.get("id"))?;
    let is_bot = user.get("is_bot").and_then(Value::as_bool).unwrap_or(false)
        || user
            .get("type")
            .and_then(tdjson_value_type)
            .is_some_and(|value_type| value_type == "userTypeBot");

    if !is_bot {
        return None;
    }

    let username = tdjson_username(user);
    let title = tdjson_user_display_name(user)
        .or_else(|| username.clone())
        .unwrap_or_else(|| format!("Bot {telegram_chat_id}"));

    Some(DiscoveredTelegramChat {
        id: telegram_chat_id.clone(),
        telegram_chat_id,
        username,
        title,
        kind: TelegramChatKind::Bot,
        is_bot: true,
        already_published: false,
        status: BotStatus::Available,
    })
}

fn tdjson_chat_private_user_id(chat: &Value) -> Option<i64> {
    chat.get("type")
        .filter(|chat_type| tdjson_value_type(chat_type) == Some("chatTypePrivate"))
        .and_then(|chat_type| tdjson_id_to_string(chat_type.get("user_id")))
        .or_else(|| tdjson_id_to_string(chat.get("id")))?
        .parse()
        .ok()
}

fn tdjson_user_display_name(user: &Value) -> Option<String> {
    let first_name = non_empty_string(user.get("first_name"));
    let last_name = non_empty_string(user.get("last_name"));
    let display_name = [first_name, last_name]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" ");

    (!display_name.is_empty()).then_some(display_name)
}

fn tdjson_username(value: &Value) -> Option<String> {
    non_empty_string(value.get("username")).or_else(|| {
        value
            .get("usernames")
            .and_then(|usernames| usernames.get("active_usernames"))
            .and_then(Value::as_array)
            .and_then(|usernames| {
                usernames
                    .iter()
                    .find_map(|username| non_empty_string(Some(username)))
            })
    })
}

fn non_empty_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn tdjson_id_to_string(value: Option<&Value>) -> Option<String> {
    value.and_then(|value| {
        value
            .as_i64()
            .map(|id| id.to_string())
            .or_else(|| value.as_u64().map(|id| id.to_string()))
            .or_else(|| non_empty_string(Some(value)))
    })
}

fn tdjson_send_message_request(
    bot: &PublishedBot,
    request: &SendMessageRequest,
    reply_to_message_id: Option<i64>,
    attachment_path: Option<&Path>,
) -> AppResult<Value> {
    let chat_id = bot.telegram_chat_id.parse::<i64>().map_err(|_| {
        AppError::bad_request(
            "invalid_telegram_chat_id",
            "published bot has an invalid Telegram chat id",
        )
    })?;

    let input_message_content = if let Some(attachment_path) = attachment_path {
        json!({
            "@type": "inputMessageDocument",
            "document": {
                "@type": "inputFileLocal",
                "path": attachment_path.to_string_lossy(),
            },
            "thumbnail": null,
            "disable_content_type_detection": false,
            "caption": tdjson_formatted_text_for_send(&request.text, &request.entities),
        })
    } else {
        json!({
            "@type": "inputMessageText",
            "text": tdjson_formatted_text_for_send(&request.text, &request.entities),
            "link_preview_options": null,
            "clear_draft": false,
        })
    };

    let mut value = json!({
        "@type": "sendMessage",
        "@extra": request.client_request_id,
        "chat_id": chat_id,
        "topic_id": null,
        "reply_to": null,
        "options": null,
        "reply_markup": null,
        "input_message_content": input_message_content,
    });

    if let Some(reply_to_message_id) = reply_to_message_id {
        value["reply_to"] = json!({
            "@type": "inputMessageReplyToMessage",
            "message_id": reply_to_message_id,
            "quote": null,
            "checklist_task_id": 0,
        });
    }

    Ok(value)
}

fn tdjson_formatted_text_for_send(text: &str, entities: &[TelegramEntity]) -> Value {
    json!({
        "@type": "formattedText",
        "text": text,
        "entities": entities
            .iter()
            .filter_map(tdjson_entity_for_send)
            .collect::<Vec<_>>(),
    })
}

fn tdjson_entity_for_send(entity: &TelegramEntity) -> Option<Value> {
    Some(json!({
        "@type": "textEntity",
        "offset": entity.offset_utf16,
        "length": entity.length_utf16,
        "type": tdjson_entity_type_for_send(entity)?,
    }))
}

fn tdjson_entity_type_for_send(entity: &TelegramEntity) -> Option<Value> {
    match entity.entity_type {
        TelegramEntityType::Bold => Some(json!({ "@type": "textEntityTypeBold" })),
        TelegramEntityType::Italic => Some(json!({ "@type": "textEntityTypeItalic" })),
        TelegramEntityType::Underline => Some(json!({ "@type": "textEntityTypeUnderline" })),
        TelegramEntityType::Strikethrough => {
            Some(json!({ "@type": "textEntityTypeStrikethrough" }))
        }
        TelegramEntityType::Code => Some(json!({ "@type": "textEntityTypeCode" })),
        TelegramEntityType::Pre => Some(match entity.language.as_deref() {
            Some(language) if !language.trim().is_empty() => {
                json!({ "@type": "textEntityTypePreCode", "language": language })
            }
            _ => json!({ "@type": "textEntityTypePre" }),
        }),
        TelegramEntityType::TextLink => entity
            .url
            .as_deref()
            .filter(|url| !url.trim().is_empty())
            .map(|url| json!({ "@type": "textEntityTypeTextUrl", "url": url })),
        TelegramEntityType::Mention => Some(json!({ "@type": "textEntityTypeMention" })),
        TelegramEntityType::CustomEmoji => entity
            .custom_emoji_id
            .as_deref()
            .filter(|custom_emoji_id| !custom_emoji_id.trim().is_empty())
            .map(|custom_emoji_id| {
                json!({
                    "@type": "textEntityTypeCustomEmoji",
                    "custom_emoji_id": custom_emoji_id,
                })
            }),
        TelegramEntityType::Spoiler => Some(json!({ "@type": "textEntityTypeSpoiler" })),
        TelegramEntityType::Blockquote => Some(json!({ "@type": "textEntityTypeBlockQuote" })),
        TelegramEntityType::Unknown => None,
    }
}

fn chat_message_from_tdjson_message(
    bot: &PublishedBot,
    td_message: &Value,
    local_id: String,
) -> Option<ChatMessage> {
    let telegram_message_id = tdjson_id_to_string(td_message.get("id"));
    let (text, entities) = tdjson_message_text_and_entities(td_message);
    let media = tdjson_message_media(td_message);
    let is_outgoing = td_message
        .get("is_outgoing")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let status = tdjson_message_status(td_message, is_outgoing);
    let created_at = tdjson_unix_time_to_rfc3339(td_message.get("date").and_then(Value::as_i64));
    let edited_at = td_message
        .get("edit_date")
        .and_then(Value::as_i64)
        .filter(|value| *value > 0)
        .map(|value| tdjson_unix_time_to_rfc3339(Some(value)));

    Some(ChatMessage {
        id: local_id,
        telegram_message_id,
        bot_id: bot.id.clone(),
        direction: if is_outgoing {
            MessageDirection::Outgoing
        } else {
            MessageDirection::Incoming
        },
        text,
        entities,
        media,
        sent_by_internal_user: None,
        status,
        created_at,
        edited_at,
        reply_to_message_id: tdjson_reply_to_message_id(td_message),
        raw_available: Some(true),
        inline_keyboard: tdjson_inline_keyboard(td_message),
    })
}

fn tdjson_message_local_id(bot: &PublishedBot, td_message: &Value) -> String {
    let telegram_message_id =
        tdjson_id_to_string(td_message.get("id")).unwrap_or_else(|| new_id("tdmsg"));
    tdjson_message_local_id_for_parts(&bot.id, &telegram_message_id)
}

fn tdjson_message_local_id_for_parts(bot_id: &str, telegram_message_id: &str) -> String {
    format!(
        "msg_{}_{}",
        stable_identifier_segment(bot_id),
        stable_identifier_segment(telegram_message_id)
    )
}

fn is_client_request_id(value: &str) -> bool {
    value.starts_with("req_")
}

fn stable_identifier_segment(value: &str) -> String {
    value
        .chars()
        .map(|char| {
            if char.is_ascii_alphanumeric() || char == '_' || char == '-' {
                char
            } else {
                '_'
            }
        })
        .collect()
}

fn tdjson_message_status(td_message: &Value, is_outgoing: bool) -> MessageStatus {
    match td_message
        .get("sending_state")
        .and_then(tdjson_value_type)
        .unwrap_or_default()
    {
        "messageSendingStatePending" => MessageStatus::Pending,
        "messageSendingStateFailed" => MessageStatus::Failed,
        _ if is_outgoing => MessageStatus::Sent,
        _ => MessageStatus::Received,
    }
}

fn tdjson_message_text_and_entities(td_message: &Value) -> (Option<String>, Vec<TelegramEntity>) {
    tdjson_content_text_and_entities(td_message.get("content"))
}

fn tdjson_content_text_and_entities(
    content: Option<&Value>,
) -> (Option<String>, Vec<TelegramEntity>) {
    tdjson_formatted_text_to_text_and_entities(content.and_then(tdjson_content_formatted_text))
}

fn tdjson_content_formatted_text(content: &Value) -> Option<&Value> {
    match tdjson_value_type(content).unwrap_or_default() {
        "messageText" => content.get("text"),
        _ => content.get("caption"),
    }
}

fn tdjson_formatted_text_to_text_and_entities(
    formatted_text: Option<&Value>,
) -> (Option<String>, Vec<TelegramEntity>) {
    let text = formatted_text.and_then(|value| {
        non_empty_string(value.get("text")).or_else(|| non_empty_string(Some(value)))
    });
    let entities = formatted_text
        .and_then(|value| value.get("entities"))
        .and_then(Value::as_array)
        .map(|entities| {
            entities
                .iter()
                .filter_map(telegram_entity_from_tdjson)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    (text, entities)
}

fn pending_text_update_text_and_entities(update: &Value) -> (Option<String>, Vec<TelegramEntity>) {
    let formatted_text = update
        .get("text")
        .or_else(|| update.get("pending_text"))
        .or_else(|| {
            update
                .get("pending_text_message")
                .and_then(|message| message.get("text"))
        })
        .or_else(|| {
            update
                .get("pending_text_message")
                .and_then(|message| message.get("content"))
                .and_then(tdjson_content_formatted_text)
        })
        .or_else(|| {
            update
                .get("message")
                .and_then(|message| message.get("content"))
                .and_then(tdjson_content_formatted_text)
        });

    tdjson_formatted_text_to_text_and_entities(formatted_text)
}

fn telegram_entity_from_tdjson(value: &Value) -> Option<TelegramEntity> {
    let entity_type = value
        .get("type")
        .and_then(tdjson_value_type)
        .map(|value_type| match value_type {
            "textEntityTypeBold" => TelegramEntityType::Bold,
            "textEntityTypeItalic" => TelegramEntityType::Italic,
            "textEntityTypeUnderline" => TelegramEntityType::Underline,
            "textEntityTypeStrikethrough" => TelegramEntityType::Strikethrough,
            "textEntityTypeCode" => TelegramEntityType::Code,
            "textEntityTypePre" | "textEntityTypePreCode" => TelegramEntityType::Pre,
            "textEntityTypeTextUrl" => TelegramEntityType::TextLink,
            "textEntityTypeMention" => TelegramEntityType::Mention,
            "textEntityTypeCustomEmoji" => TelegramEntityType::CustomEmoji,
            "textEntityTypeSpoiler" => TelegramEntityType::Spoiler,
            "textEntityTypeBlockQuote" | "textEntityTypeExpandableBlockQuote" => {
                TelegramEntityType::Blockquote
            }
            _ => TelegramEntityType::Unknown,
        })?;
    let type_value = value.get("type");

    Some(TelegramEntity {
        entity_type,
        offset_utf16: value
            .get("offset")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok())?,
        length_utf16: value
            .get("length")
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok())?,
        url: type_value.and_then(|value| non_empty_string(value.get("url"))),
        language: type_value.and_then(|value| non_empty_string(value.get("language"))),
        custom_emoji_id: type_value
            .and_then(|value| tdjson_id_to_string(value.get("custom_emoji_id"))),
    })
}

fn tdjson_message_media(td_message: &Value) -> Option<Vec<MessageMedia>> {
    tdjson_content_media(td_message.get("content"))
}

fn tdjson_content_media(content: Option<&Value>) -> Option<Vec<MessageMedia>> {
    let content = content?;
    let media = match tdjson_value_type(content).unwrap_or_default() {
        "messagePhoto" => {
            let size = content
                .get("photo")
                .and_then(|photo| photo.get("sizes"))
                .and_then(Value::as_array)
                .and_then(|sizes| {
                    sizes.iter().max_by_key(|size| {
                        let width = size.get("width").and_then(Value::as_u64).unwrap_or(0);
                        let height = size.get("height").and_then(Value::as_u64).unwrap_or(0);
                        width * height
                    })
                })?;
            MessageMedia::Photo {
                file_id: tdjson_file_id(size.get("photo"))?,
                thumbnail_url: None,
                width: tdjson_u32(size.get("width")),
                height: tdjson_u32(size.get("height")),
            }
        }
        "messageVideo" => {
            let video = content.get("video")?;
            MessageMedia::Video {
                file_id: tdjson_file_id(video.get("video"))?,
                thumbnail_url: tdjson_thumbnail_url(video.get("thumbnail")),
                duration_sec: tdjson_u32(video.get("duration")),
                width: tdjson_u32(video.get("width")),
                height: tdjson_u32(video.get("height")),
            }
        }
        "messageAudio" => {
            let audio = content.get("audio")?;
            MessageMedia::Audio {
                file_id: tdjson_file_id(audio.get("audio"))?,
                duration_sec: tdjson_u32(audio.get("duration")),
                title: non_empty_string(audio.get("title")),
                performer: non_empty_string(audio.get("performer")),
            }
        }
        "messageVoiceNote" => {
            let voice = content.get("voice_note")?;
            MessageMedia::Voice {
                file_id: tdjson_file_id(voice.get("voice"))?,
                duration_sec: tdjson_u32(voice.get("duration")),
                waveform: voice.get("waveform").and_then(tdjson_u8_array),
            }
        }
        "messageDocument" => {
            let document = content.get("document")?;
            MessageMedia::Document {
                file_id: tdjson_file_id(document.get("document"))?,
                file_name: non_empty_string(document.get("file_name")),
                mime_type: non_empty_string(document.get("mime_type")),
                size_bytes: tdjson_file_size(document.get("document")),
            }
        }
        "messageSticker" => {
            let sticker = content.get("sticker")?;
            MessageMedia::Sticker {
                file_id: tdjson_file_id(sticker.get("sticker"))?,
                emoji: non_empty_string(sticker.get("emoji")),
                thumbnail_url: tdjson_thumbnail_url(sticker.get("thumbnail")),
            }
        }
        "messageAnimation" => {
            let animation = content.get("animation")?;
            MessageMedia::Animation {
                file_id: tdjson_file_id(animation.get("animation"))?,
                thumbnail_url: tdjson_thumbnail_url(animation.get("thumbnail")),
                duration_sec: tdjson_u32(animation.get("duration")),
            }
        }
        "messageLocation" => {
            let location = content.get("location")?;
            MessageMedia::Location {
                latitude: location.get("latitude")?.as_f64()?,
                longitude: location.get("longitude")?.as_f64()?,
            }
        }
        value_type if value_type.starts_with("message") && value_type != "messageText" => {
            MessageMedia::Unknown {
                file_id: None,
                label: value_type.trim_start_matches("message").to_string(),
            }
        }
        _ => return None,
    };

    Some(vec![media])
}

fn tdjson_download_file_candidates(td_message: &Value) -> Vec<TdjsonDownloadFileCandidate> {
    let Some(content) = td_message.get("content") else {
        return Vec::new();
    };

    let mut candidates = Vec::new();
    match tdjson_value_type(content).unwrap_or_default() {
        "messagePhoto" => {
            let largest_size = content
                .get("photo")
                .and_then(|photo| photo.get("sizes"))
                .and_then(Value::as_array)
                .and_then(|sizes| {
                    sizes.iter().max_by_key(|size| {
                        let width = size.get("width").and_then(Value::as_u64).unwrap_or(0);
                        let height = size.get("height").and_then(Value::as_u64).unwrap_or(0);
                        width * height
                    })
                });
            push_tdjson_file_candidate(
                &mut candidates,
                largest_size.and_then(|size| size.get("photo")),
                TdjsonDownloadFileRole::Main,
            );
        }
        "messageVideo" => {
            if let Some(video) = content.get("video") {
                push_tdjson_file_candidate(
                    &mut candidates,
                    video.get("video"),
                    TdjsonDownloadFileRole::Main,
                );
                push_tdjson_thumbnail_candidate(&mut candidates, video.get("thumbnail"));
            }
        }
        "messageAudio" => {
            push_tdjson_file_candidate(
                &mut candidates,
                content.get("audio").and_then(|audio| audio.get("audio")),
                TdjsonDownloadFileRole::Main,
            );
        }
        "messageVoiceNote" => {
            push_tdjson_file_candidate(
                &mut candidates,
                content
                    .get("voice_note")
                    .and_then(|voice| voice.get("voice")),
                TdjsonDownloadFileRole::Main,
            );
        }
        "messageDocument" => {
            if let Some(document) = content.get("document") {
                push_tdjson_file_candidate(
                    &mut candidates,
                    document.get("document"),
                    TdjsonDownloadFileRole::Main,
                );
                push_tdjson_thumbnail_candidate(&mut candidates, document.get("thumbnail"));
            }
        }
        "messageSticker" => {
            if let Some(sticker) = content.get("sticker") {
                push_tdjson_file_candidate(
                    &mut candidates,
                    sticker.get("sticker"),
                    TdjsonDownloadFileRole::Main,
                );
                push_tdjson_thumbnail_candidate(&mut candidates, sticker.get("thumbnail"));
            }
        }
        "messageAnimation" => {
            if let Some(animation) = content.get("animation") {
                push_tdjson_file_candidate(
                    &mut candidates,
                    animation.get("animation"),
                    TdjsonDownloadFileRole::Main,
                );
                push_tdjson_thumbnail_candidate(&mut candidates, animation.get("thumbnail"));
            }
        }
        _ => {}
    }

    candidates
}

fn push_tdjson_thumbnail_candidate(
    candidates: &mut Vec<TdjsonDownloadFileCandidate>,
    thumbnail: Option<&Value>,
) {
    push_tdjson_file_candidate(
        candidates,
        thumbnail.and_then(|thumbnail| thumbnail.get("file")),
        TdjsonDownloadFileRole::Thumbnail,
    );
}

fn push_tdjson_file_candidate(
    candidates: &mut Vec<TdjsonDownloadFileCandidate>,
    file: Option<&Value>,
    role: TdjsonDownloadFileRole,
) {
    let Some(file) = file else {
        return;
    };
    let Some(file_id) = tdjson_id_to_string(file.get("id")) else {
        return;
    };
    candidates.push(TdjsonDownloadFileCandidate {
        file_id,
        role,
        file: file.clone(),
    });
}

fn tdjson_candidate_matches_file_id(
    candidate: &TdjsonDownloadFileCandidate,
    file_id: &str,
) -> bool {
    candidate.file_id == file_id
        || tdjson_remote_file_id(&candidate.file)
            .as_deref()
            .is_some_and(|remote_file_id| remote_file_id == file_id)
}

fn tdjson_remote_file_id(file: &Value) -> Option<String> {
    file.get("remote")
        .and_then(|remote| non_empty_string(remote.get("id")))
}

fn tdjson_reply_to_message_id(td_message: &Value) -> Option<String> {
    tdjson_id_to_string(td_message.get("reply_to_message_id")).or_else(|| {
        td_message
            .get("reply_to")
            .and_then(|reply| tdjson_id_to_string(reply.get("message_id")))
    })
}

fn tdjson_inline_keyboard(td_message: &Value) -> Option<InlineKeyboardMarkup> {
    tdjson_inline_keyboard_from_reply_markup(td_message.get("reply_markup"))
}

fn tdjson_inline_keyboard_from_reply_markup(
    reply_markup: Option<&Value>,
) -> Option<InlineKeyboardMarkup> {
    let rows = reply_markup
        .filter(|reply_markup| tdjson_value_type(reply_markup) == Some("replyMarkupInlineKeyboard"))
        .and_then(|reply_markup| reply_markup.get("rows"))
        .and_then(Value::as_array)?;

    let inline_keyboard = rows
        .iter()
        .filter_map(|row| {
            let buttons = row
                .as_array()?
                .iter()
                .map(|button| {
                    let button_type = button.get("type");
                    crate::models::InlineKeyboardButton {
                        text: non_empty_string(button.get("text")).unwrap_or_default(),
                        url: button_type
                            .and_then(|button_type| non_empty_string(button_type.get("url"))),
                        callback_data: button_type
                            .filter(|button_type| {
                                tdjson_value_type(button_type)
                                    == Some("inlineKeyboardButtonTypeCallback")
                            })
                            .and_then(|button_type| non_empty_string(button_type.get("data"))),
                    }
                })
                .collect::<Vec<_>>();
            (!buttons.is_empty()).then_some(buttons)
        })
        .collect::<Vec<_>>();

    (!inline_keyboard.is_empty()).then_some(InlineKeyboardMarkup { inline_keyboard })
}

fn tdjson_bot_commands_from_user_full_info(value: &Value) -> Vec<BotCommand> {
    value
        .get("bot_info")
        .or_else(|| value.get("botInfo"))
        .and_then(|bot_info| bot_info.get("commands"))
        .and_then(Value::as_array)
        .map(|commands| {
            commands
                .iter()
                .filter_map(|command| {
                    let command_text = non_empty_string(command.get("command"))?;
                    Some(BotCommand {
                        command: command_text.trim_start_matches('/').to_string(),
                        description: non_empty_string(command.get("description"))
                            .unwrap_or_default(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn tdjson_account_identity_from_user(value: &Value) -> (Option<String>, Option<String>) {
    let account_phone = non_empty_string(value.get("phone_number")).map(|phone| {
        if phone.starts_with('+') {
            phone
        } else {
            format!("+{phone}")
        }
    });
    let first_name = non_empty_string(value.get("first_name")).unwrap_or_default();
    let last_name = non_empty_string(value.get("last_name")).unwrap_or_default();
    let display_name = [first_name, last_name]
        .into_iter()
        .filter(|part| !part.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let username = non_empty_string(value.get("username")).or_else(|| {
        value
            .get("usernames")
            .and_then(|usernames| usernames.get("active_usernames"))
            .and_then(Value::as_array)
            .and_then(|usernames| {
                usernames
                    .iter()
                    .find_map(|username| non_empty_string(Some(username)))
            })
    });
    let fallback_id = tdjson_id_to_string(value.get("id")).map(|id| format!("Telegram ID {id}"));
    let account_label = match (display_name.trim().is_empty(), username) {
        (false, Some(username)) => Some(format!("{display_name} (@{username})")),
        (false, None) => Some(display_name),
        (true, Some(username)) => Some(format!("@{username}")),
        (true, None) => fallback_id,
    };

    (account_phone, account_label)
}

fn stable_json_hash(value: &Value) -> String {
    hex_sha256(value.to_string().as_bytes())
        .chars()
        .take(16)
        .collect()
}

fn tdjson_file_id(value: Option<&Value>) -> Option<String> {
    let file = value?;
    tdjson_id_to_string(file.get("id")).or_else(|| {
        file.get("remote")
            .and_then(|remote| non_empty_string(remote.get("id")))
    })
}

fn tdjson_thumbnail_url(value: Option<&Value>) -> Option<String> {
    let thumbnail_file_id = value.and_then(|thumbnail| tdjson_file_id(thumbnail.get("file")))?;
    Some(proxy_url_for_file(&thumbnail_file_id))
}

fn tdjson_file_size(value: Option<&Value>) -> Option<u64> {
    value.and_then(|file| {
        file.get("size")
            .and_then(Value::as_u64)
            .or_else(|| file.get("expected_size").and_then(Value::as_u64))
    })
}

fn tdjson_u32(value: Option<&Value>) -> Option<u32> {
    value
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
}

fn tdjson_u8_array(value: &Value) -> Option<Vec<u8>> {
    value.as_array().map(|values| {
        values
            .iter()
            .filter_map(|value| value.as_u64().and_then(|value| u8::try_from(value).ok()))
            .collect::<Vec<_>>()
    })
}

fn tdjson_unix_time_to_rfc3339(value: Option<i64>) -> String {
    value
        .and_then(|seconds| DateTime::<Utc>::from_timestamp(seconds, 0))
        .unwrap_or_else(Utc::now)
        .to_rfc3339()
}

impl TelegramRuntime {
    fn status_response(&self) -> TelegramStatusResponse {
        TelegramStatusResponse {
            credentials_configured: self.credentials_configured,
            auth_state: self.auth_state.clone(),
            tdlib_state: self.tdlib_state.clone(),
            account_phone: self.account_phone.clone(),
            account_label: self.account_label.clone(),
            last_sync_at: self.last_sync_at.clone(),
            last_error: self.last_error.clone(),
            qr_link: self.qr_link.clone(),
            next_step: self.next_step(),
        }
    }

    fn next_step(&self) -> TelegramSetupNextStep {
        match self.auth_state {
            TelegramAuthState::NotConfigured => TelegramSetupNextStep::ConfigureCredentials,
            TelegramAuthState::TdlibStarting | TelegramAuthState::Reconnecting => {
                TelegramSetupNextStep::Wait
            }
            TelegramAuthState::NeedsPhone => TelegramSetupNextStep::SubmitPhone,
            TelegramAuthState::NeedsCode => TelegramSetupNextStep::SubmitCode,
            TelegramAuthState::NeedsPassword => TelegramSetupNextStep::SubmitPassword,
            TelegramAuthState::NeedsQrScan => TelegramSetupNextStep::ScanQr,
            TelegramAuthState::Ready => TelegramSetupNextStep::Ready,
            TelegramAuthState::Error => TelegramSetupNextStep::ResolveError,
            TelegramAuthState::LoggedOut => TelegramSetupNextStep::SubmitPhone,
        }
    }
}

fn telegram_auth_state_to_db(state: &TelegramAuthState) -> &'static str {
    match state {
        TelegramAuthState::NotConfigured => "not_configured",
        TelegramAuthState::TdlibStarting => "tdlib_starting",
        TelegramAuthState::NeedsPhone => "needs_phone",
        TelegramAuthState::NeedsCode => "needs_code",
        TelegramAuthState::NeedsPassword => "needs_password",
        TelegramAuthState::NeedsQrScan => "needs_qr_scan",
        TelegramAuthState::Ready => "ready",
        TelegramAuthState::Reconnecting => "reconnecting",
        TelegramAuthState::Error => "error",
        TelegramAuthState::LoggedOut => "logged_out",
    }
}

fn telegram_auth_state_from_db(value: &str) -> TelegramAuthState {
    match value {
        "not_configured" => TelegramAuthState::NotConfigured,
        "tdlib_starting" => TelegramAuthState::TdlibStarting,
        "needs_phone" => TelegramAuthState::NeedsPhone,
        "needs_code" => TelegramAuthState::NeedsCode,
        "needs_password" => TelegramAuthState::NeedsPassword,
        "needs_qr_scan" => TelegramAuthState::NeedsQrScan,
        "ready" => TelegramAuthState::Ready,
        "reconnecting" => TelegramAuthState::Reconnecting,
        "logged_out" => TelegramAuthState::LoggedOut,
        _ => TelegramAuthState::Error,
    }
}

fn tdlib_runtime_state_to_db(state: &TdlibRuntimeState) -> &'static str {
    match state {
        TdlibRuntimeState::Stopped => "stopped",
        TdlibRuntimeState::Starting => "starting",
        TdlibRuntimeState::Running => "running",
        TdlibRuntimeState::Reconnecting => "reconnecting",
        TdlibRuntimeState::Error => "error",
    }
}

fn tdlib_runtime_state_from_db(value: &str) -> TdlibRuntimeState {
    match value {
        "starting" => TdlibRuntimeState::Starting,
        "running" => TdlibRuntimeState::Running,
        "reconnecting" => TdlibRuntimeState::Reconnecting,
        "error" => TdlibRuntimeState::Error,
        _ => TdlibRuntimeState::Stopped,
    }
}

fn telegram_chat_kind_to_db(kind: &TelegramChatKind) -> &'static str {
    match kind {
        TelegramChatKind::Bot => "bot",
        TelegramChatKind::User => "user",
        TelegramChatKind::Group => "group",
        TelegramChatKind::Channel => "channel",
        TelegramChatKind::Unknown => "unknown",
    }
}

fn bot_status_to_db(status: &BotStatus) -> &'static str {
    match status {
        BotStatus::Available => "available",
        BotStatus::Restricted => "restricted",
        BotStatus::Unknown => "unknown",
    }
}

fn bot_status_from_db(value: &str) -> BotStatus {
    match value {
        "available" => BotStatus::Available,
        "restricted" => BotStatus::Restricted,
        _ => BotStatus::Unknown,
    }
}

fn message_direction_from_db(value: &str) -> MessageDirection {
    match value {
        "outgoing" => MessageDirection::Outgoing,
        "system" => MessageDirection::System,
        _ => MessageDirection::Incoming,
    }
}

fn message_direction_to_db(direction: &MessageDirection) -> &'static str {
    match direction {
        MessageDirection::Incoming => "incoming",
        MessageDirection::Outgoing => "outgoing",
        MessageDirection::System => "system",
    }
}

fn message_status_from_db(value: &str) -> MessageStatus {
    match value {
        "pending" => MessageStatus::Pending,
        "sent" => MessageStatus::Sent,
        "failed" => MessageStatus::Failed,
        "edited" => MessageStatus::Edited,
        "deleted" => MessageStatus::Deleted,
        _ => MessageStatus::Received,
    }
}

fn message_status_to_db(status: &MessageStatus) -> &'static str {
    match status {
        MessageStatus::Pending => "pending",
        MessageStatus::Sent => "sent",
        MessageStatus::Failed => "failed",
        MessageStatus::Received => "received",
        MessageStatus::Edited => "edited",
        MessageStatus::Deleted => "deleted",
    }
}

fn download_status_to_db(status: &DownloadStatus) -> &'static str {
    match status {
        DownloadStatus::Queued => "queued",
        DownloadStatus::Downloading => "downloading",
        DownloadStatus::Paused => "paused",
        DownloadStatus::Stopped => "stopped",
        DownloadStatus::Ready => "ready",
        DownloadStatus::Failed => "failed",
        DownloadStatus::Expired => "expired",
    }
}

fn download_status_from_db(value: &str) -> DownloadStatus {
    match value {
        "queued" => DownloadStatus::Queued,
        "downloading" => DownloadStatus::Downloading,
        "paused" => DownloadStatus::Paused,
        "stopped" => DownloadStatus::Stopped,
        "ready" => DownloadStatus::Ready,
        "expired" => DownloadStatus::Expired,
        _ => DownloadStatus::Failed,
    }
}

fn workspace_file_status_to_db(status: &WorkspaceFileStatus) -> &'static str {
    match status {
        WorkspaceFileStatus::Pending => "pending",
        WorkspaceFileStatus::Approved => "approved",
        WorkspaceFileStatus::Rejected => "rejected",
    }
}

fn workspace_file_status_from_db(value: &str) -> WorkspaceFileStatus {
    match value {
        "approved" => WorkspaceFileStatus::Approved,
        "rejected" => WorkspaceFileStatus::Rejected,
        _ => WorkspaceFileStatus::Pending,
    }
}

fn telegram_chat_kind_from_db(value: &str) -> TelegramChatKind {
    match value {
        "bot" => TelegramChatKind::Bot,
        "user" => TelegramChatKind::User,
        "group" => TelegramChatKind::Group,
        "channel" => TelegramChatKind::Channel,
        _ => TelegramChatKind::Unknown,
    }
}

fn history_sync_policy_to_db(policy: &HistorySyncPolicy) -> &'static str {
    match policy {
        HistorySyncPolicy::LatestOnly => "latest_only",
        HistorySyncPolicy::LastN => "last_n",
        HistorySyncPolicy::FullAvailableHistory => "full_available_history",
    }
}

fn history_sync_policy_from_db(value: &str) -> HistorySyncPolicy {
    match value {
        "last_n" => HistorySyncPolicy::LastN,
        "full_available_history" => HistorySyncPolicy::FullAvailableHistory,
        _ => HistorySyncPolicy::LatestOnly,
    }
}

fn hex_sha256(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    format!("{digest:x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    async fn state_with_published_bot(
        telegram_chat_id: i64,
    ) -> (tempfile::TempDir, AppState, PublishedBot) {
        let dir = tempfile::tempdir().expect("tempdir");
        let state = AppState::new(AppConfig::for_test(dir.path()))
            .await
            .expect("state");

        state
            .apply_tdjson_update(json!({
                "@type": "updateUser",
                "user": {
                    "@type": "user",
                    "id": telegram_chat_id,
                    "first_name": "Stream",
                    "last_name": "Bot",
                    "type": { "@type": "userTypeBot" }
                }
            }))
            .await
            .expect("discover bot");
        let bot = state
            .publish_bot(
                &telegram_chat_id.to_string(),
                None,
                Some(true),
                None,
                None,
                None,
            )
            .await
            .expect("publish bot");

        (dir, state, bot)
    }

    #[tokio::test]
    async fn default_state_has_no_runtime_demo_data() {
        let dir = tempfile::tempdir().expect("tempdir");
        let state = AppState::new(AppConfig::for_test(dir.path()))
            .await
            .expect("state");

        assert!(state.list_bots().await.is_empty());
        assert!(state.downloads().await.is_empty());
        assert!(state.workspace_files().await.is_empty());

        let status = state.telegram_status().await;
        assert!(!status.credentials_configured);
        assert_eq!(status.auth_state, TelegramAuthState::NotConfigured);
    }

    #[tokio::test]
    async fn tdjson_user_full_info_response_caches_bot_commands() {
        let (_dir, state, bot) = state_with_published_bot(313131).await;

        state
            .apply_tdjson_response(json!({
                "@type": "userFullInfo",
                "@extra": format!("bot_commands:{}", bot.id),
                "bot_info": {
                    "@type": "botInfo",
                    "commands": [
                        {
                            "@type": "botCommand",
                            "command": "help",
                            "description": "Show help"
                        },
                        {
                            "@type": "botCommand",
                            "command": "/download_all",
                            "description": "Download everything"
                        }
                    ]
                }
            }))
            .await
            .expect("commands response");

        assert_eq!(
            state.cached_bot_commands(&bot.id).await,
            vec![
                BotCommand {
                    command: "help".to_string(),
                    description: "Show help".to_string(),
                },
                BotCommand {
                    command: "download_all".to_string(),
                    description: "Download everything".to_string(),
                },
            ]
        );
    }

    #[tokio::test]
    async fn tdjson_account_self_response_updates_telegram_status_identity() {
        let dir = tempfile::tempdir().expect("tempdir");
        let config = AppConfig::for_test(dir.path());
        let state = AppState::new(config.clone()).await.expect("state");

        state
            .apply_tdjson_response(json!({
                "@type": "user",
                "@extra": "account:self",
                "id": 42424242,
                "first_name": "Alice",
                "last_name": "Ops",
                "phone_number": "15551234567",
                "usernames": {
                    "@type": "usernames",
                    "active_usernames": ["alice_ops"]
                }
            }))
            .await
            .expect("account self response");

        let status = state.telegram_status().await;
        assert_eq!(status.account_phone.as_deref(), Some("+15551234567"));
        assert_eq!(
            status.account_label.as_deref(),
            Some("Alice Ops (@alice_ops)")
        );

        drop(state);
        let restored = AppState::new(config).await.expect("restored state");
        let restored_status = restored.telegram_status().await;
        assert_eq!(
            restored_status.account_phone.as_deref(),
            Some("+15551234567")
        );
        assert_eq!(
            restored_status.account_label.as_deref(),
            Some("Alice Ops (@alice_ops)")
        );
    }

    #[tokio::test]
    async fn telegram_credentials_persist_without_exposing_secret() {
        let dir = tempfile::tempdir().expect("tempdir");
        let config = AppConfig::for_test(dir.path());
        let state = AppState::new(config.clone()).await.expect("state");

        let status = state
            .save_telegram_credentials("12345", "super-secret-api-hash")
            .await
            .expect("save credentials");
        assert!(status.credentials_configured);
        assert_eq!(status.auth_state, TelegramAuthState::NeedsPhone);
        drop(state);

        let restored = AppState::new(config).await.expect("restored state");
        let restored_status = restored.telegram_status().await;
        assert!(restored_status.credentials_configured);
        assert_eq!(restored_status.auth_state, TelegramAuthState::NeedsPhone);

        let row: (String,) =
            sqlx::query_as("SELECT api_hash_secret_ref FROM telegram_credentials WHERE id = 1")
                .fetch_one(&restored.db)
                .await
                .expect("credential row");
        assert_eq!(row.0, TELEGRAM_API_HASH_SECRET);
    }

    #[tokio::test]
    async fn missing_tdlib_encryption_key_marks_telegram_error_state() {
        let dir = tempfile::tempdir().expect("tempdir");
        let mut config = AppConfig::for_test(dir.path());
        let missing_key_ref = new_id("TG2WEB_TEST_MISSING_ENCRYPTION_KEY").replace('-', "_");
        config.tdlib_encryption_key_ref = Some(missing_key_ref.clone());
        let state = AppState::new(config).await.expect("state");
        state
            .save_telegram_credentials("12345", "super-secret-api-hash")
            .await
            .expect("save credentials");

        let error = state
            .start_telegram_phone_login("+15551234567")
            .await
            .expect_err("tdlib unavailable");
        assert!(error.to_string().contains(&missing_key_ref));

        let status = state.telegram_status().await;
        assert_eq!(status.auth_state, TelegramAuthState::Error);
        assert_eq!(status.tdlib_state, TdlibRuntimeState::Error);
        assert!(status
            .last_error
            .as_deref()
            .is_some_and(|message| message.contains(&missing_key_ref)));
    }

    #[tokio::test]
    async fn tdjson_user_update_discovers_publishable_bot_chat() {
        let dir = tempfile::tempdir().expect("tempdir");
        let state = AppState::new(AppConfig::for_test(dir.path()))
            .await
            .expect("state");

        state
            .apply_tdjson_update(json!({
                "@type": "updateUser",
                "user": {
                    "@type": "user",
                    "id": 424242,
                    "first_name": "Build",
                    "last_name": "Bot",
                    "usernames": { "active_usernames": ["buildbot"] },
                    "type": { "@type": "userTypeBot" }
                }
            }))
            .await
            .expect("apply update");

        let chats = state.list_discovered_chats(None).await;
        assert_eq!(chats.len(), 1);
        assert_eq!(chats[0].telegram_chat_id, "424242");
        assert_eq!(chats[0].username.as_deref(), Some("buildbot"));
        assert_eq!(chats[0].title, "Build Bot");
        assert_eq!(chats[0].kind, TelegramChatKind::Bot);
        assert!(chats[0].is_bot);

        let row: (String, i64) = sqlx::query_as(
            "SELECT kind, is_bot FROM discovered_telegram_chats WHERE telegram_chat_id = '424242'",
        )
        .fetch_one(&state.db)
        .await
        .expect("discovered chat row");
        assert_eq!(row, ("bot".to_string(), 1));
    }

    #[tokio::test]
    async fn tdjson_chat_update_does_not_downgrade_existing_bot_discovery() {
        let dir = tempfile::tempdir().expect("tempdir");
        let state = AppState::new(AppConfig::for_test(dir.path()))
            .await
            .expect("state");

        state
            .apply_tdjson_update(json!({
                "@type": "updateUser",
                "user": {
                    "@type": "user",
                    "id": 7,
                    "first_name": "Stream",
                    "type": { "@type": "userTypeBot" }
                }
            }))
            .await
            .expect("bot update");
        state
            .apply_tdjson_update(json!({
                "@type": "updateNewChat",
                "chat": {
                    "@type": "chat",
                    "id": 7,
                    "title": "Stream Bot",
                    "type": { "@type": "chatTypePrivate", "user_id": 7 }
                }
            }))
            .await
            .expect("chat update");

        let chats = state.list_discovered_chats(None).await;
        assert_eq!(chats.len(), 1);
        assert_eq!(chats[0].kind, TelegramChatKind::Bot);
        assert!(chats[0].is_bot);
        assert_eq!(chats[0].status, BotStatus::Available);
    }

    #[tokio::test]
    async fn published_bot_persists_across_restart() {
        let dir = tempfile::tempdir().expect("tempdir");
        let config = AppConfig::for_test(dir.path());
        let db = storage::connect(&config.database_path).await.expect("db");
        let now = now_rfc3339();
        sqlx::query(
            "INSERT INTO discovered_telegram_chats \
             (telegram_chat_id, username, title, kind, is_bot, status, discovered_at, updated_at) \
             VALUES (?, ?, ?, 'bot', 1, 'available', ?, ?)",
        )
        .bind("tg_chat_1")
        .bind("example_bot")
        .bind("Example Bot")
        .bind(&now)
        .bind(&now)
        .execute(&db)
        .await
        .expect("seed discovered bot");
        drop(db);

        let state = AppState::new(config.clone()).await.expect("state");
        let discovered = state.list_discovered_chats(None).await;
        assert_eq!(discovered.len(), 1);
        assert!(!discovered[0].already_published);

        let published = state
            .publish_bot(
                "tg_chat_1",
                Some("Team Bot".to_string()),
                Some(true),
                Some(true),
                Some(5),
                Some(HistorySyncPolicy::LastN),
            )
            .await
            .expect("publish bot");
        assert_eq!(published.display_title.as_deref(), Some("Team Bot"));
        assert_eq!(state.list_bots().await.len(), 1);

        drop(state);

        let restored = AppState::new(config).await.expect("restored state");
        let restored_bots = restored.list_published_bots().await;
        assert_eq!(restored_bots.len(), 1);
        assert_eq!(restored_bots[0].id, published.id);
        assert_eq!(
            restored_bots[0].history_sync_policy,
            HistorySyncPolicy::LastN
        );

        let restored_discovered = restored.list_discovered_chats(None).await;
        assert!(restored_discovered[0].already_published);

        restored
            .unpublish_bot(&published.id)
            .await
            .expect("unpublish");
        assert!(restored.list_bots().await.is_empty());
    }

    #[tokio::test]
    async fn message_history_excludes_ephemeral_drafts_and_paginates() {
        let dir = tempfile::tempdir().expect("tempdir");
        let config = AppConfig::for_test(dir.path());
        let db = storage::connect(&config.database_path).await.expect("db");
        let now = now_rfc3339();
        sqlx::query(
            "INSERT INTO discovered_telegram_chats \
             (telegram_chat_id, username, title, kind, is_bot, status, discovered_at, updated_at) \
             VALUES ('tg_chat_history', 'history_bot', 'History Bot', 'bot', 1, 'available', ?, ?)",
        )
        .bind(&now)
        .bind(&now)
        .execute(&db)
        .await
        .expect("seed discovered bot");
        drop(db);

        let state = AppState::new(config).await.expect("state");
        let bot = state
            .publish_bot("tg_chat_history", None, Some(true), None, None, None)
            .await
            .expect("publish bot");

        for (id, telegram_message_id, text, created_at, is_ephemeral) in [
            (
                "msg_old",
                "tg_msg_old",
                "older final message",
                "2026-05-21T08:00:00+00:00",
                0_i64,
            ),
            (
                "msg_mid",
                "tg_msg_mid",
                "middle final message",
                "2026-05-21T08:01:00+00:00",
                0_i64,
            ),
            (
                "msg_new",
                "tg_msg_new",
                "newest final message",
                "2026-05-21T08:02:00+00:00",
                0_i64,
            ),
            (
                "msg_draft",
                "tg_msg_draft",
                "live draft snapshot",
                "2026-05-21T08:03:00+00:00",
                1_i64,
            ),
        ] {
            sqlx::query(
                "INSERT INTO chat_messages \
                 (id, telegram_message_id, bot_id, telegram_chat_id, direction, text, entities_json, status, created_at, is_ephemeral, updated_at) \
                 VALUES (?, ?, ?, ?, 'incoming', ?, '[]', 'received', ?, ?, ?)",
            )
            .bind(id)
            .bind(telegram_message_id)
            .bind(&bot.id)
            .bind(&bot.telegram_chat_id)
            .bind(text)
            .bind(created_at)
            .bind(is_ephemeral)
            .bind(created_at)
            .execute(&state.db)
            .await
            .expect("seed chat message");
        }

        let latest = state
            .list_messages(&bot.id, None, 2)
            .await
            .expect("list latest messages");
        assert_eq!(
            latest
                .iter()
                .map(|message| message.id.as_str())
                .collect::<Vec<_>>(),
            vec!["msg_mid", "msg_new"]
        );
        assert!(!latest
            .iter()
            .any(|message| message.text.as_deref() == Some("live draft snapshot")));

        let older = state
            .list_messages(&bot.id, Some("msg_mid"), 2)
            .await
            .expect("list older messages");
        assert_eq!(older.len(), 1);
        assert_eq!(older[0].id, "msg_old");

        let before_telegram_id = state
            .list_messages(&bot.id, Some("tg_msg_new"), 10)
            .await
            .expect("list by telegram cursor");
        assert_eq!(
            before_telegram_id
                .iter()
                .map(|message| message.id.as_str())
                .collect::<Vec<_>>(),
            vec!["msg_old", "msg_mid"]
        );
    }

    #[tokio::test]
    async fn user_message_history_is_scoped_to_its_access_key_owner() {
        let (_dir, state, bot) = state_with_published_bot(818181).await;
        let user_a = InternalUser {
            id: "access_key:key_a".to_string(),
            display_name: "Desk A".to_string(),
        };
        let user_b = InternalUser {
            id: "access_key:key_b".to_string(),
            display_name: "Desk B".to_string(),
        };

        for (id, text, created_at, owner) in [
            (
                "req_a",
                "ask a",
                "2026-05-21T08:00:00+00:00",
                user_a.clone(),
            ),
            (
                "req_b",
                "ask b",
                "2026-05-21T08:01:00+00:00",
                user_b.clone(),
            ),
        ] {
            let mut message = ChatMessage {
                id: id.to_string(),
                telegram_message_id: None,
                bot_id: bot.id.clone(),
                direction: MessageDirection::Outgoing,
                text: Some(text.to_string()),
                entities: Vec::new(),
                media: None,
                sent_by_internal_user: Some(owner),
                status: MessageStatus::Sent,
                created_at: created_at.to_string(),
                edited_at: None,
                reply_to_message_id: None,
                raw_available: Some(false),
                inline_keyboard: None,
            };
            state
                .persist_chat_message(&mut message, &bot.telegram_chat_id, false)
                .await
                .expect("persist outgoing");
        }

        state
            .persist_tdjson_message(json!({
                "@type": "message",
                "id": 9001,
                "chat_id": 818181,
                "is_outgoing": false,
                "date": 1779350520,
                "content": {
                    "@type": "messageText",
                    "text": { "@type": "formattedText", "text": "answer b", "entities": [] }
                }
            }))
            .await
            .expect("incoming response");

        let session_a = AuthSession {
            token: "token_a".to_string(),
            user: crate::models::AuthUser {
                id: user_a.id.clone(),
                display_name: user_a.display_name.clone(),
                role: crate::models::AuthRole::User,
                access_key_id: Some("key_a".to_string()),
                access_key_name: Some(user_a.display_name.clone()),
            },
            issued_at: now_rfc3339(),
        };
        let session_b = AuthSession {
            token: "token_b".to_string(),
            user: crate::models::AuthUser {
                id: user_b.id.clone(),
                display_name: user_b.display_name.clone(),
                role: crate::models::AuthRole::User,
                access_key_id: Some("key_b".to_string()),
                access_key_name: Some(user_b.display_name.clone()),
            },
            issued_at: now_rfc3339(),
        };
        let admin_session = AuthSession {
            token: "token_admin".to_string(),
            user: crate::models::AuthUser {
                id: "admin".to_string(),
                display_name: "Admin".to_string(),
                role: crate::models::AuthRole::Admin,
                access_key_id: None,
                access_key_name: None,
            },
            issued_at: now_rfc3339(),
        };

        let user_a_messages = state
            .list_messages_for_session(&session_a, &bot.id, None, 20)
            .await
            .expect("user a messages");
        assert_eq!(
            user_a_messages
                .iter()
                .map(|message| message.id.as_str())
                .collect::<Vec<_>>(),
            vec!["req_a"]
        );

        let user_b_messages = state
            .list_messages_for_session(&session_b, &bot.id, None, 20)
            .await
            .expect("user b messages");
        assert_eq!(
            user_b_messages
                .iter()
                .map(|message| message.text.as_deref().unwrap_or_default())
                .collect::<Vec<_>>(),
            vec!["ask b", "answer b"]
        );

        let admin_messages = state
            .list_messages_for_session(&admin_session, &bot.id, None, 20)
            .await
            .expect("admin messages");
        assert_eq!(admin_messages.len(), 3);
    }

    #[tokio::test]
    async fn trigger_download_persists_failed_boundary_and_cached_ready_state() {
        let dir = tempfile::tempdir().expect("tempdir");
        let config = AppConfig::for_test(dir.path());
        let state = AppState::new(config.clone()).await.expect("state");

        let failed = state
            .trigger_download(TriggerDownloadRequest {
                file_id: "missing_file".to_string(),
                message_id: None,
                file_name: Some("missing.pdf".to_string()),
                size_bytes: Some(2048),
            })
            .await
            .expect("failed download item");
        assert_eq!(failed.status, DownloadStatus::Failed);
        assert_eq!(failed.size_bytes, Some(2048));
        assert!(failed.proxy_url.is_none());
        assert!(failed
            .error
            .as_deref()
            .is_some_and(|error| error.contains("numeric TDLib file id")));

        let tdlib_row = state
            .trigger_download(TriggerDownloadRequest {
                file_id: "123".to_string(),
                message_id: None,
                file_name: Some("tdlib.bin".to_string()),
                size_bytes: Some(12),
            })
            .await
            .expect("numeric tdlib download item");
        let tdlib_file_path = dir.path().join("tdlib-source.bin");
        tokio::fs::write(&tdlib_file_path, b"tdlib bytes!")
            .await
            .expect("tdlib source file");
        state
            .apply_tdjson_update(json!({
                "@type": "updateFile",
                "file": {
                    "@type": "file",
                    "id": 123,
                    "size": 12,
                    "local": {
                        "@type": "localFile",
                        "path": tdlib_file_path.to_string_lossy(),
                        "is_downloading_active": false,
                        "is_downloading_completed": true,
                        "downloaded_size": 12
                    }
                }
            }))
            .await
            .expect("file update");
        let tdlib_ready = state
            .download(&tdlib_row.id)
            .await
            .expect("updated tdlib download");
        assert_eq!(tdlib_ready.status, DownloadStatus::Ready);
        assert_eq!(
            tdlib_ready.proxy_url.as_deref(),
            Some("/api/files/123/proxy")
        );
        assert_eq!(
            state.cached_file_bytes("123").await.expect("cached bytes"),
            b"tdlib bytes!"
        );

        let cached_path = state.cached_file_path("cached_file");
        tokio::fs::write(&cached_path, b"cached bytes")
            .await
            .expect("cached file");
        let ready = state
            .trigger_download(TriggerDownloadRequest {
                file_id: "cached_file".to_string(),
                message_id: None,
                file_name: Some("cached.bin".to_string()),
                size_bytes: None,
            })
            .await
            .expect("ready download item");
        assert_eq!(ready.status, DownloadStatus::Ready);
        assert_eq!(ready.downloaded_bytes, 12);
        assert_eq!(ready.size_bytes, Some(12));
        assert_eq!(
            ready.proxy_url.as_deref(),
            Some("/api/files/cached_file/proxy")
        );

        let replayed = state.replay_events(None, None);
        assert!(replayed
            .iter()
            .any(|event| matches!(event, AppEvent::DownloadFailed { .. })));
        assert!(replayed
            .iter()
            .any(|event| matches!(event, AppEvent::DownloadReady { .. })));

        drop(state);
        let restored = AppState::new(config).await.expect("restored state");
        let downloads = restored.downloads().await;
        assert_eq!(downloads.len(), 3);
        assert!(downloads
            .iter()
            .any(|download| download.status == DownloadStatus::Failed));
        assert!(downloads
            .iter()
            .any(|download| download.status == DownloadStatus::Ready));
    }

    #[tokio::test]
    async fn download_pause_resume_and_stop_update_existing_item() {
        let dir = tempfile::tempdir().expect("tempdir");
        let config = AppConfig::for_test(dir.path());
        let db = storage::connect(&config.database_path).await.expect("db");
        let now = now_rfc3339();
        sqlx::query(
            "INSERT INTO downloads \
             (id, file_id, message_id, file_name, mime_type, size_bytes, downloaded_bytes, status, error, created_at, updated_at) \
             VALUES ('download_control', '321', NULL, 'control.bin', NULL, 10, 3, 'downloading', NULL, ?, ?)",
        )
        .bind(&now)
        .bind(&now)
        .execute(&db)
        .await
        .expect("seed download");
        drop(db);

        let state = AppState::new(config).await.expect("state");
        let paused = state
            .pause_download("download_control")
            .await
            .expect("pause download");
        assert_eq!(paused.status, DownloadStatus::Paused);
        assert_eq!(paused.downloaded_bytes, 3);

        tokio::fs::write(state.cached_file_path("321"), b"cached")
            .await
            .expect("cached file");
        let resumed = state
            .resume_download("download_control")
            .await
            .expect("resume cached download");
        assert_eq!(resumed.status, DownloadStatus::Ready);
        assert_eq!(resumed.proxy_url.as_deref(), Some("/api/files/321/proxy"));

        let stopped = state
            .stop_download("download_control")
            .await
            .expect("stop download");
        assert_eq!(stopped.status, DownloadStatus::Stopped);
    }

    #[tokio::test]
    async fn stopped_download_trigger_reuses_existing_row_and_restarts_from_cache() {
        let dir = tempfile::tempdir().expect("tempdir");
        let config = AppConfig::for_test(dir.path());
        let db = storage::connect(&config.database_path).await.expect("db");
        let now = now_rfc3339();
        sqlx::query(
            "INSERT INTO downloads \
             (id, file_id, message_id, file_name, mime_type, size_bytes, downloaded_bytes, status, error, created_at, updated_at) \
             VALUES ('download_stopped', 'stopped_file', NULL, 'old.bin', NULL, NULL, 0, 'stopped', NULL, ?, ?)",
        )
        .bind(&now)
        .bind(&now)
        .execute(&db)
        .await
        .expect("seed stopped download");
        drop(db);

        let state = AppState::new(config).await.expect("state");
        tokio::fs::write(state.cached_file_path("stopped_file"), b"cached stopped")
            .await
            .expect("cached file");

        let ready = state
            .trigger_download(TriggerDownloadRequest {
                file_id: "stopped_file".to_string(),
                message_id: None,
                file_name: Some("new.bin".to_string()),
                size_bytes: Some(13),
            })
            .await
            .expect("restarted download");

        assert_eq!(ready.id, "download_stopped");
        assert_eq!(ready.status, DownloadStatus::Ready);
        assert_eq!(ready.downloaded_bytes, 14);
        assert_eq!(state.downloads().await.len(), 1);
    }

    #[tokio::test]
    async fn recover_interrupted_download_marks_cached_item_ready_after_restart() {
        let dir = tempfile::tempdir().expect("tempdir");
        let config = AppConfig::for_test(dir.path());
        let db = storage::connect(&config.database_path).await.expect("db");
        let now = now_rfc3339();
        sqlx::query(
            "INSERT INTO downloads \
             (id, file_id, message_id, file_name, mime_type, size_bytes, downloaded_bytes, status, error, created_at, updated_at) \
             VALUES ('download_interrupted', 'interrupted_file', NULL, 'half.bin', NULL, 20, 7, 'downloading', NULL, ?, ?)",
        )
        .bind(&now)
        .bind(&now)
        .execute(&db)
        .await
        .expect("seed interrupted download");
        drop(db);

        let state = AppState::new(config).await.expect("state");
        tokio::fs::write(state.cached_file_path("interrupted_file"), b"completed")
            .await
            .expect("cached file");

        state
            .recover_interrupted_downloads()
            .await
            .expect("recover interrupted downloads");
        let recovered = state
            .download("download_interrupted")
            .await
            .expect("recovered download");

        assert_eq!(recovered.status, DownloadStatus::Ready);
        assert_eq!(
            recovered.proxy_url.as_deref(),
            Some("/api/files/interrupted_file/proxy")
        );
    }

    #[tokio::test]
    async fn clear_download_cache_removes_proxy_files_and_expires_ready_downloads() {
        let dir = tempfile::tempdir().expect("tempdir");
        let config = AppConfig::for_test(dir.path());
        let db = storage::connect(&config.database_path).await.expect("db");
        let now = now_rfc3339();
        sqlx::query(
            "INSERT INTO downloads \
             (id, file_id, message_id, file_name, mime_type, size_bytes, downloaded_bytes, status, error, created_at, updated_at) \
             VALUES ('download_ready', 'ready_file', NULL, 'ready.bin', NULL, 5, 5, 'ready', NULL, ?, ?)",
        )
        .bind(&now)
        .bind(&now)
        .execute(&db)
        .await
        .expect("seed ready download");
        drop(db);

        let state = AppState::new(config).await.expect("state");
        let cache_path = state.cached_file_path("ready_file");
        tokio::fs::write(&cache_path, b"ready")
            .await
            .expect("cached file");

        let result = state
            .clear_download_cache()
            .await
            .expect("clear download cache");
        let expired = state.download("download_ready").await.expect("expired row");

        assert_eq!(result.removed_files, 1);
        assert_eq!(result.removed_bytes, 5);
        assert_eq!(result.expired_downloads, 1);
        assert_eq!(expired.status, DownloadStatus::Expired);
        assert!(expired.proxy_url.is_none());
        assert!(tokio::fs::metadata(cache_path).await.is_err());
    }

    #[tokio::test]
    async fn media_messages_populate_workspace_and_cache_summary_preserves_metadata_after_clear() {
        let (_dir, state, bot) = state_with_published_bot(494949).await;

        state
            .persist_tdjson_message(json!({
                "@type": "message",
                "id": 9001,
                "chat_id": bot.telegram_chat_id.parse::<i64>().unwrap(),
                "date": 1_700_000_000,
                "is_outgoing": false,
                "content": {
                    "@type": "messageDocument",
                    "caption": { "@type": "formattedText", "text": "archive", "entities": [] },
                    "document": {
                        "@type": "document",
                        "file_name": "album.zip",
                        "mime_type": "application/zip",
                        "document": {
                            "@type": "file",
                            "id": 123456,
                            "size": 11,
                            "expected_size": 11
                        }
                    }
                }
            }))
            .await
            .expect("persist media message");

        let files = state.workspace_files().await;
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].file_id, "123456");
        assert_eq!(files[0].file_name, "album.zip");
        assert_eq!(files[0].mime_type, "application/zip");

        tokio::fs::write(state.cached_file_path("123456"), b"cached file")
            .await
            .expect("write cached file");

        let download = state
            .trigger_download(TriggerDownloadRequest {
                file_id: "123456".to_string(),
                message_id: Some(files[0].message_id.clone()),
                file_name: Some(files[0].file_name.clone()),
                size_bytes: Some(files[0].size_bytes),
            })
            .await
            .expect("reuse cached file");
        assert_eq!(download.status, DownloadStatus::Ready);

        let summary = state.download_cache_summary().await.expect("cache summary");
        assert_eq!(summary.total_cached_files, 1);
        assert_eq!(summary.total_cached_bytes, 11);
        let item = summary
            .items
            .iter()
            .find(|item| item.file_id == "123456")
            .expect("cache item");
        assert!(item.server_file_exists);
        assert_eq!(item.file_name.as_deref(), Some("album.zip"));

        state
            .clear_download_cache_file("123456")
            .await
            .expect("clear one file");
        let summary = state
            .download_cache_summary()
            .await
            .expect("summary after clear");
        let item = summary
            .items
            .iter()
            .find(|item| item.file_id == "123456")
            .expect("cache item after clear");
        assert!(!item.server_file_exists);
        assert_eq!(item.file_name.as_deref(), Some("album.zip"));
        assert_eq!(item.status, Some(DownloadStatus::Expired));

        let tdlib_file_path = _dir.path().join("photo-redownload.jpg");
        tokio::fs::write(&tdlib_file_path, b"redownloaded")
            .await
            .expect("tdlib source file");
        state
            .apply_tdjson_response(json!({
                "@type": "file",
                "id": 123456,
                "size": 12,
                "local": {
                    "@type": "localFile",
                    "path": tdlib_file_path.to_string_lossy(),
                    "is_downloading_active": false,
                    "is_downloading_completed": true,
                    "downloaded_size": 0
                }
            }))
            .await
            .expect("file response");
        let ready = state.download(&download.id).await.expect("ready again");
        assert_eq!(ready.status, DownloadStatus::Ready);
        assert_eq!(ready.downloaded_bytes, 12);
        assert_eq!(
            state
                .cached_file_bytes("123456")
                .await
                .expect("cached after response"),
            b"redownloaded"
        );

        let files = state.workspace_files().await;
        assert_eq!(files[0].file_name, "album.zip");
    }

    #[tokio::test]
    async fn message_linked_redownload_rehydrates_current_tdlib_file_before_cache_copy() {
        let (dir, state, bot) = state_with_published_bot(505050).await;

        state
            .persist_tdjson_message(json!({
                "@type": "message",
                "id": 7001,
                "chat_id": bot.telegram_chat_id.parse::<i64>().unwrap(),
                "date": 1_700_000_000,
                "is_outgoing": false,
                "content": {
                    "@type": "messageDocument",
                    "caption": { "@type": "formattedText", "text": "archive", "entities": [] },
                    "document": {
                        "@type": "document",
                        "file_name": "album.zip",
                        "mime_type": "application/zip",
                        "document": {
                            "@type": "file",
                            "id": 111,
                            "size": 11,
                            "expected_size": 11
                        }
                    }
                }
            }))
            .await
            .expect("persist stale media message");

        let files = state.workspace_files().await;
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].file_id, "111");

        let now = now_rfc3339();
        sqlx::query(
            "INSERT INTO downloads \
             (id, file_id, message_id, file_name, mime_type, size_bytes, downloaded_bytes, status, error, created_at, updated_at) \
             VALUES ('download_stale_message', '111', ?, 'album.zip', 'application/zip', 11, 0, 'expired', NULL, ?, ?)",
        )
        .bind(&files[0].message_id)
        .bind(&now)
        .bind(&now)
        .execute(&state.db)
        .await
        .expect("seed stale download");
        {
            let mut runtime = state.runtime.write().await;
            runtime.downloads = load_downloads(&state.db).await.expect("load downloads");
        }

        let current_file_path = dir.path().join("album-current.zip");
        tokio::fs::write(&current_file_path, b"correct file")
            .await
            .expect("current tdlib file");
        state
            .apply_tdjson_response(json!({
                "@type": "message",
                "@extra": "download_message:download_stale_message:111",
                "id": 7001,
                "chat_id": bot.telegram_chat_id.parse::<i64>().unwrap(),
                "date": 1_700_000_000,
                "is_outgoing": false,
                "content": {
                    "@type": "messageDocument",
                    "caption": { "@type": "formattedText", "text": "archive", "entities": [] },
                    "document": {
                        "@type": "document",
                        "file_name": "album.zip",
                        "mime_type": "application/zip",
                        "document": {
                            "@type": "file",
                            "id": 222,
                            "size": 12,
                            "expected_size": 12,
                            "local": {
                                "@type": "localFile",
                                "path": current_file_path.to_string_lossy(),
                                "is_downloading_active": false,
                                "is_downloading_completed": true,
                                "downloaded_size": 12
                            }
                        }
                    }
                }
            }))
            .await
            .expect("download message response");

        let ready = state
            .download("download_stale_message")
            .await
            .expect("download after rehydrate");
        assert_eq!(ready.file_id, "222");
        assert_eq!(ready.status, DownloadStatus::Ready);
        assert_eq!(ready.proxy_url.as_deref(), Some("/api/files/222/proxy"));
        assert_eq!(
            state
                .cached_file_bytes("222")
                .await
                .expect("current cached bytes"),
            b"correct file"
        );
        assert!(matches!(
            state.cached_file_bytes("111").await,
            Err(AppError::NotFound { .. })
        ));

        let files = state.workspace_files().await;
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].file_id, "222");
        assert!(
            !state.replay_events(None, None).iter().any(|event| matches!(
                event,
                AppEvent::MessageSendAck {
                    client_request_id,
                    ..
                } if client_request_id.starts_with("download_message:")
            ))
        );
    }

    #[test]
    fn tdjson_send_message_request_builds_text_entities_and_reply() {
        let bot = PublishedBot {
            id: "bot_send".to_string(),
            telegram_chat_id: "424242".to_string(),
            username: Some("send_bot".to_string()),
            title: "Send Bot".to_string(),
            display_title: None,
            enabled: true,
            is_pinned: false,
            sort_order: 0,
            history_sync_policy: HistorySyncPolicy::LatestOnly,
            status: BotStatus::Available,
        };
        let request = SendMessageRequest {
            client_request_id: "req_send_text".to_string(),
            text: "hello bold".to_string(),
            entities: vec![TelegramEntity {
                entity_type: TelegramEntityType::Bold,
                offset_utf16: 6,
                length_utf16: 4,
                url: None,
                language: None,
                custom_emoji_id: None,
            }],
            reply_to_message_id: Some("99".to_string()),
            attachment_ids: Vec::new(),
            sent_by_access_key_name: None,
        };

        let value = tdjson_send_message_request(&bot, &request, Some(99), None).expect("request");

        assert_eq!(value["@type"], "sendMessage");
        assert_eq!(value["@extra"], "req_send_text");
        assert_eq!(value["chat_id"], 424242);
        assert_eq!(value["reply_to"]["message_id"], 99);
        assert_eq!(
            value["input_message_content"]["text"]["entities"][0]["type"]["@type"],
            "textEntityTypeBold"
        );
    }

    #[tokio::test]
    async fn tdjson_message_response_updates_pending_message_and_emits_ack() {
        let dir = tempfile::tempdir().expect("tempdir");
        let state = AppState::new(AppConfig::for_test(dir.path()))
            .await
            .expect("state");

        state
            .apply_tdjson_update(json!({
                "@type": "updateUser",
                "user": {
                    "@type": "user",
                    "id": 424242,
                    "first_name": "Reply",
                    "last_name": "Bot",
                    "type": { "@type": "userTypeBot" }
                }
            }))
            .await
            .expect("discover bot");
        let bot = state
            .publish_bot("424242", None, Some(true), None, None, None)
            .await
            .expect("publish bot");

        let mut pending = ChatMessage {
            id: "req_pending_ack".to_string(),
            telegram_message_id: None,
            bot_id: bot.id.clone(),
            direction: MessageDirection::Outgoing,
            text: Some("hello".to_string()),
            entities: Vec::new(),
            media: None,
            sent_by_internal_user: None,
            status: MessageStatus::Pending,
            created_at: now_rfc3339(),
            edited_at: None,
            reply_to_message_id: None,
            raw_available: Some(false),
            inline_keyboard: None,
        };
        state
            .persist_chat_message(&mut pending, &bot.telegram_chat_id, false)
            .await
            .expect("pending message");

        state
            .persist_tdjson_message(json!({
                "@type": "message",
                "@extra": "req_pending_ack",
                "id": 777,
                "chat_id": 424242,
                "is_outgoing": true,
                "date": 1770000000,
                "content": {
                    "@type": "messageText",
                    "text": {
                        "@type": "formattedText",
                        "text": "hello",
                        "entities": [{
                            "@type": "textEntity",
                            "offset": 0,
                            "length": 5,
                            "type": { "@type": "textEntityTypeBold" }
                        }]
                    }
                }
            }))
            .await
            .expect("tdjson message");

        let messages = state
            .list_messages(&bot.id, None, 10)
            .await
            .expect("messages");
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].id, "req_pending_ack");
        assert_eq!(messages[0].telegram_message_id.as_deref(), Some("777"));
        assert_eq!(messages[0].status, MessageStatus::Sent);
        assert_eq!(
            messages[0].entities[0].entity_type,
            TelegramEntityType::Bold
        );

        let replayed = state.replay_events(Some(&bot.id), None);
        assert!(replayed.iter().any(|event| {
            matches!(
                event,
                AppEvent::MessageSendAck {
                    client_request_id,
                    message_id: Some(message_id),
                    ..
                } if client_request_id == "req_pending_ack" && message_id == "777"
            )
        }));

        state
            .apply_tdjson_update(json!({
                "@type": "updateMessageContent",
                "chat_id": 424242,
                "message_id": 777,
                "new_content": {
                    "@type": "messageText",
                    "text": {
                        "@type": "formattedText",
                        "text": "hello final",
                        "entities": []
                    }
                }
            }))
            .await
            .expect("content update");

        let edited_messages = state
            .list_messages(&bot.id, None, 10)
            .await
            .expect("edited messages");
        assert_eq!(edited_messages.len(), 1);
        assert_eq!(edited_messages[0].text.as_deref(), Some("hello final"));
        assert_eq!(edited_messages[0].status, MessageStatus::Edited);

        let replayed = state.replay_events(Some(&bot.id), None);
        assert!(replayed
            .iter()
            .any(|event| matches!(event, AppEvent::MessageEdited { .. })));

        state
            .apply_tdjson_response(json!({
                "@type": "messages",
                "total_count": 1,
                "messages": [{
                    "@type": "message",
                    "id": 778,
                    "chat_id": 424242,
                    "is_outgoing": false,
                    "date": 1770000001,
                    "content": {
                        "@type": "messageText",
                        "text": {
                            "@type": "formattedText",
                            "text": "history item",
                            "entities": []
                        }
                    }
                }]
            }))
            .await
            .expect("history response");

        let history_messages = state
            .list_messages(&bot.id, None, 10)
            .await
            .expect("history messages");
        assert_eq!(history_messages.len(), 2);
        assert!(history_messages
            .iter()
            .any(|message| message.telegram_message_id.as_deref() == Some("778")));
    }

    #[tokio::test]
    async fn tdjson_send_success_merges_prior_tdlib_row_with_pending_request() {
        let (_dir, state, bot) = state_with_published_bot(525252).await;
        let td_date = Utc::now().timestamp();

        let mut pending = ChatMessage {
            id: "req_duplicate_send".to_string(),
            telegram_message_id: None,
            bot_id: bot.id.clone(),
            direction: MessageDirection::Outgoing,
            text: Some("hello".to_string()),
            entities: Vec::new(),
            media: None,
            sent_by_internal_user: None,
            status: MessageStatus::Pending,
            created_at: now_rfc3339(),
            edited_at: None,
            reply_to_message_id: None,
            raw_available: Some(false),
            inline_keyboard: None,
        };
        state
            .persist_chat_message(&mut pending, &bot.telegram_chat_id, false)
            .await
            .expect("pending message");

        state
            .apply_tdjson_update(json!({
                "@type": "updateNewMessage",
                "message": {
                    "@type": "message",
                    "id": 880,
                    "chat_id": 525252,
                    "is_outgoing": true,
                    "date": td_date,
                    "content": {
                        "@type": "messageText",
                        "text": {
                            "@type": "formattedText",
                            "text": "hello",
                            "entities": []
                        }
                    }
                }
            }))
            .await
            .expect("outgoing update new message");

        assert_eq!(
            state
                .list_messages(&bot.id, None, 10)
                .await
                .expect("messages before ack")
                .len(),
            1
        );

        state
            .apply_tdjson_update(json!({
                "@type": "updateMessageSendSucceeded",
                "@extra": "req_duplicate_send",
                "chat_id": 525252,
                "old_message_id": 879,
                "message": {
                    "@type": "message",
                    "id": 880,
                    "chat_id": 525252,
                    "is_outgoing": true,
                    "date": td_date,
                    "content": {
                        "@type": "messageText",
                        "text": {
                            "@type": "formattedText",
                            "text": "hello",
                            "entities": []
                        }
                    }
                }
            }))
            .await
            .expect("send succeeded");

        let messages = state
            .list_messages(&bot.id, None, 10)
            .await
            .expect("messages after ack");
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].id, "req_duplicate_send");
        assert_eq!(messages[0].telegram_message_id.as_deref(), Some("880"));
        assert_eq!(messages[0].status, MessageStatus::Sent);
    }

    #[tokio::test]
    async fn tdjson_send_success_removes_superseded_temporary_outgoing_row() {
        let (_dir, state, bot) = state_with_published_bot(535353).await;
        let td_date = Utc::now().timestamp();

        state
            .apply_tdjson_update(json!({
                "@type": "updateNewMessage",
                "message": {
                    "@type": "message",
                    "id": 990,
                    "chat_id": 535353,
                    "is_outgoing": true,
                    "sending_state": { "@type": "messageSendingStatePending" },
                    "date": td_date,
                    "content": {
                        "@type": "messageText",
                        "text": {
                            "@type": "formattedText",
                            "text": "hello temp",
                            "entities": []
                        }
                    }
                }
            }))
            .await
            .expect("temporary outgoing update");

        let mut pending = ChatMessage {
            id: "req_temp_cleanup".to_string(),
            telegram_message_id: None,
            bot_id: bot.id.clone(),
            direction: MessageDirection::Outgoing,
            text: Some("hello temp".to_string()),
            entities: Vec::new(),
            media: None,
            sent_by_internal_user: None,
            status: MessageStatus::Pending,
            created_at: now_rfc3339(),
            edited_at: None,
            reply_to_message_id: None,
            raw_available: Some(false),
            inline_keyboard: None,
        };
        state
            .persist_chat_message(&mut pending, &bot.telegram_chat_id, false)
            .await
            .expect("pending message");

        assert_eq!(
            state
                .list_messages(&bot.id, None, 10)
                .await
                .expect("messages before send success")
                .len(),
            2
        );

        state
            .apply_tdjson_update(json!({
                "@type": "updateMessageSendSucceeded",
                "@extra": "req_temp_cleanup",
                "chat_id": 535353,
                "old_message_id": 990,
                "message": {
                    "@type": "message",
                    "id": 991,
                    "chat_id": 535353,
                    "is_outgoing": true,
                    "date": td_date,
                    "content": {
                        "@type": "messageText",
                        "text": {
                            "@type": "formattedText",
                            "text": "hello temp",
                            "entities": []
                        }
                    }
                }
            }))
            .await
            .expect("send succeeded");

        let messages = state
            .list_messages(&bot.id, None, 10)
            .await
            .expect("messages after send success");
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].id, "req_temp_cleanup");
        assert_eq!(messages[0].telegram_message_id.as_deref(), Some("991"));
        assert_eq!(messages[0].status, MessageStatus::Sent);
    }

    #[tokio::test]
    async fn tdjson_pending_text_message_is_live_only_and_finalizes() {
        let (_dir, state, bot) = state_with_published_bot(515151).await;

        state
            .apply_tdjson_update(json!({
                "@type": "updatePendingTextMessage",
                "chat_id": 515151,
                "message_id": 900,
                "text": {
                    "@type": "formattedText",
                    "text": "partial answer",
                    "entities": [{
                        "@type": "textEntity",
                        "offset": 0,
                        "length": 7,
                        "type": { "@type": "textEntityTypeBold" }
                    }]
                }
            }))
            .await
            .expect("pending text");

        let drafts = state.runtime.read().await.pending_drafts.clone();
        assert_eq!(drafts.len(), 1);
        assert_eq!(drafts[0].draft_id, "900");
        assert_eq!(drafts[0].text, "partial answer");
        assert_eq!(drafts[0].entities[0].entity_type, TelegramEntityType::Bold);
        assert!(state
            .list_messages(&bot.id, None, 10)
            .await
            .expect("messages")
            .is_empty());

        state
            .apply_tdjson_update(json!({
                "@type": "updatePendingTextMessage",
                "chat_id": 515151,
                "message_id": 900,
                "text": {
                    "@type": "formattedText",
                    "text": "partial answer updated",
                    "entities": []
                }
            }))
            .await
            .expect("pending text replacement");

        let drafts = state.runtime.read().await.pending_drafts.clone();
        assert_eq!(drafts.len(), 1);
        assert_eq!(drafts[0].text, "partial answer updated");
        assert_eq!(drafts[0].replaces_draft_id.as_deref(), Some("900"));

        state
            .apply_tdjson_update(json!({
                "@type": "updateNewMessage",
                "message": {
                    "@type": "message",
                    "id": 901,
                    "chat_id": 515151,
                    "is_outgoing": false,
                    "date": 1770000100,
                    "content": {
                        "@type": "messageText",
                        "text": {
                            "@type": "formattedText",
                            "text": "final answer",
                            "entities": []
                        }
                    }
                }
            }))
            .await
            .expect("final message");

        assert!(state.runtime.read().await.pending_drafts.is_empty());
        let messages = state
            .list_messages(&bot.id, None, 10)
            .await
            .expect("messages");
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].text.as_deref(), Some("final answer"));

        let replayed = state.replay_events(Some(&bot.id), None);
        assert!(replayed.iter().any(|event| {
            matches!(
                event,
                AppEvent::DraftFinalized {
                    draft_id,
                    final_message_id,
                    ..
                } if draft_id == "900" && final_message_id == &messages[0].id
            )
        }));
    }

    #[tokio::test]
    async fn tdjson_edit_and_delete_updates_persisted_message() {
        let (_dir, state, bot) = state_with_published_bot(616161).await;

        state
            .persist_tdjson_message(json!({
                "@type": "message",
                "id": 777,
                "chat_id": 616161,
                "is_outgoing": false,
                "date": 1770000200,
                "content": {
                    "@type": "messageText",
                    "text": {
                        "@type": "formattedText",
                        "text": "original",
                        "entities": []
                    }
                }
            }))
            .await
            .expect("message");

        state
            .apply_tdjson_update(json!({
                "@type": "updateMessageEdited",
                "chat_id": 616161,
                "message_id": 777,
                "edit_date": 1770000300,
                "reply_markup": {
                    "@type": "replyMarkupInlineKeyboard",
                    "rows": [[{
                        "@type": "inlineKeyboardButton",
                        "text": "Open",
                        "type": { "@type": "inlineKeyboardButtonTypeUrl", "url": "https://example.test" }
                    }]]
                }
            }))
            .await
            .expect("edited");

        let edited = state
            .list_messages(&bot.id, None, 10)
            .await
            .expect("messages");
        assert_eq!(edited[0].status, MessageStatus::Edited);
        assert_eq!(
            edited[0]
                .inline_keyboard
                .as_ref()
                .expect("inline keyboard")
                .inline_keyboard[0][0]
                .url
                .as_deref(),
            Some("https://example.test")
        );

        for transient_delete in [
            json!({
                "@type": "updateDeleteMessages",
                "chat_id": 616161,
                "message_ids": [777],
                "is_permanent": false,
                "from_cache": false
            }),
            json!({
                "@type": "updateDeleteMessages",
                "chat_id": 616161,
                "message_ids": [777],
                "is_permanent": true,
                "from_cache": true
            }),
        ] {
            state
                .apply_tdjson_update(transient_delete)
                .await
                .expect("transient delete ignored");

            let preserved = state
                .list_messages(&bot.id, None, 10)
                .await
                .expect("messages");
            assert_eq!(preserved[0].status, MessageStatus::Edited);
        }

        state
            .apply_tdjson_update(json!({
                "@type": "updateDeleteMessages",
                "chat_id": 616161,
                "message_ids": [777],
                "is_permanent": true,
                "from_cache": false
            }))
            .await
            .expect("deleted");

        let deleted = state
            .list_messages(&bot.id, None, 10)
            .await
            .expect("messages");
        assert_eq!(deleted[0].status, MessageStatus::Deleted);
        assert!(state
            .replay_events(Some(&bot.id), None)
            .iter()
            .any(|event| {
                matches!(
                    event,
                    AppEvent::MessageDeleted { message_id, .. } if message_id == &deleted[0].id
                )
            }));
    }

    #[tokio::test]
    async fn tdjson_send_success_and_failure_target_single_pending_message() {
        let (_dir, state, bot) = state_with_published_bot(717171).await;

        for id in ["req_success", "req_failed"] {
            let mut pending = ChatMessage {
                id: id.to_string(),
                telegram_message_id: None,
                bot_id: bot.id.clone(),
                direction: MessageDirection::Outgoing,
                text: Some(id.to_string()),
                entities: Vec::new(),
                media: None,
                sent_by_internal_user: None,
                status: MessageStatus::Pending,
                created_at: now_rfc3339(),
                edited_at: None,
                reply_to_message_id: None,
                raw_available: Some(false),
                inline_keyboard: None,
            };
            state
                .persist_chat_message(&mut pending, &bot.telegram_chat_id, false)
                .await
                .expect("pending message");
        }

        state
            .apply_tdjson_update(json!({
                "@type": "updateMessageSendSucceeded",
                "@extra": "req_success",
                "old_message_id": 100,
                "message": {
                    "@type": "message",
                    "id": 101,
                    "chat_id": 717171,
                    "is_outgoing": true,
                    "date": 1770000400,
                    "content": {
                        "@type": "messageText",
                        "text": {
                            "@type": "formattedText",
                            "text": "sent",
                            "entities": []
                        }
                    }
                }
            }))
            .await
            .expect("send succeeded");

        state
            .apply_tdjson_update(json!({
                "@type": "updateMessageSendFailed",
                "@extra": "req_failed",
                "chat_id": 717171,
                "old_message_id": 102,
                "error_message": "rate limited"
            }))
            .await
            .expect("send failed");

        let messages = state
            .list_messages(&bot.id, None, 10)
            .await
            .expect("messages");
        let success = messages
            .iter()
            .find(|message| message.id == "req_success")
            .expect("success message");
        let failed = messages
            .iter()
            .find(|message| message.id == "req_failed")
            .expect("failed message");
        assert_eq!(success.status, MessageStatus::Sent);
        assert_eq!(success.telegram_message_id.as_deref(), Some("101"));
        assert_eq!(failed.status, MessageStatus::Failed);
        assert!(state
            .replay_events(Some(&bot.id), None)
            .iter()
            .any(|event| {
                matches!(
                    event,
                    AppEvent::MessageSendFailed {
                        client_request_id,
                        error,
                        ..
                    } if client_request_id == "req_failed" && error == "rate limited"
                )
            }));
    }

    #[tokio::test]
    async fn replay_events_filters_by_bot_and_after_cursor() {
        let dir = tempfile::tempdir().expect("tempdir");
        let state = AppState::new(AppConfig::for_test(dir.path()))
            .await
            .expect("state");

        let first = AppEvent::connection(ConnectionStatus::Reconnecting, Some("first".to_string()));
        let first_id = first.event_id().to_string();
        state.emit(first);

        state.emit(AppEvent::BotPublished {
            event_id: new_event_id(),
            occurred_at: now_rfc3339(),
            bot: BotSummary {
                id: "bot_1".to_string(),
                telegram_chat_id: "tg_chat_1".to_string(),
                username: Some("example_bot".to_string()),
                title: "Example Bot".to_string(),
                avatar_url: None,
                last_message_preview: None,
                unread_count: 0,
                is_pinned: Some(false),
                status: BotStatus::Available,
            },
        });

        assert_eq!(state.replay_events(None, None).len(), 2);
        assert_eq!(state.replay_events(Some("bot_1"), None).len(), 1);
        assert_eq!(state.replay_events(None, Some(&first_id)).len(), 1);
    }
}
