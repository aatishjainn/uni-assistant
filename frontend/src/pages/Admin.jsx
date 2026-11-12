import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const TABS = ['Documents', 'Admissions', 'Notices', 'Analytics'];
const DOC_TYPES = ['syllabus', 'notice', 'policy', 'admission', 'calendar', 'faq', 'handbook', 'other'];
const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const btn = 'rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50';

function Alert({ kind = 'error', children, onClose }) {
  if (!children) return null;
  const color = kind === 'error' ? 'text-red-700 bg-red-50 border-red-200' : 'text-green-800 bg-green-50 border-green-200';
  return (
    <div role="alert" className={`mb-3 text-sm border rounded-lg px-3 py-2 flex justify-between gap-2 ${color}`}>
      <span>{children}</span>{onClose && <button onClick={onClose} aria-label="Dismiss" className="font-bold">×</button>}
    </div>
  );
}

function StatusBadge({ status }) {
  const color = { indexed: 'bg-green-100 text-green-800', failed: 'bg-red-100 text-red-800' }[status] || 'bg-amber-100 text-amber-800';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{status}</span>;
}

// ------------------------------------------------------------------ Documents
function DocumentsTab() {
  const [docs, setDocs] = useState([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', document_type: 'policy', visibility: 'public', expires_at: '', approve: true });
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);

  const load = useCallback(() => api.documents().then((r) => setDocs(r.documents)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  // While anything is still being processed, refresh every 3 seconds
  const working = docs.some((d) => d.status === 'pending' || d.status === 'indexing');
  useEffect(() => {
    if (!working) return undefined;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [working, load]);

  async function submit(e) {
    e.preventDefault();
    setError(''); setInfo('');
    if (!file) return setError('Choose a PDF or DOCX file first.');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', form.title || file.name.replace(/\.[^.]+$/, ''));
    fd.append('document_type', form.document_type);
    fd.append('visibility', form.visibility);
    fd.append('approve', String(form.approve));
    if (form.expires_at) fd.append('expires_at', form.expires_at);
    setBusy(true);
    try {
      await api.uploadDocument(fd);
      setInfo('Uploaded. The document is being processed. This takes a few seconds.');
      setFile(null); setFileKey((k) => k + 1); setForm({ ...form, title: '' });
      load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  const act = (fn) => async () => { setError(''); try { await fn(); load(); } catch (err) { setError(err.message); } };

  return (
    <div>
      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert kind="ok" onClose={() => setInfo('')}>{info}</Alert>

      <form onSubmit={submit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6 grid gap-3 md:grid-cols-2">
        <h3 className="md:col-span-2 font-semibold">Upload a document (PDF or DOCX, max 10 MB)</h3>
        <div className="md:col-span-2">
          <input key={fileKey} type="file" accept=".pdf,.docx" onChange={(e) => setFile(e.target.files[0] || null)} className="text-sm" />
        </div>
        <label className="text-sm">Title
          <input className={field} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Defaults to the file name" />
        </label>
        <label className="text-sm">Type
          <select className={field} value={form.document_type} onChange={(e) => setForm({ ...form, document_type: e.target.value })}>
            {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="text-sm">Who can see it
          <select className={field} value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
            <option value="public">Everyone (students, applicants, visitors)</option>
            <option value="staff">Teachers and HODs only</option>
            <option value="admin">Admins only</option>
          </select>
        </label>
        <label className="text-sm">Expires on (optional)
          <input type="date" className={field} value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
        </label>
        <label className="text-sm flex items-center gap-2 md:col-span-2">
          <input type="checkbox" checked={form.approve} onChange={(e) => setForm({ ...form, approve: e.target.checked })} />
          Approve now (the assistant only uses approved documents)
        </label>
        <div className="md:col-span-2">
          <button disabled={busy} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`}>{busy ? 'Uploading…' : 'Upload'}</button>
        </div>
      </form>

      <div className="overflow-x-auto bg-white rounded-xl shadow-sm border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr><th className="p-3">Document</th><th className="p-3">Status</th><th className="p-3">Visibility</th><th className="p-3">Approved</th>
              <th className="p-3">Expires</th><th className="p-3">Chunks</th><th className="p-3">Actions</th></tr>
          </thead>
          <tbody>
            {docs.length === 0 && <tr><td colSpan={7} className="p-4 text-slate-500">No documents yet. Upload one above.</td></tr>}
            {docs.map((d) => (
              <tr key={d.id} className="border-t border-slate-100 align-top">
                <td className="p-3"><div className="font-medium">{d.title}</div><div className="text-xs text-slate-500">{d.document_type} · {d.original_filename}</div></td>
                <td className="p-3"><StatusBadge status={d.status} />{d.status_detail && <div className="text-xs text-slate-500 mt-1 max-w-[220px]">{d.status_detail}</div>}</td>
                <td className="p-3">
                  <select className="border rounded px-1 py-0.5" value={d.visibility} onChange={(e) => act(() => api.updateDocument(d.id, { visibility: e.target.value }))()}>
                    <option value="public">public</option><option value="staff">staff</option><option value="admin">admin</option>
                  </select>
                </td>
                <td className="p-3"><input type="checkbox" checked={d.is_approved} aria-label="Approved" onChange={(e) => act(() => api.updateDocument(d.id, { is_approved: e.target.checked }))()} /></td>
                <td className="p-3">{d.expires_at || '-'}</td>
                <td className="p-3">{d.chunk_count}</td>
                <td className="p-3 whitespace-nowrap">
                  <button className={`${btn} border border-slate-300 hover:bg-slate-50 mr-2`} disabled={d.status === 'indexing'} onClick={act(() => api.reindexDocument(d.id))}>Re-index</button>
                  <button className={`${btn} border border-red-300 text-red-700 hover:bg-red-50`}
                    onClick={() => { if (window.confirm(`Delete "${d.title}"? This cannot be undone.`)) act(() => api.deleteDocument(d.id))(); }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Admissions
function AdmissionCard({ item, onSaved }) {
  const [f, setF] = useState(() => ({
    eligibility: item.eligibility || '', application_deadline: item.application_deadline || '',
    fee_amount: item.fee_amount ?? '', required_documents: item.required_documents || '',
    application_url: item.application_url || '', contact_info: item.contact_info || '',
    scholarship_info: item.scholarship_info || '', status: item.status,
  }));
  const [msg, setMsg] = useState({ kind: 'ok', text: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true); setMsg({ kind: 'ok', text: '' });
    try {
      await api.saveAdmission(item.id, { ...f, fee_amount: f.fee_amount === '' ? '' : Number(f.fee_amount) });
      setMsg({ kind: 'ok', text: 'Saved.' });
      onSaved();
    } catch (e) { setMsg({ kind: 'error', text: e.message }); } finally { setBusy(false); }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 grid gap-3 md:grid-cols-2">
      <h3 className="md:col-span-2 font-semibold text-lg">{item.course_name}</h3>
      <label className="text-sm md:col-span-2">Eligibility<textarea rows={2} className={field} value={f.eligibility} onChange={set('eligibility')} /></label>
      <label className="text-sm">Last date to apply<input type="date" className={field} value={f.application_deadline} onChange={set('application_deadline')} /></label>
      <label className="text-sm">Admission fee (INR)<input type="number" min="0" className={field} value={f.fee_amount} onChange={set('fee_amount')} /></label>
      <label className="text-sm md:col-span-2">Required documents<textarea rows={2} className={field} value={f.required_documents} onChange={set('required_documents')} /></label>
      <label className="text-sm">Online application link (https)<input className={field} value={f.application_url} onChange={set('application_url')} /></label>
      <label className="text-sm">Admission office contact<input className={field} value={f.contact_info} onChange={set('contact_info')} /></label>
      <label className="text-sm md:col-span-2">Scholarship information<textarea rows={2} className={field} value={f.scholarship_info} onChange={set('scholarship_info')} /></label>
      <label className="text-sm">Status
        <select className={field} value={f.status} onChange={set('status')}>
          <option value="draft">draft (hidden from the assistant)</option><option value="approved">approved</option><option value="closed">closed (hidden)</option>
        </select>
      </label>
      <div className="flex items-end gap-3">
        <button onClick={save} disabled={busy} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`}>{busy ? 'Saving…' : 'Save'}</button>
        <span className={`text-sm ${msg.kind === 'error' ? 'text-red-700' : 'text-green-700'}`}>{msg.text}</span>
      </div>
    </div>
  );
}

function AdmissionsTab() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const load = useCallback(() => api.admissions().then((r) => setItems(r.admissions)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-4">
      <Alert onClose={() => setError('')}>{error}</Alert>
      <p className="text-sm text-slate-600">Leave a field <b>empty</b> if the information is not available. The assistant will then say so instead of guessing.</p>
      {items.map((a) => <AdmissionCard key={a.id + a.status} item={a} onSaved={load} />)}
    </div>
  );
}

// ------------------------------------------------------------------ Notices
function NoticesTab() {
  const [list, setList] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', content: '', category: '', is_published: true });
  const load = useCallback(() => api.notices().then((r) => setList(r.notices)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault(); setError('');
    try { await api.createNotice(form); setForm({ title: '', content: '', category: '', is_published: true }); load(); } catch (err) { setError(err.message); }
  }
  async function toggle(n) {
    setError('');
    try { await api.setNoticePublished(n.id, !n.is_published); load(); } catch (err) { setError(err.message); }
  }
  return (
    <div>
      <Alert onClose={() => setError('')}>{error}</Alert>
      <form onSubmit={create} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6 grid gap-3">
        <h3 className="font-semibold">New notice</h3>
        <input className={field} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <textarea rows={3} className={field} placeholder="Notice text" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
        <input className={field} placeholder="Category (optional, e.g. examination)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} /> Publish now</label>
        <div><button className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`}>Create notice</button></div>
      </form>
      <div className="space-y-2">
        {list.map((n) => (
          <div key={n.id} className="bg-white rounded-xl border border-slate-200 p-3 flex justify-between gap-3">
            <div><div className="font-medium">{n.title} {n.category && <span className="text-xs text-slate-500">({n.category})</span>}</div>
              <div className="text-sm text-slate-600">{n.content}</div>
              <div className="text-xs text-slate-400 mt-1">{n.is_published ? `Published ${n.published_at || ''}` : 'Draft (not visible to users)'}</div></div>
            <button onClick={() => toggle(n)} className={`${btn} border border-slate-300 hover:bg-slate-50 h-fit`}>{n.is_published ? 'Unpublish' : 'Publish'}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Analytics
function AnalyticsTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.analytics().then(setData).catch((e) => setError(e.message)); }, []);
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <p className="text-slate-500">Loading…</p>;
  const cards = [
    ['Conversations', data.totals.conversations], ['Questions asked', data.totals.questions], ['Active users', data.totals.active_users],
    ['Blocked attempts', data.denied_attempts], ['Live documents', data.documents.live], ['Failed documents', data.documents.failed],
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map(([label, value]) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4"><div className="text-2xl font-bold">{value}</div><div className="text-sm text-slate-500">{label}</div></div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold mb-2">What people ask about</h3>
          {data.intents.length === 0 ? <p className="text-sm text-slate-500">No data yet.</p> : (
            <table className="w-full text-sm"><tbody>{data.intents.map((i) => <tr key={i.intent} className="border-t"><td className="py-1">{i.intent}</td><td className="py-1 text-right">{i.count}</td></tr>)}</tbody></table>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold mb-2">Questions per day (last 14 days)</h3>
          {data.questions_per_day.length === 0 ? <p className="text-sm text-slate-500">No data yet.</p> : (
            <table className="w-full text-sm"><tbody>{data.questions_per_day.map((d) => <tr key={d.day} className="border-t"><td className="py-1">{d.day}</td><td className="py-1 text-right">{d.questions}</td></tr>)}</tbody></table>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Page
export default function Admin({ onBack }) {
  const [tab, setTab] = useState('Documents');
  return (
    <div className="min-h-full bg-slate-100">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-indigo-600 hover:underline">← Back to chat</button>
        <h1 className="font-semibold flex-1">⚙ Admin panel: university knowledge base</h1>
      </header>
      <div className="max-w-5xl mx-auto p-4">
        <div className="flex gap-1 mb-4 overflow-x-auto" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 hover:bg-slate-50'}`}>{t}</button>
          ))}
        </div>
        {tab === 'Documents' && <DocumentsTab />}
        {tab === 'Admissions' && <AdmissionsTab />}
        {tab === 'Notices' && <NoticesTab />}
        {tab === 'Analytics' && <AnalyticsTab />}
      </div>
    </div>
  );
}
