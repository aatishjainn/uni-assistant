// Campus navigation tests: map API, routing, staff-only places, QR codes, admin edits and the chatbot.
// Runs the real Express app in-process; the AI functions are replaced by deterministic fakes.  Needs the seeded database.
const { test, before, after } = require('node:test');
const assert = require('node:assert');

const PASSWORD = 'Password@123';
const calls = { answer: [] };
let BASE, appServer, db, ai, campus;
const originals = {};

before(async () => {
  process.env.CHAT_RATE_LIMIT = '1000';
  const app = require('../src/app');
  db = require('../src/db');
  ai = require('../src/services/ai');
  campus = require('../src/services/campus');
  Object.assign(originals, { classify: ai.classify, answer: ai.answer, chat: ai.chat });

  ai.classify = async (message) => {
    let m;
    if (/next class/i.test(message)) return { intent: 'student_next_class', about_other_person: false, day: null };
    if ((m = message.match(/from (?:the )?(.+?) to (?:the )?(.+?)\??$/i))) return { intent: 'campus_route', about_other_person: false, day: null, place: m[2], from_place: m[1] };
    if ((m = message.match(/(?:directions|route|wheelchair route) to (?:the )?(.+?)(?: from (?:the )?(.+?))?\??$/i))) return { intent: 'campus_route', about_other_person: false, day: null, place: m[1], from_place: m[2] || null };
    if ((m = message.match(/where is (?:the )?(.+?)\??$/i))) return { intent: 'campus_location', about_other_person: false, day: null, place: m[1] };
    return { intent: 'unclear', about_other_person: false, day: null };
  };
  ai.answer = async (payload) => { calls.answer.push(payload); return { answer: 'DATA:' + JSON.stringify(payload.data), sources: [] }; };
  ai.chat = async (message) => ({ answer: 'GENERAL:' + message, sources: [] });

  appServer = app.listen(0, '127.0.0.1');
  await new Promise((r) => appServer.once('listening', r));
  BASE = `http://127.0.0.1:${appServer.address().port}`;
});

after(async () => {
  Object.assign(ai, originals);
  appServer.close();
  await db.end();
});

const tokens = {};
async function login(email) {
  if (tokens[email]) return tokens[email];
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  assert.strictEqual(r.status, 200, `login failed for ${email}`);
  tokens[email] = (await r.json()).token;
  return tokens[email];
}
async function api(email, method, url, body) {     // email = null => anonymous visitor
  const headers = email ? { Authorization: `Bearer ${await login(email)}` } : {};
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, json };
}
const search = async (who, q) => (await api(who, 'GET', `/api/campus/places?q=${encodeURIComponent(q)}`)).json.places;
const find = async (who, q) => (await search(who, q))[0];
const ask = async (who, message) => { calls.answer.length = 0; return (await api(who, 'POST', '/api/chat', { message })).json; };

// ------------------------------------------------------------------ map data (no account needed)
test('visitors can list buildings with coordinates and floors', async () => {
  const r = await api(null, 'GET', '/api/campus/buildings');
  assert.strictEqual(r.status, 200);
  const by = Object.fromEntries(r.json.buildings.map((b) => [b.name, b]));
  assert.deepStrictEqual(Object.keys(by).sort(), ['Academic Block', 'Main Block', 'Main Gate']);
  assert.deepStrictEqual(by['Main Block'].floors, [0, 1, 2]);
  assert.deepStrictEqual(by['Academic Block'].floors, [0, 1, 2, 3]);
  assert.ok(by['Main Block'].lat > 20 && by['Main Block'].lng > 70);
});

test('place search understands everyday wording', async () => {
  const cases = [['computer lab 1', 'Computer Lab 1'], ['exam department', 'Examination Department'], ['hod office', 'HOD Office - Computer Science'],
    ['canteen', 'Cafeteria'], ['admin office', 'Administrative Office'], ['library', 'Library'], ['seminar hall', 'Seminar Hall'], ['room 301', 'Room 301 (BBA)']];
  for (const [q, expected] of cases) assert.strictEqual((await find(null, q))?.name, expected, q);
  const lab = await find(null, 'computer lab 1');
  assert.strictEqual(lab.building, 'Main Block'); assert.strictEqual(lab.floor, 1); assert.strictEqual(lab.floor_label, '1st floor');
  assert.deepStrictEqual((await search(null, 'computer lab')).map((p) => p.name).sort(), ['Computer Lab 1', 'Computer Lab 2']);
  assert.deepStrictEqual((await search(null, 'bca classroom')).map((p) => p.name).sort(), ['Room 201 (BCA)', 'Room 202 (BCA)']);
  assert.deepStrictEqual(await search(null, 'helicopter pad'), []);
});

test('empty search lists public places; filters by building and floor work', async () => {
  assert.strictEqual((await search(null, '')).length, 15);
  const mb = (await api(null, 'GET', '/api/campus/buildings')).json.buildings.find((b) => b.name === 'Main Block');
  const f1 = (await api(null, 'GET', `/api/campus/places?building=${mb.id}&floor=1`)).json.places;
  assert.deepStrictEqual(f1.map((p) => p.name).sort(), ['Computer Lab 1', 'Computer Lab 2', 'Examination Department']);
  assert.strictEqual((await api(null, 'GET', '/api/campus/places?floor=abc')).status, 400);
  assert.strictEqual((await api(null, 'GET', '/api/campus/places?building=nope')).status, 400);
});

// ------------------------------------------------------------------ staff-only places
test('staff-only rooms are hidden from visitors and students, visible to teachers and admins', async () => {
  for (const who of [null, 'student1@uni.test']) {
    assert.strictEqual((await search(who, 'staff room')).length, 0, String(who));
    assert.strictEqual((await search(who, 'server room')).length, 0, String(who));
  }
  assert.strictEqual((await find('teacher@uni.test', 'staff room'))?.name, 'Staff Room');
  assert.strictEqual((await find('admin@uni.test', 'server room'))?.name, 'Server Room');
  assert.strictEqual((await search('teacher@uni.test', '')).length, 17);
});

test('staff-only rooms cannot be reached through routes, QR codes or floor plans by outsiders', async () => {
  const staff = await find('teacher@uni.test', 'staff room');
  assert.strictEqual((await api(null, 'GET', `/api/campus/route?from=QR-GATE&to=${staff.id}`)).status, 404);
  assert.strictEqual((await api('student1@uni.test', 'GET', `/api/campus/route?from=QR-GATE&to=${staff.id}`)).status, 404);
  assert.strictEqual((await api('teacher@uni.test', 'GET', `/api/campus/route?from=QR-GATE&to=${staff.id}`)).status, 200);
  assert.strictEqual((await api(null, 'GET', `/api/campus/qr/${staff.qr_code}`)).status, 404);
  assert.strictEqual((await api('teacher@uni.test', 'GET', `/api/campus/qr/${staff.qr_code}`)).status, 200);
  const plan = (who) => api(who, 'GET', `/api/campus/floor/${staff.building_id}/${staff.floor}`);
  assert.ok(!(await plan(null)).json.nodes.some((n) => n.name === 'Staff Room'));
  assert.ok((await plan('teacher@uni.test')).json.nodes.some((n) => n.name === 'Staff Room'));
});

test('an invalid or expired token is just treated as a visitor', async () => {
  const r = await fetch(BASE + '/api/campus/places?q=staff%20room', { headers: { Authorization: 'Bearer not.a.token' } });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual((await r.json()).places, []);
});

// ------------------------------------------------------------------ routes
test('route from the main gate to Computer Lab 1 has sensible step-by-step directions', async () => {
  const lab = await find(null, 'computer lab 1');
  const r = (await api(null, 'GET', `/api/campus/route?from=QR-GATE&to=${lab.id}`)).json;
  assert.ok(r.distance_m > 50 && r.minutes >= 1);
  assert.strictEqual(r.path[0].name, 'Main Gate'); assert.strictEqual(r.path.at(-1).name, 'Computer Lab 1');
  const text = r.steps.map((s) => s.text);
  assert.match(text[0], /^Start at Main Gate/);
  assert.ok(text.some((t) => /Walk outside from Main Gate to Main Block/.test(t)));
  assert.ok(text.some((t) => /Take the stairs from the ground floor to the 1st floor/.test(t)));
  assert.match(text.at(-1), /arrived at Computer Lab 1 \(Main Block, 1st floor\)/);
});

test('step-free routes use the lift and never the stairs', async () => {
  const lab = await find(null, 'computer lab 1');
  const normal = (await api(null, 'GET', `/api/campus/route?from=QR-GATE&to=${lab.id}`)).json;
  const free = (await api(null, 'GET', `/api/campus/route?from=QR-GATE&to=${lab.id}&accessible=true`)).json;
  assert.ok(normal.path.some((n) => n.type === 'stairs'));
  assert.ok(!free.path.some((n) => n.type === 'stairs') && free.path.some((n) => n.type === 'lift'));
  assert.ok(free.steps.some((s) => /Take the lift/.test(s.text)) && !free.steps.some((s) => /stairs from/.test(s.text)));
  assert.ok(free.distance_m > normal.distance_m);
});

test('multi-floor and cross-building routes are described as one floor step / one outdoor step', async () => {
  const r301 = await find(null, 'room 301');
  const up = (await api(null, 'GET', `/api/campus/route?from=QR-GATE&to=${r301.id}`)).json;
  assert.strictEqual(up.steps.filter((s) => s.type === 'floor').length, 1);
  assert.match(up.steps.find((s) => s.type === 'floor').text, /from the ground floor to the 3rd floor/);
  const lib = await find(null, 'library'), r201 = await find(null, 'room 201');
  const across = (await api(null, 'GET', `/api/campus/route?from=${lib.id}&to=${r201.id}`)).json;
  assert.ok(across.steps.some((s) => /Walk outside from Main Block to Academic Block/.test(s.text)));
});

test('routing to the same place, QR starting points and bad input', async () => {
  const lib = await find(null, 'library');
  const same = (await api(null, 'GET', `/api/campus/route?from=${lib.id}&to=${lib.id}`)).json;
  assert.strictEqual(same.distance_m, 0); assert.match(same.steps[0].text, /already at Library/);
  const viaQr = await api(null, 'GET', `/api/campus/route?from=${lib.qr_code}&to=QR-GATE`);
  assert.strictEqual(viaQr.status, 200);
  assert.strictEqual((await api(null, 'GET', '/api/campus/route?from=QR-GATE&to=00000000-0000-4000-8000-000000000000')).status, 404);
  assert.strictEqual((await api(null, 'GET', '/api/campus/route?from=QR-GATE')).status, 400);
  assert.strictEqual((await api(null, 'GET', '/api/campus/route?from=a%20b&to=c')).status, 400);
  assert.strictEqual((await api(null, 'GET', "/api/campus/route?from=QR-GATE&to=x';DROP TABLE users;--")).status, 400);
});

test('QR codes resolve to places; unknown or malformed codes are rejected', async () => {
  const ok = await api(null, 'GET', '/api/campus/qr/QR-MB1-COMPUTER-LAB-1');
  assert.strictEqual(ok.status, 200); assert.strictEqual(ok.json.place.name, 'Computer Lab 1');
  assert.strictEqual((await api(null, 'GET', '/api/campus/qr/QR-DOES-NOT-EXIST')).status, 404);
  assert.strictEqual((await api(null, 'GET', '/api/campus/qr/not-a-code')).status, 400);
});

test('floor plans contain only that floor and valid corridors', async () => {
  const lab = await find(null, 'computer lab 1');
  const r = await api(null, 'GET', `/api/campus/floor/${lab.building_id}/1`);
  assert.strictEqual(r.status, 200);
  const ids = new Set(r.json.nodes.map((n) => n.id));
  assert.ok(r.json.nodes.every((n) => n.floor === 1) && r.json.nodes.some((n) => n.name === 'Computer Lab 1'));
  assert.ok(r.json.edges.length > 0 && r.json.edges.every((e) => ids.has(e.a) && ids.has(e.b)));
  assert.strictEqual((await api(null, 'GET', `/api/campus/floor/${lab.building_id}/9`)).status, 404);
  assert.strictEqual((await api(null, 'GET', `/api/campus/floor/${lab.building_id}/99`)).status, 400);
  assert.strictEqual((await api(null, 'GET', '/api/campus/floor/nope/1')).status, 400);
});

// ------------------------------------------------------------------ graph integrity + algorithm
test('every room on campus can be reached from the main gate, and every walkway joins real places', async () => {
  const g = await campus.loadGraph(true);
  const gate = campus.gateNode(g);
  for (const n of g.nodes) {
    if (n.id === gate.id) continue;
    assert.ok(campus.shortestPath(g, gate.id, n.id), `${n.name} (${n.building_name}) is not connected`);
  }
  for (const e of g.edges) assert.ok(g.byId.has(e.a) && g.byId.has(e.b) && e.d > 0);
  assert.strictEqual(new Set(g.nodes.map((n) => n.qr_code).filter(Boolean)).size, g.nodes.filter((n) => n.qr_code).length);   // QR codes unique
});

test('shortest path: picks the shorter way, honours step-free and restricted rules, reports no route', () => {
  const n = (id, pub = true) => ({ id, is_public: pub, name: id, type: 'junction', building_id: 'b', building_name: 'B', floor: 0 });
  const g = campus.makeGraph([n('A'), n('B', false), n('C'), n('D'), n('E')], [
    { a: 'A', b: 'B', d: 1, acc: false }, { a: 'B', b: 'D', d: 1, acc: true }, { a: 'A', b: 'C', d: 5, acc: true }, { a: 'C', b: 'D', d: 5, acc: true }]);
  assert.deepStrictEqual(campus.shortestPath(g, 'A', 'D').ids, ['A', 'B', 'D']);
  assert.strictEqual(campus.shortestPath(g, 'A', 'D').distance, 2);
  assert.deepStrictEqual(campus.shortestPath(g, 'A', 'D', { accessibleOnly: true }).ids, ['A', 'C', 'D']);
  assert.deepStrictEqual(campus.shortestPath(g, 'A', 'D', { allowRestricted: false }).ids, ['A', 'C', 'D']);
  assert.strictEqual(campus.shortestPath(g, 'A', 'E'), null);
  assert.strictEqual(campus.shortestPath(g, 'A', 'nope'), null);
});

// ------------------------------------------------------------------ chatbot
test('chatbot answers "where is" from the map data and offers a map link', async () => {
  const r = await ask('student1@uni.test', 'Where is Computer Lab 1?');
  const p = calls.answer[0];
  assert.strictEqual(p.kind, 'public_records');
  assert.deepStrictEqual(p.data.best_match, { name: 'Computer Lab 1', type: 'room', building: 'Main Block', floor: '1st floor' });
  assert.ok(p.data.route_from_main_gate.steps.at(-1).includes('Computer Lab 1'));
  assert.ok(!('_ui' in p.data));                                    // the AI never sees app-only fields
  assert.ok(r.ui.map.to);
  assert.strictEqual((await api(null, 'GET', `/api/campus/qr/QR-MB1-COMPUTER-LAB-1`)).json.place.id, r.ui.map.to);
});

test('chatbot finds places from loose wording and reports ambiguity honestly', async () => {
  await ask('student1@uni.test', 'Where is the exam department?');
  assert.strictEqual(calls.answer[0].data.best_match.name, 'Examination Department');
  await ask('student1@uni.test', 'Where is the computer lab?');
  assert.strictEqual(calls.answer[0].data.ambiguous, true);
  assert.strictEqual(calls.answer[0].data.other_possible_matches.length, 1);
});

test('chatbot does not reveal or invent places', async () => {
  await ask('student1@uni.test', 'Where is the Server Room?');
  assert.strictEqual(calls.answer[0].data.found, false);
  const listed = JSON.stringify(calls.answer[0].data.known_places);     // the list offered back to the user
  assert.ok(!listed.includes('Server Room') && !listed.includes('Staff Room'));
  await ask('student1@uni.test', 'Where is the helipad?');
  assert.strictEqual(calls.answer[0].data.found, false);
  assert.ok(calls.answer[0].data.known_places.length > 5);
  await ask('teacher@uni.test', 'Where is the Staff Room?');
  assert.strictEqual(calls.answer[0].data.best_match.name, 'Staff Room');
});

test('chatbot gives directions between two places, defaults to the main gate, and supports step-free routes', async () => {
  const r = await ask('student1@uni.test', 'How do I get from the library to Room 201 (BCA)?');
  const d = calls.answer[0].data;
  assert.strictEqual(d.assumed_start_is_main_gate, false);
  assert.strictEqual(d.start.name, 'Library'); assert.strictEqual(d.destination.name, 'Room 201 (BCA)');
  assert.ok(d.steps.some((s) => /outside from Main Block to Academic Block/.test(s)));
  assert.ok(r.ui.map.from && r.ui.map.to);
  await ask('student1@uni.test', 'Directions to the cafeteria');
  assert.strictEqual(calls.answer[0].data.assumed_start_is_main_gate, true);
  await ask('student1@uni.test', 'wheelchair route to computer lab 1');
  assert.strictEqual(calls.answer[0].data.step_free_route, true);
  assert.ok(!calls.answer[0].data.steps.some((s) => /stairs from/.test(s)) && calls.answer[0].data.steps.some((s) => /lift/.test(s)));
});

test('"where is my next class" gets a map link to the right classroom', async () => {
  const r = await ask('student1@uni.test', 'Where is my next class?');
  assert.ok(r.ui?.map?.to);
  assert.ok(!('_ui' in calls.answer[0].data));
});

// ------------------------------------------------------------------ admin
test('only admins manage campus data; inputs are validated', async () => {
  const b = (await api('admin@uni.test', 'GET', '/api/admin/campus/buildings')).json.buildings[0];
  for (const who of [null, 'student1@uni.test', 'teacher@uni.test', 'hod@uni.test']) {
    assert.ok([401, 403].includes((await api(who, 'GET', '/api/admin/campus/places')).status), String(who));
    assert.ok([401, 403].includes((await api(who, 'PUT', `/api/admin/campus/buildings/${b.id}`, { latitude: 10 })).status));
  }
  for (const bad of [{ latitude: 91 }, { longitude: -181 }, { latitude: 'north' }, { building_name: '' }, { unknown: 1 }, {}]) {
    assert.strictEqual((await api('admin@uni.test', 'PUT', `/api/admin/campus/buildings/${b.id}`, bad)).status, 400, JSON.stringify(bad));
  }
  assert.strictEqual((await api('admin@uni.test', 'PUT', '/api/admin/campus/buildings/nope', { latitude: 1 })).status, 400);
});

test('admin edits to places take effect immediately (keywords, staff-only, rename) and are audited', async () => {
  const lib = await find(null, 'library');
  const url = `/api/admin/campus/places/${lib.id}`;
  try {
    assert.strictEqual((await api('admin@uni.test', 'PUT', url, { keywords: 'borrowing zebra' })).status, 200);
    assert.strictEqual((await find(null, 'zebra'))?.name, 'Library');
    assert.strictEqual((await api('admin@uni.test', 'PUT', url, { is_public: false })).status, 200);
    assert.strictEqual((await search(null, 'library')).length, 0);
    assert.strictEqual((await find('teacher@uni.test', 'library'))?.name, 'Library');
    await api('admin@uni.test', 'PUT', url, { is_public: true });

    assert.strictEqual((await api('admin@uni.test', 'PUT', url, { node_name: 'Central Library' })).status, 200);
    assert.strictEqual((await db.query('SELECT room_number FROM classrooms WHERE id = (SELECT classroom_id FROM navigation_nodes WHERE id = $1)', [lib.id])).rows[0].room_number, 'Central Library');
    const hall = await find(null, 'seminar hall');
    assert.strictEqual((await api('admin@uni.test', 'PUT', `/api/admin/campus/places/${hall.id}`, { node_name: 'Central Library' })).status, 409);
  } finally {
    await api('admin@uni.test', 'PUT', url, { node_name: 'Library', keywords: 'books reading room study', is_public: true });
  }
  assert.strictEqual((await find(null, 'library'))?.name, 'Library');
  assert.ok((await db.query("SELECT 1 FROM audit_logs WHERE action = 'place_update' AND entity_id = $1", [lib.id])).rowCount >= 3);
  assert.strictEqual((await api('admin@uni.test', 'PUT', url, { node_type: 'stairs' })).status, 400);
});

test('admin can move a building on the map', async () => {
  const mb = (await api('admin@uni.test', 'GET', '/api/admin/campus/buildings')).json.buildings.find((x) => x.building_name === 'Main Block');
  try {
    assert.strictEqual((await api('admin@uni.test', 'PUT', `/api/admin/campus/buildings/${mb.id}`, { latitude: 23.27, longitude: 77.42 })).status, 200);
    const now = (await api(null, 'GET', '/api/campus/buildings')).json.buildings.find((x) => x.name === 'Main Block');
    assert.strictEqual(now.lat, 23.27); assert.strictEqual(now.lng, 77.42);
  } finally {
    await api('admin@uni.test', 'PUT', `/api/admin/campus/buildings/${mb.id}`, { latitude: Number(mb.latitude), longitude: Number(mb.longitude) });
  }
});
