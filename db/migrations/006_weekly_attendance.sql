-- 006_weekly_attendance.sql
-- Tracks weekly attendance sheet submissions per subject and week. Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS weekly_attendance_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  faculty_id UUID NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_by UUID REFERENCES users(id),
  days_recorded INT NOT NULL DEFAULT 0,
  records_count INT NOT NULL DEFAULT 0,
  UNIQUE (subject_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_att_week ON weekly_attendance_submissions(week_start);
CREATE INDEX IF NOT EXISTS idx_weekly_att_faculty ON weekly_attendance_submissions(faculty_id, week_start);

-- Mark current week as submitted for all assigned subjects EXCEPT Prof. Rahul Verma's BCA402,
-- so HOD Pending Actions immediately flags Prof. Rahul Verma as missing attendance for one class.
INSERT INTO weekly_attendance_submissions (subject_id, faculty_id, week_start, days_recorded, records_count)
SELECT fs.subject_id,
       fs.faculty_id,
       date_trunc('week', CURRENT_DATE)::date AS week_start,
       2,
       (SELECT COUNT(DISTINCT en.student_id)::int FROM student_enrollments en WHERE en.subject_id = fs.subject_id) * 2
  FROM faculty_subjects fs
  JOIN subjects s ON s.id = fs.subject_id
 WHERE s.subject_code <> 'BCA402'
ON CONFLICT (subject_id, week_start) DO NOTHING;
