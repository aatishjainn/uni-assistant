-- 009_admission_seen_at.sql
-- Tracks when an applicant has viewed an approved/rejected admission decision. Safe to run repeatedly.

ALTER TABLE admission_applications
  ADD COLUMN IF NOT EXISTS applicant_seen_at TIMESTAMPTZ;
