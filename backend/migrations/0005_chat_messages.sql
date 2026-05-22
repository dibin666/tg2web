CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    telegram_message_id TEXT,
    bot_id TEXT NOT NULL,
    telegram_chat_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    text TEXT,
    entities_json TEXT NOT NULL DEFAULT '[]',
    media_json TEXT,
    sent_by_internal_user_json TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    edited_at TEXT,
    reply_to_message_id TEXT,
    raw_available INTEGER,
    inline_keyboard_json TEXT,
    is_ephemeral INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_bot_telegram_message
    ON chat_messages(bot_id, telegram_message_id)
    WHERE telegram_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_bot_created
    ON chat_messages(bot_id, created_at DESC, id DESC)
    WHERE is_ephemeral = 0;

CREATE INDEX IF NOT EXISTS idx_chat_messages_telegram_chat
    ON chat_messages(telegram_chat_id, telegram_message_id);
