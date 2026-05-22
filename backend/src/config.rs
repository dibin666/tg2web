use crate::error::{AppError, AppResult};
use std::{env, net::SocketAddr, path::PathBuf};

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub bind_addr: SocketAddr,
    pub database_path: PathBuf,
    pub media_cache_path: PathBuf,
    pub tdlib_database_path: PathBuf,
    pub tdlib_encryption_key_ref: Option<String>,
    pub admin_password_configured: bool,
    pub cors_origin: CorsOrigin,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CorsOrigin {
    Any,
    Exact(String),
}

impl AppConfig {
    pub fn from_env() -> AppResult<Self> {
        let bind_addr = env::var("TG2WEB_BIND_ADDR")
            .unwrap_or_else(|_| "127.0.0.1:8787".to_string())
            .parse::<SocketAddr>()
            .map_err(|error| {
                AppError::config(format!("invalid TG2WEB_BIND_ADDR value: {error}"))
            })?;

        Ok(Self {
            bind_addr,
            database_path: path_var("TG2WEB_DATABASE_PATH", "data/tg2web.sqlite3"),
            media_cache_path: path_var("TG2WEB_MEDIA_CACHE_PATH", "data/media-cache"),
            tdlib_database_path: path_var("TG2WEB_TDLIB_DATABASE_PATH", "data/tdlib"),
            tdlib_encryption_key_ref: optional_string_var("TG2WEB_TDLIB_ENCRYPTION_KEY_REF"),
            admin_password_configured: optional_string_var("TG2WEB_BOOTSTRAP_ADMIN_PASSWORD")
                .is_some()
                || optional_string_var("TG2WEB_ADMIN_PASSWORD_HASH").is_some(),
            cors_origin: cors_origin_from_env(),
        })
    }

    #[cfg(test)]
    pub fn for_test(root: &std::path::Path) -> Self {
        Self {
            bind_addr: "127.0.0.1:0".parse().expect("test bind addr"),
            database_path: root.join("tg2web-test.sqlite3"),
            media_cache_path: root.join("media-cache"),
            tdlib_database_path: root.join("tdlib"),
            tdlib_encryption_key_ref: None,
            admin_password_configured: true,
            cors_origin: CorsOrigin::Any,
        }
    }
}

fn path_var(name: &str, default_value: &str) -> PathBuf {
    env::var(name)
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(default_value))
}

fn optional_string_var(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn cors_origin_from_env() -> CorsOrigin {
    match optional_string_var("TG2WEB_CORS_ORIGIN") {
        Some(value) if value != "*" => CorsOrigin::Exact(value),
        _ => CorsOrigin::Any,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_uses_isolated_paths() {
        let root = tempfile::tempdir().expect("tempdir");
        let config = AppConfig::for_test(root.path());

        assert!(config.database_path.starts_with(root.path()));
        assert!(config.media_cache_path.starts_with(root.path()));
        assert_eq!(config.cors_origin, CorsOrigin::Any);
    }
}
