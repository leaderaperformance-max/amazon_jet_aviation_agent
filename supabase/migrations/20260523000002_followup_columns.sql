-- Follow-up automation tracking
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS followup_count INT NOT NULL DEFAULT 0;

-- Partial index for the cron query: only ia-status contacts need to be scanned
CREATE INDEX IF NOT EXISTS idx_contacts_followup_candidates
  ON contacts (status, last_message_at)
  WHERE status = 'ia';
