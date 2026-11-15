import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../api.js';

const CENTER = [23.2602, 77.413];
const ICON = { room: '🚪', entrance: '🏁', stairs: '🪜', lift: '🛗' };

const splitLabel = (name) => {
  if (name.length <= 12 || !name.includes(' ')) return [name];
  const mid = name.length / 2;
  let best = -1;
  [...name].forEach((ch, i) => { if (ch === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i; });
  return [name.slice(0, best), name.slice(best + 1)];
};

// ---------------------------------------------------------------- floor plan (drawn from the walking graph)
function FloorPlan({ plan, route, from, to, onPick }) {
  if (!plan) return <p className="text-sm text-slate-500 p-4">Choose a building and floor to see its plan.</p>;
  const byId = new Map(plan.nodes.map((n) => [n.id, n]));
  const pad = 9;
  const minX = Math.min(...plan.nodes.map((n) => n.x)) - pad, maxX = Math.max(...plan.nodes.map((n) => n.x)) + pad;
  const minY = Math.min(...plan.nodes.map((n) => n.y)) - pad, maxY = Math.max(...plan.nodes.map((n) => n.y)) + pad;

  // runs of the route that lie on this floor
  const runs = [];
  if (route) {
    let run = [];
    for (const n of route.path) {
      if (n.building_id === plan.building.id && n.floor === plan.floor) run.push(n);
      else { if (run.length > 1) runs.push(run); run = []; }
    }
    if (run.length > 1) runs.push(run);
  }
  const isFrom = (n) => from && n.id === from.id, isTo = (n) => to && n.id === to.id;

  return (
    <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} className="w-full h-auto bg-white rounded-lg border border-slate-200"
      role="img" aria-label={`Floor plan: ${plan.building.name}, ${plan.floor_label}`}>
      {plan.edges.map((e, i) => {
        const a = byId.get(e.a), b = byId.get(e.b);
        return a && b ? <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#cbd5e1" strokeWidth="2.4" strokeLinecap="round" /> : null;
      })}
      {runs.map((run, i) => (
        <polyline key={i} points={run.map((n) => `${n.x},${n.y}`).join(' ')} fill="none" stroke="#4f46e5" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {plan.nodes.map((n) => {
        if (n.type === 'junction') return null;
        const clickable = n.type === 'room' || n.type === 'entrance';
        const fill = isTo(n) ? '#fecaca' : isFrom(n) ? '#bbf7d0' : n.type === 'room' ? '#ffffff' : '#fef3c7';
        const lines = clickable ? splitLabel(n.name) : [n.type === 'lift' ? 'Lift' : 'Stairs'];
        const small = n.type === 'stairs' || n.type === 'lift';
        const w = small ? 4 : 11, h = small ? 4 : 6;
        return (
          <g key={n.id} onClick={clickable ? () => onPick(n) : undefined} style={{ cursor: clickable ? 'pointer' : 'default' }}
            role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined} aria-label={clickable ? `Select ${n.name}` : undefined}
            onKeyDown={clickable ? (e) => { if (e.key === 'Enter') onPick(n); } : undefined}>
            <title>{n.name}</title>
            {n.type === 'entrance'
              ? <circle cx={n.x} cy={n.y} r="2.2" fill={fill} stroke="#d97706" strokeWidth="0.4" />
              : <rect x={n.x - w / 2} y={n.y - h / 2} width={w} height={h} rx="0.8" fill={fill} stroke="#64748b" strokeWidth="0.4" />}
            {lines.map((t, i) => (
              <text key={i} x={n.x} y={n.y + h / 2 + 2.6 + i * 2.1} fontSize="1.8" textAnchor="middle" fill="#334155">{t}</text>
            ))}
            {(isFrom(n) || isTo(n)) && <circle cx={n.x} cy={n.y} r="1.5" fill={isTo(n) ? '#dc2626' : '#16a34a'} />}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- page
export default function Campus({ initial = {}, onBack }) {
  const [buildings, setBuildings] = useState([]);
  const [places, setPlaces] = useState([]);
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [youAreHere, setYouAreHere] = useState(null);
  const [accessible, setAccessible] = useState(Boolean(initial.accessible));
  const [route, setRoute] = useState(null);
  const [floorSel, setFloorSel] = useState(null);       // { buildingId, floor }
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const mapDiv = useRef(null), mapRef = useRef(null), layerRef = useRef(null);

  // ---- load buildings once, and resolve anything passed in (QR code / link from the chat)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [b, p] = await Promise.all([api.campusBuildings(), api.campusPlaces('')]);
        if (cancelled) return;
        setBuildings(b.buildings); setPlaces(p.places);
        const lookup = async (ref) => {
          if (!ref) return null;
          const hit = p.places.find((x) => x.id === ref || x.qr_code === ref);
          if (hit) return hit;
          try { return (await api.campusQr(ref)).place; } catch { return null; }
        };
        if (initial.at) {
          const here = await lookup(initial.at);
          if (here) { setFrom(here); setYouAreHere(here); setFloorSel({ buildingId: here.building_id, floor: here.floor }); }
          else setError('This QR code is not recognised.');
        }
        if (initial.from) setFrom(await lookup(initial.from));
        if (initial.to) { const dest = await lookup(initial.to); if (dest) { setTo(dest); if (!initial.at && !initial.from) setFloorSel({ buildingId: dest.building_id, floor: dest.floor }); } }
        if (!initial.at && !initial.from && initial.to) {
          const gate = p.places.find((x) => x.qr_code === 'QR-GATE');     // visitors start at the main gate by default
          if (gate) setFrom(gate);
        }
      } catch (e) { setError(e.message); } finally { if (!cancelled) setReady(true); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- search (debounced)
  useEffect(() => {
    if (!ready) return undefined;
    const t = setTimeout(() => { api.campusPlaces(query).then((r) => setPlaces(r.places)).catch((e) => setError(e.message)); }, 250);
    return () => clearTimeout(t);
  }, [query, ready]);

  // ---- directions whenever both ends (or the step-free option) change
  useEffect(() => {
    if (!from || !to) { setRoute(null); return; }
    let cancelled = false;
    setError('');
    api.campusRoute(from.id, to.id, accessible).then((r) => {
      if (cancelled) return;
      setRoute(r);
      setFloorSel({ buildingId: r.from.building_id, floor: r.from.floor });
    }).catch((e) => { if (!cancelled) { setRoute(null); setError(e.message); } });
    return () => { cancelled = true; };
  }, [from, to, accessible]);

  // ---- floor plan
  useEffect(() => {
    if (!floorSel) { setPlan(null); return; }
    api.campusFloor(floorSel.buildingId, floorSel.floor).then(setPlan).catch(() => setPlan(null));
  }, [floorSel]);

  // ---- outdoor map (Leaflet + OpenStreetMap)
  useEffect(() => {
    const map = L.map(mapDiv.current, { scrollWheelZoom: false }).setView(CENTER, 17);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    mapRef.current = map; layerRef.current = L.layerGroup().addTo(map);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !mapRef.current) return;
    layer.clearLayers();
    const pts = [];
    buildings.forEach((b) => {
      pts.push([b.lat, b.lng]);
      L.circleMarker([b.lat, b.lng], { radius: 9, color: '#4338ca', weight: 2, fillColor: '#6366f1', fillOpacity: 0.9 })
        .bindTooltip(b.name, { permanent: true, direction: 'top', offset: [0, -8] })
        .bindPopup(`<b>${b.name}</b><br>${b.description || ''}<br>${b.floors.length} floor(s), ${b.place_count} rooms`)
        .on('click', () => { if (b.floors.length) setFloorSel({ buildingId: b.id, floor: b.floors[0] }); })
        .addTo(layer);
    });
    if (route) {
      const line = [];
      route.path.forEach((n) => { const last = line[line.length - 1]; if (!last || last[2] !== n.building_id) line.push([n.lat, n.lng, n.building_id]); });
      L.polyline(line.map((l) => [l[0], l[1]]), { color: '#4f46e5', weight: 5, opacity: 0.8, dashArray: '8 8' }).addTo(layer);
      L.circleMarker([route.from.lat, route.from.lng], { radius: 6, color: '#15803d', fillColor: '#22c55e', fillOpacity: 1 }).addTo(layer);
      L.circleMarker([route.to.lat, route.to.lng], { radius: 6, color: '#b91c1c', fillColor: '#ef4444', fillOpacity: 1 }).addTo(layer);
      mapRef.current.fitBounds(L.latLngBounds(line.map((l) => [l[0], l[1]])).pad(0.5), { maxZoom: 18 });
    } else if (pts.length) {
      mapRef.current.fitBounds(L.latLngBounds(pts).pad(0.4), { maxZoom: 18 });
    }
  }, [buildings, route]);

  const stops = useMemo(() => {            // floors the route passes through, in order
    if (!route) return [];
    const out = [];
    route.path.forEach((n) => { const last = out[out.length - 1]; if (!last || last.buildingId !== n.building_id || last.floor !== n.floor) out.push({ buildingId: n.building_id, floor: n.floor, label: `${n.building} · ${n.floor_label}` }); });
    return out;
  }, [route]);
  const floorsOf = (b) => buildings.find((x) => x.id === b)?.floors || [];
  const swap = () => { setFrom(to); setTo(from); };
  const fieldBtn = 'text-xs rounded-md border px-2 py-1 hover:bg-slate-50';

  return (
    <div className="min-h-full bg-slate-100">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-indigo-600 hover:underline">← Back</button>
        <h1 className="font-semibold flex-1">🗺 Campus map</h1>
      </header>

      <div className="max-w-6xl mx-auto p-3 md:p-4 grid gap-4 lg:grid-cols-[22rem_1fr]">
        {/* ---------------- left: search, from/to, directions */}
        <div className="space-y-4">
          {youAreHere && <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-3 py-2">📍 You are here: <b>{youAreHere.name}</b> ({youAreHere.building}, {youAreHere.floor_label})</div>}
          {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex justify-between"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss" className="font-bold">×</button></div>}

          <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
            <label className="text-sm font-medium" htmlFor="place-search">Find a room or facility</label>
            <input id="place-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. computer lab, library, exam department"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <ul className="max-h-56 overflow-y-auto divide-y divide-slate-100">
              {places.length === 0 && <li className="text-sm text-slate-500 py-2">No matching place. Try another word.</li>}
              {places.map((p) => (
                <li key={p.id} className="py-1.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{ICON[p.type] || ''} {p.name}</div>
                    <div className="text-xs text-slate-500">{p.building} · {p.floor_label}</div></div>
                  <button className={fieldBtn} onClick={() => setTo(p)}>Go here</button>
                  <button className={fieldBtn} onClick={() => setFrom(p)}>Start</button>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2 text-sm">
            <div className="flex items-center gap-2"><span className="w-14 text-slate-500">From</span><b className="flex-1 truncate">{from ? from.name : 'Choose a start'}</b>{from && <button className={fieldBtn} onClick={() => setFrom(null)}>Clear</button>}</div>
            <div className="flex items-center gap-2"><span className="w-14 text-slate-500">To</span><b className="flex-1 truncate">{to ? to.name : 'Choose a destination'}</b>{to && <button className={fieldBtn} onClick={() => setTo(null)}>Clear</button>}</div>
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2"><input type="checkbox" checked={accessible} onChange={(e) => setAccessible(e.target.checked)} /> Step-free route (lifts only)</label>
              <button className={fieldBtn} onClick={swap} disabled={!from && !to}>⇅ Swap</button>
            </div>
          </div>

          {route && (
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <div className="font-semibold">{route.distance_m} m · about {route.minutes} min walk{route.accessible ? ' · step-free' : ''}</div>
              <ol className="mt-2 space-y-1.5 text-sm list-decimal pl-5">
                {route.steps.map((s, i) => <li key={i}>{s.text}</li>)}
              </ol>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {stops.map((s, i) => (
                  <button key={i} className={`${fieldBtn} ${floorSel && floorSel.buildingId === s.buildingId && floorSel.floor === s.floor ? 'bg-indigo-50 border-indigo-300' : ''}`}
                    onClick={() => setFloorSel({ buildingId: s.buildingId, floor: s.floor })}>{s.label}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ---------------- right: outdoor map + floor plan */}
        <div className="space-y-4 min-w-0">
          <div className="bg-white rounded-xl border border-slate-200 p-2">
            <div ref={mapDiv} className="h-64 md:h-80 rounded-lg z-0" aria-label="Campus map" />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <select aria-label="Building" className="rounded-lg border border-slate-300 px-2 py-1 text-sm" value={floorSel?.buildingId || ''}
                onChange={(e) => { const f = floorsOf(e.target.value); if (f.length) setFloorSel({ buildingId: e.target.value, floor: f[0] }); }}>
                <option value="" disabled>Building…</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {floorSel && floorsOf(floorSel.buildingId).map((f) => (
                <button key={f} onClick={() => setFloorSel({ ...floorSel, floor: f })}
                  className={`${fieldBtn} ${f === floorSel.floor ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-600' : ''}`}>{f === 0 ? 'Ground' : `Floor ${f}`}</button>
              ))}
            </div>
            <FloorPlan plan={plan} route={route} from={from} to={to} onPick={(n) => setTo(n)} />
            <p className="text-xs text-slate-500 mt-2">Tap a room on the plan to set it as your destination. Green = start, red = destination, purple line = your route.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
