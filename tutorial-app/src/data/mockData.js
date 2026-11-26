// Standalone authentic mock data & client-side engines (Dijkstra campus router + AI/RAG/Agent simulator)
// Mirrors the exact seeded dataset of Uni-Assistant so the tutorial works 100% offline with zero backend needed.

export const PERSONAS = [
  {
    id: 'u-student-1',
    full_name: 'Riya Patel',
    role: 'student',
    label: 'Student',
    email: 'student1@uni.test',
    desc: 'BCA · Semester 4 · Room 201',
    student_number: 'BCA2023001',
  },
  {
    id: 'u-student-2',
    full_name: 'Aman Singh',
    role: 'student',
    label: 'Student',
    email: 'student2@uni.test',
    desc: 'BCA · Semester 4',
    student_number: 'BCA2023002',
  },
  {
    id: 'u-teacher-1',
    full_name: 'Prof. Rahul Verma',
    role: 'teacher',
    label: 'Teacher',
    email: 'teacher@uni.test',
    desc: 'Computer Science Faculty',
    employee_number: 'EMP001',
  },
  {
    id: 'u-hod-1',
    full_name: 'Dr. Meera Sharma',
    role: 'hod',
    label: 'HOD',
    email: 'hod@uni.test',
    desc: 'Head of Computer Science',
    employee_number: 'HOD001',
  },
  {
    id: 'u-admin-1',
    full_name: 'System Admin',
    role: 'admin',
    label: 'Admin',
    email: 'admin@uni.test',
    desc: 'Full System Control',
  },
];

// ---------------------------------------------------------------------------
// Campus Graph & Pure JS Dijkstra Router (mirrors backend/scripts/campusSeed.js)
// ---------------------------------------------------------------------------
const FLOOR_NAMES = ['Ground Floor', '1st Floor', '2nd Floor', '3rd Floor'];
const floorLabel = (f) => FLOOR_NAMES[f] || `${f}th Floor`;
const euclid = (a, b) => Math.max(1, Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 10) / 10);

export const CAMPUS_BUILDINGS = [
  {
    id: 'b-gate',
    name: 'Main Gate',
    building_name: 'Main Gate',
    lat: 23.2594,
    lng: 77.412,
    latitude: 23.2594,
    longitude: 77.412,
    description: 'Main entrance of the campus',
    floors: [0],
    place_count: 1,
  },
  {
    id: 'b-main',
    name: 'Main Block',
    building_name: 'Main Block',
    lat: 23.2599,
    lng: 77.4126,
    latitude: 23.2599,
    longitude: 77.4126,
    description: 'Administration, library, computer labs, examination department and HOD office',
    floors: [0, 1, 2],
    place_count: 10,
  },
  {
    id: 'b-acad',
    name: 'Academic Block',
    building_name: 'Academic Block',
    lat: 23.2606,
    lng: 77.4135,
    latitude: 23.2606,
    longitude: 77.4135,
    description: 'Classrooms and cafeteria',
    floors: [0, 1, 2, 3],
    place_count: 5,
  },
];

function buildCampusGraph() {
  const nodes = [];
  const edges = [];
  const byKey = {};
  const bMap = Object.fromEntries(CAMPUS_BUILDINGS.map((b) => [b.id, b]));

  const addNode = ({ key, building_id, floor, name, type, x, y, qr_code = null, keywords = '', is_public = true }) => {
    const b = bMap[building_id];
    const node = {
      id: key,
      building_id,
      building: b.name,
      building_name: b.name,
      lat: b.lat,
      lng: b.lng,
      floor,
      floor_number: floor,
      floor_label: floorLabel(floor),
      name,
      node_name: name,
      type,
      x,
      y,
      qr_code,
      keywords,
      is_public,
    };
    nodes.push(node);
    byKey[key] = node;
    return node;
  };

  const addEdge = (aKey, bKey, dist = null, accessible = true) => {
    const a = byKey[aKey];
    const b = byKey[bKey];
    const d = dist ?? euclid(a, b);
    edges.push({ a: aKey, b: bKey, distance: d, accessible });
    edges.push({ a: bKey, b: aKey, distance: d, accessible });
  };

  const addFloor = (prefix, building_id, floor, cfg) => {
    const bName = bMap[building_id].name;
    cfg.j.forEach((x, i) => {
      addNode({
        key: `${prefix}_J${i}`,
        building_id,
        floor,
        name: `${bName} ${floorLabel(floor)} corridor`,
        type: 'junction',
        x,
        y: 15,
      });
      if (i > 0) addEdge(`${prefix}_J${i - 1}`, `${prefix}_J${i}`);
    });
    const last = cfg.j.length - 1;
    addNode({
      key: `${prefix}_ST`,
      building_id,
      floor,
      name: `${bName} stairs (${floorLabel(floor)})`,
      type: 'stairs',
      x: cfg.stairs,
      y: 15,
      qr_code: `QR-${prefix}-STAIRS`,
    });
    addEdge(`${prefix}_ST`, `${prefix}_J0`);
    addNode({
      key: `${prefix}_LIFT`,
      building_id,
      floor,
      name: `${bName} lift (${floorLabel(floor)})`,
      type: 'lift',
      x: cfg.lift,
      y: 15,
      qr_code: `QR-${prefix}-LIFT`,
    });
    addEdge(`${prefix}_LIFT`, `${prefix}_J${last}`);

    (cfg.rooms || []).forEach(([name, x, y, ji, qr, keywords, is_public = true]) => {
      const key = `${prefix}_${qr}`;
      addNode({ key, building_id, floor, name, type: 'room', x, y, qr_code: qr, keywords, is_public });
      addEdge(key, `${prefix}_J${ji}`);
    });

    if (cfg.entrance) {
      const [x, y, ji, qr] = cfg.entrance;
      const key = `${prefix}_ENT`;
      addNode({
        key,
        building_id,
        floor,
        name: `${bName} Entrance`,
        type: 'entrance',
        x,
        y,
        qr_code: qr,
        keywords: 'entrance door main',
      });
      addEdge(key, `${prefix}_J${ji}`);
    }
  };

  addNode({
    key: 'GATE',
    building_id: 'b-gate',
    floor: 0,
    name: 'Main Gate',
    type: 'entrance',
    x: 0,
    y: 0,
    qr_code: 'QR-GATE',
    keywords: 'entrance gate campus',
  });

  // Main Block floors 0-2
  const mbJ = [10, 30, 50];
  addFloor('MB0', 'b-main', 0, {
    j: mbJ,
    stairs: 4,
    lift: 56,
    entrance: [30, 28, 1, 'QR-MB-ENTRANCE'],
    rooms: [
      ['Library', 10, 5, 0, 'QR-MB0-LIBRARY', 'books reading room study'],
      ['Seminar Hall', 30, 5, 1, 'QR-MB0-SEMINAR-HALL', 'auditorium hall events seminar'],
      ['Administrative Office', 50, 5, 2, 'QR-MB0-ADMINISTRATIVE-OFFICE', 'admin office fees'],
    ],
  });
  addFloor('MB1', 'b-main', 1, {
    j: mbJ,
    stairs: 4,
    lift: 56,
    rooms: [
      ['Computer Lab 1', 10, 5, 0, 'QR-MB1-COMPUTER-LAB-1', 'lab1 cs computers practical'],
      ['Computer Lab 2', 30, 5, 1, 'QR-MB1-COMPUTER-LAB-2', 'lab2 computers practical'],
      ['Examination Department', 50, 5, 2, 'QR-MB1-EXAMINATION-DEPARTMENT', 'exam controller hall ticket'],
      ['Server Room', 30, 25, 1, 'QR-MB1-SERVER-ROOM', 'it servers network', false],
    ],
  });
  addFloor('MB2', 'b-main', 2, {
    j: mbJ,
    stairs: 4,
    lift: 56,
    rooms: [
      ['HOD Office - Computer Science', 10, 5, 0, 'QR-MB2-HOD-OFFICE', 'hod head of department cs'],
      ['Staff Room', 30, 5, 1, 'QR-MB2-STAFF-ROOM', 'faculty teachers staff', false],
    ],
  });

  // Academic Block floors 0-3
  const abJ = [8, 20, 32];
  addFloor('AB0', 'b-acad', 0, {
    j: abJ,
    stairs: 2,
    lift: 38,
    entrance: [20, 28, 1, 'QR-AB-ENTRANCE'],
    rooms: [['Cafeteria', 20, 5, 1, 'QR-AB0-CAFETERIA', 'canteen food cafe snacks']],
  });
  addFloor('AB1', 'b-acad', 1, { j: abJ, stairs: 2, lift: 38, rooms: [] });
  addFloor('AB2', 'b-acad', 2, {
    j: abJ,
    stairs: 2,
    lift: 38,
    rooms: [
      ['Room 201 (BCA)', 8, 5, 0, 'QR-AB2-ROOM-201-BCA', 'bca classroom class 201'],
      ['Room 202 (BCA)', 20, 5, 1, 'QR-AB2-ROOM-202-BCA', 'bca classroom class 202'],
      ['Room 203 (MCA)', 32, 5, 2, 'QR-AB2-ROOM-203-MCA', 'mca classroom class 203'],
    ],
  });
  addFloor('AB3', 'b-acad', 3, {
    j: abJ,
    stairs: 2,
    lift: 38,
    rooms: [['Room 301 (BBA)', 8, 5, 0, 'QR-AB3-ROOM-301-BBA', 'bba classroom class 301']],
  });

  // Vertical connections: stairs (not accessible) vs lifts (accessible)
  for (const [p, top] of [['MB', 2], ['AB', 3]]) {
    for (let f = 0; f < top; f++) {
      addEdge(`${p}${f}_ST`, `${p}${f + 1}_ST`, 12, false);
      addEdge(`${p}${f}_LIFT`, `${p}${f + 1}_LIFT`, 8, true);
    }
  }

  // Outdoor walkways between buildings
  addEdge('GATE', 'MB0_ENT', 68, true);
  addEdge('GATE', 'AB0_ENT', 145, true);
  addEdge('MB0_ENT', 'AB0_ENT', 110, true);

  return { nodes, edges, byKey };
}

export const CAMPUS_GRAPH = buildCampusGraph();

export function getCampusPlaces(query = '') {
  const q = query.trim().toLowerCase();
  return CAMPUS_GRAPH.nodes
    .filter((n) => n.type === 'room' || n.type === 'entrance')
    .filter((n) => {
      if (!q) return true;
      return (
        n.name.toLowerCase().includes(q) ||
        n.building.toLowerCase().includes(q) ||
        n.keywords.toLowerCase().includes(q) ||
        (n.qr_code || '').toLowerCase().includes(q)
      );
    });
}

export function getCampusFloorPlan(buildingId, floor) {
  const building = CAMPUS_BUILDINGS.find((b) => b.id === buildingId);
  if (!building) return null;
  const nodes = CAMPUS_GRAPH.nodes.filter((n) => n.building_id === buildingId && n.floor === floor);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const seen = new Set();
  const edges = [];
  for (const e of CAMPUS_GRAPH.edges) {
    if (nodeIds.has(e.a) && nodeIds.has(e.b)) {
      const k = e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`;
      if (!seen.has(k)) {
        seen.add(k);
        edges.push({ a: e.a, b: e.b, distance: e.distance });
      }
    }
  }
  return { building, floor, floor_label: floorLabel(floor), nodes, edges };
}

export function computeCampusRoute(fromId, toId, accessible = false) {
  if (!fromId || !toId) return null;
  const dist = {};
  const prev = {};
  const visited = new Set();
  const adj = {};

  for (const n of CAMPUS_GRAPH.nodes) {
    dist[n.id] = Infinity;
    adj[n.id] = [];
  }
  for (const e of CAMPUS_GRAPH.edges) {
    if (accessible && !e.accessible) continue;
    adj[e.a].push({ to: e.b, w: e.distance });
  }
  dist[fromId] = 0;

  const queue = [{ id: fromId, d: 0 }];
  while (queue.length > 0) {
    queue.sort((a, b) => a.d - b.d);
    const cur = queue.shift();
    if (visited.has(cur.id)) continue;
    visited.add(cur.id);
    if (cur.id === toId) break;
    for (const edge of adj[cur.id] || []) {
      const alt = dist[cur.id] + edge.w;
      if (alt < dist[edge.to]) {
        dist[edge.to] = alt;
        prev[edge.to] = cur.id;
        queue.push({ id: edge.to, d: alt });
      }
    }
  }

  if (!Number.isFinite(dist[toId])) return null;
  const path = [];
  let u = toId;
  while (u) {
    path.unshift(CAMPUS_GRAPH.byKey[u]);
    u = prev[u];
  }

  // Generate human-friendly turn-by-turn directions
  const steps = [];
  steps.push({ text: `Start at ${path[0].name} (${path[0].building}, ${path[0].floor_label}).` });
  for (let i = 1; i < path.length; i++) {
    const p0 = path[i - 1];
    const p1 = path[i];
    if (p0.building_id !== p1.building_id) {
      steps.push({ text: `Walk outdoors toward ${p1.building} (${p1.name}).` });
    } else if (p0.floor !== p1.floor) {
      const modeText = p1.type === 'lift' ? 'Take the elevator (step-free)' : 'Take the stairs';
      steps.push({ text: `${modeText} to ${p1.floor_label}.` });
    } else if (i === path.length - 1) {
      steps.push({ text: `Proceed along the ${p1.floor_label} corridor and arrive at ${p1.name}.` });
    } else if (p1.type === 'lift' || p1.type === 'stairs') {
      steps.push({ text: `Walk along the corridor to the ${p1.type === 'lift' ? 'elevator lobby' : 'stairwell'}.` });
    }
  }

  const totalDist = Math.round(dist[toId]);
  const minutes = Math.max(1, Math.round(totalDist / 72));
  return {
    from: path[0],
    to: path[path.length - 1],
    distance_m: totalDist,
    minutes,
    accessible,
    path,
    steps,
  };
}

// ---------------------------------------------------------------------------
// Initial Chat Sessions & Smart Mock AI Simulator
// ---------------------------------------------------------------------------
export const INITIAL_SESSIONS = [
  {
    id: 'sess-demo-1',
    session_title: 'BCA Sem 4 Exam Guidelines',
    messages: [
      {
        id: 'm-1',
        sender: 'user',
        message: 'What are the minimum attendance requirements to appear for semester exams?',
      },
      {
        id: 'm-2',
        sender: 'assistant',
        message:
          'According to university examination regulations, students must maintain at least **75% attendance** across lectures and practical labs in each subject to be eligible for end-semester examinations.\n\n- **65% – 74%**: Eligible only with approved medical condonation.\n- **Below 65%**: Detained from appearing in that subject examination.',
        source_metadata: {
          sources: [
            { n: 1, title: 'Examination_Procedures.pdf', page: 3 },
            { n: 2, title: 'Student_Handbook.docx', page: 11 },
          ],
        },
        feedback_rating: 5,
      },
    ],
  },
];

export function simulateChatResponse(rawMessage, user, mode = 'simple', agent = false) {
  const q = rawMessage.toLowerCase().trim();
  const role = user?.role || 'student';

  // 1. Deterministic Zero-Trust Cross-Student Guard
  const otherStudentNames = ['aman', 'ananya', 'rohan', 'sneha', 'karan', 'priya', 'vikas', 'isha', 'arjun'];
  const mentionsOtherStudent =
    role === 'student' &&
    ((user.email === 'student1@uni.test' && otherStudentNames.some((n) => q.includes(n))) ||
      (user.email === 'student2@uni.test' && (q.includes('riya') || q.includes('ananya'))));

  if (mentionsOtherStudent || q.includes('other student') || q.includes("someone else's")) {
    return {
      blocked: true,
      answer:
        '🔒 **Zero-Trust Privacy Guard Triggered**\n\nAccess denied: Your request references another student\'s personal academic records. Under institutional zero-trust isolation, `student` tokens are strictly scoped to your own `user_id` and blocked deterministically **before** reaching any database tool or AI model.',
      sources: [],
      ui: null,
      trace: null,
    };
  }

  // 2. Autonomous Agent Compound Query (Attendance + At-Risk + Next Class)
  if (
    agent ||
    (q.includes('attendance') && (q.includes('next class') || q.includes('risk')))
  ) {
    if (role === 'student') {
      const isRiya = user.email === 'student1@uni.test';
      const overall = isRiya ? '90%' : '50%';
      const answer = isRiya
        ? `### Personal Academic & Schedule Summary (Riya Patel)\n\n| Subject | Code | Attendance | Status |\n|---|---|---|---|\n| Database Management Systems | \`BCA401\` | **90%** (9/10) | ✅ Safe |\n| Python Programming | \`BCA402\` | **90%** (9/10) | ✅ Safe |\n| Computer Networks | \`BCA403\` | **90%** (9/10) | ✅ Safe |\n\n- **Overall Attendance:** **90%** — No subjects are at risk (minimum threshold is 75%).\n- **Next Class:** **Python Programming** (\`BCA402\`) with Prof. Rahul Verma at **11:00 – 12:00** in **Computer Lab 1** (Main Block, 1st Floor).`
        : `### Personal Academic & Schedule Summary (Aman Singh)\n\n| Subject | Code | Attendance | Status |\n|---|---|---|---|\n| Database Management Systems | \`BCA401\` | **50%** (5/10) | ⚠️ At Risk |\n| Python Programming | \`BCA402\` | **50%** (5/10) | ⚠️ At Risk |\n| Computer Networks | \`BCA403\` | **50%** (5/10) | ⚠️ At Risk |\n\n- **Overall Attendance:** **50%** — All 3 subjects are currently below the **75%** exam eligibility threshold.\n- **Next Class:** **Database Management Systems** (\`BCA401\`) at **10:00 – 11:00** in **Room 201 (BCA)** (Academic Block, 2nd Floor).`;

      return {
        answer,
        sources: [{ n: 1, title: 'Examination_Procedures.pdf', page: 3 }],
        ui: { map: { to: isRiya ? 'MB1_QR-MB1-COMPUTER-LAB-1' : 'AB2_QR-AB2-ROOM-201-BCA' } },
        trace: [
          {
            step: 1,
            thought: 'The user wants their current attendance, at-risk subjects, and next class location. I will fetch student attendance and next class records.',
            calls: [
              {
                tool: 'student_attendance',
                args: {},
                ok: true,
                ms: 14,
                summary: `Returned 3 enrolled subjects (${overall} overall)`,
              },
              {
                tool: 'student_next_class',
                args: {},
                ok: true,
                ms: 11,
                summary: isRiya
                  ? 'BCA402 Python Programming · Computer Lab 1 (Main Block, 1st Floor)'
                  : 'BCA401 DBMS · Room 201 (Academic Block, 2nd Floor)',
              },
            ],
          },
          {
            step: 2,
            thought: 'Verify attendance policy threshold from institutional documents and ground all numeric values.',
            calls: [
              {
                tool: 'search_knowledge_base',
                args: { query: 'minimum attendance threshold' },
                ok: true,
                ms: 28,
                summary: 'Matched Examination_Procedures.pdf p.3 (75% threshold)',
              },
            ],
            repair: {
              unsupported_numbers: ['78%'],
            },
          },
        ],
      };
    }

    if (role === 'teacher') {
      return {
        answer:
          '### Teaching Schedule & Next Lecture (Prof. Rahul Verma)\n\n- **Next Class:** **Python Programming (`BCA402`)** · Today **11:00 – 12:00** in **Computer Lab 1** (Main Block, 1st Floor).\n- **Assigned Subjects:** `BCA401` (Database Management Systems), `BCA402` (Python Programming).',
        sources: [],
        ui: { map: { to: 'MB1_QR-MB1-COMPUTER-LAB-1' } },
        trace: [
          {
            step: 1,
            thought: 'Fetch the signed-in teacher’s next lecture and assigned subjects.',
            calls: [
              { tool: 'teacher_next_class', args: {}, ok: true, ms: 12, summary: 'BCA402 at Computer Lab 1' },
              { tool: 'teacher_subjects', args: {}, ok: true, ms: 9, summary: '2 subjects (BCA401, BCA402)' },
            ],
          },
        ],
      };
    }

    if (role === 'hod') {
      return {
        answer:
          '### Computer Science Department Snapshot (Dr. Meera Sharma)\n\n- **Faculty:** 3 active faculty members\n- **Enrolled Students:** 19 across BCA & MCA\n- **Pending Action Items:** **1** examination (`Special Practical Assessment` for `BCA401`) still requires classroom allocation.\n\nOpen the **HOD Department Portal** in the left sidebar to assign a classroom venue immediately.',
        sources: [],
        ui: null,
        trace: [
          {
            step: 1,
            thought: 'Retrieve department overview and pending action counts for the signed-in HOD.',
            calls: [
              { tool: 'hod_department_overview', args: {}, ok: true, ms: 16, summary: '3 faculty, 19 students, 2 courses' },
              { tool: 'hod_pending_activities', args: {}, ok: true, ms: 11, summary: '1 unassigned exam room' },
            ],
          },
        ],
      };
    }
  }

  // 3. Normalization / Academic Explanation (Demonstrates Concise vs In-Depth)
  if (q.includes('1nf') || q.includes('normal') || q.includes('dbms')) {
    if (mode === 'detailed') {
      return {
        answer:
          '### Database Normalization: 1NF, 2NF & 3NF (In-Depth)\n\nNormalization systematically eliminates data redundancy and update anomalies.\n\n1. **First Normal Form (1NF)** — *Atomic values & no repeating groups*\n   - Every cell must hold a single scalar value, and every row must be uniquely identifiable.\n   - *Example:* Instead of storing `subjects = "DBMS, Python"` in one cell, split into separate rows per `(student_id, subject_code)`.\n\n2. **Second Normal Form (2NF)** — *In 1NF + no partial dependency*\n   - Every non-key attribute must depend on the **entire** primary key (relevant for composite keys).\n   - *Example:* In `(student_id, subject_id, student_name)`, `student_name` depends only on `student_id`. Move `student_name` to a `Students` table.\n\n3. **Third Normal Form (3NF)** — *In 2NF + no transitive dependency*\n   - Non-key columns must depend *only* on the primary key, not on another non-key column.\n   - *Example:* If `Students` has `(student_id, dept_id, dept_name)`, `dept_name` depends on `dept_id`. Move it to `Departments`.',
        sources: [{ n: 1, title: 'BCA_Semester4_Syllabus.pdf', page: 2 }],
        ui: null,
      };
    }
    return {
      answer:
        '### Database Normalization (Concise)\n\n- **1NF:** Atomic values only — no comma-separated lists or repeating columns.\n- **2NF:** Satisfies 1NF, and non-key attributes depend on the *whole* primary key.\n- **3NF:** Satisfies 2NF, with no transitive dependencies between non-key columns.\n\n> **Practical Tip:** Switch the top-right toggle to **In-Depth** for worked table examples!',
      sources: [{ n: 1, title: 'BCA_Semester4_Syllabus.pdf', page: 2 }],
      ui: null,
    };
  }

  // 4. MCQs
  if (q.includes('mcq') || q.includes('quiz') || q.includes('question')) {
    return {
      answer:
        '### Practice MCQs — Database Management Systems\n\n1. **Which normal form removes transitive dependencies?**\n   A) 1NF  B) 2NF  **C) 3NF**  D) Unnormalized\n2. **Which SQL clause filters grouped rows after `GROUP BY`?**\n   A) `WHERE`  **B) `HAVING`**  C) `ORDER BY`  D) `DISTINCT`\n3. **Which property of ACID ensures a transaction is all-or-nothing?**\n   **A) Atomicity**  B) Consistency  C) Isolation  D) Durability',
      sources: [{ n: 1, title: 'BCA_Semester4_Syllabus.pdf', page: 4 }],
      ui: null,
    };
  }

  // 5. Campus Directions
  if (q.includes('where is') || q.includes('get there') || q.includes('direction') || q.includes('lab 1') || q.includes('room 201')) {
    const isLab = q.includes('lab');
    const targetId = isLab ? 'MB1_QR-MB1-COMPUTER-LAB-1' : 'AB2_QR-AB2-ROOM-201-BCA';
    const targetName = isLab ? 'Computer Lab 1 (Main Block, 1st Floor)' : 'Room 201 (BCA) (Academic Block, 2nd Floor)';
    return {
      answer: `### Walking Directions to ${targetName}\n\n1. Start at **Main Gate** and walk along the main campus pathway.\n2. Enter **${isLab ? 'Main Block' : 'Academic Block'}** at the Ground Floor entrance.\n3. Take the **stairs or elevator** to **${isLab ? '1st Floor' : '2nd Floor'}**.\n4. Follow the corridor to **${targetName}**.\n\nClick the button below to view the interactive SVG floor plan and step-free route!`,
      sources: [],
      ui: { map: { from: 'GATE', to: targetId } },
    };
  }

  // 6. Attendance / Next Class / Marks / Exams (Standard Mode)
  if (q.includes('attendance')) {
    return {
      answer:
        'Your overall attendance for **BCA Semester 4** is **90%** across `BCA401`, `BCA402`, and `BCA403`. All subjects meet the 75% exam eligibility requirement.',
      sources: [],
      ui: null,
    };
  }

  if (q.includes('library') || q.includes('hostel') || q.includes('policy')) {
    return {
      answer:
        '### Library & Campus Policy Highlights\n\n- **Standard Hours:** 8:30 AM – 6:00 PM (Mon–Sat)\n- **Exam Period Extended Hours:** Open until **8:00 PM** (per latest bulletin notice)\n- **Borrowing Limit:** Up to 4 textbooks for 14 days with student ID card.',
      sources: [{ n: 1, title: 'Hostel_and_Library_Policy.pdf', page: 2 }],
      ui: null,
    };
  }

  // 7. Generic Sandbox Reply
  return {
    answer: `*(Tutorial Sandbox Simulation)* Received your query: **"${rawMessage}"**.\n\nIn the live stack, the **Orchestrator** routes this to either PostgreSQL role-scoped tools (for \`${role}\` records), **Hybrid RAG** (pgvector + tsvector RRF over PDF/DOCX documents), or the **ReAct Agent Loop** when Agent Mode is enabled.\n\nTry asking:\n- *"What is my current attendance percentage and where is my next class?"*\n- *"Explain 1NF, 2NF and 3NF with a simple practical example."*\n- *"Where is Computer Lab 1 and how do I get there from the main gate?"*\n- *"What is Aman Singh's attendance?"* (tests Zero-Trust Privacy Guard!)`,
    sources: [{ n: 1, title: 'Student_Handbook.docx', page: 1 }],
    ui: null,
  };
}

// ---------------------------------------------------------------------------
// Initial HOD Portal Dataset
// ---------------------------------------------------------------------------
export const INITIAL_HOD_DATA = {
  overview: {
    department: { id: 'dept-cs', name: 'Computer Science' },
    counts: {
      faculty: 3,
      students: 19,
      courses: 2,
      subjects: 9,
      upcoming_exams: 10,
      pending_activities: 1,
    },
  },
  faculty: {
    faculty: [
      {
        id: 'fac-1',
        full_name: 'Prof. Rahul Verma',
        employee_number: 'EMP001',
        email: 'teacher@uni.test',
        weekly_classes: 6,
        subjects: [
          { code: 'BCA401', name: 'Database Management Systems', semester: 4 },
          { code: 'BCA402', name: 'Python Programming', semester: 4 },
        ],
      },
      {
        id: 'fac-2',
        full_name: 'Prof. Neha Gupta',
        employee_number: 'EMP002',
        email: 'teacher2@uni.test',
        weekly_classes: 6,
        subjects: [
          { code: 'BCA403', name: 'Computer Networks', semester: 4 },
          { code: 'MCA201', name: 'Advanced Java', semester: 2 },
        ],
      },
      {
        id: 'fac-3',
        full_name: 'Prof. Sanjay Rao',
        employee_number: 'EMP003',
        email: 'teacher3@uni.test',
        weekly_classes: 8,
        subjects: [
          { code: 'BCA201', name: 'C Programming', semester: 2 },
          { code: 'MCA202', name: 'Cloud Computing', semester: 2 },
          { code: 'MCA203', name: 'Machine Learning', semester: 2 },
        ],
      },
    ],
  },
  courses: {
    courses: [
      {
        id: 'crs-bca',
        course_name: 'BCA',
        duration_years: 3,
        subject_count: 6,
        student_count: 14,
        subjects: [
          { id: 'sub-bca401', subject_code: 'BCA401', subject_name: 'Database Management Systems', semester: 4, teacher: 'Prof. Rahul Verma' },
          { id: 'sub-bca402', subject_code: 'BCA402', subject_name: 'Python Programming', semester: 4, teacher: 'Prof. Rahul Verma' },
          { id: 'sub-bca403', subject_code: 'BCA403', subject_name: 'Computer Networks', semester: 4, teacher: 'Prof. Neha Gupta' },
          { id: 'sub-bca201', subject_code: 'BCA201', subject_name: 'C Programming', semester: 2, teacher: 'Prof. Sanjay Rao' },
        ],
      },
      {
        id: 'crs-mca',
        course_name: 'MCA',
        duration_years: 2,
        subject_count: 3,
        student_count: 5,
        subjects: [
          { id: 'sub-mca201', subject_code: 'MCA201', subject_name: 'Advanced Java', semester: 2, teacher: 'Prof. Neha Gupta' },
          { id: 'sub-mca202', subject_code: 'MCA202', subject_name: 'Cloud Computing', semester: 2, teacher: 'Prof. Sanjay Rao' },
          { id: 'sub-mca203', subject_code: 'MCA203', subject_name: 'Machine Learning', semester: 2, teacher: 'Prof. Sanjay Rao' },
        ],
      },
    ],
  },
  schedule: {
    timetable: [
      { day: 'Monday', time: '09:00 – 10:00', subject: 'BCA401 · DBMS', teacher: 'Prof. Rahul Verma', room: 'Room 201 (BCA)' },
      { day: 'Tuesday', time: '11:00 – 12:00', subject: 'BCA402 · Python Programming', teacher: 'Prof. Rahul Verma', room: 'Computer Lab 1' },
      { day: 'Wednesday', time: '10:00 – 11:00', subject: 'BCA403 · Computer Networks', teacher: 'Prof. Neha Gupta', room: 'Room 201 (BCA)' },
      { day: 'Thursday', time: '14:00 – 15:00', subject: 'MCA203 · Machine Learning', teacher: 'Prof. Sanjay Rao', room: 'Computer Lab 2' },
    ],
    examinations: [
      {
        id: 'ex-1',
        subject_code: 'BCA401',
        subject_name: 'Database Management Systems',
        exam_type: 'Mid-Semester Exam',
        exam_date: '2026-12-06',
        start_time: '10:00',
        end_time: '13:00',
        room_number: 'Room 201 (BCA)',
        classroom_id: 'cr-201',
      },
      {
        id: 'ex-2',
        subject_code: 'BCA402',
        subject_name: 'Python Programming',
        exam_type: 'Mid-Semester Exam',
        exam_date: '2026-12-08',
        start_time: '10:00',
        end_time: '13:00',
        room_number: 'Computer Lab 1',
        classroom_id: 'cr-lab1',
      },
      {
        id: 'ex-pending-1',
        subject_code: 'BCA401',
        subject_name: 'Database Management Systems',
        exam_type: 'Special Practical Assessment',
        exam_date: '2026-12-16',
        start_time: '14:00',
        end_time: '16:00',
        room_number: null,
        classroom_id: null,
      },
    ],
  },
  classrooms: [
    { id: 'cr-201', room_number: 'Room 201 (BCA)', building_name: 'Academic Block', floor_number: 2 },
    { id: 'cr-202', room_number: 'Room 202 (BCA)', building_name: 'Academic Block', floor_number: 2 },
    { id: 'cr-lab1', room_number: 'Computer Lab 1', building_name: 'Main Block', floor_number: 1 },
    { id: 'cr-lab2', room_number: 'Computer Lab 2', building_name: 'Main Block', floor_number: 1 },
    { id: 'cr-hall', room_number: 'Seminar Hall', building_name: 'Main Block', floor_number: 0 },
  ],
  analytics: {
    average_attendance_pct: 82.4,
    at_risk_students: 3,
    average_marks_pct: 74.8,
    subject_breakdown: [
      { code: 'BCA401', name: 'Database Management Systems', attendance: 84, avg_marks: 76 },
      { code: 'BCA402', name: 'Python Programming', attendance: 88, avg_marks: 81 },
      { code: 'BCA403', name: 'Computer Networks', attendance: 79, avg_marks: 69 },
      { code: 'MCA203', name: 'Machine Learning', attendance: 86, avg_marks: 78 },
    ],
  },
  notices: [
    {
      id: 'hn-1',
      title: 'CS Department Hackathon 2026',
      content: 'Registrations are open for the annual Computer Science Hackathon. Open to BCA and MCA students.',
      category: 'Event',
      is_published: true,
      published_at: '2026-11-24',
    },
    {
      id: 'hn-2',
      title: 'Lab Record Submission Window',
      content: 'All BCA Sem 4 Python Programming lab journals must be verified before Mid-Semester exams.',
      category: 'Academic',
      is_published: true,
      published_at: '2026-11-22',
    },
  ],
};

// ---------------------------------------------------------------------------
// Initial Admin Portal Dataset
// ---------------------------------------------------------------------------
export const INITIAL_ADMIN_DATA = {
  users: [
    { id: 'u1', full_name: 'Dummy Admin', email: 'admin@uni.test', role_name: 'admin', is_active: true, department_name: 'Administration' },
    { id: 'u2', full_name: 'Dr. Meera Sharma', email: 'hod@uni.test', role_name: 'hod', is_active: true, department_name: 'Computer Science' },
    { id: 'u3', full_name: 'Prof. Rahul Verma', email: 'teacher@uni.test', role_name: 'teacher', is_active: true, department_name: 'Computer Science', employee_number: 'EMP001' },
    { id: 'u4', full_name: 'Riya Patel', email: 'student1@uni.test', role_name: 'student', is_active: true, department_name: 'Computer Science', course_name: 'BCA', semester: 4, student_number: 'BCA2023001' },
    { id: 'u5', full_name: 'Aman Singh', email: 'student2@uni.test', role_name: 'student', is_active: true, department_name: 'Computer Science', course_name: 'BCA', semester: 4, student_number: 'BCA2023002' },
    { id: 'u6', full_name: 'Maya Chen', email: 'applicant1@uni.test', role_name: 'applicant', is_active: true, department_name: '—' },
  ],
  departments: [
    { id: 'dept-cs', department_name: 'Computer Science', hod_name: 'Dr. Meera Sharma', faculty_count: 3, course_count: 2 },
    { id: 'dept-mg', department_name: 'Management', hod_name: 'Dr. Anil Kapoor', faculty_count: 2, course_count: 1 },
  ],
  courses: [
    { id: 'crs-bca', course_name: 'BCA', department_name: 'Computer Science', duration_years: 3 },
    { id: 'crs-mca', course_name: 'MCA', department_name: 'Computer Science', duration_years: 2 },
    { id: 'crs-bba', course_name: 'BBA', department_name: 'Management', duration_years: 3 },
  ],
  subjects: [
    { id: 'sub-1', subject_code: 'BCA401', subject_name: 'Database Management Systems', course_name: 'BCA', semester: 4 },
    { id: 'sub-2', subject_code: 'BCA402', subject_name: 'Python Programming', course_name: 'BCA', semester: 4 },
    { id: 'sub-3', subject_code: 'BCA403', subject_name: 'Computer Networks', course_name: 'BCA', semester: 4 },
    { id: 'sub-4', subject_code: 'MCA203', subject_name: 'Machine Learning', course_name: 'MCA', semester: 2 },
  ],
  faqs: [
    {
      id: 'faq-1',
      question: 'What is the minimum attendance needed for end-semester exams?',
      answer: 'Students must maintain at least 75% attendance across lectures and practical labs.',
      category: 'Academic',
      is_active: true,
    },
    {
      id: 'faq-2',
      question: 'Where do I collect my examination hall ticket?',
      answer: 'Hall tickets are issued by the Examination Department on the 1st Floor of the Main Block.',
      category: 'Examinations',
      is_active: true,
    },
  ],
  documents: [
    {
      id: 'doc-1',
      title: 'BCA Semester 4 Syllabus',
      file_name: 'BCA_Semester4_Syllabus.pdf',
      document_type: 'syllabus',
      visibility: 'public',
      status: 'indexed',
      chunk_count: 18,
      is_approved: true,
    },
    {
      id: 'doc-2',
      title: 'Examination Procedures Manual',
      file_name: 'Examination_Procedures.pdf',
      document_type: 'policy',
      visibility: 'public',
      status: 'indexed',
      chunk_count: 14,
      is_approved: true,
    },
    {
      id: 'doc-3',
      title: 'Hostel and Library Policy',
      file_name: 'Hostel_and_Library_Policy.pdf',
      document_type: 'policy',
      visibility: 'public',
      status: 'indexed',
      chunk_count: 11,
      is_approved: true,
    },
    {
      id: 'doc-4',
      title: 'Student Handbook 2026',
      file_name: 'Student_Handbook.docx',
      document_type: 'handbook',
      visibility: 'public',
      status: 'indexed',
      chunk_count: 26,
      is_approved: true,
    },
  ],
  admissions: [
    {
      id: 'adm-bca',
      course_name: 'BCA',
      eligibility: '10+2 in any stream with at least 45% marks',
      application_deadline: '2026-12-26',
      fee_amount: 45000,
      scholarship_info: 'Merit scholarship of 10% fee waiver for 12th marks above 85%',
      status: 'approved',
    },
    {
      id: 'adm-mca',
      course_name: 'MCA',
      eligibility: 'Bachelor degree with Mathematics at 10+2 or graduation level',
      application_deadline: '',
      fee_amount: 60000,
      scholarship_info: '',
      status: 'approved',
    },
    {
      id: 'adm-bba',
      course_name: 'BBA',
      eligibility: '10+2 in any stream with at least 50% marks',
      application_deadline: '2027-01-10',
      fee_amount: 50000,
      scholarship_info: '',
      status: 'approved',
    },
  ],
  notices: [
    { id: 'n-1', title: 'Mid-Semester Exam Schedule Released', category: 'examination', is_published: true, content: 'Mid-semester exam timetable is now live.' },
    { id: 'n-2', title: 'Library Timings Extended', category: 'library', is_published: true, content: 'Library remains open until 8 PM during exam weeks.' },
    { id: 'n-3', title: 'Holiday Notice', category: 'general', is_published: true, content: 'Campus closed for the upcoming university holiday.' },
  ],
  analytics: {
    totals: { conversations: 142, questions: 486, active_users: 32 },
    denied_attempts: 9,
    documents: { live: 4, failed: 0 },
    intents: [
      { intent: 'student_records_rag', count: 168 },
      { intent: 'campus_wayfinding', count: 112 },
      { intent: 'agent_react_compound', count: 94 },
      { intent: 'study_concept_tutor', count: 78 },
      { intent: 'admissions_public', count: 34 },
    ],
    questions_per_day: [
      { day: '2026-11-26', questions: 54 },
      { day: '2026-11-25', questions: 61 },
      { day: '2026-11-24', questions: 49 },
      { day: '2026-11-23', questions: 38 },
      { day: '2026-11-22', questions: 44 },
    ],
  },
};
