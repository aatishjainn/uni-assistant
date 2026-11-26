import { useState } from 'react';
import { INITIAL_HOD_DATA } from '../data/mockData.js';
import {
  Building2,
  Users,
  BookOpen,
  Calendar,
  AlertCircle,
  BarChart3,
  Bell,
  FileText,
  Printer,
  Download,
  Plus,
  CheckCircle2,
  Clock,
  MapPin,
  X,
} from '../components/Icons.jsx';

const TABS = [
  { id: 'Overview', label: 'Department Overview', icon: Building2 },
  { id: 'Faculty', label: 'Faculty & Workload', icon: Users },
  { id: 'Courses', label: 'Courses & Curriculum', icon: BookOpen },
  { id: 'Schedule', label: 'Schedule & Exams', icon: Calendar },
  { id: 'Pending', label: 'Pending Action Items', icon: AlertCircle },
  { id: 'Analytics', label: 'Analytics & Aggregates', icon: BarChart3 },
  { id: 'Notices', label: 'Department Notices', icon: Bell },
  { id: 'Report', label: 'Executive Report', icon: FileText },
];

const fieldStyle =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all';
const btnPrimary =
  'inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-3.5 py-2 shadow-2xs disabled:opacity-50 transition-all cursor-pointer';
const btnSecondary =
  'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-1.5 shadow-2xs disabled:opacity-50 transition-all cursor-pointer';

export default function Hod({ onBack, activeTab: controlledTab, onTabChange }) {
  const [internalTab, setInternalTab] = useState('Overview');
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (t) => {
    setInternalTab(t);
    onTabChange?.(t);
  };

  const [exams, setExams] = useState(INITIAL_HOD_DATA.schedule.examinations);
  const [notices, setNotices] = useState(INITIAL_HOD_DATA.notices);
  const [selectedRooms, setSelectedRooms] = useState({});
  const [success, setSuccess] = useState('');
  const [showExamModal, setShowExamModal] = useState(false);
  const [examForm, setExamForm] = useState({
    subject_code: 'BCA403',
    exam_type: 'Internal Assessment',
    exam_date: '2026-12-18',
    start_time: '10:00',
    end_time: '12:00',
    classroom_id: 'cr-201',
  });
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '', category: 'Academic' });

  const pendingExams = exams.filter((e) => !e.classroom_id);
  const deptName = INITIAL_HOD_DATA.overview.department.name;

  const handleAssignRoom = (examId) => {
    const roomId = selectedRooms[examId] || INITIAL_HOD_DATA.classrooms[0].id;
    const room = INITIAL_HOD_DATA.classrooms.find((c) => c.id === roomId);
    if (!room) return;
    setExams((prev) =>
      prev.map((e) =>
        e.id === examId ? { ...e, classroom_id: room.id, room_number: room.room_number } : e
      )
    );
    setSuccess(`Allocated ${room.room_number} to examination!`);
  };

  const handleScheduleExam = (e) => {
    e.preventDefault();
    const room = INITIAL_HOD_DATA.classrooms.find((c) => c.id === examForm.classroom_id);
    const subjMap = {
      BCA401: 'Database Management Systems',
      BCA402: 'Python Programming',
      BCA403: 'Computer Networks',
      MCA203: 'Machine Learning',
    };
    setExams((prev) => [
      ...prev,
      {
        id: `ex-${Date.now()}`,
        subject_code: examForm.subject_code,
        subject_name: subjMap[examForm.subject_code] || examForm.subject_code,
        exam_type: examForm.exam_type,
        exam_date: examForm.exam_date,
        start_time: examForm.start_time,
        end_time: examForm.end_time,
        classroom_id: room ? room.id : null,
        room_number: room ? room.room_number : null,
      },
    ]);
    setShowExamModal(false);
    setSuccess(`Scheduled ${examForm.exam_type} for ${examForm.subject_code}.`);
  };

  const handleCreateNotice = (e) => {
    e.preventDefault();
    if (!noticeForm.title.trim()) return;
    setNotices((prev) => [
      {
        id: `hn-${Date.now()}`,
        title: noticeForm.title,
        content: noticeForm.content || 'Published via HOD Portal.',
        category: noticeForm.category,
        is_published: true,
        published_at: '2026-11-26',
      },
      ...prev,
    ]);
    setNoticeForm({ title: '', content: '', category: 'Academic' });
    setSuccess('Department notice published.');
  };

  const handleToggleNotice = (id) => {
    setNotices((prev) => prev.map((n) => (n.id === id ? { ...n, is_published: !n.is_published } : n)));
  };

  const downloadMockCsv = () => {
    const rows = [
      ['Subject Code', 'Subject Name', 'Avg Attendance %', 'Avg Marks %'],
      ...INITIAL_HOD_DATA.analytics.subject_breakdown.map((s) => [s.code, s.name, s.attendance, s.avg_marks]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cs_department_executive_report.csv';
    a.click();
    URL.revokeObjectURL(url);
    setSuccess('Exported cs_department_executive_report.csv');
  };

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
            <span className="p-1 rounded-md bg-purple-100 text-purple-700">
              <Building2 className="w-4 h-4" />
            </span>
            <span className="font-semibold text-xs md:text-sm text-slate-900">
              HOD Portal &middot; {deptName}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pendingExams.length > 0 && (
            <button
              onClick={() => setActiveTab('Pending')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-all cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
              <span>{pendingExams.length} Pending Actions</span>
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside
          data-tour="hod-sidebar"
          className="w-60 border-r border-slate-200/80 bg-white p-3 space-y-1 shrink-0 overflow-y-auto hidden md:block"
        >
          <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Department Management
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
                    ? 'bg-purple-50 text-purple-700 font-semibold shadow-2xs border border-purple-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${active ? 'text-purple-600' : 'text-slate-400'}`} />
                  <span>{t.label}</span>
                </div>
                {t.id === 'Pending' && pendingExams.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {pendingExams.length}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        <main className="flex-1 p-4 md:p-6 overflow-y-auto space-y-6">
          <div className="flex md:hidden gap-1.5 overflow-x-auto pb-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium ${
                  activeTab === t.id ? 'bg-purple-600 text-white font-semibold' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{success}</span>
              </div>
              <button onClick={() => setSuccess('')} className="cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {activeTab === 'Overview' && (
            <div className="space-y-6" data-tour="hod-overview">
              <div>
                <h1 className="text-lg font-bold text-slate-900">{deptName} Overview</h1>
                <p className="text-xs text-slate-500">
                  Comprehensive academic, faculty, and student summaries scoped strictly to your department.
                </p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {[
                  ['Faculty Members', INITIAL_HOD_DATA.overview.counts.faculty, Users, 'text-indigo-500'],
                  ['Enrolled Students', INITIAL_HOD_DATA.overview.counts.students, BookOpen, 'text-blue-500'],
                  ['Courses Offered', INITIAL_HOD_DATA.overview.counts.courses, Building2, 'text-purple-500'],
                  ['Curriculum Subjects', INITIAL_HOD_DATA.overview.counts.subjects, FileText, 'text-emerald-500'],
                  ['Upcoming Exams', exams.length, Calendar, 'text-amber-500'],
                  ['Pending Actions', pendingExams.length, AlertCircle, 'text-rose-500'],
                ].map(([label, val, Icon, clr]) => (
                  <div key={label} className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-xs font-medium">{label}</span>
                      <Icon className={`w-4 h-4 ${clr}`} />
                    </div>
                    <div className="text-2xl font-bold text-slate-900">{val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'Faculty' && (
            <div className="space-y-4">
              <h1 className="text-lg font-bold text-slate-900">Faculty &amp; Teaching Workload</h1>
              <div className="grid gap-3">
                {INITIAL_HOD_DATA.faculty.faculty.map((f) => (
                  <div key={f.id} className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-900">{f.full_name}</div>
                      <div className="text-xs text-slate-500">{f.employee_number} · {f.email}</div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {f.subjects.map((s) => (
                          <span key={s.code} className="text-[11px] px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 font-medium">
                            {s.code} · {s.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xl font-bold text-indigo-600">{f.weekly_classes}</div>
                      <div className="text-[11px] text-slate-400">hours / week</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'Courses' && (
            <div className="space-y-4">
              <h1 className="text-lg font-bold text-slate-900">Courses &amp; Curriculum</h1>
              {INITIAL_HOD_DATA.courses.courses.map((c) => (
                <div key={c.id} className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">{c.course_name} Program</h2>
                      <p className="text-xs text-slate-500">{c.duration_years} Years · {c.student_count} Enrolled Students</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold">
                      {c.subjects.length} Key Subjects
                    </span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {c.subjects.map((s) => (
                      <div key={s.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                        <div className="font-semibold text-slate-900">{s.subject_code} · {s.subject_name}</div>
                        <div className="text-[11px] text-slate-500">Semester {s.semester} · {s.teacher}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'Schedule' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h1 className="text-lg font-bold text-slate-900">Schedule &amp; Examinations</h1>
                <button onClick={() => setShowExamModal(true)} className={btnPrimary}>
                  <Plus className="w-3.5 h-3.5" />
                  Schedule New Exam
                </button>
              </div>
              <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2">
                <h2 className="text-xs font-bold text-slate-700 uppercase">Scheduled Examinations</h2>
                <div className="divide-y divide-slate-100">
                  {exams.map((ex) => (
                    <div key={ex.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-slate-900">{ex.subject_code} · {ex.subject_name}</div>
                        <div className="text-slate-500">{ex.exam_type} · {ex.exam_date} ({ex.start_time}–{ex.end_time})</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${ex.room_number ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {ex.room_number || 'Unassigned'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Pending' && (
            <div className="space-y-4" data-tour="hod-pending">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Pending Action Items</h1>
                <p className="text-xs text-slate-500">Allocate classroom venues to upcoming examinations.</p>
              </div>
              {pendingExams.length === 0 ? (
                <div className="p-8 rounded-2xl bg-emerald-50 border border-emerald-200 text-center text-xs text-emerald-800 font-medium">
                  All examinations have assigned classrooms! Zero pending items.
                </div>
              ) : (
                pendingExams.map((ex) => (
                  <div key={ex.id} className="rounded-2xl bg-white border border-rose-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-slate-900">{ex.subject_code} · {ex.exam_type}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                        <Clock className="w-3.5 h-3.5" /> {ex.exam_date} · {ex.start_time}–{ex.end_time}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedRooms[ex.id] || INITIAL_HOD_DATA.classrooms[0].id}
                        onChange={(e) => setSelectedRooms({ ...selectedRooms, [ex.id]: e.target.value })}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs"
                      >
                        {INITIAL_HOD_DATA.classrooms.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.room_number} ({c.building_name})
                          </option>
                        ))}
                      </select>
                      <button onClick={() => handleAssignRoom(ex.id)} className={btnPrimary}>
                        <MapPin className="w-3.5 h-3.5" />
                        Assign Room
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'Analytics' && (
            <div className="space-y-4">
              <h1 className="text-lg font-bold text-slate-900">Department Analytics &amp; Aggregates</h1>
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-white border border-slate-200">
                  <div className="text-xs text-slate-500">Avg Attendance</div>
                  <div className="text-2xl font-bold text-indigo-600">{INITIAL_HOD_DATA.analytics.average_attendance_pct}%</div>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-slate-200">
                  <div className="text-xs text-slate-500">Students At Risk (&lt;75%)</div>
                  <div className="text-2xl font-bold text-rose-600">{INITIAL_HOD_DATA.analytics.at_risk_students}</div>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-slate-200">
                  <div className="text-xs text-slate-500">Avg Internal Marks</div>
                  <div className="text-2xl font-bold text-emerald-600">{INITIAL_HOD_DATA.analytics.average_marks_pct}%</div>
                </div>
              </div>
              <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-2">
                {INITIAL_HOD_DATA.analytics.subject_breakdown.map((s) => (
                  <div key={s.code} className="flex items-center justify-between text-xs py-2 border-b border-slate-100 last:border-0">
                    <span className="font-semibold text-slate-800">{s.code} · {s.name}</span>
                    <div className="flex items-center gap-4">
                      <span>Attendance: <b>{s.attendance}%</b></span>
                      <span>Avg Marks: <b>{s.avg_marks}%</b></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'Notices' && (
            <div className="space-y-5">
              <h1 className="text-lg font-bold text-slate-900">Department Notices</h1>
              <form onSubmit={handleCreateNotice} className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
                <input
                  className={fieldStyle}
                  placeholder="Notice title (e.g. Project Viva Schedule)"
                  value={noticeForm.title}
                  onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })}
                />
                <textarea
                  className={fieldStyle}
                  rows={2}
                  placeholder="Notice details…"
                  value={noticeForm.content}
                  onChange={(e) => setNoticeForm({ ...noticeForm, content: e.target.value })}
                />
                <button type="submit" className={btnPrimary}>
                  <Plus className="w-3.5 h-3.5" />
                  Post Department Notice
                </button>
              </form>
              <div className="space-y-2">
                {notices.map((n) => (
                  <div key={n.id} className="rounded-2xl bg-white border border-slate-200 p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-slate-900">{n.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{n.content}</div>
                    </div>
                    <button onClick={() => handleToggleNotice(n.id)} className={btnSecondary}>
                      {n.is_published ? 'Published' : 'Draft'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'Report' && (
            <div className="space-y-4" data-tour="hod-report">
              <div className="flex items-center justify-between">
                <h1 className="text-lg font-bold text-slate-900">Executive Department Report</h1>
                <div className="flex items-center gap-2">
                  <button onClick={downloadMockCsv} className={btnSecondary}>
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </button>
                  <button onClick={() => window.print()} className={btnPrimary}>
                    <Printer className="w-3.5 h-3.5" /> Print Report
                  </button>
                </div>
              </div>
              <div className="rounded-2xl bg-white border border-slate-200 p-5 text-xs space-y-2">
                <div className="font-bold text-sm text-slate-900">Computer Science Department Summary</div>
                <p className="text-slate-600">
                  Generated for Dr. Meera Sharma. Covers 3 faculty members, 19 enrolled students across BCA &amp; MCA, 82.4% department attendance, and {pendingExams.length} pending venue allocations.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {showExamModal && (
        <div className="fixed inset-0 bg-slate-950/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleScheduleExam} className="bg-white rounded-2xl max-w-md w-full p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Schedule New Exam</h3>
              <button type="button" onClick={() => setShowExamModal(false)}><X className="w-4 h-4" /></button>
            </div>
            <select
              className={fieldStyle}
              value={examForm.subject_code}
              onChange={(e) => setExamForm({ ...examForm, subject_code: e.target.value })}
            >
              <option value="BCA401">BCA401 · Database Management Systems</option>
              <option value="BCA402">BCA402 · Python Programming</option>
              <option value="BCA403">BCA403 · Computer Networks</option>
            </select>
            <input
              className={fieldStyle}
              value={examForm.exam_type}
              onChange={(e) => setExamForm({ ...examForm, exam_type: e.target.value })}
            />
            <input
              type="date"
              className={fieldStyle}
              value={examForm.exam_date}
              onChange={(e) => setExamForm({ ...examForm, exam_date: e.target.value })}
            />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowExamModal(false)} className={btnSecondary}>Cancel</button>
              <button type="submit" className={btnPrimary}>Save Exam</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
