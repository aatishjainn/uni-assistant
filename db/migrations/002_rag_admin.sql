-- RAG + admin panel additions. Written to be safe to run more than once.

ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public',   -- public | staff | admin
  ADD COLUMN IF NOT EXISTS expires_at DATE,
  ADD COLUMN IF NOT EXISTS status_detail TEXT,
  ADD COLUMN IF NOT EXISTS original_filename TEXT,
  ADD COLUMN IF NOT EXISTS chunk_count INT NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_documents_visibility_check') THEN
    ALTER TABLE knowledge_documents
      ADD CONSTRAINT knowledge_documents_visibility_check CHECK (visibility IN ('public','staff','admin'));
  END IF;
END $$;

-- Keyword search column (works even when embeddings are unavailable)
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED;
CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON document_chunks USING gin (tsv);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_doc_idx ON document_chunks (document_id, chunk_index);

-- Richer admission information. NULL always means "not available" (never invent it).
ALTER TABLE admissions
  ADD COLUMN IF NOT EXISTS required_documents TEXT,
  ADD COLUMN IF NOT EXISTS application_url TEXT,
  ADD COLUMN IF NOT EXISTS contact_info TEXT,
  ADD COLUMN IF NOT EXISTS scholarship_info TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS idx_admissions_course ON admissions (course_id);

ALTER TABLE notices ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
