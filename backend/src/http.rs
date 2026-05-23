use crate::{
    config::CorsOrigin,
    error::{AppError, AppResult},
    models::{
        AccessKeyLoginRequest, AdminLoginRequest, AppEvent, AuthLoginResponse, AuthRole,
        AuthSession, ClearDownloadCacheResponse, ConnectionStatus, CreateAccessKeyRequest,
        DownloadCacheSummary, DownloadItem, DownloadQueueItem, EnqueueDownloadQueueRequest,
        HealthResponse, InlineKeyboardClickRequest, LoginCodeRequest, LoginPasswordRequest,
        LoginPhoneRequest, PatchPublishedBotRequest, PublishBotRequest,
        SaveTelegramCredentialsRequest, SearchUsernameRequest, SendMessageRequest, SettingsPatch,
        TriggerDownloadRequest, WorkspaceFileStatus,
    },
    state::AppState,
};
use axum::{
    body::Body,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Extension, Multipart, Path, Query, State,
    },
    http::{
        header::{AUTHORIZATION, CONTENT_LENGTH, CONTENT_TYPE},
        HeaderMap, HeaderValue, Method, Request, StatusCode,
    },
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post, put},
    Json, Router,
};
use futures_util::{stream::SplitSink, SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::json;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

pub fn router(state: AppState) -> Router {
    let public_api = Router::new()
        .route("/health", get(health))
        .route("/auth/admin/login", post(login_admin))
        .route("/auth/access-key/login", post(login_access_key))
        .route("/ws", get(websocket));

    let protected_api = Router::new()
        .route("/me", get(me))
        .route("/bots", get(list_bots))
        .route("/bots/{bot_id}/commands", get(list_bot_commands))
        .route(
            "/bots/{bot_id}/messages",
            get(list_messages).post(send_message),
        )
        .route(
            "/bots/{bot_id}/messages/{message_id}/callback",
            post(click_inline_keyboard_button),
        )
        .route("/bots/{bot_id}/uploads", post(upload_file))
        .route("/downloads", get(list_downloads).post(trigger_download))
        .route("/downloads/{download_id}", get(get_download))
        .route("/downloads/{download_id}/pause", post(pause_download))
        .route("/downloads/{download_id}/resume", post(resume_download))
        .route("/downloads/{download_id}/stop", post(stop_download))
        .route(
            "/download-queue",
            get(list_download_queue)
                .post(enqueue_download_queue_item)
                .delete(clear_download_queue),
        )
        .route(
            "/download-queue/{item_id}/skip",
            post(skip_download_queue_item),
        )
        .route(
            "/download-queue/{item_id}/complete",
            post(complete_download_queue_item),
        )
        .route("/files/{file_id}/proxy", get(proxy_file))
        .route("/qobuz/store/regions", get(list_qobuz_store_regions))
        .route("/qobuz/store/search/albums", get(search_qobuz_store_albums))
        .route("/settings", get(get_settings).post(update_settings))
        .route("/events/replay", get(replay_events))
        .route("/workspace/files", get(list_workspace_files))
        .route(
            "/workspace/files/{file_id}/status",
            patch(update_workspace_file_status),
        )
        .route(
            "/workspace/files/{file_id}/tag",
            patch(update_workspace_file_tag),
        )
        .layer(middleware::from_fn_with_state(
            state.clone(),
            require_authenticated,
        ));

    let admin_api =
        admin_router().layer(middleware::from_fn_with_state(state.clone(), require_admin));

    let api = public_api.merge(protected_api).nest("/admin", admin_api);

    Router::new()
        .nest("/api", api)
        .layer(TraceLayer::new_for_http())
        .layer(cors_layer(&state))
        .with_state(state)
}

fn admin_router() -> Router<AppState> {
    Router::new()
        .route(
            "/access-keys",
            get(list_access_keys).post(create_access_key),
        )
        .route("/access-keys/{key_id}", delete(revoke_access_key))
        .route("/telegram/status", get(get_telegram_status))
        .route("/telegram/credentials", put(save_telegram_credentials))
        .route("/telegram/login/phone", post(login_phone))
        .route("/telegram/login/code", post(login_code))
        .route("/telegram/login/password", post(login_password))
        .route("/telegram/login/qr", post(login_qr))
        .route("/telegram/reconnect", post(reconnect_telegram))
        .route("/telegram/logout", post(logout_telegram))
        .route(
            "/download-cache",
            get(download_cache_summary).delete(clear_download_cache),
        )
        .route(
            "/download-cache/files/{file_id}",
            delete(clear_download_cache_file),
        )
        .route("/telegram/chats", get(list_telegram_chats))
        .route(
            "/telegram/chats/search-username",
            post(search_telegram_username),
        )
        .route(
            "/published-bots",
            get(list_published_bots).post(publish_bot),
        )
        .route(
            "/published-bots/{bot_id}",
            patch(patch_published_bot).delete(unpublish_bot),
        )
        .route(
            "/published-bots/{bot_id}/sync-history",
            post(sync_published_bot_history),
        )
}

fn cors_layer(state: &AppState) -> CorsLayer {
    match &state.config.cors_origin {
        CorsOrigin::Any => CorsLayer::permissive(),
        CorsOrigin::Exact(origin) => CorsLayer::new()
            .allow_origin(
                origin
                    .parse::<HeaderValue>()
                    .expect("TG2WEB_CORS_ORIGIN must be a valid header value"),
            )
            .allow_methods([
                Method::GET,
                Method::POST,
                Method::PUT,
                Method::PATCH,
                Method::DELETE,
            ])
            .allow_headers(tower_http::cors::Any),
    }
}

async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    let _db_pool_size = state.database_pool_size();
    Json(HealthResponse {
        status: "ok".to_string(),
        service: "tg2web-backend".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

async fn login_admin(
    State(state): State<AppState>,
    Json(request): Json<AdminLoginRequest>,
) -> AppResult<Json<AuthLoginResponse>> {
    if request.password.is_empty() {
        return Err(AppError::bad_request(
            "missing_password",
            "admin password is required",
        ));
    }

    Ok(Json(
        state
            .auth
            .login_admin(&state.db, &request.password)
            .await?
            .into(),
    ))
}

async fn login_access_key(
    State(state): State<AppState>,
    Json(request): Json<AccessKeyLoginRequest>,
) -> AppResult<Json<AuthLoginResponse>> {
    if request.access_key.trim().is_empty() {
        return Err(AppError::bad_request(
            "missing_access_key",
            "access key is required",
        ));
    }

    Ok(Json(
        state
            .auth
            .login_access_key(&state.db, request.access_key.trim())
            .await?
            .into(),
    ))
}

async fn require_authenticated(
    State(state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> AppResult<Response> {
    let session = authenticate_headers(&state, request.headers()).await?;
    request.extensions_mut().insert(session);
    Ok(next.run(request).await)
}

async fn require_admin(
    State(state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> AppResult<Response> {
    let session = authenticate_headers(&state, request.headers()).await?;
    ensure_admin_session(&session)?;
    request.extensions_mut().insert(session);
    Ok(next.run(request).await)
}

async fn authenticate_headers(state: &AppState, headers: &HeaderMap) -> AppResult<AuthSession> {
    let token = bearer_token(headers)?;
    state.auth.resolve_session(token).await
}

fn bearer_token(headers: &HeaderMap) -> AppResult<&str> {
    let header = headers.get(AUTHORIZATION).ok_or_else(|| {
        AppError::unauthorized("missing_session", "authorization bearer token is required")
    })?;

    let value = header.to_str().map_err(|_| {
        AppError::unauthorized("invalid_session", "authorization header is invalid")
    })?;

    value
        .strip_prefix("Bearer ")
        .filter(|token| !token.trim().is_empty())
        .map(str::trim)
        .ok_or_else(|| {
            AppError::unauthorized("invalid_session", "authorization bearer token is invalid")
        })
}

fn ensure_admin_session(session: &AuthSession) -> AppResult<()> {
    if session.user.role != AuthRole::Admin {
        return Err(AppError::forbidden(
            "admin_required",
            "administrator access is required",
        ));
    }

    Ok(())
}

async fn me(
    State(state): State<AppState>,
    Extension(session): Extension<AuthSession>,
) -> Json<crate::models::MeResponse> {
    Json(state.me(Some(&session)).await)
}

async fn list_bots(State(state): State<AppState>) -> Json<Vec<crate::models::BotSummary>> {
    Json(state.list_bots().await)
}

async fn list_bot_commands(
    State(state): State<AppState>,
    Path(bot_id): Path<String>,
) -> AppResult<Json<Vec<crate::models::BotCommand>>> {
    Ok(Json(state.bot_commands(&bot_id).await?))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MessagesQuery {
    before: Option<String>,
    limit: Option<usize>,
}

async fn list_messages(
    Extension(session): Extension<AuthSession>,
    State(state): State<AppState>,
    Path(bot_id): Path<String>,
    Query(query): Query<MessagesQuery>,
) -> AppResult<Json<Vec<crate::models::ChatMessage>>> {
    Ok(Json(
        state
            .list_messages_for_session(
                &session,
                &bot_id,
                query.before.as_deref(),
                query.limit.unwrap_or(50),
            )
            .await?,
    ))
}

async fn send_message(
    Extension(session): Extension<AuthSession>,
    State(state): State<AppState>,
    Path(bot_id): Path<String>,
    Json(mut request): Json<SendMessageRequest>,
) -> AppResult<Json<crate::models::ChatMessage>> {
    let bot = state.ensure_published_bot(&bot_id).await?;

    if session.user.role == AuthRole::User {
        request.sent_by_access_key_name = session.user.access_key_name.clone();
    }

    if request.text.trim().is_empty() && request.attachment_ids.is_empty() {
        return Err(AppError::bad_request(
            "empty_message",
            "message text or attachments are required",
        ));
    }

    Ok(Json(
        state.send_message_to_bot(&session, &bot, request).await?,
    ))
}

async fn click_inline_keyboard_button(
    Extension(session): Extension<AuthSession>,
    State(state): State<AppState>,
    Path((bot_id, message_id)): Path<(String, String)>,
    Json(request): Json<InlineKeyboardClickRequest>,
) -> AppResult<Json<crate::models::InlineKeyboardClickResponse>> {
    Ok(Json(
        state
            .click_inline_keyboard_button(&session, &bot_id, &message_id, request)
            .await?,
    ))
}

async fn upload_file(
    State(state): State<AppState>,
    Path(bot_id): Path<String>,
    mut multipart: Multipart,
) -> AppResult<Json<serde_json::Value>> {
    state.ensure_published_bot(&bot_id).await?;

    while let Some(field) = multipart.next_field().await.map_err(|error| {
        AppError::bad_request(
            "invalid_multipart",
            format!("invalid multipart upload: {error}"),
        )
    })? {
        let is_file_field = field.name() == Some("file") || field.file_name().is_some();
        if !is_file_field {
            continue;
        }

        let file_name = field.file_name().map(ToOwned::to_owned);
        let bytes = field.bytes().await.map_err(|error| {
            AppError::bad_request(
                "invalid_multipart",
                format!("invalid multipart upload: {error}"),
            )
        })?;
        if bytes.is_empty() {
            return Err(AppError::bad_request(
                "empty_upload",
                "uploaded file must not be empty",
            ));
        }

        let file_id = crate::models::new_id("upload");
        tokio::fs::write(state.cached_file_path(&file_id), &bytes).await?;
        return Ok(Json(json!({
            "fileId": file_id,
            "fileName": file_name.unwrap_or_else(|| "upload.bin".to_string()),
            "sizeBytes": bytes.len(),
        })));
    }

    Err(AppError::bad_request(
        "missing_file",
        "multipart upload must include a file field",
    ))
}

async fn list_downloads(
    Extension(session): Extension<AuthSession>,
    State(state): State<AppState>,
) -> Json<Vec<DownloadItem>> {
    Json(state.downloads_for_session(&session).await)
}

async fn get_download(
    Extension(session): Extension<AuthSession>,
    State(state): State<AppState>,
    Path(download_id): Path<String>,
) -> AppResult<Json<DownloadItem>> {
    let download = state.download(&download_id).await?;
    ensure_download_visible_to_session(&state, &session, &download).await?;
    Ok(Json(download))
}

async fn pause_download(
    Extension(session): Extension<AuthSession>,
    State(state): State<AppState>,
    Path(download_id): Path<String>,
) -> AppResult<Json<DownloadItem>> {
    let download = state.download(&download_id).await?;
    ensure_download_visible_to_session(&state, &session, &download).await?;
    Ok(Json(state.pause_download(&download_id).await?))
}

async fn resume_download(
    Extension(session): Extension<AuthSession>,
    State(state): State<AppState>,
    Path(download_id): Path<String>,
) -> AppResult<Json<DownloadItem>> {
    let download = state.download(&download_id).await?;
    ensure_download_visible_to_session(&state, &session, &download).await?;
    Ok(Json(state.resume_download(&download_id).await?))
}

async fn stop_download(
    Extension(session): Extension<AuthSession>,
    State(state): State<AppState>,
    Path(download_id): Path<String>,
) -> AppResult<Json<DownloadItem>> {
    let download = state.download(&download_id).await?;
    ensure_download_visible_to_session(&state, &session, &download).await?;
    Ok(Json(state.stop_download(&download_id).await?))
}

async fn list_download_queue(
    State(state): State<AppState>,
) -> AppResult<Json<Vec<DownloadQueueItem>>> {
    Ok(Json(state.list_download_queue().await?))
}

async fn enqueue_download_queue_item(
    Extension(session): Extension<AuthSession>,
    State(state): State<AppState>,
    Json(request): Json<EnqueueDownloadQueueRequest>,
) -> AppResult<Json<DownloadQueueItem>> {
    Ok(Json(
        state.enqueue_download_queue_item(&session, request).await?,
    ))
}

async fn skip_download_queue_item(
    State(state): State<AppState>,
    Path(item_id): Path<String>,
) -> AppResult<Json<DownloadQueueItem>> {
    Ok(Json(state.skip_download_queue_item(&item_id).await?))
}

async fn complete_download_queue_item(
    State(state): State<AppState>,
    Path(item_id): Path<String>,
) -> AppResult<Json<DownloadQueueItem>> {
    Ok(Json(state.complete_download_queue_item(&item_id).await?))
}

async fn clear_download_queue(State(state): State<AppState>) -> AppResult<StatusCode> {
    state.clear_download_queue().await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn trigger_download(
    Extension(session): Extension<AuthSession>,
    State(state): State<AppState>,
    Json(request): Json<TriggerDownloadRequest>,
) -> AppResult<Json<DownloadItem>> {
    if session.user.role != AuthRole::Admin
        && !state
            .file_visible_to_session(&session, &request.file_id)
            .await?
    {
        return Err(AppError::not_found("file_not_found", "file was not found"));
    }

    Ok(Json(state.trigger_download(request).await?))
}

async fn ensure_download_visible_to_session(
    state: &AppState,
    session: &AuthSession,
    download: &DownloadItem,
) -> AppResult<()> {
    if session.user.role == AuthRole::Admin
        || state
            .file_visible_to_session(session, &download.file_id)
            .await?
    {
        return Ok(());
    }

    Err(AppError::not_found(
        "download_not_found",
        "download was not found",
    ))
}

async fn proxy_file(
    Extension(session): Extension<AuthSession>,
    State(state): State<AppState>,
    Path(file_id): Path<String>,
) -> AppResult<Response> {
    if !state.file_visible_to_session(&session, &file_id).await? {
        return Err(AppError::not_found(
            "file_not_cached",
            "file is not available in the server media cache yet",
        ));
    }

    let bytes = state.cached_file_bytes(&file_id).await?;
    let content_length = bytes.len().to_string();
    let mut response = Response::new(Body::from(bytes));
    response.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/octet-stream"),
    );
    response.headers_mut().insert(
        CONTENT_LENGTH,
        HeaderValue::from_str(&content_length).expect("content length header"),
    );
    Ok(response)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QobuzAlbumSearchQuery {
    query: Option<String>,
    region: Option<String>,
    page: Option<u32>,
}

async fn list_qobuz_store_regions(
    State(state): State<AppState>,
) -> Json<Vec<crate::models::QobuzStoreRegion>> {
    Json(state.qobuz_store_regions())
}

async fn search_qobuz_store_albums(
    State(state): State<AppState>,
    Query(query): Query<QobuzAlbumSearchQuery>,
) -> AppResult<Json<crate::models::QobuzAlbumSearchResponse>> {
    Ok(Json(
        state
            .search_qobuz_albums(
                query.region.as_deref(),
                query.query.as_deref().unwrap_or_default(),
                query.page,
            )
            .await?,
    ))
}

async fn get_settings(State(state): State<AppState>) -> Json<crate::models::Settings> {
    Json(state.settings().await)
}

async fn update_settings(
    Extension(session): Extension<AuthSession>,
    State(state): State<AppState>,
    Json(patch): Json<SettingsPatch>,
) -> AppResult<Json<crate::models::Settings>> {
    ensure_admin_session(&session)?;
    Ok(Json(state.update_settings(patch).await?))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReplayQuery {
    bot_id: Option<String>,
    after: Option<String>,
}

async fn replay_events(
    Extension(session): Extension<AuthSession>,
    State(state): State<AppState>,
    Query(query): Query<ReplayQuery>,
) -> Json<Vec<AppEvent>> {
    Json(
        state
            .replay_events_for_session(&session, query.bot_id.as_deref(), query.after.as_deref())
            .await,
    )
}

#[derive(Debug, Deserialize)]
struct WebsocketQuery {
    token: Option<String>,
}

async fn websocket(
    State(state): State<AppState>,
    Query(query): Query<WebsocketQuery>,
    ws: WebSocketUpgrade,
) -> axum::response::Response {
    let Some(token) = query.token.as_deref() else {
        return AppError::unauthorized("missing_session", "websocket token is required")
            .into_response();
    };

    match state.auth.resolve_session(token).await {
        Ok(session) => ws
            .on_upgrade(move |socket| websocket_session(socket, state, session))
            .into_response(),
        Err(error) => error.into_response(),
    }
}

async fn websocket_session(socket: WebSocket, state: AppState, session: AuthSession) {
    let (mut sender, mut receiver) = socket.split();
    let connected = state.connection_event(ConnectionStatus::Connected, None);

    if send_ws_event(&mut sender, &connected).await.is_err() {
        return;
    }

    let mut events = state.subscribe_events();

    loop {
        tokio::select! {
            incoming = receiver.next() => {
                if !handle_ws_message(incoming, &mut sender).await {
                    break;
                }
            }
            event = events.recv() => {
                match event {
                    Ok(event) => {
                        if !state.event_visible_to_session(&session, &event).await {
                            continue;
                        }
                        if send_ws_event(&mut sender, &event).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                        let event = state.connection_event(
                            ConnectionStatus::Reconnecting,
                            Some(format!("websocket skipped {skipped} event(s)")),
                        );
                        if send_ws_event(&mut sender, &event).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }
}

async fn handle_ws_message(
    incoming: Option<Result<Message, axum::Error>>,
    sender: &mut SplitSink<WebSocket, Message>,
) -> bool {
    match incoming {
        Some(Ok(Message::Close(_))) | None => false,
        Some(Ok(Message::Ping(bytes))) => sender.send(Message::Pong(bytes)).await.is_ok(),
        Some(Ok(_)) => true,
        Some(Err(error)) => {
            tracing::debug!(%error, "websocket receive failed");
            false
        }
    }
}

async fn send_ws_event(
    sender: &mut SplitSink<WebSocket, Message>,
    event: &AppEvent,
) -> Result<(), axum::Error> {
    let payload = serde_json::to_string(event).expect("app event serializes");
    sender.send(Message::Text(payload.into())).await
}

async fn get_telegram_status(
    State(state): State<AppState>,
) -> Json<crate::models::TelegramStatusResponse> {
    Json(state.telegram_status().await)
}

async fn list_access_keys(
    State(state): State<AppState>,
) -> AppResult<Json<Vec<crate::models::AccessKey>>> {
    Ok(Json(state.list_access_keys().await?))
}

async fn create_access_key(
    State(state): State<AppState>,
    Json(request): Json<CreateAccessKeyRequest>,
) -> AppResult<Json<crate::models::AccessKey>> {
    Ok(Json(state.create_access_key(request).await?))
}

async fn revoke_access_key(
    State(state): State<AppState>,
    Path(key_id): Path<String>,
) -> AppResult<StatusCode> {
    state.revoke_access_key(&key_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn save_telegram_credentials(
    State(state): State<AppState>,
    Json(request): Json<SaveTelegramCredentialsRequest>,
) -> AppResult<Json<crate::models::TelegramStatusResponse>> {
    Ok(Json(
        state
            .save_telegram_credentials(&request.api_id, &request.api_hash)
            .await?,
    ))
}

async fn login_phone(
    State(state): State<AppState>,
    Json(request): Json<LoginPhoneRequest>,
) -> AppResult<Json<crate::models::TelegramStatusResponse>> {
    Ok(Json(
        state
            .start_telegram_phone_login(&request.phone_number)
            .await?,
    ))
}

async fn login_code(
    State(state): State<AppState>,
    Json(request): Json<LoginCodeRequest>,
) -> AppResult<Json<crate::models::TelegramStatusResponse>> {
    Ok(Json(state.submit_telegram_login_code(&request.code).await?))
}

async fn login_password(
    State(state): State<AppState>,
    Json(request): Json<LoginPasswordRequest>,
) -> AppResult<Json<crate::models::TelegramStatusResponse>> {
    Ok(Json(
        state
            .submit_telegram_2fa_password(&request.password)
            .await?,
    ))
}

async fn login_qr(
    State(state): State<AppState>,
) -> AppResult<Json<crate::models::TelegramStatusResponse>> {
    Ok(Json(state.start_telegram_qr_login().await?))
}

async fn reconnect_telegram(
    State(state): State<AppState>,
) -> AppResult<Json<crate::models::TelegramStatusResponse>> {
    Ok(Json(state.reconnect_telegram().await?))
}

async fn logout_telegram(
    State(state): State<AppState>,
) -> AppResult<Json<crate::models::TelegramStatusResponse>> {
    Ok(Json(state.logout_telegram().await?))
}

async fn clear_download_cache(
    State(state): State<AppState>,
) -> AppResult<Json<ClearDownloadCacheResponse>> {
    Ok(Json(state.clear_download_cache().await?))
}

async fn download_cache_summary(
    State(state): State<AppState>,
) -> AppResult<Json<DownloadCacheSummary>> {
    Ok(Json(state.download_cache_summary().await?))
}

async fn clear_download_cache_file(
    State(state): State<AppState>,
    Path(file_id): Path<String>,
) -> AppResult<Json<ClearDownloadCacheResponse>> {
    Ok(Json(state.clear_download_cache_file(&file_id).await?))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatsQuery {
    kind: Option<String>,
    query: Option<String>,
}

async fn list_telegram_chats(
    State(state): State<AppState>,
    Query(query): Query<ChatsQuery>,
) -> Json<Vec<crate::models::DiscoveredTelegramChat>> {
    Json(
        state
            .list_discovered_chats_filtered(query.query, query.kind.as_deref())
            .await,
    )
}

async fn search_telegram_username(
    State(state): State<AppState>,
    Json(request): Json<SearchUsernameRequest>,
) -> AppResult<Json<crate::models::DiscoveredTelegramChat>> {
    Ok(Json(
        state.search_telegram_username(&request.username).await?,
    ))
}

async fn list_published_bots(
    State(state): State<AppState>,
) -> Json<Vec<crate::models::PublishedBot>> {
    Json(state.list_published_bots().await)
}

async fn publish_bot(
    State(state): State<AppState>,
    Json(request): Json<PublishBotRequest>,
) -> AppResult<Json<crate::models::PublishedBot>> {
    Ok(Json(
        state
            .publish_bot(
                &request.telegram_chat_id,
                request.display_title,
                request.enabled,
                request.is_pinned,
                request.sort_order,
                request.history_sync_policy,
            )
            .await?,
    ))
}

async fn patch_published_bot(
    State(state): State<AppState>,
    Path(bot_id): Path<String>,
    Json(request): Json<PatchPublishedBotRequest>,
) -> AppResult<Json<crate::models::PublishedBot>> {
    Ok(Json(
        state
            .patch_published_bot(
                &bot_id,
                request.display_title,
                request.enabled,
                request.is_pinned,
                request.sort_order,
                request.history_sync_policy,
            )
            .await?,
    ))
}

async fn unpublish_bot(
    State(state): State<AppState>,
    Path(bot_id): Path<String>,
) -> AppResult<StatusCode> {
    state.unpublish_bot(&bot_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn sync_published_bot_history(
    State(state): State<AppState>,
    Path(bot_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    state.sync_published_bot_history(&bot_id).await?;
    Ok(empty_ok())
}

async fn list_workspace_files(
    Extension(session): Extension<AuthSession>,
    State(state): State<AppState>,
) -> AppResult<Json<Vec<crate::models::WorkspaceFile>>> {
    Ok(Json(state.workspace_files_for_session(&session).await?))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileStatusPatch {
    status: WorkspaceFileStatus,
}

async fn update_workspace_file_status(
    State(state): State<AppState>,
    Path(file_id): Path<String>,
    Json(request): Json<FileStatusPatch>,
) -> AppResult<Json<crate::models::WorkspaceFile>> {
    Ok(Json(
        state
            .update_workspace_file_status(&file_id, request.status)
            .await?,
    ))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileTagPatch {
    tag: String,
}

async fn update_workspace_file_tag(
    State(state): State<AppState>,
    Path(file_id): Path<String>,
    Json(request): Json<FileTagPatch>,
) -> AppResult<Json<crate::models::WorkspaceFile>> {
    Ok(Json(
        state
            .update_workspace_file_tag(&file_id, request.tag)
            .await?,
    ))
}

#[allow(dead_code)]
fn empty_ok() -> Json<serde_json::Value> {
    Json(json!({ "ok": true }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use serde_json::Value;
    use sqlx::Row;
    use tower::ServiceExt;

    async fn test_state() -> (AppState, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("tempdir");
        let state = AppState::new(crate::config::AppConfig::for_test(dir.path()))
            .await
            .expect("state");
        state
            .auth
            .set_admin_password_for_test(&state.db, "admin-test")
            .await
            .expect("test admin password");
        (state, dir)
    }

    async fn test_app() -> (Router, tempfile::TempDir) {
        let (state, dir) = test_state().await;
        (router(state), dir)
    }

    async fn test_app_with_published_bot() -> (
        Router,
        AppState,
        crate::models::PublishedBot,
        tempfile::TempDir,
    ) {
        let dir = tempfile::tempdir().expect("tempdir");
        let config = crate::config::AppConfig::for_test(dir.path());
        let db = crate::storage::connect(&config.database_path)
            .await
            .expect("db");
        let now = crate::models::now_rfc3339();
        sqlx::query(
            "INSERT INTO discovered_telegram_chats \
             (telegram_chat_id, username, title, kind, is_bot, status, discovered_at, updated_at) \
             VALUES ('tg_chat_http', 'http_bot', 'HTTP Bot', 'bot', 1, 'available', ?, ?)",
        )
        .bind(&now)
        .bind(&now)
        .execute(&db)
        .await
        .expect("seed bot");
        drop(db);

        let state = AppState::new(config).await.expect("state");
        state
            .auth
            .set_admin_password_for_test(&state.db, "admin-test")
            .await
            .expect("test admin password");
        let bot = state
            .publish_bot("tg_chat_http", None, Some(true), None, None, None)
            .await
            .expect("publish bot");
        (router(state.clone()), state, bot, dir)
    }

    async fn json_response(response: axum::response::Response) -> Value {
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body bytes");
        serde_json::from_slice(&bytes).expect("json response")
    }

    async fn admin_token(app: &Router) -> String {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/auth/admin/login")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"password":"admin-test"}"#))
                    .expect("request"),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::OK);
        let body = json_response(response).await;
        body["token"].as_str().expect("token").to_string()
    }

    fn bearer_header(token: &str) -> String {
        format!("Bearer {token}")
    }

    #[tokio::test]
    async fn health_endpoint_returns_ok() {
        let (app, _dir) = test_app().await;

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/health")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::OK);
        let body = json_response(response).await;
        assert_eq!(body["status"], "ok");
        assert_eq!(body["service"], "tg2web-backend");
    }

    #[tokio::test]
    async fn protected_endpoints_reject_missing_sessions() {
        let (app, _dir) = test_app().await;

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/bots")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn bots_endpoint_starts_empty_after_admin_login() {
        let (app, _dir) = test_app().await;
        let token = admin_token(&app).await;

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/bots")
                    .header(AUTHORIZATION, bearer_header(&token))
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::OK);
        let body = json_response(response).await;
        assert_eq!(body, json!([]));
    }

    #[tokio::test]
    async fn qobuz_regions_endpoint_returns_store_locales_after_login() {
        let (app, _dir) = test_app().await;
        let token = admin_token(&app).await;

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/qobuz/store/regions")
                    .header(AUTHORIZATION, bearer_header(&token))
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::OK);
        let body = json_response(response).await;
        let regions = body.as_array().expect("regions");
        assert!(regions.iter().any(|region| region["code"] == "jp-ja"));
        assert!(regions.iter().any(|region| region["code"] == "us-en"));
    }

    #[tokio::test]
    async fn qobuz_album_search_validates_request_before_upstream_fetch() {
        let (app, _dir) = test_app().await;
        let token = admin_token(&app).await;

        for (uri, expected_code) in [
            (
                "/api/qobuz/store/search/albums?region=jp-ja",
                "missing_qobuz_query",
            ),
            (
                "/api/qobuz/store/search/albums?query=beatles&region=unknown",
                "invalid_qobuz_region",
            ),
            (
                "/api/qobuz/store/search/albums?query=beatles&region=jp-ja&page=0",
                "invalid_qobuz_page",
            ),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(uri)
                        .header(AUTHORIZATION, bearer_header(&token))
                        .body(Body::empty())
                        .expect("request"),
                )
                .await
                .expect("response");

            assert_eq!(response.status(), StatusCode::BAD_REQUEST);
            let body = json_response(response).await;
            assert_eq!(body["error"]["code"], expected_code);
        }
    }

    #[tokio::test]
    async fn admin_endpoints_reject_missing_sessions() {
        let (app, _dir) = test_app().await;

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/admin/telegram/status")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn credentials_endpoint_never_echoes_api_hash() {
        let (app, _dir) = test_app().await;
        let token = admin_token(&app).await;

        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/admin/telegram/credentials")
                    .header(AUTHORIZATION, bearer_header(&token))
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"apiId":"12345","apiHash":"super-secret-hash"}"#,
                    ))
                    .expect("request"),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body bytes");
        let body_text = String::from_utf8(bytes.to_vec()).expect("utf8");

        assert!(!body_text.contains("super-secret-hash"));

        let body: Value = serde_json::from_str(&body_text).expect("json response");
        assert_eq!(body["credentialsConfigured"], true);
        assert_eq!(body["authState"], "needs_phone");
        assert_eq!(body["nextStep"], "submit_phone");
    }

    #[tokio::test]
    async fn user_access_keys_cannot_call_admin_endpoints() {
        let (app, _dir) = test_app().await;
        let token = admin_token(&app).await;

        let create_key_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/admin/access-keys")
                    .header(AUTHORIZATION, bearer_header(&token))
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"name":"Front desk"}"#))
                    .expect("request"),
            )
            .await
            .expect("response");

        assert_eq!(create_key_response.status(), StatusCode::OK);
        let created_key = json_response(create_key_response).await;
        let access_key = created_key["key"].as_str().expect("created key");

        let user_login_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/auth/access-key/login")
                    .header("content-type", "application/json")
                    .body(Body::from(json!({ "accessKey": access_key }).to_string()))
                    .expect("request"),
            )
            .await
            .expect("response");

        assert_eq!(user_login_response.status(), StatusCode::OK);
        let user_login = json_response(user_login_response).await;
        let user_token = user_login["token"].as_str().expect("user token");

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/admin/telegram/status")
                    .header(AUTHORIZATION, bearer_header(user_token))
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn failed_sends_are_audited_with_access_key_attribution() {
        let (app, state, bot, _dir) = test_app_with_published_bot().await;
        let access_key = state
            .auth
            .create_access_key(&state.db, "Front desk")
            .await
            .expect("create access key")
            .key
            .expect("plain key");
        let user_session = state
            .auth
            .login_access_key(&state.db, &access_key)
            .await
            .expect("user session");

        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!("/api/bots/{}/messages", bot.id))
                    .header(AUTHORIZATION, bearer_header(&user_session.token))
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"clientRequestId":"req_http_send","text":"hello bot"}"#,
                    ))
                    .expect("request"),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);

        let row = sqlx::query(
            "SELECT access_key_name, status, error_code, text_sha256 \
             FROM outgoing_message_audit WHERE client_request_id = 'req_http_send'",
        )
        .fetch_one(&state.db)
        .await
        .expect("audit row");

        assert_eq!(
            row.try_get::<String, _>("access_key_name").expect("name"),
            "Front desk"
        );
        assert_eq!(
            row.try_get::<String, _>("status").expect("status"),
            "failed"
        );
        assert_eq!(
            row.try_get::<String, _>("error_code").expect("error"),
            "telegram_unavailable"
        );
        assert_eq!(
            row.try_get::<String, _>("text_sha256")
                .expect("text hash")
                .len(),
            64
        );

        let replayed = state.replay_events(Some(&bot.id), None);
        assert!(replayed
            .iter()
            .any(|event| matches!(event, AppEvent::MessageSendFailed { .. })));
    }

    #[tokio::test]
    async fn messages_endpoint_returns_persisted_final_history() {
        let (app, state, bot, _dir) = test_app_with_published_bot().await;
        let token = admin_token(&app).await;
        let created_at = "2026-05-21T09:00:00+00:00";

        sqlx::query(
            "INSERT INTO chat_messages \
             (id, telegram_message_id, bot_id, telegram_chat_id, direction, text, entities_json, status, created_at, is_ephemeral, updated_at) \
             VALUES ('msg_http_history', 'tg_msg_http_history', ?, ?, 'incoming', 'hello from history', '[]', 'received', ?, 0, ?)",
        )
        .bind(&bot.id)
        .bind(&bot.telegram_chat_id)
        .bind(created_at)
        .bind(created_at)
        .execute(&state.db)
        .await
        .expect("seed chat history");

        sqlx::query(
            "INSERT INTO chat_messages \
             (id, telegram_message_id, bot_id, telegram_chat_id, direction, text, entities_json, status, created_at, is_ephemeral, updated_at) \
             VALUES ('msg_http_draft', 'tg_msg_http_draft', ?, ?, 'incoming', 'draft only', '[]', 'pending', '2026-05-21T09:01:00+00:00', 1, '2026-05-21T09:01:00+00:00')",
        )
        .bind(&bot.id)
        .bind(&bot.telegram_chat_id)
        .execute(&state.db)
        .await
        .expect("seed draft snapshot");

        let response = app
            .oneshot(
                Request::builder()
                    .uri(format!("/api/bots/{}/messages", bot.id))
                    .header(AUTHORIZATION, bearer_header(&token))
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::OK);
        let body = json_response(response).await;
        let messages = body.as_array().expect("messages array");
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0]["id"], "msg_http_history");
        assert_eq!(messages[0]["text"], "hello from history");
    }

    #[tokio::test]
    async fn downloads_endpoint_records_failed_boundary_and_proxy_serves_cached_files() {
        let (app, state, _bot, _dir) = test_app_with_published_bot().await;
        let token = admin_token(&app).await;

        let trigger_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/downloads")
                    .header(AUTHORIZATION, bearer_header(&token))
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"fileId":"missing_http_file","fileName":"missing.bin","sizeBytes":3}"#,
                    ))
                    .expect("request"),
            )
            .await
            .expect("response");

        assert_eq!(trigger_response.status(), StatusCode::OK);
        let download = json_response(trigger_response).await;
        assert_eq!(download["status"], "failed");
        assert_eq!(download["proxyUrl"], Value::Null);

        tokio::fs::write(
            state.cached_file_path("cached_http_file"),
            b"cached via proxy",
        )
        .await
        .expect("cache file");
        let proxy_response = app
            .oneshot(
                Request::builder()
                    .uri("/api/files/cached_http_file/proxy")
                    .header(AUTHORIZATION, bearer_header(&token))
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");

        assert_eq!(proxy_response.status(), StatusCode::OK);
        assert_eq!(
            proxy_response
                .headers()
                .get(CONTENT_TYPE)
                .and_then(|value| value.to_str().ok()),
            Some("application/octet-stream")
        );
        let bytes = axum::body::to_bytes(proxy_response.into_body(), usize::MAX)
            .await
            .expect("proxy bytes");
        assert_eq!(&bytes[..], b"cached via proxy");
    }
}
