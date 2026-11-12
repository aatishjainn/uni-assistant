const config = require('../config');

async function post(path, body, timeoutMs = 45000) {
  const resp = await fetch(config.aiUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Service-Token': config.aiToken },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) throw new Error(`AI service responded ${resp.status} on ${path}`);
  return resp.json();
}

// Sends the file to the AI service to be read, chunked and embedded.
async function ingest(buffer, kind, filename) {
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', new Blob([buffer]), filename);
  const resp = await fetch(config.aiUrl + '/ai/ingest', {
    method: 'POST', headers: { 'X-Service-Token': config.aiToken }, body: form, signal: AbortSignal.timeout(180000),
  });
  if (resp.status === 422) {                       // a problem with the document itself
    const err = new Error((await resp.json()).detail || 'The document could not be processed');
    err.userFacing = true;
    throw err;
  }
  if (!resp.ok) throw new Error(`AI service responded ${resp.status} on /ai/ingest`);
  return resp.json();
}

module.exports = {
  chat: (message, history, mode) => post('/ai/chat', { message, history, mode }),
  classify: (message, recent, intents) => post('/ai/classify', { message, recent, intents }, 25000),
  answer: (payload) => post('/ai/answer', payload),
  embed: (texts, task = 'document') => post('/ai/embed', { texts, task }, 30000),
  ingest,
};
