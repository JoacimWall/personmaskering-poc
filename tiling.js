// T3 — tiling i nativ upplösning, låg tröskel, IoU-sammanslagning över rutgränser.
import { detectCrop, INPUT_SIZE } from './detect.js';
import { tiles, nms, expand, taBort_förStora } from './boxes.js';

export { tiles, iou, nms, expand, taBort_förStora, demo } from './boxes.js';

// grids: [1] = bara helbild (tiling av), [1,2,3] = helbild + 2x2 + 3x3 (tiling på).
export async function detectPersons(source, opts = {}) {
  const {
    threshold = 0.12, grids = [1, 2, 3], overlap = 0.2,
    iouThreshold = 0.5, expandFrac = 0.18, maxAndel = 1, onProgress,
  } = opts;
  const { width, height } = source;

  // Alla utsnitt räknas fram först, så antalet inferenser är känt innan de körs
  // och förloppet kan visas som "5 av 14" i stället för en oändlig snurra.
  const köa = [];
  const used = [];
  for (const grid of grids) {
    const rutor = tiles(width, height, grid, overlap);
    // Tiling ska ge NATIV upplösning. En ruta som är mindre än modellens indata
    // skalas upp och tillför ingen information — bara falsklarm. Hoppa över den
    // nivån. Utan spärren gav en 640 px-bild 37 regioner i stället för 1.
    if (grid > 1 && (rutor[0].w < INPUT_SIZE || rutor[0].h < INPUT_SIZE)) continue;
    used.push(grid);
    köa.push(...rutor);
  }

  let all = [];
  let inferences = 0, inferenceMs = 0;
  onProgress?.(0, köa.length);
  for (const crop of köa) {
    const r = await detectCrop(source, crop, threshold);
    all = all.concat(r.boxes);
    inferences++; inferenceMs += r.ms;
    onProgress?.(inferences, köa.length);
    // Släpp tråden så förloppet hinner ritas om mellan inferenserna.
    await new Promise((klar) => setTimeout(klar, 0));
  }
  // Taket appliceras FÖRE utvidgningen: utvidgningen ska varken kunna knuffa en
  // godkänd box över gränsen eller rädda en underkänd under den.
  const merged = expand(taBort_förStora(nms(all, iouThreshold), maxAndel, width, height),
                        expandFrac, width, height);
  return { boxes: merged, inferences, inferenceMs: Math.round(inferenceMs), raw: all.length, grids: used };
}

