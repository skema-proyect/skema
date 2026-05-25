// Solver geométrico para planos de planta — slicing tree algorithm
// Recibe requirements (del LLM) y devuelve layout (spec para el renderer)

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

// Áreas mínimas CTE
const CTE_MIN = {
  'dormitorio':       6,
  'dormitorio-suite': 10,
  'salon':            14,
  'salon-comedor':    14,
  'cocina':           5,
  'bano':             3,
  'aseo':             2.5,
  'distribuidor':     3,
  'vestidor':         2,
  'lavadero':         2,
  'despensa':         1.5,
  'terraza':          4,
};

const PRIVATE_TYPES = new Set([
  'dormitorio', 'dormitorio-suite', 'bano', 'aseo', 'vestidor', 'lavadero', 'despensa',
]);

function isPrivate(type) { return PRIVATE_TYPES.has(type); }
function r2(n) { return Math.round(n * 100) / 100; }

// Construye un árbol binario balanceado por área
function buildTree(rooms) {
  if (rooms.length === 0) return null;
  if (rooms.length === 1) return { leaf: rooms[0] };

  const total = rooms.reduce((s, r) => s + r._area, 0);
  const sorted = [...rooms].sort((a, b) => b._area - a._area);

  let best = 1, bestDiff = Infinity, cum = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    cum += sorted[i]._area;
    const diff = Math.abs(cum * 2 - total);
    if (diff < bestDiff) { bestDiff = diff; best = i + 1; }
  }

  const left  = sorted.slice(0, best);
  const right = sorted.slice(best);
  const ratio = r2(left.reduce((s, r) => s + r._area, 0) / total);

  return { ratio, left: buildTree(left), right: buildTree(right) };
}

// Asigna posiciones x,y,w,h a cada hoja del árbol
function layoutTree(node, x, y, w, h, depth = 0) {
  if (!node) return [];
  if (node.leaf) {
    return [{ ...node.leaf, x: r2(x), y: r2(y), w: r2(w), h: r2(h), area: r2(w * h) }];
  }

  // Elige dirección: horizontal si el espacio es más ancho que alto, alternando con la profundidad
  const splitH = depth % 2 === 0 ? w >= h : w > h * 1.4;

  if (splitH) {
    const leftW = r2(w * node.ratio);
    return [
      ...layoutTree(node.left,  x,         y, leftW,      h, depth + 1),
      ...layoutTree(node.right, x + leftW, y, w - leftW,  h, depth + 1),
    ];
  } else {
    const topH = r2(h * node.ratio);
    return [
      ...layoutTree(node.left,  x, y,        w, topH,      depth + 1),
      ...layoutTree(node.right, x, y + topH, w, h - topH,  depth + 1),
    ];
  }
}

// Genera puertas y ventanas para los rooms posicionados
function addOpenings(rooms, totalW, totalH, facades) {
  const EPS = 0.08;

  function touchesWall(r, wall) {
    if (wall === 'N') return r.y <= EPS;
    if (wall === 'S') return r.y + r.h >= totalH - EPS;
    if (wall === 'W') return r.x <= EPS;
    if (wall === 'E') return r.x + r.w >= totalW - EPS;
    return false;
  }

  // Inicializar arrays de aperturas
  const result = rooms.map(r => ({ ...r, doors: [], windows: [] }));

  // Ventanas exteriores
  for (const r of result) {
    for (const wall of ['N', 'S', 'E', 'W']) {
      if (!touchesWall(r, wall)) continue;
      const wallLen = (wall === 'N' || wall === 'S') ? r.w : r.h;
      if (wallLen < 1.2) continue;
      const winW = Math.max(Math.min(r2(wallLen * 0.35), 1.8), 0.8);
      const pos  = r2((wallLen - winW) / 2);
      r.windows.push(`${wall}:${Math.max(0.2, pos)}:${winW}`);
    }
  }

  // Puertas interiores entre habitaciones adyacentes
  for (let i = 0; i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) {
      const a = result[i];
      const b = result[j];

      // Pared vertical compartida (a izquierda de b)
      if (Math.abs((a.x + a.w) - b.x) < EPS) {
        const oStart = Math.max(a.y, b.y);
        const oEnd   = Math.min(a.y + a.h, b.y + b.h);
        const overlap = r2(oEnd - oStart);
        if (overlap >= 1.0) {
          const doorW = 0.9;
          const midOffset = r2((overlap - doorW) / 2);
          const aPosY = r2(oStart - a.y + midOffset);
          const bPosY = r2(oStart - b.y + midOffset);
          a.doors.push(`E:${Math.max(0.2, Math.min(aPosY, a.h - doorW - 0.2))}:${doorW}`);
          b.doors.push(`W:${Math.max(0.2, Math.min(bPosY, b.h - doorW - 0.2))}:${doorW}`);
        }
      }

      // Pared horizontal compartida (a encima de b)
      if (Math.abs((a.y + a.h) - b.y) < EPS) {
        const oStart = Math.max(a.x, b.x);
        const oEnd   = Math.min(a.x + a.w, b.x + b.w);
        const overlap = r2(oEnd - oStart);
        if (overlap >= 1.0) {
          const doorW = 0.9;
          const midOffset = r2((overlap - doorW) / 2);
          const aPosX = r2(oStart - a.x + midOffset);
          const bPosX = r2(oStart - b.x + midOffset);
          a.doors.push(`S:${Math.max(0.2, Math.min(aPosX, a.w - doorW - 0.2))}:${doorW}`);
          b.doors.push(`N:${Math.max(0.2, Math.min(bPosX, b.w - doorW - 0.2))}:${doorW}`);
        }
      }
    }
  }

  // Puerta exterior en la fachada principal
  const primaryFacade = facades?.[0] ?? 'S';
  const pubOrder = ['distribuidor', 'salon-comedor', 'salon', 'cocina'];
  let extRoom = null;
  for (const type of pubOrder) {
    extRoom = result.find(r => r._type === type && touchesWall(r, primaryFacade));
    if (extRoom) break;
  }
  if (!extRoom) extRoom = result.find(r => touchesWall(r, primaryFacade));

  if (extRoom) {
    const wall = primaryFacade;
    const wallLen = (wall === 'N' || wall === 'S') ? extRoom.w : extRoom.h;
    const pos = r2((wallLen - 0.9) / 2);
    extRoom.doors.push(`${wall}:${Math.max(0.2, Math.min(pos, wallLen - 1.1))}:0.9`);
  }

  return result;
}

// Genera etiquetas únicas (Dormitorio 1, 2, 3…)
function labelRooms(rooms) {
  const counts = {};
  return rooms.map(r => {
    const base = ROOM_LABELS[r._type] ?? r._type;
    counts[r._type] = (counts[r._type] ?? 0) + 1;
    // Solo numerar tipos que pueden repetirse
    const repeatable = ['dormitorio', 'dormitorio-suite', 'bano', 'aseo', 'terraza', 'vestidor'];
    if (repeatable.includes(r._type) && rooms.filter(x => x._type === r._type).length > 1) {
      return { ...r, name: `${base} ${counts[r._type]}` };
    }
    return { ...r, name: base };
  });
}

// ── Solver principal ──────────────────────────────────────────────────────────
export function solve(req) {
  const roomDefs = req.rooms ?? [];
  if (roomDefs.length === 0) return { infeasible: 'No se especificaron habitaciones.' };

  // Normalizar áreas al mínimo CTE
  const normalized = roomDefs.map(r => ({
    ...r,
    _type: r.type,
    _area: Math.max(r.min_area ?? CTE_MIN[r.type] ?? 4, CTE_MIN[r.type] ?? 4),
  }));

  // Comprobar viabilidad
  const totalMin = normalized.reduce((s, r) => s + r._area, 0);
  const totalAvail = req.total_area_m2 ?? totalMin * 1.15;

  if (totalAvail < totalMin * 0.85) {
    return {
      infeasible: `Se necesitan al menos ${Math.ceil(totalMin)}m² para ${roomDefs.length} habitaciones (${Math.ceil(totalMin * 1.1)}m² recomendados); solo hay ${totalAvail}m² disponibles.`,
    };
  }

  // Escalar áreas proporcionalmente al espacio disponible (menos ~10% para muros)
  const usable = totalAvail * 0.90;
  const scale  = usable / totalMin;
  const scaled = normalized.map(r => ({ ...r, _area: r2(r._area * scale) }));

  // Dimensiones globales
  const hasEW = req.facades?.some(f => f === 'E' || f === 'W');
  const aspectRatio = hasEW ? 1.05 : 1.42;
  const W = r2(Math.sqrt(totalAvail * aspectRatio));
  const H = r2(totalAvail / W);

  // Separar zona pública y privada
  const pubRooms  = scaled.filter(r => !isPrivate(r._type));
  const privRooms = scaled.filter(r =>  isPrivate(r._type));

  let layoutRooms;

  if (pubRooms.length === 0) {
    layoutRooms = layoutTree(buildTree(privRooms), 0, 0, W, H);
  } else if (privRooms.length === 0) {
    layoutRooms = layoutTree(buildTree(pubRooms), 0, 0, W, H);
  } else {
    const pubArea  = pubRooms.reduce((s, r) => s + r._area, 0);
    const privArea = privRooms.reduce((s, r) => s + r._area, 0);
    const total    = pubArea + privArea;

    // Por defecto: privado al norte (top), público al sur (bottom)
    // Si fachada E o W: privado a la derecha, público a la izquierda
    if (req.facades?.includes('W')) {
      const pubW  = r2(W * pubArea / total);
      layoutRooms = [
        ...layoutTree(buildTree(pubRooms),  0,    0, pubW,    H, 1),
        ...layoutTree(buildTree(privRooms), pubW, 0, W - pubW, H, 1),
      ];
    } else {
      const pubH  = r2(H * pubArea / total);
      const privH = r2(H - pubH);
      layoutRooms = [
        ...layoutTree(buildTree(privRooms), 0, 0,     W, privH, 1),
        ...layoutTree(buildTree(pubRooms),  0, privH, W, pubH,  1),
      ];
    }
  }

  // Añadir puertas y ventanas
  const withOpenings = addOpenings(layoutRooms, W, H, req.facades ?? ['S']);

  // Etiquetar habitaciones y limpiar campos internos
  const labeled = labelRooms(withOpenings);
  const rooms = labeled.map(({ name, x, y, w, h, area, doors, windows }) =>
    ({ name, x, y, w, h, area, doors, windows })
  );

  // Título
  const nDorm = roomDefs.filter(r => r.type === 'dormitorio' || r.type === 'dormitorio-suite').length;
  const title = nDorm > 0
    ? `Vivienda ${totalAvail}m² — ${nDorm} dorm.`
    : `Distribución ${totalAvail}m²`;

  return { layout: { title, width: W, height: H, rooms } };
}

// Aplica un diff de edición a los requirements existentes
export function applyDiff(requirements, diff) {
  let rooms = [...requirements.rooms];
  let result = { ...requirements };

  for (const op of diff) {
    if (op.op === 'add_room') {
      rooms.push(op.room);
    } else if (op.op === 'remove_room') {
      rooms = rooms.filter(r => r.type !== op.type);
    } else if (op.op === 'resize') {
      rooms = rooms.map(r => r.type === op.type ? { ...r, min_area: op.min_area } : r);
    } else if (op.op === 'set_total') {
      result = { ...result, total_area_m2: op.area ?? result.total_area_m2 };
    } else if (op.op === 'change_orientation') {
      rooms = rooms.map(r => r.type === op.type ? { ...r, orientation: op.orientation } : r);
    }
  }

  return { ...result, rooms };
}
