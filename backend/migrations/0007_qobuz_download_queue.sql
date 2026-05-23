CREATE TABLE IF NOT EXISTS qobuz_download_queue (
    id TEXT PRIMARY KEY,
    album_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    cover_url TEXT,
    album_url TEXT NOT NULL,
    status TEXT NOT NULL,
    target_bot_id TEXT,
    client_request_id TEXT,
    logs_json TEXT NOT NULL DEFAULT '[]',
    enqueued_by_user_id TEXT NOT NULL,
    enqueued_by_display_name TEXT NOT NULL,
    enqueued_by_role TEXT NOT NULL,
    enqueued_by_access_key_id TEXT,
    enqueued_by_access_key_name TEXT,
    added_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_qobuz_download_queue_status_added
    ON qobuz_download_queue(status, added_at, id);

CREATE INDEX IF NOT EXISTS idx_qobuz_download_queue_client_request
    ON qobuz_download_queue(client_request_id)
    WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qobuz_download_queue_target_bot
    ON qobuz_download_queue(target_bot_id)
    WHERE target_bot_id IS NOT NULL;
