// All calls to the backend go through here. The login token lives in sessionStorage
// (cleared when the browser tab closes).
const KEY = 'uni_token';
export const getToken = () => sessionStorage.getItem(KEY);
export const setToken = (t) => (t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY));

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Cannot reach the server. Is the backend running?', 0);
  }
  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch { /* no body */ }

  if (!res.ok) {
    if (res.status === 401 && token) {           // token expired or invalid
      setToken(null);
      window.dispatchEvent(new Event('auth-expired'));
    }
    throw new ApiError((data && data.error) || 'Request failed', res.status);
  }
  return data;
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  register: (full_name, email, password) => request('/auth/register', { method: 'POST', body: { full_name, email, password } }),
  me: () => request('/auth/me'),
  chat: (message, sessionId, mode) =>
    request('/chat', { method: 'POST', body: { message, mode, ...(sessionId ? { sessionId } : {}) } }),
  sessions: () => request('/chat/sessions'),
  session: (id) => request(`/chat/sessions/${id}`),
  deleteSession: (id) => request(`/chat/sessions/${id}`, { method: 'DELETE' }),
};
