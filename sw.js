// Guarda os arquivos do app no aparelho: abre na hora e funciona sem internet (com os dados da última vez).
// Ao publicar uma versão nova, mude VERSAO para os aparelhos baixarem os arquivos novos.
const VERSAO = "agenda-1.4.0";
const ARQUIVOS = [
  "./", "index.html", "app.css", "manifest.webmanifest",
  "js/app.js", "js/google.js", "js/config.js", "js/demo.js", "js/sync.js", "js/metas.js", "js/pet.js", "js/notas.js", "js/foco.js", "pets/pets.json", "pets/ovo.webp",
  "icones/icone-32.png", "icones/icone-192.png", "icones/icone-512.png", "icones/apple-touch-icon.png",
  "icones/icone-mascara-192.png", "icones/icone-mascara-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;   // Google: sempre pela rede
  // rede primeiro (pega a versão nova logo), cache se estiver sem internet
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(e.request, copia)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))));
});
