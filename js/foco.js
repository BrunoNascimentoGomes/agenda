// Espaço de Foco no celular: cronômetro livre ou Pomodoro a partir de uma meta (igual ao cronometro.py do PC).
// A sessão fica salva neste aparelho (sobrevive a fechar o app); ao encerrar, o tempo vira registro na meta,
// que sincroniza com o PC.
import * as S from "./sync.js";
import * as M from "./metas.js";
import * as SOM from "./sons.js";

let C;
export function iniciar(ctx) { C = ctx; }

const K_SESSAO = "agenda.foco", K_PREF = "agenda.foco.pref";
const ler = (k, p) => { try { const v = localStorage.getItem(k); return v == null ? p : JSON.parse(v); } catch { return p; } };
const gravar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const PRESETS = [[25, 5], [50, 10], [90, 15]];

export const sessao = () => ler(K_SESSAO, null);
export const preferencias = () => ler(K_PREF, { modo: "livre", estudo: 25, descanso: 5 });
let metaAberta = null;        // meta mostrada na tela de foco (quando não há sessão)

// ---------------------------------------------------------------- cálculo (porta de Cronometro._calcular)
export function calcular(s, agora = Date.now(), limite = null) {
  const estudo = s.estudo * 60, descanso = s.descanso * 60, ciclo = estudo + descanso, livre = s.modo === "livre";
  const acumulado = (t) => livre ? t : Math.floor(t / ciclo) * estudo + Math.min(t % ciclo, estudo);
  const instante = (t) => { if (livre || t <= 0) return t; const c = Math.max(0, Math.ceil(t / estudo) - 1); return c * ciclo + t - c * estudo; };
  let offset = 0, total = 0, ultimo = null;
  const porDia = {};
  for (const [a0, b0] of s.trechos) {
    const a = a0, b = Math.max(a, b0 ?? agora), dur = (b - a) / 1000;
    let cursor = a;
    while (cursor < b) {
      const d = new Date(cursor), meia = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      const fim = Math.min(b, meia);
      const x = offset + (cursor - a) / 1000, y = offset + (fim - a) / 1000;
      let q = acumulado(y) - acumulado(x);
      if (limite !== null) q = Math.min(q, Math.max(0, limite - total));
      if (q > 0) {
        porDia[iso(d)] = (porDia[iso(d)] || 0) + q; total += q;
        ultimo = a + (instante(acumulado(x) + q) - offset) * 1000;
      }
      cursor = fim;
    }
    offset += dur;
  }
  const fase = livre || offset % ciclo < estudo ? "estudo" : "descanso";
  const restante = livre ? null : (fase === "estudo" ? estudo : ciclo) - offset % ciclo;
  return { estudo: total, porDia, ultimo, fase, restante, rodando: s.trechos.at(-1)[1] == null, decorrido: offset,
    ciclo: livre ? 0 : Math.floor(offset / ciclo), titulo: s.titulo, metaUid: s.metaUid, modo: s.modo };
}
export const tempoTxt = (seg) => { const t = Math.max(0, Math.floor(seg)); return `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`; };

// ---------------------------------------------------------------- ações da sessão
function comecar(m) {
  const p = preferencias();
  gravar(K_SESSAO, { token: crypto.getRandomValues(new Uint32Array(2)).join(""), metaUid: m.uid, titulo: m.titulo,
    unidade: m.unidade, modo: p.modo, estudo: p.estudo, descanso: p.descanso, trechos: [[Date.now(), null]] });
  faseAnterior = null; manterTela(true); C.render();
}
function pausar(sim) {
  const s = sessao(); if (!s) return;
  const ult = s.trechos.at(-1), agora = Date.now();
  if (sim && ult[1] == null) ult[1] = Math.max(agora, ult[0]);
  if (!sim && ult[1] != null) s.trechos.push([Math.max(agora, ult[1]), null]);
  gravar(K_SESSAO, s); manterTela(!sim); C.render();
}
function registrar(s, limite = null) {
  const m = M.metas().find((x) => x.uid === s.metaUid);
  if (!m) { C.avisar("A meta foi apagada. O tempo não foi registrado."); return false; }
  const r = calcular(s, Date.now(), limite), mud = {};
  const valores = m.unidade === "horas" ? Object.fromEntries(Object.entries(r.porDia).map(([d, q]) => [d, q / 3600]))
    : r.ultimo ? { [iso(new Date(r.ultimo - 1))]: 1 } : {};
  for (const [d, q] of Object.entries(valores)) {
    const k = `reg:${m.uid}|${d}`;
    mud[k] = Math.round(((Number(S.ler1(k)) || 0) + q) * 10000) / 10000;
  }
  if (Object.keys(mud).length) S.alterar(mud);
  return r;
}
async function encerrar() {
  const s = sessao(); if (!s) return;
  pausar(true);
  const s2 = sessao(), r = calcular(s2), min = Math.round(r.estudo / 60);
  if (r.estudo < 1) {
    const ok = await C.perguntar("Encerrar sessão", "Ainda não houve tempo de estudo. Encerrar sem registrar?", [["sim", "Encerrar", true]]);
    if (ok) { gravar(K_SESSAO, null); manterTela(false); C.render(); }
    return;
  }
  const oQue = s2.unidade === "horas" ? `${tempoTxt(r.estudo)} de estudo` : "1 realização (+1)";
  const op = await C.perguntar("Encerrar e registrar", `${s2.titulo}: registrar ${oQue} na meta?`,
    [["sim", "Registrar"], ...(s2.unidade === "horas" ? [["ajustar", "Ajustar o tempo"]] : []), ["descartar", "Descartar a sessão", true]]);
  if (op === "sim") finalizar(s2);
  if (op === "descartar") { gravar(K_SESSAO, null); manterTela(false); C.render(); C.avisar("Sessão descartada."); }
  if (op === "ajustar") setTimeout(() => ajustar(s2, min), 230);
}
function finalizar(s, limite = null) {
  const r = registrar(s, limite);
  gravar(K_SESSAO, null); manterTela(false);
  metaAberta = s.metaUid;
  if (r) C.avisar(s.unidade === "horas" ? `Registrado: ${tempoTxt(limite ?? r.estudo)} em ${s.titulo} 🎉` : `+1 em ${s.titulo} 🎉`);
  C.render();
}
function ajustar(s, min) {
  C.abrirFolha(`<form class="editor"><h2>Ajustar o tempo</h2><p>Quantos minutos de estudo registrar? (até ${min})</p>
    <input name="m" type="number" inputmode="numeric" min="0" max="${min}" value="${min}" class="campo-titulo">
    <div class="acoes"><span></span><button type="button" class="botao-leve" data-f="c">Cancelar</button>
      <button class="botao-principal">Registrar</button></div></form>`, (p) => {
    const f = p.querySelector("form");
    p.addEventListener("click", (e) => { if (e.target.closest("[data-f=c]")) C.fecharFolha(); });
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = Math.max(0, Math.min(min, Number(f.m.value) || 0));
      C.fecharFolha(); finalizar(s, v * 60);
    });
  });
}

// ---------------------------------------------------------------- tela manter acesa, aviso de troca de fase
let trava = null;
async function manterTela(sim) {
  try {
    if (sim && "wakeLock" in navigator && !trava && local("tela", true)) trava = await navigator.wakeLock.request("screen");
    if (!sim && trava) { await trava.release(); trava = null; }
  } catch { trava = null; }
}
const local = (k, p) => ler("agenda.foco." + k, p);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && sessao() && calcular(sessao()).rodando) { trava = null; manterTela(true); }
});
function bip(duplo) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, duplo ? 0.28 : null].filter((x) => x !== null).forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = duplo ? 660 : 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
    });
  } catch { /* sem som */ }
  if (navigator.vibrate) navigator.vibrate(duplo ? [180, 120, 180] : [250]);
}
let faseAnterior = null;
/** Chamado a cada segundo pela tela principal: atualiza o relógio e avisa a troca de fase. */
export function tique() {
  const s = sessao(); if (!s) { SOM.atualizar(null); return; }
  const r = calcular(s);
  SOM.atualizar(r);
  if (s.modo === "pomodoro" && faseAnterior && r.rodando && faseAnterior !== r.fase) {
    bip(r.fase === "estudo");
    C.avisar(r.fase === "descanso" ? "Hora do descanso ☕" : "De volta ao foco 💪");
  }
  const mudou = faseAnterior && faseAnterior !== r.fase;
  faseAnterior = r.fase;
  if (mudou && !document.activeElement?.matches?.("#conteudo input")) { C.render(); return; }
  const el = document.querySelector("[data-relogio]");
  if (el) atualizarRelogio(r, s);
  const pilula = document.querySelector("[data-pilula]");
  if (pilula) pilula.textContent = textoRelogio(r, s);
}
function textoRelogio(r, s) {
  const seg = s.modo === "pomodoro" ? r.restante : r.estudo, t = tempoTxt(seg);
  return s.modo === "pomodoro" && seg < 3600 ? t.slice(3) : t;
}
function atualizarRelogio(r, s) {
  const el = document.querySelector("[data-relogio]"); if (!el) return;
  el.textContent = textoRelogio(r, s);
  const anel = document.querySelector("[data-anel]");
  if (anel) {
    const tot = s.modo === "pomodoro" ? (r.fase === "estudo" ? s.estudo : s.descanso) * 60 : 3600;
    const f = s.modo === "pomodoro" ? 1 - r.restante / tot : (r.estudo % 3600) / 3600;
    anel.setAttribute("stroke-dasharray", `${f * 754} 754`);
  }
  const tot = document.querySelector("[data-total]"); if (tot) tot.textContent = tempoTxt(r.estudo);
}

// ---------------------------------------------------------------- telas
/** Pílula mostrada nas outras abas enquanto há uma sessão. */
export function pilula(abaAtual) {
  const s = sessao(); if (!s || abaAtual === "foco") return "";
  const r = calcular(s);
  return `<button class="pilula-foco ${r.rodando ? "" : "pausada"}" data-acao="foco-abrir">
    <span>${r.rodando ? (r.fase === "descanso" ? "☕" : "⏱") : "⏸"}</span><b data-pilula>${textoRelogio(r, s)}</b><small>${esc(s.titulo)}</small></button>`;
}

export function abrir(uid) { metaAberta = uid || null; }

function cartaoSons(pomodoro, s) {
  const sp = SOM.preferencias();
  return `<section class="cartao sons-foco"><h3>🎧 Sons para focar</h3>
    <div class="sons-grade">
      <button class="${sp.tema ? "" : "sel"}" data-acao="foco-som" data-v=""><span>🔇</span>Sem som</button>
      ${SOM.TEMAS.map(([id, nome, ic]) => `<button class="${sp.tema === id ? "sel" : ""}" data-acao="foco-som" data-v="${id}"><span>${ic}</span>${esc(nome)}</button>`).join("")}
    </div>
    ${sp.tema ? `<label class="volume"><span>🔈</span><input type="range" min="0" max="100" step="1" value="${sp.volume}" data-som-volume aria-label="Volume"><span>🔊</span></label>
    ${pomodoro ? `<label class="alternar"><span>Tocar também no descanso</span>
      <input type="checkbox" data-acao="foco-som-descanso" ${sp.descanso ? "checked" : ""}><i></i></label>` : ""}
    <p class="nota">${s ? "O som toca enquanto o foco está contando e para quando você pausa." : "Começa a tocar quando você iniciar o foco."}</p>` : ""}
  </section>`;
}

export function tela() {
  const s = sessao(), p = preferencias();
  SOM.atualizar(s ? calcular(s) : null);
  const uid = s ? s.metaUid : metaAberta, m = M.metas().find((x) => x.uid === uid);
  if (!m && !s) return `<div class="vazio">Escolha uma meta na aba Metas e toque em ▶ Focar.</div>`;
  const cor = m ? C.corCat(m.categoria) : "var(--dest)";
  const modo = s ? s.modo : p.modo, pomodoro = modo === "pomodoro";
  const r = s ? calcular(s) : null;
  const estudoMin = s ? s.estudo : p.estudo, descMin = s ? s.descanso : p.descanso;
  let fase, legenda, relogio, fracao, corAnel = cor;
  if (r) {
    const desc = r.fase === "descanso";
    fase = (desc ? "DESCANSO" : "CONCENTRAÇÃO");
    if (!r.rodando) fase = "PAUSADO · " + fase;
    legenda = desc ? "para recarregar" : pomodoro ? "restantes neste ciclo" : "de concentração";
    relogio = textoRelogio(r, s);
    const tot = pomodoro ? (desc ? descMin : estudoMin) * 60 : 3600;
    fracao = pomodoro ? 1 - r.restante / tot : (r.estudo % 3600) / 3600;
    if (desc) corAnel = "#16B08A";
  } else {
    fase = "PRONTO PARA COMEÇAR"; legenda = pomodoro ? "de estudo por ciclo" : "seu tempo começa aqui";
    relogio = pomodoro ? `${pad(estudoMin)}:00` : "00:00:00"; fracao = 0;
  }
  const ciclos = r && pomodoro ? `<div class="foco-ciclos"><div><small>CICLO ATUAL</small><b>${r.ciclo + 1}</b></div>
    <div><small>CONCLUÍDOS</small><b>${r.ciclo}</b></div></div>` : "";
  return `
    <div class="foco-topo"><button class="botao-leve" data-acao="foco-voltar">‹ Metas</button>
      <span class="suave">${s ? "Sessão salva neste aparelho" : "Seu tempo fica salvo"}</span></div>
    <h2 class="foco-titulo">${esc(m ? m.titulo : s.titulo)}</h2>
    ${m ? `<p class="foco-sub">${esc(m.categoria)} · Meta de ${M.num(m.quantidade)} ${m.unidade === "horas" ? "h" : m.quantidade === 1 ? "vez" : "vezes"} ${m.periodo === "diaria" ? "por dia" : "por semana"}</p>` : ""}
    <div class="segmentado ${s ? "travado" : ""}">
      <button class="${pomodoro ? "" : "ativa"}" data-acao="foco-modo" data-v="livre" ${s ? "disabled" : ""}>Cronômetro livre</button>
      <button class="${pomodoro ? "ativa" : ""}" data-acao="foco-modo" data-v="pomodoro" ${s ? "disabled" : ""}>Pomodoro</button></div>
    <div class="foco-relogio" style="--c:${corAnel}">
      <svg viewBox="0 0 260 260"><circle cx="130" cy="130" r="120" fill="none" stroke="var(--borda)" stroke-width="10"/>
        <circle data-anel cx="130" cy="130" r="120" fill="none" stroke="${corAnel}" stroke-width="10" stroke-linecap="round"
          stroke-dasharray="${fracao * 754} 754" transform="rotate(-90 130 130)"/></svg>
      <div><small class="fase" style="color:${corAnel}">${fase}</small><b data-relogio>${relogio}</b><small>${legenda}</small></div>
    </div>
    ${ciclos}
    ${r ? `<p class="foco-total">Estudo nesta sessão · <b data-total>${tempoTxt(r.estudo)}</b></p>` : ""}
    <div class="foco-botoes">
      ${!s ? `<button class="botao-principal grande" data-acao="foco-iniciar">▶ Iniciar foco</button>`
      : `<button class="botao-principal grande" data-acao="foco-pausar">${r.rodando ? "Pausar" : "▶ Continuar foco"}</button>
         <button class="botao-leve grande" data-acao="foco-encerrar">Encerrar e registrar</button>`}
    </div>
    ${cartaoSons(pomodoro, s)}
    ${s ? `<p class="nota centro">Pode usar o resto do app: a sessão continua${pomodoro ? ". O celular vibra na troca de fase (com o app aberto)" : ""}.</p>` : ""}
    ${!s && pomodoro ? `<section class="cartao"><h3>Seu ritmo</h3>
      <div class="presets">${PRESETS.map(([a, b]) => `<button class="${a === p.estudo && b === p.descanso ? "sel" : ""}" data-acao="foco-preset" data-a="${a}" data-b="${b}">${a} / ${b}</button>`).join("")}</div>
      <div class="grade-datas"><label>Estudo (min)<input type="number" min="1" max="1440" value="${p.estudo}" data-foco-campo="estudo"></label>
        <label>Descanso (min)<input type="number" min="1" max="1440" value="${p.descanso}" data-foco-campo="descanso"></label></div>
      <p class="nota">Alterne concentração e descanso. Só o estudo conta para a meta.</p></section>` : ""}
    ${!s ? `<p class="nota centro">${m && m.unidade === "horas" ? "Ao encerrar, o tempo de estudo é somado na meta." : "Ao encerrar com estudo, uma realização (+1) é registrada na meta."}</p>` : ""}
    ${s && m && s.metaUid !== metaAberta && metaAberta ? "" : ""}`;
}

export function montado(raiz) {
  const vol = raiz.querySelector("[data-som-volume]");
  if (vol) vol.addEventListener("input", () => SOM.definir({ volume: Number(vol.value) }));
  raiz.querySelectorAll("[data-foco-campo]").forEach((i) => i.addEventListener("change", () => {
    const p = preferencias(), v = Math.round(Number(i.value));
    if (!(v >= 1 && v <= 1440)) { C.avisar("Use minutos entre 1 e 1440."); i.value = p[i.dataset.focoCampo]; return; }
    gravar(K_PREF, { ...p, [i.dataset.focoCampo]: v }); C.render();
  }));
}

// o iPhone só libera o áudio depois de um toque: se a sessão já vinha rodando, o primeiro toque destrava o som
document.addEventListener("pointerdown", () => { if (sessao() && SOM.preferencias().tema) SOM.desbloquear(); }, { capture: true });

export async function acao(a, b, E) {
  if (a.startsWith("foco-")) SOM.desbloquear();
  if (a === "foco-som") { SOM.definir({ tema: b.dataset.v }); C.render(); return true; }
  if (a === "foco-som-descanso") { SOM.definir({ descanso: b.checked }); return true; }
  if (a === "foco-abrir") { E.aba = "foco"; C.render(); return true; }
  if (a === "foco-voltar") { E.aba = "metas"; C.render(); return true; }
  if (a === "foco-modo") { gravar(K_PREF, { ...preferencias(), modo: b.dataset.v }); C.render(); return true; }
  if (a === "foco-preset") { gravar(K_PREF, { ...preferencias(), estudo: +b.dataset.a, descanso: +b.dataset.b }); C.render(); return true; }
  if (a === "foco-iniciar") {
    const m = M.metas().find((x) => x.uid === metaAberta); if (!m) return true;
    comecar(m); return true;
  }
  if (a === "foco-pausar") { const s = sessao(); if (s) pausar(calcular(s).rodando); return true; }
  if (a === "foco-encerrar") { encerrar(); return true; }
  if (a === "meta-focar") {
    const s = sessao();
    if (s && s.metaUid !== b.dataset.uid) {
      const ok = await C.perguntar("Sessão em andamento", `Você está focando em “${s.titulo}”. Encerrar e registrar antes de começar outra?`,
        [["ver", "Ver a sessão atual"], ["sim", "Registrar e trocar"]]);
      if (ok === "ver") { E.aba = "foco"; C.render(); }
      if (ok === "sim") { const s2 = sessao(); pausar(true); finalizar(sessao() || s2); metaAberta = b.dataset.uid; E.aba = "foco"; C.render(); }
      return true;
    }
    metaAberta = b.dataset.uid; E.aba = "foco"; C.render(); return true;
  }
  return false;
}
