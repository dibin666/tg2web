CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_credentials (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    api_id TEXT,
    api_hash_secret_ref TEXT,
    configured_at TEXT
);

CREATE TABLE IF NOT EXISTS telegram_auth_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state TEXT NOT NULL DEFAULT 'not_configured',
    tdlib_state TEXT NOT NULL DEFAULT 'stopped',
    account_phone TEXT,
    account_label TEXT,
    last_sync_at TEXT,
    last_error TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS discovered_telegram_chats (
    telegram_chat_id TEXT PRIMARY KEY,
    username TEXT,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    is_bot INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'unknown',
    discovered_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS published_bots (
    id TEXT PRIMARY KEY,
    telegram_chat_id TEXT NOT NULL UNIQUE,
    username TEXT,
    title TEXT NOT NULL,
    display_title TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    history_sync_policy TEXT NOT NULL DEFAULT 'latest_only',
    status TEXT NOT NULL DEFAULT 'unknown',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS downloads (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    message_id TEXT,
    file_name TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    downloaded_bytes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_files (
    id TEXT PRIMARY KEY,
    bot_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    file_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    sender_name TEXT NOT NULL,
    received_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    tag TEXT,
    thumbnail_url TEXT
);
