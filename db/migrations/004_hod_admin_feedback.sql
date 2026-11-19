-- 004_hod_admin_feedback.sql
-- HOD department notices, FAQs table, feedback constraints and initial FAQs. Safe to run repeatedly.

-- 1. Department notices
ALTER TABLE notices ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_notices_dept ON notices (department_id);

-- 2. FAQs table
CREATE TABLE IF NOT EXISTS faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_faqs_category ON faqs (category);
CREATE INDEX IF NOT EXISTS idx_faqs_published ON faqs (is_published);

-- 3. Feedback constraints & created_at
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_user_message_unique') THEN
    ALTER TABLE feedback ADD CONSTRAINT feedback_user_message_unique UNIQUE (user_id, message_id);
  END IF;
END $$;

-- 4. Initial sample FAQs (only if faqs table is empty)
INSERT INTO faqs (question, answer, category, is_published)
SELECT q, a, c, true FROM (VALUES
  ('How do I check my attendance percentage?', 'Students can view their real-time attendance percentage overall and per subject by asking the Smart Assistant "What is my attendance?". A minimum of 75% attendance is required to appear for semester end examinations.', 'Academics'),
  ('How do I get walking directions or find a classroom?', 'Navigate to the Campus Map & Wayfinding page or ask the Assistant "Where is Room 201?" or "How do I reach Computer Lab 1 from the main gate?". Step-free wheelchair routes are also available.', 'Campus Navigation'),
  ('What is the procedure for new student admissions?', 'Prospective applicants can register on the portal to check course eligibility, application deadlines, fee structures, and required documents. Applications are reviewed online by the admissions office.', 'Admissions'),
  ('How are internal and mid-semester marks calculated?', 'Marks obtained in mid-semester exams and continuous internal assessments are recorded in the institutional database. Students can check their results by asking "Show my marks".', 'Examinations'),
  ('Who should I contact for academic grievances or department queries?', 'Students can reach out directly to their respective Head of Department (HOD) or faculty mentor during office hours or submit an inquiry through the administration desk.', 'General')
) AS v(q, a, c)
WHERE NOT EXISTS (SELECT 1 FROM faqs LIMIT 1);
