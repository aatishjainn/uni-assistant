import { lazy, Suspense, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import Login from './pages/Login.jsx';
import Chat from './pages/Chat.jsx';
import { GraduationCap } from './components/Icons.jsx';

const Admin = lazy(() => import('./pages/Admin.jsx'));
const Hod = lazy(() => import('./pages/Hod.jsx'));
const Campus = lazy(() => import('./pages/Campus.jsx'));

const LoadingScreen = () => (
  <div className="h-full flex flex-col items-center justify-center bg-slate-50 text-slate-500 gap-3">
    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs animate-pulse">
      <GraduationCap className="w-5 h-5" />
    </div>
    <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
      <span className="w-3.5 h-3.5 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
      <span>Loading University Portal…</span>
    </div>
  </div>
);

function parseMapHash() {
  const h = window.location.hash;
  if (!h.startsWith('#map')) return null;
  const q = new URLSearchParams(h.split('?')[1] || '');
  return {
    at: q.get('at') || undefined,
    from: q.get('from') || undefined,
    to: q.get('to') || undefined,
    accessible: q.get('accessible') === 'true',
  };
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());
  const [view, setView] = useState('chat');
  const [mapInit, setMapInit] = useState(parseMapHash);

  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setToken(null))
      .finally(() => setChecking(false));
  }, []);

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
  const closeMap = () => {
    setMapInit(null);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setView('chat');
  };

  if (mapInit) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Campus key={JSON.stringify(mapInit)} initial={mapInit} onBack={closeMap} />
      </Suspense>
    );
  }

  if (checking) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Login onLoggedIn={setUser} onMap={() => openMap()} />;
  }

  if (view === 'admin' && user.role === 'admin') {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Admin onBack={() => setView('chat')} />
      </Suspense>
    );
  }

  if (view === 'hod' && user.role === 'hod') {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Hod onBack={() => setView('chat')} />
      </Suspense>
    );
  }

  return (
    <Chat
      user={user}
      onLogout={logout}
      onAdmin={() => setView('admin')}
      onHod={() => setView('hod')}
      onMap={openMap}
    />
  );
}
