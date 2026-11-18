import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api.js';
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
  AlertCircle,
  X,
  Plus,
  QrCode,
  Users,
  MessageSquare,
  Sparkles,
  ArrowRight,
  ExternalLink,
} from '../components/Icons.jsx';

const TABS = [
  { id: 'Documents', label: 'Documents & RAG', icon: FileText },
  { id: 'Admissions', label: 'Admissions Info', icon: BookOpen },
  { id: 'Notices', label: 'Notices & Bulletin', icon: Bell },
  { id: 'Campus', label: 'Campus Directory & QR', icon: Compass },
  { id: 'Analytics', label: 'Telemetry & Analytics', icon: BarChart3 },
];

const DOC_TYPES = ['syllabus', 'notice', 'policy', 'admission', 'calendar', 'faq', 'handbook', 'other'];

const fieldStyle =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all';
const btnPrimary =
  'inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-2 shadow-2xs disabled:opacity-50 transition-all';
const btnSecondary =
  'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-1.5 shadow-2xs disabled:opacity-50 transition-all';
const btnDanger =
  'inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-700 text-xs font-semibold px-3 py-1.5 transition-all';

function Alert({ kind = 'error', children, onClose }) {
  if (!children) return null;
  const isOk = kind === 'ok';
  return (
    <div
      role="alert"
      className={`mb-4 rounded-xl border p-3 flex items-center justify-between gap-3 text-xs ${
        isOk ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900' : 'border-rose-200 bg-rose-50/80 text-rose-900'
      }`}
    >
      <div className="flex items-center gap-2">
        {isOk ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
        <span>{children}</span>
      </div>
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss alert" className="text-slate-400 hover:text-slate-700">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === 'indexed') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
        Indexed
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
        Failed
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

// ------------------------------------------------------------------ Documents Tab
function DocumentsTab() {
  const [docs, setDocs] = useState([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', document_type: 'policy', visibility: 'public', expires_at: '', approve: true });
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);

  const load = useCallback(() => api.documents().then((r) => setDocs(r.documents)).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  const working = docs.some((d) => d.status === 'pending' || d.status === 'indexing');
  useEffect(() => {
    if (!working) return undefined;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [working, load]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!file) return setError('Please select a valid PDF or DOCX file.');
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
      setInfo('Document uploaded successfully. Parsing and embedding pipeline running in background.');
      setFile(null);
      setFileKey((k) => k + 1);
      setForm({ ...form, title: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const act = (fn) => async () => {
    setError('');
    try {
      await fn();
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert kind="ok" onClose={() => setInfo('')}>{info}</Alert>

      {/* Upload Box */}
      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-900">Ingest Knowledge Document</h3>
          <span className="text-xs text-slate-400">· PDF or DOCX, max 10 MB</span>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <input
              key={fileKey}
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => setFile(e.target.files[0] || null)}
              className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
              Document Title
            </label>
            <input
              className={fieldStyle}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Examination Regulations 2026-27"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
              Category
            </label>
            <select
              className={fieldStyle}
              value={form.document_type}
              onChange={(e) => setForm({ ...form, document_type: e.target.value })}
            >
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
              Role Access Scope
            </label>
            <select
              className={fieldStyle}
              value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value })}
            >
              <option value="public">Public (Students, Applicants, Visitors)</option>
              <option value="staff">Staff Only (Teachers, HODs, Admins)</option>
              <option value="admin">Administrators Only</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
              Expiration Date (Optional)
            </label>
            <input
              type="date"
              className={fieldStyle}
              value={form.expires_at}
              onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
            />
          </div>

          <div className="sm:col-span-2 flex items-center justify-between pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.approve}
                onChange={(e) => setForm({ ...form, approve: e.target.checked })}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Approve immediately (Assistant RAG utilizes approved documents only)</span>
            </label>

            <button type="submit" disabled={busy} className={btnPrimary}>
              {busy ? 'Processing File…' : 'Upload & Index'}
            </button>
          </div>
        </div>
      </form>

      {/* Documents Data Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Document Title</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Access Scope</th>
                <th className="py-3 px-4 text-center">Approved</th>
                <th className="py-3 px-4">Expires</th>
                <th className="py-3 px-4">Chunks</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No documents indexed. Upload a document above to populate the knowledge base.
                  </td>
                </tr>
              ) : (
                docs.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{d.title}</div>
                      <div className="text-[11px] text-slate-400">
                        {d.document_type} · {d.original_filename}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={d.status} />
                      {d.status_detail && (
                        <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1 max-w-[200px]" title={d.status_detail}>
                          {d.status_detail}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                        value={d.visibility}
                        onChange={(e) => act(() => api.updateDocument(d.id, { visibility: e.target.value }))()}
                      >
                        <option value="public">public</option>
                        <option value="staff">staff</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={d.is_approved}
                        aria-label="Approved"
                        onChange={(e) => act(() => api.updateDocument(d.id, { is_approved: e.target.checked }))()}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="py-3 px-4 text-slate-600">{d.expires_at || 'Never'}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">{d.chunk_count}</td>
                    <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        className={btnSecondary}
                        disabled={d.status === 'indexing'}
                        onClick={act(() => api.reindexDocument(d.id))}
                      >
                        <RefreshCw className="w-3 h-3 text-slate-500" />
                        Re-index
                      </button>
                      <button
                        className={btnDanger}
                        onClick={() => {
                          if (window.confirm(`Delete "${d.title}"? This cannot be undone.`)) {
                            act(() => api.deleteDocument(d.id))();
                          }
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Admissions Tab
function AdmissionCard({ item, onSaved }) {
  const [f, setF] = useState(() => ({
    eligibility: item.eligibility || '',
    application_deadline: item.application_deadline || '',
    fee_amount: item.fee_amount ?? '',
    required_documents: item.required_documents || '',
    application_url: item.application_url || '',
    contact_info: item.contact_info || '',
    scholarship_info: item.scholarship_info || '',
    status: item.status,
  }));
  const [msg, setMsg] = useState({ kind: 'ok', text: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setBusy(true);
    setMsg({ kind: 'ok', text: '' });
    try {
      await api.saveAdmission(item.id, {
        ...f,
        fee_amount: f.fee_amount === '' ? '' : Number(f.fee_amount),
      });
      setMsg({ kind: 'ok', text: 'Saved.' });
      onSaved();
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-900">{item.course_name} Program</h3>
        <span
          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
            f.status === 'approved'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : f.status === 'draft'
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-slate-100 text-slate-600 border-slate-200'
          }`}
        >
          {f.status.toUpperCase()}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
            Eligibility Requirements
          </label>
          <textarea rows={2} className={fieldStyle} value={f.eligibility} onChange={set('eligibility')} />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
            Application Deadline
          </label>
          <input type="date" className={fieldStyle} value={f.application_deadline} onChange={set('application_deadline')} />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
            Tuition / Admission Fee (INR)
          </label>
          <input type="number" min="0" className={fieldStyle} value={f.fee_amount} onChange={set('fee_amount')} />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
            Mandatory Documents
          </label>
          <textarea rows={2} className={fieldStyle} value={f.required_documents} onChange={set('required_documents')} />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
            Application Portal URL (https://)
          </label>
          <input className={fieldStyle} value={f.application_url} onChange={set('application_url')} />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
            Admissions Office Contact
          </label>
          <input className={fieldStyle} value={f.contact_info} onChange={set('contact_info')} />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
            Scholarship Guidelines
          </label>
          <textarea rows={2} className={fieldStyle} value={f.scholarship_info} onChange={set('scholarship_info')} />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
            Publication Status
          </label>
          <select className={fieldStyle} value={f.status} onChange={set('status')}>
            <option value="draft">Draft (Hidden from assistant)</option>
            <option value="approved">Approved (Active in assistant)</option>
            <option value="closed">Closed (Expired)</option>
          </select>
        </div>

        <div className="flex items-end justify-between sm:col-span-2 pt-2 border-t border-slate-100">
          <button onClick={save} disabled={busy} className={btnPrimary}>
            {busy ? 'Saving Changes…' : 'Save Admission Details'}
          </button>
          {msg.text && (
            <span className={`text-xs font-medium ${msg.kind === 'error' ? 'text-rose-600' : 'text-emerald-600'}`}>
              {msg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function AdmissionsTab() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const load = useCallback(() => api.admissions().then((r) => setItems(r.admissions)).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <Alert onClose={() => setError('')}>{error}</Alert>
      <div className="text-xs text-slate-500">
        Leave a field empty if specific criteria are not finalized. The assistant will explicitly declare the information as unavailable instead of hallucinating.
      </div>
      {items.map((a) => (
        <AdmissionCard key={a.id + a.status} item={a} onSaved={load} />
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Notices Tab
function NoticesTab() {
  const [list, setList] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', content: '', category: '', is_published: true });
  const load = useCallback(() => api.notices().then((r) => setList(r.notices)).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await api.createNotice(form);
      setForm({ title: '', content: '', category: '', is_published: true });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggle(n) {
    setError('');
    try {
      await api.setNoticePublished(n.id, !n.is_published);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <Alert onClose={() => setError('')}>{error}</Alert>

      {/* New Notice Form */}
      <form onSubmit={create} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-900">Publish Campus Notice</h3>
        </div>

        <input
          className={fieldStyle}
          placeholder="Notice Title (e.g. Mid-Term Examination Schedule Announcement)"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />

        <textarea
          rows={3}
          className={fieldStyle}
          placeholder="Detailed notice text content…"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          required
        />

        <div className="flex items-center justify-between gap-3">
          <input
            className={`${fieldStyle} max-w-xs`}
            placeholder="Category tag (e.g. Examination, Transport, Sports)"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />

          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Publish immediately</span>
          </label>

          <button type="submit" className={btnPrimary}>
            Publish Notice
          </button>
        </div>
      </form>

      {/* Notices Stream */}
      <div className="space-y-2.5">
        {list.map((n) => (
          <div
            key={n.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs flex items-start justify-between gap-4"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm">{n.title}</span>
                {n.category && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                    {n.category}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-600 leading-relaxed">{n.content}</div>
              <div className="text-[11px] text-slate-400">
                {n.is_published ? `Published on ${n.published_at || 'recently'}` : 'Unpublished draft'}
              </div>
            </div>

            <button
              onClick={() => toggle(n)}
              className={n.is_published ? btnSecondary : btnPrimary}
            >
              {n.is_published ? 'Unpublish' : 'Publish'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Campus Tab
const qrUrl = (token) => `${window.location.origin}/#map?at=${token}`;

function QrModal({ qr, onClose }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(qrUrl(qr.qr_code), { width: 220, margin: 1 }).then(setSrc);
  }, [qr]);

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 text-center max-w-xs shadow-xl border border-slate-200" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-slate-900 text-sm mb-0.5">{qr.node_name}</h3>
        <p className="text-xs text-slate-400 mb-4">{qr.building_name} · Floor {qr.floor_number}</p>
        {src && <img src={src} className="mx-auto rounded-lg border border-slate-100" alt="QR Code" width={200} height={200} />}
        <p className="text-[10px] text-slate-400 font-mono mt-3 break-all">{qrUrl(qr.qr_code)}</p>
        <button onClick={onClose} className={`${btnPrimary} w-full mt-4 justify-center`}>
          Close Preview
        </button>
      </div>
    </div>
  );
}

function CampusTab() {
  const [buildings, setBuildings] = useState([]);
  const [places, setPlaces] = useState([]);
  const [error, setError] = useState('');
  const [qr, setQr] = useState(null);

  const load = useCallback(async () => {
    try {
      const [b, p] = await Promise.all([api.adminBuildings(), api.adminPlaces()]);
      setBuildings(b.buildings);
      setPlaces(p.places);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function printAll() {
    const w = window.open('', '_blank');
    if (!w) return setError('Allow browser pop-ups to generate print cards.');
    const cards = [];
    for (const p of places.filter((x) => x.qr_code)) {
      const img = await QRCode.toDataURL(qrUrl(p.qr_code), { width: 220, margin: 1 });
      cards.push(
        `<div style="width:190px;border:1px solid #ccc;padding:12px;text-align:center;border-radius:8px;font-family:sans-serif;page-break-inside:avoid">
          <img src="${img}" width="160" height="160">
          <div style="font-weight:bold;margin-top:6px;font-size:13px">${p.node_name}</div>
          <div style="font-size:11px;color:#666">${p.building_name} · Floor ${p.floor_number}</div>
        </div>`
      );
    }
    w.document.write(`<!doctype html><title>Campus QR Print Cards</title><div style="display:flex;flex-wrap:wrap;gap:12px">${cards.join('')}</div>`);
    w.document.close();
    w.focus();
    w.print();
  }

  return (
    <div className="space-y-6">
      <Alert onClose={() => setError('')}>{error}</Alert>

      {/* Buildings Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
        <h3 className="text-sm font-bold text-slate-900">Campus Buildings Geolocation</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-2.5 px-3">Building Name</th>
                <th className="py-2.5 px-3">Latitude</th>
                <th className="py-2.5 px-3">Longitude</th>
                <th className="py-2.5 px-3">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {buildings.map((b) => (
                <tr key={b.id}>
                  <td className="py-2.5 px-3 font-semibold text-slate-900">{b.building_name}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-600">{b.latitude}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-600">{b.longitude}</td>
                  <td className="py-2.5 px-3 text-slate-500">{b.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Places Directory */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Rooms & Navigation QR Tokens</h3>
          <button onClick={printAll} className={btnSecondary}>
            <QrCode className="w-3.5 h-3.5 text-indigo-600" />
            Print All QR Placards
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-2.5 px-3">Location</th>
                <th className="py-2.5 px-3">Room / Node Name</th>
                <th className="py-2.5 px-3">Search Keywords</th>
                <th className="py-2.5 px-3 text-center">Public Visibility</th>
                <th className="py-2.5 px-3 text-right">QR Token</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {places.map((p) => (
                <tr key={p.id}>
                  <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                    {p.building_name} · Floor {p.floor_number}
                  </td>
                  <td className="py-2.5 px-3 font-semibold text-slate-900">{p.node_name}</td>
                  <td className="py-2.5 px-3 text-slate-500">{p.keywords || '—'}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        p.is_public ? 'bg-emerald-50 text-emerald-700' : 'bg-purple-50 text-purple-700'
                      }`}
                    >
                      {p.is_public ? 'Public' : 'Staff Only'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {p.qr_code && (
                      <button onClick={() => setQr(p)} className={btnSecondary}>
                        <QrCode className="w-3 h-3 text-indigo-600" />
                        Preview QR
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {qr && <QrModal qr={qr} onClose={() => setQr(null)} />}
    </div>
  );
}

// ------------------------------------------------------------------ Analytics Tab
function AnalyticsTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.analytics().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <div className="p-8 text-center text-xs text-slate-400">Loading metrics…</div>;

  const statCards = [
    { label: 'Total Conversations', value: data.totals.conversations, icon: MessageSquare, color: 'text-indigo-600' },
    { label: 'User Questions Asked', value: data.totals.questions, icon: Sparkles, color: 'text-blue-600' },
    { label: 'Active Users', value: data.totals.active_users, icon: Users, color: 'text-emerald-600' },
    { label: 'Blocked Privacy Attempts', value: data.denied_attempts, icon: ShieldCheck, color: 'text-amber-600' },
    { label: 'Indexed Documents', value: data.documents.live, icon: FileText, color: 'text-teal-600' },
    { label: 'Failed Documents', value: data.documents.failed, icon: AlertCircle, color: 'text-rose-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
        {statCards.map((c, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">{c.label}</span>
              <c.icon className={`w-4 h-4 ${c.color}`} />
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Tables Breakdown */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Intent Distribution */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
          <h3 className="text-sm font-bold text-slate-900">User Intent Distribution</h3>
          {data.intents.length === 0 ? (
            <p className="text-xs text-slate-400">No intent telemetry recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {data.intents.map((item) => (
                <div key={item.intent} className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
                  <span className="font-mono text-slate-700">{item.intent}</span>
                  <span className="font-bold text-slate-900 px-2 py-0.5 rounded-md bg-slate-100">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 14-Day Question Volume */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Query Activity (Last 14 Days)</h3>
          {data.questions_per_day.length === 0 ? (
            <p className="text-xs text-slate-400">No telemetry recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {data.questions_per_day.map((d) => (
                <div key={d.day} className="flex items-center justify-between text-xs py-1 border-b border-slate-100">
                  <span className="text-slate-600">{d.day}</span>
                  <span className="font-semibold text-indigo-600">{d.questions} questions</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Root Admin Page
export default function Admin({ onBack }) {
  const [tab, setTab] = useState('Documents');

  return (
    <div className="min-h-full flex flex-col bg-slate-50">
      <header className="h-14 bg-white border-b border-slate-200/80 px-4 md:px-8 flex items-center justify-between gap-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className={btnSecondary}>
            ← Return to Chat
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-rose-600" />
            <h1 className="font-semibold text-slate-900 text-sm tracking-tight">Institutional Administration Center</h1>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-8 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex gap-1.5 p-1 rounded-2xl bg-slate-200/60 border border-slate-200 overflow-x-auto text-xs font-semibold">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all whitespace-nowrap ${
                  active
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                }`}
              >
                <t.icon className={`w-3.5 h-3.5 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {tab === 'Documents' && <DocumentsTab />}
        {tab === 'Admissions' && <AdmissionsTab />}
        {tab === 'Notices' && <NoticesTab />}
        {tab === 'Campus' && <CampusTab />}
        {tab === 'Analytics' && <AnalyticsTab />}
      </div>
    </div>
  );
}
