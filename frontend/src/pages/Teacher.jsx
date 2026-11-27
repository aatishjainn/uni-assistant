import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import {
  GraduationCap,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  MapPin,
  Upload,
  Download,
  FileText,
  Users,
  X,
} from '../components/Icons.jsx';

const TABS = [
  { id: 'Grading', label: 'Exam Grading Tasks', icon: CheckCircle2 },
  { id: 'Attendance', label: 'Weekly Attendance', icon: Users },
  { id: 'Subjects', label: 'My Subjects & Timetable', icon: Calendar },
];

function shiftIsoDate(dateStr, days) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

const btnPrimary =
  'inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3.5 py-2 shadow-2xs disabled:opacity-50 transition-all cursor-pointer';
const btnSecondary =
  'inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold px-3 py-1.5 shadow-2xs disabled:opacity-50 transition-all cursor-pointer';

export default function Teacher({ onBack, initialTab = 'Grading' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [tasksData, setTasksData] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Weekly attendance state
  const [selectedWeek, setSelectedWeek] = useState('');
  const selectedWeekRef = useRef('');
  const [attendanceData, setAttendanceData] = useState(null);
  const [downloadingAttId, setDownloadingAttId] = useState(null);
  const [uploadingAttId, setUploadingAttId] = useState(null);
  const [attUploadIssue, setAttUploadIssue] = useState(null);
  const [expandedAttSubjectId, setExpandedAttSubjectId] = useState(null);
  const [attRecords, setAttRecords] = useState(null);
  const [loadingAttRecords, setLoadingAttRecords] = useState(false);
  const attFileInputRefs = useRef({});

  // Active exam grading state
  const [gradingExam, setGradingExam] = useState(null);
  const [students, setStudents] = useState([]);
  const [markInputs, setMarkInputs] = useState({});
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [savingMarks, setSavingMarks] = useState(false);
  const [downloadingTemplateId, setDownloadingTemplateId] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadIssue, setUploadIssue] = useState(null);
  const fileInputRef = useRef(null);

  const loadAttendance = useCallback(async (weekOverride = selectedWeekRef.current) => {
    const att = await api.teacherAttendanceSheets(weekOverride || '');
    setAttendanceData(att);
    if (att?.week_start) {
      selectedWeekRef.current = att.week_start;
      setSelectedWeek(att.week_start);
    }
    return att;
  }, []);

  const loadAll = useCallback(async (weekOverride = selectedWeekRef.current) => {
    setLoading(true);
    setError('');
    try {
      const [tasks, subRes, ttRes, attRes] = await Promise.all([
        api.teacherGradingTasks(),
        api.teacherSubjects().catch(() => ({ subjects: [] })),
        api.teacherTimetable().catch(() => ({ timetable: [] })),
        api.teacherAttendanceSheets(weekOverride || '').catch(() => null),
      ]);
      setTasksData(tasks);
      setSubjects(subRes.subjects || []);
      setTimetable(ttRes.timetable || []);
      if (attRes) {
        setAttendanceData(attRes);
        if (attRes.week_start) {
          selectedWeekRef.current = attRes.week_start;
          setSelectedWeek(attRes.week_start);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load faculty portal data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll('');
  }, [loadAll]);

  const openGradingSheet = async (examId) => {
    setLoadingStudents(true);
    setError('');
    setSuccess('');
    setUploadIssue(null);
    try {
      const res = await api.teacherExamStudents(examId);
      setGradingExam(res.examination);
      setStudents(res.students || []);
      const initial = {};
      for (const s of res.students || []) {
        initial[s.student_id] = s.marks_obtained !== null && s.marks_obtained !== undefined ? String(s.marks_obtained) : '';
      }
      setMarkInputs(initial);
    } catch (err) {
      setError(err.message || 'Failed to load enrolled students');
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleDownloadBlankCsv = async (exam) => {
    if (!exam?.id) return;
    setDownloadingTemplateId(exam.id);
    setError('');
    try {
      const fallback = `${exam.subject_code}_${String(exam.exam_type || 'exam').replace(/\s+/g, '_')}_blank_marks.csv`;
      const { blob, filename } = await api.downloadTeacherBlankCsv(exam.id, fallback);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Failed to download blank CSV template');
    } finally {
      setDownloadingTemplateId(null);
    }
  };

  const handleFileUpload = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file || !gradingExam) return;
    setUploadingFile(true);
    setError('');
    setSuccess('');
    setUploadIssue(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.uploadTeacherExamMarks(gradingExam.id, formData);
      setSuccess(
        `Uploaded "${file.name}" and saved marks for ${res.saved_count} student(s) (${res.marks_entered}/${res.enrolled_students} graded).`
      );
      await Promise.all([loadAll(), openGradingSheetAfterSave(gradingExam.id)]);
    } catch (err) {
      if (err.data?.needs_reupload) {
        setUploadIssue({
          filename: file.name,
          message: err.message,
          missing_students: err.data.missing_students || [],
          invalid_rows: err.data.invalid_rows || [],
          unknown_students: err.data.unknown_students || [],
        });
      } else {
        setError(err.message || 'Failed to upload marks file');
      }
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveMarks = async (e) => {
    e.preventDefault();
    if (!gradingExam) return;

    const payload = [];
    for (const s of students) {
      const raw = (markInputs[s.student_id] ?? '').trim();
      if (raw === '') continue;
      const num = Number(raw);
      if (!Number.isFinite(num) || num < 0 || num > 100) {
        setError(`Invalid marks for ${s.full_name} (${s.student_number}). Enter a number between 0 and 100.`);
        return;
      }
      payload.push({ student_id: s.student_id, marks_obtained: num });
    }

    if (payload.length === 0) {
      setError('Please enter marks for at least one student before saving.');
      return;
    }

    setSavingMarks(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.submitTeacherExamMarks(gradingExam.id, payload);
      setSuccess(
        `Saved marks for ${res.saved_count} student(s). Progress: ${res.marks_entered}/${res.enrolled_students} graded.`
      );
      await Promise.all([loadAll(), openGradingSheetAfterSave(gradingExam.id)]);
    } catch (err) {
      setError(err.message || 'Failed to submit marks');
    } finally {
      setSavingMarks(false);
    }
  };

  const openGradingSheetAfterSave = async (examId) => {
    const res = await api.teacherExamStudents(examId);
    setGradingExam(res.examination);
    setStudents(res.students || []);
    const updated = {};
    for (const s of res.students || []) {
      updated[s.student_id] = s.marks_obtained !== null && s.marks_obtained !== undefined ? String(s.marks_obtained) : '';
    }
    setMarkInputs(updated);
  };

  const handleSelectWeek = async (nextWeek) => {
    if (!nextWeek) return;
    selectedWeekRef.current = nextWeek;
    setSelectedWeek(nextWeek);
    setExpandedAttSubjectId(null);
    setAttRecords(null);
    setAttUploadIssue(null);
    setError('');
    try {
      await loadAttendance(nextWeek);
    } catch (err) {
      setError(err.message || 'Failed to load attendance sheets for selected week');
    }
  };

  const handleDownloadAttendanceBlankCsv = async (sheet) => {
    const week = attendanceData?.week_start || selectedWeek;
    setDownloadingAttId(sheet.subject_id);
    setError('');
    try {
      const fallback = `${sheet.subject_code}_week_${week}_attendance_blank.csv`;
      const { blob, filename } = await api.downloadTeacherAttendanceBlankCsv(sheet.subject_id, week, fallback);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Failed to download blank attendance CSV');
    } finally {
      setDownloadingAttId(null);
    }
  };

  const handleUploadAttendanceCsv = async (sheet, ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const week = attendanceData?.week_start || selectedWeek;
    setUploadingAttId(sheet.subject_id);
    setError('');
    setSuccess('');
    setAttUploadIssue(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.uploadTeacherAttendanceCsv(sheet.subject_id, week, formData);
      setSuccess(
        `Uploaded "${file.name}" for ${sheet.subject_code} (Week of ${res.week_start}): saved ${res.records_count} attendance entries (${res.present_count} Present, ${res.absent_count} Absent).`
      );
      const refreshedAtt = await loadAttendance(week);
      const effectiveWeek = refreshedAtt?.week_start || week;
      setExpandedAttSubjectId(sheet.subject_id);
      setLoadingAttRecords(true);
      try {
        const rec = await api.teacherAttendanceRecords(sheet.subject_id, effectiveWeek);
        setAttRecords(rec);
      } finally {
        setLoadingAttRecords(false);
      }
    } catch (err) {
      if (err.data?.needs_reupload) {
        setAttUploadIssue({
          subject_id: sheet.subject_id,
          subject_code: sheet.subject_code,
          filename: file.name,
          message: err.message,
          missing_students: err.data.missing_students || [],
          missing_entries: err.data.missing_entries || [],
          invalid_entries: err.data.invalid_entries || [],
          unknown_students: err.data.unknown_students || [],
        });
      } else {
        setError(err.message || 'Failed to upload attendance CSV');
      }
    } finally {
      setUploadingAttId(null);
      if (attFileInputRefs.current[sheet.subject_id]) {
        attFileInputRefs.current[sheet.subject_id].value = '';
      }
    }
  };

  const handleToggleAttendanceSheet = async (sheet) => {
    if (expandedAttSubjectId === sheet.subject_id) {
      setExpandedAttSubjectId(null);
      setAttRecords(null);
      return;
    }
    const week = attendanceData?.week_start || selectedWeek;
    setExpandedAttSubjectId(sheet.subject_id);
    setAttRecords(null);
    setLoadingAttRecords(true);
    setError('');
    try {
      const rec = await api.teacherAttendanceRecords(sheet.subject_id, week);
      setAttRecords(rec);
    } catch (err) {
      setError(err.message || 'Failed to load attendance sheet');
    } finally {
      setLoadingAttRecords(false);
    }
  };

  const pendingExams = (tasksData?.exams || []).filter((e) => !e.is_completed);
  const completedExams = (tasksData?.exams || []).filter((e) => e.is_completed);
  const missingAttendanceCount = attendanceData?.missing_count || 0;
  const faculty = tasksData?.faculty;

  const enteredScores = students
    .map((s) => Number(markInputs[s.student_id]))
    .filter((n, idx) => (markInputs[students[idx]?.student_id] ?? '').trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 100);
  const avgScore = enteredScores.length
    ? (enteredScores.reduce((a, b) => a + b, 0) / enteredScores.length).toFixed(1)
    : '—';
  const passCount = enteredScores.filter((n) => n >= 50).length;

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
            <span className="p-1 rounded-md bg-emerald-100 text-emerald-700">
              <GraduationCap className="w-4 h-4" />
            </span>
            <span className="font-semibold text-xs md:text-sm text-slate-900">
              Faculty Portal &middot; {faculty?.department_name || 'Teaching & Grading'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {missingAttendanceCount > 0 && (
            <button
              onClick={() => {
                setActiveTab('Attendance');
                setGradingExam(null);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-all cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
              <span>{missingAttendanceCount} Missing Attendance</span>
            </button>
          )}
          {pendingExams.length > 0 && (
            <button
              onClick={() => {
                setActiveTab('Grading');
                setGradingExam(null);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-all cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>{pendingExams.length} Pending Grading</span>
            </button>
          )}
          <button
            onClick={() => loadAll(selectedWeekRef.current)}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Refresh data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-60 border-r border-slate-200/80 bg-white p-3 space-y-1 shrink-0 overflow-y-auto hidden md:block">
          <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Faculty Workspace
          </div>
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setActiveTab(t.id);
                  if (t.id !== 'Grading') setGradingExam(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  active
                    ? 'bg-emerald-50 text-emerald-700 font-semibold shadow-2xs border border-emerald-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>{t.label}</span>
                </div>
                {t.id === 'Grading' && pendingExams.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {pendingExams.length}
                  </span>
                )}
                {t.id === 'Attendance' && missingAttendanceCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {missingAttendanceCount}
                  </span>
                )}
              </button>
            );
          })}

          {faculty && (
            <div className="mt-6 mx-1 p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] space-y-1">
              <div className="font-semibold text-slate-800">{faculty.full_name}</div>
              <div className="text-slate-500 font-mono">{faculty.employee_number}</div>
              <div className="text-slate-400">{faculty.department_name}</div>
            </div>
          )}
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto space-y-6">
          {/* Mobile Tabs */}
          <div className="flex md:hidden gap-1.5 overflow-x-auto pb-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium ${
                  activeTab === t.id
                    ? 'bg-emerald-600 text-white font-semibold'
                    : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center justify-between">
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

          {/* TAB 1: GRADING TASKS */}
          {activeTab === 'Grading' && !gradingExam && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Assigned Exam Grading Tasks</h1>
                <p className="text-xs text-slate-500">
                  Examinations assigned to you by your Head of Department for student mark entry and grading.
                </p>
              </div>

              {loading && !tasksData ? (
                <div className="p-8 rounded-2xl bg-white border border-slate-200 text-center text-xs text-slate-500">
                  Loading assigned grading tasks...
                </div>
              ) : (tasksData?.exams || []).length === 0 ? (
                <div className="p-8 rounded-2xl bg-white border border-slate-200/80 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                  <div className="font-bold text-sm text-slate-900">No grading tasks assigned</div>
                  <p className="text-xs text-slate-500">
                    When your HOD assigns an examination to you for grading, it will appear right here.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Pending Grading */}
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-2xs space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-900 uppercase tracking-wider">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span>Pending Grading ({pendingExams.length})</span>
                    </div>

                    {pendingExams.length === 0 ? (
                      <div className="p-4 rounded-xl bg-white border border-amber-200/60 text-xs text-slate-500">
                        All assigned exams have been graded.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {pendingExams.map((ex) => (
                          <div key={ex.id} className="p-4 rounded-xl bg-white border border-amber-200 text-xs space-y-3 shadow-2xs">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-bold text-slate-900 text-sm">
                                  {ex.exam_type} &middot; {ex.subject_code}
                                </div>
                                <div className="text-slate-600">
                                  {ex.subject_name} ({ex.course_name}, Sem {ex.semester})
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 whitespace-nowrap">
                                Action Required
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-500 space-y-0.5">
                              <div>
                                Date: <strong className="text-slate-700">{ex.exam_date}</strong> &middot; {ex.start_time} - {ex.end_time}
                              </div>
                              {ex.room_number && (
                                <div>
                                  Venue: <strong className="text-slate-700">{ex.room_number}</strong> ({ex.building_name})
                                </div>
                              )}
                              {ex.assigned_by_name && (
                                <div>
                                  Assigned by: <strong className="text-slate-700">{ex.assigned_by_name}</strong>
                                  {ex.grading_assigned_at ? ` on ${ex.grading_assigned_at}` : ''}
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center justify-between pt-2 border-t border-amber-100 gap-2">
                              <span className="text-[11px] font-semibold text-amber-700">
                                Graded: {ex.marks_entered} / {ex.enrolled_students} students
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadBlankCsv(ex)}
                                  disabled={downloadingTemplateId === ex.id}
                                  className={btnSecondary}
                                  title="Download blank CSV with enrolled students to fill marks in Excel"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>{downloadingTemplateId === ex.id ? 'Downloading...' : 'Blank CSV'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openGradingSheet(ex.id)}
                                  disabled={loadingStudents}
                                  className={btnPrimary}
                                >
                                  <span>{ex.marks_entered > 0 ? 'Continue Grading' : 'Grade Exam'}</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Completed Grading */}
                  {completedExams.length > 0 && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4 shadow-2xs space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 uppercase tracking-wider">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Completed Grading ({completedExams.length})</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {completedExams.map((ex) => (
                          <div key={ex.id} className="p-4 rounded-xl bg-white border border-emerald-200 text-xs space-y-2 shadow-2xs">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-bold text-slate-900">
                                  {ex.exam_type} &middot; {ex.subject_code}
                                </div>
                                <div className="text-slate-600 text-[11px]">
                                  {ex.subject_name} ({ex.course_name}, Sem {ex.semester})
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 whitespace-nowrap">
                                Completed ({ex.marks_entered}/{ex.enrolled_students})
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center justify-between pt-2 border-t border-emerald-100 gap-2">
                              <span className="text-[11px] text-slate-400">Exam Date: {ex.exam_date}</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleDownloadBlankCsv(ex)}
                                  disabled={downloadingTemplateId === ex.id}
                                  className={btnSecondary}
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>{downloadingTemplateId === ex.id ? 'Downloading...' : 'Blank CSV'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openGradingSheet(ex.id)}
                                  className={btnSecondary}
                                >
                                  View / Edit Marks
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* GRADING SHEET VIEW */}
          {activeTab === 'Grading' && gradingExam && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setGradingExam(null);
                      setError('');
                    }}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 mb-1 cursor-pointer"
                  >
                    &larr; Back to Assigned Grading Tasks
                  </button>
                  <h1 className="text-lg font-bold text-slate-900">
                    Grade Examination: {gradingExam.exam_type} &middot; {gradingExam.subject_code}
                  </h1>
                  <p className="text-xs text-slate-500">
                    {gradingExam.subject_name} &middot; {gradingExam.course_name} (Sem {gradingExam.semester}) &middot;{' '}
                    {gradingExam.exam_date} ({gradingExam.start_time} - {gradingExam.end_time})
                  </p>
                </div>

                <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs">
                  <div>
                    <span className="text-slate-400">Graded:</span>{' '}
                    <strong className="text-slate-900">{enteredScores.length}/{students.length}</strong>
                  </div>
                  <div className="h-3.5 w-px bg-slate-200" />
                  <div>
                    <span className="text-slate-400">Avg:</span>{' '}
                    <strong className="text-slate-900">{avgScore}</strong>
                  </div>
                  <div className="h-3.5 w-px bg-slate-200" />
                  <div>
                    <span className="text-slate-400">Pass (&ge;50):</span>{' '}
                    <strong className="text-emerald-700">{passCount}</strong>
                  </div>
                </div>
              </div>

              {/* Bulk Excel / CSV Marks Upload */}
              <div className="rounded-2xl border border-emerald-200/80 bg-white p-4 shadow-2xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      <span>Upload Marks via Excel / CSV</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Upload a <code className="font-mono bg-slate-100 px-1 rounded">.csv</code> or{' '}
                      <code className="font-mono bg-slate-100 px-1 rounded">.xlsx</code> file with{' '}
                      <code className="font-mono bg-slate-100 px-1 rounded">student_number</code> and{' '}
                      <code className="font-mono bg-slate-100 px-1 rounded">marks_obtained</code> (0–100). All enrolled students must have marks.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDownloadBlankCsv(gradingExam)}
                      disabled={students.length === 0 || downloadingTemplateId === gradingExam.id}
                      className={btnSecondary}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{downloadingTemplateId === gradingExam.id ? 'Downloading...' : 'Download Blank CSV'}</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.xlsx"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingFile || students.length === 0}
                      className={btnPrimary}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingFile ? 'Reading & Saving...' : 'Upload CSV / Excel'}</span>
                    </button>
                  </div>
                </div>

                {uploadIssue && (
                  <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs text-rose-900 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-rose-950">
                            Missing or Invalid Marks in &ldquo;{uploadIssue.filename}&rdquo; &mdash; Upload a New CSV
                          </div>
                          <p className="text-rose-800 mt-0.5">{uploadIssue.message} No marks were saved.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setUploadIssue(null)}
                        className="text-rose-400 hover:text-rose-700 cursor-pointer"
                        aria-label="Dismiss upload warning"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {uploadIssue.missing_students.length > 0 && (
                      <div className="rounded-lg bg-white/80 border border-rose-200/80 p-2.5 space-y-1">
                        <div className="font-semibold text-[11px] text-rose-900 uppercase tracking-wider">
                          Students Missing Marks ({uploadIssue.missing_students.length})
                        </div>
                        <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-rose-800">
                          {uploadIssue.missing_students.map((ms, idx) => (
                            <li key={idx}>
                              <span className="font-mono font-semibold">{ms.student_number}</span> &middot; {ms.full_name} &mdash; {ms.reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {uploadIssue.invalid_rows.length > 0 && (
                      <div className="rounded-lg bg-white/80 border border-rose-200/80 p-2.5 space-y-1">
                        <div className="font-semibold text-[11px] text-rose-900 uppercase tracking-wider">
                          Invalid Marks Rows ({uploadIssue.invalid_rows.length})
                        </div>
                        <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-rose-800">
                          {uploadIssue.invalid_rows.map((ir, idx) => (
                            <li key={idx}>
                              Row {ir.row}{ir.student_number ? ` (${ir.student_number})` : ''}: &ldquo;{ir.value ?? ''}&rdquo; &mdash; {ir.reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {uploadIssue.unknown_students.length > 0 && (
                      <div className="rounded-lg bg-white/80 border border-rose-200/80 p-2.5 space-y-1">
                        <div className="font-semibold text-[11px] text-rose-900 uppercase tracking-wider">
                          Unrecognized Students ({uploadIssue.unknown_students.length})
                        </div>
                        <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-rose-800">
                          {uploadIssue.unknown_students.map((us, idx) => (
                            <li key={idx}>
                              Row {us.row}: <span className="font-mono font-semibold">{us.identifier}</span> is not enrolled in {gradingExam.subject_code}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex items-center justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingFile}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold px-3 py-1.5 shadow-2xs transition-all cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload New CSV</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleSaveMarks} className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                <div className="p-3.5 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Enrolled Students ({students.length})
                  </span>
                  <span className="text-[11px] text-slate-500">Enter marks from 0 to 100</span>
                </div>

                {students.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    No students are enrolled in {gradingExam.subject_code}.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/50 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="p-3">Roll Number</th>
                        <th className="p-3">Student Name</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3 text-right w-44">Marks Obtained (0–100)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {students.map((st) => {
                        const val = markInputs[st.student_id] ?? '';
                        const hasVal = val.trim() !== '';
                        return (
                          <tr key={st.student_id} className="hover:bg-slate-50/50">
                            <td className="p-3 font-mono font-semibold text-slate-700">{st.student_number}</td>
                            <td className="p-3">
                              <div className="font-semibold text-slate-900">{st.full_name}</div>
                              <div className="text-[11px] text-slate-400">{st.email}</div>
                            </td>
                            <td className="p-3 text-center">
                              {hasVal ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Entered
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                  Pending
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                placeholder="0 - 100"
                                aria-label={`Marks for ${st.full_name}`}
                                value={val}
                                onChange={(e) =>
                                  setMarkInputs((prev) => ({ ...prev, [st.student_id]: e.target.value }))
                                }
                                className="w-28 text-right rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}

                <div className="p-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setGradingExam(null)}
                    className={btnSecondary}
                  >
                    Back to Tasks
                  </button>
                  <button
                    type="submit"
                    disabled={savingMarks || students.length === 0}
                    className={btnPrimary}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{savingMarks ? 'Saving Marks...' : 'Save Student Marks'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: WEEKLY ATTENDANCE */}
          {activeTab === 'Attendance' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h1 className="text-lg font-bold text-slate-900">Weekly Attendance Sheets</h1>
                  <p className="text-xs text-slate-500">
                    Download a fresh blank CSV each week, mark <strong className="text-emerald-700">P</strong> for Present and{' '}
                    <strong className="text-rose-700">A</strong> for Absent, and upload the completed CSV.
                  </p>
                </div>

                {/* Week Picker */}
                <div className="flex flex-wrap items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => handleSelectWeek(shiftIsoDate(attendanceData?.week_start || selectedWeek, -7))}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    &larr; Prev Week
                  </button>
                  <input
                    type="date"
                    aria-label="Select week date"
                    value={attendanceData?.week_start || selectedWeek}
                    onChange={(e) => handleSelectWeek(e.target.value)}
                    className="text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleSelectWeek(shiftIsoDate(attendanceData?.week_start || selectedWeek, 7))}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Next Week &rarr;
                  </button>
                </div>
              </div>

              {attendanceData && (
                <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950">
                  <div>
                    Active Sheet Period: <strong>{attendanceData.week_start}</strong> to <strong>{attendanceData.week_end}</strong>
                    {attendanceData.week_start === attendanceData.current_week_start && (
                      <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                        Current Week
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-emerald-800">
                    Pending this week: <strong>{attendanceData.missing_count}</strong> / {attendanceData.sheets.length} classes
                  </div>
                </div>
              )}

              {!attendanceData?.sheets?.length ? (
                <div className="p-8 rounded-2xl bg-white border border-slate-200/80 text-center text-xs text-slate-500">
                  No subjects assigned to your faculty profile yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {attendanceData.sheets.map((sheet) => {
                    const issue = attUploadIssue?.subject_id === sheet.subject_id ? attUploadIssue : null;
                    const isExpanded = expandedAttSubjectId === sheet.subject_id;
                    return (
                      <div
                        key={sheet.subject_id}
                        className={`rounded-2xl border p-4 shadow-2xs space-y-3 ${
                          sheet.is_submitted
                            ? 'border-emerald-200 bg-white'
                            : 'border-rose-200 bg-rose-50/30'
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-sm text-slate-900">
                                {sheet.subject_code} &middot; {sheet.subject_name}
                              </span>
                              {sheet.is_submitted ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                  Submitted {sheet.submitted_at ? `(${sheet.submitted_at})` : ''}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                  Attendance Missing
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {sheet.course_name} (Sem {sheet.semester}) &middot; {sheet.enrolled_students} enrolled students &middot; Class dates:{' '}
                              <strong className="text-slate-700">
                                {sheet.scheduled_dates.map((d) => `${d.short_day} ${d.date}`).join(', ')}
                              </strong>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleDownloadAttendanceBlankCsv(sheet)}
                              disabled={downloadingAttId === sheet.subject_id}
                              className={btnSecondary}
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>{downloadingAttId === sheet.subject_id ? 'Downloading...' : 'Download Blank CSV'}</span>
                            </button>

                            <input
                              ref={(el) => {
                                attFileInputRefs.current[sheet.subject_id] = el;
                              }}
                              type="file"
                              accept=".csv,.xlsx"
                              onChange={(ev) => handleUploadAttendanceCsv(sheet, ev)}
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={() => attFileInputRefs.current[sheet.subject_id]?.click()}
                              disabled={uploadingAttId === sheet.subject_id}
                              className={btnPrimary}
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>
                                {uploadingAttId === sheet.subject_id
                                  ? 'Reading CSV...'
                                  : sheet.is_submitted
                                  ? 'Re-upload CSV'
                                  : 'Upload Filled CSV'}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleAttendanceSheet(sheet)}
                              className={btnSecondary}
                            >
                              <span>{isExpanded ? 'Hide Sheet' : 'View Sheet'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Missing / Invalid Attendance Alert */}
                        {issue && (
                          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs text-rose-900 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                <div>
                                  <div className="font-bold text-rose-950">
                                    Missing or Invalid Attendance in &ldquo;{issue.filename}&rdquo; &mdash; Upload a New CSV
                                  </div>
                                  <p className="text-rose-800 mt-0.5">{issue.message} No attendance was saved.</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setAttUploadIssue(null)}
                                className="text-rose-400 hover:text-rose-700 cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            {issue.missing_students.length > 0 && (
                              <div className="rounded-lg bg-white/80 border border-rose-200 p-2 text-[11px]">
                                <strong>Students missing from file ({issue.missing_students.length}):</strong>{' '}
                                {issue.missing_students.map((s) => `${s.student_number} (${s.full_name})`).join(', ')}
                              </div>
                            )}

                            {issue.missing_entries.length > 0 && (
                              <div className="rounded-lg bg-white/80 border border-rose-200 p-2 text-[11px] space-y-0.5">
                                <div className="font-semibold">Blank cells ({issue.missing_entries.length}):</div>
                                <ul className="list-disc pl-4">
                                  {issue.missing_entries.slice(0, 8).map((m, idx) => (
                                    <li key={idx}>
                                      {m.student_number} ({m.full_name}) &mdash; {m.date}
                                    </li>
                                  ))}
                                  {issue.missing_entries.length > 8 && <li>...and {issue.missing_entries.length - 8} more</li>}
                                </ul>
                              </div>
                            )}

                            {issue.invalid_entries.length > 0 && (
                              <div className="rounded-lg bg-white/80 border border-rose-200 p-2 text-[11px] space-y-0.5">
                                <div className="font-semibold">Invalid entries (use P or A):</div>
                                <ul className="list-disc pl-4">
                                  {issue.invalid_entries.slice(0, 8).map((inv, idx) => (
                                    <li key={idx}>
                                      Row {inv.row}{inv.student_number ? ` (${inv.student_number})` : ''}: {inv.reason}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => attFileInputRefs.current[sheet.subject_id]?.click()}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold px-3 py-1.5 cursor-pointer"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span>Upload New CSV</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Expanded Student x Date Grid */}
                        {isExpanded && (
                          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                            {loadingAttRecords || !attRecords ? (
                              <div className="p-4 text-center text-xs text-slate-400">Loading weekly register...</div>
                            ) : (
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                                  <tr>
                                    <th className="p-2.5">Roll No</th>
                                    <th className="p-2.5">Student Name</th>
                                    {attRecords.scheduled_dates.map((d) => (
                                      <th key={d.date} className="p-2.5 text-center">
                                        {d.short_day} ({d.date})
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {attRecords.students.map((st) => (
                                    <tr key={st.student_id} className="hover:bg-slate-50/50">
                                      <td className="p-2.5 font-mono font-semibold text-slate-700">{st.student_number}</td>
                                      <td className="p-2.5 font-medium text-slate-900">{st.full_name}</td>
                                      {attRecords.scheduled_dates.map((d) => {
                                        const stVal = st.statuses[d.date];
                                        return (
                                          <td key={d.date} className="p-2.5 text-center">
                                            {stVal === 'present' ? (
                                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                                                P
                                              </span>
                                            ) : stVal === 'absent' ? (
                                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                                                A
                                              </span>
                                            ) : stVal === 'leave' ? (
                                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                                L
                                              </span>
                                            ) : (
                                              <span className="text-[10px] text-slate-400 italic">Pending</span>
                                            )}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SUBJECTS & TIMETABLE */}
          {activeTab === 'Subjects' && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h1 className="text-lg font-bold text-slate-900">My Subjects & Teaching Schedule</h1>
                <p className="text-xs text-slate-500">
                  Curriculum subjects assigned to you and your weekly classroom timetable.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  <BookOpen className="w-4 h-4 text-emerald-600" />
                  <span>Assigned Subjects ({subjects.length})</span>
                </div>
                {subjects.length === 0 ? (
                  <p className="text-xs text-slate-400">No subjects assigned yet.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {subjects.map((s, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-xs">
                        <div className="font-bold text-slate-900">{s.subject_code} &middot; {s.subject_name}</div>
                        <div className="text-slate-500 text-[11px]">
                          {s.course_name} (Sem {s.semester}) &middot; {s.academic_year}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span>Weekly Timetable ({timetable.length} sessions)</span>
                </div>
                {timetable.length === 0 ? (
                  <p className="text-xs text-slate-400">No weekly timetable slots scheduled.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {timetable.map((t, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 text-xs space-y-1">
                        <div className="flex items-center justify-between font-semibold text-slate-900">
                          <span>{['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][t.day_of_week]}</span>
                          <span className="text-emerald-700 font-mono text-[11px]">
                            {String(t.start_time).slice(0, 5)} - {String(t.end_time).slice(0, 5)}
                          </span>
                        </div>
                        <div className="font-medium text-slate-800">{t.subject_name}</div>
                        <div className="text-slate-400 text-[11px] flex items-center gap-1 pt-1 border-t border-slate-200/40">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{t.room_number} ({t.building_name}, Floor {t.floor_number})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
