import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import MessageBubble, { TypingIndicator } from '../components/MessageBubble.jsx';

const SUGGESTIONS = [
  'What is Artificial Intelligence?',
  'Explain database normalization',
  'Generate 10 DBMS MCQs',
  'Suggest final-year project ideas',
];

export default function Chat({ user, onLogout }) {
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);   // {role: 'user'|'assistant', text}
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('simple');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef(null);

  const loadSessions = () => api.sessions().then((r) => setSessions(r.sessions)).catch(() => {});

  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setError('');
    setSidebarOpen(false);
  }

  async function openSession(id) {
    setSidebarOpen(false);
    setError('');
    try {
      const r = await api.session(id);
      setActiveId(id);
      setMessages(r.messages.map((m) => ({ role: m.sender, text: m.message })));
    } catch (e) {
      setError(e.message);
    }
  }

  async function removeSession(id) {
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      await api.deleteSession(id);
      if (id === activeId) newChat();
      loadSessions();
    } catch (e) {
      setError(e.message);
    }
  }

  async function send(text) {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    setInput('');
    setError('');
    setMessages((m) => [...m, { role: 'user', text: message }]);
    setLoading(true);
    try {
      const r = await api.chat(message, activeId, mode);
      setMessages((m) => [...m, { role: 'assistant', text: r.answer }]);
      if (!activeId) { setActiveId(r.sessionId); loadSessions(); }
    } catch (e) {
      setError(e.message);
      setInput(message);   // give the text back so nothing is lost
      setMessages((m) => m.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div className="h-full flex bg-slate-100">
      {/* Sidebar */}
      <aside className={`fixed md:static inset-y-0 left-0 z-20 w-72 bg-slate-900 text-slate-100 flex flex-col transition-transform
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="p-3">
          <button onClick={newChat} className="w-full rounded-lg border border-slate-600 hover:bg-slate-800 py-2 font-medium">
            + New chat
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 space-y-1" aria-label="Conversations">
          {sessions.length === 0 && <p className="text-sm text-slate-400 px-2 py-4">No conversations yet.</p>}
          {sessions.map((s) => (
            <div key={s.id} className={`group flex items-center rounded-lg ${s.id === activeId ? 'bg-slate-700' : 'hover:bg-slate-800'}`}>
              <button onClick={() => openSession(s.id)} className="flex-1 text-left px-3 py-2 truncate text-sm" title={s.session_title}>
                {s.session_title || 'Untitled'}
              </button>
              <button onClick={() => removeSession(s.id)} aria-label="Delete conversation"
                className="px-2 text-slate-400 hover:text-red-400 md:opacity-0 md:group-hover:opacity-100">🗑</button>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-700 text-sm">
          <div className="font-medium truncate">{user.full_name}</div>
          <div className="text-slate-400 capitalize mb-2">{user.role}</div>
          <button onClick={onLogout} className="text-slate-300 hover:text-white underline">Sign out</button>
        </div>
      </aside>
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-10 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-3">
          <button className="md:hidden text-xl" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
          <h1 className="font-semibold flex-1 truncate">🎓 University Smart Assistant</h1>
          <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm" role="group" aria-label="Explanation mode">
            {['simple', 'detailed'].map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1 capitalize ${mode === m ? 'bg-indigo-600 text-white' : 'bg-white hover:bg-slate-100'}`}>{m}</button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.length === 0 && !loading && (
              <div className="text-center pt-10">
                <div className="text-5xl mb-3">👋</div>
                <h2 className="text-xl font-semibold mb-1">Hi {user.full_name.split(' ')[0]}, how can I help?</h2>
                <p className="text-slate-500 mb-6">Ask me anything about studies and programming. Try one of these:</p>
                <div className="grid sm:grid-cols-2 gap-2 max-w-xl mx-auto">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)}
                      className="text-left bg-white border border-slate-200 hover:border-indigo-400 rounded-xl px-4 py-3 text-sm shadow-sm">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => <MessageBubble key={i} role={m.role} text={m.text} />)}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="bg-white border-t border-slate-200 p-3">
          <div className="max-w-3xl mx-auto">
            {error && (
              <div role="alert" className="mb-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex justify-between gap-2">
                <span>{error}</span>
                <button onClick={() => setError('')} aria-label="Dismiss" className="font-bold">×</button>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown}
                maxLength={4000} placeholder="Type your question… (Enter to send, Shift+Enter for a new line)"
                className="flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 max-h-40 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button onClick={() => send()} disabled={loading || !input.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl px-4 py-2 font-medium">
                Send
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
