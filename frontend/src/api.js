// All calls to the backend go through here. The login token lives in sessionStorage
// (cleared when the browser tab closes).
const KEY = 'uni_token';
export const getToken = () => sessionStorage.getItem(KEY);
export const setToken = (t) => (t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY));

export class ApiError extends Error {
  constructor(message, status, data = null) { super(message); this.status = status; this.data = data; }
}

async function request(path, { method = 'GET', body } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;   // file uploads
  const headers = isForm ? {} : { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch('/api' + path, { method, headers, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Cannot reach the server. Is the backend running?', 0);
  }
  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch { /* no body */ }

  if (!res.ok) {
    if (res.status === 401 && token) {           // token expired or invalid
      setToken(null);
      window.dispatchEvent(new Event('auth-expired'));
    }
    throw new ApiError((data && data.error) || 'Request failed', res.status, data);
  }
  return data;
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  register: (full_name, email, password) => request('/auth/register', { method: 'POST', body: { full_name, email, password } }),
  me: () => request('/auth/me'),
  chat: (message, sessionId, mode, agent = false) =>
    request('/chat', { method: 'POST', body: { message, mode, ...(agent ? { agent: true } : {}), ...(sessionId ? { sessionId } : {}) } }),
  sessions: () => request('/chat/sessions'),
  session: (id) => request(`/chat/sessions/${id}`),
  deleteSession: (id) => request(`/chat/sessions/${id}`, { method: 'DELETE' }),
  submitFeedback: (messageId, rating, comments = null) =>
    request('/chat/feedback', { method: 'POST', body: { messageId, rating, comments } }),

  // ---- HOD department assistant & portal ----
  hodOverview: () => request('/hod/overview'),
  hodFaculty: () => request('/hod/faculty'),
  hodCourses: () => request('/hod/courses'),
  hodScheduleExams: () => request('/hod/schedule-exams'),
  hodPending: () => request('/hod/pending'),
  hodAnalytics: () => request('/hod/analytics'),
  hodNotices: () => request('/hod/notices'),
  createHodNotice: (fields) => request('/hod/notices', { method: 'POST', body: fields }),
  toggleHodNotice: (id, is_published) => request(`/hod/notices/${id}`, { method: 'PATCH', body: { is_published } }),
  hodReport: () => request('/hod/report'),
  hodReportCsvUrl: () => {
    const t = getToken();
    return `/api/hod/report/csv${t ? `?token=${encodeURIComponent(t)}` : ''}`;
  },
  hodClassrooms: () => request('/hod/classrooms'),
  assignHodExamRoom: (id, classroom_id) => request(`/hod/examinations/${id}/classroom`, { method: 'PATCH', body: { classroom_id } }),
  assignHodExamGrading: (id, faculty_id) => request(`/hod/examinations/${id}/grading-assignee`, { method: 'PATCH', body: { faculty_id } }),
  assignHodSubjectFaculty: (id, faculty_id, academic_year = '2026-27') =>
    request(`/hod/subjects/${id}/assign-faculty`, { method: 'POST', body: { faculty_id, academic_year } }),
  remindHodAttendance: (subject_id, week_start) =>
    request('/hod/attendance/remind', { method: 'POST', body: { subject_id, week_start } }),
  scheduleHodTimetable: (subjectId, fields) =>
    request(`/hod/subjects/${subjectId}/timetable`, { method: 'POST', body: fields }),
  scheduleHodExam: (fields) => request('/hod/examinations', { method: 'POST', body: fields }),

  // ---- faculty records & exam grading ----
  teacherNextClass: () => request('/faculty/me/next-class'),
  teacherSubjects: () => request('/faculty/me/subjects'),
  teacherTimetable: () => request('/faculty/me/timetable'),
  teacherGradingTasks: () => request('/faculty/me/grading-tasks'),
  teacherExamStudents: (examId) => request(`/faculty/me/grading-tasks/${examId}/students`),
  downloadTeacherBlankCsv: async (examId, fallbackFilename = 'blank_marks.csv') => {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(`/api/faculty/me/grading-tasks/${examId}/template`, { headers });
    } catch {
      throw new ApiError('Cannot reach the server. Is the backend running?', 0);
    }
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch { /* ignore */ }
      throw new ApiError((data && data.error) || 'Failed to download blank CSV', res.status, data);
    }
    const disposition = res.headers.get('content-disposition') || '';
    const match = /filename="([^"]+)"/.exec(disposition);
    return { blob: await res.blob(), filename: match ? match[1] : fallbackFilename };
  },
  submitTeacherExamMarks: (examId, marks) => request(`/faculty/me/grading-tasks/${examId}/marks`, { method: 'PUT', body: { marks } }),
  uploadTeacherExamMarks: (examId, formData) => request(`/faculty/me/grading-tasks/${examId}/upload-marks`, { method: 'POST', body: formData }),
  teacherAttendanceSheets: (week = '') =>
    request(`/faculty/me/attendance-sheets${week ? `?week=${encodeURIComponent(week)}` : ''}`),
  downloadTeacherAttendanceBlankCsv: async (subjectId, week, fallbackFilename = 'attendance_blank.csv') => {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const q = week ? `?week=${encodeURIComponent(week)}` : '';
    let res;
    try {
      res = await fetch(`/api/faculty/me/attendance-sheets/${subjectId}/template${q}`, { headers });
    } catch {
      throw new ApiError('Cannot reach the server. Is the backend running?', 0);
    }
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch { /* ignore */ }
      throw new ApiError((data && data.error) || 'Failed to download blank attendance CSV', res.status, data);
    }
    const disposition = res.headers.get('content-disposition') || '';
    const match = /filename="([^"]+)"/.exec(disposition);
    return { blob: await res.blob(), filename: match ? match[1] : fallbackFilename };
  },
  teacherAttendanceRecords: (subjectId, week = '') =>
    request(`/faculty/me/attendance-sheets/${subjectId}/records${week ? `?week=${encodeURIComponent(week)}` : ''}`),
  uploadTeacherAttendanceCsv: (subjectId, week, formData) =>
    request(`/faculty/me/attendance-sheets/${subjectId}/upload${week ? `?week=${encodeURIComponent(week)}` : ''}`, {
      method: 'POST',
      body: formData,
    }),

  // ---- admissions (public + applicant) ----
  admissionCourses: () => request('/admissions/courses'),
  myAdmissionApplications: () => request('/admissions/my-applications'),
  markAdmissionDecisionsSeen: () => request('/admissions/my-applications/mark-seen', { method: 'POST' }),
  submitAdmissionApplication: (fields) => request('/admissions/apply', { method: 'POST', body: fields }),

  // ---- admin panel (admin accounts only; the server enforces this) ----
  adminUsers: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request('/admin/users' + (q ? `?${q}` : ''));
  },
  adminRoles: () => request('/admin/roles'),
  createUser: (fields) => request('/admin/users', { method: 'POST', body: fields }),
  updateUser: (id, fields) => request(`/admin/users/${id}`, { method: 'PATCH', body: fields }),
  adminDepartments: () => request('/admin/departments'),
  createDepartment: (fields) => request('/admin/departments', { method: 'POST', body: fields }),
  updateDepartment: (id, fields) => request(`/admin/departments/${id}`, { method: 'PUT', body: fields }),
  deleteDepartment: (id) => request(`/admin/departments/${id}`, { method: 'DELETE' }),
  adminFaculty: () => request('/admin/faculty'),
  assignFacultySubject: (id, fields) => request(`/admin/faculty/${id}/assign-subject`, { method: 'POST', body: fields }),
  unassignFacultySubject: (id, subjectId) => request(`/admin/faculty/${id}/subjects/${subjectId}`, { method: 'DELETE' }),
  adminCourses: () => request('/admin/courses'),
  createCourse: (fields) => request('/admin/courses', { method: 'POST', body: fields }),
  updateCourse: (id, fields) => request(`/admin/courses/${id}`, { method: 'PUT', body: fields }),
  deleteCourse: (id) => request(`/admin/courses/${id}`, { method: 'DELETE' }),
  adminSubjects: () => request('/admin/subjects'),
  createSubject: (fields) => request('/admin/subjects', { method: 'POST', body: fields }),
  updateSubject: (id, fields) => request(`/admin/subjects/${id}`, { method: 'PUT', body: fields }),
  deleteSubject: (id) => request(`/admin/subjects/${id}`, { method: 'DELETE' }),
  adminFaqs: () => request('/admin/faqs'),
  createFaq: (fields) => request('/admin/faqs', { method: 'POST', body: fields }),
  updateFaq: (id, fields) => request(`/admin/faqs/${id}`, { method: 'PUT', body: fields }),
  deleteFaq: (id) => request(`/admin/faqs/${id}`, { method: 'DELETE' }),
  publicFaqs: () => request('/faqs'),

  // ---- admissions (public + applicant) ----
  admissionCourses: () => request('/admissions/courses'),
  myAdmissionApplications: () => request('/admissions/my-applications'),
  markAdmissionDecisionsSeen: () => request('/admissions/my-applications/mark-seen', { method: 'POST' }),
  submitAdmissionApplication: (fields) => request('/admissions/apply', { method: 'POST', body: fields }),

  // ---- admin panel (admin accounts only; the server enforces this) ----
  documents: () => request('/admin/documents'),
  uploadDocument: (formData) => request('/admin/documents', { method: 'POST', body: formData }),
  updateDocument: (id, fields) => request(`/admin/documents/${id}`, { method: 'PATCH', body: fields }),
  reindexDocument: (id) => request(`/admin/documents/${id}/reindex`, { method: 'POST' }),
  deleteDocument: (id) => request(`/admin/documents/${id}`, { method: 'DELETE' }),
  admissions: () => request('/admin/admissions'),
  saveAdmission: (id, fields) => request(`/admin/admissions/${id}`, { method: 'PUT', body: fields }),
  adminAdmissionApplications: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request('/admin/admission-applications' + (q ? `?${q}` : ''));
  },
  reviewAdmissionApplication: (id, fields) =>
    request(`/admin/admission-applications/${id}`, { method: 'PATCH', body: fields }),
  notices: () => request('/admin/notices'),
  createNotice: (fields) => request('/admin/notices', { method: 'POST', body: fields }),
  setNoticePublished: (id, is_published) => request(`/admin/notices/${id}`, { method: 'PATCH', body: { is_published } }),
  analytics: () => request('/admin/analytics'),
  adminBuildings: () => request('/admin/campus/buildings'),
  saveBuilding: (id, fields) => request(`/admin/campus/buildings/${id}`, { method: 'PUT', body: fields }),
  adminPlaces: () => request('/admin/campus/places'),
  savePlace: (id, fields) => request(`/admin/campus/places/${id}`, { method: 'PUT', body: fields }),

  // ---- campus map (public: no account needed) ----
  campusBuildings: () => request('/campus/buildings'),
  campusPlaces: (q = '') => request(`/campus/places?q=${encodeURIComponent(q)}`),
  campusFloor: (buildingId, floor) => request(`/campus/floor/${buildingId}/${floor}`),
  campusRoute: (from, to, accessible) => request(`/campus/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&accessible=${accessible ? 'true' : 'false'}`),
  campusQr: (token) => request(`/campus/qr/${encodeURIComponent(token)}`),
};
