// Extraído de api/chat.js — convierte un layout JSON a SVG plano de planta
export function buildFloorPlanSVG(spec) {
  const CW = 900, CH = 640;
  const ML = 110, MT = 80, MR = 90, MB = 110;
  const DW = CW - ML - MR, DH = CH - MT - MB;

  const scale = Math.min(DW / spec.width, DH / spec.height);
  const X = m => ML + m * scale;
  const Y = m => MT + m * scale;
  const S = m => m * scale;

  const EXT = 9, INT = 3;

  const COLORS = [
    '#e8edf5','#e8f0ea','#f5ece8','#ece8f5',
    '#e8f5f0','#f5f0e8','#f0e8f5','#f5f5e8','#e8f5ec',
  ];

  function sa(str) {
    return String(str)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/ñ/g,'n').replace(/Ñ/g,'N');
  }

  const p = [];
  const push = s => p.push(s);

  push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" width="${CW}" height="${CH}" style="background:white">`);
  push(`<defs>
    <style>text{font-family:Arial,Helvetica,sans-serif}</style>
    <pattern id="hatch-terraza" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="8" stroke="#7ab87a" stroke-width="1.5"/>
    </pattern>
  </defs>`);

  push(`<rect x="${X(0)-EXT}" y="${Y(0)-EXT}" width="${S(spec.width)+EXT*2}" height="${S(spec.height)+EXT*2}" fill="#1a1a1a"/>`);
  push(`<rect x="${X(0)}" y="${Y(0)}" width="${S(spec.width)}" height="${S(spec.height)}" fill="white"/>`);

  spec.rooms.forEach((r, i) => {
    const rx = X(r.x), ry = Y(r.y), rw = S(r.w), rh = S(r.h);
    const isOutdoor = /terraza|balcon|patio/i.test(r.name ?? '');
    const fill   = isOutdoor ? 'url(#hatch-terraza)' : COLORS[i % COLORS.length];
    const stroke = isOutdoor ? '#4a8a4a' : '#444';
    const dash   = isOutdoor ? ` stroke-dasharray="6,3"` : '';
    push(`<rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${INT}"${dash}/>`);

    const cx = (rx + rw / 2).toFixed(1);
    const cy = (ry + rh / 2).toFixed(1);
    const area = r.area != null ? Number(r.area).toFixed(1) : (r.w * r.h).toFixed(1);
    push(`<text x="${cx}" y="${+cy - 6}" font-size="11" text-anchor="middle" fill="#111" font-weight="600">${sa(r.name)}</text>`);
    push(`<text x="${cx}" y="${+cy + 9}" font-size="9" text-anchor="middle" fill="#555">${area} m²</text>`);
  });

  spec.rooms.forEach(r => {
    (r.doors || []).forEach(d => {
      const [wall, posS, wS] = d.split(':');
      const pos = parseFloat(posS), dw = parseFloat(wS);
      const dpx = S(dw);
      const W_WALL = wall.toUpperCase();

      if (W_WALL === 'N' || W_WALL === 'S') {
        const wy = W_WALL === 'N' ? Y(r.y) : Y(r.y + r.h);
        const dx = X(r.x + pos);
        push(`<rect x="${dx}" y="${wy - EXT - 2}" width="${dpx}" height="${EXT * 2 + 4}" fill="white" stroke="none"/>`);
        const leafY = W_WALL === 'N' ? wy + dpx : wy - dpx;
        push(`<line x1="${dx}" y1="${wy}" x2="${dx}" y2="${leafY}" stroke="#1a1a1a" stroke-width="1.5"/>`);
        const sf = W_WALL === 'N' ? 1 : 0;
        push(`<path d="M ${(dx + dpx).toFixed(1)},${wy} A ${dpx},${dpx} 0 0,${sf} ${dx},${leafY}" fill="none" stroke="#1a1a1a" stroke-width="1" stroke-dasharray="4,3"/>`);
      } else {
        const wx = W_WALL === 'W' ? X(r.x) : X(r.x + r.w);
        const dy = Y(r.y + pos);
        push(`<rect x="${wx - EXT - 2}" y="${dy}" width="${EXT * 2 + 4}" height="${dpx}" fill="white" stroke="none"/>`);
        const leafX = W_WALL === 'W' ? wx + dpx : wx - dpx;
        push(`<line x1="${wx}" y1="${dy}" x2="${leafX}" y2="${dy}" stroke="#1a1a1a" stroke-width="1.5"/>`);
        const sf = W_WALL === 'W' ? 0 : 1;
        push(`<path d="M ${wx},${(dy + dpx).toFixed(1)} A ${dpx},${dpx} 0 0,${sf} ${leafX},${dy}" fill="none" stroke="#1a1a1a" stroke-width="1" stroke-dasharray="4,3"/>`);
      }
    });
  });

  spec.rooms.forEach(r => {
    (r.windows || []).forEach(w => {
      const [wall, posS, wS] = w.split(':');
      const pos = parseFloat(posS), ww = parseFloat(wS);
      const wpx = S(ww);
      const W_WALL = wall.toUpperCase();

      if (W_WALL === 'N' || W_WALL === 'S') {
        const wy = W_WALL === 'N' ? Y(r.y) : Y(r.y + r.h);
        const wx = X(r.x + pos);
        push(`<rect x="${wx}" y="${wy - EXT - 1}" width="${wpx}" height="${EXT * 2 + 2}" fill="white" stroke="none"/>`);
        push(`<rect x="${wx}" y="${wy - EXT}" width="${wpx}" height="${EXT * 2}" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>`);
        const t = wpx / 3;
        for (let k = 0; k < 3; k++) {
          const lx = wx + t * k + t / 2;
          push(`<line x1="${lx.toFixed(1)}" y1="${wy - EXT + 2}" x2="${lx.toFixed(1)}" y2="${wy + EXT - 2}" stroke="#333" stroke-width="1"/>`);
        }
      } else {
        const wx = W_WALL === 'W' ? X(r.x) : X(r.x + r.w);
        const wy = Y(r.y + pos);
        push(`<rect x="${wx - EXT - 1}" y="${wy}" width="${EXT * 2 + 2}" height="${wpx}" fill="white" stroke="none"/>`);
        push(`<rect x="${wx - EXT}" y="${wy}" width="${EXT * 2}" height="${wpx}" fill="none" stroke="#1a1a1a" stroke-width="1.5"/>`);
        const t = wpx / 3;
        for (let k = 0; k < 3; k++) {
          const ly = wy + t * k + t / 2;
          push(`<line x1="${wx - EXT + 2}" y1="${ly.toFixed(1)}" x2="${wx + EXT - 2}" y2="${ly.toFixed(1)}" stroke="#333" stroke-width="1"/>`);
        }
      }
    });
  });

  const dimY = Y(spec.height) + EXT + 32;
  const x0 = X(0), xW = X(spec.width);
  push(`<line x1="${x0}" y1="${dimY}" x2="${xW}" y2="${dimY}" stroke="#666" stroke-width="0.8"/>`);
  push(`<line x1="${x0}" y1="${dimY - 5}" x2="${x0}" y2="${dimY + 5}" stroke="#666" stroke-width="1"/>`);
  push(`<line x1="${xW}" y1="${dimY - 5}" x2="${xW}" y2="${dimY + 5}" stroke="#666" stroke-width="1"/>`);
  push(`<text x="${((x0 + xW) / 2).toFixed(1)}" y="${dimY + 13}" font-size="10" text-anchor="middle" fill="#444">${spec.width.toFixed(2)}m</text>`);

  const dimX = X(spec.width) + EXT + 32;
  const y0 = Y(0), yH = Y(spec.height);
  push(`<line x1="${dimX}" y1="${y0}" x2="${dimX}" y2="${yH}" stroke="#666" stroke-width="0.8"/>`);
  push(`<line x1="${dimX - 5}" y1="${y0}" x2="${dimX + 5}" y2="${y0}" stroke="#666" stroke-width="1"/>`);
  push(`<line x1="${dimX - 5}" y1="${yH}" x2="${dimX + 5}" y2="${yH}" stroke="#666" stroke-width="1"/>`);
  const dimMY = ((y0 + yH) / 2).toFixed(1);
  push(`<text x="${dimX + 14}" y="${dimMY}" font-size="10" text-anchor="middle" fill="#444" transform="rotate(-90 ${dimX + 14} ${dimMY})">${spec.height.toFixed(2)}m</text>`);

  const NA = CW - 50, NAy = 55;
  push(`<circle cx="${NA}" cy="${NAy}" r="14" fill="none" stroke="#111" stroke-width="1.2"/>`);
  push(`<polygon points="${NA},${NAy - 11} ${NA - 5},${NAy + 9} ${NA},${NAy + 5} ${NA + 5},${NAy + 9}" fill="#111"/>`);
  push(`<text x="${NA}" y="${NAy - 18}" font-size="10" text-anchor="middle" fill="#111" font-weight="bold">N</text>`);

  const TBx = CW - 220, TBy = CH - 72, TBw = 210, TBh = 62;
  const scaleVal = Math.round(1000 / scale);
  const today = new Date();
  const dd = String(today.getDate()).padStart(2,'0');
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const yyyy = today.getFullYear();
  push(`<rect x="${TBx}" y="${TBy}" width="${TBw}" height="${TBh}" fill="white" stroke="#333" stroke-width="0.8"/>`);
  push(`<line x1="${TBx}" y1="${TBy + 22}" x2="${TBx + TBw}" y2="${TBy + 22}" stroke="#333" stroke-width="0.5"/>`);
  push(`<line x1="${TBx}" y1="${TBy + 42}" x2="${TBx + TBw}" y2="${TBy + 42}" stroke="#333" stroke-width="0.5"/>`);
  push(`<text x="${TBx + TBw/2}" y="${TBy + 15}" font-size="9" text-anchor="middle" fill="#111" font-weight="bold">${sa(spec.title || 'Plano de vivienda')}</text>`);
  push(`<text x="${TBx + TBw/2}" y="${TBy + 35}" font-size="8" text-anchor="middle" fill="#333">Planta baja  |  Esc. 1:${scaleVal}</text>`);
  push(`<text x="${TBx + TBw/2}" y="${TBy + 55}" font-size="8" text-anchor="middle" fill="#555">${dd}/${mm}/${yyyy}</text>`);

  push(`</svg>`);
  return p.join('\n');
}
