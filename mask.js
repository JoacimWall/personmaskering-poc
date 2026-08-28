// T4 — maskering, nedladdning, och att originalet inte läcker.
//
// KODGRANSKNINGSPUNKT (utredningen 4.3): den här filen är fail closed.
// Detektorfel, timeout eller saknat stöd ⇒ ok:false och INGEN blob.
// Ett `catch` som faller tillbaka på originalet upphäver hela PoC:en.
// Ingen väg härifrån får returnera, spara eller URL:a källbilden.
import { detectPersons } from './tiling.js';

const FILL = '#000000';        // opak ifyllnad. Blur/pixelering är återvinningsbar.
const JPEG_QUALITY = 0.9;
const TIMEOUT_MS = 30000;

// Ett Path2D, ett fill-pass, opakt. Inte ett pass per person:
// överlappande halvtransparenta pass ger gradienter som läcker kontur.
function drawMasked(source, boxes) {
  const canvas = new OffscreenCanvas(source.width, source.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0);
  const path = new Path2D();
  for (const b of boxes) path.rect(Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h));
  ctx.fillStyle = FILL;
  ctx.globalAlpha = 1;         // hård kant inuti regionen, ingen fjädring inåt
  ctx.fill(path);
  return canvas;
}

// WebKits canvas-kodare går via ImageIO och skriver ett minimalt Exif-block plus
// en Photoshop-IRB i utdatan. Uppmätt på iPhone 2026-08-28: APP1 med ColorSpace
// och pixelmått, APP13 med tom IPTC. Ingen GPS, ingen IFD1-miniatyr — men
// mätpunkten i kap. 7 kräver ingen EXIF alls, och att lita på att en framtida
// plattformskodare fortsätter vara lika sparsam är just den feltro utredningen
// varnar för. Alla APP1–APP15 tas därför bort. APP0 (JFIF) behålls: den är
// strukturell och innehåller inga personuppgifter.
async function strippaMetadata(blob) {
  const d = new Uint8Array(await blob.arrayBuffer());
  if (d[0] !== 0xFF || d[1] !== 0xD8) return blob;         // inte JPEG, rör den inte
  const behåll = [d.subarray(0, 2)];
  let i = 2;
  while (i < d.length - 1 && d[i] === 0xFF) {
    const märke = d[i + 1];
    if (märke === 0xDA) break;                              // start of scan: resten är bilddata
    const längd = (d[i + 2] << 8) | d[i + 3];
    if (längd < 2) return blob;                             // trasig struktur: lämna orörd
    const app = märke >= 0xE1 && märke <= 0xEF;
    if (!app) behåll.push(d.subarray(i, i + 2 + längd));
    i += 2 + längd;
  }
  behåll.push(d.subarray(i));
  return new Blob(behåll, { type: blob.type });
}

const timeout = (ms) => new Promise((_, reject) =>
  setTimeout(() => reject(new Error(`tidsgräns ${ms} ms överskriden`)), ms));

/**
 * Tar över ägandet av `source` och stänger den oavsett utfall.
 * @returns {Promise<{ok:true, blob:Blob, boxes:Array, inferences:number, inferenceMs:number, totalMs:number}
 *                 | {ok:false, error:string}>}
 */
export async function maskImage(source, opts = {}) {
  const t0 = performance.now();
  try {
    if (typeof OffscreenCanvas === 'undefined' || typeof Path2D === 'undefined') {
      throw new Error('saknat stöd: OffscreenCanvas/Path2D');
    }
    // Läs måtten INNAN källan släpps — en stängd ImageBitmap rapporterar 0.
    const bredd = source.width, höjd = source.height;
    const det = await Promise.race([detectPersons(source, opts), timeout(opts.timeoutMs ?? TIMEOUT_MS)]);
    const canvas = drawMasked(source, det.boxes);
    const kodad = await canvas.convertToBlob({ type: 'image/jpeg', quality: opts.quality ?? JPEG_QUALITY });
    const blob = await strippaMetadata(kodad);
    // toBlob har löst ut: originalet behövs inte längre någonstans.
    release(source);
    return { ok: true, blob, boxes: det.boxes, inferences: det.inferences, grids: det.grids,
             bredd, höjd,
             inferenceMs: det.inferenceMs, totalMs: Math.round(performance.now() - t0) };
  } catch (err) {
    release(source);            // fail closed: originalet dör med felet
    return { ok: false, error: String(err?.message ?? err) };
  }
}

function release(source) {
  if (source && typeof source.close === 'function') source.close();   // ImageBitmap
}

// T4 steg 7. Nås bara från den lyckade vägen — se app.js.
export function download(blob, name = `maskad-${Date.now()}.jpg`) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  URL.revokeObjectURL(url);
}

// Klart-kriteriets check.
export async function demo() {
  const src = new OffscreenCanvas(200, 200);
  const sctx = src.getContext('2d');
  sctx.fillStyle = '#ff0000';
  sctx.fillRect(0, 0, 200, 200);

  const masked = drawMasked(src, [{ x: 50, y: 50, w: 100, h: 100 }]);
  const px = masked.getContext('2d').getImageData(60, 60, 80, 80).data;
  let constant = true;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] !== 0 || px[i + 1] !== 0 || px[i + 2] !== 0 || px[i + 3] !== 255) { constant = false; break; }
  }
  console.assert(constant, 'mask: maskad region ska ha konstant, opakt pixelvärde');
  const outside = masked.getContext('2d').getImageData(10, 10, 1, 1).data;
  console.assert(outside[0] === 255, 'mask: utanför regionen ska bilden vara orörd');

  // Metadata ska bort ur utdatan oavsett vad plattformens JPEG-kodare skriver.
  const medExif = new Blob([
    new Uint8Array([0xFF, 0xD8]),
    new Uint8Array([0xFF, 0xE0, 0x00, 0x10]), new TextEncoder().encode('JFIF\0'), new Uint8Array(11),
    new Uint8Array([0xFF, 0xE1, 0x00, 0x08]), new TextEncoder().encode('Exif\0\0'),
    new Uint8Array([0xFF, 0xED, 0x00, 0x04]), new Uint8Array(2),
    new Uint8Array([0xFF, 0xDA, 0x00, 0x02, 0x11, 0x22]),
  ], { type: 'image/jpeg' });
  const rensad = new Uint8Array(await (await strippaMetadata(medExif)).arrayBuffer());
  const text = new TextDecoder('latin1').decode(rensad);
  console.assert(!text.includes('Exif'), 'strippaMetadata: APP1/Exif ska vara borta');
  console.assert(!text.includes('\xED'), 'strippaMetadata: APP13 ska vara borta');
  console.assert(text.includes('JFIF'), 'strippaMetadata: APP0/JFIF ska behållas');
  console.assert(rensad[rensad.length - 2] === 0x11 && rensad[rensad.length - 1] === 0x22,
                 'strippaMetadata: bilddata efter SOS ska vara orörd');

  // Fail closed: en detektor som kastar får inte ge en blob.
  const bomb = { width: 10, height: 10, closed: false, close() { this.closed = true; } };
  const failed = await maskImage(bomb, { timeoutMs: 1 });
  console.assert(failed.ok === false, 'fail closed: fel ska ge ok:false');
  console.assert(failed.blob === undefined, 'fail closed: fel får INTE ge en blob');
  console.assert(bomb.closed === true, 'fail closed: källan ska släppas även vid fel');
  return 'mask: ok';
}
