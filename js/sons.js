// Sons para focar (os mesmos do PC, em sons/*.mp3). Tocam em laço, sem emenda, só enquanto o foco está rodando
// (e no descanso, se a pessoa quiser). Web Audio: o volume funciona também no iPhone, onde <audio>.volume é ignorado.
export const TEMAS = [
  ["tictac", "Tic-tac do relógio", "🕰️"],
  ["branco", "Ruído branco", "🌫️"],
  ["marrom", "Ruído marrom", "🟤"],
  ["chuva_natural", "Chuva suave", "🌧️"],
  ["lofi_janela", "Lo-fi · Janela tranquila", "🪟"],
  ["lofi_noturno", "Lo-fi · Noite calma", "🌙"],
];
const K = "agenda.foco.som";
const ler = () => { try { return { tema: "", volume: 60, descanso: false, ...JSON.parse(localStorage.getItem(K) || "{}") }; } catch { return { tema: "", volume: 60, descanso: false }; } };
let pref = ler();
export const preferencias = () => pref;
export function definir(mud) {
  pref = { ...pref, ...mud };
  try { localStorage.setItem(K, JSON.stringify(pref)); } catch { /* */ }
  if ("volume" in mud && ganho) ganho.gain.setTargetAtTime(nivel(), ctx.currentTime, 0.05);
  aplicar();
}

let ctx = null, ganho = null, fonte = null, temaAtual = null, querTocar = false, carregando = null;
const buffers = {};
const nivel = () => (pref.volume / 100) ** 2;    // curva mais natural para o ouvido

/** Chamar dentro de um toque (iOS só libera o áudio assim). */
export function desbloquear() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      ganho = ctx.createGain(); ganho.gain.value = 0; ganho.connect(ctx.destination);
    }
    if (ctx.state !== "running") ctx.resume();
    // toque silencioso: destrava o áudio no iPhone
    const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start();
  } catch { /* sem áudio */ }
}

async function buffer(tema) {
  if (buffers[tema]) return buffers[tema];
  const r = await fetch(`sons/${tema}.mp3`);
  if (!r.ok) throw new Error("som indisponível");
  const dados = await r.arrayBuffer();
  const b = await new Promise((ok, erro) => ctx.decodeAudioData(dados, ok, erro));
  // alguns navegadores deixam o silêncio que o MP3 põe no começo: pula para o laço não dar "soluço" na emenda
  const c = b.getChannelData(0), max = Math.min(3000, c.length >> 3);
  let i = 0;
  while (i < max && Math.abs(c[i]) < 1e-6) i++;
  b._ini = i / b.sampleRate; b._fim = b.duration;
  buffers[tema] = b;
  return b;
}

function parar(suave = true) {
  if (!fonte) return;
  const f = fonte; fonte = null; temaAtual = null;
  try {
    if (suave) { ganho.gain.setTargetAtTime(0, ctx.currentTime, 0.12); f.stop(ctx.currentTime + 0.6); } else f.stop();
  } catch { /* já parado */ }
}

let estado = { rodando: false, fase: "estudo" };
/** Diz ao player como está a sessão (chamado a cada segundo e depois de cada ação). */
export function atualizar(r) {
  estado = r ? { rodando: r.rodando, fase: r.fase } : { rodando: false, fase: "estudo" };
  aplicar();
}

async function aplicar() {
  querTocar = !!pref.tema && estado.rodando && (estado.fase === "estudo" || pref.descanso);
  if (!ctx) return;                                   // ainda não houve toque: nada a fazer
  if (!querTocar) { parar(); return; }
  if (temaAtual === pref.tema && fonte) return;
  const tema = pref.tema;
  if (carregando === tema) return;
  carregando = tema;
  try {
    const b = await buffer(tema);
    carregando = null;
    if (!querTocar || pref.tema !== tema) return aplicar();
    if (ctx.state !== "running") await ctx.resume().catch(() => {});
    parar(false);
    const s = ctx.createBufferSource();
    s.buffer = b; s.loop = true; s.loopStart = b._ini || 0; s.loopEnd = b._fim || b.duration;
    s.connect(ganho); s.start(0, s.loopStart);
    fonte = s; temaAtual = tema;
    ganho.gain.cancelScheduledValues(ctx.currentTime);
    ganho.gain.setValueAtTime(0, ctx.currentTime);
    ganho.gain.setTargetAtTime(nivel(), ctx.currentTime, 0.3);   // entra devagar
  } catch { carregando = null; }
}
export const tocando = () => !!fonte;

// ao voltar para o app (o iPhone suspende o áudio com a tela bloqueada)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && ctx && querTocar && ctx.state !== "running") ctx.resume().catch(() => {});
});
