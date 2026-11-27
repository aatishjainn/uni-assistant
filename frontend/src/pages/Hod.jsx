import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
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
  RefreshCw,
  ArrowRight,
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
  'inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-3.5 py-2 shadow-2xs disabled:opacity-50 transition-all';
const btnSecondary =
  'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-1.5 shadow-2xs disabled:opacity-50 transition-all';

export default function Hod({ onBack }) {
  const [activeTab, setActiveTab] = useState('Overview');
  const [overview, setOverview] = useState(null);
  const [facultyData, setFacultyData] = useState(null);
  const [coursesData, setCoursesData] = useState(null);
  const [scheduleData, setScheduleData] = useState(null);
  const [pendingData, setPendingData] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [noticesData, setNoticesData] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Notice form
  const [noticeForm, setNoticeForm] = useState({ title: '', content: '', category: 'General', is_published: true });
  const [creatingNotice, setCreatingNotice] = useState(false);

  // Classroom allocation & exam scheduling
  const [classrooms, setClassrooms] = useState([]);
  const [selectedRooms, setSelectedRooms] = useState({});
  const [assigningRoomId, setAssigningRoomId] = useState(null);

  // Pending task faculty assignment (exam grading & subject coverage)
  const [selectedGradingFaculty, setSelectedGradingFaculty] = useState({});
  const [assigningGradingId, setAssigningGradingId] = useState(null);
  const [selectedSubjectFaculty, setSelectedSubjectFaculty] = useState({});
  const [assigningSubjectId, setAssigningSubjectId] = useState(null);
  const [remindingAttendanceId, setRemindingAttendanceId] = useState(null);
  const [timetableForms, setTimetableForms] = useState({});
  const [schedulingTimetableId, setSchedulingTimetableId] = useState(null);

  const [showExamModal, setShowExamModal] = useState(false);
  const [schedulingExam, setSchedulingExam] = useState(false);
  const [examForm, setExamForm] = useState({
    subject_id: '',
    exam_type: 'Internal Assessment',
    exam_date: '',
    start_time: '10:00',
    end_time: '12:00',
    classroom_id: '',
  });

  const [showSlotModal, setShowSlotModal] = useState(false);
  const [schedulingSlot, setSchedulingSlot] = useState(false);
  const [slotClashError, setSlotClashError] = useState('');
  const [slotForm, setSlotForm] = useState({
    subject_id: '',
    faculty_id: '',
    classroom_id: '',
    day_of_week: '1',
    start_time: '09:00',
    end_time: '10:00',
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ov, fc, cr, sc, pd, an, nt, cl] = await Promise.all([
        api.hodOverview(),
        api.hodFaculty(),
        api.hodCourses(),
        api.hodScheduleExams(),
        api.hodPending(),
        api.hodAnalytics(),
        api.hodNotices(),
        api.hodClassrooms().catch(() => []),
      ]);
      setOverview(ov);
      setFacultyData(fc);
      setCoursesData(cr);
      setScheduleData(sc);
      setPendingData(pd);
      setAnalyticsData(an);
      setNoticesData(nt);
      setClassrooms(cl || []);
    } catch (err) {
      setError(err.message || 'Failed to load department data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const loadReport = async () => {
    try {
      const r = await api.hodReport();
      setReportData(r);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (activeTab === 'Report') loadReport();
  }, [activeTab]);

  const handleCreateNotice = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await api.createHodNotice(noticeForm);
      setSuccess('Department notice posted successfully.');
      setNoticeForm({ title: '', content: '', category: 'General', is_published: true });
      setCreatingNotice(false);
      const nt = await api.hodNotices();
      setNoticesData(nt);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleNotice = async (id, currentStatus) => {
    try {
      await api.toggleHodNotice(id, !currentStatus);
      const nt = await api.hodNotices();
      setNoticesData(nt);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAssignRoom = async (examId) => {
    const roomId = selectedRooms[examId];
    if (!roomId) return;
    setAssigningRoomId(examId);
    setError('');
    setSuccess('');
    try {
      await api.assignHodExamRoom(examId, roomId);
      setSuccess('Classroom venue allocated successfully to examination!');
      await loadAll();
    } catch (err) {
      setError(err.message || 'Failed to allocate classroom');
    } finally {
      setAssigningRoomId(null);
    }
  };

  const handleAssignGrading = async (examId, fallbackFacultyId = '') => {
    const facultyId = selectedGradingFaculty[examId] ?? fallbackFacultyId;
    if (!facultyId) return;
    setAssigningGradingId(examId);
    setError('');
    setSuccess('');
    try {
      const res = await api.assignHodExamGrading(examId, facultyId);
      const assigneeName = res?.examination?.grading_faculty_name || 'selected faculty';
      setSuccess(`Exam grading task assigned to ${assigneeName}. They can now enter marks from their Faculty Portal.`);
      await loadAll();
    } catch (err) {
      setError(err.message || 'Failed to assign grading task');
    } finally {
      setAssigningGradingId(null);
    }
  };

  const handleAssignSubjectFaculty = async (subjectId) => {
    const facultyId = selectedSubjectFaculty[subjectId];
    if (!facultyId) return;
    setAssigningSubjectId(subjectId);
    setError('');
    setSuccess('');
    try {
      const res = await api.assignHodSubjectFaculty(subjectId, facultyId);
      setSuccess(`Subject assigned to ${res?.faculty_name || 'faculty member'} successfully.`);
      await loadAll();
    } catch (err) {
      setError(err.message || 'Failed to assign faculty to subject');
    } finally {
      setAssigningSubjectId(null);
    }
  };

  const handleRemindAttendance = async (subjectId, weekStart) => {
    setRemindingAttendanceId(subjectId);
    setError('');
    setSuccess('');
    try {
      const res = await api.remindHodAttendance(subjectId, weekStart);
      setSuccess(
        `Weekly attendance reminder sent to ${res.faculty_name} for ${res.subject_code} (Week of ${res.week_start}).`
      );
      await loadAll();
    } catch (err) {
      setError(err.message || 'Failed to send attendance reminder');
    } finally {
      setRemindingAttendanceId(null);
    }
  };

  const handleScheduleTimetableSlot = async (subject) => {
    const form = timetableForms[subject.id] || {};
    const faculty_id = form.faculty_id ?? subject.faculty_id ?? '';
    const classroom_id = form.classroom_id || '';
    const day_of_week = Number(form.day_of_week || 4);
    const start_time = form.start_time || '10:00';
    const end_time = form.end_time || '11:00';

    if (!faculty_id || !classroom_id) {
      setError('Please select both a faculty member and a classroom to schedule the timetable slot.');
      return;
    }

    setSchedulingTimetableId(subject.id);
    setError('');
    setSuccess('');
    try {
      const res = await api.scheduleHodTimetable(subject.id, {
        faculty_id,
        classroom_id,
        day_of_week,
        start_time,
        end_time,
      });
      setSuccess(
        `Scheduled weekly class for ${res.timetable?.subject_code || subject.subject_code} (${start_time}-${end_time} in ${res.timetable?.room_number || 'room'}).`
      );
      await loadAll();
    } catch (err) {
      setError(err.message || 'Failed to schedule timetable slot');
    } finally {
      setSchedulingTimetableId(null);
    }
  };

  const handleAddClassSlot = async (e) => {
    e.preventDefault();
    if (!slotForm.subject_id || !slotForm.faculty_id || !slotForm.classroom_id) {
      setSlotClashError('Please choose subject, faculty, and classroom.');
      return;
    }
    setSchedulingSlot(true);
    setSlotClashError('');
    setError('');
    setSuccess('');
    try {
      const res = await api.scheduleHodTimetable(slotForm.subject_id, {
        faculty_id: slotForm.faculty_id,
        classroom_id: slotForm.classroom_id,
        day_of_week: Number(slotForm.day_of_week),
        start_time: slotForm.start_time,
        end_time: slotForm.end_time,
      });
      setSuccess(
        `Class slot added: ${res.timetable?.subject_code || ''} (${slotForm.start_time}-${slotForm.end_time} in ${res.timetable?.room_number || 'room'}).`
      );
      setShowSlotModal(false);
      await loadAll();
    } catch (err) {
      setSlotClashError(err.message || 'Class time slot clashes with an existing class');
    } finally {
      setSchedulingSlot(false);
    }
  };

  const handleScheduleExam = async (e) => {
    e.preventDefault();
    if (!examForm.subject_id || !examForm.exam_type || !examForm.exam_date || !examForm.start_time || !examForm.end_time) {
      setError('Please fill in all required examination fields');
      return;
    }
    setSchedulingExam(true);
    setError('');
    setSuccess('');
    try {
      await api.scheduleHodExam({
        subject_id: examForm.subject_id,
        exam_type: examForm.exam_type,
        exam_date: examForm.exam_date,
        start_time: examForm.start_time,
        end_time: examForm.end_time,
        classroom_id: examForm.classroom_id || null,
      });
      setSuccess('New test/examination scheduled successfully!');
      setShowExamModal(false);
      setExamForm({
        subject_id: '',
        exam_type: 'Internal Assessment',
        exam_date: '',
        start_time: '10:00',
        end_time: '12:00',
        classroom_id: '',
      });
      await loadAll();
    } catch (err) {
      setError(err.message || 'Failed to schedule examination');
    } finally {
      setSchedulingExam(false);
    }
  };

  const handleDownloadCsv = () => {
    window.open(api.hodReportCsvUrl(), '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  const deptName = overview?.department?.name || 'Department';

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden text-slate-800">
      {/* Top Navbar */}
      <header className="h-14 border-b border-slate-200/90 px-4 md:px-6 flex items-center justify-between gap-3 bg-white/95 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors p-1.5 rounded-lg hover:bg-slate-100"
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
          {pendingData?.total_pending_count > 0 && (
            <button
              onClick={() => setActiveTab('Pending')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-all"
            >
              <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
              <span>{pendingData.total_pending_count} Pending Actions</span>
            </button>
          )}
          <button
            onClick={loadAll}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            title="Refresh data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Workspace Layout with Sidebar Tabs */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-60 border-r border-slate-200/80 bg-white p-3 space-y-1 shrink-0 overflow-y-auto hidden md:block">
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
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  active
                    ? 'bg-purple-50 text-purple-700 font-semibold shadow-2xs border border-purple-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${active ? 'text-purple-600' : 'text-slate-400'}`} />
                  <span>{t.label}</span>
                </div>
                {t.id === 'Pending' && pendingData?.total_pending_count > 0 && (
                  <span className="w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {pendingData.total_pending_count}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto space-y-6">
          {/* Mobile Tab Pills */}
          <div className="flex md:hidden gap-1.5 overflow-x-auto pb-2 scrollbar-none">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium ${
                  activeTab === t.id
                    ? 'bg-purple-600 text-white font-semibold'
                    : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Feedback banners */}
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
              <button onClick={() => setError('')}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{success}</span>
              </div>
              <button onClick={() => setSuccess('')}><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'Overview' && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h1 className="text-lg font-bold text-slate-900">{deptName} Overview</h1>
                <p className="text-xs text-slate-500">
                  Comprehensive academic, faculty, and student summaries for your department.
                </p>
              </div>

              {/* Metric Cards Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-medium">Faculty Members</span>
                    <Users className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900">{overview?.counts?.faculty ?? '—'}</div>
                  <p className="text-[11px] text-slate-400">Teaching faculty in department</p>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-medium">Enrolled Students</span>
                    <BookOpen className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900">{overview?.counts?.students ?? '—'}</div>
                  <p className="text-[11px] text-slate-400">Total active students enrolled</p>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-medium">Courses Offered</span>
                    <Building2 className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900">{overview?.counts?.courses ?? '—'}</div>
                  <p className="text-[11px] text-slate-400">Degree programs administered</p>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-medium">Curriculum Subjects</span>
                    <FileText className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900">{overview?.counts?.subjects ?? '—'}</div>
                  <p className="text-[11px] text-slate-400">Across all semesters</p>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-medium">Upcoming Exams</span>
                    <Calendar className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900">{overview?.counts?.upcoming_exams ?? '—'}</div>
                  <p className="text-[11px] text-slate-400">Scheduled on academic calendar</p>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-xs font-medium">Pending Actions</span>
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                  </div>
                  <div className={`text-2xl font-bold ${(overview?.counts?.pending_activities || 0) > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                    {overview?.counts?.pending_activities ?? '—'}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <p className="text-[11px] text-slate-400">Marks missing or rooms unassigned</p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('Pending')}
                      className="text-[11px] font-semibold text-purple-600 hover:text-purple-700 whitespace-nowrap cursor-pointer"
                    >
                      Work on items &rarr;
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Glance Sections */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Courses Quick List */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Courses & Programs</h2>
                    <button onClick={() => setActiveTab('Courses')} className="text-xs font-semibold text-purple-600 hover:text-purple-700">
                      View all &rarr;
                    </button>
                  </div>
                  <div className="space-y-2">
                    {coursesData?.courses?.map((c) => (
                      <div key={c.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-slate-900">{c.course_name}</div>
                          <div className="text-slate-400 text-[11px]">{c.duration_years} Years &middot; {c.subject_count} Subjects</div>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-slate-800">{c.student_count}</span>
                          <span className="text-slate-400 text-[11px] ml-1">students</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Faculty Quick List */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Department Faculty</h2>
                    <button onClick={() => setActiveTab('Faculty')} className="text-xs font-semibold text-purple-600 hover:text-purple-700">
                      View all &rarr;
                    </button>
                  </div>
                  <div className="space-y-2">
                    {facultyData?.faculty?.map((f) => (
                      <div key={f.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-slate-900">{f.full_name}</div>
                          <div className="text-slate-400 text-[11px]">{f.employee_number} &middot; {f.email}</div>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-indigo-600">{f.weekly_classes}</span>
                          <span className="text-slate-400 text-[11px] ml-1">hrs/wk</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FACULTY & WORKLOAD */}
          {activeTab === 'Faculty' && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Faculty & Assigned Subjects</h1>
                <p className="text-xs text-slate-500">
                  Review faculty members, teaching allocations, and weekly lecture schedules.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="p-3.5">Employee ID</th>
                      <th className="p-3.5">Name & Email</th>
                      <th className="p-3.5">Assigned Subjects</th>
                      <th className="p-3.5 text-center">Weekly Hours</th>
                      <th className="p-3.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {facultyData?.faculty?.map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50/50">
                        <td className="p-3.5 font-mono text-[11px] font-semibold text-slate-700">{f.employee_number}</td>
                        <td className="p-3.5">
                          <div className="font-semibold text-slate-900">{f.full_name}</div>
                          <div className="text-slate-400 text-[11px]">{f.email}</div>
                        </td>
                        <td className="p-3.5">
                          <div className="flex flex-wrap gap-1">
                            {f.subjects?.length > 0 ? (
                              f.subjects.map((s, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200/60 text-[11px] font-medium"
                                >
                                  {s.subject_code} &middot; {s.subject_name}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">No subjects assigned</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3.5 text-center font-bold text-slate-800">{f.weekly_classes} hrs</td>
                        <td className="p-3.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              f.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {f.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: COURSES & CURRICULUM */}
          {activeTab === 'Courses' && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Courses Offered & Curriculum</h1>
                <p className="text-xs text-slate-500">
                  Degree programs, semester subjects, and faculty assignments.
                </p>
              </div>

              {/* Course summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {coursesData?.courses?.map((c) => (
                  <div key={c.id} className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-900">{c.course_name}</span>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-semibold">
                        {c.duration_years} Years
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                      <span>{c.student_count} Enrolled Students</span>
                      <span>{c.subject_count} Subjects</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Subjects Table */}
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                <div className="p-3.5 bg-slate-50 border-b border-slate-200/80 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Curriculum Subjects by Semester
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/50 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Course</th>
                      <th className="p-3">Sem</th>
                      <th className="p-3">Code</th>
                      <th className="p-3">Subject Name</th>
                      <th className="p-3">Assigned Faculty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {coursesData?.subjects?.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-semibold text-purple-700">{s.course_name}</td>
                        <td className="p-3 font-medium text-slate-600">Sem {s.semester}</td>
                        <td className="p-3 font-mono font-semibold text-slate-800">{s.subject_code}</td>
                        <td className="p-3 text-slate-800 font-medium">{s.subject_name}</td>
                        <td className="p-3">
                          {s.assigned_faculty ? (
                            <span className="font-medium text-slate-700">{s.assigned_faculty}</span>
                          ) : (
                            <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-semibold border border-amber-200">
                              Unassigned
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: SCHEDULE & EXAMS */}
          {activeTab === 'Schedule' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">Department Schedule & Examinations</h1>
                  <p className="text-xs text-slate-500">
                    Weekly class timetables and mid/final semester examination schedules.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExamModal(!showExamModal)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-3.5 py-2 shadow-2xs transition-all cursor-pointer self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showExamModal ? 'Close Form' : 'Schedule Test / Exam'}</span>
                </button>
              </div>

              {/* Schedule Exam Modal / Form */}
              {showExamModal && (
                <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 shadow-2xs space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-purple-900 uppercase tracking-wider">
                      Schedule New Examination or Assessment
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowExamModal(false)}
                      className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-purple-100/50 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <form onSubmit={handleScheduleExam} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Curriculum Subject *</label>
                      <select
                        className={fieldStyle}
                        value={examForm.subject_id}
                        onChange={(e) => setExamForm({ ...examForm, subject_id: e.target.value })}
                        required
                      >
                        <option value="">Select Department Subject...</option>
                        {coursesData?.subjects?.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.subject_code} - {s.subject_name} ({s.course_name}, Sem {s.semester})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Assessment / Exam Type *</label>
                      <select
                        className={fieldStyle}
                        value={examForm.exam_type}
                        onChange={(e) => setExamForm({ ...examForm, exam_type: e.target.value })}
                        required
                      >
                        <option value="Internal Assessment">Internal Assessment</option>
                        <option value="Mid-Semester Exam">Mid-Semester Exam</option>
                        <option value="Unit Test 1">Unit Test 1</option>
                        <option value="Unit Test 2">Unit Test 2</option>
                        <option value="Special Practical Assessment">Special Practical Assessment</option>
                        <option value="Executive Viva Voce">Executive Viva Voce</option>
                        <option value="End-Semester Examination">End-Semester Examination</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Date *</label>
                      <input
                        type="date"
                        className={fieldStyle}
                        value={examForm.exam_date}
                        onChange={(e) => setExamForm({ ...examForm, exam_date: e.target.value })}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Start Time (HH:MM) *</label>
                      <input
                        type="time"
                        className={fieldStyle}
                        value={examForm.start_time}
                        onChange={(e) => setExamForm({ ...examForm, start_time: e.target.value })}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">End Time (HH:MM) *</label>
                      <input
                        type="time"
                        className={fieldStyle}
                        value={examForm.end_time}
                        onChange={(e) => setExamForm({ ...examForm, end_time: e.target.value })}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Classroom / Venue</label>
                      <select
                        className={fieldStyle}
                        value={examForm.classroom_id}
                        onChange={(e) => setExamForm({ ...examForm, classroom_id: e.target.value })}
                      >
                        <option value="">Leave unallocated (Assign venue later)</option>
                        {classrooms.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.room_number} &middot; {c.building_name} (Floor {c.floor_number})
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1">
                        If left unallocated, this will appear in your Pending Action Items.
                      </p>
                    </div>

                    <div className="md:col-span-2 lg:col-span-3 flex items-center justify-end gap-2 pt-2 border-t border-purple-200/50">
                      <button
                        type="button"
                        onClick={() => setShowExamModal(false)}
                        className={btnSecondary}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={schedulingExam}
                        className={btnPrimary}
                      >
                        {schedulingExam ? 'Scheduling...' : 'Schedule Examination'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Examinations List */}
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                <div className="p-3.5 bg-slate-50 border-b border-slate-200/80 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Department Examinations
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/50 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Exam Date & Time</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Course & Subject</th>
                      <th className="p-3">Classroom / Hall</th>
                      <th className="p-3">Grading Assignee</th>
                      <th className="p-3 text-center">Marks Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scheduleData?.examinations?.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/50">
                        <td className="p-3">
                          <div className="font-semibold text-slate-900">{e.exam_date}</div>
                          <div className="text-slate-400 text-[11px]">{e.start_time} - {e.end_time}</div>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-semibold border border-indigo-200">
                            {e.exam_type}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-slate-800">{e.subject_code} &middot; {e.subject_name}</div>
                          <div className="text-slate-400 text-[11px]">{e.course_name} (Sem {e.semester})</div>
                        </td>
                        <td className="p-3">
                          {e.missing_room ? (
                            <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[11px] font-bold border border-rose-200">
                              No Room Assigned
                            </span>
                          ) : (
                            <div className="text-slate-700 font-medium">
                              {e.room_number} <span className="text-slate-400 text-[11px]">({e.building_name})</span>
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          {e.grading_faculty_name ? (
                            <div>
                              <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[11px] font-semibold border border-purple-200">
                                {e.grading_faculty_name}
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setActiveTab('Pending')}
                              className="text-[11px] font-medium text-slate-400 hover:text-purple-600 cursor-pointer"
                            >
                              Unassigned
                            </button>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {e.marks_entered >= e.total_enrolled && e.total_enrolled > 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-200">
                              Marks Entered ({e.marks_entered}/{e.total_enrolled})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-semibold border border-amber-200">
                              Pending ({e.marks_entered}/{e.total_enrolled})
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Timetable slots */}
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                <div className="p-3.5 bg-slate-50 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Weekly Class Timetable
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSlotModal(!showSlotModal);
                      setSlotClashError('');
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-semibold px-3 py-1.5 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{showSlotModal ? 'Close Slot Form' : 'Schedule Class Slot'}</span>
                  </button>
                </div>

                {showSlotModal && (
                  <form onSubmit={handleAddClassSlot} className="p-4 bg-purple-50/50 border-b border-purple-200 space-y-3">
                    <div className="text-xs font-bold text-purple-900 uppercase tracking-wider">
                      Add Weekly Class Slot (Checks Room, Faculty &amp; Student Batch Clashes)
                    </div>

                    {slotClashError && (
                      <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <span>{slotClashError}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Subject *</label>
                        <select
                          className={fieldStyle}
                          value={slotForm.subject_id}
                          onChange={(e) => setSlotForm({ ...slotForm, subject_id: e.target.value })}
                          required
                        >
                          <option value="">Select Subject...</option>
                          {coursesData?.subjects?.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.subject_code} - {s.subject_name} ({s.course_name} Sem {s.semester})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Faculty *</label>
                        <select
                          className={fieldStyle}
                          value={slotForm.faculty_id}
                          onChange={(e) => setSlotForm({ ...slotForm, faculty_id: e.target.value })}
                          required
                        >
                          <option value="">Select Faculty...</option>
                          {(facultyData?.faculty || []).filter((f) => f.is_active !== false).map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.full_name} ({f.employee_number})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Classroom *</label>
                        <select
                          className={fieldStyle}
                          value={slotForm.classroom_id}
                          onChange={(e) => setSlotForm({ ...slotForm, classroom_id: e.target.value })}
                          required
                        >
                          <option value="">Select Classroom...</option>
                          {classrooms.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.room_number} &middot; {c.building_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Day of Week *</label>
                        <select
                          className={fieldStyle}
                          value={slotForm.day_of_week}
                          onChange={(e) => setSlotForm({ ...slotForm, day_of_week: e.target.value })}
                        >
                          <option value="1">Monday</option>
                          <option value="2">Tuesday</option>
                          <option value="3">Wednesday</option>
                          <option value="4">Thursday</option>
                          <option value="5">Friday</option>
                          <option value="6">Saturday</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">Start Time *</label>
                        <input
                          type="time"
                          className={fieldStyle}
                          value={slotForm.start_time}
                          onChange={(e) => setSlotForm({ ...slotForm, start_time: e.target.value })}
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">End Time *</label>
                        <input
                          type="time"
                          className={fieldStyle}
                          value={slotForm.end_time}
                          onChange={(e) => setSlotForm({ ...slotForm, end_time: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowSlotModal(false);
                          setSlotClashError('');
                        }}
                        className={btnSecondary}
                      >
                        Cancel
                      </button>
                      <button type="submit" disabled={schedulingSlot} className={btnPrimary}>
                        {schedulingSlot ? 'Checking & Saving...' : 'Add Class Slot'}
                      </button>
                    </div>
                  </form>
                )}

                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {scheduleData?.timetable?.map((t) => (
                    <div key={t.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 text-xs space-y-1">
                      <div className="flex items-center justify-between font-semibold text-slate-900">
                        <span>{['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][t.day_of_week]}</span>
                        <span className="text-indigo-600 font-mono text-[11px]">{t.start_time} - {t.end_time}</span>
                      </div>
                      <div className="font-medium text-slate-800">{t.subject_code} &middot; {t.subject_name}</div>
                      <div className="text-slate-500 text-[11px]">{t.teacher_name}</div>
                      <div className="text-slate-400 text-[11px] flex items-center gap-1 pt-1 border-t border-slate-200/40">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{t.room_number} ({t.building_name}, Floor {t.floor_number})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PENDING ACTION ITEMS */}
          {activeTab === 'Pending' && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Department Pending Activities</h1>
                <p className="text-xs text-slate-500">
                  Critical operational bottlenecks: unassigned exam venues, missing student marks, and uncovered curriculum.
                </p>
              </div>

              {pendingData?.total_pending_count === 0 ? (
                <div className="p-8 rounded-2xl bg-white border border-slate-200/80 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                  <div className="font-bold text-sm text-slate-900">All activities up to date!</div>
                  <p className="text-xs text-slate-500">
                    No examinations are missing classrooms and all completed evaluations have marks entered.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Exams without rooms */}
                  {pendingData?.exams_without_rooms?.length > 0 && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-2xs space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-rose-800 uppercase tracking-wider">
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                        <span>Examinations Without Assigned Classroom ({pendingData.exams_without_rooms.length})</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {pendingData.exams_without_rooms.map((e) => (
                          <div key={e.id} className="p-3.5 rounded-xl bg-white border border-rose-200 text-xs space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-bold text-slate-900">{e.exam_type} &middot; {e.subject_code}</div>
                                <div className="text-slate-600 text-[11px]">{e.subject_name} ({e.course_name})</div>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 whitespace-nowrap">
                                Needs Venue
                              </span>
                            </div>
                            <div className="text-rose-600 font-semibold text-[11px]">
                              Date: {e.exam_date} &middot; Time: {e.start_time} - {e.end_time}
                            </div>

                            {/* Inline Classroom Venue Allocator */}
                            <div className="pt-2 border-t border-rose-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                              <select
                                className="flex-1 text-[11px] rounded-lg border border-rose-300 bg-white px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                value={selectedRooms[e.id] || ''}
                                onChange={(ev) => setSelectedRooms({ ...selectedRooms, [e.id]: ev.target.value })}
                              >
                                <option value="">Select Classroom / Venue...</option>
                                {classrooms.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.room_number} &middot; {c.building_name} (Floor {c.floor_number})
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={!selectedRooms[e.id] || assigningRoomId === e.id}
                                onClick={() => handleAssignRoom(e.id)}
                                className="inline-flex items-center justify-center gap-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-semibold px-3 py-1.5 disabled:opacity-40 transition-all cursor-pointer whitespace-nowrap"
                              >
                                {assigningRoomId === e.id ? 'Allocating...' : 'Allocate Room'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveTab('Schedule')}
                                className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold px-2.5 py-1.5 transition-all cursor-pointer whitespace-nowrap"
                              >
                                <span>Go to Schedule</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Marks not entered */}
                  {pendingData?.marks_not_entered?.length > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-2xs space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-900 uppercase tracking-wider">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <span>Completed Examinations Missing Student Marks ({pendingData.marks_not_entered.length})</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {pendingData.marks_not_entered.map((m) => {
                          const activeFaculty = (facultyData?.faculty || []).filter((f) => f.is_active !== false);
                          const currentFacultySelection =
                            selectedGradingFaculty[m.id] ?? m.grading_faculty_id ?? m.default_faculty_id ?? '';
                          return (
                            <div key={m.id} className="p-3.5 rounded-xl bg-white border border-amber-200 text-xs space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-bold text-slate-900">{m.exam_type} &middot; {m.subject_code}</div>
                                  <div className="text-slate-600 text-[11px]">{m.subject_name} ({m.course_name})</div>
                                </div>
                                {m.grading_faculty_id ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 whitespace-nowrap">
                                    Assigned: {m.grading_faculty_name}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 whitespace-nowrap">
                                    Needs Grading
                                  </span>
                                )}
                              </div>

                              <div className="text-amber-700 font-semibold text-[11px] flex flex-wrap items-center justify-between gap-2">
                                <span>
                                  Date: {m.exam_date}
                                  {m.room_number ? ` · ${m.room_number}` : ''}
                                </span>
                                <span>
                                  Graded: {m.marks_entered} / {m.enrolled_students} enrolled students
                                </span>
                              </div>

                              {/* Inline Faculty Grading Assignment */}
                              <div className="pt-2 border-t border-amber-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                <select
                                  aria-label={`Assign grading faculty for ${m.subject_code} ${m.exam_type}`}
                                  className="flex-1 text-[11px] rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                  value={currentFacultySelection}
                                  onChange={(ev) =>
                                    setSelectedGradingFaculty({ ...selectedGradingFaculty, [m.id]: ev.target.value })
                                  }
                                >
                                  <option value="">Select Faculty to Grade...</option>
                                  {activeFaculty.map((f) => (
                                    <option key={f.id} value={f.id}>
                                      {f.full_name} ({f.employee_number})
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={!currentFacultySelection || assigningGradingId === m.id}
                                  onClick={() => handleAssignGrading(m.id, currentFacultySelection)}
                                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-semibold px-3 py-1.5 disabled:opacity-40 transition-all cursor-pointer whitespace-nowrap"
                                >
                                  {assigningGradingId === m.id
                                    ? 'Assigning...'
                                    : m.grading_faculty_id
                                    ? 'Reassign Faculty'
                                    : 'Assign to Faculty'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActiveTab('Schedule')}
                                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold px-2.5 py-1.5 transition-all cursor-pointer whitespace-nowrap"
                                >
                                  <span>Go to Exams</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Unassigned subjects */}
                  {pendingData?.unassigned_subjects?.length > 0 && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                        <Users className="w-4 h-4 text-purple-600" />
                        <span>Subjects Without Assigned Faculty ({pendingData.unassigned_subjects.length})</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {pendingData.unassigned_subjects.map((u) => {
                          const activeFaculty = (facultyData?.faculty || []).filter((f) => f.is_active !== false);
                          const selectedFac = selectedSubjectFaculty[u.id] || '';
                          return (
                            <div key={u.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-bold text-slate-900">{u.subject_code} &middot; {u.subject_name}</div>
                                  <div className="text-slate-500 text-[11px]">{u.course_name} (Sem {u.semester})</div>
                                </div>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700 whitespace-nowrap">
                                  Needs Faculty
                                </span>
                              </div>
                              <div className="pt-2 border-t border-slate-200/80 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                <select
                                  aria-label={`Assign faculty for subject ${u.subject_code}`}
                                  className="flex-1 text-[11px] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                  value={selectedFac}
                                  onChange={(ev) =>
                                    setSelectedSubjectFaculty({ ...selectedSubjectFaculty, [u.id]: ev.target.value })
                                  }
                                >
                                  <option value="">Select Faculty Member...</option>
                                  {activeFaculty.map((f) => (
                                    <option key={f.id} value={f.id}>
                                      {f.full_name} ({f.employee_number})
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={!selectedFac || assigningSubjectId === u.id}
                                  onClick={() => handleAssignSubjectFaculty(u.id)}
                                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-semibold px-3 py-1.5 disabled:opacity-40 transition-all cursor-pointer whitespace-nowrap"
                                >
                                  {assigningSubjectId === u.id ? 'Assigning...' : 'Assign Faculty'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActiveTab('Courses')}
                                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold px-2.5 py-1.5 transition-all cursor-pointer whitespace-nowrap"
                                >
                                  <span>Go to Courses</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Missing weekly attendance */}
                  {pendingData?.missing_attendance?.length > 0 && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 shadow-2xs space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-rose-900 uppercase tracking-wider">
                        <Calendar className="w-4 h-4 text-rose-600" />
                        <span>Classes Missing Weekly Attendance ({pendingData.missing_attendance.length})</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {pendingData.missing_attendance.map((ma) => (
                          <div key={ma.subject_id} className="p-3.5 rounded-xl bg-white border border-rose-200 text-xs space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-bold text-slate-900">
                                  {ma.subject_code} &middot; {ma.subject_name}
                                </div>
                                <div className="text-slate-600 text-[11px]">
                                  {ma.course_name} (Sem {ma.semester}) &middot; Faculty: <strong>{ma.faculty_name}</strong> ({ma.faculty_employee_number})
                                </div>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                                  ma.reminded ? 'bg-purple-100 text-purple-800' : 'bg-rose-100 text-rose-700'
                                }`}
                              >
                                {ma.reminded ? 'Reminder Sent' : 'Attendance Missing'}
                              </span>
                            </div>

                            <div className="text-[11px] text-rose-700 font-semibold flex flex-wrap items-center justify-between gap-2">
                              <span>
                                Week: {ma.week_start} to {ma.week_end}
                                {ma.scheduled_days?.length ? ` (${ma.scheduled_days.join(', ')})` : ''}
                              </span>
                              <span>{ma.enrolled_students} students</span>
                            </div>

                            <div className="pt-2 border-t border-rose-100 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={remindingAttendanceId === ma.subject_id}
                                onClick={() => handleRemindAttendance(ma.subject_id, ma.week_start)}
                                className="inline-flex items-center justify-center gap-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-semibold px-3 py-1.5 disabled:opacity-40 transition-all cursor-pointer whitespace-nowrap"
                              >
                                {remindingAttendanceId === ma.subject_id
                                  ? 'Sending...'
                                  : ma.reminded
                                  ? 'Resend Reminder'
                                  : 'Notify Faculty'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveTab('Faculty')}
                                className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold px-2.5 py-1.5 transition-all cursor-pointer whitespace-nowrap"
                              >
                                <span>Go to Faculty</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveTab('Analytics')}
                                className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold px-2.5 py-1.5 transition-all cursor-pointer whitespace-nowrap"
                              >
                                <span>Attendance Analytics</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unscheduled subjects (no weekly timetable slots) */}
                  {pendingData?.unscheduled_subjects?.length > 0 && (
                    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 shadow-2xs space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-indigo-900 uppercase tracking-wider">
                        <Calendar className="w-4 h-4 text-indigo-600" />
                        <span>Subjects Without Weekly Timetable Slots ({pendingData.unscheduled_subjects.length})</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {pendingData.unscheduled_subjects.map((us) => {
                          const activeFaculty = (facultyData?.faculty || []).filter((f) => f.is_active !== false);
                          const fState = timetableForms[us.id] || {};
                          const facultyId = fState.faculty_id ?? us.faculty_id ?? '';
                          const dayOfWeek = fState.day_of_week ?? '4';
                          const startTime = fState.start_time ?? '10:00';
                          const endTime = fState.end_time ?? '11:00';
                          const classroomId = fState.classroom_id ?? '';
                          const updateForm = (patch) =>
                            setTimetableForms((prev) => ({ ...prev, [us.id]: { ...prev[us.id], ...patch } }));

                          return (
                            <div key={us.id} className="p-3.5 rounded-xl bg-white border border-indigo-200 text-xs space-y-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-bold text-slate-900">
                                    {us.subject_code} &middot; {us.subject_name}
                                  </div>
                                  <div className="text-slate-600 text-[11px]">
                                    {us.course_name} (Sem {us.semester})
                                    {us.faculty_name ? ` · Assigned: ${us.faculty_name}` : ''}
                                  </div>
                                </div>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 whitespace-nowrap">
                                  No Timetable Slot
                                </span>
                              </div>

                              <div className="pt-2 border-t border-indigo-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <select
                                  aria-label={`Faculty for ${us.subject_code} timetable`}
                                  className="text-[11px] rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                  value={facultyId}
                                  onChange={(e) => updateForm({ faculty_id: e.target.value })}
                                >
                                  <option value="">Select Faculty...</option>
                                  {activeFaculty.map((f) => (
                                    <option key={f.id} value={f.id}>
                                      {f.full_name} ({f.employee_number})
                                    </option>
                                  ))}
                                </select>

                                <select
                                  aria-label={`Classroom for ${us.subject_code} timetable`}
                                  className="text-[11px] rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                  value={classroomId}
                                  onChange={(e) => updateForm({ classroom_id: e.target.value })}
                                >
                                  <option value="">Select Classroom...</option>
                                  {classrooms.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.room_number} &middot; {c.building_name}
                                    </option>
                                  ))}
                                </select>

                                <select
                                  aria-label={`Day for ${us.subject_code} timetable`}
                                  className="text-[11px] rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                  value={dayOfWeek}
                                  onChange={(e) => updateForm({ day_of_week: e.target.value })}
                                >
                                  <option value="1">Monday</option>
                                  <option value="2">Tuesday</option>
                                  <option value="3">Wednesday</option>
                                  <option value="4">Thursday</option>
                                  <option value="5">Friday</option>
                                  <option value="6">Saturday</option>
                                </select>

                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="time"
                                    aria-label={`Start time for ${us.subject_code}`}
                                    className="flex-1 text-[11px] rounded-lg border border-indigo-200 bg-white px-2 py-1 text-slate-800"
                                    value={startTime}
                                    onChange={(e) => updateForm({ start_time: e.target.value })}
                                  />
                                  <span className="text-slate-400">-</span>
                                  <input
                                    type="time"
                                    aria-label={`End time for ${us.subject_code}`}
                                    className="flex-1 text-[11px] rounded-lg border border-indigo-200 bg-white px-2 py-1 text-slate-800"
                                    value={endTime}
                                    onChange={(e) => updateForm({ end_time: e.target.value })}
                                  />
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  disabled={!facultyId || !classroomId || schedulingTimetableId === us.id}
                                  onClick={() => handleScheduleTimetableSlot(us)}
                                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-semibold px-3 py-1.5 disabled:opacity-40 transition-all cursor-pointer whitespace-nowrap"
                                >
                                  {schedulingTimetableId === us.id ? 'Scheduling...' : 'Add Timetable Slot'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActiveTab('Schedule')}
                                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold px-2.5 py-1.5 transition-all cursor-pointer whitespace-nowrap"
                                >
                                  <span>Go to Schedule</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: ANALYTICS & AGGREGATES */}
          {activeTab === 'Analytics' && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Department-Level Analytics</h1>
                <p className="text-xs text-slate-500">
                  Strictly aggregated metrics: attendance percentages, exam pass rates, and workload. No individual student identities are revealed.
                </p>
              </div>

              {/* Overall Attendance Metric */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-900 to-indigo-900 text-white shadow-xs space-y-2">
                <div className="text-xs font-semibold text-purple-200">Department Average Attendance</div>
                <div className="text-3xl font-extrabold">
                  {analyticsData?.overall_attendance?.overall_attendance_pct ?? '—'}%
                </div>
                <div className="text-xs text-purple-200/80">
                  Based on {analyticsData?.overall_attendance?.total_attendance_records ?? 0} total attendance log records
                </div>
              </div>

              {/* Subject Attendance Breakdown */}
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                <div className="p-3.5 bg-slate-50 border-b border-slate-200/80 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Subject-Wise Aggregate Attendance Rates
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/50 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Subject</th>
                      <th className="p-3">Course / Sem</th>
                      <th className="p-3 text-center">Sessions Held</th>
                      <th className="p-3 text-right">Attendance %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analyticsData?.subject_attendance?.map((sa, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="p-3 font-semibold text-slate-900">{sa.subject_code} &middot; {sa.subject_name}</td>
                        <td className="p-3 text-slate-500">{sa.course_name} (Sem {sa.semester})</td>
                        <td className="p-3 text-center font-mono">{sa.total_sessions}</td>
                        <td className="p-3 text-right">
                          <span
                            className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                              Number(sa.attendance_pct) >= 75
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {sa.attendance_pct ?? 'N/A'}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Exam Performance Summaries */}
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                <div className="p-3.5 bg-slate-50 border-b border-slate-200/80 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Examination Performance Summaries (Aggregates)
                </div>
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/50 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Subject & Exam</th>
                      <th className="p-3 text-center">Graded</th>
                      <th className="p-3 text-center">Avg Marks</th>
                      <th className="p-3 text-center">Min / Max</th>
                      <th className="p-3 text-right">Pass Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analyticsData?.exam_performance?.map((ep, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="p-3">
                          <div className="font-semibold text-slate-900">{ep.subject_code} &middot; {ep.subject_name}</div>
                          <div className="text-slate-400 text-[11px]">{ep.exam_type} ({ep.exam_date})</div>
                        </td>
                        <td className="p-3 text-center font-mono">{ep.students_graded}</td>
                        <td className="p-3 text-center font-bold text-slate-900">{ep.average_marks ?? '—'}</td>
                        <td className="p-3 text-center text-slate-500">{ep.lowest_marks ?? '—'} / {ep.highest_marks ?? '—'}</td>
                        <td className="p-3 text-right">
                          <span className="font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded text-[11px]">
                            {ep.pass_percentage ?? '—'}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: DEPARTMENT NOTICES */}
          {activeTab === 'Notices' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">{deptName} Notices</h1>
                  <p className="text-xs text-slate-500">
                    Publish internal announcements specifically for students and faculty in your department.
                  </p>
                </div>
                <button
                  onClick={() => setCreatingNotice(!creatingNotice)}
                  className={btnPrimary}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{creatingNotice ? 'Cancel' : 'Post New Notice'}</span>
                </button>
              </div>

              {creatingNotice && (
                <form onSubmit={handleCreateNotice} className="p-4 rounded-2xl bg-white border border-purple-200 shadow-2xs space-y-3">
                  <div className="text-xs font-bold text-purple-900 uppercase tracking-wider">New Department Notice</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <label className="text-[11px] font-semibold text-slate-700">Notice Title</label>
                      <input
                        type="text"
                        required
                        value={noticeForm.title}
                        onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })}
                        placeholder="e.g. CS Lab Schedule Change"
                        className={fieldStyle}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700">Category</label>
                      <input
                        type="text"
                        value={noticeForm.category}
                        onChange={(e) => setNoticeForm({ ...noticeForm, category: e.target.value })}
                        placeholder="e.g. Academics, Labs, Events"
                        className={fieldStyle}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700">Notice Content</label>
                    <textarea
                      rows={3}
                      required
                      value={noticeForm.content}
                      onChange={(e) => setNoticeForm({ ...noticeForm, content: e.target.value })}
                      placeholder="Write details of the department announcement..."
                      className={fieldStyle}
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <label className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={noticeForm.is_published}
                        onChange={(e) => setNoticeForm({ ...noticeForm, is_published: e.target.checked })}
                        className="rounded text-purple-600 focus:ring-purple-500"
                      />
                      <span>Publish immediately</span>
                    </label>
                    <button type="submit" className={btnPrimary}>
                      Post Announcement
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-3">
                {noticesData?.notices?.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
                    No department notices posted yet.
                  </div>
                ) : (
                  noticesData?.notices?.map((n) => (
                    <div key={n.id} className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">{n.title}</span>
                          {n.category && (
                            <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-semibold border border-purple-200">
                              {n.category}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleToggleNotice(n.id, n.is_published)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all ${
                            n.is_published
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {n.is_published ? 'Published' : 'Draft'}
                        </button>
                      </div>
                      <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">{n.content}</p>
                      <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                        Posted on {n.published_at || 'Draft'} &middot; Scope: {n.department_name}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 8: EXECUTIVE REPORT (PRINTABLE & CSV) */}
          {activeTab === 'Report' && (
            <div className="space-y-6 animate-fade-in print:p-0">
              <div className="flex items-center justify-between print:hidden">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">Departmental Executive Report</h1>
                  <p className="text-xs text-slate-500">
                    Official department summary ready for administrative review, printing, or CSV spreadsheet export.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handlePrint} className={btnSecondary}>
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Report</span>
                  </button>
                  <button onClick={handleDownloadCsv} className={btnPrimary}>
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              {/* Printable Document Sheet */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8 shadow-xs space-y-6 print:border-none print:shadow-none print:p-0">
                {/* Header */}
                <div className="border-b border-slate-200 pb-4">
                  <div className="text-xs font-semibold text-purple-700 uppercase tracking-widest">
                    University Institutional Audit & Performance
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">{deptName} Departmental Report</h2>
                  <div className="text-xs text-slate-400 mt-1">
                    Generated: {reportData?.generated_at ? new Date(reportData.generated_at).toLocaleString() : 'Loading...'}
                  </div>
                </div>

                {/* Key Metrics Table */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">1. Summary Indicators</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-slate-400">Faculty</div>
                      <div className="text-lg font-bold text-slate-900">{reportData?.overview?.counts?.faculty ?? '—'}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-slate-400">Students</div>
                      <div className="text-lg font-bold text-slate-900">{reportData?.overview?.counts?.students ?? '—'}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-slate-400">Courses</div>
                      <div className="text-lg font-bold text-slate-900">{reportData?.overview?.counts?.courses ?? '—'}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-slate-400">Avg Attendance</div>
                      <div className="text-lg font-bold text-slate-900">
                        {reportData?.analytics?.overall_attendance?.overall_attendance_pct ?? '—'}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* Faculty Workload */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">2. Faculty Teaching Allocation</h3>
                  <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
                    <thead className="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase">
                      <tr>
                        <th className="p-2.5">ID</th>
                        <th className="p-2.5">Faculty Member</th>
                        <th className="p-2.5">Assigned Courses & Subjects</th>
                        <th className="p-2.5 text-right">Weekly Hrs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reportData?.faculty?.map((f) => (
                        <tr key={f.id}>
                          <td className="p-2.5 font-mono">{f.employee_number}</td>
                          <td className="p-2.5 font-semibold text-slate-900">{f.full_name}</td>
                          <td className="p-2.5 text-slate-600">
                            {f.subjects?.map((s) => s.subject_code).join(', ') || 'None'}
                          </td>
                          <td className="p-2.5 text-right font-bold">{f.weekly_classes} hrs</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pending Items */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">3. Pending Operational Items</h3>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                    <div>
                      &bull; Exams without classroom assignment:{' '}
                      <strong>{reportData?.pending?.exams_without_rooms?.length ?? 0}</strong>
                    </div>
                    <div>
                      &bull; Evaluations with marks not yet entered:{' '}
                      <strong>{reportData?.pending?.marks_not_entered?.length ?? 0}</strong>
                    </div>
                    <div>
                      &bull; Curriculum subjects without assigned teachers:{' '}
                      <strong>{reportData?.pending?.unassigned_subjects?.length ?? 0}</strong>
                    </div>
                    <div>
                      &bull; Classes missing weekly attendance:{' '}
                      <strong>{reportData?.pending?.missing_attendance?.length ?? 0}</strong>
                    </div>
                    <div>
                      &bull; Subjects without weekly timetable slots:{' '}
                      <strong>{reportData?.pending?.unscheduled_subjects?.length ?? 0}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
