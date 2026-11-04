CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name TEXT UNIQUE NOT NULL
    CHECK (role_name IN ('student','teacher','hod','admin','applicant','visitor'))
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_name TEXT UNIQUE NOT NULL,
  hod_user_id UUID REFERENCES users(id)
);

CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id),
  course_name TEXT NOT NULL,
  duration_years INT NOT NULL CHECK (duration_years > 0)
);

CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id),
  subject_code TEXT UNIQUE NOT NULL,
  subject_name TEXT NOT NULL,
  semester INT NOT NULL CHECK (semester > 0)
);

CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id),
  student_number TEXT UNIQUE NOT NULL,
  department_id UUID NOT NULL REFERENCES departments(id),
  course_id UUID NOT NULL REFERENCES courses(id),
  semester INT NOT NULL
);

CREATE TABLE faculty (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id),
  employee_number TEXT UNIQUE NOT NULL,
  department_id UUID NOT NULL REFERENCES departments(id)
);

CREATE TABLE buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL
);

CREATE TABLE classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES buildings(id),
  room_number TEXT NOT NULL,
  floor_number INT NOT NULL,
  room_type TEXT NOT NULL DEFAULT 'classroom',
  UNIQUE (building_id, room_number)
);

CREATE TABLE student_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  academic_year TEXT NOT NULL,
  UNIQUE (student_id, subject_id, academic_year)
);

CREATE TABLE faculty_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id UUID NOT NULL REFERENCES faculty(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  academic_year TEXT NOT NULL,
  UNIQUE (faculty_id, subject_id, academic_year)
);

CREATE TABLE timetables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  faculty_id UUID NOT NULL REFERENCES faculty(id),
  classroom_id UUID NOT NULL REFERENCES classrooms(id),
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CHECK (end_time > start_time)
);

CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  class_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','absent','leave')),
  UNIQUE (student_id, subject_id, class_date)
);

CREATE TABLE examinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  exam_type TEXT NOT NULL,
  exam_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  classroom_id UUID REFERENCES classrooms(id),
  CHECK (end_time > start_time)
);

CREATE TABLE student_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id UUID NOT NULL REFERENCES examinations(id),
  student_id UUID NOT NULL REFERENCES students(id),
  marks_obtained NUMERIC(6,2) NOT NULL,
  UNIQUE (examination_id, student_id)
);

CREATE TABLE admissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id),
  eligibility TEXT,
  application_deadline DATE,          -- NULL = not available (never invent)
  fee_amount NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','closed'))
);

CREATE TABLE notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  published_at TIMESTAMPTZ,
  is_published BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE navigation_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES buildings(id),
  node_name TEXT NOT NULL,
  node_type TEXT NOT NULL,
  floor_number INT NOT NULL,
  x_coordinate DOUBLE PRECISION,
  y_coordinate DOUBLE PRECISION
);

CREATE TABLE navigation_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_id UUID NOT NULL REFERENCES navigation_nodes(id),
  destination_node_id UUID NOT NULL REFERENCES navigation_nodes(id),
  distance_meters NUMERIC(8,2) NOT NULL,
  is_accessible BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (source_node_id <> destination_node_id)
);

CREATE TABLE knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  document_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','indexing','indexed','failed','archived')),
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dimension 768 is a placeholder; match it to the embedding model you pick.
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(768),
  page_number INT,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  session_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user','assistant')),
  message TEXT NOT NULL,
  source_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  message_id UUID NOT NULL REFERENCES chat_messages(id),
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comments TEXT
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attendance_student ON attendance(student_id, subject_id);
CREATE INDEX idx_marks_student ON student_marks(student_id);
CREATE INDEX idx_exams_date ON examinations(exam_date);
CREATE INDEX idx_timetable_faculty ON timetables(faculty_id, day_of_week);
CREATE INDEX idx_notices_pub ON notices(published_at);
CREATE INDEX idx_chunks_doc ON document_chunks(document_id);
CREATE INDEX idx_chunks_embedding ON document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_sessions_user ON chat_sessions(user_id);
CREATE INDEX idx_messages_session ON chat_messages(session_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id, created_at);

INSERT INTO roles (role_name) VALUES ('student'),('teacher'),('hod'),('admin'),('applicant'),('visitor');
