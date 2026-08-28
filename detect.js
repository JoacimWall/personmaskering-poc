// T2 — modell, preprocess, en inferens, personboxar.
// Grafen är verifierad mot models/SOURCE.txt, inte antagen.
import * as ort from './vendor/ort.wasm.min.mjs';

// Två varianter ur samma familj — identisk graf, identisk preprocess, bara
// olika storlek.
//
// S är träffsäkrare på just det som är svårt: med N överlappar falsklarmens
// score (0,16-0,19) de små skymda personernas (0,13-0,35), vilket tvingar fram
// tröskel 0,12 och maskerar då trädstammar och älgar. S separerar dem och gör
// tröskel 0,25 användbar, med noll falsklarm på samma bilder.
//
// N är ändå standard, av ett skäl som bara syns i rätt runtime: i webbläsarens
// WASM är S 3,12 gånger långsammare, inte 1,78 som onnxruntime-node antyder.
// Uppmätt 2026-08-28: 603 ms mot 1880 ms per inferens, alltså 8,4 s mot 26,3 s
// för en bild med full tiling — omkring 21 s på en iPhone. Det är inte en
// användbar tjänst.
//
// ?modell=s väljer S, så T8 kan mäta båda på riktig telefon.
// Underlag: resultat/matning-modellstorlek.md
export const MODELLER = {
  n: { fil: './models/dfine_n_coco_int8.onnx', troskel: 0.12, namn: 'D-FINE-N' },
  s: { fil: './models/dfine_s_coco_int8.onnx', troskel: 0.25, namn: 'D-FINE-S' },
};
const VALD = MODELLER[new URLSearchParams(location.search).get('modell')] ?? MODELLER.n;
const INPUT_SIZE = 640;      // preprocessor_config.json: size 640x640, do_pad=false
const PERSON_CLASS = 0;      // COCO
const NUM_CLASSES = 80;

// Absolut URL: ort tolkar en relativ sökväg mot sin EGEN plats (vendor/),
// vilket ger vendor/vendor/. Denna form är oberoende av var sidan ligger.
ort.env.wasm.wasmPaths = new URL('./vendor/', import.meta.url).href;
ort.env.wasm.numThreads = 1;   // en tråd: trådar kräver COOP/COEP
ort.env.wasm.proxy = false;

let session = null;
let inputName = null;

export const runtimeInfo = {
  ortVersion: ort.env.versions?.web ?? 'okänd', provider: null, initMs: null,
  modell: VALD.namn, standardTroskel: VALD.troskel,
};

export async function initDetector() {
  if (session) return runtimeInfo;
  const t0 = performance.now();
  session = await ort.InferenceSession.create(VALD.fil, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  inputName = session.inputNames[0];
  runtimeInfo.provider = 'wasm';
  runtimeInfo.initMs = Math.round(performance.now() - t0);
  runtimeInfo.inputNames = session.inputNames.join(', ');
  runtimeInfo.outputNames = session.outputNames.join(', ');
  return runtimeInfo;
}

// Återanvänd en canvas — en per anrop blir hundratals vid tiling.
const scratch = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
const sctx = scratch.getContext('2d', { willReadFrequently: true });
const tensorData = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);

// source: ImageBitmap | HTMLCanvasElement | OffscreenCanvas. crop i källans pixlar.
function preprocess(source, crop) {
  const { x, y, w, h } = crop;
  sctx.drawImage(source, x, y, w, h, 0, 0, INPUT_SIZE, INPUT_SIZE);
  const { data } = sctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;
  for (let i = 0, p = 0; p < plane; p++, i += 4) {
    tensorData[p] = data[i] / 255;                 // R  (do_normalize=false ⇒ bara rescale)
    tensorData[plane + p] = data[i + 1] / 255;     // G
    tensorData[2 * plane + p] = data[i + 2] / 255; // B
  }
  return new ort.Tensor('float32', tensorData, [1, 3, INPUT_SIZE, INPUT_SIZE]);
}

const sigmoid = (v) => 1 / (1 + Math.exp(-v));

// cxcywh normaliserat -> pixelboxar i källans koordinatsystem.
function postprocess(logits, boxes, crop, threshold) {
  const out = [];
  const queries = boxes.dims[1];
  for (let q = 0; q < queries; q++) {
    const score = sigmoid(logits.data[q * NUM_CLASSES + PERSON_CLASS]);
    if (score < threshold) continue;
    const b = q * 4;
    const cx = boxes.data[b], cy = boxes.data[b + 1], bw = boxes.data[b + 2], bh = boxes.data[b + 3];
    out.push({
      x: crop.x + (cx - bw / 2) * crop.w,
      y: crop.y + (cy - bh / 2) * crop.h,
      w: bw * crop.w,
      h: bh * crop.h,
      score,
    });
  }
  return out;
}

// En inferens över ett utsnitt. crop utelämnad = hela bilden.
export async function detectCrop(source, crop, threshold) {
  if (!session) throw new Error('detektorn är inte initierad');
  const feeds = { [inputName]: preprocess(source, crop) };
  const t0 = performance.now();
  const res = await session.run(feeds);
  const ms = performance.now() - t0;
  return { boxes: postprocess(res.logits, res.pred_boxes, crop, threshold), ms };
}

export { INPUT_SIZE, PERSON_CLASS };
