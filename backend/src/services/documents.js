const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const db = require('../db');
const ai = require('./ai');

const vectorLiteral = (v) => `[${v.join(',')}]`;

async function setStatus(id, status, detail = null, chunkCount = null) {
  await db.query(
    `UPDATE knowledge_documents SET status = $2, status_detail = $3, chunk_count = COALESCE($4, chunk_count) WHERE id = $1`,
    [id, status, detail, chunkCount]);
}

// Reads the stored file, has it chunked/embedded, and replaces the document's chunks. Runs in the background.
async function processDocument(id) {
  const { rows } = await db.query('SELECT id, storage_path, original_filename FROM knowledge_documents WHERE id = $1', [id]);
  const doc = rows[0];
  if (!doc) return;
  try {
    await setStatus(id, 'indexing');
    const buffer = await fs.readFile(path.join(config.storageDir, doc.storage_path));
    const kind = doc.storage_path.endsWith('.pdf') ? 'pdf' : 'docx';
    const out = await ai.ingest(buffer, kind, doc.original_filename || doc.storage_path);

    // Only accept embeddings of the expected size, otherwise fall back to keyword search
    const embeddingsOk = out.chunks.every((c) => Array.isArray(c.embedding) && c.embedding.length === config.embedDimensions);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM document_chunks WHERE document_id = $1', [id]);
      for (let i = 0; i < out.chunks.length; i += 50) {
        const batch = out.chunks.slice(i, i + 50);
        const values = [];
        const params = [id];
        batch.forEach((c, j) => {
          const b = 1 + j * 4;
          values.push(`($1, $${b + 1}, $${b + 2}, $${b + 3}::vector, $${b + 4})`);
          params.push(c.index, c.text, embeddingsOk ? vectorLiteral(c.embedding) : null, c.page);
        });
        await client.query(
          `INSERT INTO document_chunks (document_id, chunk_index, chunk_text, embedding, page_number) VALUES ${values.join(',')}`, params);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    const note = embeddingsOk ? null : (out.embedding_error || 'Embeddings unavailable. Keyword search only. Re-index later.');
    await setStatus(id, 'indexed', note, out.chunks.length);
  } catch (err) {
    console.error('document processing failed:', err.message);
    await setStatus(id, 'failed', err.userFacing ? err.message : 'Processing failed. Check the AI service and try Re-index.');
  }
}

async function removeFile(storagePath) {
  try { await fs.unlink(path.join(config.storageDir, storagePath)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}

module.exports = { processDocument, removeFile };
