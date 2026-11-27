-- 005_exam_grading_assignments.sql
-- Adds HOD-to-faculty exam grading task assignment and mark entry audit tracking. Safe to run repeatedly.

ALTER TABLE examinations
  ADD COLUMN IF NOT EXISTS grading_faculty_id UUID REFERENCES faculty(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grading_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grading_assigned_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_examinations_grading_faculty ON examinations(grading_faculty_id);

ALTER TABLE student_marks
  ADD COLUMN IF NOT EXISTS graded_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
