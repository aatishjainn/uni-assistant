// The "tools" the chatbot may use. Each tool:
//  - lists the roles allowed to use it (checked by the backend, never by the AI)
//  - personal tools only read data belonging to the signed-in user (ctx.user.id comes from the verified token)
//  - public tools return approved, university-wide records anyone may ask about
const records = require('../services/records');
const { DAY_NAMES } = require('../services/time');
const campus = require('../services/campus');

const hm = (t) => String(t).slice(0, 5);
const slot = (r) => ({
  day: DAY_NAMES[r.day_of_week], start: hm(r.start_time), end: hm(r.end_time), subject: r.subject_name,
  ...(r.teacher ? { teacher: r.teacher } : {}),
  room: r.room_number, floor: r.floor_number, building: r.building_name,
});

function pickDay(rows, day, now) {
  if (!day || day === 'week') return { label: 'full week', rows };
  let dow;
  if (day === 'today') dow = now.dow;
  else if (day === 'tomorrow') dow = (now.dow % 7) + 1;
  else dow = DAY_NAMES.map((d) => d.toLowerCase()).indexOf(day);
  if (dow < 1) return { label: 'full week', rows };
  return { label: DAY_NAMES[dow], rows: rows.filter((r) => r.day_of_week === dow) };
}

const ALL_ROLES = ['student', 'teacher', 'hod', 'admin', 'applicant', 'visitor'];
const knownPlaces = (graph, role) => campus.searchPlaces(graph, '', { role, limit: 30 }).map((m) => `${m.place.name} (${m.place.building}, ${m.place.floor_label})`);

const registry = {
  // ---------------- personal records (own data only) ----------------
  student_attendance: {
    kind: 'personal', personal: true, roles: ['student'],
    description: "The signed-in student's own attendance percentage, overall or per subject.",
    run: async ({ user }) => records.getAttendance(user.id),
  },
  student_timetable: {
    kind: 'personal', personal: true, roles: ['student'],
    description: "The signed-in student's own class timetable (today, tomorrow, a weekday or the whole week).",
    run: async ({ user, now }, { day }) => {
      const { label, rows } = pickDay(await records.getStudentTimetable(user.id), day, now);
      return { requested: label, today_is: DAY_NAMES[now.dow], classes: rows.map(slot) };
    },
  },
  student_next_class: {
    kind: 'personal', personal: true, roles: ['student'],
    description: "The signed-in student's next class and where that classroom is (room, floor, building).",
    run: async ({ user, now }) => {
      const rows = await records.getStudentTimetable(user.id);
      const upcoming = rows.find((r) => r.day_of_week > now.dow || (r.day_of_week === now.dow && hm(r.start_time) > now.time));
      const next = upcoming || rows[0] || null;   // wrap to next week's first class
      const place = next ? await campus.nodeForClassroom(next.classroom_id) : null;
      return { now: `${DAY_NAMES[now.dow]} ${now.time}`, next_class: next ? slot(next) : null,
        ...(place ? { _ui: { map: { to: place.id } } } : {}) };
    },
  },
  student_next_exam: {
    kind: 'personal', personal: true, roles: ['student'],
    description: "The signed-in student's upcoming examinations (dates, times, rooms).",
    run: async ({ user, now }) => ({ today: now.date, upcoming_exams: await records.getUpcomingExams(user.id, now.date) }),
  },
  student_marks: {
    kind: 'personal', personal: true, roles: ['student'],
    description: "The signed-in student's own exam marks and results.",
    run: async ({ user }) => ({ results: await records.getMarks(user.id) }),
  },
  student_subjects: {
    kind: 'personal', personal: true, roles: ['student'],
    description: "Subjects included in the signed-in student's current semester.",
    run: async ({ user }) => {
      const rows = await records.getSemesterSubjects(user.id);
      return { course: rows[0]?.course_name || null, semester: rows[0]?.semester || null, subjects: rows.map((r) => ({ code: r.subject_code, name: r.subject_name })) };
    },
  },
  teacher_timetable: {
    kind: 'personal', personal: true, roles: ['teacher'],
    description: "The signed-in teacher's own teaching timetable and classrooms.",
    run: async ({ user, now }, { day }) => {
      const { label, rows } = pickDay(await records.getFacultyTimetable(user.id), day, now);
      return { requested: label, today_is: DAY_NAMES[now.dow], classes: rows.map(slot) };
    },
  },
  teacher_subjects: {
    kind: 'personal', personal: true, roles: ['teacher'],
    description: 'Subjects assigned to the signed-in teacher.',
    run: async ({ user }) => ({ subjects: await records.getFacultySubjects(user.id) }),
  },

  // ---------------- public university records (approved data; every role) ----------------
  admission_info: {
    kind: 'public_records', personal: false, roles: ALL_ROLES,
    description: "Official admission records and the admission process of THIS university: how to get admission or apply (including online), courses open for admission, eligibility, admission fee, last date/deadline, required documents, scholarships, admission office contact.",
    run: async ({ now }) => ({ today: now.date, admissions: await records.getAdmissions() }),
  },
  department_info: {
    kind: 'public_records', personal: false, roles: ALL_ROLES,
    description: 'Departments, who the Head of Department (HOD) is, and which courses each department offers.',
    run: async () => ({ departments: await records.getDepartments() }),
  },
  university_notices: {
    kind: 'public_records', personal: false, roles: ALL_ROLES,
    description: 'Latest published university notices and announcements.',
    run: async ({ now }) => ({ today: now.date, notices: await records.getNotices() }),
  },
  campus_location: {
    kind: 'public_records', personal: false, roles: ALL_ROLES,
    description: 'Where a room, lab, classroom, office, hall, library or other campus facility is (building and floor) and how to reach it from the main gate. Use for "where is ...".',
    run: async ({ user }, { place, message }) => {
      const graph = await campus.loadGraph();
      const hit = campus.resolvePlace(graph, place || message, user.role);
      if (!hit) return { found: false, searched_for: place || null, known_places: knownPlaces(graph, user.role) };
      const gate = campus.gateNode(graph);
      const r = gate && gate.id !== hit.best.id ? await campus.route(gate.id, hit.best.id, { role: user.role }) : null;
      const describePlace = (p) => ({ name: p.name, type: p.type, building: p.building, floor: p.floor_label });
      return {
        found: true, ambiguous: hit.ambiguous, best_match: describePlace(hit.best),
        other_possible_matches: hit.alternatives.map(describePlace),
        route_from_main_gate: r && !r.error ? { distance_m: r.distance_m, minutes: r.minutes, steps: r.steps.map((s) => s.text) } : null,
        note: 'A visual route and floor plan are available on the Campus map.',
        _ui: { map: { to: hit.best.id } },
      };
    },
  },
  campus_route: {
    kind: 'public_records', personal: false, roles: ALL_ROLES,
    description: 'Walking directions between two places on campus ("how do I get from the library to Room 201", "directions to the examination department"), including step-free routes.',
    run: async ({ user }, { place, from_place, message }) => {
      const graph = await campus.loadGraph();
      const to = campus.resolvePlace(graph, place || message, user.role);
      if (!to) return { found: false, missing: 'destination', searched_for: place || null, known_places: knownPlaces(graph, user.role) };
      let from, assumedStart = false;
      if (from_place) {
        const f = campus.resolvePlace(graph, from_place, user.role);
        if (!f) return { found: false, missing: 'starting point', searched_for: from_place, known_places: knownPlaces(graph, user.role) };
        from = f.best;
      } else {
        const gate = campus.gateNode(graph);
        if (!gate) return { found: false, reason: 'No starting point is available' };
        from = campus.publicNode(gate);
        assumedStart = true;
      }
      const accessible = /wheelchair|step[- ]free|accessible|elevator|lift only|without stairs/i.test(message || '');
      const r = await campus.route(from.id, to.best.id, { role: user.role, accessible });
      if (r.error) return { found: false, reason: r.error === 'no_route' ? 'No walkable route is stored for these two places' : 'Place not found' };
      const brief = (p) => ({ name: p.name, building: p.building, floor: p.floor_label });
      return {
        found: true, start: brief(from), destination: brief(to.best), assumed_start_is_main_gate: assumedStart, step_free_route: accessible,
        ambiguous_destination: to.ambiguous, other_possible_destinations: to.alternatives.map(brief),
        distance_m: r.distance_m, minutes: r.minutes, steps: r.steps.map((s) => s.text),
        _ui: { map: { from: from.id, to: to.best.id, accessible } },
      };
    },
  },
};

// Intents that are not database tools
const META = {
  general_education: "General education or study question that needs no university records (concepts, MCQs, project ideas, explanations). NOT for questions about this university's own admissions, fees, rooms, rules or schedules.",
  university_info: 'Questions answered from approved university documents: syllabus, examination procedures, hostel, library, transport, placements, policies, grievances, certificates, events, academic calendar.',
  unclear: 'The message is unclear, off-topic or does not match any other intent.',
};

const catalog = () => [
  ...Object.entries(registry).map(([name, t]) => ({ name, description: t.description })),
  ...Object.entries(META).map(([name, description]) => ({ name, description })),
];

module.exports = { registry, META, catalog };