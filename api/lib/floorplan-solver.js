// Solver geométrico de planos de planta.
//
// Estrategia:
//   1. Clasifica habitaciones en zonas (pública / servicio / privada).
//   2. Calcula tres bandas paralelas a la fachada con profundidad adaptativa.
//   3. Dentro de cada banda, slicing tree con backtracking parcial:
//      en cada nodo prueba varios splits y fracciones, elige el mejor score.
//      El score penaliza ratios extremos y dimensiones por debajo del mínimo.
//   4. Valida CTE + ratio + dim mín como restricciones duras.
//   5. Genera puertas por topología explícita (no por geometría a ciegas).
//   6. Genera ventanas solo en fachadas declaradas.

const ROOM_LABELS = {
  'salon':            'Salón',
  'salon-comedor':    'Salón-Comedor',
  'comedor':          'Comedor',
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

const ZONE = {
  salon: 'public', 'salon-comedor': 'public', comedor: 'public',
  cocina: 'public', terraza: 'public', despensa: 'public', lavadero: 'public',
  distribuidor: 'service', aseo: 'service',
  dormitorio: 'private', 'dormitorio-suite': 'private',
  bano: 'private', vestidor: 'private',
};

const MIN_AREA = {
  salon: 12, 'salon-comedor': 16, comedor: 7, cocina: 5,
  terraza: 4, despensa: 1.8, lavadero: 1.8,
  distribuidor: 3, aseo: 2.2,
  dormitorio: 6, 'dormitorio-suite': 10, bano: 3, vestidor: 2.5,
};

const MIN_DIM = {
  default: 2.0,
  bano: 1.4,
  aseo: 1.4,
  distribuidor: 1.0,
  despensa: 1.2,
  lavadero: 1.2,
  vestidor: 1.4,
  terraza: 1.5,
};

const MAX_RATIO = {
  default:          3.2,   // dormitorios rectangulares de 5×1.66 son habitables
  salon:            3.5,
  'salon-comedor':  3.5,
  comedor:          3.5,
  distribuidor:    12.0,   // los pasillos son intrínsecamente muy alargados
  bano:             5.0,   // permisivo: baños alargados son habituales
  aseo:             4.5,
  despensa:         4.5,
  lavadero:         4.5,
  terraza:          5.0,
};
const MIN_BAND_DEPTH = 2.4;     // banda pública/privada mínima
const MIN_DIST_DEPTH = 1.2;     // distribuidor sin aseo
const NO_WINDOW = new Set(['distribuidor', 'despensa', 'lavadero', 'vestidor']);

function r2(n) { return Math.round(n * 100) / 100; }

function ratioOf(rect) {
  return Math.max(rect.w / rect.h, rect.h / rect.w);
}

function minDimFor(rooms) {
  return Math.max(...rooms.map(r => MIN_DIM[r.type] ?? MIN_DIM.default));
}

function minAreaFor(type) {
  return MIN_AREA[type] ?? 3;
}

// ── Clusters: agrupa cada dormitorio con su baño/vestidor adyacente ──────────

function buildClusters(rooms) {
  const used = new Set();
  const clusters = [];

  // 1. Cada dormitorio (o suite) genera un cluster
  for (const r of rooms) {
    if (r.type === 'dormitorio' || r.type === 'dormitorio-suite') {
      clusters.push({ main: r, aux: [], min_area: r.min_area });
      used.add(r);
    }
  }

  // 2. Asignar baños/vestidores con adjacent_to al primer cluster compatible
  for (const r of rooms) {
    if (used.has(r)) continue;
    if (r.type !== 'bano' && r.type !== 'vestidor') continue;
    const adj = r.adjacent_to ?? [];
    if (adj.length === 0) continue;

    const target = clusters.find(c =>
      adj.includes(c.main.type) && c.aux.length === 0
    );
    if (target) {
      target.aux.push(r);
      target.min_area += r.min_area;
      used.add(r);
    }
  }

  // 3. Sobrantes: cada uno es su propio cluster (sin aux)
  for (const r of rooms) {
    if (used.has(r)) continue;
    clusters.push({ main: r, aux: [], min_area: r.min_area });
  }

  return clusters;
}

// Expande un cluster con aux dentro de su rect asignado:
// el main toca el accessSide (lado del distribuidor) y el aux queda al fondo.
function expandCluster(cluster, rect, accessSide) {
  if (cluster.aux.length === 0) {
    return [{
      ...cluster.main,
      x: rect.x, y: rect.y, w: rect.w, h: rect.h,
      area: rect.w * rect.h,
    }];
  }

  const aux = cluster.aux[0];
  const main = cluster.main;
  const fracMain = main.min_area / (main.min_area + aux.min_area);

  const isVertSplit = accessSide === 'N' || accessSide === 'S';
  let mainRect, auxRect;

  if (isVertSplit) {
    const totalH = rect.h;
    const minAuxH = MIN_DIM[aux.type] ?? MIN_DIM.default;
    const minMainH = MIN_DIM[main.type] ?? MIN_DIM.default;

    let mainH = totalH * fracMain;
    let auxH = totalH - mainH;
    // Ajustar a mínimos
    if (auxH < minAuxH) { auxH = minAuxH; mainH = totalH - auxH; }
    if (mainH < minMainH) { mainH = minMainH; auxH = totalH - mainH; }

    if (accessSide === 'S') {
      auxRect  = { x: rect.x, y: rect.y,                 w: rect.w, h: auxH };
      mainRect = { x: rect.x, y: rect.y + auxH,          w: rect.w, h: mainH };
    } else { // N
      mainRect = { x: rect.x, y: rect.y,                 w: rect.w, h: mainH };
      auxRect  = { x: rect.x, y: rect.y + mainH,         w: rect.w, h: auxH };
    }
  } else {
    const totalW = rect.w;
    const minAuxW = MIN_DIM[aux.type] ?? MIN_DIM.default;
    const minMainW = MIN_DIM[main.type] ?? MIN_DIM.default;

    let mainW = totalW * fracMain;
    let auxW = totalW - mainW;
    if (auxW < minAuxW) { auxW = minAuxW; mainW = totalW - auxW; }
    if (mainW < minMainW) { mainW = minMainW; auxW = totalW - mainW; }

    if (accessSide === 'E') {
      auxRect  = { x: rect.x,            y: rect.y, w: auxW,  h: rect.h };
      mainRect = { x: rect.x + auxW,     y: rect.y, w: mainW, h: rect.h };
    } else { // W
      mainRect = { x: rect.x,            y: rect.y, w: mainW, h: rect.h };
      auxRect  = { x: rect.x + mainW,    y: rect.y, w: auxW,  h: rect.h };
    }
  }

  return [
    { ...main, x: r2(mainRect.x), y: r2(mainRect.y), w: r2(mainRect.w), h: r2(mainRect.h), area: r2(mainRect.w * mainRect.h) },
    { ...aux,  x: r2(auxRect.x),  y: r2(auxRect.y),  w: r2(auxRect.w),  h: r2(auxRect.h),  area: r2(auxRect.w  * auxRect.h)  },
  ];
}

// ── Slicing tree con backtracking parcial ─────────────────────────────────────

function rectScore(rect, rooms) {
  const rectArea = rect.w * rect.h;
  const totalMin = rooms.reduce((s, r) => s + r.min_area, 0);
  const minDimReq = minDimFor(rooms);
  const actualMinDim = Math.min(rect.w, rect.h);
  const ro = ratioOf(rect);

  let score = ro;

  if (actualMinDim < minDimReq) {
    score += (minDimReq - actualMinDim) * 30;
  }
  if (rectArea < totalMin * 0.92) {
    score += (totalMin - rectArea) * 4;
  }
  if (rooms.length === 1) {
    const r = rooms[0];
    if (rectArea < minAreaFor(r.type) * 0.92) {
      score += (minAreaFor(r.type) - rectArea) * 10;
    }
  }

  // Penalty si el ratio del rect excede el MAX_RATIO permisivo para el grupo.
  // Usa el max de los MAX_RATIO de los tipos contenidos (el más laxo).
  const allowedRatios = rooms.map(r => MAX_RATIO[r.type] ?? MAX_RATIO.default);
  const allowedMax = Math.max(...allowedRatios);
  if (ro > allowedMax) {
    score += (ro - allowedMax) * 50;
  }

  return score;
}

function applyCut(rect, frac, dir) {
  if (dir === 'H') {
    const aH = { x: rect.x, y: rect.y, w: rect.w, h: rect.h * frac };
    const bH = { x: rect.x, y: rect.y + aH.h, w: rect.w, h: rect.h * (1 - frac) };
    return [aH, bH];
  } else {
    const aV = { x: rect.x, y: rect.y, w: rect.w * frac, h: rect.h };
    const bV = { x: rect.x + aV.w, y: rect.y, w: rect.w * (1 - frac), h: rect.h };
    return [aV, bV];
  }
}

function sliceTree(rect, rooms, forceFirstDir = null) {
  // forceFirstDir: 'H' o 'V' fuerza la dirección SOLO en el primer corte.
  // Usado en la banda privada para garantizar que cada columna toca el distribuidor.
  if (rooms.length === 0) return [];
  if (rooms.length === 1) {
    return [{ ...rooms[0], x: rect.x, y: rect.y, w: rect.w, h: rect.h, area: rect.w * rect.h }];
  }

  const sorted = [...rooms].sort((a, b) => b.min_area - a.min_area);
  const totalArea = sorted.reduce((s, r) => s + r.min_area, 0);

  let best = null;

  for (let splitIdx = 1; splitIdx < sorted.length; splitIdx++) {
    const groupA = sorted.slice(0, splitIdx);
    const groupB = sorted.slice(splitIdx);
    const areaA = groupA.reduce((s, r) => s + r.min_area, 0);
    const idealFrac = areaA / totalArea;

    const fracs = [...new Set([
      idealFrac,
      Math.max(0.28, idealFrac - 0.08),
      Math.min(0.72, idealFrac + 0.08),
      Math.max(0.28, idealFrac - 0.15),
      Math.min(0.72, idealFrac + 0.15),
    ])].filter(f => f > 0.22 && f < 0.78);

    const dirs = forceFirstDir ? [forceFirstDir] : ['H', 'V'];

    for (const f of fracs) {
      for (const dir of dirs) {
        const [aRect, bRect] = applyCut(rect, f, dir);
        const score = rectScore(aRect, groupA) + rectScore(bRect, groupB);
        if (!best || score < best.score) {
          best = { aRect, bRect, groupA, groupB, score };
        }
      }
    }
  }

  // Si la banda raíz forzó dirección, propagar la restricción a la recursión:
  // así toda la banda privada se subdivide solo en columnas perpendiculares al
  // distribuidor, garantizando que cada hoja toca el distribuidor.
  return [
    ...sliceTree(best.aRect, best.groupA, forceFirstDir),
    ...sliceTree(best.bRect, best.groupB, forceFirstDir),
  ];
}

// ── Post-procesado: garantizar que dormitorios toquen el distribuidor ────────

// accessSide es el muro de la banda privada que toca el distribuidor.
// Si un dormitorio principal quedó "al fondo" (sin tocar ese muro) y comparte
// columna con un aux (baño/vestidor) que sí lo toca, los reorganiza:
// el dorm queda en el lado del distribuidor, ocupando proporcionalmente más
// que el aux según las áreas mínimas pedidas.
function ensurePrivateAccess(privRooms, accessSide, band) {
  const EPS = 0.1;
  const touches = (r) => {
    if (accessSide === 'N') return r.y <= band.y + EPS;
    if (accessSide === 'S') return r.y + r.h >= band.y + band.h - EPS;
    if (accessSide === 'W') return r.x <= band.x + EPS;
    if (accessSide === 'E') return r.x + r.w >= band.x + band.w - EPS;
    return false;
  };

  const isAxisVertical = accessSide === 'N' || accessSide === 'S';
  const sameColumn = (a, b) => {
    if (isAxisVertical) {
      const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const minW = Math.min(a.w, b.w);
      return overlap > minW * 0.8;
    } else {
      const overlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const minH = Math.min(a.h, b.h);
      return overlap > minH * 0.8;
    }
  };

  const isPrimary = (r) => r.type === 'dormitorio' || r.type === 'dormitorio-suite';
  const isAux = (r) => r.type === 'bano' || r.type === 'vestidor';

  for (const dorm of privRooms) {
    if (!isPrimary(dorm)) continue;
    if (touches(dorm)) continue;

    // Buscar aux en misma columna que sí toque el distribuidor
    const aux = privRooms.find(r => r !== dorm && isAux(r) && sameColumn(dorm, r) && touches(r));
    if (!aux) continue;

    // Reorganizar: dorm cerca del distribuidor, aux al fondo, proporcional a min_area
    const fracDorm = dorm.min_area / (dorm.min_area + aux.min_area);
    if (isAxisVertical) {
      const totalH = dorm.h + aux.h;
      const yMin = Math.min(dorm.y, aux.y);
      const dormH = r2(totalH * fracDorm);
      const auxH  = r2(totalH - dormH);

      if (accessSide === 'S') {
        aux.y = yMin;             aux.h = auxH;
        dorm.y = r2(yMin + auxH); dorm.h = dormH;
      } else { // N
        dorm.y = yMin;              dorm.h = dormH;
        aux.y = r2(yMin + dormH);   aux.h = auxH;
      }
    } else {
      const totalW = dorm.w + aux.w;
      const xMin = Math.min(dorm.x, aux.x);
      const dormW = r2(totalW * fracDorm);
      const auxW  = r2(totalW - dormW);

      if (accessSide === 'E') {
        aux.x = xMin;              aux.w = auxW;
        dorm.x = r2(xMin + auxW);  dorm.w = dormW;
      } else { // W
        dorm.x = xMin;              dorm.w = dormW;
        aux.x = r2(xMin + dormW);   aux.w = auxW;
      }
    }
    dorm.area = r2(dorm.w * dorm.h);
    aux.area  = r2(aux.w  * aux.h);
  }
}

// ── Topología: paredes compartidas y puertas ──────────────────────────────────

function sharesWall(a, b) {
  // Devuelve info de pared compartida desde el punto de vista de A: {wall, start, end, length}
  // wall = la pared DE A que toca a B
  const EPS = 0.08;

  // A a la izquierda de B (a.x+a.w == b.x): pared E de A
  if (Math.abs((a.x + a.w) - b.x) < EPS) {
    const s = Math.max(a.y, b.y), e = Math.min(a.y + a.h, b.y + b.h);
    if (e - s > 0.6) return { wall: 'E', start: s, end: e, length: e - s };
  }
  // A a la derecha de B: pared W de A
  if (Math.abs((b.x + b.w) - a.x) < EPS) {
    const s = Math.max(a.y, b.y), e = Math.min(a.y + a.h, b.y + b.h);
    if (e - s > 0.6) return { wall: 'W', start: s, end: e, length: e - s };
  }
  // A encima de B (a.y+a.h == b.y): pared S de A
  if (Math.abs((a.y + a.h) - b.y) < EPS) {
    const s = Math.max(a.x, b.x), e = Math.min(a.x + a.w, b.x + b.w);
    if (e - s > 0.6) return { wall: 'S', start: s, end: e, length: e - s };
  }
  // A debajo de B: pared N de A
  if (Math.abs((b.y + b.h) - a.y) < EPS) {
    const s = Math.max(a.x, b.x), e = Math.min(a.x + a.w, b.x + b.w);
    if (e - s > 0.6) return { wall: 'N', start: s, end: e, length: e - s };
  }
  return null;
}

function addDoor(room, info, doorW = 0.9) {
  const { wall, start, length } = info;
  const usable = length - 0.4;
  const dw = Math.max(0.7, Math.min(doorW, usable));
  let pos;
  if (wall === 'N' || wall === 'S') {
    pos = (start + (length - dw) / 2) - room.x;
  } else {
    pos = (start + (length - dw) / 2) - room.y;
  }
  pos = Math.max(0.2, pos);
  if (!room.doors) room.doors = [];
  // Evitar duplicados en la misma pared
  const tag = `${wall}:${r2(pos)}:${r2(dw)}`;
  if (!room.doors.some(d => d.startsWith(`${wall}:`) && Math.abs(parseFloat(d.split(':')[1]) - pos) < 0.5)) {
    room.doors.push(tag);
  }
}

function touchesFacade(r, wall, W, H) {
  const EPS = 0.1;
  if (wall === 'N') return r.y <= EPS;
  if (wall === 'S') return r.y + r.h >= H - EPS;
  if (wall === 'W') return r.x <= EPS;
  if (wall === 'E') return r.x + r.w >= W - EPS;
  return false;
}

function addWindow(room, wall) {
  const len = (wall === 'N' || wall === 'S') ? room.w : room.h;
  if (len < 1.2) return;
  const ww = Math.max(0.8, Math.min(r2(len * 0.45), 2.0));
  const pos = r2(Math.max(0.2, (len - ww) / 2));
  if (!room.windows) room.windows = [];
  room.windows.push(`${wall}:${pos}:${ww}`);
}

function buildOpenings(rooms, W, H, facade, facadeSet) {
  rooms.forEach(r => { r.doors = []; r.windows = []; });

  const distrib = rooms.find(r => r.type === 'distribuidor');
  const aseo    = rooms.find(r => r.type === 'aseo');
  const salones = rooms.filter(r => r.type === 'salon' || r.type === 'salon-comedor');
  const terraza = rooms.find(r => r.type === 'terraza');
  const cocina  = rooms.find(r => r.type === 'cocina');

  // 1. Entrada exterior — preferir distribuidor en fachada, si no salón en fachada
  const facadeRooms = rooms.filter(r => touchesFacade(r, facade, W, H));
  const entryOrder  = ['distribuidor', 'salon-comedor', 'salon', 'cocina'];
  let entry = null;
  for (const t of entryOrder) {
    entry = facadeRooms.find(r => r.type === t);
    if (entry) break;
  }
  if (!entry && facadeRooms.length) entry = facadeRooms[0];
  if (entry) {
    const len = (facade === 'N' || facade === 'S') ? entry.w : entry.h;
    const dw  = 0.9;
    const pos = r2(Math.max(0.2, (len - dw) / 2));
    entry.doors.push(`${facade}:${pos}:${dw}`);
  }

  // 2. Privadas → distribuidor
  // Excepción: baños con adjacent_to ["dormitorio-suite"] o vestidores con adjacent_to ["dormitorio*"]
  // se conectan SOLO con esa habitación, no con el distribuidor (paso 5).
  function isAuxOfDormitorio(r) {
    if (r.type !== 'bano' && r.type !== 'vestidor') return false;
    const adj = r.adjacent_to ?? [];
    return adj.includes('dormitorio') || adj.includes('dormitorio-suite');
  }

  if (distrib) {
    for (const r of rooms) {
      if (ZONE[r.type] !== 'private') continue;
      if (isAuxOfDormitorio(r)) continue;   // se conectará al dorm en paso 5
      const info = sharesWall(r, distrib);
      if (info) addDoor(r, info);
    }
  }

  // 3. Públicas (excepto terraza) → distribuidor
  if (distrib) {
    for (const r of rooms) {
      if (ZONE[r.type] !== 'public' || r.type === 'terraza') continue;
      const info = sharesWall(r, distrib);
      if (info) addDoor(r, info);
    }
  }

  // 4. Aseo → distribuidor (única conexión del aseo)
  if (aseo && distrib) {
    const info = sharesWall(aseo, distrib);
    if (info) addDoor(aseo, info);
  }

  // 4b. Sin distribuidor: privadas no-aux conectan con la pública adyacente
  // más grande (preferentemente el salón). Si no comparten muro con el salón,
  // probar con otras públicas adyacentes (cocina, etc.) — útil en viviendas
  // pequeñas donde el dorm está pegado a la cocina, no al salón.
  if (!distrib) {
    for (const r of rooms) {
      if (ZONE[r.type] !== 'private') continue;
      if (isAuxOfDormitorio(r)) continue;
      const candidates = rooms
        .filter(x => ZONE[x.type] === 'public' && x.type !== 'terraza')
        .map(x => ({ r: x, info: sharesWall(r, x) }))
        .filter(x => x.info)
        .sort((a, b) => {
          // Salones primero, luego por área
          const aSal = a.r.type === 'salon' || a.r.type === 'salon-comedor' ? 1 : 0;
          const bSal = b.r.type === 'salon' || b.r.type === 'salon-comedor' ? 1 : 0;
          if (aSal !== bSal) return bSal - aSal;
          return b.r.area - a.r.area;
        });
      if (candidates.length) addDoor(r, candidates[0].info);
    }
  }

  // 5. Aux (baños y vestidores con adjacent_to) → su dormitorio asociado
  for (const aux of rooms.filter(isAuxOfDormitorio)) {
    const targetTypes = aux.adjacent_to ?? [];
    const candidates = rooms.filter(r => targetTypes.includes(r.type));
    let connected = false;
    for (const target of candidates) {
      const info = sharesWall(aux, target);
      if (info) { addDoor(aux, info); connected = true; break; }
    }
    // Si no encuentra adyacencia con su asociado, conectar con cualquier dorm adyacente
    if (!connected) {
      const dorms = rooms.filter(r => r.type === 'dormitorio' || r.type === 'dormitorio-suite');
      for (const d of dorms) {
        const info = sharesWall(aux, d);
        if (info) { addDoor(aux, info); connected = true; break; }
      }
    }
    // Último recurso: distribuidor si están adyacentes
    if (!connected && distrib) {
      const info = sharesWall(aux, distrib);
      if (info) addDoor(aux, info);
    }
  }

  // 6. Cualquier baño/vestidor sin puerta (no marcado como aux) — conectar con privada adyacente más grande
  for (const r of rooms.filter(x => (x.type === 'bano' || x.type === 'vestidor') && x.doors.length === 0)) {
    const adj = rooms
      .filter(x => x !== r && ZONE[x.type] === 'private')
      .map(x => ({ r: x, info: sharesWall(r, x) }))
      .filter(x => x.info)
      .sort((a, b) => b.r.area - a.r.area);
    if (adj.length) addDoor(r, adj[0].info);
  }

  // 7. Terraza → salón (puerta corredera ancha)
  if (terraza) {
    for (const s of salones) {
      const info = sharesWall(terraza, s);
      if (info) { addDoor(terraza, info, 1.4); break; }
    }
    // Si no toca salón, conectar con la pública adyacente
    if (terraza.doors.length === 0) {
      const adj = rooms
        .filter(r => r !== terraza && ZONE[r.type] === 'public')
        .map(r => ({ r, info: sharesWall(terraza, r) }))
        .find(x => x.info);
      if (adj) addDoor(terraza, adj.info, 1.4);
    }
  }

  // 8. Cocina cerrada — si no tiene puerta al distribuidor, conectar con el salón
  if (cocina && cocina.doors.length === 0) {
    for (const s of salones) {
      const info = sharesWall(cocina, s);
      if (info) { addDoor(cocina, info); break; }
    }
  }

  // 9. Despensa/lavadero — conectar con cocina si adyacente
  for (const r of rooms.filter(r => (r.type === 'despensa' || r.type === 'lavadero') && r.doors.length === 0)) {
    const cands = rooms.filter(x => x !== r && (x.type === 'cocina' || x.type === 'salon-comedor'));
    for (const c of cands) {
      const info = sharesWall(r, c);
      if (info) { addDoor(r, info); break; }
    }
    if (r.doors.length === 0 && distrib) {
      const info = sharesWall(r, distrib);
      if (info) addDoor(r, info);
    }
  }

  // 10. Vestidor — conectar con dormitorio o suite adyacente
  for (const r of rooms.filter(r => r.type === 'vestidor' && r.doors.length === 0)) {
    const cands = rooms.filter(x => x !== r && (x.type === 'dormitorio' || x.type === 'dormitorio-suite'));
    for (const d of cands) {
      const info = sharesWall(r, d);
      if (info) { addDoor(r, info); break; }
    }
  }

  // 11. Ventanas — solo en fachadas declaradas
  for (const r of rooms) {
    if (NO_WINDOW.has(r.type)) continue;
    for (const wall of facadeSet) {
      if (touchesFacade(r, wall, W, H)) {
        addWindow(r, wall);
        break;
      }
    }
  }

  return rooms;
}

// ── Etiquetado de habitaciones ────────────────────────────────────────────────

function buildLabels(rooms) {
  const totals = {};
  for (const r of rooms) totals[r.type] = (totals[r.type] ?? 0) + 1;
  const counts = {};
  return rooms.map(r => {
    const base = ROOM_LABELS[r.type] ?? r.type;
    counts[r.type] = (counts[r.type] ?? 0) + 1;
    const name = totals[r.type] > 1 ? `${base} ${counts[r.type]}` : base;
    return { ...r, name };
  });
}

// ── Solver principal ──────────────────────────────────────────────────────────

export function solve(spec) {
  // 1. Pre-procesado: baños sin adjacent_to se asocian automáticamente a un
  // dormitorio para formar cluster. Excepción: en lofts (1 sola habitación
  // privada) el baño queda independiente y se conecta al salón directamente.
  const rawRooms = spec.rooms ?? [];
  const numDorms = rawRooms.filter(r => r.type === 'dormitorio' || r.type === 'dormitorio-suite').length;
  const normRooms = rawRooms.map(r => {
    if (r.type === 'bano' && (!r.adjacent_to || r.adjacent_to.length === 0) && numDorms >= 2) {
      return { ...r, adjacent_to: ['dormitorio'] };
    }
    return { ...r };
  });

  // 2. Clasificación
  const classified = { public: [], service: [], private: [] };
  for (const r of normRooms) {
    const zone = ZONE[r.type] ?? 'public';
    classified[zone].push(r);
  }

  if (classified.public.length + classified.private.length === 0) {
    return { infeasible: 'No hay habitaciones que colocar.' };
  }

  // 3. Crear distribuidor si hay 3+ habs privadas Y total >= 70m².
  // En viviendas pequeñas (< 70m²), el salón hace de hub para ahorrar pasillo.
  let distrib = classified.service.find(r => r.type === 'distribuidor');
  const totalArea = spec.total_area_m2 ?? 0;
  const useDistrib = !!distrib || (classified.private.length >= 3 && totalArea >= 70);
  if (useDistrib && !distrib) {
    distrib = { type: 'distribuidor', min_area: 4 };
    classified.service.push(distrib);
  }

  const pub  = classified.public;
  const svc  = classified.service;
  const priv = classified.private;

  // El aseo queda como única lateral del distribuidor (caso especial)
  const aseo = svc.find(r => r.type === 'aseo');

  // 3. Dimensiones globales
  const facades = (spec.facades ?? ['S']).map(f => f.toUpperCase());
  const facade  = facades[0];
  const isNS    = facade === 'N' || facade === 'S';

  let W, H;
  if (spec.dimensions?.width_m && spec.dimensions?.depth_m) {
    W = r2(spec.dimensions.width_m);
    H = r2(spec.dimensions.depth_m);
  } else {
    const totalArea = spec.total_area_m2;
    const propRatio = isNS ? 1.35 : 1 / 1.35;
    W = r2(Math.sqrt(totalArea * propRatio));
    H = r2(totalArea / W);
  }

  // 4. Profundidad del distribuidor — extra si hay aseo
  let distDepth;
  if (!distrib) {
    distDepth = 0;
  } else if (aseo) {
    const aseoSide = Math.sqrt(aseo.min_area ?? 3);
    distDepth = r2(Math.max(MIN_DIST_DEPTH + 0.3, aseoSide));
  } else {
    distDepth = MIN_DIST_DEPTH;
  }

  // 5. Repartir profundidad entre bandas
  const longDim = isNS ? H : W;
  const restDim = r2(longDim - distDepth);
  if (restDim < MIN_BAND_DEPTH * 2 && priv.length && pub.length) {
    return { infeasible: `La vivienda es demasiado estrecha en su fondo (${longDim.toFixed(1)}m) para distribuir zonas pública y privada.` };
  }

  const pubMin  = pub.reduce((s, r) => s + (r.min_area ?? 4), 0);
  const privMin = priv.reduce((s, r) => s + (r.min_area ?? 4), 0);

  // Si hay clusters con aux (baño/vestidor adyacente a dorm), la banda privada
  // debe albergar dorm+aux apilados → profundidad mínima ampliada
  const hasAuxClusters = priv.some(r =>
    (r.adjacent_to ?? []).some(a => a === 'dormitorio' || a === 'dormitorio-suite')
  );
  const minPrivDepth = hasAuxClusters ? 3.6 : MIN_BAND_DEPTH;

  let pubDepth, privDepth;
  if (priv.length === 0)      { pubDepth = restDim; privDepth = 0; }
  else if (pub.length === 0)  { privDepth = restDim; pubDepth = 0; }
  else {
    const fracPub = pubMin / (pubMin + privMin);
    pubDepth  = r2(restDim * fracPub);
    privDepth = r2(restDim - pubDepth);
    if (privDepth < minPrivDepth) {
      privDepth = minPrivDepth;
      pubDepth = r2(restDim - privDepth);
    }
    if (pubDepth < MIN_BAND_DEPTH) {
      pubDepth = MIN_BAND_DEPTH;
      privDepth = r2(restDim - pubDepth);
    }
    if (pubDepth < MIN_BAND_DEPTH || privDepth < minPrivDepth) {
      const needed = (MIN_BAND_DEPTH + minPrivDepth + distDepth).toFixed(1);
      return { infeasible: `La vivienda necesita al menos ${needed}m de fondo para esta distribución. Reduce el número de habitaciones o aumenta los m² totales.` };
    }
  }

  // 6. Posicionar bandas (3 franjas paralelas a la fachada)
  let pubBand, distBand, privBand;
  if (facade === 'S') {
    privBand = priv.length ? { x: 0, y: 0,                     w: W, h: privDepth } : null;
    distBand = distrib     ? { x: 0, y: privDepth,             w: W, h: distDepth } : null;
    pubBand  = pub.length  ? { x: 0, y: privDepth + distDepth, w: W, h: pubDepth  } : null;
  } else if (facade === 'N') {
    pubBand  = pub.length  ? { x: 0, y: 0,                     w: W, h: pubDepth  } : null;
    distBand = distrib     ? { x: 0, y: pubDepth,              w: W, h: distDepth } : null;
    privBand = priv.length ? { x: 0, y: pubDepth + distDepth,  w: W, h: privDepth } : null;
  } else if (facade === 'E') {
    privBand = priv.length ? { x: 0,                     y: 0, w: privDepth, h: H } : null;
    distBand = distrib     ? { x: privDepth,             y: 0, w: distDepth, h: H } : null;
    pubBand  = pub.length  ? { x: privDepth + distDepth, y: 0, w: pubDepth,  h: H } : null;
  } else { // W
    pubBand  = pub.length  ? { x: 0,                     y: 0, w: pubDepth,  h: H } : null;
    distBand = distrib     ? { x: pubDepth,              y: 0, w: distDepth, h: H } : null;
    privBand = priv.length ? { x: pubDepth + distDepth,  y: 0, w: privDepth, h: H } : null;
  }

  // 7. Colocar distribuidor + aseo (caso especial) en distBand
  const serviceRooms = [];
  if (distBand && distrib) {
    if (aseo) {
      const along  = isNS ? distBand.w : distBand.h;
      const across = isNS ? distBand.h : distBand.w;
      const aseoArea  = aseo.min_area ?? 3;
      const aseoAlong = r2(Math.max(aseoArea / across, MIN_DIM.aseo));
      if (aseoAlong >= along * 0.6) {
        return { infeasible: 'No queda espacio para el distribuidor con el aseo pedido.' };
      }

      if (isNS) {
        serviceRooms.push({ ...aseo, x: distBand.x, y: distBand.y, w: aseoAlong, h: distBand.h, area: aseoAlong * distBand.h });
        const dx = distBand.x + aseoAlong;
        const dw = distBand.w - aseoAlong;
        serviceRooms.push({ ...distrib, x: dx, y: distBand.y, w: dw, h: distBand.h, area: dw * distBand.h });
      } else {
        serviceRooms.push({ ...aseo, x: distBand.x, y: distBand.y, w: distBand.w, h: aseoAlong, area: distBand.w * aseoAlong });
        const dy = distBand.y + aseoAlong;
        const dh = distBand.h - aseoAlong;
        serviceRooms.push({ ...distrib, x: distBand.x, y: dy, w: distBand.w, h: dh, area: distBand.w * dh });
      }
    } else {
      serviceRooms.push({ ...distrib, x: distBand.x, y: distBand.y, w: distBand.w, h: distBand.h, area: distBand.w * distBand.h });
    }
  }

  // 8. Slicing tree en bandas
  // Pública: slicing tree normal sobre las habitaciones.
  const publicRooms = pubBand ? sliceTree(pubBand, pub) : [];

  // Privada: agrupar en clusters (dorm + su baño/vestidor adyacente), hacer
  // slicing sobre clusters, luego expandir cada cluster colocando el dorm
  // hacia el distribuidor y el aux al fondo.
  let privateRooms = [];
  if (privBand && priv.length) {
    const clusters = buildClusters(priv);
    const accessSide =
      facade === 'S' ? 'S' :
      facade === 'N' ? 'N' :
      facade === 'E' ? 'E' : 'W';
    const privFirstCut = isNS ? 'V' : 'H';

    const clusterLeaves = sliceTree(privBand, clusters, privFirstCut);
    for (const leaf of clusterLeaves) {
      const rect = { x: leaf.x, y: leaf.y, w: leaf.w, h: leaf.h };
      const cluster = { main: leaf.main, aux: leaf.aux, min_area: leaf.min_area };
      privateRooms.push(...expandCluster(cluster, rect, accessSide));
    }
    // Post-procesado para clusters sin aux que igualmente quedaron sin acceso
    ensurePrivateAccess(privateRooms, accessSide, privBand);
  }

  const allRooms = [...publicRooms, ...serviceRooms, ...privateRooms].map(r => ({
    ...r,
    x: r2(r.x), y: r2(r.y), w: r2(r.w), h: r2(r.h),
    area: r2(r.area ?? r.w * r.h),
  }));

  // 9. Validar restricciones duras
  for (const r of allRooms) {
    const cte = minAreaFor(r.type);
    if (r.area < cte * 0.92) {
      return { infeasible: `${ROOM_LABELS[r.type] ?? r.type} sale de ${r.area}m² y necesita al menos ${cte}m².` };
    }
    const ro = ratioOf(r);
    const maxRo = MAX_RATIO[r.type] ?? MAX_RATIO.default;
    if (ro > maxRo) {
      return { infeasible: `${ROOM_LABELS[r.type] ?? r.type} sale con proporción ${ro.toFixed(1)}:1 (máx ${maxRo}:1). Revisa las áreas pedidas.` };
    }
    const minDimReq = MIN_DIM[r.type] ?? MIN_DIM.default;
    const minDimAct = Math.min(r.w, r.h);
    if (minDimAct < minDimReq * 0.92) {
      return { infeasible: `${ROOM_LABELS[r.type] ?? r.type} sale con un lado de ${minDimAct.toFixed(1)}m, por debajo del mínimo (${minDimReq}m).` };
    }
  }

  // 10. Etiquetar
  const named = buildLabels(allRooms);

  // 11. Puertas y ventanas
  const facadeSet = new Set(facades);
  buildOpenings(named, W, H, facade, facadeSet);

  // 11b. Validar: ninguna habitación habitable puede quedar sin puerta
  const MUST_HAVE_DOOR = new Set([
    'dormitorio', 'dormitorio-suite', 'salon', 'salon-comedor', 'comedor',
    'cocina', 'bano', 'aseo', 'vestidor', 'despensa', 'lavadero', 'terraza',
  ]);
  for (const r of named) {
    if (MUST_HAVE_DOOR.has(r.type) && (r.doors ?? []).length === 0) {
      return { infeasible: `${r.name} quedó sin acceso. Prueba con más superficie total o menos habitaciones.` };
    }
  }

  // 12. Empaquetar
  const finalRooms = named.map(({ name, type, x, y, w, h, area, doors, windows }) =>
    ({ name, type, x, y, w, h, area, doors: doors ?? [], windows: windows ?? [] })
  );

  const nDorm   = priv.filter(r => r.type === 'dormitorio' || r.type === 'dormitorio-suite').length;
  const totalM2 = r2(W * H);
  const title   = nDorm > 0 ? `Vivienda ${totalM2}m² — ${nDorm} dorm.` : `Distribución ${totalM2}m²`;

  return { layout: { title, width: W, height: H, rooms: finalRooms } };
}
