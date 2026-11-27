-- 007_sync_current_week_attendance.sql
-- Ensures subjects marked as submitted for the 2026-11-23 week have real attendance rows
-- on their scheduled dates in that week (by shifting their 2 latest seeded rows from 2026-11-18/19),
-- so "View Sheet" displays actual P/A badges instead of "Pending". Safe to run repeatedly.

WITH target_subjects AS (
  SELECT was.subject_id,
         was.week_start,
         (
           SELECT array_agg((was.week_start + (d.dow - 1))::date ORDER BY d.dow)
           FROM (
             SELECT DISTINCT t.day_of_week AS dow
             FROM timetables t
             WHERE t.subject_id = was.subject_id
             ORDER BY t.day_of_week
             LIMIT 2
           ) d
         ) AS target_dates
  FROM weekly_attendance_submissions was
  WHERE NOT EXISTS (
    SELECT 1
    FROM attendance a
    WHERE a.subject_id = was.subject_id
      AND a.class_date BETWEEN was.week_start AND (was.week_start + 6)
  )
),
latest_two_dates AS (
  SELECT ts.subject_id,
         ts.target_dates,
         (
           SELECT array_agg(a.class_date ORDER BY a.class_date)
           FROM (
             SELECT DISTINCT class_date
             FROM attendance
             WHERE subject_id = ts.subject_id
               AND class_date < ts.week_start
             ORDER BY class_date DESC
             LIMIT 2
           ) a
         ) AS old_dates
  FROM target_subjects ts
  WHERE array_length(ts.target_dates, 1) = 2
)
UPDATE attendance a
SET class_date = CASE
  WHEN a.class_date = ltd.old_dates[1] THEN ltd.target_dates[1]
  WHEN a.class_date = ltd.old_dates[2] THEN ltd.target_dates[2]
  ELSE a.class_date
END
FROM latest_two_dates ltd
WHERE a.subject_id = ltd.subject_id
  AND array_length(ltd.old_dates, 1) = 2
  AND a.class_date IN (ltd.old_dates[1], ltd.old_dates[2]);
