// Finds the most relevant chunks of APPROVED, INDEXED, non-expired documents the user's role may see.
// Combines keyword search (always works) with vector search (when embeddings are available).
const db = require('../db');
const config = require('../config');
const ai = require('./ai');

const VISIBLE = {
  student: ['public'], applicant: ['public'], visitor: ['public'],
  teacher: ['public', 'staff'], hod: ['public', 'staff'], admin: ['public', 'staff', 'admin'],
};
const FILTER = `d.is_approved AND d.status = 'indexed' AND d.visibility = ANY($2::text[])
                AND (d.expires_at IS NULL OR d.expires_at >= CURRENT_DATE)`;

async function textSearch(question, visibility) {
  const lex = await db.query(
    `SELECT string_agg(quote_literal(lexeme), ' | ') AS q, array_agg(lexeme) AS lexemes
       FROM unnest(to_tsvector('english', $1))`, [question]);
  const { q, lexemes } = lex.rows[0];
  if (!q) return [];
  // A chunk must contain most of the question's key terms, so one generic word ("policy") is not enough
  const needed = Math.max(1, Math.ceil(lexemes.length * config.ragMinTermMatch));
  const { rows } = await db.query(
    `SELECT c.id, c.chunk_text, c.page_number, d.id AS document_id, d.title,
            ts_rank_cd(c.tsv, to_tsquery('english', $1), 32) AS score,
            (SELECT count(*)::int FROM unnest($3::text[]) AS t(lex)
              WHERE c.tsv @@ to_tsquery('english', quote_literal(t.lex))) AS matched
       FROM document_chunks c JOIN knowledge_documents d ON d.id = c.document_id
      WHERE ${FILTER} AND c.tsv @@ to_tsquery('english', $1)
      ORDER BY score DESC LIMIT 40`, [q, visibility, lexemes]);
  return rows.filter((r) => r.matched >= needed).slice(0, 8);
}

async function vectorSearch(question, visibility) {
  let embedding;
  try {
    embedding = (await ai.embed([question], 'query')).embeddings[0];
    if (!Array.isArray(embedding) || embedding.length !== config.embedDimensions) return [];
  } catch (err) {
    console.error('query embedding failed (using keyword search only):', err.message);
    return [];
  }
  const { rows } = await db.query(
    `SELECT c.id, c.chunk_text, c.page_number, d.id AS document_id, d.title,
            1 - (c.embedding <=> $1::vector) AS similarity
       FROM document_chunks c JOIN knowledge_documents d ON d.id = c.document_id
      WHERE ${FILTER.replace('$2', '$2')} AND c.embedding IS NOT NULL
      ORDER BY c.embedding <=> $1::vector LIMIT 8`, [`[${embedding.join(',')}]`, visibility]);
  return rows.filter((r) => Number(r.similarity) >= config.ragMinSimilarity);
}

// Reciprocal rank fusion: a chunk found by both methods ranks highest
async function search(question, role) {
  const visibility = VISIBLE[role] || ['public'];
  const [text, vector] = await Promise.all([textSearch(question, visibility), vectorSearch(question, visibility)]);
  const scored = new Map();
  for (const list of [text, vector]) {
    list.forEach((row, rank) => {
      const entry = scored.get(row.id) || { row, score: 0 };
      entry.score += 1 / (60 + rank);
      scored.set(row.id, entry);
    });
  }
  return [...scored.values()].sort((a, b) => b.score - a.score).slice(0, config.ragTopK)
    .map((e) => ({ ...e.row, chunk_text: e.row.chunk_text.slice(0, 1500) }));
}

module.exports = { search, VISIBLE };
