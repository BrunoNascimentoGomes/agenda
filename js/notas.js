// Aba Notas: listas para anotar e riscar (estilo Google Keep), as mesmas do PC (notas.py), pelo arquivo do Drive.
import * as S from "./sync.js";

let C;
export function iniciar(ctx) { C = ctx; }

const DIAS_RISCADOS = 7;
const CORES = ["#3D8BF2", "#9A6AF0", "#F2853A", "#16B08A", "#E5484D", "#F5B700", "#14B8C4",
  "#EC4899", "#84CC16", "#8B5CF6", "#64748B", "#A0522D"];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const uid = () => crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(16).padStart(8, "0"), "");
const semUid = (o) => { const { uid: _, ...r } = o; return r; };
const fechados = new Set(), antigosAbertos = new Set();
let focar = null, busca = "";

function dados() {
  const listas = [], itens = {};
  for (const [k, v] of Object.entries(S.todos())) {
    if (k.startsWith("lista:")) listas.push({ uid: k.slice(6), ...v });
    else if (k.startsWith("nota:")) (itens[v.lista] ||= []).push({ uid: k.slice(5), ...v });
  }
  listas.sort((a, b) => (!!b.fixada - !!a.fixada) || (a.criada || 0) - (b.criada || 0));
  for (const l of Object.values(itens)) l.sort((a, b) => (a.criada || 0) - (b.criada || 0));
  return { listas, itens };
}

// ---------------------------------------------------------------- tela
export function tela() {
  const { listas, itens } = dados(), termo = busca.trim().toLowerCase();
  const limite = (() => { const d = new Date(); d.setDate(d.getDate() - DIAS_RISCADOS); return iso(d); })();
  const pendentes = listas.reduce((s, l) => s + (itens[l.uid] || []).filter((i) => !i.feita).length, 0);
  const cartoes = listas.map((l) => {
    let todos = itens[l.uid] || [];
    if (termo && !l.nome.toLowerCase().includes(termo)) {
      todos = todos.filter((i) => i.texto.toLowerCase().includes(termo));
      if (!todos.length) return "";
    }
    const pend = todos.filter((i) => !i.feita);
    const risc = todos.filter((i) => i.feita).sort((a, b) => (b.feita_em || "").localeCompare(a.feita_em || ""));
    const recentes = termo ? risc : risc.filter((i) => (i.feita_em || "9") >= limite);
    const antigos = termo ? [] : risc.filter((i) => (i.feita_em || "9") < limite);
    const fechado = fechados.has(l.uid), verAntigos = antigosAbertos.has(l.uid);
    const linha = (i, feito) => `<div class="nitem ${feito ? "feito" : ""}">
      <button class="ncx" data-acao="nota-riscar" data-id="${esc(i.uid)}" aria-label="${feito ? "Desmarcar" : "Riscar"}">${feito ? "✓" : ""}</button>
      <button class="ntexto" data-acao="nota-editar" data-id="${esc(i.uid)}">${esc(i.texto)}</button></div>`;
    return `<section class="nlista" style="--c:${esc(l.cor || CORES[0])}">
      <div class="ntopo"><b>${esc(l.nome)}</b>${l.fixada ? '<span class="npino">📌</span>' : ""}
        <button class="nmenu" data-acao="lista-menu" data-id="${esc(l.uid)}" aria-label="Opções da lista">⋯</button></div>
      ${pend.map((i) => linha(i, false)).join("")}
      ${recentes.length ? `<button class="nriscados" data-acao="lista-fechar" data-id="${esc(l.uid)}">${recentes.length} riscado${recentes.length === 1 ? "" : "s"} ${fechado ? "▸" : "▾"}</button>
        ${fechado ? "" : recentes.map((i) => linha(i, true)).join("")}` : ""}
      ${antigos.length && !fechado ? `<button class="nantigos" data-acao="lista-antigos" data-id="${esc(l.uid)}">${verAntigos ? "esconder os antigos"
        : `ver ${antigos.length} riscado${antigos.length === 1 ? "" : "s"} antigo${antigos.length === 1 ? "" : "s"}`}</button>
        ${verAntigos ? antigos.map((i) => linha(i, true)).join("") : ""}` : ""}
      <form class="nnovo" data-lista="${esc(l.uid)}"><input name="t" placeholder="＋ item" enterkeyhint="done" autocomplete="off"
        maxlength="500" id="novo-${esc(l.uid)}"></form>
    </section>`;
  }).join("");
  const vazio = !listas.length ? `<div class="vazio">Nenhuma lista ainda.<br>Toque em ＋ para criar a primeira<br>
    (ex.: 🛒 Mercado, 🎓 Faculdade, 💡 Ideias).</div>` : termo && !cartoes ? '<div class="vazio">Nada encontrado.</div>' : "";
  return `
    <p class="nsub">${listas.length} lista${listas.length === 1 ? "" : "s"} · ${pendentes} ${pendentes === 1 ? "item" : "itens"} para fazer</p>
    ${listas.length ? `<input class="nbusca" type="search" placeholder="Buscar nas notas…" value="${esc(busca)}" data-busca="1">` : ""}
    <div class="ngrade">${cartoes}${!termo && listas.length ? '<button class="nlista nova" data-acao="lista-nova">＋ Nova lista</button>' : ""}</div>${vazio}`;
}

/** Depois de desenhar: liga os campos (adicionar item, busca) e devolve o foco. */
export function montado(raiz) {
  raiz.querySelectorAll("form.nnovo").forEach((f) => f.addEventListener("submit", (e) => {
    e.preventDefault();
    const texto = f.t.value.replace(/\s+/g, " ").trim();
    if (!texto) return;
    focar = f.dataset.lista;
    S.alterar({ ["nota:" + uid()]: { lista: f.dataset.lista, texto: texto.slice(0, 500), feita: false, feita_em: null, criada: Date.now() } });
    C.render();
  }));
  const b = raiz.querySelector("[data-busca]");
  if (b) b.addEventListener("input", () => {
    busca = b.value; const pos = b.selectionStart; C.render();
    const nb = document.querySelector("[data-busca]"); nb?.focus(); nb?.setSelectionRange(pos, pos);
  });
  if (focar) { document.getElementById("novo-" + focar)?.focus(); focar = null; }
}

// ---------------------------------------------------------------- ações
export function acao(a, b) {
  const id = b.dataset.id, todos = S.todos();
  if (a === "nota-riscar") {
    const v = todos["nota:" + id]; if (!v) return true;
    const feita = !v.feita;
    S.alterar({ ["nota:" + id]: { ...v, feita, feita_em: feita ? iso(new Date()) : null } });
    if (feita && navigator.vibrate) navigator.vibrate(10);
    C.render(); return true;
  }
  if (a === "nota-editar") { editarItem(id); return true; }
  if (a === "lista-fechar") { fechados.has(id) ? fechados.delete(id) : fechados.add(id); C.render(); return true; }
  if (a === "lista-antigos") { antigosAbertos.has(id) ? antigosAbertos.delete(id) : antigosAbertos.add(id); C.render(); return true; }
  if (a === "lista-menu") { menuLista(id); return true; }
  if (a === "lista-nova") { editorLista(null); return true; }
  return false;
}

function editarItem(id) {
  const v = S.ler1("nota:" + id); if (!v) return;
  C.abrirFolha(`
    <form class="editor"><h2>Editar item</h2>
      <input name="t" class="campo-titulo" value="${esc(v.texto)}" maxlength="500">
      <div class="acoes"><button type="button" class="botao-perigo" data-f="apagar">Apagar</button><span></span>
        <button type="button" class="botao-leve" data-f="cancelar">Cancelar</button>
        <button class="botao-principal">Salvar</button></div></form>`, (p) => {
    const f = p.querySelector("form");
    setTimeout(() => f.t.focus(), 250);
    p.addEventListener("click", (e) => {
      const a = e.target.closest("[data-f]")?.dataset.f;
      if (a === "cancelar") C.fecharFolha();
      if (a === "apagar") { S.alterar({ ["nota:" + id]: null }); C.fecharFolha(); C.render(); }
    });
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const texto = f.t.value.replace(/\s+/g, " ").trim();
      S.alterar({ ["nota:" + id]: texto ? { ...v, texto: texto.slice(0, 500) } : null });
      C.fecharFolha(); C.render();
    });
  });
}

async function menuLista(id) {
  const l = S.ler1("lista:" + id); if (!l) return;
  const riscados = Object.entries(S.todos()).filter(([k, v]) => k.startsWith("nota:") && v.lista === id && v.feita);
  const r = await C.perguntar(l.nome, "O que você quer fazer com esta lista?", [
    ["editar", "Editar nome e cor"], ["fixar", l.fixada ? "Desafixar" : "Fixar no topo"],
    ...(riscados.length ? [["riscados", `Apagar riscados (${riscados.length})`, true]] : []),
    ["apagar", "Apagar lista", true]]);
  if (r === "editar") setTimeout(() => editorLista({ uid: id, ...l }), 220);
  if (r === "fixar") { S.alterar({ ["lista:" + id]: { ...l, fixada: !l.fixada } }); C.render(); }
  if (r === "riscados") { S.alterar(Object.fromEntries(riscados.map(([k]) => [k, null]))); C.render(); }
  if (r === "apagar") {
    const itens = Object.entries(S.todos()).filter(([k, v]) => k.startsWith("nota:") && v.lista === id);
    setTimeout(async () => {
      const ok = await C.perguntar("Apagar lista", `A lista “${l.nome}” e os ${itens.length} itens dela serão apagados aqui e no PC.`,
        [["sim", "Apagar lista", true]]);
      if (ok) { S.alterar({ ["lista:" + id]: null, ...Object.fromEntries(itens.map(([k]) => [k, null])) }); C.render(); C.avisar("Lista apagada."); }
    }, 220);
  }
}

export function editorLista(l) {
  const usadas = new Set(Object.entries(S.todos()).filter(([k]) => k.startsWith("lista:")).map(([, v]) => v.cor));
  let corSel = l?.cor || CORES.find((c) => !usadas.has(c)) || CORES[0];
  C.abrirFolha(`
    <form class="editor"><h2>${l ? "Editar lista" : "Nova lista"}</h2>
      <input name="nome" class="campo-titulo" placeholder="Nome (ex.: 🛒 Mercado)" value="${esc(l?.nome || "")}" maxlength="60">
      <div class="cores">${CORES.map((c) => `<button type="button" class="cor ${c === corSel ? "sel" : ""}" style="background:${c}" data-cor="${c}" aria-label="Cor"></button>`).join("")}</div>
      <div class="acoes"><span></span><button type="button" class="botao-leve" data-f="cancelar">Cancelar</button>
        <button class="botao-principal">${l ? "Salvar" : "Criar lista"}</button></div></form>`, (p) => {
    const f = p.querySelector("form");
    setTimeout(() => f.nome.focus(), 250);
    p.addEventListener("click", (e) => {
      const c = e.target.closest("[data-cor]");
      if (c) { corSel = c.dataset.cor; p.querySelectorAll(".cor").forEach((x) => x.classList.toggle("sel", x === c)); }
      if (e.target.closest("[data-f=cancelar]")) C.fecharFolha();
    });
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const nome = f.nome.value.replace(/\s+/g, " ").trim().slice(0, 60) || "Lista sem nome";
      const id = l?.uid || uid();
      S.alterar({ ["lista:" + id]: l ? { ...semUid(l), nome, cor: corSel } : { nome, cor: corSel, fixada: false, criada: Date.now() } });
      if (!l) focar = id;
      C.fecharFolha(); C.render();
    });
  });
}
