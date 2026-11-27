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
  Building2,
  HelpCircle,
  UserCheck,
  UserX,
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
      { id: 'Applications', label: 'Admission Applications', icon: UserCheck },
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

// ------------------------------------------------------------------ Users Tab
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [roles, setRoles] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Create Modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    full_name: '',
    email: '',
    password: 'Password@123',
    role: 'student',
    department_id: '',
    course_id: '',
    semester: 1,
    student_number: '',
    employee_number: '',
  });

  // Edit Modal
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({
    full_name: '',
    role: '',
    department_id: '',
    course_id: '',
    semester: 1,
    password: '',
  });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      const res = await api.adminUsers(params);
      setUsers(res.users);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    api.adminDepartments().then((r) => setDepartments(r.departments)).catch(() => {});
    api.adminCourses().then((r) => setCourses(r.courses)).catch(() => {});
    api.adminRoles().then((r) => setRoles(r.roles)).catch(() => {});
  }, []);

  const handleToggleActive = async (u) => {
    setError('');
    try {
      await api.updateUser(u.id, { is_active: !u.is_active });
      setInfo(`User ${u.full_name} is now ${!u.is_active ? 'Active' : 'Inactive'}.`);
      loadUsers();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    try {
      const payload = { ...createForm };
      if (!payload.department_id) delete payload.department_id;
      if (!payload.course_id) delete payload.course_id;
      if (!payload.student_number) delete payload.student_number;
      if (!payload.employee_number) delete payload.employee_number;
      await api.createUser(payload);
      setInfo(`Account created for ${createForm.full_name} (${createForm.role}).`);
      setShowCreate(false);
      setCreateForm({
        full_name: '', email: '', password: 'Password@123', role: 'student',
        department_id: '', course_id: '', semester: 1, student_number: '', employee_number: ''
      });
      loadUsers();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setError('');
    setInfo('');
    try {
      const payload = { ...editForm };
      if (!payload.password) delete payload.password;
      if (!payload.department_id) delete payload.department_id;
      if (!payload.course_id) delete payload.course_id;
      await api.updateUser(editingUser.id, payload);
      setInfo(`Updated user ${editingUser.full_name}.`);
      setEditingUser(null);
      loadUsers();
    } catch (e) {
      setError(e.message);
    }
  };

  const roleColors = {
    admin: 'bg-rose-50 text-rose-700 border-rose-200',
    hod: 'bg-purple-50 text-purple-700 border-purple-200',
    teacher: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    student: 'bg-blue-50 text-blue-700 border-blue-200',
    applicant: 'bg-amber-50 text-amber-700 border-amber-200',
    visitor: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  return (
    <div className="space-y-6">
      <Alert kind="error" onClose={() => setError('')}>{error}</Alert>
      <Alert kind="ok" onClose={() => setInfo('')}>{info}</Alert>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">User Account Management</h2>
          <p className="text-xs text-slate-500">
            Create or deactivate teachers, students, and HODs, and reassign system roles.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className={btnPrimary}>
          <Plus className="w-3.5 h-3.5" />
          <span>Create New User</span>
        </button>
      </div>

      <div className="p-3 bg-white rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, student ID, employee ID..."
          className={fieldStyle}
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="w-full sm:w-48 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
        >
          <option value="">All Roles</option>
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="hod">HOD</option>
          <option value="admin">Admin</option>
          <option value="applicant">Applicant</option>
          <option value="visitor">Visitor</option>
        </select>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="p-3">User & Email</th>
              <th className="p-3">Role</th>
              <th className="p-3">Department / Program</th>
              <th className="p-3">ID Number</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50/50">
                <td className="p-3">
                  <div className="font-semibold text-slate-900">{u.full_name}</div>
                  <div className="text-slate-400 text-[11px]">{u.email}</div>
                </td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${roleColors[u.role] || 'bg-slate-100 text-slate-700'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="p-3 text-slate-600">
                  {u.department_name ? (
                    <div>
                      <div className="font-medium text-slate-800">{u.department_name}</div>
                      {u.course_name && <div className="text-[11px] text-slate-400">{u.course_name} (Sem {u.semester})</div>}
                    </div>
                  ) : (
                    <span className="text-slate-400 italic">None</span>
                  )}
                </td>
                <td className="p-3 font-mono text-[11px] text-slate-700">
                  {u.student_number || u.employee_number || '—'}
                </td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    u.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                  <button
                    onClick={() => {
                      setEditingUser(u);
                      setEditForm({
                        full_name: u.full_name,
                        role: u.role,
                        department_id: u.department_id || '',
                        course_id: u.course_id || '',
                        semester: u.semester || 1,
                        password: '',
                      });
                    }}
                    className="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleActive(u)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      u.is_active
                        ? 'border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-700'
                        : 'border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {u.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreateSubmit} className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">Create New Institutional User</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700">Full Name</label>
                <input required type="text" value={createForm.full_name} onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} placeholder="e.g. Dr. Ramesh Kumar" className={fieldStyle} />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700">Email Address</label>
                <input required type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} placeholder="ramesh@uni.test" className={fieldStyle} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700">Initial Password</label>
                <input required type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} className={fieldStyle} />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700">System Role</label>
                <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })} className={fieldStyle}>
                  <option value="student">Student</option>
                  <option value="teacher">Teacher (Faculty)</option>
                  <option value="hod">Head of Department (HOD)</option>
                  <option value="admin">System Administrator</option>
                  <option value="applicant">Applicant</option>
                  <option value="visitor">Visitor</option>
                </select>
              </div>
            </div>

            {(createForm.role === 'student' || createForm.role === 'teacher' || createForm.role === 'hod') && (
              <div className="space-y-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                  {createForm.role.toUpperCase()} Academic Profile
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-700">Department</label>
                  <select
                    required={createForm.role === 'student' || createForm.role === 'teacher'}
                    value={createForm.department_id}
                    onChange={(e) => setCreateForm({ ...createForm, department_id: e.target.value })}
                    className={fieldStyle}
                  >
                    <option value="">Select Department...</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.department_name}</option>)}
                  </select>
                </div>
                {createForm.role === 'student' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700">Course / Program</label>
                      <select required value={createForm.course_id} onChange={(e) => setCreateForm({ ...createForm, course_id: e.target.value })} className={fieldStyle}>
                        <option value="">Select Course...</option>
                        {courses
                          .filter((c) => !createForm.department_id || c.department_id === createForm.department_id)
                          .map((c) => <option key={c.id} value={c.id}>{c.course_name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700">Current Semester</label>
                      <input required type="number" min="1" max="10" value={createForm.semester} onChange={(e) => setCreateForm({ ...createForm, semester: Number(e.target.value) })} className={fieldStyle} />
                    </div>
                  </div>
                )}
                {createForm.role === 'teacher' && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700">Employee ID (Optional)</label>
                    <input type="text" value={createForm.employee_number} onChange={(e) => setCreateForm({ ...createForm, employee_number: e.target.value })} placeholder="Auto-generated if empty" className={fieldStyle} />
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setShowCreate(false)} className={btnSecondary}>Cancel</button>
              <button type="submit" className={btnPrimary}>Create User Account</button>
            </div>
          </form>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleEditSubmit} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">Edit User &middot; {editingUser.email}</h3>
              <button type="button" onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700">Full Name</label>
              <input type="text" required value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} className={fieldStyle} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700">Role</label>
              <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} className={fieldStyle}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="hod">HOD</option>
                <option value="admin">Admin</option>
                <option value="applicant">Applicant</option>
                <option value="visitor">Visitor</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700">Department</label>
              <select value={editForm.department_id} onChange={(e) => setEditForm({ ...editForm, department_id: e.target.value })} className={fieldStyle}>
                <option value="">No Department Assigned</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.department_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700">Reset Password (leave empty to keep current)</label>
              <input type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="Minimum 8 characters" className={fieldStyle} />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setEditingUser(null)} className={btnSecondary}>Cancel</button>
              <button type="submit" className={btnPrimary}>Save Changes</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Departments & Faculty Tab
function DepartmentsTab() {
  const [departments, setDepartments] = useState([]);
  const [faculty, setFaculty] = useState([]);
  const [hodUsers, setHodUsers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Department modal
  const [showDeptForm, setShowDeptForm] = useState(false);
  const [deptForm, setDeptForm] = useState({ department_name: '', hod_user_id: '' });
  const [editingDept, setEditingDept] = useState(null);

  // Assign Subject modal
  const [assigningFaculty, setAssigningFaculty] = useState(null);
  const [assignForm, setAssignForm] = useState({ subject_id: '', academic_year: '2026-27' });

  const loadData = useCallback(async () => {
    try {
      const [d, f, u, s] = await Promise.all([
        api.adminDepartments(),
        api.adminFaculty(),
        api.adminUsers({ role: 'hod' }),
        api.adminSubjects(),
      ]);
      setDepartments(d.departments);
      setFaculty(f.faculty);
      setHodUsers(u.users);
      setSubjects(s.subjects);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveDept = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    try {
      if (editingDept) {
        await api.updateDepartment(editingDept.id, deptForm);
        setInfo(`Updated department ${deptForm.department_name}.`);
      } else {
        await api.createDepartment(deptForm);
        setInfo(`Created department ${deptForm.department_name}.`);
      }
      setShowDeptForm(false);
      setEditingDept(null);
      setDeptForm({ department_name: '', hod_user_id: '' });
      loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDeleteDept = async (id, name) => {
    if (!window.confirm(`Delete department "${name}"?`)) return;
    setError('');
    try {
      await api.deleteDepartment(id);
      setInfo(`Deleted department ${name}.`);
      loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleAssignSubject = async (e) => {
    e.preventDefault();
    if (!assigningFaculty) return;
    setError('');
    try {
      await api.assignFacultySubject(assigningFaculty.id, assignForm);
      setInfo('Subject assigned to faculty member.');
      setAssigningFaculty(null);
      setAssignForm({ subject_id: '', academic_year: '2026-27' });
      loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleUnassignSubject = async (facultyId, subjectId) => {
    if (!window.confirm('Remove subject assignment from faculty?')) return;
    try {
      await api.unassignFacultySubject(facultyId, subjectId);
      loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <Alert kind="error" onClose={() => setError('')}>{error}</Alert>
      <Alert kind="ok" onClose={() => setInfo('')}>{info}</Alert>

      {/* Departments Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Academic Departments</h2>
            <p className="text-xs text-slate-500">Configure institutional departments and designated Heads of Department (HODs).</p>
          </div>
          <button onClick={() => { setEditingDept(null); setDeptForm({ department_name: '', hod_user_id: '' }); setShowDeptForm(true); }} className={btnPrimary}>
            <Plus className="w-3.5 h-3.5" />
            <span>Add Department</span>
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-3">Department Name</th>
                <th className="p-3">Head of Department (HOD)</th>
                <th className="p-3 text-center">Faculty</th>
                <th className="p-3 text-center">Students</th>
                <th className="p-3 text-center">Courses</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {departments.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/50">
                  <td className="p-3 font-semibold text-slate-900">{d.department_name}</td>
                  <td className="p-3">
                    {d.hod_name ? (
                      <div>
                        <span className="font-medium text-purple-700">{d.hod_name}</span>
                        <div className="text-slate-400 text-[11px]">{d.hod_email}</div>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">No HOD assigned</span>
                    )}
                  </td>
                  <td className="p-3 text-center font-mono">{d.faculty_count}</td>
                  <td className="p-3 text-center font-mono">{d.student_count}</td>
                  <td className="p-3 text-center font-mono">{d.course_count}</td>
                  <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                    <button
                      onClick={() => {
                        setEditingDept(d);
                        setDeptForm({ department_name: d.department_name, hod_user_id: d.hod_user_id || '' });
                        setShowDeptForm(true);
                      }}
                      className="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteDept(d.id, d.department_name)}
                      className="px-2 py-1 rounded-lg border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-700 text-[11px] font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Faculty & Subject Assignments Section */}
      <div className="space-y-3 pt-4 border-t border-slate-200/60">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Faculty Members & Subject Allocations</h2>
          <p className="text-xs text-slate-500">Manage teaching assignments and curriculum mapping across faculty.</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-3">Employee ID</th>
                <th className="p-3">Faculty Name & Email</th>
                <th className="p-3">Department</th>
                <th className="p-3">Assigned Subjects</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {faculty.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50/50">
                  <td className="p-3 font-mono font-semibold text-slate-700">{f.employee_number}</td>
                  <td className="p-3">
                    <div className="font-semibold text-slate-900">{f.full_name}</div>
                    <div className="text-slate-400 text-[11px]">{f.email}</div>
                  </td>
                  <td className="p-3 font-medium text-slate-700">{f.department_name}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {f.subjects?.length > 0 ? (
                        f.subjects.map((s, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200/60 text-[11px] font-medium"
                          >
                            <span>{s.subject_code}</span>
                            <button
                              type="button"
                              onClick={() => handleUnassignSubject(f.id, s.subject_id)}
                              className="text-purple-400 hover:text-rose-600 font-bold"
                              title="Unassign"
                            >
                              &times;
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 italic">No assigned subjects</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => {
                        setAssigningFaculty(f);
                        setAssignForm({ subject_id: '', academic_year: '2026-27' });
                      }}
                      className="px-2 py-1 rounded-lg border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-medium"
                    >
                      + Assign Subject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dept Form Modal */}
      {showDeptForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveDept} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">{editingDept ? 'Edit Department' : 'Create Academic Department'}</h3>
              <button type="button" onClick={() => setShowDeptForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700">Department Name</label>
              <input type="text" required value={deptForm.department_name} onChange={(e) => setDeptForm({ ...deptForm, department_name: e.target.value })} placeholder="e.g. Electrical Engineering" className={fieldStyle} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700">Head of Department (HOD)</label>
              <select value={deptForm.hod_user_id} onChange={(e) => setDeptForm({ ...deptForm, hod_user_id: e.target.value })} className={fieldStyle}>
                <option value="">Select HOD User (Optional)...</option>
                {hodUsers.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setShowDeptForm(false)} className={btnSecondary}>Cancel</button>
              <button type="submit" className={btnPrimary}>Save Department</button>
            </div>
          </form>
        </div>
      )}

      {/* Assign Subject Modal */}
      {assigningFaculty && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAssignSubject} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">Assign Subject &middot; {assigningFaculty.full_name}</h3>
              <button type="button" onClick={() => setAssigningFaculty(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700">Curriculum Subject</label>
              <select required value={assignForm.subject_id} onChange={(e) => setAssignForm({ ...assignForm, subject_id: e.target.value })} className={fieldStyle}>
                <option value="">Select Subject...</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.subject_code} - {s.subject_name} ({s.course_name})</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700">Academic Year</label>
              <input type="text" required value={assignForm.academic_year} onChange={(e) => setAssignForm({ ...assignForm, academic_year: e.target.value })} placeholder="2026-27" className={fieldStyle} />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setAssigningFaculty(null)} className={btnSecondary}>Cancel</button>
              <button type="submit" className={btnPrimary}>Assign Subject</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Courses & Subjects Tab
function CoursesTab() {
  const [courses, setCourses] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Course Form
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [courseForm, setCourseForm] = useState({ course_name: '', department_id: '', duration_years: 3 });
  const [editingCourse, setEditingCourse] = useState(null);

  // Subject Form
  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [subjectForm, setSubjectForm] = useState({ course_id: '', subject_code: '', subject_name: '', semester: 1 });
  const [editingSubject, setEditingSubject] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [c, d, s] = await Promise.all([
        api.adminCourses(),
        api.adminDepartments(),
        api.adminSubjects(),
      ]);
      setCourses(c.courses);
      setDepartments(d.departments);
      setSubjects(s.subjects);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveCourse = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingCourse) {
        await api.updateCourse(editingCourse.id, courseForm);
        setInfo(`Updated course ${courseForm.course_name}.`);
      } else {
        await api.createCourse(courseForm);
        setInfo(`Created course ${courseForm.course_name}.`);
      }
      setShowCourseForm(false);
      setEditingCourse(null);
      setCourseForm({ course_name: '', department_id: '', duration_years: 3 });
      loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDeleteCourse = async (id, name) => {
    if (!window.confirm(`Delete course "${name}"?`)) return;
    try {
      await api.deleteCourse(id);
      loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSaveSubject = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingSubject) {
        await api.updateSubject(editingSubject.id, subjectForm);
        setInfo(`Updated subject ${subjectForm.subject_code}.`);
      } else {
        await api.createSubject(subjectForm);
        setInfo(`Created subject ${subjectForm.subject_code}.`);
      }
      setShowSubjectForm(false);
      setEditingSubject(null);
      setSubjectForm({ course_id: '', subject_code: '', subject_name: '', semester: 1 });
      loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDeleteSubject = async (id, code) => {
    if (!window.confirm(`Delete subject "${code}"?`)) return;
    try {
      await api.deleteSubject(id);
      loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <Alert kind="error" onClose={() => setError('')}>{error}</Alert>
      <Alert kind="ok" onClose={() => setInfo('')}>{info}</Alert>

      {/* Courses Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Academic Courses & Programs</h2>
            <p className="text-xs text-slate-500">Degree programs offered by the university.</p>
          </div>
          <button onClick={() => { setEditingCourse(null); setCourseForm({ course_name: '', department_id: '', duration_years: 3 }); setShowCourseForm(true); }} className={btnPrimary}>
            <Plus className="w-3.5 h-3.5" />
            <span>Add Course</span>
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-3">Course Name</th>
                <th className="p-3">Department</th>
                <th className="p-3 text-center">Duration</th>
                <th className="p-3 text-center">Students</th>
                <th className="p-3 text-center">Subjects</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {courses.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/50">
                  <td className="p-3 font-semibold text-slate-900">{c.course_name}</td>
                  <td className="p-3 text-slate-700">{c.department_name}</td>
                  <td className="p-3 text-center font-mono">{c.duration_years} Years</td>
                  <td className="p-3 text-center font-mono">{c.student_count}</td>
                  <td className="p-3 text-center font-mono">{c.subject_count}</td>
                  <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                    <button
                      onClick={() => {
                        setEditingCourse(c);
                        setCourseForm({ course_name: c.course_name, department_id: c.department_id, duration_years: c.duration_years });
                        setShowCourseForm(true);
                      }}
                      className="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteCourse(c.id, c.course_name)}
                      className="px-2 py-1 rounded-lg border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-700 text-[11px] font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Subjects Section */}
      <div className="space-y-3 pt-4 border-t border-slate-200/60">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Curriculum Subjects</h2>
            <p className="text-xs text-slate-500">Subject codes, semester allocations, and faculty in-charge.</p>
          </div>
          <button onClick={() => { setEditingSubject(null); setSubjectForm({ course_id: '', subject_code: '', subject_name: '', semester: 1 }); setShowSubjectForm(true); }} className={btnPrimary}>
            <Plus className="w-3.5 h-3.5" />
            <span>Add Subject</span>
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-3">Subject Code</th>
                <th className="p-3">Subject Name</th>
                <th className="p-3">Course / Department</th>
                <th className="p-3 text-center">Semester</th>
                <th className="p-3">Assigned Faculty</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subjects.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/50">
                  <td className="p-3 font-mono font-bold text-slate-800">{s.subject_code}</td>
                  <td className="p-3 font-medium text-slate-900">{s.subject_name}</td>
                  <td className="p-3 text-slate-600">
                    <span className="font-semibold text-purple-700">{s.course_name}</span> &middot; {s.department_name}
                  </td>
                  <td className="p-3 text-center font-mono font-medium text-slate-700">Sem {s.semester}</td>
                  <td className="p-3">
                    {s.assigned_faculty_name ? (
                      <span className="text-slate-800 font-medium">{s.assigned_faculty_name}</span>
                    ) : (
                      <span className="text-slate-400 italic">Unassigned</span>
                    )}
                  </td>
                  <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                    <button
                      onClick={() => {
                        setEditingSubject(s);
                        setSubjectForm({ course_id: s.course_id, subject_code: s.subject_code, subject_name: s.subject_name, semester: s.semester });
                        setShowSubjectForm(true);
                      }}
                      className="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteSubject(s.id, s.subject_code)}
                      className="px-2 py-1 rounded-lg border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-700 text-[11px] font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Course Modal */}
      {showCourseForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveCourse} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">{editingCourse ? 'Edit Course' : 'Create Academic Course'}</h3>
              <button type="button" onClick={() => setShowCourseForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700">Course Name</label>
              <input type="text" required value={courseForm.course_name} onChange={(e) => setCourseForm({ ...courseForm, course_name: e.target.value })} placeholder="e.g. BCA, MCA, B.Tech" className={fieldStyle} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700">Department</label>
              <select required value={courseForm.department_id} onChange={(e) => setCourseForm({ ...courseForm, department_id: e.target.value })} className={fieldStyle}>
                <option value="">Select Department...</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.department_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700">Duration (Years)</label>
              <input type="number" required min="1" max="6" value={courseForm.duration_years} onChange={(e) => setCourseForm({ ...courseForm, duration_years: Number(e.target.value) })} className={fieldStyle} />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setShowCourseForm(false)} className={btnSecondary}>Cancel</button>
              <button type="submit" className={btnPrimary}>Save Course</button>
            </div>
          </form>
        </div>
      )}

      {/* Subject Modal */}
      {showSubjectForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveSubject} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">{editingSubject ? 'Edit Subject' : 'Add Curriculum Subject'}</h3>
              <button type="button" onClick={() => setShowSubjectForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700">Course</label>
              <select required value={subjectForm.course_id} onChange={(e) => setSubjectForm({ ...subjectForm, course_id: e.target.value })} className={fieldStyle}>
                <option value="">Select Course...</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.course_name} ({c.department_name})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700">Subject Code</label>
                <input type="text" required value={subjectForm.subject_code} onChange={(e) => setSubjectForm({ ...subjectForm, subject_code: e.target.value })} placeholder="e.g. BCA401" className={fieldStyle} />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700">Semester</label>
                <input type="number" required min="1" max="12" value={subjectForm.semester} onChange={(e) => setSubjectForm({ ...subjectForm, semester: Number(e.target.value) })} className={fieldStyle} />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700">Subject Name</label>
              <input type="text" required value={subjectForm.subject_name} onChange={(e) => setSubjectForm({ ...subjectForm, subject_name: e.target.value })} placeholder="e.g. Database Management Systems" className={fieldStyle} />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setShowSubjectForm(false)} className={btnSecondary}>Cancel</button>
              <button type="submit" className={btnPrimary}>Save Subject</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ FAQs Tab
function FaqsTab() {
  const [faqs, setFaqs] = useState([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Form modal
  const [showForm, setShowForm] = useState(false);
  const [editingFaq, setEditingFaq] = useState(null);
  const [faqForm, setFaqForm] = useState({
    question: '',
    answer: '',
    category: 'General',
    is_published: true,
  });

  const loadFaqs = useCallback(async () => {
    try {
      const res = await api.adminFaqs();
      setFaqs(res.faqs);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { loadFaqs(); }, [loadFaqs]);

  const handleSaveFaq = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingFaq) {
        await api.updateFaq(editingFaq.id, faqForm);
        setInfo('FAQ updated successfully.');
      } else {
        await api.createFaq(faqForm);
        setInfo('New FAQ added successfully.');
      }
      setShowForm(false);
      setEditingFaq(null);
      setFaqForm({ question: '', answer: '', category: 'General', is_published: true });
      loadFaqs();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDeleteFaq = async (id) => {
    if (!window.confirm('Delete this FAQ entry?')) return;
    try {
      await api.deleteFaq(id);
      loadFaqs();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleTogglePublish = async (f) => {
    try {
      await api.updateFaq(f.id, {
        question: f.question,
        answer: f.answer,
        category: f.category,
        is_published: !f.is_published,
      });
      loadFaqs();
    } catch (e) {
      setError(e.message);
    }
  };

  const categories = ['All', ...new Set(faqs.map((f) => f.category))];
  const filtered = faqs.filter((f) => {
    const matchCat = catFilter === 'All' || f.category === catFilter;
    const matchSearch = !search || f.question.toLowerCase().includes(search.toLowerCase()) || f.answer.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="space-y-6">
      <Alert kind="error" onClose={() => setError('')}>{error}</Alert>
      <Alert kind="ok" onClose={() => setInfo('')}>{info}</Alert>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Institutional FAQs Screen</h2>
          <p className="text-xs text-slate-500">
            Publish frequently asked questions and answers for campus navigation, admissions, exams, and academic rules.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingFaq(null);
            setFaqForm({ question: '', answer: '', category: 'General', is_published: true });
            setShowForm(true);
          }}
          className={btnPrimary}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add FAQ</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 bg-white rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search question or answer content..."
          className={fieldStyle}
        />
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCatFilter(c)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                catFilter === c
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* FAQs List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
            No FAQs found matching your criteria.
          </div>
        ) : (
          filtered.map((f) => (
            <div key={f.id} className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900">{f.question}</span>
                  <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-semibold border border-indigo-200">
                    {f.category}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTogglePublish(f)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all ${
                      f.is_published
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {f.is_published ? 'Published' : 'Draft'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingFaq(f);
                      setFaqForm({ question: f.question, answer: f.answer, category: f.category, is_published: f.is_published });
                      setShowForm(true);
                    }}
                    className="p-1 text-slate-400 hover:text-slate-700"
                    title="Edit"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteFaq(f.id)}
                    className="p-1 text-slate-400 hover:text-rose-600"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">{f.answer}</p>
              <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                Created: {f.created_at} &middot; Last updated: {f.updated_at}
              </div>
            </div>
          ))
        )}
      </div>

      {/* FAQ Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveFaq} className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">{editingFaq ? 'Edit FAQ' : 'Create FAQ Entry'}</h3>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700">Question</label>
              <input type="text" required value={faqForm.question} onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })} placeholder="e.g. How do I request a bonafide certificate?" className={fieldStyle} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700">Category</label>
              <input type="text" required value={faqForm.category} onChange={(e) => setFaqForm({ ...faqForm, category: e.target.value })} placeholder="e.g. Academics, Admissions, Facilities" className={fieldStyle} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700">Answer</label>
              <textarea rows={4} required value={faqForm.answer} onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })} placeholder="Detailed answer text..." className={fieldStyle} />
            </div>
            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={faqForm.is_published}
                  onChange={(e) => setFaqForm({ ...faqForm, is_published: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Publish in public FAQ directory</span>
              </label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShowForm(false)} className={btnSecondary}>Cancel</button>
                <button type="submit" className={btnPrimary}>Save FAQ</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
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

// ------------------------------------------------------------------ Admission Applications Tab
const APP_STATUS_STYLE = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  under_review: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};

const APP_STATUS_LABEL = {
  pending: 'Pending',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
};

function AdmissionApplicationsTab({ onUpdated }) {
  const [applications, setApplications] = useState([]);
  const [counts, setCounts] = useState({ total: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 });
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Review modal state
  const [reviewing, setReviewing] = useState(null);
  const [reviewStatus, setReviewStatus] = useState('under_review');
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [enrollStudent, setEnrollStudent] = useState(false);
  const [savingReview, setSavingReview] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search.trim()) params.q = search.trim();
      const res = await api.adminAdmissionApplications(params);
      setApplications(res.applications || []);
      setCounts(res.counts || { total: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 });
    } catch (e) {
      setError(e.message || 'Failed to load admission applications');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  const openReview = (app) => {
    setReviewing(app);
    setReviewStatus(app.status === 'pending' ? 'under_review' : app.status);
    setReviewRemarks(app.admin_remarks || '');
    setEnrollStudent(false);
    setError('');
  };

  const handleQuickStatus = async (app, nextStatus) => {
    setError('');
    setInfo('');
    try {
      await api.reviewAdmissionApplication(app.id, {
        status: nextStatus,
        admin_remarks: app.admin_remarks || null,
        enroll_student: false,
      });
      setInfo(`Application ${app.application_number} marked as ${APP_STATUS_LABEL[nextStatus]}.`);
      await load();
      onUpdated?.();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSaveReview = async (e) => {
    e.preventDefault();
    if (!reviewing) return;
    setSavingReview(true);
    setError('');
    setInfo('');
    try {
      const res = await api.reviewAdmissionApplication(reviewing.id, {
        status: reviewStatus,
        admin_remarks: reviewRemarks,
        enroll_student: reviewStatus === 'approved' && enrollStudent,
      });
      const enrolledNote = res.enrolled_student
        ? ` Applicant promoted to Student (${res.enrolled_student.student_number}).`
        : '';
      setInfo(`Updated ${reviewing.application_number} to ${APP_STATUS_LABEL[reviewStatus]}.${enrolledNote}`);
      setReviewing(null);
      await load();
      onUpdated?.();
    } catch (err) {
      setError(err.message || 'Failed to save review');
    } finally {
      setSavingReview(false);
    }
  };

  const filterPills = [
    { id: 'all', label: 'All', count: counts.total },
    { id: 'pending', label: 'Pending', count: counts.pending },
    { id: 'under_review', label: 'Under Review', count: counts.under_review },
    { id: 'approved', label: 'Approved', count: counts.approved },
    { id: 'rejected', label: 'Rejected', count: counts.rejected },
  ];

  return (
    <div className="space-y-4">
      <Alert kind="error" onClose={() => setError('')}>{error}</Alert>
      <Alert kind="ok" onClose={() => setInfo('')}>{info}</Alert>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Submitted Admission Applications</h2>
          <p className="text-xs text-slate-500">
            Review applications submitted from the Admission Form, update status, and optionally enroll approved applicants as students.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading} className={btnSecondary}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Pills & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {filterPills.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setStatusFilter(p.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                statusFilter === p.id
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>{p.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  statusFilter === p.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {p.count}
              </span>
            </button>
          ))}
        </div>

        <input
          type="search"
          placeholder="Search app #, name, email, course..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Applications Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-x-auto">
        {applications.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            {loading ? 'Loading admission applications...' : 'No admission applications match the current filter.'}
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="p-3">Application #</th>
                <th className="p-3">Applicant</th>
                <th className="p-3">Course &amp; Dept</th>
                <th className="p-3">Qualification &amp; Score</th>
                <th className="p-3">Submitted</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applications.map((app) => (
                <tr key={app.id} className="hover:bg-slate-50/50">
                  <td className="p-3 font-mono font-bold text-indigo-700 whitespace-nowrap">{app.application_number}</td>
                  <td className="p-3">
                    <div className="font-semibold text-slate-900">{app.full_name}</div>
                    <div className="text-[11px] text-slate-500">{app.email} &middot; {app.phone}</div>
                  </td>
                  <td className="p-3">
                    <div className="font-semibold text-slate-800">{app.course_name}</div>
                    <div className="text-[11px] text-slate-400">{app.department_name}</div>
                  </td>
                  <td className="p-3">
                    <div className="font-medium text-slate-800">{app.previous_qualification}</div>
                    <div className="text-[11px] text-slate-500">
                      {app.percentage_or_gpa}% &middot; {app.previous_institution} ({app.passing_year})
                    </div>
                  </td>
                  <td className="p-3 text-slate-500 whitespace-nowrap">{app.created_at}</td>
                  <td className="p-3 text-center whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${APP_STATUS_STYLE[app.status] || ''}`}>
                      {APP_STATUS_LABEL[app.status] || app.status}
                    </span>
                    {app.applicant_user_role === 'student' && (
                      <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">Enrolled Student</div>
                    )}
                  </td>
                  <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openReview(app)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold cursor-pointer"
                    >
                      Review
                    </button>
                    {app.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => handleQuickStatus(app, 'approved')}
                        className="px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-semibold cursor-pointer"
                      >
                        Approve
                      </button>
                    )}
                    {(app.status === 'pending' || app.status === 'under_review') && (
                      <button
                        type="button"
                        onClick={() => handleQuickStatus(app, 'rejected')}
                        className="px-2 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold cursor-pointer"
                      >
                        Reject
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Review Modal */}
      {reviewing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSaveReview} className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="text-[11px] font-mono font-bold text-indigo-600">{reviewing.application_number}</div>
                <h3 className="font-bold text-sm text-slate-900">
                  Review Application &mdash; {reviewing.full_name} ({reviewing.course_name})
                </h3>
              </div>
              <button type="button" onClick={() => setReviewing(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs bg-slate-50 rounded-xl p-3.5 border border-slate-200/70">
              <div><strong className="text-slate-600">Email:</strong> {reviewing.email}</div>
              <div><strong className="text-slate-600">Phone:</strong> {reviewing.phone}</div>
              <div><strong className="text-slate-600">DOB:</strong> {reviewing.date_of_birth}</div>
              <div><strong className="text-slate-600">Gender:</strong> {reviewing.gender || '—'}</div>
              <div className="sm:col-span-2"><strong className="text-slate-600">Address:</strong> {reviewing.address}</div>
              <div><strong className="text-slate-600">Qualification:</strong> {reviewing.previous_qualification}</div>
              <div><strong className="text-slate-600">Score:</strong> {reviewing.percentage_or_gpa}% ({reviewing.passing_year})</div>
              <div className="sm:col-span-2"><strong className="text-slate-600">Institution:</strong> {reviewing.previous_institution}</div>
              {reviewing.guardian_name && (
                <div className="sm:col-span-2">
                  <strong className="text-slate-600">Guardian:</strong> {reviewing.guardian_name}{' '}
                  {reviewing.guardian_phone ? `(${reviewing.guardian_phone})` : ''}
                </div>
              )}
              {reviewing.statement_of_purpose && (
                <div className="sm:col-span-2 pt-1 border-t border-slate-200">
                  <strong className="text-slate-600 block mb-0.5">Statement of Purpose:</strong>
                  <p className="text-slate-700 leading-relaxed">{reviewing.statement_of_purpose}</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Decision Status</label>
              <select
                className={fieldStyle}
                value={reviewStatus}
                onChange={(e) => setReviewStatus(e.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="under_review">Under Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Administration Remarks (visible to applicant)</label>
              <textarea
                rows={3}
                className={fieldStyle}
                value={reviewRemarks}
                onChange={(e) => setReviewRemarks(e.target.value)}
                placeholder="e.g. Verified marksheets. Please complete fee payment by Friday."
              />
            </div>

            {reviewStatus === 'approved' && reviewing.applicant_user_id && reviewing.applicant_user_role === 'applicant' && (
              <label className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enrollStudent}
                  onChange={(e) => setEnrollStudent(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>
                  <strong>Enroll as Student immediately:</strong> promote account to Student role and enroll in {reviewing.course_name} Semester 1 subjects.
                </span>
              </label>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setReviewing(null)} className={btnSecondary}>
                Cancel
              </button>
              <button type="submit" disabled={savingReview} className={btnPrimary}>
                {savingReview ? 'Saving Decision...' : 'Save Application Decision'}
              </button>
            </div>
          </form>
        </div>
      )}
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
  const [tab, setTab] = useState('Users');
  const [pendingAppsCount, setPendingAppsCount] = useState(0);

  const refreshPendingAppsCount = useCallback(() => {
    api
      .adminAdmissionApplications({ status: 'pending' })
      .then((r) => setPendingAppsCount(r.counts?.pending || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshPendingAppsCount();
  }, [refreshPendingAppsCount]);

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
            <span className="p-1 rounded-md bg-indigo-100 text-indigo-700">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
            </span>
            <span className="font-semibold text-xs md:text-sm text-slate-900">
              Admin Portal &middot; Institutional Administration Center
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            Admin Authorized
          </span>
        </div>
      </header>

      {/* Main Workspace Layout with Sidebar Tabs */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-64 border-r border-slate-200/80 bg-white p-3 space-y-4 shrink-0 overflow-y-auto hidden md:block">
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
                    {t.id === 'Applications' && pendingAppsCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
                        {pendingAppsCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto space-y-6">
          {/* Mobile Tab Pills */}
          <div className="flex md:hidden gap-1.5 overflow-x-auto pb-2 scrollbar-none">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer ${
                  tab === t.id
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="space-y-6 animate-fade-in">
            {tab === 'Users' && <UsersTab />}
            {tab === 'Departments' && <DepartmentsTab />}
            {tab === 'Courses' && <CoursesTab />}
            {tab === 'Faqs' && <FaqsTab />}
            {tab === 'Documents' && <DocumentsTab />}
            {tab === 'Admissions' && <AdmissionsTab />}
            {tab === 'Applications' && <AdmissionApplicationsTab onUpdated={refreshPendingAppsCount} />}
            {tab === 'Notices' && <NoticesTab />}
            {tab === 'Campus' && <CampusTab />}
            {tab === 'Analytics' && <AnalyticsTab />}
          </div>
        </main>
      </div>
    </div>
  );
}
