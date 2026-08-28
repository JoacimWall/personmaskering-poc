// T6 — kamera och koordinater.
// Position läses från Geolocation vid fototillfället: EXIF-GPS finns inte kvar
// efter T4, och en getUserMedia-ström har aldrig haft någon.
// Ingen kö: originalet maskeras synkront och lagras aldrig.

let stream = null;

export async function startCamera(videoEl) {
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 4096 }, height: { ideal: 4096 } },
    audio: false,
  });
  videoEl.srcObject = stream;
  await videoEl.play();
  const t = stream.getVideoTracks()[0].getSettings();
  return { width: t.width, height: t.height, label: stream.getVideoTracks()[0].label };
}

export function stopCamera(videoEl) {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (videoEl) videoEl.srcObject = null;
}

// ImageBitmap i kamerans nativa upplösning. Anroparen tar över ägandet
// och ska lämna den till maskImage(), som stänger den.
export async function grabFrame(videoEl) {
  return createImageBitmap(videoEl);
}

export async function fromFile(file) {
  return createImageBitmap(file);       // Blob-referensen behålls inte
}

// Bäst-ansträngning: en saknad koordinat får inte blockera maskeringen.
export function position(timeoutMs = 8000) {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({
        lat: +p.coords.latitude.toFixed(6),
        lon: +p.coords.longitude.toFixed(6),
        accuracy: Math.round(p.coords.accuracy),
        timestamp: new Date(p.timestamp).toISOString(),
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
