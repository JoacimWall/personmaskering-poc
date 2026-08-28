// Slice 1: ta foto -> maskera -> ladda ner. Ingen väg visar originalet.
import { initDetector, runtimeInfo } from './detect.js';
import { maskImage, download, demo as maskDemo } from './mask.js';
import { demo as tilingDemo } from './tiling.js';
import { startCamera, grabFrame, fromFile, position } from './capture.js';
import { standalone, loggaStart, markera, exportera, sammanfatta } from './t9log.js';

const $ = (id) => document.getElementById(id);
const els = ['ort-version','provider','init-ms','io-names','selftest','start-cam','shoot','file',
             'video','threshold','threshold-out','expand','expand-out','maxandel','maxandel-out','tiling','status','metrics',
             'geo','download','preview','init','display-mode','t9-rad','t9-sammanfattning',
             'kam-ja','kam-nej','t9-export','regioner'].reduce((o, id) => (o[id] = $(id), o), {});

// Vad består svärtan av? Ett fåtal enorma regioner och fyrtio små kräver olika
// åtgärd, och regionantalet ensamt skiljer inte fallen åt.
function regionProfil(boxes, bredd, höjd) {
  if (!boxes.length) return 'inga regioner';
  const bildyta = bredd * höjd;
  const andelar = boxes.map((b) => (b.w * b.h) / bildyta).sort((a, z) => z - a);
  const stora = andelar.filter((a) => a > 0.1).length;
  const små = andelar.filter((a) => a < 0.001).length;
  const pct = (v) => `${(v * 100).toFixed(1)} %`;
  return `största regionen ${pct(andelar[0])} av bilden · ` +
         `${stora} region(er) över 10 % · ${små} under 0,1 % · ` +
         `medianregion ${pct(andelar[Math.floor(andelar.length / 2)])}`;
}

let lastBlob = null;

function status(text, cls = '') { els.status.textContent = text; els.status.className = cls; }

function options() {
  return {
    threshold: +els.threshold.value,
    expandFrac: +els.expand.value,
    grids: els.tiling.checked ? [1, 2, 3] : [1],
    maxAndel: +els.maxandel.value,
  };
}

// Enda vägen till en nedladdningsknapp. Fail closed = knappen finns inte.
async function run(source) {
  els.download.hidden = true;
  lastBlob = null;
  status('Maskerar…');
  const geo = position();                         // parallellt, blockerar inte
  const res = await maskImage(source, options());
  if (!res.ok) {
    status(`BLOCKERAD: ${res.error}. Ingen bild skapades.`, 'fail');
    els.metrics.textContent = '';
    els.preview.getContext('2d').clearRect(0, 0, els.preview.width, els.preview.height);
    return;
  }
  lastBlob = res.blob;
  window.__blob = res.blob;   // endast för headless-verifiering (tools/…/e2e)
  els.download.hidden = false;
  status(`Maskerad: ${res.boxes.length} region(er).`, 'ok');
  els.metrics.textContent =
    `${res.inferences} inferenser (rutnät ${res.grids.join('+')}), ${res.inferenceMs} ms inferens, ` +
    `${res.totalMs} ms totalt, ${Math.round(res.blob.size / 1024)} kB`;
  els.regioner.textContent = regionProfil(res.boxes, res.bredd, res.höjd);
  // Förhandsvisningen skalas ned: en canvas i 4000 px kostar minne på telefonen
  // utan att visa något som inte syns ändå.
  const preview = await createImageBitmap(res.blob);
  const k = Math.min(1, 1600 / preview.width);
  els.preview.width = Math.round(preview.width * k);
  els.preview.height = Math.round(preview.height * k);
  els.preview.getContext('2d').drawImage(preview, 0, 0, els.preview.width, els.preview.height);
  preview.close();
  const p = await geo;
  els.geo.textContent = p
    ? `lat ${p.lat}, lon ${p.lon}, ±${p.accuracy} m, ${p.timestamp}`
    : 'ingen position';
}

els.threshold.oninput = () => (els['threshold-out'].value = els.threshold.value);
els.expand.oninput = () => (els['expand-out'].value = els.expand.value);
els.maxandel.oninput = () => (els['maxandel-out'].value =
  els.maxandel.value >= 1 ? 'av' : `${Math.round(els.maxandel.value * 100)} %`);

els['start-cam'].onclick = async () => {
  try {
    const s = await startCamera(els.video);
    els.shoot.disabled = false;
    status(`Kamera: ${s.width}×${s.height}`);
  } catch (e) { status(`Kamera nekad: ${e.message}`, 'fail'); }
};

els.shoot.onclick = async () => run(await grabFrame(els.video));
els.file.onchange = async (e) => { if (e.target.files[0]) await run(await fromFile(e.target.files[0])); e.target.value = ''; };
els.download.onclick = () => lastBlob && download(lastBlob);

els.selftest.onclick = async () => {
  const results = [tilingDemo(), await maskDemo()];
  status(results.join(' | ') + ' — se konsolen för assert-fel');
};

els['kam-ja'].onclick = () => { markera(true); els['t9-sammanfattning'].textContent = sammanfatta(); };
els['kam-nej'].onclick = () => { markera(false); els['t9-sammanfattning'].textContent = sammanfatta(); };
els['t9-export'].onclick = exportera;

async function init() {
  els.init.disabled = true;
  status('Initierar runtime…');
  try {
    await initDetector();
    els['ort-version'].textContent = runtimeInfo.ortVersion;
    els.provider.textContent = runtimeInfo.provider;
    els['init-ms'].textContent = `${runtimeInfo.initMs} ms`;
    els['io-names'].textContent = `${runtimeInfo.inputNames} → ${runtimeInfo.outputNames}`;
    status('Klar.');
  } catch (e) {
    status(`Runtime kunde inte initieras: ${e.message}. Maskering blockerad.`, 'fail');
    els.shoot.disabled = true; els.file.disabled = true; els['start-cam'].disabled = true;
  }
}
els.init.onclick = init;

(async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('sw:', e.message));
  }
  const rad = await loggaStart();
  els['display-mode'].textContent = rad.standalone ? 'standalone (installerad)' : 'webbläsarflik';
  els['t9-rad'].textContent =
    `modellcache ${rad.modellCache}, runtime ${rad.runtimeCache}, ` +
    `lagring ${rad.lagring ? `${rad.lagring.usageMB} MB av ${rad.lagring.quotaMB} MB` : 'okänd'}, ` +
    `kamerabehörighet ${rad.kameraBehörighet}`;
  els['t9-sammanfattning'].textContent = sammanfatta();

  // T9: hämta INTE modellen förrän appen kör i standalone-läge. Lagringen är
  // isolerad mellan Safari och installerad app — annars laddas den ned två gånger
  // och nedladdningen som mäts blir fel.
  if (standalone()) { await init(); return; }
  status('Webbläsarflik: modellen hämtas inte automatiskt (T9). Installera appen, '
       + 'eller tryck "Ladda modell" om du bara vill testa.');
})();
