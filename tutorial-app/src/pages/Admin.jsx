import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  CAMPUS_BUILDINGS,
  CAMPUS_GRAPH,
  INITIAL_ADMIN_DATA,
} from '../data/mockData.js';
import {
  FileText,
  BookOpen,
  Bell,
  Compass,
  BarChart3,
  ShieldCheck,
  Upload,
  RefreshCw,
  Trash2,
  CheckCircle2,
  X,
  Plus,
  QrCode,
  Users,
  MessageSquare,
  Sparkles,
  Building2,
  HelpCircle,
  AlertCircle,
} from '../components/Icons.jsx';

const CATEGORIES = [
  {
    name: 'Academic & People',
    tabs: [
      { id: 'Users', label: 'Users & Roles', icon: Users },
      { id: 'Departments', label: 'Departments & Faculty', icon: Building2 },
      { id: 'Courses', label: 'Courses & Subjects', icon: BookOpen },
    ],
  },
  {
    name: 'Knowledge & Content',
    tabs: [
      { id: 'Faqs', label: 'Knowledge FAQs', icon: HelpCircle },
      { id: 'Documents', label: 'Documents & RAG', icon: FileText },
      { id: 'Admissions', label: 'Admissions Info', icon: BookOpen },
      { id: 'Notices', label: 'Notices & Bulletin', icon: Bell },
    ],
  },
  {
    name: 'Campus & Infrastructure',
    tabs: [
      { id: 'Campus', label: 'Campus Directory & QR', icon: Compass },
      { id: 'Analytics', label: 'Telemetry & Analytics', icon: BarChart3 },
    ],
  },
];

const TABS = CATEGORIES.flatMap((c) => c.tabs);
const fieldStyle =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all';
const btnPrimary =
  'inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-2 shadow-2xs disabled:opacity-50 transition-all cursor-pointer';
const btnSecondary =
  'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-1.5 shadow-2xs disabled:opacity-50 transition-all cursor-pointer';

function StatusBadge({ status }) {
  if (status === 'indexed') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
        Indexed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 animate-pulse">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
      {status}
    </span>
  );
}

function QrModal({ place, onClose }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    const url = `${window.location.origin}/#map?at=${encodeURIComponent(place.qr_code)}`;
    QRCode.toDataURL(url, { width: 220, margin: 1 }).then(setSrc).catch(() => {});
  }, [place]);

  return (
    <div className="fixed inset-0 bg-slate-950/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-xs w-full text-center space-y-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-900">Door QR Placard</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        {src && <img src={src} alt={place.name} className="mx-auto rounded-xl border border-slate-200" />}
        <div>
          <div className="text-sm font-bold text-slate-900">{place.name}</div>
          <div className="text-xs text-slate-500">{place.building} · {place.floor_label}</div>
          <code className="mt-1 inline-block text-[10px] font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">
            {place.qr_code}
          </code>
        </div>
      </div>
    </div>
  );
}

export default function Admin({ onBack, activeTab: controlledTab, onTabChange }) {
  const [internalTab, setInternalTab] = useState('Users');
  const tab = controlledTab ?? internalTab;
  const setTab = (t) => {
    setInternalTab(t);
    onTabChange?.(t);
  };

  const [users, setUsers] = useState(INITIAL_ADMIN_DATA.users);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [docs, setDocs] = useState(INITIAL_ADMIN_DATA.documents);
  const [faqs, setFaqs] = useState(INITIAL_ADMIN_DATA.faqs);
  const [admissions, setAdmissions] = useState(INITIAL_ADMIN_DATA.admissions);
  const [notices, setNotices] = useState(INITIAL_ADMIN_DATA.notices);
  const [qrPreview, setQrPreview] = useState(null);
  const [docTitle, setDocTitle] = useState('');
  const [docType, setDocType] = useState('policy');
  const [docVis, setDocVis] = useState('public');
  const [toast, setToast] = useState('');

  const filteredUsers = users.filter((u) => {
    const matchRole = !roleFilter || u.role_name === roleFilter;
    const q = userSearch.toLowerCase();
    const matchQ = !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    return matchRole && matchQ;
  });

  const toggleUserActive = (id) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, is_active: !u.is_active } : u)));
  };

  const simulateUploadDoc = (e) => {
    e.preventDefault();
    const id = `doc-${Date.now()}`;
    const title = docTitle.trim() || 'Campus Academic Calendar 2026-27';
    setDocs((prev) => [
      {
        id,
        title,
        file_name: `${title.toLowerCase().replace(/\s+/g, '_')}.pdf`,
        document_type: docType,
        visibility: docVis,
        status: 'indexing',
        chunk_count: 0,
        is_approved: true,
      },
      ...prev,
    ]);
    setDocTitle('');
    setToast(`Uploaded "${title}". Chunking & pgvector embedding pipeline running…`);
    setTimeout(() => {
      setDocs((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: 'indexed', chunk_count: 16 } : d))
      );
      setToast(`"${title}" indexed (16 sentence-window chunks stored in pgvector).`);
    }, 1100);
  };

  const reindexDoc = (id) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, status: 'indexing' } : d)));
    setTimeout(() => {
      setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, status: 'indexed' } : d)));
    }, 800);
  };

  const placesWithQr = CAMPUS_GRAPH.nodes.filter((n) => n.qr_code && (n.type === 'room' || n.type === 'entrance'));

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden text-slate-800">
      <header className="h-14 border-b border-slate-200/90 px-4 md:px-6 flex items-center justify-between gap-3 bg-white/95 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <span>&larr; Back to Chat</span>
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-indigo-100 text-indigo-700">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
            </span>
            <span className="font-semibold text-xs md:text-sm text-slate-900">
              Admin Portal &middot; Institutional Administration Center
            </span>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
          Admin Authorized
        </span>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside
          data-tour="admin-sidebar"
          className="w-64 border-r border-slate-200/80 bg-white p-3 space-y-4 shrink-0 overflow-y-auto hidden md:block"
        >
          {CATEGORIES.map((cat) => (
            <div key={cat.name} className="space-y-1">
              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {cat.name}
              </div>
              {cat.tabs.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                      active
                        ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-2xs border border-indigo-200/60'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
                      <span>{t.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        <main className="flex-1 p-4 md:p-6 overflow-y-auto space-y-6">
          <div className="flex md:hidden gap-1.5 overflow-x-auto pb-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium ${
                  tab === t.id ? 'bg-indigo-600 text-white font-semibold' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {toast && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{toast}</span>
              </div>
              <button onClick={() => setToast('')} className="cursor-pointer"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {tab === 'Users' && (
            <div className="space-y-4" data-tour="admin-users">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">User Account Management</h2>
                  <p className="text-xs text-slate-500">Manage institutional accounts, RBAC roles, and active status.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs"
                    placeholder="Search name or email…"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                  <select
                    className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs"
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                  >
                    <option value="">All roles</option>
                    {['admin', 'hod', 'teacher', 'student', 'applicant'].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">User</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.map((u) => (
                      <tr key={u.id}>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{u.full_name}</div>
                          <div className="text-[11px] text-slate-400">{u.email}</div>
                        </td>
                        <td className="py-2.5 px-3 capitalize font-medium text-indigo-700">{u.role_name}</td>
                        <td className="py-2.5 px-3 text-slate-500">{u.department_name}</td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => toggleUserActive(u.id)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${
                              u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {u.is_active ? 'Active' : 'Disabled'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'Departments' && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-slate-900">Departments &amp; Faculty Assignments</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {INITIAL_ADMIN_DATA.departments.map((d) => (
                  <div key={d.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-1">
                    <div className="text-sm font-bold text-slate-900">{d.department_name}</div>
                    <div className="text-xs text-slate-500">HOD: {d.hod_name}</div>
                    <div className="text-[11px] text-indigo-600 font-medium pt-1">
                      {d.faculty_count} Faculty · {d.course_count} Courses
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'Courses' && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-slate-900">Courses &amp; Subjects</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                {INITIAL_ADMIN_DATA.courses.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-bold text-slate-900">{c.course_name}</div>
                    <div className="text-xs text-slate-500">{c.department_name} · {c.duration_years} Years</div>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                <div className="text-xs font-bold text-slate-700 uppercase">Subjects Catalog</div>
                {INITIAL_ADMIN_DATA.subjects.map((s) => (
                  <div key={s.id} className="flex justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
                    <span className="font-semibold">{s.subject_code} · {s.subject_name}</span>
                    <span className="text-slate-500">{s.course_name} Sem {s.semester}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'Faqs' && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-slate-900">Curated Knowledge FAQs</h2>
              {faqs.map((f) => (
                <div key={f.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-1">
                  <div className="text-xs font-bold text-slate-900">{f.question}</div>
                  <div className="text-xs text-slate-600">{f.answer}</div>
                </div>
              ))}
            </div>
          )}

          {tab === 'Documents' && (
            <div className="space-y-5" data-tour="admin-documents">
              <form onSubmit={simulateUploadDoc} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-900">Ingest Knowledge Document (Hybrid RAG Pipeline)</h3>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <input
                    className={fieldStyle}
                    placeholder="Document title (e.g. Academic Calendar 2026)"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                  />
                  <select className={fieldStyle} value={docType} onChange={(e) => setDocType(e.target.value)}>
                    {['policy', 'syllabus', 'handbook', 'notice', 'admission'].map((t) => (
                      <option key={t} value={t}>{t.toUpperCase()}</option>
                    ))}
                  </select>
                  <select className={fieldStyle} value={docVis} onChange={(e) => setDocVis(e.target.value)}>
                    <option value="public">Public (All Roles)</option>
                    <option value="staff">Staff Only</option>
                    <option value="admin">Admins Only</option>
                  </select>
                </div>
                <button type="submit" className={btnPrimary}>
                  <Upload className="w-3.5 h-3.5" />
                  Simulate PDF/DOCX Ingestion
                </button>
              </form>

              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Document</th>
                      <th className="py-2.5 px-3">Scope</th>
                      <th className="py-2.5 px-3">Chunks</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {docs.map((d) => (
                      <tr key={d.id}>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{d.title}</div>
                          <div className="text-[11px] text-slate-400">{d.file_name}</div>
                        </td>
                        <td className="py-2.5 px-3 capitalize text-slate-600">{d.visibility}</td>
                        <td className="py-2.5 px-3 font-mono">{d.chunk_count}</td>
                        <td className="py-2.5 px-3"><StatusBadge status={d.status} /></td>
                        <td className="py-2.5 px-3 text-right space-x-1">
                          <button onClick={() => reindexDoc(d.id)} className={btnSecondary} title="Re-index">
                            <RefreshCw className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setDocs((prev) => prev.filter((x) => x.id !== d.id))}
                            className={btnSecondary}
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3 text-rose-600" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'Admissions' && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-slate-900">Admissions Eligibility &amp; Fee Structure</h2>
              {admissions.map((a) => (
                <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900">{a.course_name}</span>
                    <span className="font-semibold text-indigo-700">₹{a.fee_amount.toLocaleString()} / yr</span>
                  </div>
                  <p className="text-slate-600"><b>Eligibility:</b> {a.eligibility}</p>
                  <p className="text-slate-500"><b>Deadline:</b> {a.application_deadline || 'Not announced (not fabricated by AI)'}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'Notices' && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">University Bulletin Notices</h2>
              {notices.map((n) => (
                <div key={n.id} className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-bold text-slate-900">{n.title}</div>
                    <div className="text-slate-500">{n.content}</div>
                  </div>
                  <button
                    onClick={() => setNotices((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_published: !x.is_published } : x)))}
                    className={btnSecondary}
                  >
                    {n.is_published ? 'Published' : 'Hidden'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'Campus' && (
            <div className="space-y-5" data-tour="admin-campus-qr">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-900">Campus Buildings Geolocation</h3>
                <div className="grid sm:grid-cols-3 gap-3 text-xs">
                  {CAMPUS_BUILDINGS.map((b) => (
                    <div key={b.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="font-bold text-slate-900">{b.name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{b.latitude}, {b.longitude}</div>
                      <div className="text-[11px] text-slate-500 mt-1">{b.description}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-900">Rooms &amp; Door QR Placards</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 uppercase">
                      <tr>
                        <th className="py-2 px-3">Location</th>
                        <th className="py-2 px-3">Room / Node</th>
                        <th className="py-2 px-3 text-center">Visibility</th>
                        <th className="py-2 px-3 text-right">QR Code</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {placesWithQr.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2 px-3 text-slate-500">{p.building} · {p.floor_label}</td>
                          <td className="py-2 px-3 font-semibold text-slate-900">{p.name}</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.is_public ? 'bg-emerald-50 text-emerald-700' : 'bg-purple-50 text-purple-700'}`}>
                              {p.is_public ? 'Public' : 'Staff Only'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button onClick={() => setQrPreview(p)} className={btnSecondary}>
                              <QrCode className="w-3 h-3 text-indigo-600" />
                              Preview QR
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'Analytics' && (
            <div className="space-y-5" data-tour="admin-analytics">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
                {[
                  ['Total Conversations', INITIAL_ADMIN_DATA.analytics.totals.conversations, MessageSquare, 'text-indigo-600'],
                  ['User Questions', INITIAL_ADMIN_DATA.analytics.totals.questions, Sparkles, 'text-blue-600'],
                  ['Active Users', INITIAL_ADMIN_DATA.analytics.totals.active_users, Users, 'text-emerald-600'],
                  ['Blocked Privacy Attempts', INITIAL_ADMIN_DATA.analytics.denied_attempts, ShieldCheck, 'text-amber-600'],
                  ['Indexed Documents', docs.filter((d) => d.status === 'indexed').length, FileText, 'text-teal-600'],
                  ['Failed Documents', 0, AlertCircle, 'text-rose-600'],
                ].map(([label, val, Icon, clr]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
                      <Icon className={`w-4 h-4 ${clr}`} />
                    </div>
                    <div className="text-2xl font-bold text-slate-900">{val}</div>
                  </div>
                ))}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
                  <h3 className="text-sm font-bold text-slate-900">User Intent Distribution</h3>
                  {INITIAL_ADMIN_DATA.analytics.intents.map((item) => (
                    <div key={item.intent} className="flex justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
                      <span className="font-mono text-slate-700">{item.intent}</span>
                      <span className="font-bold px-2 py-0.5 rounded bg-slate-100">{item.count}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">
                  <h3 className="text-sm font-bold text-slate-900">Query Activity (Recent Days)</h3>
                  {INITIAL_ADMIN_DATA.analytics.questions_per_day.map((d) => (
                    <div key={d.day} className="flex justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
                      <span className="text-slate-600">{d.day}</span>
                      <span className="font-semibold text-indigo-600">{d.questions} questions</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {qrPreview && <QrModal place={qrPreview} onClose={() => setQrPreview(null)} />}
    </div>
  );
}
