import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import MessageBubble, { TypingIndicator } from '../components/MessageBubble.jsx';
import {
  GraduationCap,
  Plus,
  MessageSquare,
  Trash2,
  Compass,
  ShieldCheck,
  LogOut,
  Bot,
  Sliders,
  Send,
  Sparkles,
  BookOpen,
  Calendar,
  Layers,
  MapPin,
  Clock,
  Menu,
  X,
  ChevronRight,
  Building2,
  CheckCircle2,
  FileText,
} from '../components/Icons.jsx';

const PROMPT_CATEGORIES = [
  {
    category: 'Study & Explanations',
    icon: BookOpen,
    prompts: [
      { label: 'Explain Database Normalization', query: 'Explain 1NF, 2NF and 3NF with a simple practical example.' },
      { label: 'Generate 10 Practice MCQs', query: 'Generate 10 multiple-choice questions on Database Management Systems.' },
    ],
  },
  {
    category: 'My Records & Navigation',
    icon: Calendar,
    prompts: [
      { label: 'Attendance & Next Class', query: 'What is my current attendance percentage and where is my next class?' },
      { label: 'Campus Directions', query: 'Where is Computer Lab 1 and how do I get there from the main gate?' },
    ],
  },
];

export default function Chat({ user, onLogout, onAdmin, onHod, onTeacher, onApplicant, onMap }) {
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('simple');
  const [agent, setAgent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingGradingCount, setPendingGradingCount] = useState(0);
  const [missingAttendanceCount, setMissingAttendanceCount] = useState(0);
  const [myApplicationsCount, setMyApplicationsCount] = useState(0);
  const [unseenDecisionsCount, setUnseenDecisionsCount] = useState(0);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  const loadSessions = () =>
    api
      .sessions()
      .then((r) => setSessions(r.sessions))
      .catch(() => {});

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (user.role === 'teacher') {
      Promise.all([
        api.teacherGradingTasks().catch(() => ({ pending_count: 0 })),
        api.teacherAttendanceSheets().catch(() => ({ missing_count: 0 })),
      ]).then(([g, a]) => {
        setPendingGradingCount(g.pending_count || 0);
        setMissingAttendanceCount(a.missing_count || 0);
      });
    } else if (user.role === 'applicant') {
      api
        .myAdmissionApplications()
        .then((r) => {
          setMyApplicationsCount(r.applications?.length || 0);
          setUnseenDecisionsCount(r.unseen_decisions_count || 0);
        })
        .catch(() => {});
    }
  }, [user.role]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setError('');
    setSidebarOpen(false);
    textareaRef.current?.focus();
  }

  async function openSession(id) {
    setSidebarOpen(false);
    setError('');
    try {
      const r = await api.session(id);
      setActiveId(id);
      setMessages(
        r.messages.map((m) => ({
          messageId: m.id,
          role: m.sender,
          text: m.message,
          sources: m.source_metadata?.sources || [],
          ui: m.source_metadata?.ui || null,
          trace: m.source_metadata?.trace || null,
          feedbackRating: m.feedback_rating || null,
        }))
      );
    } catch (e) {
      setError(e.message);
    }
  }

  async function removeSession(e, id) {
    e.stopPropagation();
    if (!window.confirm('Delete this conversation? This action cannot be undone.')) return;
    try {
      await api.deleteSession(id);
      if (id === activeId) newChat();
      loadSessions();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleFeedback(messageId, rating) {
    try {
      await api.submitFeedback(messageId, rating);
      setMessages((prev) =>
        prev.map((msg) => (msg.messageId === messageId ? { ...msg, feedbackRating: rating } : msg))
      );
    } catch (e) {
      console.error('Feedback submission failed:', e.message);
    }
  }

  async function send(text) {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    setInput('');
    setError('');
    setMessages((m) => [...m, { role: 'user', text: message }]);
    setLoading(true);

    try {
      const r = await api.chat(message, activeId, mode, agent);
      setMessages((m) => [
        ...m,
        {
          messageId: r.messageId || null,
          role: 'assistant',
          text: r.answer,
          sources: r.sources || [],
          ui: r.ui || null,
          trace: r.trace || null,
          feedbackRating: null,
        },
      ]);
      if (!activeId) {
        setActiveId(r.sessionId);
        loadSessions();
      }
    } catch (e) {
      setError(e.message);
      setInput(message);
      setMessages((m) => m.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const roleBadgeStyle = {
    student: 'bg-blue-900/60 text-blue-200 border-blue-800',
    teacher: 'bg-emerald-900/60 text-emerald-200 border-emerald-800',
    hod: 'bg-purple-900/60 text-purple-200 border-purple-800',
    admin: 'bg-rose-900/60 text-rose-200 border-rose-800',
    applicant: 'bg-amber-900/60 text-amber-200 border-amber-800',
    visitor: 'bg-slate-800 text-slate-300 border-slate-700',
  }[user.role] || 'bg-slate-800 text-slate-300 border-slate-700';

  return (
    <div className="h-full flex bg-slate-50 overflow-hidden">
      {/* Sidebar Navigation */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-30 w-72 bg-slate-950 text-slate-200 flex flex-col border-r border-slate-800/80 transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        {/* Brand & New Chat */}
        <div className="p-4 border-b border-slate-800/60">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white tracking-tight leading-none">Apex University</div>
                <div className="text-[10px] text-slate-400 font-medium tracking-wide">Smart Assistant</div>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={newChat}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 py-2.5 px-3 text-xs font-semibold text-white transition-all shadow-xs"
          >
            <Plus className="w-4 h-4 text-indigo-400" />
            <span>New Conversation</span>
          </button>
        </div>

        {/* Conversation List */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Recent Conversations">
          <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            Conversations
          </div>
          {sessions.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-400">
              No previous chats found.
            </div>
          ) : (
            sessions.map((s) => {
              const active = s.id === activeId;
              return (
                <div
                  key={s.id}
                  onClick={() => openSession(s.id)}
                  role="button"
                  tabIndex={0}
                  className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-colors ${
                    active
                      ? 'bg-slate-800/90 text-white font-medium border border-slate-700/60'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-1">
                    <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-indigo-400' : 'text-slate-400'}`} />
                    <span className="truncate">{s.session_title || 'Untitled Session'}</span>
                  </div>
                  <button
                    onClick={(e) => removeSession(e, s.id)}
                    aria-label="Delete conversation"
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 rounded transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </nav>

        {/* User Profile & Portal Links */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 space-y-2 text-xs">
          <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-slate-900/70 border border-slate-800/60">
            <div className="min-w-0 mr-2">
              <div className="font-semibold text-white truncate text-[11.5px]">{user.full_name}</div>
              <div className="text-[10.5px] text-slate-400 truncate">{user.email}</div>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border capitalize ${roleBadgeStyle}`}>
              {user.role}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-1">
            <button
              onClick={() => { setSidebarOpen(false); onMap(); }}
              className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/70 transition-colors text-left"
            >
              <Compass className="w-3.5 h-3.5 text-indigo-400" />
              <span>Campus Map & Wayfinding</span>
            </button>

            {user.role === 'admin' && (
              <button
                onClick={() => { setSidebarOpen(false); onAdmin(); }}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/70 transition-colors text-left"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
                <span>Admin Control Panel</span>
              </button>
            )}

            {user.role === 'hod' && onHod && (
              <button
                onClick={() => { setSidebarOpen(false); onHod(); }}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/70 transition-colors text-left"
              >
                <Building2 className="w-3.5 h-3.5 text-purple-400" />
                <span>HOD Department Portal</span>
              </button>
            )}

            {user.role === 'teacher' && onTeacher && (
              <>
                <button
                  onClick={() => { setSidebarOpen(false); onTeacher('Grading'); }}
                  className="flex items-center justify-between gap-2 w-full px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/70 transition-colors text-left"
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Faculty Grading Portal</span>
                  </span>
                  {pendingGradingCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold leading-none">
                      {pendingGradingCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => { setSidebarOpen(false); onTeacher('Attendance'); }}
                  className="flex items-center justify-between gap-2 w-full px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/70 transition-colors text-left"
                >
                  <span className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Weekly Attendance</span>
                  </span>
                  {missingAttendanceCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-none">
                      {missingAttendanceCount}
                    </span>
                  )}
                </button>
              </>
            )}

            {user.role === 'applicant' && onApplicant && (
              <button
                onClick={() => { setSidebarOpen(false); onApplicant('Apply'); }}
                className="flex items-center justify-between gap-2 w-full px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/70 transition-colors text-left"
              >
                <span className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>Admission Application</span>
                </span>
                {unseenDecisionsCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold leading-none">
                    {unseenDecisionsCount}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={onLogout}
              className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-900/50 transition-colors text-left"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Chat Workspace */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Top Header Bar */}
        <header className="h-14 border-b border-slate-200/80 px-4 md:px-6 flex items-center justify-between gap-3 bg-white/90 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="md:hidden text-slate-600 hover:text-slate-900 p-1 rounded-lg"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="font-semibold text-slate-900 text-sm tracking-tight truncate">
                University Smart Assistant
              </h1>
            </div>
          </div>

          {/* Controls: Mode Switch & Agent Mode Toggle */}
          <div className="flex items-center gap-2">
            {/* Agent Mode Switch */}
            <button
              onClick={() => setAgent(!agent)}
              aria-pressed={agent}
              title="Agent Mode: The assistant autonomously plans, searches records, checks classrooms and validates facts before answering."
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all shadow-2xs ${
                agent
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-emerald-600/20'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Agent Mode</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  agent ? 'bg-white' : 'bg-slate-300'
                }`}
              />
            </button>

            {/* Explanation Detail Switcher */}
            <div className="hidden sm:flex p-0.5 rounded-xl border border-slate-200 bg-slate-100/80 text-xs font-medium">
              <button
                type="button"
                onClick={() => setMode('simple')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  mode === 'simple'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Concise
              </button>
              <button
                type="button"
                onClick={() => setMode('detailed')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  mode === 'detailed'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                In-Depth
              </button>
            </div>
          </div>
        </header>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
          <div className="max-w-3xl mx-auto space-y-6">
            {user.role === 'teacher' && pendingGradingCount > 0 && onTeacher && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                <div className="flex items-center gap-2.5 text-xs text-emerald-950">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    You have <strong>{pendingGradingCount}</strong> assigned {pendingGradingCount === 1 ? 'examination' : 'examinations'} waiting for student marks entry.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onTeacher('Grading')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 shadow-2xs transition-all self-start sm:self-auto shrink-0 cursor-pointer"
                >
                  <span>Open Grading Portal</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {user.role === 'teacher' && missingAttendanceCount > 0 && onTeacher && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                <div className="flex items-center gap-2.5 text-xs text-rose-950">
                  <Calendar className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    You have <strong>{missingAttendanceCount}</strong> {missingAttendanceCount === 1 ? 'class' : 'classes'} missing weekly attendance CSV upload for this week.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onTeacher('Attendance')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-3 py-1.5 shadow-2xs transition-all self-start sm:self-auto shrink-0 cursor-pointer"
                >
                  <span>Upload Attendance CSV</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {user.role === 'applicant' && onApplicant && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                <div className="flex items-center gap-2.5 text-xs text-amber-950">
                  <FileText className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    {myApplicationsCount > 0
                      ? `You have ${myApplicationsCount} admission ${myApplicationsCount === 1 ? 'application' : 'applications'} on file. Track status or apply for another course.`
                      : 'Ready to apply for admission? Fill out the online Admission Application Form.'}
                  </span>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                  {myApplicationsCount > 0 && (
                    <button
                      type="button"
                      onClick={() => onApplicant('Status')}
                      className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-white hover:bg-amber-50 text-amber-900 text-xs font-semibold px-3 py-1.5 transition-all cursor-pointer"
                    >
                      Track Status
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onApplicant('Apply')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 shadow-2xs transition-all cursor-pointer"
                  >
                    <span>Admission Form</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {messages.length === 0 && !loading && (
              <div className="pt-8 pb-4 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 mb-3 shadow-2xs">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight mb-1">
                  Welcome, {user.full_name.split(' ')[0]}
                </h2>
                <p className="text-xs text-slate-500 max-w-md mx-auto mb-8">
                  I can retrieve your enrolled courses, attendance, exams, timetables, and campus walking directions, or explain academic concepts.
                </p>

                {/* Categorized Suggestions */}
                <div className="grid sm:grid-cols-2 gap-3 text-left">
                  {PROMPT_CATEGORIES.map((cat, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                        <cat.icon className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{cat.category}</span>
                      </div>
                      <div className="space-y-1.5">
                        {cat.prompts.map((p, pIdx) => (
                          <button
                            key={pIdx}
                            onClick={() => send(p.query)}
                            className="w-full text-left p-3 rounded-xl border border-slate-200/90 bg-white hover:border-indigo-300 hover:bg-indigo-50/20 shadow-2xs transition-all group"
                          >
                            <div className="flex items-center justify-between text-xs font-semibold text-slate-800 group-hover:text-indigo-600 mb-0.5">
                              <span>{p.label}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 transition-transform group-hover:translate-x-0.5" />
                            </div>
                            <div className="text-[11px] text-slate-500 line-clamp-1">
                              {p.query}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <MessageBubble
                key={i}
                role={m.role}
                text={m.text}
                sources={m.sources}
                ui={m.ui}
                trace={m.trace}
                onMap={onMap}
                messageId={m.messageId}
                feedbackRating={m.feedbackRating}
                onFeedback={handleFeedback}
              />
            ))}

            {loading && (
              <TypingIndicator
                label={agent ? 'Agent is planning and querying records…' : 'Synthesizing verified response…'}
              />
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input Bar */}
        <div className="border-t border-slate-200/80 bg-white p-3 md:p-4">
          <div className="max-w-3xl mx-auto">
            {error && (
              <div
                role="alert"
                className="mb-2.5 flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50/70 px-3.5 py-2 text-xs text-rose-800"
              >
                <span>{error}</span>
                <button onClick={() => setError('')} className="font-bold text-rose-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="relative flex items-end gap-2 rounded-2xl border border-slate-200/90 bg-slate-50/50 p-1.5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/10 focus-within:bg-white transition-all shadow-2xs">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                maxLength={4000}
                placeholder="Ask about attendance, next classroom, exams, admissions or study concepts…"
                className="flex-1 resize-none bg-transparent px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none max-h-36 leading-relaxed"
              />
              <button
                onClick={() => send()}
                disabled={loading || !input.trim()}
                aria-label="Send message"
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white shrink-0 shadow-xs transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-slate-400">
              <span>
                Press <kbd className="px-1 py-0.5 rounded border border-slate-200 bg-slate-100 font-mono text-[10px]">Enter</kbd> to send, <kbd className="px-1 py-0.5 rounded border border-slate-200 bg-slate-100 font-mono text-[10px]">Shift+Enter</kbd> for newline
              </span>
              <span className="hidden sm:inline">
                {agent ? 'Agent loop enabled (ReAct planner)' : 'Standard RAG & direct routing'}
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
