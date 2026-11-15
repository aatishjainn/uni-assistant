// Public campus map API. Visitors need no account; staff-only places are hidden unless a teacher / HOD / admin is signed in.
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const campus = require('../services/campus');
const asyncHandler = require('../middleware/asyncHandler');
const { optionalAuthenticate } = require('../middleware/auth');

router.use(rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' } }));
router.use(optionalAuthenticate);

const role = (req) => req.user?.role;
const bad = (res, msg = 'Invalid request') => res.status(400).json({ error: msg });
const uuid = z.string().uuid();

router.get('/buildings', asyncHandler(async (req, res) => {
  res.json({ buildings: campus.buildingsInfo(await campus.loadGraph(), role(req)) });
}));

const placesQuery = z.object({
  q: z.string().max(100).optional(),
  building: uuid.optional(),
  floor: z.coerce.number().int().min(0).max(50).optional(),
});
router.get('/places', asyncHandler(async (req, res) => {
  const parsed = placesQuery.safeParse(req.query);
  if (!parsed.success) return bad(res);
  const { q = '', building, floor } = parsed.data;
  const hits = campus.searchPlaces(await campus.loadGraph(), q, { role: role(req), building, floor, limit: 50 });
  res.json({ places: hits.map((h) => h.place) });
}));

router.get('/floor/:buildingId/:floor', asyncHandler(async (req, res) => {
  const b = uuid.safeParse(req.params.buildingId), f = z.coerce.number().int().min(0).max(50).safeParse(req.params.floor);
  if (!b.success || !f.success) return bad(res);
  const plan = campus.floorPlan(await campus.loadGraph(), b.data, f.data, role(req));
  if (!plan) return res.status(404).json({ error: 'Floor plan not found' });
  res.json(plan);
}));

const ref = z.string().min(3).max(80).regex(/^[A-Za-z0-9-]+$/);
router.get('/route', asyncHandler(async (req, res) => {
  const parsed = z.object({ from: ref, to: ref, accessible: z.enum(['true', 'false']).optional() }).safeParse(req.query);
  if (!parsed.success) return bad(res, 'Give a "from" and a "to" place');
  const r = await campus.route(parsed.data.from, parsed.data.to, { role: role(req), accessible: parsed.data.accessible === 'true' });
  if (r.error === 'not_found') return res.status(404).json({ error: 'Place not found' });
  if (r.error === 'no_route') return res.status(404).json({ error: 'No walkable route between these places' });
  res.json(r);
}));

// A scanned QR code resolves to a place ("You are here")
router.get('/qr/:token', asyncHandler(async (req, res) => {
  if (!/^QR-[A-Z0-9-]{2,60}$/.test(req.params.token)) return bad(res, 'Invalid QR code');
  const graph = await campus.loadGraph();
  const node = campus.findNode(graph, req.params.token, role(req));
  if (!node) return res.status(404).json({ error: 'Unknown QR code' });
  res.json({ place: campus.publicNode(node) });
}));

module.exports = router;
