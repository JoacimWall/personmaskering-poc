// Ren boxgeometri: rutnät, IoU, NMS, utvidgning. Inga beroenden, ingen DOM.
// Ligger separat för att tools/eval.mjs ska kunna mäta EXAKT samma
// sammanslagningslogik som appen använder, utan att dra in webbläsarens runtime.
// Överlappande rutnät i källans pixlar. grid=1 ger helbildspasset.
export function tiles(width, height, grid, overlap = 0.2) {
  if (grid <= 1) return [{ x: 0, y: 0, w: width, h: height }];
  const stepX = width / grid, stepY = height / grid;
  const padX = stepX * overlap, padY = stepY * overlap;
  const out = [];
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const x = Math.max(0, col * stepX - padX);
      const y = Math.max(0, row * stepY - padY);
      out.push({
        x, y,
        w: Math.min(width, (col + 1) * stepX + padX) - x,
        h: Math.min(height, (row + 1) * stepY + padY) - y,
      });
    }
  }
  return out;
}

export function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter === 0) return 0;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

// Girig NMS. Behövs inte för ett enskilt DETR-pass — behövs för rutgränserna.
export function nms(boxes, iouThreshold = 0.5) {
  const kept = [];
  for (const box of [...boxes].sort((p, q) => q.score - p.score)) {
    if (!kept.some((k) => iou(k, box) > iouThreshold)) kept.push(box);
  }
  return kept;
}

// Utvidgning: en box som precis omsluter huvudet lämnar hakan omaskerad.
export function expand(boxes, frac, width, height) {
  return boxes.map((b) => {
    const dx = b.w * frac, dy = b.h * frac;
    const x = Math.max(0, b.x - dx), y = Math.max(0, b.y - dy);
    return {
      ...b,
      x, y,
      w: Math.min(width, b.x + b.w + dx) - x,
      h: Math.min(height, b.y + b.h + dy) - y,
    };
  });
}

// Vid låg tröskel ger DETR-familjen lågkonfidenta förslag som täcker halva
// bilden. Uppmätt: största regionen 68 % av bildytan, 13 regioner över 10 %.
// De är inte personer, och för en trädtjänst förstör de nyttolasten.
//
// VARNING, VERIFIERAD: filtret skär sönder verkliga personboxar. På ett riktigt
// foto 2026-08-28 upptog en stående person 27 % av bildytan. Med tak 10 % ströks
// hennes box och kvar blev huvud och överkropp maskerade medan byxor och skor
// syntes. Filtret är alltså inte fail safe. Standardvärdet är 1 (avstängt) och
// bör förbli det om inte T8 visar något annat.
export function taBort_förStora(boxes, maxAndel, width, height) {
  if (!(maxAndel > 0) || maxAndel >= 1) return boxes;
  const bildyta = width * height;
  return boxes.filter((b) => (b.w * b.h) / bildyta <= maxAndel);
}

// Klart-kriteriets check: två överlappande boxar över tröskeln blir en.
export function demo() {
  const a = { x: 100, y: 100, w: 100, h: 200, score: 0.9 };
  const b = { x: 110, y: 105, w: 100, h: 200, score: 0.7 };
  const far = { x: 900, y: 900, w: 50, h: 50, score: 0.6 };
  console.assert(iou(a, b) > 0.5, 'iou: överlappande boxar ska ge > 0,5');
  console.assert(iou(a, far) === 0, 'iou: åtskilda boxar ska ge 0');
  const kept = nms([a, b, far], 0.5);
  console.assert(kept.length === 2, `nms: förväntade 2 boxar, fick ${kept.length}`);
  console.assert(kept[0].score === 0.9, 'nms: den starkaste boxen ska överleva');
  const grid = tiles(1000, 1000, 2, 0.2);
  console.assert(grid.length === 4, 'tiles: 2x2 ska ge 4 rutor');
  console.assert(grid[0].w > 500, 'tiles: rutorna ska överlappa');
  const e = expand([{ x: 0, y: 50, w: 100, h: 100, score: 1 }], 0.2, 1000, 1000);
  console.assert(e[0].x === 0 && e[0].y === 30, 'expand: ska klippas mot bildkanten');
  console.assert(tiles(640, 425, 3, 0.2)[0].w < 640, 'tiles: 3x3 på en 640 px-bild ger rutor under modellens indata');
  const stor = { x: 0, y: 0, w: 800, h: 800, score: 0.2 };
  const liten = { x: 0, y: 0, w: 100, h: 100, score: 0.2 };
  console.assert(taBort_förStora([stor, liten], 0.25, 1000, 1000).length === 1, 'taBort_förStora: 64 % ska bort vid tak 25 %');
  console.assert(taBort_förStora([stor, liten], 1, 1000, 1000).length === 2, 'taBort_förStora: tak 1 ska vara avstängt');
  return 'tiling: ok';
}
