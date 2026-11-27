-- 008_admission_applications.sql
-- Adds online admission application submissions and review tracking. Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS admission_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_number TEXT UNIQUE NOT NULL,
  applicant_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  gender TEXT CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say')),
  address TEXT NOT NULL,
  previous_qualification TEXT NOT NULL,
  previous_institution TEXT NOT NULL,
  percentage_or_gpa NUMERIC(5,2) NOT NULL CHECK (percentage_or_gpa >= 0 AND percentage_or_gpa <= 100),
  passing_year INT NOT NULL CHECK (passing_year BETWEEN 1990 AND 2035),
  statement_of_purpose TEXT,
  guardian_name TEXT,
  guardian_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'under_review', 'approved', 'rejected')),
  admin_remarks TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adm_app_status ON admission_applications(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adm_app_user ON admission_applications(applicant_user_id);
CREATE INDEX IF NOT EXISTS idx_adm_app_course ON admission_applications(course_id);

-- Ensure a sample applicant user exists (shares the standard dummy password Password@123)
INSERT INTO users (role_id, full_name, email, password_hash)
SELECT (SELECT id FROM roles WHERE role_name = 'applicant'),
       'Maya Chen',
       'applicant@uni.test',
       (SELECT password_hash FROM users WHERE email = 'admin@uni.test' LIMIT 1)
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'admin@uni.test')
  AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'applicant@uni.test');

-- Seed sample applications if table is empty
INSERT INTO admission_applications (
  application_number, applicant_user_id, course_id, full_name, email, phone,
  date_of_birth, gender, address, previous_qualification, previous_institution,
  percentage_or_gpa, passing_year, statement_of_purpose, guardian_name, guardian_phone, status
)
SELECT
  'APP-2026-100001',
  (SELECT id FROM users WHERE email = 'applicant@uni.test' LIMIT 1),
  (SELECT id FROM courses WHERE course_name = 'BCA' LIMIT 1),
  'Maya Chen',
  'applicant@uni.test',
  '+91-9876543210',
  DATE '2007-05-14',
  'Female',
  '42 Lakeview Avenue, Bhopal',
  '10+2 (Science with Mathematics)',
  'Springfield Senior Secondary School',
  88.50,
  2026,
  'Passionate about software engineering and database systems; eager to join the BCA program.',
  'David Chen',
  '+91-9876501234',
  'pending'
WHERE EXISTS (SELECT 1 FROM courses WHERE course_name = 'BCA')
  AND NOT EXISTS (SELECT 1 FROM admission_applications LIMIT 1);
