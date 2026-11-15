// DUMMY campus map: buildings, rooms, corridors, stairs, lifts and the walking graph between them.
// Plan coordinates (x, y) are in metres on each floor's own plan.
const slug = (s) => s.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
const FLOOR_NAMES = ['ground floor', '1st floor', '2nd floor', '3rd floor'];
const floorName = (f) => FLOOR_NAMES[f] || `${f}th floor`;
const euclid = (a, b) => Math.max(1, Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 10) / 10);

function metres(a, b) {                                   // great-circle distance between two buildings
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return Math.max(30, Math.round(2 * R * Math.asin(Math.sqrt(h))));
}

const KEYWORDS = {
  'Library': 'books reading room study',
  'Seminar Hall': 'auditorium hall events seminar',
  'Administrative Office': 'admin office administration fees',
  'Computer Lab 1': 'lab1 cs computers practical',
  'Computer Lab 2': 'lab2 computers practical',
  'Examination Department': 'exam exams examination controller results hall ticket',
  'HOD Office - Computer Science': 'hod head of department cs',
  'Staff Room': 'faculty teachers staff',
  'Server Room': 'it servers network',
  'Cafeteria': 'canteen food cafe snacks',
  'Room 201 (BCA)': 'bca classroom class 201',
  'Room 202 (BCA)': 'bca classroom class 202',
  'Room 203 (MCA)': 'mca classroom class 203',
  'Room 301 (BBA)': 'bba classroom class 301',
};

module.exports = async function seedCampus(c, { main, acad, rooms }) {
  const one = async (sql, args) => (await c.query(sql, args)).rows[0].id;
  await c.query('UPDATE buildings SET description = $2 WHERE id = $1', [main, 'Administration, library, computer labs, examination department and HOD office']);
  await c.query('UPDATE buildings SET description = $2 WHERE id = $1', [acad, 'Classrooms and cafeteria']);
  const gate = await one("INSERT INTO buildings (building_name, latitude, longitude, description) VALUES ('Main Gate', 23.2594, 77.4120, 'Main entrance of the campus') RETURNING id");
  const B = {
    MB: { id: main, name: 'Main Block', lat: 23.2599, lon: 77.4126 },
    AB: { id: acad, name: 'Academic Block', lat: 23.2606, lon: 77.4135 },
    GATE: { id: gate, name: 'Main Gate', lat: 23.2594, lon: 77.4120 },
  };

  const nodes = {};
  const addNode = async ({ key, b, floor, name, type, x, y, classroomId = null, qr = null, keywords = null, pub = true }) => {
    const id = await one(
      `INSERT INTO navigation_nodes (building_id, node_name, node_type, floor_number, x_coordinate, y_coordinate, classroom_id, qr_code, keywords, is_public)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [b.id, name, type, floor, x, y, classroomId, qr, keywords, pub]);
    nodes[key] = { id, x, y, floor };
    return nodes[key];
  };
  const addEdge = (a, b, dist, accessible = true) => c.query(
    'INSERT INTO navigation_edges (source_node_id, destination_node_id, distance_meters, is_accessible) VALUES ($1,$2,$3,$4)',
    [nodes[a].id, nodes[b].id, dist ?? euclid(nodes[a], nodes[b]), accessible]);
  const ensureRoom = async (b, name, floor, type) => rooms[name] || (rooms[name] = await one(
    'INSERT INTO classrooms (building_id, room_number, floor_number, room_type) VALUES ($1,$2,$3,$4) RETURNING id', [b.id, name, floor, type]));

  // one floor: a corridor with junctions, stairs at one end, a lift at the other, rooms hanging off the corridor
  async function floor(bKey, f, cfg) {
    const b = B[bKey], P = `${bKey}${f}`;
    for (const [i, x] of cfg.j.entries()) {
      await addNode({ key: `${P}_J${i}`, b, floor: f, name: `${b.name} ${floorName(f)} corridor`, type: 'junction', x, y: 15 });
      if (i > 0) await addEdge(`${P}_J${i - 1}`, `${P}_J${i}`);
    }
    const last = cfg.j.length - 1;
    await addNode({ key: `${P}_ST`, b, floor: f, name: `${b.name} stairs (${floorName(f)})`, type: 'stairs', x: cfg.stairs, y: 15, qr: `QR-${P}-STAIRS` });
    await addEdge(`${P}_ST`, `${P}_J0`);
    await addNode({ key: `${P}_LIFT`, b, floor: f, name: `${b.name} lift (${floorName(f)})`, type: 'lift', x: cfg.lift, y: 15, qr: `QR-${P}-LIFT` });
    await addEdge(`${P}_LIFT`, `${P}_J${last}`);
    for (const [name, x, y, ji, opt = {}] of cfg.rooms || []) {
      const classroomId = await ensureRoom(b, name, f, opt.roomType || 'classroom');
      await addNode({ key: `${P}_${slug(name)}`, b, floor: f, name, type: 'room', x, y, classroomId, qr: `QR-${P}-${slug(name)}`,
        keywords: KEYWORDS[name] || null, pub: opt.pub !== false });
      await addEdge(`${P}_${slug(name)}`, `${P}_J${ji}`);
    }
    if (cfg.entrance) {
      const [x, y, ji] = cfg.entrance;
      await addNode({ key: `${bKey}_ENT`, b, floor: f, name: `${b.name} Entrance`, type: 'entrance', x, y, qr: `QR-${bKey}-ENTRANCE`, keywords: 'entrance door main' });
      await addEdge(`${bKey}_ENT`, `${P}_J${ji}`);
    }
  }

  await addNode({ key: 'GATE', b: B.GATE, floor: 0, name: 'Main Gate', type: 'entrance', x: 0, y: 0, qr: 'QR-GATE', keywords: 'entrance gate campus' });

  // Main Block: floors 0-2 (corridor junctions at x = 10, 30, 50)
  const mbJ = [10, 30, 50];
  await floor('MB', 0, { j: mbJ, stairs: 4, lift: 56, entrance: [30, 28, 1],
    rooms: [['Library', 10, 5, 0, { roomType: 'library' }], ['Seminar Hall', 30, 5, 1, { roomType: 'hall' }], ['Administrative Office', 50, 5, 2, { roomType: 'office' }]] });
  await floor('MB', 1, { j: mbJ, stairs: 4, lift: 56,
    rooms: [['Computer Lab 1', 10, 5, 0, { roomType: 'lab' }], ['Computer Lab 2', 30, 5, 1, { roomType: 'lab' }],
      ['Examination Department', 50, 5, 2, { roomType: 'office' }], ['Server Room', 30, 25, 1, { roomType: 'office', pub: false }]] });
  await floor('MB', 2, { j: mbJ, stairs: 4, lift: 56,
    rooms: [['HOD Office - Computer Science', 10, 5, 0, { roomType: 'office' }], ['Staff Room', 30, 5, 1, { roomType: 'office', pub: false }]] });

  // Academic Block: floors 0-3 (junctions at x = 8, 20, 32)
  const abJ = [8, 20, 32];
  await floor('AB', 0, { j: abJ, stairs: 2, lift: 38, entrance: [20, 28, 1], rooms: [['Cafeteria', 20, 5, 1, { roomType: 'cafeteria' }]] });
  await floor('AB', 1, { j: abJ, stairs: 2, lift: 38 });
  await floor('AB', 2, { j: abJ, stairs: 2, lift: 38,
    rooms: [['Room 201 (BCA)', 8, 5, 0], ['Room 202 (BCA)', 20, 5, 1], ['Room 203 (MCA)', 32, 5, 2]] });
  await floor('AB', 3, { j: abJ, stairs: 2, lift: 38, rooms: [['Room 301 (BBA)', 8, 5, 0]] });

  // between floors: stairs (not step-free) and lifts (step-free)
  for (const [bKey, top] of [['MB', 2], ['AB', 3]]) {
    for (let f = 0; f < top; f++) {
      await addEdge(`${bKey}${f}_ST`, `${bKey}${f + 1}_ST`, 12, false);
      await addEdge(`${bKey}${f}_LIFT`, `${bKey}${f + 1}_LIFT`, 8, true);
    }
  }
  // outdoors, between buildings
  await addEdge('GATE', 'MB_ENT', metres(B.GATE, B.MB));
  await addEdge('GATE', 'AB_ENT', metres(B.GATE, B.AB));
  await addEdge('MB_ENT', 'AB_ENT', metres(B.MB, B.AB));
};
