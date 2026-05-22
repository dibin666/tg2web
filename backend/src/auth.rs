use crate::{
    error::{AppError, AppResult},
    models::{now_rfc3339, AccessKey, AuthRole, AuthSession, AuthUser},
};
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand_core::{OsRng, RngCore};
use sqlx::{Row, SqlitePool};
use std::{collections::HashMap, env, sync::Arc};
use tokio::sync::RwLock;
use uuid::Uuid;

const SESSION_SECRET_BYTES: usize = 32;
const ACCESS_KEY_SECRET_BYTES: usize = 32;

#[derive(Clone)]
pub struct AuthService {
    sessions: Arc<RwLock<HashMap<String, AuthSession>>>,
}

impl AuthService {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn initialize_admin(&self, db: &SqlitePool) -> AppResult<()> {
        let existing: Option<(i64,)> =
            sqlx::query_as("SELECT id FROM admin_credentials WHERE id = 1")
                .fetch_optional(db)
                .await?;

        if existing.is_some() {
            return Ok(());
        }

        if let Some(hash) = env_string("TG2WEB_ADMIN_PASSWORD_HASH") {
            insert_admin_hash(db, &hash).await?;
            return Ok(());
        }

        if let Some(password) = env_string("TG2WEB_BOOTSTRAP_ADMIN_PASSWORD") {
            let hash = hash_secret(&password)?;
            insert_admin_hash(db, &hash).await?;
            return Ok(());
        }

        tracing::warn!(
            "admin login is disabled until TG2WEB_BOOTSTRAP_ADMIN_PASSWORD or TG2WEB_ADMIN_PASSWORD_HASH is configured"
        );
        Ok(())
    }

    pub async fn login_admin(&self, db: &SqlitePool, password: &str) -> AppResult<AuthSession> {
        let Some(row) = sqlx::query("SELECT password_hash FROM admin_credentials WHERE id = 1")
            .fetch_optional(db)
            .await?
        else {
            return Err(AppError::unauthorized(
                "admin_login_unconfigured",
                "admin login is not configured",
            ));
        };

        let password_hash: String = row.try_get("password_hash")?;
        verify_secret(password, &password_hash)?;

        Ok(self
            .issue_session(AuthUser {
                id: "admin".to_string(),
                display_name: "Admin".to_string(),
                role: AuthRole::Admin,
                access_key_id: None,
                access_key_name: None,
            })
            .await)
    }

    pub async fn create_access_key(&self, db: &SqlitePool, name: &str) -> AppResult<AccessKey> {
        let trimmed_name = name.trim();
        if trimmed_name.is_empty() {
            return Err(AppError::bad_request(
                "missing_access_key_name",
                "access key name is required",
            ));
        }

        let secret = format!("tg2web_user_{}", random_url_token(ACCESS_KEY_SECRET_BYTES));
        let key_hash = hash_secret(&secret)?;
        let key_prefix = secret.chars().take(18).collect::<String>();
        let id = format!("key_{}", Uuid::new_v4());
        let created_at = now_rfc3339();

        sqlx::query(
            "INSERT INTO access_keys (id, name, key_hash, key_prefix, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(trimmed_name)
        .bind(&key_hash)
        .bind(&key_prefix)
        .bind(&created_at)
        .execute(db)
        .await?;

        Ok(AccessKey {
            id,
            key: Some(secret),
            key_preview: key_preview(&key_prefix),
            name: trimmed_name.to_string(),
            created_at,
            last_login_at: None,
            revoked_at: None,
        })
    }

    pub async fn list_access_keys(&self, db: &SqlitePool) -> AppResult<Vec<AccessKey>> {
        let rows = sqlx::query(
            "SELECT id, name, key_prefix, created_at, last_login_at, revoked_at \
             FROM access_keys ORDER BY created_at DESC",
        )
        .fetch_all(db)
        .await?;

        rows.into_iter()
            .map(|row| {
                let key_prefix: String = row.try_get("key_prefix")?;
                Ok(AccessKey {
                    id: row.try_get("id")?,
                    key: None,
                    key_preview: key_preview(&key_prefix),
                    name: row.try_get("name")?,
                    created_at: row.try_get("created_at")?,
                    last_login_at: row.try_get("last_login_at")?,
                    revoked_at: row.try_get("revoked_at")?,
                })
            })
            .collect::<Result<Vec<_>, sqlx::Error>>()
            .map_err(AppError::from)
    }

    pub async fn revoke_access_key(&self, db: &SqlitePool, id: &str) -> AppResult<()> {
        let result = sqlx::query(
            "UPDATE access_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
        )
        .bind(now_rfc3339())
        .bind(id)
        .execute(db)
        .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::not_found(
                "access_key_not_found",
                "active access key was not found",
            ));
        }

        Ok(())
    }

    pub async fn login_access_key(&self, db: &SqlitePool, secret: &str) -> AppResult<AuthSession> {
        let rows = sqlx::query(
            "SELECT id, name, key_hash FROM access_keys WHERE revoked_at IS NULL ORDER BY created_at DESC",
        )
        .fetch_all(db)
        .await?;

        for row in rows {
            let hash: String = row.try_get("key_hash")?;
            if verify_secret(secret, &hash).is_ok() {
                let id: String = row.try_get("id")?;
                let name: String = row.try_get("name")?;
                sqlx::query("UPDATE access_keys SET last_login_at = ? WHERE id = ?")
                    .bind(now_rfc3339())
                    .bind(&id)
                    .execute(db)
                    .await?;

                return Ok(self
                    .issue_session(AuthUser {
                        id: format!("access_key:{id}"),
                        display_name: name.clone(),
                        role: AuthRole::User,
                        access_key_id: Some(id),
                        access_key_name: Some(name),
                    })
                    .await);
            }
        }

        Err(AppError::unauthorized(
            "invalid_access_key",
            "access key is invalid or revoked",
        ))
    }

    pub async fn resolve_session(&self, token: &str) -> AppResult<AuthSession> {
        self.sessions
            .read()
            .await
            .get(token)
            .cloned()
            .ok_or_else(|| AppError::unauthorized("invalid_session", "session token is invalid"))
    }

    async fn issue_session(&self, user: AuthUser) -> AuthSession {
        let session = AuthSession {
            token: random_url_token(SESSION_SECRET_BYTES),
            user,
            issued_at: now_rfc3339(),
        };
        self.sessions
            .write()
            .await
            .insert(session.token.clone(), session.clone());
        session
    }

    #[cfg(test)]
    pub async fn set_admin_password_for_test(
        &self,
        db: &SqlitePool,
        password: &str,
    ) -> AppResult<()> {
        let password_hash = hash_secret(password)?;
        sqlx::query(
            "INSERT INTO admin_credentials (id, password_hash, updated_at) VALUES (1, ?, ?) \
             ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at",
        )
        .bind(password_hash)
        .bind(now_rfc3339())
        .execute(db)
        .await?;
        Ok(())
    }
}

async fn insert_admin_hash(db: &SqlitePool, hash: &str) -> AppResult<()> {
    sqlx::query("INSERT INTO admin_credentials (id, password_hash, updated_at) VALUES (1, ?, ?)")
        .bind(hash)
        .bind(now_rfc3339())
        .execute(db)
        .await?;
    Ok(())
}

fn hash_secret(secret: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(secret.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| AppError::config(format!("failed to hash secret: {error}")))
}

fn verify_secret(secret: &str, hash: &str) -> AppResult<()> {
    let parsed_hash = PasswordHash::new(hash)
        .map_err(|_| AppError::unauthorized("invalid_credentials", "credentials are invalid"))?;

    Argon2::default()
        .verify_password(secret.as_bytes(), &parsed_hash)
        .map_err(|_| AppError::unauthorized("invalid_credentials", "credentials are invalid"))
}

fn random_url_token(bytes_len: usize) -> String {
    let mut bytes = vec![0_u8; bytes_len];
    let mut rng = OsRng;
    rng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn env_string(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn key_preview(prefix: &str) -> String {
    format!("{prefix}...")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn access_key_secret_is_only_returned_on_creation() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db = crate::storage::connect(&dir.path().join("auth.sqlite3"))
            .await
            .expect("db");
        let auth = AuthService::new();

        let created = auth
            .create_access_key(&db, "Ops")
            .await
            .expect("create key");
        assert!(created
            .key
            .as_deref()
            .is_some_and(|key| key.starts_with("tg2web_user_")));

        let listed = auth.list_access_keys(&db).await.expect("list keys");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "Ops");
        assert!(listed[0].key.is_none());
        assert!(listed[0].key_preview.starts_with("tg2web_user_"));
    }
}
