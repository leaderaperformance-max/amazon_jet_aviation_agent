-- Email module: store connected Gmail accounts + per-message AI summaries.

CREATE TABLE IF NOT EXISTS email_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_id UUID REFERENCES inboxes(id) ON DELETE SET NULL,
  email_address TEXT NOT NULL UNIQUE,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  expires_at TIMESTAMPTZ,
  history_id TEXT,
  last_polled_at TIMESTAMPTZ,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL UNIQUE,
  gmail_thread_id TEXT,
  from_address TEXT,
  from_name TEXT,
  subject TEXT,
  category TEXT,
  summary TEXT,
  attachment_count INT NOT NULL DEFAULT 0,
  detected_pns TEXT[],
  received_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_summaries_account
  ON email_summaries (email_account_id, received_at DESC);

ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read email_accounts" ON email_accounts
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth all email_accounts" ON email_accounts
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth read email_summaries" ON email_summaries
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth all email_summaries" ON email_summaries
  FOR ALL USING (auth.role() = 'authenticated');
