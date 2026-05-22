use crate::{
    config::AppConfig,
    error::{AppError, AppResult},
};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::sync::broadcast;

mod tdjson;

pub use tdjson::TdJsonRuntimeEvent;

#[derive(Debug, Clone)]
pub struct TelegramCredentials {
    pub api_id: i32,
    pub api_hash: String,
}

#[derive(Clone)]
pub struct TelegramBridge {
    tdlib_database_path: PathBuf,
    media_cache_path: PathBuf,
    tdlib_encryption_key_ref: Option<String>,
    runtime: Arc<Mutex<Option<tdjson::TdJsonRuntime>>>,
    updates: broadcast::Sender<TdJsonRuntimeEvent>,
}

impl TelegramBridge {
    pub fn new(config: &AppConfig) -> Self {
        let (updates, _) = broadcast::channel(512);
        Self {
            tdlib_database_path: config.tdlib_database_path.clone(),
            media_cache_path: config.media_cache_path.clone(),
            tdlib_encryption_key_ref: config.tdlib_encryption_key_ref.clone(),
            runtime: Arc::new(Mutex::new(None)),
            updates,
        }
    }

    pub fn subscribe_updates(&self) -> broadcast::Receiver<TdJsonRuntimeEvent> {
        self.updates.subscribe()
    }

    pub fn is_runtime_started(&self) -> bool {
        self.runtime
            .lock()
            .map(|runtime| runtime.is_some())
            .unwrap_or(false)
    }

    pub fn start_phone_login(
        &self,
        credentials: TelegramCredentials,
        phone_number: String,
    ) -> AppResult<()> {
        self.with_runtime(credentials, |runtime| {
            runtime.set_phone_number(phone_number)
        })
    }

    pub fn submit_login_code(
        &self,
        credentials: TelegramCredentials,
        code: String,
    ) -> AppResult<()> {
        self.with_runtime(credentials, |runtime| runtime.check_code(code))
    }

    pub fn submit_password(
        &self,
        credentials: TelegramCredentials,
        password: String,
    ) -> AppResult<()> {
        self.with_runtime(credentials, |runtime| runtime.check_password(password))
    }

    pub fn start_qr_login(&self, credentials: TelegramCredentials) -> AppResult<()> {
        self.with_runtime(credentials, |runtime| runtime.request_qr_code())
    }

    pub fn reconnect(&self, credentials: TelegramCredentials) -> AppResult<()> {
        self.with_runtime(credentials, |runtime| {
            runtime.send(serde_json::json!({ "@type": "getAuthorizationState" }))
        })
    }

    pub fn send_request(
        &self,
        credentials: TelegramCredentials,
        request: serde_json::Value,
    ) -> AppResult<()> {
        self.with_runtime(credentials, |runtime| runtime.send(request))
    }

    pub fn logout(&self) -> AppResult<()> {
        let guard = self.runtime.lock().map_err(|_| {
            AppError::telegram_unavailable("TDLib tdjson runtime lock was poisoned")
        })?;
        if let Some(runtime) = guard.as_ref() {
            runtime.log_out()?;
        }
        Ok(())
    }

    pub fn reset_runtime(&self) -> AppResult<()> {
        let mut guard = self.runtime.lock().map_err(|_| {
            AppError::telegram_unavailable("TDLib tdjson runtime lock was poisoned")
        })?;
        *guard = None;
        Ok(())
    }

    fn with_runtime<F>(&self, credentials: TelegramCredentials, action: F) -> AppResult<()>
    where
        F: FnOnce(&tdjson::TdJsonRuntime) -> AppResult<()>,
    {
        let mut guard = self.runtime.lock().map_err(|_| {
            AppError::telegram_unavailable("TDLib tdjson runtime lock was poisoned")
        })?;

        if guard.is_none() {
            let parameters = self.tdlib_parameters(credentials)?;
            *guard = Some(tdjson::TdJsonRuntime::start(
                parameters,
                self.updates.clone(),
            )?);
        }

        let runtime = guard
            .as_ref()
            .ok_or_else(|| AppError::telegram_unavailable("TDLib tdjson runtime did not start"))?;
        action(runtime)
    }

    fn tdlib_parameters(
        &self,
        credentials: TelegramCredentials,
    ) -> AppResult<tdjson::TdlibParameters> {
        let database_directory = self.tdlib_database_path.join("main");
        let files_directory = self.media_cache_path.join("tdlib-files");
        std::fs::create_dir_all(&database_directory)?;
        std::fs::create_dir_all(&files_directory)?;

        Ok(tdjson::TdlibParameters {
            api_id: credentials.api_id,
            api_hash: credentials.api_hash,
            database_directory,
            files_directory,
            database_encryption_key: self.database_encryption_key()?,
            application_version: env!("CARGO_PKG_VERSION").to_string(),
        })
    }

    fn database_encryption_key(&self) -> AppResult<String> {
        let Some(secret_ref) = &self.tdlib_encryption_key_ref else {
            return Ok(String::new());
        };

        std::env::var(secret_ref).map_err(|_| {
            AppError::telegram_unavailable(format!(
                "TG2WEB_TDLIB_ENCRYPTION_KEY_REF points to {secret_ref}, but that environment variable is not set"
            ))
        })
    }
}
