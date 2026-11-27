import { useState } from 'react';
import { api, setToken } from '../api.js';
import {
  GraduationCap,
  Compass,
  ArrowRight,
  ShieldCheck,
  User,
  AlertCircle,
  CheckCircle2,
} from '../components/Icons.jsx';

const DEMO_PERSONAS = [
  { name: 'Riya Patel', role: 'Student', email: 'student1@uni.test', desc: 'BCA · Semester 4' },
  { name: 'Aman Singh', role: 'Student', email: 'student2@uni.test', desc: 'BCA · Semester 4' },
  { name: 'Prof. Rahul Verma', role: 'Teacher', email: 'teacher@uni.test', desc: 'Computer Science Faculty' },
  { name: 'Dr. Meera Sharma', role: 'HOD', email: 'hod@uni.test', desc: 'Head of Computer Science' },
  { name: 'Maya Chen', role: 'Applicant', email: 'applicant@uni.test', desc: 'Prospective Student · Apply' },
  { name: 'System Admin', role: 'Admin', email: 'admin@uni.test', desc: 'Full System Control' },
];

export default function Login({ onLoggedIn, onMap }) {
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
      onLoggedIn(r.user, { isNewApplicant: mode === 'register' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function pickPersona(p) {
    setMode('login');
    setEmail(p.email);
    setPassword('Password@123');
    setError('');
  }

  const roleBadgeColor = {
    Student: 'bg-blue-50 text-blue-700 border-blue-200',
    Teacher: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    HOD: 'bg-purple-50 text-purple-700 border-purple-200',
    Applicant: 'bg-amber-50 text-amber-800 border-amber-200',
    Admin: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  return (
    <div className="min-h-full flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-slate-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Icon & Heading */}
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-600 text-white shadow-sm mb-4">
          <GraduationCap className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          University Smart Assistant
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Institutional AI Portal, Academic Records & Campus Navigation
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 sm:px-8 shadow-sm border border-slate-200 rounded-2xl">
          {/* Segmented Auth Toggle */}
          <div className="flex p-1 bg-slate-100 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              New Applicant
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="name">
                  Full Legal Name
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Maya Chen"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="email">
                Institutional Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@uni.test"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-medium text-slate-700" htmlFor="password">
                  Password
                </label>
                {mode === 'register' && (
                  <span className="text-[11px] text-slate-400">Min. 8 characters</span>
                )}
              </div>
              <input
                id="password"
                type="password"
                required
                minLength={mode === 'register' ? 8 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all"
              />
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-800">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex justify-center items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-2.5 text-sm font-semibold text-white shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60 transition-all"
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Authenticating…
                </span>
              ) : mode === 'login' ? (
                <>
                  Sign in
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                'Create applicant account'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-slate-400 font-medium">Or explore publicly</span>
            </div>
          </div>

          {/* Campus Map Direct Action */}
          <button
            type="button"
            onClick={onMap}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-slate-100/80 py-2 text-xs font-semibold text-slate-700 transition-all"
          >
            <Compass className="w-4 h-4 text-indigo-600" />
            Interactive Campus Map (No sign-in required)
          </button>
        </div>

        {/* Demo Personas Card */}
        <div className="mt-6 bg-white/70 border border-slate-200/80 rounded-2xl p-4 shadow-2xs backdrop-blur-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              Quick Test Personas
            </div>
            <span className="text-[11px] text-slate-400">Password: Password@123</span>
          </div>

          <p className="text-[11px] text-slate-500 mb-3">
            Select an institutional profile to automatically populate credentials:
          </p>

          <div className="grid grid-cols-1 gap-1.5">
            {DEMO_PERSONAS.map((p) => (
              <button
                key={p.email}
                type="button"
                onClick={() => pickPersona(p)}
                className="group flex items-center justify-between p-2 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/40 text-left transition-all"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-white text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                    {p.name.charAt(0)}
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-medium text-slate-900 truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-400">{p.desc}</div>
                  </div>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border shrink-0 ${roleBadgeColor[p.role]}`}>
                  {p.role}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 text-center text-[11px] text-slate-400">
          Protected by role-scoped access control & zero-trust verification.
        </div>
      </div>
    </div>
  );
}
