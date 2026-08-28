// Enkelt flöde: ta foto eller välj bild → maskera → ladda ner.
// Inga inställningar i vanligt läge. Mätreglagen visas med ?matning=1 så T8
// fortfarande kan variera tröskel och tiling på en riktig telefon.
import { initDetector, runtimeInfo } from './detect.js';
import { maskImage, download, demo as maskDemo } from './mask.js';
import { demo as tilingDemo } from './tiling.js';
import { startCamera, stopCamera, grabFrame, fromFile, position } from './capture.js';
import { standalone, loggaStart, markera, exportera, sammanfatta } from './t9log.js';

// Höjs vid varje publicering, tillsammans med SKAL_CACHE i sw.js. Syns i
// diagnostiken så det går att se vilken version en telefon faktiskt kör —
// utan den är "har du fått uppdateringen?" omöjlig att svara på i fält.
const VERSION = '2026-08-28.6';

const $ = (id) => document.getElementById(id);
const MATNING = new URLSearchParams(location.search).has('matning');

// Tiling på, inget storlekstak. Tröskeln följer modellen: N behöver 0,12,
// S klarar 0,25 och slipper då falsklarmen på trädstammar. Se
// resultat/matning-modellstorlek.md.
const STANDARD = { expandFrac: 0.18, grids: [1, 2, 3], maxAndel: 1 };

let bloben = null;
let initierad = false;

function options() {
  if (!MATNING) return { ...STANDARD, threshold: runtimeInfo.standardTroskel };
  return {
    threshold: +$('threshold').value,
    expandFrac: +$('expand').value,
    maxAndel: +$('maxandel').value,
    grids: $('tiling').checked ? [1, 2, 3] : [1],
  };
}

function status(text, klass = '') {
  $('status').className = klass;
  $('status').textContent = text;
}

function arbetar(text, klar, totalt) {
  $('status').className = 'arbetar';
  $('status').textContent = text;
  if (totalt) {
    $('status').insertAdjacentHTML('beforeend',
      `<progress value="${klar}" max="${totalt}"></progress>`);
  }
}

function visaVal(vilket) {
  $('val').hidden = vilket !== 'val';
  $('kamera').hidden = vilket !== 'kamera';
}

// Modellen hämtas först när användaren gör något, eller direkt om appen är
// installerad. Det är T9-spärren: ingen automatisk nedladdning i en flik.
async function säkerställModell() {
  if (initierad) return true;
  arbetar('Hämtar modellen. Cirka 5 MB, bara första gången…');
  try {
    await initDetector();
    initierad = true;
    $('ort-version').textContent = runtimeInfo.ortVersion;
    $('modell').textContent = `${runtimeInfo.modell} int8, tröskel ${runtimeInfo.standardTroskel}`;
    $('provider').textContent = runtimeInfo.provider;
    $('init-ms').textContent = `${runtimeInfo.initMs} ms`;
    $('io-names').textContent = `${runtimeInfo.inputNames} → ${runtimeInfo.outputNames}`;
    status('');
    return true;
  } catch (e) {
    status(`Modellen kunde inte laddas: ${e.message}. Ingen maskering görs.`, 'fel');
    return false;
  }
}



async function maskera(källa) {
  $('resultat').hidden = true;
  bloben = null;
  const geo = position();

  const res = await maskImage(källa, {
    ...options(),
    onProgress: (klar, totalt, fas) => {
      if (fas === 'maskerar') arbetar('Maskerar bilden…');
      else if (totalt) arbetar(`Söker efter personer… ${klar} av ${totalt}`, klar, totalt);
    },
  });

  if (!res.ok) {
    status(`Blockerad: ${res.error}. Ingen bild skapades — originalet sparas aldrig.`, 'fel');
    return;
  }

  bloben = res.blob;
  status('');
  $('resultat').hidden = false;
  const antal = res.boxes.length;
  $('resultat-rubrik').textContent = antal ? 'Bilden är maskerad' : 'Inga personer hittades';
  const sek = (res.totalMs / 1000).toFixed(1).replace('.', ',');
  const p = await geo;
  $('resultat-text').textContent =
    (antal === 1 ? 'Ett område är övermålat och går inte att återställa. '
     : antal ? `${antal} områden är övermålade och går inte att återställa. `
     : 'Bilden är ändå omkodad och all metadata borttagen. ') +
    `Tog ${sek} sekunder. ` +
    (p ? `Position ${p.lat}, ${p.lon}, ±${p.accuracy} m.` : 'Ingen position tillgänglig.');

  const bild = await createImageBitmap(res.blob);
  const k = Math.min(1, 1600 / bild.width);
  const duk = new OffscreenCanvas(Math.round(bild.width * k), Math.round(bild.height * k));
  duk.getContext('2d').drawImage(bild, 0, 0, duk.width, duk.height);
  bild.close();
  $('forhandsvisning').src = URL.createObjectURL(await duk.convertToBlob({ type: 'image/jpeg' }));

  if (MATNING) {
    $('regioner').textContent =
      `${res.inferences} inferenser (rutnät ${res.grids.join('+')}), ` +
      `${res.inferenceMs} ms inferens, ${res.totalMs} ms totalt, ` +
      `${Math.round(res.blob.size / 1024)} kB` +
      (res.boxes.length ? ` · ${regionProfil(res.boxes, res.bredd, res.höjd)}` : '');
  }
}

// Vad består svärtan av? Ett fåtal enorma regioner och fyrtio små kräver olika
// åtgärd, och regionantalet ensamt skiljer inte fallen åt.
function regionProfil(boxes, bredd, höjd) {
  const bildyta = bredd * höjd;
  const andelar = boxes.map((b) => (b.w * b.h) / bildyta).sort((a, z) => z - a);
  const pct = (v) => `${(v * 100).toFixed(1)} %`;
  return `störst ${pct(andelar[0])}, ${andelar.filter((a) => a > 0.1).length} över 10 %, ` +
         `${andelar.filter((a) => a < 0.001).length} under 0,1 %`;
}

$('ta-foto').onclick = async () => {
  if (!await säkerställModell()) return;
  try {
    const s = await startCamera($('video'));
    visaVal('kamera');
    status(MATNING ? `Kamera ${s.width}×${s.height}` : '');
  } catch (e) {
    status(`Kameran kunde inte startas: ${e.message}`, 'fel');
  }
};

$('avbryt').onclick = () => { stopCamera($('video')); visaVal('val'); status(''); };

$('fotografera').onclick = async () => {
  const bild = await grabFrame($('video'));
  stopCamera($('video'));
  visaVal('val');
  await maskera(bild);
};

$('valj-bild').onclick = async () => { if (await säkerställModell()) $('fil').click(); };
$('fil').onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) await maskera(await fromFile(f));
};

$('ladda-ner').onclick = () => bloben && download(bloben);
$('igen').onclick = () => { $('resultat').hidden = true; status(''); };

$('kam-ja').onclick = () => { markera(true); $('t9-sammanfattning').textContent = sammanfatta(); };
$('kam-nej').onclick = () => { markera(false); $('t9-sammanfattning').textContent = sammanfatta(); };
$('t9-export').onclick = exportera;

// Modellen väljs vid sessionens start, så bytet kräver omladdning.
// Övriga parametrar behålls så ?matning=1 inte tappas bort.
$('modellval').onchange = () => {
  const p = new URLSearchParams(location.search);
  if ($('modellval').value === 'n') p.delete('modell');
  else p.set('modell', $('modellval').value);
  location.search = p.toString();
};
// Sista utvägen när en gammal service worker vägrar lämna plats. Utan den
// finns ingen väg tillbaka från en trasig publicering annat än att radera
// webbplatsdata i systeminställningarna — vilket ingen kollega gör i fält.
$('nollstall').onclick = async () => {
  status('Nollställer…');
  try {
    const reg = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    await Promise.all(reg.map((r) => r.unregister()));
    const namn = await caches.keys();
    await Promise.all(namn.map((n) => caches.delete(n)));
    sessionStorage.removeItem('laddat-om');
    status(`Nollställd: ${reg.length} service worker, ${namn.length} cache. Laddar om…`);
    setTimeout(() => location.reload(), 800);
  } catch (e) {
    status(`Nollställning misslyckades: ${e.message}`, 'fel');
  }
};

$('selftest').onclick = async () => {
  const r = [tilingDemo(), await maskDemo()];
  status(`${r.join(' · ')} — eventuella fel syns i konsolen`);
};

const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function visaInstallation() {
  if (standalone()) return;
  $('installera').hidden = false;
  $('installera-steg').innerHTML = (IOS
    ? ['Tryck på <strong>Dela</strong>-knappen längst ned i Safari.',
       'Välj <strong>Lägg till på hemskärmen</strong>.',
       'Starta appen från den nya ikonen.']
    : ['Öppna menyn i webbläsaren (tre punkter).',
       'Välj <strong>Installera appen</strong> eller <strong>Lägg till på startskärmen</strong>.',
       'Starta appen från den nya ikonen.']
  ).map((s) => `<li>${s}</li>`).join('');
}

(async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('sw:', e.message));
    // En ny service worker tar över med skipWaiting + claim, men sidan som redan
    // ritats kommer fortfarande från det gamla skalet. Utan den här omladdningen
    // sitter en installerad app kvar på en gammal version tills användaren
    // råkar starta om den två gånger.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (sessionStorage.getItem('laddat-om')) return;   // en gång, aldrig i loop
      sessionStorage.setItem('laddat-om', '1');
      location.reload();
    });
  }
  $('version').textContent = VERSION;
  $('modellval').value = new URLSearchParams(location.search).get('modell') === 's' ? 's' : 'n';
  $('installningar').hidden = !MATNING;
  visaInstallation();

  const rad = await loggaStart();
  $('display-mode').textContent = rad.standalone ? 'standalone (installerad)' : 'webbläsarflik';
  $('t9-rad').textContent =
    `modellcache ${rad.modellCache}, runtime ${rad.runtimeCache}, ` +
    `lagring ${rad.lagring ? `${rad.lagring.usageMB} MB av ${rad.lagring.quotaMB} MB` : 'okänd'}, ` +
    `kamerabehörighet ${rad.kameraBehörighet}`;
  $('t9-sammanfattning').textContent = sammanfatta();

  if (MATNING) {
    $('threshold').value = runtimeInfo.standardTroskel || 0.25;
    $('threshold-out').value = $('threshold').value;
    for (const [id, ut] of [['threshold', 'threshold-out'], ['expand', 'expand-out']]) {
      $(id).oninput = () => ($(ut).value = $(id).value);
    }
    $('maxandel').oninput = () => ($('maxandel-out').value =
      $('maxandel').value >= 1 ? 'av' : `${Math.round($('maxandel').value * 100)} %`);
  }

  // Installerad app: hämta modellen direkt, användaren har redan valt att ha den.
  if (standalone()) await säkerställModell();
})();
