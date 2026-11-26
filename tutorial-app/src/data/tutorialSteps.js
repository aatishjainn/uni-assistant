// Comprehensive 8-chapter interactive tour covering every feature in Uni-Assistant.
// Each step can specify a `target` ([data-tour="..."]), `chapter`, `title`, `description`,
// `actionHint`, `setup(ctx)` (called automatically on step entry), and optional `demoAction`.

export const TUTORIAL_CHAPTERS = [
  { id: 1, title: 'Authentication & Personas', badge: 'Entry' },
  { id: 2, title: 'Standard Chat & Hybrid RAG', badge: 'AI Chat' },
  { id: 3, title: 'Autonomous Agent Mode (ReAct)', badge: 'Agent' },
  { id: 4, title: 'Zero-Trust Privacy & RBAC', badge: 'Security' },
  { id: 5, title: 'Campus Wayfinding & Floor Plans', badge: 'Maps' },
  { id: 6, title: 'HOD Department Portal', badge: 'HOD' },
  { id: 7, title: 'Admin Control Center', badge: 'Admin' },
  { id: 8, title: 'Sandbox & Summary', badge: 'Finish' },
];

export const TUTORIAL_STEPS = [
  // ---------------- CHAPTER 1: AUTHENTICATION & PERSONAS ----------------
  {
    id: 'welcome',
    chapter: 1,
    title: 'Welcome to Uni-Assistant Tutorial Mode',
    description:
      'This interactive walkthrough guides you through every feature of the University Smart Assistant — from Hybrid RAG chat and ReAct Agent reasoning to Dijkstra campus wayfinding, HOD workflows, and Admin controls. Everything runs live with realistic university data.',
    actionHint: 'Click "Next" to begin with Authentication & Role Personas.',
    target: null,
    setup: (ctx) => ctx.goToLogin(),
  },
  {
    id: 'login-auth',
    chapter: 1,
    title: 'Institutional Sign-In & Applicant Registration',
    description:
      'Students, teachers, HODs, and admins sign in with institutional credentials. Prospective students can switch to "New Applicant" to self-register and immediately ask admissions questions.',
    actionHint: 'Try toggling between Sign In and New Applicant, or click Next.',
    target: '[data-tour="login-tabs"]',
    setup: (ctx) => ctx.goToLogin(),
  },
  {
    id: 'login-personas',
    chapter: 1,
    title: 'Role-Based Test Personas & Public Map',
    description:
      'Uni-Assistant enforces strict Role-Based Access Control (RBAC) across 6 roles. Click any persona card to pre-fill credentials, or use "Interactive Campus Map" below to navigate campus without signing in.',
    actionHint: 'Click Next to sign in automatically as Riya Patel (BCA Semester 4 Student).',
    target: '[data-tour="login-personas"]',
    setup: (ctx) => ctx.goToLogin(),
  },

  // ---------------- CHAPTER 2: STANDARD CHAT & HYBRID RAG ----------------
  {
    id: 'chat-workspace',
    chapter: 2,
    title: 'Conversational AI Workspace & History',
    description:
      'Signed in as Riya Patel! The sidebar stores persistent chat sessions, lets you start a New Conversation, displays your verified role badge, and gives quick access to Campus Wayfinding.',
    actionHint: 'Notice your Student role badge and saved conversation history on the left.',
    target: '[data-tour="chat-sidebar"]',
    setup: (ctx) => ctx.enterChatAs('student1@uni.test', { resetMessages: true, agent: false, mode: 'simple' }),
  },
  {
    id: 'chat-detail-toggle',
    chapter: 2,
    title: 'Concise vs. In-Depth Explanation Modes',
    description:
      'Switch between "Concise" for quick summaries and "In-Depth" for step-by-step academic tutoring with worked examples. Let’s send an academic study question in In-Depth mode!',
    actionHint: 'Watch the assistant answer with structured Markdown and syllabus citations.',
    target: '[data-tour="detail-mode-toggle"]',
    setup: (ctx) => ctx.enterChatAs('student1@uni.test', { resetMessages: true, agent: false, mode: 'detailed' }),
    demoLabel: 'Run Normalization Demo',
    demoAction: (ctx) => ctx.runDemoChat('Explain 1NF, 2NF and 3NF with a simple practical example.', { mode: 'detailed', agent: false }),
  },
  {
    id: 'chat-rag-sources',
    chapter: 2,
    title: 'Hybrid RAG & Verified Source Citations',
    description:
      'The backend combines PostgreSQL full-text search (tsvector) and 768-dim pgvector semantic search via Reciprocal Rank Fusion (RRF), attaching exact document & page citations plus Thumbs Up/Down feedback.',
    actionHint: 'Check the "Verified Sources" pills and feedback buttons under the assistant reply.',
    target: '[data-tour="rag-sources"]',
    setup: (ctx) =>
      ctx.ensureChatDemo('Explain 1NF, 2NF and 3NF with a simple practical example.', {
        mode: 'detailed',
        agent: false,
      }),
  },

  // ---------------- CHAPTER 3: AUTONOMOUS AGENT MODE ----------------
  {
    id: 'agent-toggle',
    chapter: 3,
    title: 'Autonomous Agent Mode (ReAct Loop)',
    description:
      'Standard mode handles single-turn queries fast. Enabling "Agent Mode" activates a multi-step ReAct planner that breaks compound questions into tool calls, queries live records, and runs a Hallucination & Number Grounding check.',
    actionHint: 'Agent Mode is now ON (emerald pill). Let’s run a compound multi-tool question!',
    target: '[data-tour="agent-toggle"]',
    setup: (ctx) => ctx.enterChatAs('student1@uni.test', { resetMessages: true, agent: true, mode: 'simple' }),
  },
  {
    id: 'agent-trace',
    chapter: 3,
    title: 'Inspectable Agent Trace & Self-Correction',
    description:
      'Every Agent answer exposes its full "Agent Execution Plan": internal thoughts, tool invocations with latency (ms), and an automated Self-Correction pass whenever ungrounded numbers are caught.',
    actionHint: 'Scroll through the expanded trace steps, or click "Open Campus Map Route" below.',
    target: '[data-tour="agent-trace"]',
    setup: (ctx) =>
      ctx.ensureChatDemo(
        'What is my attendance, which subjects am I at risk in, and where is my next class?',
        { agent: true, expandTrace: true }
      ),
    demoLabel: 'Re-run Agent Query',
    demoAction: (ctx) =>
      ctx.runDemoChat('What is my attendance, which subjects am I at risk in, and where is my next class?', {
        agent: true,
        expandTrace: true,
      }),
  },
  {
    id: 'agent-map-pill',
    chapter: 3,
    title: 'Deep-Linking from Chat to Campus Navigation',
    description:
      'When a query involves a classroom, lab, or office, tools emit a map target (`_ui.map`). Clicking "Open Campus Map Route" jumps directly to the interactive floor plan with your destination pre-selected.',
    actionHint: 'You can click the "Open Campus Map Route" button or continue with Next.',
    target: '[data-tour="chat-map-pill"]',
    setup: (ctx) =>
      ctx.ensureChatDemo(
        'What is my attendance, which subjects am I at risk in, and where is my next class?',
        { agent: true, expandTrace: false }
      ),
  },

  // ---------------- CHAPTER 4: ZERO-TRUST PRIVACY & RBAC ----------------
  {
    id: 'privacy-guard',
    chapter: 4,
    title: 'Deterministic Zero-Trust Student Privacy Fence',
    description:
      'If Riya Patel asks about Aman Singh’s attendance or marks, a deterministic privacy guard intercepts the prompt BEFORE any database query or LLM call runs — guaranteeing zero cross-student data leakage.',
    actionHint: 'See how the privacy guard blocked the cross-student request immediately.',
    target: '[data-tour="privacy-guard-response"]',
    setup: (ctx) =>
      ctx.ensureChatDemo("What is Aman Singh's attendance?", {
        agent: false,
        resetMessages: true,
      }),
  },
  {
    id: 'role-adaptation',
    chapter: 4,
    title: 'Role-Scoped Toolsets (Teacher & Staff)',
    description:
      'Switching roles dynamically swaps the AI tool registry. As Prof. Rahul Verma (Teacher), the assistant replaces student attendance tools with `teacher_next_class`, `teacher_timetable`, and `teacher_subjects`.',
    actionHint: 'Notice the emerald Teacher badge and faculty-specific prompt suggestions.',
    target: '[data-tour="user-role-badge"]',
    setup: (ctx) => ctx.enterChatAs('teacher@uni.test', { resetMessages: true, agent: true, mode: 'simple' }),
  },

  // ---------------- CHAPTER 5: CAMPUS WAYFINDING & FLOOR PLANS ----------------
  {
    id: 'campus-planner',
    chapter: 5,
    title: 'Dijkstra Campus Wayfinding Engine',
    description:
      'Welcome to Campus Wayfinding! A pure in-memory Dijkstra shortest-path graph routes across outdoor walkways, buildings, corridors, stairs, and elevators — calculating exact meters and walk time.',
    actionHint: 'Try swapping Start/End or picking any destination in the Campus Directory below.',
    target: '[data-tour="campus-route-planner"]',
    setup: (ctx) =>
      ctx.openMapView({ from: 'GATE', to: 'AB2_QR-AB2-ROOM-201-BCA', accessible: false, viewTab: 'floor' }),
  },
  {
    id: 'campus-qr',
    chapter: 5,
    title: 'Physical Door QR Code Location Verification',
    description:
      'Physical QR placards placed on doors (like `QR-GATE` or `QR-MB1-COMPUTER-LAB-1`) automatically set your "You Are Here" origin when scanned.',
    actionHint: 'Click one of the QR buttons (e.g. Library or Computer Lab 1) to simulate scanning!',
    target: '[data-tour="campus-qr-sim"]',
    setup: (ctx) =>
      ctx.openMapView({ at: 'QR-GATE', to: 'MB1_QR-MB1-COMPUTER-LAB-1', accessible: false, viewTab: 'floor' }),
  },
  {
    id: 'campus-accessible',
    chapter: 5,
    title: 'Step-Free Accessibility Routing (Elevators Only)',
    description:
      'Enabling "Step-free path" excludes stair edges in the Dijkstra graph and automatically re-routes via building elevators, updating distance and turn-by-turn steps in real time.',
    actionHint: 'Notice the "Step-Free" badge and elevator instructions in the directions card.',
    target: '[data-tour="campus-accessible-toggle"]',
    setup: (ctx) =>
      ctx.openMapView({ from: 'GATE', to: 'MB1_QR-MB1-COMPUTER-LAB-1', accessible: true, viewTab: 'floor' }),
  },
  {
    id: 'campus-floorplan',
    chapter: 5,
    title: 'Interactive Architectural SVG Floor Plans',
    description:
      'Each floor renders directly from graph coordinates with clickable rooms, Origin (green), Destination (red), and the active dashed route polyline. Click any room on the SVG to re-route instantly!',
    actionHint: 'Click any room rectangle on the floor plan or switch to Campus Overview above.',
    target: '[data-tour="campus-floorplan"]',
    setup: (ctx) =>
      ctx.openMapView({ from: 'GATE', to: 'MB1_QR-MB1-COMPUTER-LAB-1', accessible: true, viewTab: 'floor' }),
  },
  {
    id: 'campus-overview-map',
    chapter: 5,
    title: 'Geographic Campus Overview (Leaflet)',
    description:
      'Switch to "Campus Overview" for an interactive geographic map of Main Gate, Main Block, and Academic Block with outdoor walking paths and clickable building markers.',
    actionHint: 'Click Next to explore the HOD Department Portal.',
    target: '[data-tour="campus-view-toggle"]',
    setup: (ctx) =>
      ctx.openMapView({ from: 'GATE', to: 'MB1_QR-MB1-COMPUTER-LAB-1', accessible: true, viewTab: 'map' }),
  },

  // ---------------- CHAPTER 6: HOD DEPARTMENT PORTAL ----------------
  {
    id: 'hod-overview',
    chapter: 6,
    title: 'HOD Department Portal (Scoped Governance)',
    description:
      'Signed in as Dr. Meera Sharma (Head of Computer Science). All KPIs, faculty workloads, courses, and analytics are strictly scoped to her department — never leaking Management department data.',
    actionHint: 'Explore the 8 departmental management tabs on the left sidebar.',
    target: '[data-tour="hod-overview"]',
    setup: (ctx) => ctx.openHodView('Overview'),
  },
  {
    id: 'hod-pending',
    chapter: 6,
    title: 'Pending Action Items & Classroom Allocation',
    description:
      'HODs get live alerts for examinations missing classroom venues. Select a room from the dropdown and click "Assign Room" to resolve the pending action immediately.',
    actionHint: 'Try clicking "Assign Room" right now to see the pending badge update live!',
    target: '[data-tour="hod-pending"]',
    setup: (ctx) => ctx.openHodView('Pending'),
  },
  {
    id: 'hod-report',
    chapter: 6,
    title: 'Executive Department Reports & CSV Export',
    description:
      'HODs can generate printable executive summaries and export department subject performance metrics directly to CSV.',
    actionHint: 'Try clicking "Export CSV" or continue to the Admin Control Center.',
    target: '[data-tour="hod-report"]',
    setup: (ctx) => ctx.openHodView('Report'),
  },

  // ---------------- CHAPTER 7: ADMIN CONTROL CENTER ----------------
  {
    id: 'admin-users',
    chapter: 7,
    title: 'Admin Control Center · Users & RBAC',
    description:
      'Signed in as System Admin. Manage user accounts, filter by role, toggle account activation, and administer Departments, Courses, Subjects, Admissions, and Notices across 9 organized tabs.',
    actionHint: 'Try filtering users by role or toggling a user status button.',
    target: '[data-tour="admin-users"]',
    setup: (ctx) => ctx.openAdminView('Users'),
  },
  {
    id: 'admin-documents',
    chapter: 7,
    title: 'Hybrid RAG Knowledge Base Lifecycle',
    description:
      'Upload PDF/DOCX handbooks, syllabi, or policies with role-based visibility (`public`, `staff`, `admin`). Documents go through sentence-window chunking and pgvector embedding (`indexing` → `indexed`).',
    actionHint: 'Click "Simulate PDF/DOCX Ingestion" to watch the live indexing pipeline!',
    target: '[data-tour="admin-documents"]',
    setup: (ctx) => ctx.openAdminView('Documents'),
  },
  {
    id: 'admin-campus-qr',
    chapter: 7,
    title: 'Campus Directory & Printable QR Placards',
    description:
      'Manage campus building coordinates, room search keywords, public/staff visibility, and generate real scannable door QR placards for every location.',
    actionHint: 'Click "Preview QR" on any room to render a live scannable QR placard.',
    target: '[data-tour="admin-campus-qr"]',
    setup: (ctx) => ctx.openAdminView('Campus'),
  },
  {
    id: 'admin-analytics',
    chapter: 7,
    title: 'System Telemetry & Security Audit Analytics',
    description:
      'Monitor total conversations, user questions, blocked privacy attempts, indexed document health, user intent distributions, and 14-day query activity.',
    actionHint: 'Click Next to complete the tutorial and enter Free Sandbox Mode.',
    target: '[data-tour="admin-analytics"]',
    setup: (ctx) => ctx.openAdminView('Analytics'),
  },

  // ---------------- CHAPTER 8: SUMMARY & SANDBOX ----------------
  {
    id: 'complete',
    chapter: 8,
    title: 'Tour Complete — Free Interactive Sandbox!',
    description:
      'You have explored every major capability of Uni-Assistant: Dual-Mode AI Chat, Hybrid RAG, ReAct Agent Tracing, Zero-Trust Privacy Guards, Dijkstra Campus Wayfinding, HOD Portal, and Admin Control Center. Feel free to keep experimenting or jump back to any chapter anytime!',
    actionHint: 'Minimize this card to explore freely, or click Restart Tour.',
    target: null,
    setup: (ctx) => ctx.enterChatAs('student1@uni.test', { resetMessages: true, agent: true, mode: 'simple' }),
  },
];
