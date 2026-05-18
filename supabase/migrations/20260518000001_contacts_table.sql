-- Phase 2 — contacts table + RLS

CREATE TABLE IF NOT EXISTS contacts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_id                 UUID NOT NULL REFERENCES inboxes(id) ON DELETE CASCADE,
  chatwoot_conversation_id INT  NOT NULL,
  chatwoot_contact_id      INT,
  name                     TEXT,
  phone_number             TEXT,
  whatsapp_identifier      TEXT,
  current_labels           TEXT[] NOT NULL DEFAULT '{}',
  status                   TEXT NOT NULL DEFAULT 'ia' CHECK (status IN ('ia','humano','encerrado')),
  last_message             TEXT,
  last_message_at          TIMESTAMPTZ,
  message_count            INT NOT NULL DEFAULT 0,
  first_seen_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary                  TEXT,
  summary_generated_at     TIMESTAMPTZ,
  UNIQUE (inbox_id, chatwoot_conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_inbox_last_msg
  ON contacts (inbox_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts (status);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read contacts" ON contacts;
DROP POLICY IF EXISTS "authenticated write contacts" ON contacts;

CREATE POLICY "authenticated read contacts" ON contacts
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated write contacts" ON contacts
  FOR ALL USING (auth.role() = 'authenticated');
