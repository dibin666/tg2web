use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("configuration error: {0}")]
    Config(String),
    #[error("unauthorized: {message}")]
    Unauthorized { code: &'static str, message: String },
    #[error("forbidden: {message}")]
    Forbidden { code: &'static str, message: String },
    #[error("bad request: {message}")]
    BadRequest { code: &'static str, message: String },
    #[error("not found: {message}")]
    NotFound { code: &'static str, message: String },
    #[error("conflict: {message}")]
    Conflict { code: &'static str, message: String },
    #[error("telegram integration unavailable: {message}")]
    TelegramUnavailable { code: &'static str, message: String },
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error(transparent)]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorEnvelope {
    error: ErrorBody,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody {
    code: &'static str,
    message: String,
}

impl AppError {
    pub fn config(message: impl Into<String>) -> Self {
        Self::Config(message.into())
    }

    pub fn bad_request(code: &'static str, message: impl Into<String>) -> Self {
        Self::BadRequest {
            code,
            message: message.into(),
        }
    }

    pub fn unauthorized(code: &'static str, message: impl Into<String>) -> Self {
        Self::Unauthorized {
            code,
            message: message.into(),
        }
    }

    pub fn forbidden(code: &'static str, message: impl Into<String>) -> Self {
        Self::Forbidden {
            code,
            message: message.into(),
        }
    }

    pub fn not_found(code: &'static str, message: impl Into<String>) -> Self {
        Self::NotFound {
            code,
            message: message.into(),
        }
    }

    pub fn conflict(code: &'static str, message: impl Into<String>) -> Self {
        Self::Conflict {
            code,
            message: message.into(),
        }
    }

    pub fn telegram_unavailable(message: impl Into<String>) -> Self {
        Self::TelegramUnavailable {
            code: "telegram_unavailable",
            message: message.into(),
        }
    }

    fn status_and_body(&self) -> (StatusCode, ErrorBody) {
        match self {
            AppError::Config(message) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorBody {
                    code: "config_error",
                    message: message.clone(),
                },
            ),
            AppError::Unauthorized { code, message } => (
                StatusCode::UNAUTHORIZED,
                ErrorBody {
                    code,
                    message: message.clone(),
                },
            ),
            AppError::Forbidden { code, message } => (
                StatusCode::FORBIDDEN,
                ErrorBody {
                    code,
                    message: message.clone(),
                },
            ),
            AppError::BadRequest { code, message } => (
                StatusCode::BAD_REQUEST,
                ErrorBody {
                    code,
                    message: message.clone(),
                },
            ),
            AppError::NotFound { code, message } => (
                StatusCode::NOT_FOUND,
                ErrorBody {
                    code,
                    message: message.clone(),
                },
            ),
            AppError::Conflict { code, message } => (
                StatusCode::CONFLICT,
                ErrorBody {
                    code,
                    message: message.clone(),
                },
            ),
            AppError::TelegramUnavailable { code, message } => (
                StatusCode::SERVICE_UNAVAILABLE,
                ErrorBody {
                    code,
                    message: message.clone(),
                },
            ),
            AppError::Sqlx(_) | AppError::Migration(_) | AppError::Json(_) | AppError::Io(_) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorBody {
                    code: "internal_error",
                    message: "internal backend error".to_string(),
                },
            ),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, body) = self.status_and_body();
        tracing::warn!(status = %status, error = %self, "request failed");
        (status, Json(ErrorEnvelope { error: body })).into_response()
    }
}
