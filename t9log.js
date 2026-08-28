// T9 — startlogg. En rad per appstart, sparad lokalt, exporterbar som JSON.
// Frågorna loggen ska besvara efter fyra veckor:
//   överlever modellcachen, och måste kameran godkännas vid varje start.
const NYCKEL = 't9-startlogg';
const MODELL = './models/dfine_n_coco_int8.onnx';
const RUNTIME = './vendor/ort-wasm-simd-threaded.wasm';

export const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

async function cacheLäge(url) {
  if (!('caches' in window)) return 'ingen-cache-api';
  return (await caches.match(new URL(url, location.href))) ? 'träff' : 'miss';
}

async function lagring() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { usageMB: +(usage / 1048576).toFixed(2), quotaMB: +(quota / 1048576).toFixed(0) };
}

// Kamerabehörighet: Permissions API saknas på iOS Safari, som är den enda
// plattform frågan gäller. Där får testaren markera det för hand — en människas
// observation är den ärliga mätningen, inte en gissning från kod.
async function kameraStatus() {
  try {
    return (await navigator.permissions.query({ name: 'camera' })).state;
  } catch {
    return 'okänd';
  }
}

export function läs() {
  try { return JSON.parse(localStorage.getItem(NYCKEL)) ?? []; } catch { return []; }
}

export async function loggaStart() {
  const rad = {
    tid: new Date().toISOString(),
    standalone: standalone(),
    modellCache: await cacheLäge(MODELL),
    runtimeCache: await cacheLäge(RUNTIME),
    lagring: await lagring(),
    kameraBehörighet: await kameraStatus(),
    frågadeOmKameran: null,      // sätts av testaren via markera()
    ua: navigator.userAgent,
  };
  const rader = läs();
  rader.push(rad);
  localStorage.setItem(NYCKEL, JSON.stringify(rader));
  return rad;
}

// Testaren markerar om kameran faktiskt frågade om lov vid den här starten.
export function markera(frågade) {
  const rader = läs();
  if (!rader.length) return;
  rader[rader.length - 1].frågadeOmKameran = frågade;
  localStorage.setItem(NYCKEL, JSON.stringify(rader));
}

export function exportera() {
  const blob = new Blob([JSON.stringify(läs(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'),
    { href: url, download: `t9-startlogg-${Date.now()}.json` }).click();
  URL.revokeObjectURL(url);
}

export function sammanfatta() {
  const r = läs();
  if (!r.length) return 'ingen logg än';
  const s = r.filter((x) => x.standalone);
  const träffar = s.filter((x) => x.modellCache === 'träff').length;
  const frågade = s.filter((x) => x.frågadeOmKameran === true).length;
  const svarade = s.filter((x) => x.frågadeOmKameran !== null).length;
  const första = new Date(r[0].tid), sista = new Date(r[r.length - 1].tid);
  const dagar = Math.round((sista - första) / 86400000);
  return `${r.length} starter (${s.length} standalone) över ${dagar} dygn · ` +
         `modellcache träff ${träffar}/${s.length} · kameran frågade ${frågade}/${svarade}`;
}
