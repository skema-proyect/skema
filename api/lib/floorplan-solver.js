// Solver de planos — layout en 3 franjas, respeta el orden arquitectónico del LLM
// El LLM decide qué va en cada zona y en qué orden (izquierda → derecha).
// Este solver solo convierte eso a coordenadas x,y,w,h.

const ROOM_LABELS = {
  'salon':            'Salón',
  'salon-comedor':    'Salón-Comedor',
  'cocina':           'Cocina',
  'dormitorio':       'Dormitorio',
  'dormitorio-suite': 'Suite',
  'bano':             'Baño',
  'aseo':             'Aseo',
  'distribuidor':     'Distribuidor',
  'terraza':          'Terraza',
  'despensa':         'Despensa',
  'lavadero':         'Lavadero',
  'vestidor':         'Vestidor',
};

function r2(n) { return Math.round(n * 100) / 100; }

// Coloca rooms en una franja, repartiendo ancho (dir='h') o alto (dir='v') proporcional al área
function placeStrip(rooms, x, y, w, h, dir) {
  if (!rooms?.length) return [];
  const total = rooms.reduce((s, r) => s + (r.area_m2 ?? 4), 0);
  if (total <= 0) return [];

  let pos = 0;
  return rooms.map((r, i) => {
    const isLast = i === rooms.length - 1;
    const frac   = (r.area_m2 ?? 4) / total;
    if (dir === 'h') {
      const rw   = isLast ? r2(w - pos) : r2(w * frac);
      const room = { ...r, x: r2(x + pos), y: r2(y), w: rw, h: r2(h), area: r2(rw * h) };
      pos = r2(pos + rw);
      return room;
    } else {
      const rh   = isLast ? r2(h - pos) : r2(h * frac);
      const room = { ...r, x: r2(x), y: r2(y + pos), w: r2(w), h: rh, area: r2(w * rh) };
      pos = r2(pos + rh);
      return room;
    }
  });
}

function addOpenings(rooms, W, H, facade) {
  const EPS = 0.08;
  const touches = (r, wall) => {
    if (wall === 'N') return r.y <= EPS;
    if (wall === 'S') return r.y + r.h >= H - EPS;
    if (wall === 'W') return r.x <= EPS;
    if (wall === 'E') return r.x + r.w >= W - EPS;
    return false;
  };

  const rs = rooms.map(r => ({ ...r, doors: [], windows: [] }));

  // Ventanas en muros exteriores
  for (const r of rs) {
    for (const wall of ['N', 'S', 'E', 'W']) {
      if (!touches(r, wall)) continue;
      const len = (wall === 'N' || wall === 'S') ? r.w : r.h;
      if (len < 1.0) continue;
      const ww  = Math.max(Math.min(r2(len * 0.4), 2.0), 0.7);
      const pos = r2((len - ww) / 2);
      r.windows.push(`${wall}:${Math.max(0.2, pos)}:${ww}`);
    }
  }

  // Puertas interiores — una por pared compartida, solo en room[i]
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      // Pared vertical (a a la izquierda de b)
      if (Math.abs((a.x + a.w) - b.x) < EPS) {
        const oS = Math.max(a.y, b.y), oE = Math.min(a.y + a.h, b.y + b.h);
        const ov = r2(oE - oS);
        if (ov >= 1.0) {
          const pos = r2(oS - a.y + (ov - 0.9) / 2);
          a.doors.push(`E:${Math.max(0.2, Math.min(r2(pos), a.h - 1.1))}:0.9`);
        }
      }
      // Pared horizontal (a encima de b)
      if (Math.abs((a.y + a.h) - b.y) < EPS) {
        const oS = Math.max(a.x, b.x), oE = Math.min(a.x + a.w, b.x + b.w);
        const ov = r2(oE - oS);
        if (ov >= 1.0) {
          const pos = r2(oS - a.x + (ov - 0.9) / 2);
          a.doors.push(`S:${Math.max(0.2, Math.min(r2(pos), a.w - 1.1))}:0.9`);
        }
      }
    }
  }

  // Puerta exterior (entrada principal en la fachada)
  const priority = ['distribuidor', 'salon-comedor', 'salon', 'cocina'];
  let entry = null;
  for (const type of priority) {
    entry = rs.find(r => r.type === type && touches(r, facade));
    if (entry) break;
  }
  if (!entry) entry = rs.find(r => touches(r, facade));
  if (entry) {
    const len = (facade === 'N' || facade === 'S') ? entry.w : entry.h;
    const pos = r2((len - 0.9) / 2);
    entry.doors.push(`${facade}:${Math.max(0.2, Math.min(pos, len - 1.1))}:0.9`);
  }

  return rs;
}

function labelRooms(rooms) {
  const counts = {};
  const rep = new Set(['dormitorio', 'dormitorio-suite', 'bano', 'aseo', 'terraza', 'vestidor']);
  return rooms.map(r => {
    const base = ROOM_LABELS[r.type] ?? r.type;
    counts[r.type] = (counts[r.type] ?? 0) + 1;
    const total = rooms.filter(x => x.type === r.type).length;
    const name  = rep.has(r.type) && total > 1 ? `${base} ${counts[r.type]}` : base;
    return { ...r, name };
  });
}

export function solve(req) {
  const pub  = req.zona_publica  ?? [];
  const priv = req.zona_privada  ?? [];
  const circ = req.circulacion   ?? [];

  if (pub.length + priv.length + circ.length === 0) {
    return { infeasible: 'No se especificaron habitaciones.' };
  }

  // Dimensiones: usar las del usuario o calcular desde el área total
  let W, H;
  if (req.dimensions?.width_m && req.dimensions?.depth_m) {
    W = r2(req.dimensions.width_m);
    H = r2(req.dimensions.depth_m);
  } else {
    const totalArea = req.dimensions?.total_area_m2
      ?? [...pub, ...priv, ...circ].reduce((s, r) => s + (r.area_m2 ?? 4), 0) * 1.1;
    const isEW = req.facade === 'E' || req.facade === 'W';
    W = r2(Math.sqrt(totalArea * (isEW ? 1.0 : 1.5)));
    H = r2(totalArea / W);
  }

  const facade = req.facade ?? 'S';
  const isNS   = facade === 'N' || facade === 'S';
  const MIN_C  = 1.2; // pasillo mínimo 1.2 m

  const pubA  = pub.reduce((s, r)  => s + (r.area_m2 ?? 4), 0);
  const privA = priv.reduce((s, r) => s + (r.area_m2 ?? 4), 0);
  const circA = circ.reduce((s, r) => s + (r.area_m2 ?? 4), 0);
  const total = pubA + privA + circA;

  let placed;

  if (isNS) {
    // Franjas horizontales
    const circH = circ.length ? Math.max(r2(H * circA / total), MIN_C) : 0;
    const rem   = r2(H - circH);
    const pubH  = r2(rem * pubA / (pubA + privA || 1));
    const privH = r2(rem - pubH);

    const [pubY, circY, privY] = facade === 'N'
      ? [0, pubH, r2(pubH + circH)]
      : [r2(privH + circH), privH, 0];

    placed = [
      ...placeStrip(pub,  0, pubY,  W, pubH,  'h'),
      ...placeStrip(circ, 0, circY, W, circH, 'h'),
      ...placeStrip(priv, 0, privY, W, privH, 'h'),
    ];
  } else {
    // Franjas verticales
    const circW = circ.length ? Math.max(r2(W * circA / total), MIN_C) : 0;
    const rem   = r2(W - circW);
    const pubW  = r2(rem * pubA / (pubA + privA || 1));
    const privW = r2(rem - pubW);

    const [pubX, circX, privX] = facade === 'W'
      ? [0, pubW, r2(pubW + circW)]
      : [r2(privW + circW), privW, 0];

    placed = [
      ...placeStrip(pub,  pubX,  0, pubW,  H, 'v'),
      ...placeStrip(circ, circX, 0, circW, H, 'v'),
      ...placeStrip(priv, privX, 0, privW, H, 'v'),
    ];
  }

  const withOpenings = addOpenings(placed.filter(Boolean), W, H, facade);
  const labeled = labelRooms(withOpenings);
  const rooms = labeled.map(({ name, type, x, y, w, h, area, doors, windows }) =>
    ({ name, type, x, y, w, h, area, doors, windows })
  );

  const nDorm    = [...pub, ...priv].filter(r => r.type === 'dormitorio' || r.type === 'dormitorio-suite').length;
  const totalM2  = req.dimensions?.total_area_m2 ?? r2(W * H);
  const title    = nDorm > 0 ? `Vivienda ${totalM2}m² — ${nDorm} dorm.` : `Distribución ${totalM2}m²`;

  return { layout: { title, width: W, height: H, rooms } };
}
