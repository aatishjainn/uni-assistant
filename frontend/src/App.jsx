import { lazy, Suspense, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import Login from './pages/Login.jsx';
import Chat from './pages/Chat.jsx';
// the admin panel and the map are only downloaded when opened (keeps the login page fast)
const Admin = lazy(() => import('./pages/Admin.jsx'));
const Campus = lazy(() => import('./pages/Campus.jsx'));
const Loading = () => <div className="h-full grid place-items-center text-slate-500">Loading…</div>;

// #map?at=QR-CODE  /  #map?from=..&to=..   (QR codes and chat links open the map, no sign-in needed)
function parseMapHash() {
  const h = window.location.hash;
  if (!h.startsWith('#map')) return null;
  const q = new URLSearchParams(h.split('?')[1] || '');
  return { at: q.get('at') || undefined, from: q.get('from') || undefined, to: q.get('to') || undefined, accessible: q.get('accessible') === 'true' };
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());
  const [view, setView] = useState('chat');
  const [mapInit, setMapInit] = useState(parseMapHash);      // null = map closed

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

  useEffect(() => {
    const onHash = () => setMapInit(parseMapHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const openMap = (params = {}) => setMapInit({ ...params });
  const closeMap = () => { setMapInit(null); window.history.replaceState(null, '', window.location.pathname + window.location.search); };

  const logout = () => { setToken(null); setUser(null); setView('chat'); };

  if (mapInit) return <Suspense fallback={<Loading />}><Campus key={JSON.stringify(mapInit)} initial={mapInit} onBack={closeMap} /></Suspense>;
  if (checking) return <div className="h-full grid place-items-center text-slate-500">Loading…</div>;
  if (!user) return <Login onLoggedIn={setUser} onMap={() => openMap()} />;
  if (view === 'admin' && user.role === 'admin') return <Suspense fallback={<Loading />}><Admin onBack={() => setView('chat')} /></Suspense>;
  return <Chat user={user} onLogout={logout} onAdmin={() => setView('admin')} onMap={openMap} />;
}
