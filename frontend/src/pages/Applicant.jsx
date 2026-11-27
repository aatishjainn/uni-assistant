import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import {
  GraduationCap,
  BookOpen,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  XCircle,
  X,
} from '../components/Icons.jsx';

const TABS = [
  { id: 'Apply', label: 'Admission Form', icon: FileText },
  { id: 'Status', label: 'My Applications', icon: CheckCircle2 },
];

const fieldStyle =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/10 transition-all';
const btnPrimary =
  'inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-4 py-2 shadow-2xs disabled:opacity-50 transition-all cursor-pointer';
const btnSecondary =
  'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-1.5 shadow-2xs disabled:opacity-50 transition-all cursor-pointer';

const STATUS_BADGE = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  under_review: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};

const STATUS_LABEL = {
  pending: 'Pending Review',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
};

export default function Applicant({ user, onBack, initialTab = 'Apply' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [courses, setCourses] = useState([]);
  const [applications, setApplications] = useState([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    course_id: '',
    full_name: user?.full_name || '',
    email: user?.email || '',
    phone: '',
    date_of_birth: '',
    gender: 'Male',
    address: '',
    previous_qualification: '',
    previous_institution: '',
    percentage_or_gpa: '',
    passing_year: String(new Date().getFullYear()),
    guardian_name: '',
    guardian_phone: '',
    statement_of_purpose: '',
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cRes, aRes] = await Promise.all([
        api.admissionCourses(),
        api.myAdmissionApplications(),
      ]);
      const openCourses = cRes.courses || [];
      setCourses(openCourses);
      setApplications(aRes.applications || []);
      setUnseenCount(aRes.unseen_decisions_count || 0);
      setForm((prev) => ({
        ...prev,
        course_id: prev.course_id || openCourses[0]?.course_id || '',
      }));
    } catch (err) {
      setError(err.message || 'Failed to load admission portal');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (activeTab !== 'Status' || unseenCount === 0) return;
    setUnseenCount(0);
    api.markAdmissionDecisionsSeen().catch(() => {});
  }, [activeTab, unseenCount]);

  const selectedCourse = courses.find((c) => c.course_id === form.course_id) || null;
  const alreadyAppliedForCourse = applications.some(
    (a) => a.course_id === form.course_id && ['pending', 'under_review', 'approved'].includes(a.status)
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.submitAdmissionApplication({
        ...form,
        percentage_or_gpa: Number(form.percentage_or_gpa),
        passing_year: Number(form.passing_year),
      });
      setSuccess(
        `Admission application ${res.application.application_number} submitted for ${res.application.course_name}! The administration team will review your application.`
      );
      setForm((prev) => ({
        ...prev,
        phone: '',
        date_of_birth: '',
        address: '',
        previous_qualification: '',
        previous_institution: '',
        percentage_or_gpa: '',
        guardian_name: '',
        guardian_phone: '',
        statement_of_purpose: '',
      }));
      await loadAll();
      setActiveTab('Status');
    } catch (err) {
      setError(err.message || 'Failed to submit admission application');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden text-slate-800">
      {/* Top Navbar */}
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
            <span className="p-1 rounded-md bg-amber-100 text-amber-700">
              <GraduationCap className="w-4 h-4" />
            </span>
            <span className="font-semibold text-xs md:text-sm text-slate-900">
              Admissions Portal &middot; Online Application
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {unseenCount > 0 && (
            <button
              onClick={() => setActiveTab('Status')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-all cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
              <span>{unseenCount} Status Update</span>
            </button>
          )}
          <button
            onClick={loadAll}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-60 border-r border-slate-200/80 bg-white p-3 space-y-1 shrink-0 overflow-y-auto hidden md:block">
          <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Applicant Workspace
          </div>
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  active
                    ? 'bg-amber-50 text-amber-800 font-semibold shadow-2xs border border-amber-200/70'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${active ? 'text-amber-600' : 'text-slate-400'}`} />
                  <span>{t.label}</span>
                </div>
                {t.id === 'Status' && unseenCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                    {unseenCount}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        <main className="flex-1 p-4 md:p-6 overflow-y-auto space-y-6">
          {/* Mobile Tabs */}
          <div className="flex md:hidden gap-1.5 overflow-x-auto pb-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium ${
                  activeTab === t.id
                    ? 'bg-amber-600 text-white font-semibold'
                    : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {error && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
              <button onClick={() => setError('')} className="cursor-pointer"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{success}</span>
              </div>
              <button onClick={() => setSuccess('')} className="cursor-pointer"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* TAB 1: ADMISSION APPLICATION FORM */}
          {activeTab === 'Apply' && (
            <div className="max-w-3xl space-y-5 animate-fade-in">
              <div>
                <h1 className="text-lg font-bold text-slate-900">University Admission Application Form</h1>
                <p className="text-xs text-slate-500">
                  Complete your personal and academic details below to apply for an approved degree program.
                </p>
              </div>

              {courses.length === 0 && !loading ? (
                <div className="p-6 rounded-2xl bg-white border border-slate-200 text-xs text-slate-500 text-center">
                  No courses are currently open for admission.
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Course Selection & Info Card */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                      <BookOpen className="w-4 h-4 text-amber-600" />
                      <span>1. Select Program / Course</span>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Course Applying For *</label>
                      <select
                        className={fieldStyle}
                        value={form.course_id}
                        onChange={(e) => setForm({ ...form, course_id: e.target.value })}
                        required
                      >
                        <option value="">Select Course...</option>
                        {courses.map((c) => (
                          <option key={c.course_id} value={c.course_id}>
                            {c.course_name} ({c.department_name} &middot; {c.duration_years} Years)
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedCourse && (
                      <div className="rounded-xl bg-amber-50/50 border border-amber-200/70 p-3 text-[11px] text-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div><strong>Department:</strong> {selectedCourse.department_name}</div>
                        <div><strong>Annual Fee:</strong> {selectedCourse.fee_amount ? `₹${Number(selectedCourse.fee_amount).toLocaleString()}` : 'Not specified'}</div>
                        <div className="sm:col-span-2"><strong>Eligibility:</strong> {selectedCourse.eligibility || 'Contact admissions'}</div>
                        <div><strong>Deadline:</strong> {selectedCourse.application_deadline || 'Open'}</div>
                        <div><strong>Required Docs:</strong> {selectedCourse.required_documents || 'Standard academic records'}</div>
                      </div>
                    )}

                    {alreadyAppliedForCourse && (
                      <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-2.5 text-xs text-indigo-800 flex items-center justify-between gap-2">
                        <span>You already have an active application for <strong>{selectedCourse?.course_name}</strong>.</span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('Status')}
                          className="font-semibold text-indigo-700 hover:underline whitespace-nowrap cursor-pointer"
                        >
                          View Status &rarr;
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Personal Details */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-3">
                    <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      2. Personal Information
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Full Legal Name *</label>
                        <input
                          type="text"
                          required
                          minLength={2}
                          className={fieldStyle}
                          value={form.full_name}
                          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Email Address *</label>
                        <input
                          type="email"
                          required
                          className={fieldStyle}
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Phone Number *</label>
                        <input
                          type="tel"
                          required
                          minLength={7}
                          placeholder="+91-9876543210"
                          className={fieldStyle}
                          value={form.phone}
                          onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Date of Birth *</label>
                        <input
                          type="date"
                          required
                          className={fieldStyle}
                          value={form.date_of_birth}
                          onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Gender *</label>
                        <select
                          className={fieldStyle}
                          value={form.gender}
                          onChange={(e) => setForm({ ...form, gender: e.target.value })}
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                          <option value="Prefer not to say">Prefer not to say</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Guardian Name</label>
                        <input
                          type="text"
                          placeholder="Parent / Guardian full name"
                          className={fieldStyle}
                          value={form.guardian_name}
                          onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Residential Address *</label>
                        <input
                          type="text"
                          required
                          minLength={5}
                          placeholder="Street, City, State, Postal Code"
                          className={fieldStyle}
                          value={form.address}
                          onChange={(e) => setForm({ ...form, address: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Guardian Phone</label>
                        <input
                          type="tel"
                          placeholder="+91-9876500000"
                          className={fieldStyle}
                          value={form.guardian_phone}
                          onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Academic History */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs space-y-3">
                    <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      3. Academic Background
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Previous Qualification *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 10+2 Science / Bachelor's in CS"
                          className={fieldStyle}
                          value={form.previous_qualification}
                          onChange={(e) => setForm({ ...form, previous_qualification: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">School / College Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="Institution name"
                          className={fieldStyle}
                          value={form.previous_institution}
                          onChange={(e) => setForm({ ...form, previous_institution: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Aggregate Percentage (0–100) *</label>
                        <input
                          type="number"
                          required
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="e.g. 85.5"
                          className={fieldStyle}
                          value={form.percentage_or_gpa}
                          onChange={(e) => setForm({ ...form, percentage_or_gpa: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Passing Year *</label>
                        <input
                          type="number"
                          required
                          min="1990"
                          max="2035"
                          className={fieldStyle}
                          value={form.passing_year}
                          onChange={(e) => setForm({ ...form, passing_year: e.target.value })}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Statement of Purpose (Optional)</label>
                        <textarea
                          rows={3}
                          placeholder="Briefly share why you want to join this program and your career goals..."
                          className={fieldStyle}
                          value={form.statement_of_purpose}
                          onChange={(e) => setForm({ ...form, statement_of_purpose: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                      <button
                        type="submit"
                        disabled={submitting || alreadyAppliedForCourse || !form.course_id}
                        className={btnPrimary}
                      >
                        <span>{submitting ? 'Submitting Application...' : 'Submit Admission Application'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* TAB 2: MY APPLICATIONS */}
          {activeTab === 'Status' && (
            <div className="max-w-4xl space-y-5 animate-fade-in">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">My Admission Applications</h1>
                  <p className="text-xs text-slate-500">
                    Track the review progress and administration decisions on your submitted applications.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('Apply')}
                  className={btnPrimary}
                >
                  Apply for Another Course
                </button>
              </div>

              {applications.length === 0 ? (
                <div className="p-8 rounded-2xl bg-white border border-slate-200/80 text-center space-y-3">
                  <FileText className="w-10 h-10 text-amber-500 mx-auto" />
                  <div className="font-bold text-sm text-slate-900">No applications submitted yet</div>
                  <p className="text-xs text-slate-500">Fill out the Admission Form to apply for an approved program.</p>
                  <button type="button" onClick={() => setActiveTab('Apply')} className={btnPrimary}>
                    Open Admission Form
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {applications.map((app) => (
                    <div key={app.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              {app.application_number}
                            </span>
                            <span className="font-bold text-sm text-slate-900">
                              {app.course_name} ({app.department_name})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1">
                            Submitted on {app.created_at} &middot; {app.previous_qualification} ({app.percentage_or_gpa}%)
                          </div>
                        </div>

                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${STATUS_BADGE[app.status] || ''}`}>
                          {STATUS_LABEL[app.status] || app.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-200/60">
                        <div><strong>Applicant:</strong> {app.full_name}</div>
                        <div><strong>Phone:</strong> {app.phone}</div>
                        <div><strong>Institution:</strong> {app.previous_institution} ({app.passing_year})</div>
                      </div>

                      {app.admin_remarks && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          <span className="font-semibold text-slate-900">Administration Remarks: </span>
                          {app.admin_remarks}
                          {app.reviewed_at && <span className="text-[10px] text-slate-400 ml-2">({app.reviewed_at})</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
