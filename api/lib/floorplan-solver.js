// Solver geométrico para planos de planta — layout arquitectónico prescriptivo
// Estructura: zona pública | distribuidor | zona privada
// Zona privada: clusters suite+baño juntos, terraza siempre en muro exterior

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

// Topes para habitáculos de servicio (evitar sobredimensionado)
const SERVICE_MAX = {
  'bano': 8, 'aseo': 5, 'distribuidor': 9,
  'despensa': 5, 'lavadero': 5, 'vestidor': 10,
};

const PRIVATE_TYPES = new Set([
  'dormitorio', 'dormitorio-suite', 'bano', 'aseo', 'vestidor', 'lavadero', 'despensa',
]);

function isPrivate(type) { return PRIVATE_TYPES.has(type); }
function r2(n) { return Math.round(n * 100) / 100; }

// ── Árbol de cortes básico (para zonas individuales) ─────────────────────────

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
  return {
    ratio: r2(left.reduce((s, r) => s + r._area, 0) / total),
    left:  buildTree(left),
    right: buildTree(right),
  };
}

function layoutTree(node, x, y, w, h, depth = 0) {
  if (!node) return [];
  if (node.leaf) {
    return [{ ...node.leaf, x: r2(x), y: r2(y), w: r2(w), h: r2(h), area: r2(w * h) }];
  }
  const splitH = depth % 2 === 0 ? w >= h : w > h * 1.4;
  if (splitH) {
    const lw = r2(w * node.ratio);
    return [
      ...layoutTree(node.left,  x,     y, lw,      h, depth + 1),
      ...layoutTree(node.right, x + lw, y, w - lw, h, depth + 1),
    ];
  } else {
    const th = r2(h * node.ratio);
    return [
      ...layoutTree(node.left,  x, y,      w, th,      depth + 1),
      ...layoutTree(node.right, x, y + th, w, h - th,  depth + 1),
    ];
  }
}

// ── Agrupación: suite + su baño van siempre juntos ───────────────────────────

function buildClusters(rooms) {
  const used = new Set();
  const clusters = [];

  // Primera pasada: agrupar dormitorio-suite con su baño privado
  for (const r of rooms) {
    if (used.has(r._type)) continue;
    if (r._type === 'dormitorio-suite') {
      // Buscar un baño que quiera estar junto a esta suite, o el primer baño libre
      const partner = rooms.find(o =>
        !used.has(o._type) &&
        (o._type === 'bano') &&
        (o.adjacent_to?.includes('dormitorio-suite') || true)
      );
      if (partner) {
        used.add(r._type);
        used.add(partner._type);
        clusters.push({ type: 'cluster', rooms: [r, partner], _area: r._area + partner._area });
        continue;
      }
    }
    if (!used.has(r._type)) {
      used.add(r._type);
      clusters.push(r);
    }
  }

  return clusters;
}

// Expande clusters a rooms posicionadas dentro de su rectángulo asignado
function expandCluster(cluster, x, y, w, h) {
  if (!cluster.rooms) return [{ ...cluster, x: r2(x), y: r2(y), w: r2(w), h: r2(h), area: r2(w * h) }];

  const [a, b] = cluster.rooms;
  const ratio = a._area / cluster._area;

  // Suite más grande → ocupa el lado "bueno" (cerca del exterior)
  // Dividir por el lado más largo para evitar formas muy estrechas
  if (w >= h) {
    const aw = r2(w * ratio);
    return [
      { ...a, x: r2(x),      y: r2(y), w: aw,      h: r2(h), area: r2(aw * h) },
      { ...b, x: r2(x + aw), y: r2(y), w: r2(w - aw), h: r2(h), area: r2((w - aw) * h) },
    ];
  } else {
    const ah = r2(h * ratio);
    return [
      { ...a, x: r2(x), y: r2(y),      w: r2(w), h: ah,         area: r2(w * ah) },
      { ...b, x: r2(x), y: r2(y + ah), w: r2(w), h: r2(h - ah), area: r2(w * (h - ah)) },
    ];
  }
}

// ── Puertas y ventanas ────────────────────────────────────────────────────────

function addOpenings(rooms, totalW, totalH, facades) {
  const EPS = 0.08;

  function touchesWall(r, wall) {
    if (wall === 'N') return r.y <= EPS;
    if (wall === 'S') return r.y + r.h >= totalH - EPS;
    if (wall === 'W') return r.x <= EPS;
    if (wall === 'E') return r.x + r.w >= totalW - EPS;
    return false;
  }

  const result = rooms.map(r => ({ ...r, doors: [], windows: [] }));

  // Ventanas en muros exteriores
  for (const r of result) {
    for (const wall of ['N', 'S', 'E', 'W']) {
      if (!touchesWall(r, wall)) continue;
      // Terrazas y vestidores sin ventanas (o ventana pequeña)
      const wallLen = (wall === 'N' || wall === 'S') ? r.w : r.h;
      if (wallLen < 1.0) continue;
      const winW = Math.max(Math.min(r2(wallLen * 0.35), 1.8), 0.7);
      const pos  = r2((wallLen - winW) / 2);
      r.windows.push(`${wall}:${Math.max(0.2, pos)}:${winW}`);
    }
  }

  // Puertas interiores — UNA por pared compartida (solo en room[i], no en room[j])
  for (let i = 0; i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) {
      const a = result[i];
      const b = result[j];

      // Pared vertical (a izquierda de b)
      if (Math.abs((a.x + a.w) - b.x) < EPS) {
        const oStart = Math.max(a.y, b.y);
        const oEnd   = Math.min(a.y + a.h, b.y + b.h);
        const overlap = r2(oEnd - oStart);
        if (overlap >= 1.0) {
          const pos = r2(oStart - a.y + (overlap - 0.9) / 2);
          a.doors.push(`E:${Math.max(0.2, Math.min(r2(pos), a.h - 1.1))}:0.9`);
        }
      }

      // Pared horizontal (a encima de b)
      if (Math.abs((a.y + a.h) - b.y) < EPS) {
        const oStart = Math.max(a.x, b.x);
        const oEnd   = Math.min(a.x + a.w, b.x + b.w);
        const overlap = r2(oEnd - oStart);
        if (overlap >= 1.0) {
          const pos = r2(oStart - a.x + (overlap - 0.9) / 2);
          a.doors.push(`S:${Math.max(0.2, Math.min(r2(pos), a.w - 1.1))}:0.9`);
        }
      }
    }
  }

  // Puerta exterior principal en la fachada
  const facade = facades?.[0] ?? 'S';
  const pubOrder = ['distribuidor', 'salon-comedor', 'salon', 'cocina'];
  let extRoom = null;
  for (const type of pubOrder) {
    extRoom = result.find(r => r._type === type && touchesWall(r, facade));
    if (extRoom) break;
  }
  if (!extRoom) extRoom = result.find(r => touchesWall(r, facade));

  if (extRoom) {
    const wallLen = (facade === 'N' || facade === 'S') ? extRoom.w : extRoom.h;
    const pos = r2((wallLen - 0.9) / 2);
    extRoom.doors.push(`${facade}:${Math.max(0.2, Math.min(pos, wallLen - 1.1))}:0.9`);
  }

  return result;
}

// ── Etiquetas únicas ──────────────────────────────────────────────────────────

function labelRooms(rooms) {
  const counts = {};
  const repeatable = new Set(['dormitorio', 'dormitorio-suite', 'bano', 'aseo', 'terraza', 'vestidor']);
  return rooms.map(r => {
    const base = ROOM_LABELS[r._type] ?? r._type;
    counts[r._type] = (counts[r._type] ?? 0) + 1;
    const total = rooms.filter(x => x._type === r._type).length;
    if (repeatable.has(r._type) && total > 1) {
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

  // Viabilidad
  const totalMin  = normalized.reduce((s, r) => s + r._area, 0);
  const totalAvail = req.total_area_m2 ?? totalMin * 1.15;

  if (totalAvail < totalMin * 0.85) {
    return {
      infeasible: `Se necesitan ~${Math.ceil(totalMin)}m² para ${roomDefs.length} habitaciones; solo hay ${totalAvail}m².`,
    };
  }

  // Escalar con topes para habitáculos de servicio
  const usable = totalAvail * 0.90;
  const scale  = usable / totalMin;
  const scaled = normalized.map(r => {
    const raw = r2(r._area * scale);
    const cap = SERVICE_MAX[r._type];
    return { ...r, _area: cap ? Math.min(raw, cap) : raw };
  });

  // Dimensiones globales
  const hasEW = req.facades?.some(f => f === 'E' || f === 'W');
  const W = r2(Math.sqrt(totalAvail * (hasEW ? 1.0 : 1.42)));
  const H = r2(totalAvail / W);

  // Separar categorías
  const distribRoom = scaled.find(r => r._type === 'distribuidor');
  const terrazaRoom = scaled.find(r => r._type === 'terraza');
  const pubCore     = scaled.filter(r => !isPrivate(r._type) && r._type !== 'distribuidor' && r._type !== 'terraza');
  const privCore    = scaled.filter(r => isPrivate(r._type));

  // Terraza va en la zona pública (fachada exterior)
  const pubRooms  = terrazaRoom ? [...pubCore, terrazaRoom] : pubCore;
  const privRooms = privCore;

  const facade = req.facades?.[0] ?? 'S';

  // Áreas de cada zona
  const pubArea   = pubRooms.reduce((s, r) => s + r._area, 0);
  const privArea  = privRooms.reduce((s, r) => s + r._area, 0);
  const distArea  = distribRoom?._area ?? 0;
  const totalUsed = pubArea + privArea + distArea;

  let layoutRooms = [];

  // ── Layout vertical (fachadas N o S) ──────────────────────────────────────
  if (facade === 'N' || facade === 'S') {
    const pubH  = r2(H * pubArea / totalUsed);
    const privH = r2(H * privArea / totalUsed);
    const distH = r2(H - pubH - privH);

    let pubY, distY, privY;
    if (facade === 'N') {
      // N: público arriba → distribuidor → privado abajo
      pubY  = 0;
      distY = pubH;
      privY = pubH + distH;
    } else {
      // S: privado arriba → distribuidor → público abajo
      privY = 0;
      distY = privH;
      pubY  = privH + distH;
    }

    // Zona pública — slicing tree horizontal
    if (pubRooms.length > 0) {
      layoutRooms.push(...layoutTree(buildTree(pubRooms), 0, pubY, W, pubH));
    }

    // Distribuidor — franja completa
    if (distribRoom) {
      layoutRooms.push({ ...distribRoom, x: 0, y: r2(distY), w: W, h: r2(distH), area: r2(W * distH) });
    }

    // Zona privada — con clusters suite+baño
    if (privRooms.length > 0) {
      const clusters = buildClusters(privRooms);
      const clusterTree = buildTree(clusters);
      const clusterLayout = layoutTree(clusterTree, 0, privY, W, privH);
      for (const c of clusterLayout) {
        layoutRooms.push(...expandCluster(c, c.x, c.y, c.w, c.h));
      }
    }

  // ── Layout horizontal (fachadas E o W) ────────────────────────────────────
  } else {
    const pubW  = r2(W * pubArea / totalUsed);
    const privW = r2(W * privArea / totalUsed);
    const distW = r2(W - pubW - privW);

    let pubX, distX, privX;
    if (facade === 'W') {
      pubX  = 0;
      distX = pubW;
      privX = pubW + distW;
    } else {
      privX = 0;
      distX = privW;
      pubX  = privW + distW;
    }

    if (pubRooms.length > 0) {
      layoutRooms.push(...layoutTree(buildTree(pubRooms), pubX, 0, pubW, H));
    }
    if (distribRoom) {
      layoutRooms.push({ ...distribRoom, x: r2(distX), y: 0, w: r2(distW), h: H, area: r2(distW * H) });
    }
    if (privRooms.length > 0) {
      const clusters = buildClusters(privRooms);
      const clusterLayout = layoutTree(buildTree(clusters), privX, 0, privW, H);
      for (const c of clusterLayout) {
        layoutRooms.push(...expandCluster(c, c.x, c.y, c.w, c.h));
      }
    }
  }

  // Añadir puertas y ventanas
  const withOpenings = addOpenings(layoutRooms, W, H, req.facades ?? ['S']);

  // Etiquetar y limpiar campos internos
  const labeled = labelRooms(withOpenings);
  const rooms = labeled.map(({ name, x, y, w, h, area, doors, windows }) =>
    ({ name, x, y, w, h, area, doors, windows })
  );

  const nDorm = roomDefs.filter(r => r.type === 'dormitorio' || r.type === 'dormitorio-suite').length;
  const title = nDorm > 0
    ? `Vivienda ${totalAvail}m² — ${nDorm} dorm.`
    : `Distribución ${totalAvail}m²`;

  return { layout: { title, width: W, height: H, rooms } };
}

// Aplica un diff de edición a los requirements existentes
export function applyDiff(requirements, diff) {
  let rooms  = [...requirements.rooms];
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
