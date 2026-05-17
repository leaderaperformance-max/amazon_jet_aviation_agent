-- Admin Panel Phase 1 — Migration
-- Run this in Supabase Dashboard → SQL Editor

-- 1) Configuração global (1 linha só)
CREATE TABLE IF NOT EXISTS app_settings (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  openai_api_key  TEXT,
  openai_model    TEXT DEFAULT 'gpt-4o-mini',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 2) Inboxes
CREATE TABLE IF NOT EXISTS inboxes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  chatwoot_base_url     TEXT NOT NULL,
  chatwoot_account_id   INT  NOT NULL,
  chatwoot_inbox_id     INT  NOT NULL,
  chatwoot_user_token   TEXT NOT NULL,
  system_prompt         TEXT NOT NULL,
  enabled               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (chatwoot_account_id, chatwoot_inbox_id)
);

CREATE INDEX IF NOT EXISTS idx_inboxes_chatwoot_inbox
  ON inboxes (chatwoot_inbox_id, enabled);

-- 3) RLS — só autenticados leem/escrevem
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE inboxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read app_settings" ON app_settings;
DROP POLICY IF EXISTS "authenticated write app_settings" ON app_settings;
DROP POLICY IF EXISTS "authenticated read inboxes" ON inboxes;
DROP POLICY IF EXISTS "authenticated write inboxes" ON inboxes;

CREATE POLICY "authenticated read app_settings" ON app_settings
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated write app_settings" ON app_settings
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated read inboxes" ON inboxes
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated write inboxes" ON inboxes
  FOR ALL USING (auth.role() = 'authenticated');
