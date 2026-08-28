// T9 — cache av runtime och modell.
//
// TVÅ cacher, med avsikt. Skalet versioneras och byts vid varje kodändring.
// Runtime (.wasm) och modellen (.onnx) ligger i en egen cache som INTE byts —
// annars skulle varje rättning i koden vräka ut modellen och nollställa den
// fyraveckorsmätning som är hela poängen med T9.
//
// Tillgångarna förcachas inte här: de hämtas först när appen körs i
// standalone-läge och fastnar då via fetch-hanteraren. Lagringen är isolerad
// mellan Safari och installerad app, så förcachning skulle ge två nedladdningar.
const SKAL_CACHE = 'personmaskering-skal-v4';
const TILLGANG_CACHE = 'personmaskering-tillgangar-v1';   // höj bara om modellen byts
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

// Cache first. Modellen ändras inte, och T9 mäter just om den ligger kvar.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const cacheNamn = ärTillgång(e.request.url) ? TILLGANG_CACHE : SKAL_CACHE;
  e.respondWith(
    caches.match(e.request).then((träff) => träff || fetch(e.request).then((svar) => {
      if (svar.ok) {
        const kopia = svar.clone();
        caches.open(cacheNamn).then((c) => c.put(e.request, kopia));
      }
      return svar;
    })),
  );
});
