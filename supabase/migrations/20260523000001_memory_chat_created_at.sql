-- Add created_at to memory_chat_amazon_jet so analytics can filter by time.
-- Backfills existing rows by id ordering: assumes sequential inserts and
-- spaces them ~1 second apart starting from MIN(now() - 7 days).
ALTER TABLE memory_chat_amazon_jet
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_memory_chat_created_at
  ON memory_chat_amazon_jet (created_at);

CREATE INDEX IF NOT EXISTS idx_memory_chat_session_created
  ON memory_chat_amazon_jet (session_id, created_at);
