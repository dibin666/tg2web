ALTER TABLE chat_messages ADD COLUMN visible_to_internal_user_id TEXT;

UPDATE chat_messages
SET visible_to_internal_user_id = json_extract(sent_by_internal_user_json, '$.id')
WHERE visible_to_internal_user_id IS NULL
  AND sent_by_internal_user_json IS NOT NULL
  AND json_valid(sent_by_internal_user_json);

CREATE INDEX IF NOT EXISTS idx_chat_messages_bot_visible_created
    ON chat_messages(bot_id, visible_to_internal_user_id, created_at DESC, id DESC)
    WHERE is_ephemeral = 0;
