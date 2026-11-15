// Campus navigation: the walking graph, shortest routes, step-by-step directions and place search.
// The AI never invents a route: directions are computed here from the stored graph.
const db = require('../db');

const STAFF_ROLES = new Set(['teacher', 'hod', 'admin']);
const canSeeRestricted = (role) => STAFF_ROLES.has(role);
const FLOOR_NAMES = ['Ground floor', '1st floor', '2nd floor', '3rd floor'];
const floorLabel = (f) => FLOOR_NAMES[f] || `${f}th floor`;
const WALK_METRES_PER_MINUTE = 70;

// ------------------------------------------------------------------ graph
function makeGraph(nodes, edges, buildings = []) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!byId.has(e.a) || !byId.has(e.b)) continue;
    adj.get(e.a).push({ to: e.b, d: e.d, acc: e.acc });
    adj.get(e.b).push({ to: e.a, d: e.d, acc: e.acc });
  }
  const byQr = new Map(nodes.filter((n) => n.qr_code).map((n) => [n.qr_code, n]));
  return { nodes, edges, byId, adj, byQr, buildings };
}

let cache = null;
async function loadGraph(force = false) {
  if (!force && cache && Date.now() - cache.at < 30000) return cache.graph;
  const nodes = (await db.query(
    `SELECT n.id, n.node_name AS name, n.node_type AS type, n.floor_number AS floor, n.x_coordinate AS x, n.y_coordinate AS y,
            n.building_id, b.building_name, b.latitude AS lat, b.longitude AS lng,
            n.classroom_id, n.qr_code, n.keywords, n.is_public
       FROM navigation_nodes n JOIN buildings b ON b.id = n.building_id`)).rows
    .map((n) => ({ ...n, x: Number(n.x), y: Number(n.y), lat: Number(n.lat), lng: Number(n.lng) }));
  const edges = (await db.query('SELECT source_node_id AS a, destination_node_id AS b, distance_meters AS d, is_accessible AS acc FROM navigation_edges'))
    .rows.map((e) => ({ ...e, d: Number(e.d) }));
  const buildings = (await db.query('SELECT id, building_name AS name, latitude AS lat, longitude AS lng, description FROM buildings ORDER BY building_name'))
    .rows.map((b) => ({ ...b, lat: Number(b.lat), lng: Number(b.lng) }));
  const graph = makeGraph(nodes, edges, buildings);
  cache = { graph, at: Date.now() };
  return graph;
}
const invalidate = () => { cache = null; };

// ------------------------------------------------------------------ shortest path (Dijkstra)
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item) {
    const a = this.a; a.push(item);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

// accessibleOnly: skip edges that are not step-free (stairs). allowRestricted: may pass through staff-only places.
function shortestPath(graph, startId, endId, { accessibleOnly = false, allowRestricted = true } = {}) {
  if (!graph.byId.has(startId) || !graph.byId.has(endId)) return null;
  const dist = new Map([[startId, 0]]);
  const prev = new Map();
  const done = new Set();
  const heap = new MinHeap();
  heap.push([0, startId]);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (done.has(u)) continue;
    done.add(u);
    if (u === endId) break;
    for (const { to, d: w, acc } of graph.adj.get(u)) {
      if (accessibleOnly && !acc) continue;
      if (!allowRestricted && to !== endId && !graph.byId.get(to).is_public) continue;
      const nd = d + w;
      if (nd < (dist.get(to) ?? Infinity)) { dist.set(to, nd); prev.set(to, u); heap.push([nd, to]); }
    }
  }
  if (!dist.has(endId)) return null;
  const ids = [];
  for (let at = endId; at !== undefined; at = prev.get(at)) ids.push(at);
  return { ids: ids.reverse(), distance: dist.get(endId) };
}

// ------------------------------------------------------------------ directions
const describe = (n) => ({ stairs: 'the stairs', lift: 'the lift', junction: 'the corridor' }[n.type] || (n.type === 'entrance' ? `the ${n.name}` : n.name));

function buildDirections(graph, ids) {
  const nodes = ids.map((id) => graph.byId.get(id));
  if (nodes.length === 1) return [{ type: 'arrive', text: `You are already at ${nodes[0].name}.` }];
  const steps = [{ type: 'start', text: `Start at ${nodes[0].name} (${nodes[0].building_name}, ${floorLabel(nodes[0].floor).toLowerCase()}).` }];
  let walked = 0;
  let floorStep = null;
  const flush = (to) => {
    if (walked > 0) { steps.push({ type: 'walk', text: `Walk about ${Math.round(walked)} m to ${describe(to)}.` }); walked = 0; }
  };
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1], b = nodes[i];
    const edge = graph.adj.get(a.id).find((x) => x.to === b.id);
    if (a.building_id !== b.building_id) {
      flush(a); floorStep = null;
      steps.push({ type: 'outdoor', text: `Walk outside from ${a.building_name} to ${b.building_name} (about ${Math.round(edge.d)} m).` });
    } else if (a.floor !== b.floor) {
      flush(a);
      const method = a.type === 'lift' && b.type === 'lift' ? 'lift' : 'stairs';
      const dir = Math.sign(b.floor - a.floor);
      if (floorStep && floorStep.method === method && floorStep.dir === dir) floorStep.to = b.floor;
      else { floorStep = { method, dir, from: a.floor, to: b.floor, idx: steps.length }; steps.push({ type: 'floor', text: '' }); }
      steps[floorStep.idx].text = `Take the ${method} from the ${floorLabel(floorStep.from).toLowerCase()} to the ${floorLabel(floorStep.to).toLowerCase()}.`;
    } else {
      floorStep = null;
      walked += edge.d;
      if (['room', 'entrance', 'stairs', 'lift'].includes(b.type) || i === nodes.length - 1) flush(b);
    }
  }
  const end = nodes[nodes.length - 1];
  steps.push({ type: 'arrive', text: `You have arrived at ${end.name} (${end.building_name}, ${floorLabel(end.floor).toLowerCase()}).` });
  return steps;
}

// ------------------------------------------------------------------ public shape + visibility
const publicNode = (n) => ({
  id: n.id, name: n.name, type: n.type, floor: n.floor, floor_label: floorLabel(n.floor),
  building_id: n.building_id, building: n.building_name, x: n.x, y: n.y, lat: n.lat, lng: n.lng,
  qr_code: n.qr_code, has_classroom: Boolean(n.classroom_id),
});
const visibleTo = (role) => (n) => n.is_public || canSeeRestricted(role);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// by id or by QR token, only if this role may see it
function findNode(graph, ref, role) {
  const node = UUID.test(ref) ? graph.byId.get(ref) : graph.byQr.get(ref);
  return node && visibleTo(role)(node) ? node : null;
}

async function route(fromRef, toRef, { role, accessible = false } = {}) {
  const graph = await loadGraph();
  const from = findNode(graph, fromRef, role), to = findNode(graph, toRef, role);
  if (!from || !to) return { error: 'not_found' };
  const found = shortestPath(graph, from.id, to.id, { accessibleOnly: accessible, allowRestricted: canSeeRestricted(role) });
  if (!found) return { error: 'no_route' };
  return {
    from: publicNode(from), to: publicNode(to), accessible,
    distance_m: Math.round(found.distance),
    minutes: found.ids.length === 1 ? 0 : Math.max(1, Math.round(found.distance / WALK_METRES_PER_MINUTE)),
    steps: buildDirections(graph, found.ids),
    path: found.ids.map((id) => publicNode(graph.byId.get(id))),
  };
}

// ------------------------------------------------------------------ place search (fuzzy, forgiving)
const STOP = new Set(['where', 'is', 'are', 'the', 'a', 'an', 'to', 'of', 'in', 'at', 'my', 'me', 'how', 'do', 'i', 'can', 'go', 'get', 'reach',
  'find', 'located', 'location', 'which', 'please', 'from', 'near', 'directions', 'way', 'what', 'tell', 'show', 'take', 'am', 'its', 'it', 'and', 'for', 'on']);
const tokens = (s) => String(s || '').toLowerCase().match(/[a-z0-9]+/g) || [];
const queryTokens = (q) => tokens(q).filter((t) => !STOP.has(t));
const isNum = (t) => /^\d+$/.test(t);

function tokenScore(q, candidates) {
  let best = 0;
  for (const c of candidates) {
    if (c === q) return 1;
    if (isNum(q) || isNum(c)) continue;                                 // numbers must match exactly ("lab 1" is not "lab 2")
    if (q.length >= 3 && c.length >= 3 && (c.startsWith(q) || q.startsWith(c))) best = Math.max(best, 0.8);   // exam ~ examination
  }
  return best;
}

function scoreNode(node, qt) {                       // node = the raw graph node (it carries the admin's search keywords)
  const nameT = tokens(node.name), keyT = tokens(node.keywords), buildT = tokens(node.building_name);
  const cand = [...nameT, ...keyT];
  let sum = 0;
  for (const q of qt) sum += Math.max(tokenScore(q, cand), tokenScore(q, buildT) * 0.5);
  const coverage = sum / qt.length;
  const matchedName = nameT.filter((t) => qt.some((q) => tokenScore(q, [t]) > 0)).length;
  const exact = nameT.join(' ') === qt.join(' ') ? 0.5 : 0;
  return { coverage, score: coverage + exact - 0.02 * (nameT.length - matchedName) };
}

const SEARCHABLE = new Set(['room', 'entrance']);
function searchPlaces(graph, q, { role, building, floor, limit = 50 } = {}) {
  let list = graph.nodes.filter((n) => SEARCHABLE.has(n.type) && visibleTo(role)(n));
  if (building) list = list.filter((n) => n.building_id === building);
  if (Number.isInteger(floor)) list = list.filter((n) => n.floor === floor);
  const qt = queryTokens(q);
  if (!qt.length) {
    return list.map((n) => ({ place: publicNode(n), score: 0 }))
      .sort((a, b) => a.place.building.localeCompare(b.place.building) || a.place.floor - b.place.floor || a.place.name.localeCompare(b.place.name))
      .slice(0, limit);
  }
  return list.map((n) => ({ place: publicNode(n), ...scoreNode(n, qt) })).filter((m) => m.coverage >= 0.6)
    .sort((a, b) => b.score - a.score || a.place.name.length - b.place.name.length).slice(0, limit);
}

// best guess for a name typed by a person; reports ambiguity instead of silently choosing
function resolvePlace(graph, text, role) {
  const matches = searchPlaces(graph, text, { role, limit: 5 });
  if (!queryTokens(text).length || !matches.length) return null;
  const best = matches[0];
  const ambiguous = Boolean(matches[1] && matches[1].score >= best.score - 0.001);
  const alternatives = matches.slice(1, 3).filter((m) => ambiguous || best.score < 1).map((m) => m.place);
  return { best: best.place, ambiguous, alternatives };
}

const gateNode = (graph) => graph.nodes.find((n) => n.qr_code === 'QR-GATE') || graph.nodes.find((n) => n.type === 'entrance');
const nodeForClassroom = async (classroomId) => {
  if (!classroomId) return null;
  const g = await loadGraph();
  return g.nodes.find((n) => n.classroom_id === classroomId) || null;
};

// ------------------------------------------------------------------ data for the map screens
function buildingsInfo(graph, role) {
  const ok = visibleTo(role);
  return graph.buildings.map((b) => {
    const nodes = graph.nodes.filter((n) => n.building_id === b.id && ok(n));
    return { id: b.id, name: b.name, description: b.description, lat: b.lat, lng: b.lng,
      floors: [...new Set(nodes.map((n) => n.floor))].sort((x, y) => x - y),
      place_count: nodes.filter((n) => SEARCHABLE.has(n.type) && n.type === 'room').length };
  });
}

function floorPlan(graph, buildingId, floor, role) {
  const ok = visibleTo(role);
  const nodes = graph.nodes.filter((n) => n.building_id === buildingId && n.floor === floor && ok(n));
  if (!nodes.length) return null;
  const ids = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => ids.has(e.a) && ids.has(e.b)).map((e) => ({ a: e.a, b: e.b, accessible: e.acc }));
  return { building: { id: buildingId, name: nodes[0].building_name }, floor, floor_label: floorLabel(floor), nodes: nodes.map(publicNode), edges };
}

module.exports = { makeGraph, loadGraph, invalidate, shortestPath, buildDirections, route, findNode, searchPlaces, resolvePlace, gateNode,
  nodeForClassroom, buildingsInfo, floorPlan, publicNode, canSeeRestricted, floorLabel, visibleTo, queryTokens };
