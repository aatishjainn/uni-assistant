import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import Login from './pages/Login.jsx';
import Chat from './pages/Chat.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());
  const [view, setView] = useState('chat');

  // If a token is already stored, find out who it belongs to
  useEffect(() => {
    if (!getToken()) return;
    api.me().then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setChecking(false));
  }, []);

  // The API layer announces when a token has expired
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener('auth-expired', onExpired);
    return () => window.removeEventListener('auth-expired', onExpired);
  }, []);

  const logout = () => { setToken(null); setUser(null); setView('chat'); };

  if (checking) return <div className="h-full grid place-items-center text-slate-500">Loading…</div>;
  if (!user) return <Login onLoggedIn={setUser} />;
  if (view === 'admin' && user.role === 'admin') return <Admin onBack={() => setView('chat')} />;
  return <Chat user={user} onLogout={logout} onAdmin={() => setView('admin')} />;
}
