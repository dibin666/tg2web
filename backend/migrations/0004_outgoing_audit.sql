CREATE TABLE IF NOT EXISTS outgoing_message_audit (
    id TEXT PRIMARY KEY,
    bot_id TEXT NOT NULL,
    telegram_chat_id TEXT NOT NULL,
    client_request_id TEXT NOT NULL,
    auth_user_id TEXT NOT NULL,
    access_key_id TEXT,
    access_key_name TEXT,
    text_sha256 TEXT NOT NULL,
    attachment_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    error_code TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outgoing_message_audit_bot_id ON outgoing_message_audit(bot_id);
CREATE INDEX IF NOT EXISTS idx_outgoing_message_audit_client_request_id ON outgoing_message_audit(client_request_id);
