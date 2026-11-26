import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  CAMPUS_BUILDINGS,
  CAMPUS_GRAPH,
  computeCampusRoute,
  getCampusFloorPlan,
  getCampusPlaces,
} from '../data/mockData.js';
import {
  Compass,
  Accessibility,
  Search,
  Building,
  Layers,
  Footprints,
  Clock,
  X,
  CheckCircle2,
  QrCode,
} from '../components/Icons.jsx';

const CENTER = [23.2602, 77.413];

const splitLabel = (name) => {
  if (name.length <= 12 || !name.includes(' ')) return [name];
  const mid = name.length / 2;
  let best = -1;
  [...name].forEach((ch, i) => {
    if (ch === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  });
  return [name.slice(0, best), name.slice(best + 1)];
};

function FloorPlan({ plan, route, from, to, onPick }) {
  if (!plan) {
    return (
      <div className="h-64 grid place-items-center text-xs text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
        Select a building and floor level above to view its architectural layout.
      </div>
    );
  }

  const byId = new Map(plan.nodes.map((n) => [n.id, n]));
  const pad = 10;
  const minX = Math.min(...plan.nodes.map((n) => n.x)) - pad;
  const maxX = Math.max(...plan.nodes.map((n) => n.x)) + pad;
  const minY = Math.min(...plan.nodes.map((n) => n.y)) - pad;
  const maxY = Math.max(...plan.nodes.map((n) => n.y)) + pad;

  const runs = [];
  if (route) {
    let run = [];
    for (const n of route.path) {
      if (n.building_id === plan.building.id && n.floor === plan.floor) run.push(n);
      else {
        if (run.length > 1) runs.push(run);
        run = [];
      }
    }
    if (run.length > 1) runs.push(run);
  }

  const isFrom = (n) => from && n.id === from.id;
  const isTo = (n) => to && n.id === to.id;

  return (
    <div
      data-tour="campus-floorplan"
      className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs"
    >
      <svg
        viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
        className="w-full h-auto max-h-[430px] bg-slate-50/40"
        role="img"
        aria-label={`Floor layout: ${plan.building.name}, ${plan.floor_label}`}
      >
        {plan.edges.map((e, i) => {
          const a = byId.get(e.a);
          const b = byId.get(e.b);
          return a && b ? (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#e2e8f0"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
          ) : null;
        })}

        {runs.map((run, i) => (
          <polyline
            key={i}
            points={run.map((n) => `${n.x},${n.y}`).join(' ')}
            fill="none"
            stroke="#4f46e5"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="2 1"
          />
        ))}

        {plan.nodes.map((n) => {
          if (n.type === 'junction') return null;
          const clickable = n.type === 'room' || n.type === 'entrance';
          const fill = isTo(n)
            ? '#fee2e2'
            : isFrom(n)
            ? '#dcfce7'
            : n.type === 'room'
            ? '#ffffff'
            : '#fef3c7';

          const stroke = isTo(n)
            ? '#ef4444'
            : isFrom(n)
            ? '#22c55e'
            : n.type === 'entrance'
            ? '#d97706'
            : '#94a3b8';

          const lines = clickable ? splitLabel(n.name) : [n.type === 'lift' ? 'Lift' : 'Stairs'];
          const small = n.type === 'stairs' || n.type === 'lift';
          const w = small ? 4.5 : 12;
          const h = small ? 4.5 : 6.5;

          return (
            <g
              key={n.id}
              onClick={clickable ? () => onPick(n) : undefined}
              className={clickable ? 'cursor-pointer group' : ''}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
            >
              <title>{n.name} (Click to set as destination)</title>
              {n.type === 'entrance' ? (
                <circle cx={n.x} cy={n.y} r="2.5" fill={fill} stroke={stroke} strokeWidth="0.5" />
              ) : (
                <rect
                  x={n.x - w / 2}
                  y={n.y - h / 2}
                  width={w}
                  height={h}
                  rx="0.9"
                  fill={fill}
                  stroke={stroke}
                  strokeWidth="0.5"
                  className="transition-colors group-hover:stroke-indigo-600"
                />
              )}
              {lines.map((t, i) => (
                <text
                  key={i}
                  x={n.x}
                  y={n.y + h / 2 + 2.4 + i * 2}
                  fontSize="1.7"
                  textAnchor="middle"
                  fill="#1e293b"
                  fontWeight={isTo(n) || isFrom(n) ? 'bold' : 'normal'}
                >
                  {t}
                </text>
              ))}
              {(isFrom(n) || isTo(n)) && (
                <circle cx={n.x} cy={n.y} r="1.4" fill={isTo(n) ? '#dc2626' : '#16a34a'} />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Campus({ initial = {}, onBack }) {
  const lookupNode = (ref) => {
    if (!ref) return null;
    return CAMPUS_GRAPH.nodes.find((x) => x.id === ref || x.qr_code === ref) || null;
  };

  const [query, setQuery] = useState('');
  const [from, setFrom] = useState(() => lookupNode(initial.at || initial.from) || lookupNode('GATE'));
  const [to, setTo] = useState(() => lookupNode(initial.to) || lookupNode('AB2_QR-AB2-ROOM-201-BCA'));
  const [youAreHere, setYouAreHere] = useState(() => lookupNode(initial.at));
  const [accessible, setAccessible] = useState(Boolean(initial.accessible));
  const [floorSel, setFloorSel] = useState(() => {
    const dest = lookupNode(initial.to) || lookupNode('AB2_QR-AB2-ROOM-201-BCA');
    return { buildingId: dest.building_id, floor: dest.floor };
  });
  const [viewTab, setViewTab] = useState(initial.viewTab || 'floor');

  const mapDiv = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    if (initial.from) {
      const f = lookupNode(initial.from);
      if (f) setFrom(f);
    }
    if (initial.at) {
      const h = lookupNode(initial.at);
      if (h) {
        setFrom(h);
        setYouAreHere(h);
        setFloorSel({ buildingId: h.building_id, floor: h.floor });
      }
    }
    if (initial.to) {
      const t = lookupNode(initial.to);
      if (t) {
        setTo(t);
        setFloorSel({ buildingId: t.building_id, floor: t.floor });
      }
    }
    if (typeof initial.accessible === 'boolean') {
      setAccessible(initial.accessible);
    }
    if (initial.viewTab) {
      setViewTab(initial.viewTab);
    }
  }, [initial]);

  const places = useMemo(() => getCampusPlaces(query), [query]);
  const route = useMemo(() => {
    if (!from || !to) return null;
    return computeCampusRoute(from.id, to.id, accessible);
  }, [from, to, accessible]);

  const plan = useMemo(() => {
    if (!floorSel) return null;
    return getCampusFloorPlan(floorSel.buildingId, floorSel.floor);
  }, [floorSel]);

  const simulateQr = (qrCode) => {
    const node = lookupNode(qrCode);
    if (!node) return;
    setFrom(node);
    setYouAreHere(node);
    setFloorSel({ buildingId: node.building_id, floor: node.floor });
  };

  useEffect(() => {
    if (viewTab !== 'map' || !mapDiv.current) return;
    const map = L.map(mapDiv.current, { scrollWheelZoom: false }).setView(CENTER, 17);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [viewTab]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !mapRef.current) return;
    layer.clearLayers();
    const pts = [];
    CAMPUS_BUILDINGS.forEach((b) => {
      pts.push([b.lat, b.lng]);
      L.circleMarker([b.lat, b.lng], {
        radius: 9,
        color: '#4338ca',
        weight: 2,
        fillColor: '#6366f1',
        fillOpacity: 0.9,
      })
        .bindTooltip(b.name, { permanent: true, direction: 'top', offset: [0, -8] })
        .bindPopup(
          `<b>${b.name}</b><br>${b.description}<br><span class="text-xs text-slate-500">${b.floors.length} floor(s), ${b.place_count} rooms</span>`
        )
        .on('click', () => {
          if (b.floors.length) {
            setFloorSel({ buildingId: b.id, floor: b.floors[0] });
            setViewTab('floor');
          }
        })
        .addTo(layer);
    });

    if (route) {
      const line = [];
      route.path.forEach((n) => {
        const last = line[line.length - 1];
        if (!last || last[2] !== n.building_id) line.push([n.lat, n.lng, n.building_id]);
      });
      L.polyline(
        line.map((l) => [l[0], l[1]]),
        { color: '#4f46e5', weight: 4, opacity: 0.85, dashArray: '6 6' }
      ).addTo(layer);
      L.circleMarker([route.from.lat, route.from.lng], {
        radius: 6,
        color: '#15803d',
        fillColor: '#22c55e',
        fillOpacity: 1,
      }).addTo(layer);
      L.circleMarker([route.to.lat, route.to.lng], {
        radius: 6,
        color: '#b91c1c',
        fillColor: '#ef4444',
        fillOpacity: 1,
      }).addTo(layer);
      mapRef.current.fitBounds(L.latLngBounds(line.map((l) => [l[0], l[1]])).pad(0.5), { maxZoom: 18 });
    } else if (pts.length) {
      mapRef.current.fitBounds(L.latLngBounds(pts).pad(0.4), { maxZoom: 18 });
    }
  }, [route, viewTab]);

  const stops = useMemo(() => {
    if (!route) return [];
    const out = [];
    route.path.forEach((n) => {
      const last = out[out.length - 1];
      if (!last || last.buildingId !== n.building_id || last.floor !== n.floor) {
        out.push({
          buildingId: n.building_id,
          floor: n.floor,
          label: `${n.building} · ${n.floor_label}`,
        });
      }
    });
    return out;
  }, [route]);

  const floorsOf = (b) => CAMPUS_BUILDINGS.find((x) => x.id === b)?.floors || [];
  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      <header className="h-14 bg-white border-b border-slate-200/80 px-4 md:px-6 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-2xs cursor-pointer"
          >
            ← Return to Chat
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-indigo-600" />
            <h1 className="font-semibold text-slate-900 text-sm tracking-tight">Campus Wayfinding &amp; Directory</h1>
          </div>
        </div>

        <div
          data-tour="campus-view-toggle"
          className="flex p-0.5 rounded-xl border border-slate-200 bg-slate-100 text-xs font-medium"
        >
          <button
            type="button"
            onClick={() => setViewTab('floor')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer ${
              viewTab === 'floor'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Floor Plan</span>
          </button>
          <button
            type="button"
            onClick={() => setViewTab('map')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all cursor-pointer ${
              viewTab === 'map'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Campus Overview</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden grid lg:grid-cols-[24rem_1fr]">
        {/* Left Control Panel */}
        <div className="h-full overflow-y-auto border-r border-slate-200/80 bg-white p-4 space-y-4">
          {youAreHere && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <span className="font-semibold">Position verified via QR: </span>
                {youAreHere.name} ({youAreHere.building}, {youAreHere.floor_label})
              </div>
            </div>
          )}

          {/* Simulated Door QR Scanner */}
          <div
            data-tour="campus-qr-sim"
            className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-2"
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-800 uppercase tracking-wider">
              <QrCode className="w-3.5 h-3.5" />
              <span>Simulate Door QR Placard Scan</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Main Gate', qr: 'QR-GATE' },
                { label: 'Library', qr: 'QR-MB0-LIBRARY' },
                { label: 'Computer Lab 1', qr: 'QR-MB1-COMPUTER-LAB-1' },
              ].map((item) => (
                <button
                  key={item.qr}
                  type="button"
                  onClick={() => simulateQr(item.qr)}
                  className="px-2 py-1 rounded-lg bg-white border border-indigo-200 hover:bg-indigo-600 hover:text-white text-[11px] font-medium text-indigo-700 transition-colors cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Route Origin & Destination */}
          <div
            data-tour="campus-route-planner"
            className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Walking Route Planner
              </span>
              <button
                type="button"
                onClick={swap}
                disabled={!from && !to}
                className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-40 cursor-pointer"
              >
                ⇅ Swap Start/End
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Origin</div>
                <div className="text-xs font-medium text-slate-900 truncate">
                  {from ? `${from.name} (${from.building})` : 'Select origin or scan QR'}
                </div>
              </div>
              {from && (
                <button onClick={() => setFrom(null)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="h-px bg-slate-200/80 ml-5" />

            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-200 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Destination</div>
                <div className="text-xs font-medium text-slate-900 truncate">
                  {to ? `${to.name} (${to.building})` : 'Select destination room'}
                </div>
              </div>
              {to && (
                <button onClick={() => setTo(null)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Accessible toggle */}
            <div
              data-tour="campus-accessible-toggle"
              className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs"
            >
              <label className="flex items-center gap-2 text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={accessible}
                  onChange={(e) => setAccessible(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="flex items-center gap-1.5">
                  <Accessibility className="w-3.5 h-3.5 text-indigo-600" />
                  Step-free path (elevators only)
                </span>
              </label>
            </div>
          </div>

          {/* Turn-by-Turn Directions */}
          {route && (
            <div
              data-tour="campus-directions"
              className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <Footprints className="w-4 h-4 text-indigo-600" />
                  <span>{route.distance_m} m</span>
                  <span className="text-slate-300">·</span>
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>~{route.minutes} min walk</span>
                </div>
                {route.accessible && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Step-Free
                  </span>
                )}
              </div>

              <ol className="space-y-2 text-xs text-slate-700 pl-1 border-l-2 border-indigo-200 ml-1.5">
                {route.steps.map((s, i) => (
                  <li key={i} className="pl-3 relative">
                    <span className="absolute -left-[5px] top-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    <span>{s.text}</span>
                  </li>
                ))}
              </ol>

              {stops.length > 0 && (
                <div className="pt-2 border-t border-indigo-100/80">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase mb-1.5">
                    Layout by Floor Level
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {stops.map((s, i) => {
                      const active = floorSel?.buildingId === s.buildingId && floorSel?.floor === s.floor;
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            setFloorSel({ buildingId: s.buildingId, floor: s.floor });
                            setViewTab('floor');
                          }}
                          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                            active
                              ? 'bg-indigo-600 text-white shadow-2xs'
                              : 'bg-white border border-indigo-200/80 text-indigo-700 hover:bg-indigo-50'
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Place Search Directory */}
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Search Campus Directory
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search room, lab, office, library…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
              />
            </div>

            <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {places.map((p) => (
                <div key={p.id} className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-900 truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {p.building} · {p.floor_label}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setTo(p);
                        setFloorSel({ buildingId: p.building_id, floor: p.floor });
                      }}
                      className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-semibold transition-all cursor-pointer"
                    >
                      Destination
                    </button>
                    <button
                      onClick={() => setFrom(p)}
                      className="px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-[11px] font-medium transition-all cursor-pointer"
                    >
                      Start
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Canvas */}
        <div className="h-full overflow-hidden p-4 md:p-6 bg-slate-100/60 flex flex-col">
          {viewTab === 'floor' ? (
            <div className="h-full flex flex-col space-y-3">
              <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-indigo-600" />
                  <select
                    aria-label="Building"
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-500"
                    value={floorSel?.buildingId || ''}
                    onChange={(e) => {
                      const f = floorsOf(e.target.value);
                      if (f.length) setFloorSel({ buildingId: e.target.value, floor: f[0] });
                    }}
                  >
                    {CAMPUS_BUILDINGS.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  {floorSel &&
                    floorsOf(floorSel.buildingId).map((f) => {
                      const active = f === floorSel.floor;
                      return (
                        <button
                          key={f}
                          onClick={() => setFloorSel({ ...floorSel, floor: f })}
                          className={`text-xs px-3 py-1 rounded-xl font-semibold transition-all cursor-pointer ${
                            active
                              ? 'bg-indigo-600 text-white shadow-2xs'
                              : 'bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {f === 0 ? 'Ground Floor' : `Floor ${f}`}
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                <FloorPlan
                  plan={plan}
                  route={route}
                  from={from}
                  to={to}
                  onPick={(n) => {
                    setTo(n);
                    setFloorSel({ buildingId: n.building_id, floor: n.floor });
                  }}
                />
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 px-1">
                  <span>Click any room on the plan to target it as your destination.</span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> Origin
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-rose-500" /> Destination
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-0.5 bg-indigo-600" /> Route
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col bg-white rounded-2xl border border-slate-200/80 p-2 shadow-2xs">
              <div ref={mapDiv} className="w-full flex-1 rounded-xl z-0" aria-label="Campus geographic map" />
              <div className="p-2 text-xs text-slate-500 flex items-center justify-between">
                <span>Click building markers to view room counts and jump to floor blueprints.</span>
                <span>Coordinates: 23.2602° N, 77.4130° E</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
