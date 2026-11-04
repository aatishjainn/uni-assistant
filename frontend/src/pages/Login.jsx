import { useState } from 'react';
import { api, setToken } from '../api.js';

// Demo accounts exist only because we seed DUMMY data. Remove this box before any real deployment.
const DEMO = ['student1@uni.test', 'student2@uni.test', 'teacher@uni.test', 'hod@uni.test', 'admin@uni.test'];

export default function Login({ onLoggedIn }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'register') {
        await api.register(name, email, password);
      }
      const r = await api.login(email, password);
      setToken(r.token);
      onLoggedIn(r.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="min-h-full grid place-items-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🎓</div>
          <h1 className="text-2xl font-bold">University Smart Assistant</h1>
          <p className="text-slate-500 text-sm">Sign in to start chatting</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-2xl shadow p-6 space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="name">Full name</label>
              <input id="name" className={input} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="email">Email</label>
            <input id="email" type="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="password">Password</label>
            <input id="password" type="password" className={input} value={password} onChange={(e) => setPassword(e.target.value)}
              required minLength={mode === 'register' ? 8 : 1} />
            {mode === 'register' && <p className="text-xs text-slate-500 mt-1">At least 8 characters.</p>}
          </div>

          {error && <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          <button disabled={busy}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium rounded-lg py-2">
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            className="w-full text-sm text-indigo-600 hover:underline">
            {mode === 'login' ? 'New applicant? Create an account' : 'Already have an account? Sign in'}
          </button>
        </form>

        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
          <div className="font-medium text-amber-900 mb-1">Demo accounts (dummy data)</div>
          <div className="text-amber-800 mb-2">Click one to fill the form. Password: <code>Password@123</code></div>
          <div className="flex flex-wrap gap-2">
            {DEMO.map((d) => (
              <button key={d} type="button" onClick={() => { setMode('login'); setEmail(d); setPassword('Password@123'); }}
                className="px-2 py-1 rounded-md bg-white border border-amber-300 hover:bg-amber-100">
                {d.split('@')[0]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
