use crate::{
    error::{AppError, AppResult},
    models::{new_id, TdlibRuntimeState, TelegramAuthState},
};
use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    ffi::{CStr, CString},
    os::raw::{c_char, c_double, c_int},
    path::PathBuf,
    sync::mpsc,
    thread,
    time::Duration,
};
use tokio::sync::broadcast;

unsafe extern "C" {
    fn td_create_client_id() -> c_int;
    fn td_send(client_id: c_int, request: *const c_char);
    fn td_receive(timeout: c_double) -> *const c_char;
}

pub struct TdJsonClient {
    id: c_int,
}

#[derive(Debug, Clone)]
pub struct TdlibParameters {
    pub api_id: i32,
    pub api_hash: String,
    pub database_directory: PathBuf,
    pub files_directory: PathBuf,
    pub database_encryption_key: String,
    pub application_version: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum TdJsonRuntimeEvent {
    AuthorizationState {
        auth_state: TelegramAuthState,
        tdlib_state: TdlibRuntimeState,
        raw: Value,
    },
    Update(Value),
    Response(Value),
    Error(String),
    Closed,
}

#[derive(Debug)]
enum TdJsonCommand {
    Send(Value),
    SetPhoneNumber(String),
    CheckCode(String),
    CheckPassword(String),
    RequestQrCode,
    LogOut,
    Shutdown,
}

#[derive(Debug, Default)]
struct PendingAuthCommand {
    phone_number: Option<String>,
    code: Option<String>,
    password: Option<String>,
    qr_code: bool,
}

pub struct TdJsonRuntime {
    commands: mpsc::Sender<TdJsonCommand>,
    worker: Option<thread::JoinHandle<()>>,
}

impl TdJsonClient {
    pub fn create() -> AppResult<Self> {
        ensure_tdlib_rs_linked();
        let id = unsafe { td_create_client_id() };
        if id <= 0 {
            return Err(AppError::telegram_unavailable(
                "TDLib tdjson returned an invalid client id",
            ));
        }

        Ok(Self { id })
    }

    #[allow(dead_code)]
    pub fn send(&self, request: Value) -> AppResult<()> {
        let request = request_cstring(with_extra(request));
        let request = request?;
        unsafe {
            td_send(self.id, request.as_ptr());
        }
        Ok(())
    }

    #[allow(dead_code)]
    pub fn receive(&self, timeout_seconds: f64) -> AppResult<Option<Value>> {
        let response = unsafe { td_receive(timeout_seconds) };
        parse_response(response)
    }
}

impl TdJsonRuntime {
    pub fn start(
        parameters: TdlibParameters,
        events: broadcast::Sender<TdJsonRuntimeEvent>,
    ) -> AppResult<Self> {
        ensure_tdlib_rs_linked();
        let (commands, receiver) = mpsc::channel();
        let worker = thread::Builder::new()
            .name("tg2web-tdjson".to_string())
            .spawn(move || run_tdjson_worker(parameters, receiver, events))
            .map_err(|error| {
                AppError::telegram_unavailable(format!(
                    "failed to start TDLib tdjson worker thread: {error}"
                ))
            })?;

        Ok(Self {
            commands,
            worker: Some(worker),
        })
    }

    pub fn send(&self, request: Value) -> AppResult<()> {
        self.send_command(TdJsonCommand::Send(request))
    }

    pub fn set_phone_number(&self, phone_number: String) -> AppResult<()> {
        self.send_command(TdJsonCommand::SetPhoneNumber(phone_number))
    }

    pub fn check_code(&self, code: String) -> AppResult<()> {
        self.send_command(TdJsonCommand::CheckCode(code))
    }

    pub fn check_password(&self, password: String) -> AppResult<()> {
        self.send_command(TdJsonCommand::CheckPassword(password))
    }

    pub fn request_qr_code(&self) -> AppResult<()> {
        self.send_command(TdJsonCommand::RequestQrCode)
    }

    pub fn log_out(&self) -> AppResult<()> {
        self.send_command(TdJsonCommand::LogOut)
    }

    fn send_command(&self, command: TdJsonCommand) -> AppResult<()> {
        self.commands.send(command).map_err(|_| {
            AppError::telegram_unavailable("TDLib tdjson runtime is not accepting requests")
        })
    }
}

impl Drop for TdJsonRuntime {
    fn drop(&mut self) {
        let _ = self.commands.send(TdJsonCommand::Shutdown);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn run_tdjson_worker(
    parameters: TdlibParameters,
    receiver: mpsc::Receiver<TdJsonCommand>,
    events: broadcast::Sender<TdJsonRuntimeEvent>,
) {
    let client = match TdJsonClient::create() {
        Ok(client) => client,
        Err(error) => {
            let _ = events.send(TdJsonRuntimeEvent::Error(error.to_string()));
            return;
        }
    };

    if let Err(error) = client.send(json!({ "@type": "getAuthorizationState" })) {
        let _ = events.send(TdJsonRuntimeEvent::Error(error.to_string()));
        return;
    }

    let mut pending_auth = PendingAuthCommand::default();
    let mut pending_requests = VecDeque::new();
    let mut current_auth_state: Option<Value> = None;
    let mut should_stop = false;

    while !should_stop {
        let mut auth_command_received = false;
        while let Ok(command) = receiver.try_recv() {
            match command {
                TdJsonCommand::Send(request) => {
                    if regular_request_can_send(current_auth_state.as_ref(), &request) {
                        if let Err(error) = client.send(request) {
                            let _ = events.send(TdJsonRuntimeEvent::Error(error.to_string()));
                        }
                    } else {
                        pending_requests.push_back(request);
                    }
                }
                TdJsonCommand::SetPhoneNumber(phone_number) => {
                    pending_auth.phone_number = Some(phone_number);
                    auth_command_received = true;
                }
                TdJsonCommand::CheckCode(code) => {
                    pending_auth.code = Some(code);
                    auth_command_received = true;
                }
                TdJsonCommand::CheckPassword(password) => {
                    pending_auth.password = Some(password);
                    auth_command_received = true;
                }
                TdJsonCommand::RequestQrCode => {
                    pending_auth.qr_code = true;
                    auth_command_received = true;
                }
                TdJsonCommand::LogOut => {
                    pending_auth = PendingAuthCommand::default();
                    if let Err(error) = client.send(json!({ "@type": "logOut" })) {
                        let _ = events.send(TdJsonRuntimeEvent::Error(error.to_string()));
                    }
                }
                TdJsonCommand::Shutdown => {
                    should_stop = true;
                }
            }
        }

        if auth_command_received {
            if let Some(raw_state) = current_auth_state.as_ref() {
                if let Err(error) =
                    handle_authorization_state(&client, &parameters, &mut pending_auth, raw_state)
                {
                    let _ = events.send(TdJsonRuntimeEvent::Error(error.to_string()));
                }
            }
        }

        if should_stop {
            break;
        }

        match client.receive(0.25) {
            Ok(Some(update)) => {
                if process_tdjson_value(
                    &client,
                    &parameters,
                    &events,
                    &mut pending_auth,
                    &mut current_auth_state,
                    update,
                ) {
                    should_stop = true;
                }
                flush_ready_requests(
                    &client,
                    &events,
                    &mut pending_requests,
                    current_auth_state.as_ref(),
                );
            }
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(error) => {
                let _ = events.send(TdJsonRuntimeEvent::Error(error.to_string()));
                thread::sleep(Duration::from_millis(250));
            }
        }
    }

    let _ = events.send(TdJsonRuntimeEvent::Closed);
}

fn regular_request_can_send(current_auth_state: Option<&Value>, request: &Value) -> bool {
    td_type(request) == Some("getAuthorizationState")
        || current_auth_state
            .and_then(td_type)
            .is_some_and(|state| state == "authorizationStateReady")
}

fn flush_ready_requests(
    client: &TdJsonClient,
    events: &broadcast::Sender<TdJsonRuntimeEvent>,
    pending_requests: &mut VecDeque<Value>,
    current_auth_state: Option<&Value>,
) {
    if current_auth_state
        .and_then(td_type)
        .is_none_or(|state| state != "authorizationStateReady")
    {
        return;
    }

    while let Some(request) = pending_requests.pop_front() {
        if let Err(error) = client.send(request) {
            let _ = events.send(TdJsonRuntimeEvent::Error(error.to_string()));
        }
    }
}

fn process_tdjson_value(
    client: &TdJsonClient,
    parameters: &TdlibParameters,
    events: &broadcast::Sender<TdJsonRuntimeEvent>,
    pending_auth: &mut PendingAuthCommand,
    current_auth_state: &mut Option<Value>,
    value: Value,
) -> bool {
    let value_type = td_type(&value).unwrap_or_default();
    match value_type {
        "updateAuthorizationState" => {
            let raw_state = value
                .get("authorization_state")
                .cloned()
                .unwrap_or_else(|| json!({ "@type": "authorizationStateClosed" }));
            let mapped = map_authorization_state(&raw_state);
            *current_auth_state = Some(raw_state.clone());

            if let Err(error) =
                handle_authorization_state(client, parameters, pending_auth, &raw_state)
            {
                let _ = events.send(TdJsonRuntimeEvent::Error(error.to_string()));
            }

            let _ = events.send(TdJsonRuntimeEvent::AuthorizationState {
                auth_state: mapped.0,
                tdlib_state: mapped.1.clone(),
                raw: raw_state,
            });
            mapped.1 == TdlibRuntimeState::Stopped
        }
        value_type if value_type.starts_with("authorizationState") => {
            let mapped = map_authorization_state(&value);
            *current_auth_state = Some(value.clone());
            let _ = events.send(TdJsonRuntimeEvent::AuthorizationState {
                auth_state: mapped.0,
                tdlib_state: mapped.1.clone(),
                raw: value,
            });
            mapped.1 == TdlibRuntimeState::Stopped
        }
        "error" => {
            if value
                .get("@extra")
                .and_then(Value::as_str)
                .is_some_and(|extra| {
                    extra.starts_with("bot_commands")
                        || extra.starts_with("download:")
                        || extra.starts_with("download_message:")
                })
            {
                let _ = events.send(TdJsonRuntimeEvent::Response(value));
                return false;
            }

            let message = value
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("TDLib request failed");
            let code = value
                .get("code")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            let _ = events.send(TdJsonRuntimeEvent::Error(format!(
                "TDLib error {code}: {message}"
            )));
            false
        }
        value_type if value_type.starts_with("update") => {
            let _ = events.send(TdJsonRuntimeEvent::Update(value));
            false
        }
        _ => {
            let _ = events.send(TdJsonRuntimeEvent::Response(value));
            false
        }
    }
}

fn handle_authorization_state(
    client: &TdJsonClient,
    parameters: &TdlibParameters,
    pending_auth: &mut PendingAuthCommand,
    raw_state: &Value,
) -> AppResult<()> {
    match td_type(raw_state).unwrap_or_default() {
        "authorizationStateWaitTdlibParameters" => client.send(set_tdlib_parameters(parameters)),
        "authorizationStateWaitEncryptionKey" => client.send(json!({
            "@type": "checkDatabaseEncryptionKey",
            "encryption_key": parameters.database_encryption_key,
        })),
        state if phone_or_qr_can_be_sent_in(state) => {
            if pending_auth.qr_code {
                pending_auth.qr_code = false;
                client.send(json!({
                    "@type": "requestQrCodeAuthentication",
                    "other_user_ids": [],
                }))?;
            }

            if let Some(phone_number) = pending_auth.phone_number.take() {
                client.send(json!({
                    "@type": "setAuthenticationPhoneNumber",
                    "phone_number": phone_number,
                    "settings": {
                        "@type": "phoneNumberAuthenticationSettings",
                        "allow_flash_call": false,
                        "allow_missed_call": false,
                        "is_current_phone_number": false,
                        "allow_sms_retriever_api": false,
                        "authentication_tokens": [],
                    },
                }))?;
            }

            Ok(())
        }
        "authorizationStateWaitCode" => {
            if let Some(code) = pending_auth.code.take() {
                client.send(json!({
                    "@type": "checkAuthenticationCode",
                    "code": code,
                }))?;
            }
            Ok(())
        }
        "authorizationStateWaitPassword" => {
            if let Some(password) = pending_auth.password.take() {
                client.send(json!({
                    "@type": "checkAuthenticationPassword",
                    "password": password,
                }))?;
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

fn phone_or_qr_can_be_sent_in(state_type: &str) -> bool {
    matches!(
        state_type,
        "authorizationStateWaitPhoneNumber"
            | "authorizationStateWaitPremiumPurchase"
            | "authorizationStateWaitEmailAddress"
            | "authorizationStateWaitEmailCode"
            | "authorizationStateWaitCode"
            | "authorizationStateWaitRegistration"
            | "authorizationStateWaitPassword"
    )
}

fn set_tdlib_parameters(parameters: &TdlibParameters) -> Value {
    json!({
        "@type": "setTdlibParameters",
        "use_test_dc": false,
        "database_directory": parameters.database_directory.to_string_lossy(),
        "files_directory": parameters.files_directory.to_string_lossy(),
        "database_encryption_key": parameters.database_encryption_key,
        "use_file_database": true,
        "use_chat_info_database": true,
        "use_message_database": true,
        "use_secret_chats": false,
        "api_id": parameters.api_id,
        "api_hash": parameters.api_hash,
        "system_language_code": "en",
        "device_model": "tg2web-server",
        "system_version": std::env::consts::OS,
        "application_version": parameters.application_version,
    })
}

fn map_authorization_state(raw_state: &Value) -> (TelegramAuthState, TdlibRuntimeState) {
    match td_type(raw_state).unwrap_or_default() {
        "authorizationStateWaitTdlibParameters" => (
            TelegramAuthState::TdlibStarting,
            TdlibRuntimeState::Starting,
        ),
        "authorizationStateWaitEncryptionKey" => (
            TelegramAuthState::TdlibStarting,
            TdlibRuntimeState::Starting,
        ),
        "authorizationStateWaitPhoneNumber" => {
            (TelegramAuthState::NeedsPhone, TdlibRuntimeState::Running)
        }
        "authorizationStateWaitCode" | "authorizationStateWaitEmailCode" => {
            (TelegramAuthState::NeedsCode, TdlibRuntimeState::Running)
        }
        "authorizationStateWaitPassword" => {
            (TelegramAuthState::NeedsPassword, TdlibRuntimeState::Running)
        }
        "authorizationStateWaitOtherDeviceConfirmation" => {
            (TelegramAuthState::NeedsQrScan, TdlibRuntimeState::Running)
        }
        "authorizationStateReady" => (TelegramAuthState::Ready, TdlibRuntimeState::Running),
        "authorizationStateLoggingOut" | "authorizationStateClosing" => (
            TelegramAuthState::Reconnecting,
            TdlibRuntimeState::Reconnecting,
        ),
        "authorizationStateClosed" => (TelegramAuthState::LoggedOut, TdlibRuntimeState::Stopped),
        _ => (TelegramAuthState::Error, TdlibRuntimeState::Error),
    }
}

fn td_type(value: &Value) -> Option<&str> {
    value.get("@type").and_then(Value::as_str)
}

fn ensure_tdlib_rs_linked() {
    let _ = tdlib_rs::create_client as fn() -> i32;
}

fn request_cstring(request: Value) -> AppResult<CString> {
    CString::new(request.to_string()).map_err(|_| {
        AppError::telegram_unavailable("TDLib tdjson request contained an interior NUL byte")
    })
}

fn parse_response(response: *const c_char) -> AppResult<Option<Value>> {
    if response.is_null() {
        return Ok(None);
    }

    let text = unsafe { CStr::from_ptr(response) }
        .to_str()
        .map_err(|error| {
            AppError::telegram_unavailable(format!("TDLib tdjson returned invalid UTF-8: {error}"))
        })?;

    Ok(Some(serde_json::from_str(text)?))
}

fn with_extra(mut request: Value) -> Value {
    if let Some(object) = request.as_object_mut() {
        object
            .entry("@extra".to_string())
            .or_insert_with(|| Value::String(new_id("tdreq")));
    }
    request
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn with_extra_preserves_existing_request_extra() {
        let value = with_extra(json!({
            "@type": "getAuthorizationState",
            "@extra": "caller_owned"
        }));

        assert_eq!(value["@extra"], "caller_owned");
    }

    #[test]
    fn with_extra_adds_correlation_id_to_objects() {
        let value = with_extra(json!({ "@type": "getAuthorizationState" }));

        assert!(value["@extra"]
            .as_str()
            .is_some_and(|extra| extra.starts_with("tdreq_")));
    }

    #[test]
    fn maps_core_authorization_states() {
        assert_eq!(
            map_authorization_state(&json!({ "@type": "authorizationStateWaitPhoneNumber" })),
            (TelegramAuthState::NeedsPhone, TdlibRuntimeState::Running)
        );
        assert_eq!(
            map_authorization_state(&json!({ "@type": "authorizationStateWaitCode" })),
            (TelegramAuthState::NeedsCode, TdlibRuntimeState::Running)
        );
        assert_eq!(
            map_authorization_state(&json!({ "@type": "authorizationStateReady" })),
            (TelegramAuthState::Ready, TdlibRuntimeState::Running)
        );
    }

    #[test]
    fn set_tdlib_parameters_uses_server_directories_and_safe_defaults() {
        let params = TdlibParameters {
            api_id: 12345,
            api_hash: "hash".to_string(),
            database_directory: PathBuf::from("/tmp/tdlib-db"),
            files_directory: PathBuf::from("/tmp/tdlib-files"),
            database_encryption_key: "enc".to_string(),
            application_version: "0.1.0".to_string(),
        };

        let value = set_tdlib_parameters(&params);

        assert_eq!(value["@type"], "setTdlibParameters");
        assert_eq!(value["api_id"], 12345);
        assert_eq!(value["api_hash"], "hash");
        assert_eq!(value["database_directory"], "/tmp/tdlib-db");
        assert_eq!(value["files_directory"], "/tmp/tdlib-files");
        assert_eq!(value["use_message_database"], true);
        assert_eq!(value["use_secret_chats"], false);
    }
}
