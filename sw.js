// T9 — cache av runtime och modell.
//
// TVÅ strategier, med avsikt.
//
//   Skalet (HTML, JS, CSS): NÄTET FÖRST, cachen som reserv.
//   Modellen och runtime (.onnx, .wasm): CACHEN FÖRST.
//
// Skälet till att skalet inte får vara cache-first: då returnerar service
// workern gammal kod även vid en uttrycklig omladdning, och en publicerad
// rättning når aldrig fram förrän användaren råkar starta om appen två gånger.
// Det upptäcktes i skarpt läge 2026-08-28 — modellvalet fanns publicerat men
// gick inte att få fram i vare sig installerad app eller webbläsarflik.
// Skalet är omkring 40 kB; att hämta det vid varje start kostar ingenting.
// Offline fungerar ändå, via reserven.
//
// Modellen ligger kvar cache-first i en egen cache som inte versioneras.
// Det är den som T9 mäter, och en kodrättning får inte vräka ut den.
const SKAL_CACHE = 'personmaskering-skal-v10';
const TILLGANG_CACHE = 'personmaskering-tillgangar-v1';   // höj bara om standardmodellen byts
const SKAL = ['./', './index.html', './style.css', './app.js', './detect.js',
              './tiling.js', './boxes.js', './mask.js', './capture.js', './t9log.js',
              './manifest.json'];

const ärTillgång = (url) => /\.(wasm|onnx)$/.test(new URL(url).pathname);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SKAL_CACHE).then((c) => c.addAll(SKAL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  const behåll = [SKAL_CACHE, TILLGANG_CACHE];
  e.waitUntil(
    caches.keys()
      .then((k) => Promise.all(k.filter((n) => !behåll.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // Modellen och runtime: cachen först. De ändras inte, och T9 mäter just om
  // de ligger kvar.
  if (ärTillgång(e.request.url)) {
    e.respondWith(caches.match(e.request).then((träff) => träff || fetch(e.request).then((svar) => {
      if (svar.ok) {
        const kopia = svar.clone();
        caches.open(TILLGANG_CACHE).then((c) => c.put(e.request, kopia));
      }
      return svar;
    })));
    return;
  }

  // Skalet: nätet först, cachen som reserv när nätet saknas.
  e.respondWith(
    fetch(e.request)
      .then((svar) => {
        if (svar.ok) {
          const kopia = svar.clone();
          caches.open(SKAL_CACHE).then((c) => c.put(e.request, kopia));
        }
        return svar;
      })
      .catch(() => caches.match(e.request).then((träff) => träff || Promise.reject(new Error('offline')))),
  );
});
