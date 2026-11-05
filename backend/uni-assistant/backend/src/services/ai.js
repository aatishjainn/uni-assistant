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

module.exports = {
  chat: (message, history, mode) => post('/ai/chat', { message, history, mode }),
  classify: (message, recent, intents) => post('/ai/classify', { message, recent, intents }, 25000),
  answer: (payload) => post('/ai/answer', payload),
};
