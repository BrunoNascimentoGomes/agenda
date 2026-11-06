// Agenda no celular: calendário (Google Agenda) e tarefas (Google Tasks).
import { VERSAO } from "./config.js";

const DEMO = new URLSearchParams(location.search).has("demo");
const G = DEMO ? await import("./demo.js") : await import("./google.js");
import * as S from "./sync.js";
import * as M from "./metas.js";
import * as PET from "./pet.js";
import * as N from "./notas.js";
import * as F from "./foco.js";

// ---------------------------------------------------------------- datas
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro",
  "outubro", "novembro", "dezembro"];
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DIAS_LETRA = ["S", "T", "Q", "Q", "S", "S", "D"];
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deIso = (s) => { const [a, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(a, m - 1, d); };
const mais = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const zerar = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const inicioSemana = (d) => mais(zerar(d), -((d.getDay() + 6) % 7));
const hora = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const hoje = () => zerar(new Date());
const FUSO = Intl.DateTimeFormat().resolvedOptions().timeZone;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function rotuloDia(d) {
  const h = hoje(), dif = Math.round((zerar(d) - h) / 864e5);
  const base = `${d.getDate()} de ${MESES[d.getMonth()]}`;
  if (dif === 0) return `Hoje, ${base}`;
  if (dif === 1) return `Amanhã, ${base}`;
  if (dif === -1) return `Ontem, ${base}`;
  return `${DIAS[d.getDay()]}, ${base}`;
}

// ---------------------------------------------------------------- categorias (as mesmas do app do PC)
const CATS_PADRAO = { Pessoal: "#3D8BF2", Estudos: "#9A6AF0", Trabalho: "#F2853A", Compromisso: "#16B08A" };
const COR_DA_CAT = { Pessoal: "9", Estudos: "3", Trabalho: "6", Compromisso: "10" };
const CAT_DA_COR = { 9: "Pessoal", 7: "Pessoal", 1: "Pessoal", 3: "Estudos", 6: "Trabalho", 5: "Trabalho",
  11: "Trabalho", 4: "Trabalho", 10: "Compromisso", 2: "Compromisso", 8: "Compromisso" };
const CORES_GOOGLE = { 1: "#7986CB", 2: "#33B679", 3: "#8E24AA", 4: "#E67C73", 5: "#F6BF26", 6: "#F4511E",
  7: "#039BE5", 8: "#616161", 9: "#3F51B5", 10: "#0B8043", 11: "#D50000" };

const local = {
  ler(k, padrao) { try { const v = localStorage.getItem(k); return v == null ? padrao : JSON.parse(v); } catch { return padrao; } },
  gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* cheio ou bloqueado */ } },
};
const CATS = { ...CATS_PADRAO, ...local.ler("agenda.categorias", {}) };
function categoriasDoPC() {                       // categorias criadas/renomeadas no PC (vêm pela sincronização)
  const lista = S.ler1("config:categorias");
  if (!Array.isArray(lista) || !lista.length) return;
  for (const k of Object.keys(CATS)) delete CATS[k];
  for (const c of lista) if (c?.nome) CATS[c.nome] = c.cor || "#64748B";
}

function lembrarCategoria(nome, colorId) {
  if (!nome || nome in CATS) return;
  CATS[nome] = CORES_GOOGLE[colorId] || "#64748B";
  const extras = Object.fromEntries(Object.entries(CATS).filter(([n]) => !(n in CATS_PADRAO)));
  local.gravar("agenda.categorias", extras);
}
function corGoogle(cat) {
  if (COR_DA_CAT[cat]) return COR_DA_CAT[cat];
  const c = CATS[cat]; if (!c) return "10";
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = rgb(c);
  return Object.entries(CORES_GOOGLE).sort(([, x], [, y]) =>
    rgb(x).reduce((s, v, i) => s + (v - a[i]) ** 2, 0) - rgb(y).reduce((s, v, i) => s + (v - a[i]) ** 2, 0))[0][0];
}
const corCat = (cat) => CATS[cat] || "#64748B";

// ---------------------------------------------------------------- itens do Google -> app
function deEvento(it) {
  const priv = it.extendedProperties?.private || {};
  let cat = priv.categoria_agenda;
  if (cat) lembrarCategoria(cat, it.colorId);
  else cat = CAT_DA_COR[it.colorId || ""] || "Compromisso";
  const diaInteiro = !!it.start?.date;
  return {
    tipo: "evento", id: it.id, serie: it.recurringEventId || null, titulo: it.summary || "(sem título)",
    notas: it.description || "", local: it.location || "", categoria: cat, diaInteiro,
    ini: diaInteiro ? deIso(it.start.date) : new Date(it.start.dateTime),
    fim: diaInteiro ? deIso(it.end.date) : new Date(it.end.dateTime),
    registro: priv.registro_meta === "1", bruto: it,
  };
}
function deTarefa(t) {
  return { tipo: "tarefa", id: t.id, lista: t._lista, nomeLista: t._nomeLista || "", titulo: t.title || "(sem título)",
    notas: t.notes || "", data: t.due ? deIso(t.due) : null, feita: t.status === "completed" };
}

// ---------------------------------------------------------------- estado
const E = {
  aba: local.ler("agenda.aba", "agenda"), dia: hoje(), semanas: {}, tarefas: null, listas: [], semanaMetas: inicioSemana(hoje()),
  carregando: 0, precisaEntrar: false, verFeitas: false, instalar: null,
};
for (const [k, v] of Object.entries(local.ler("agenda.cache.semanas", {}))) E.semanas[k] = v;
const tCache = local.ler("agenda.cache.tarefas", null);
if (tCache) { E.tarefas = tCache.tarefas; E.listas = tCache.listas; }

function salvarCache() {
  const chaves = Object.keys(E.semanas).sort().slice(-8);                 // guarda só as últimas 8 semanas
  local.gravar("agenda.cache.semanas", Object.fromEntries(chaves.map((k) => [k, E.semanas[k]])));
  if (E.tarefas) local.gravar("agenda.cache.tarefas", { tarefas: E.tarefas, listas: E.listas });
}

// ---------------------------------------------------------------- carregar do Google
async function tentar(fn) {
  try { return await fn(); }
  catch (e) {
    if (e instanceof G.PrecisaEntrar || e?.name === "PrecisaEntrar") { E.precisaEntrar = true; render(); }
    else avisar(e.message || "Algo deu errado.");
    throw e;
  }
}
async function carregarSemana(seg, forcar = false) {
  const k = iso(seg), c = E.semanas[k];
  if (!forcar && c && Date.now() - c.t < 120_000) return;
  E.carregando++; render();
  try {
    const itens = await tentar(() => G.listarEventos(seg, mais(seg, 7)));
    E.semanas[k] = { t: Date.now(), itens };
    salvarCache();
  } catch { /* aviso já mostrado */ } finally { E.carregando--; render(); }
}
async function carregarTarefas(forcar = false) {
  if (!forcar && E.tarefas && Date.now() - (E._tTarefas || 0) < 120_000) return;
  E.carregando++; render();
  try {
    const { listas, tarefas } = await tentar(() => G.listarTarefas());
    E.listas = listas; E.tarefas = tarefas; E._tTarefas = Date.now();
    salvarCache();
  } catch { /* aviso já mostrado */ } finally { E.carregando--; render(); }
}
function atualizarTudo(forcar = true) {
  if (!G.tokenValido()) return;
  carregarSemana(inicioSemana(E.dia), forcar);
  carregarTarefas(forcar);
}

// ---------------------------------------------------------------- consultas
function itensDoDia(d) {
  const k = iso(inicioSemana(d)), sem = E.semanas[k]?.itens || [];
  const ini = zerar(d), fim = mais(ini, 1);
  const evs = sem.map(deEvento).filter((e) => e.ini < fim && e.fim > ini);
  const tarefas = (E.tarefas || []).map(deTarefa).filter((t) => t.data && iso(t.data) === iso(d));
  return {
    diaTodo: evs.filter((e) => e.diaInteiro),
    comHora: evs.filter((e) => !e.diaInteiro).sort((a, b) => a.ini - b.ini),
    tarefas,
  };
}
const chaveFeito = (e, d) => `feito:g:${e.serie || e.id}|${iso(d)}`;

function agrupar(itens) {
  const grupos = new Map();
  for (const e of itens) {
    const k = e.titulo.trim().toLowerCase() + "|" + e.categoria;
    if (grupos.has(k)) grupos.get(k).n++;
    else grupos.set(k, { e, n: 1 });
  }
  return [...grupos.values()];
}

// ---------------------------------------------------------------- tema
function aplicarTema() {
  const tema = local.ler("agenda.tema", "auto"), cor = local.ler("agenda.cor", "#5B5BD6");
  document.documentElement.dataset.tema = tema;
  document.documentElement.style.setProperty("--dest", cor);
  const escuro = tema === "escuro" || (tema === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", escuro ? "#0F1015" : "#F3F4F8");
}
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", aplicarTema);
const CORES_APP = { Roxo: "#5B5BD6", Azul: "#2563EB", Turquesa: "#0D9488", Verde: "#16A34A",
  Laranja: "#EA580C", Rosa: "#DB2777", Vermelho: "#DC2626", Grafite: "#475569" };

// ---------------------------------------------------------------- aviso rápido
let tAviso;
function avisar(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("ver");
  clearTimeout(tAviso); tAviso = setTimeout(() => t.classList.remove("ver"), 3500);
}

// ---------------------------------------------------------------- telas
const $conteudo = () => document.getElementById("conteudo");

function render() {
  const app = document.getElementById("app");
  const entrou = G.conectou();
  app.classList.toggle("sem-conta", !entrou);
  document.getElementById("topo").innerHTML = entrou ? topo() : "";
  document.getElementById("faixa").innerHTML = E.precisaEntrar && entrou && !DEMO ? `
    <div class="faixa">A conexão com o Google expirou.
      <button data-acao="reconectar">Reconectar</button></div>` : "";
  const abaNav = E.aba === "foco" ? "metas" : E.aba;
  document.querySelectorAll(".abas button").forEach((b) => b.classList.toggle("ativa", b.dataset.aba === abaNav));
  document.getElementById("fab").hidden = !entrou || E.aba === "ajustes" || E.aba === "foco";
  if (!entrou) { $conteudo().innerHTML = telaEntrar(); return; }
  $conteudo().innerHTML = F.pilula(E.aba) + (E.aba === "tarefas" ? telaTarefas() : E.aba === "ajustes" ? telaAjustes()
    : E.aba === "metas" ? PET.cartao(E) + M.tela(E) : E.aba === "notas" ? N.tela() : E.aba === "foco" ? F.tela() : telaAgenda());
  if (E.aba === "notas") N.montado($conteudo());
  if (E.aba === "foco") F.montado($conteudo());
}

function topo() {
  const d = E.dia;
  const titulo = E.aba === "agenda" ? `${MESES[d.getMonth()][0].toUpperCase() + MESES[d.getMonth()].slice(1)} ${d.getFullYear()}`
    : E.aba === "tarefas" ? "Tarefas" : E.aba === "metas" ? "Metas" : E.aba === "notas" ? "Notas" : E.aba === "foco" ? "Foco" : "Ajustes";
  return `
    <h1>${titulo}</h1>
    ${DEMO ? '<span class="selo">demonstração</span>' : ""}
    <div class="acoes-topo">
      ${E.aba === "agenda" && iso(E.dia) !== iso(hoje()) ? '<button class="botao-leve" data-acao="hoje">Hoje</button>' : ""}
      ${E.aba !== "ajustes" && E.aba !== "foco" ? `<button class="icone ${E.carregando || (E.aba === "metas" && S.estado.ocupado) ? "girando" : ""}" data-acao="atualizar" aria-label="Atualizar">⟳</button>` : ""}
    </div>`;
}

function telaEntrar() {
  const pronto = G.configurado();
  return `
    <div class="entrar">
      <img src="icones/icone-192.png" alt="" width="96" height="96">
      <h1>Agenda</h1>
      <p>Seu calendário e suas tarefas do Google, do jeito do app do computador.</p>
      ${pronto ? '<button class="botao-principal" data-acao="entrar">Entrar com o Google</button>'
    : '<p class="aviso">Falta configurar o ID do cliente do Google neste app.</p>'}
      <a class="link" href="?demo">Ver uma demonstração</a>
      ${cartaoInstalar(true)}
    </div>`;
}

const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Como instalar: botão (Android/Chrome) ou o passo a passo (iPhone ou quando o Chrome não oferece o botão). */
function cartaoInstalar(sempre = false) {
  if (instalado() || DEMO) return "";
  if (!sempre && local.ler("agenda.instalar.fechado", false)) return "";
  const ios = ehIOS();
  const naoSafari = ios && /crios|fxios|edgios/i.test(navigator.userAgent);
  const corpo = E.instalar
    ? '<button class="botao-principal" data-acao="instalar">Instalar a Agenda</button>'
    : ios ? (naoSafari ? "<p>No iPhone, abra este link no <b>Safari</b> para instalar.</p>"
      : "<p>Toque em <b>Compartilhar</b> <span class=\"ic\">□↑</span> na barra do Safari e depois em <b>Adicionar à Tela de Início</b>.</p>")
      : "<p>No Chrome, toque no menu <b>⋮</b> (canto de cima) e depois em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</p>";
  return `<section class="cartao instalar">
    ${sempre ? "" : '<button class="fechar" data-acao="fechar-instalar" aria-label="Fechar">✕</button>'}
    <h3>📲 Instale no celular</h3>${corpo}</section>`;
}

function chipsDiaTodo(itens, tarefas) {
  const html = agrupar(itens).map(({ e, n }) => `
    <button class="chip ${e.registro ? "registro" : ""}" style="--c:${corCat(e.categoria)}" data-acao="evento" data-id="${esc(e.id)}">
      <span class="barra"></span>${esc(e.titulo)}${n > 1 ? ` <b>×${n}</b>` : ""}
    </button>`).join("");
  const ts = tarefas.map((t) => `
    <div class="tarefa ${t.feita ? "feita" : ""}">
      <button class="check" data-acao="marcar" data-id="${esc(t.id)}" aria-label="${t.feita ? "Desmarcar" : "Concluir"}">${t.feita ? "✓" : ""}</button>
      <button class="texto" data-acao="tarefa" data-id="${esc(t.id)}">${esc(t.titulo)}</button>
    </div>`).join("");
  return html || ts ? `<div class="dia-todo">${html}</div>${ts ? `<div class="tarefas-dia">${ts}</div>` : ""}` : "";
}

function telaAgenda() {
  const seg = inicioSemana(E.dia), h = iso(hoje());
  const dias = [...Array(7)].map((_, i) => mais(seg, i)).map((d) => {
    const it = itensDoDia(d);
    const cores = [...new Set([...it.diaTodo, ...it.comHora].map((e) => corCat(e.categoria)))].slice(0, 3);
    if (it.tarefas.some((t) => !t.feita) && cores.length < 3) cores.push("var(--suave)");
    return `<button class="dia ${iso(d) === iso(E.dia) ? "sel" : ""} ${iso(d) === h ? "hoje" : ""}" data-acao="dia" data-dia="${iso(d)}">
      <span class="letra">${DIAS_LETRA[i(d)]}</span><span class="num">${d.getDate()}</span>
      <span class="pontos">${cores.map((c) => `<i style="background:${c}"></i>`).join("")}</span></button>`;
  }).join("");
  const it = itensDoDia(E.dia);
  const carregado = !!E.semanas[iso(seg)];
  const cartoes = it.comHora.map((e) => {
    const multi = iso(e.ini) !== iso(e.fim) && !(e.fim - zerar(e.fim) === 0 && iso(mais(e.fim, -1)) === iso(e.ini));
    const ini = iso(e.ini) < iso(E.dia) ? "…" : hora(e.ini), fim = multi && iso(e.fim) > iso(E.dia) ? "…" : hora(e.fim);
    const passou = e.fim < new Date(), feito = S.ler1(chaveFeito(e, E.dia)) !== undefined;
    return `<li><button class="evento ${passou ? "passou" : ""} ${feito ? "feito" : ""}" style="--c:${corCat(e.categoria)}" data-acao="evento" data-id="${esc(e.id)}">
      <span class="horas"><b>${ini}</b><small>${fim}</small></span>
      <span class="corpo"><b>${feito ? "✓ " : ""}${esc(e.titulo)}</b>${e.local || e.notas ? `<small>${esc((e.local || e.notas).split("\n")[0])}</small>` : ""}</span>
      ${e.serie ? '<span class="repete" title="Repete">↻</span>' : ""}
    </button></li>`;
  }).join("");
  const vazio = !it.comHora.length && !it.diaTodo.length && !it.tarefas.length;
  return `
    ${cartaoInstalar()}
    <section class="semana" data-gesto="semana">
      <button class="seta" data-acao="semana" data-passo="-1" aria-label="Semana anterior">‹</button>
      <div class="dias">${dias}</div>
      <button class="seta" data-acao="semana" data-passo="1" aria-label="Próxima semana">›</button>
    </section>
    <section class="dia-aberto" data-gesto="dia">
      <h2>${rotuloDia(E.dia)}</h2>
      ${chipsDiaTodo(it.diaTodo, it.tarefas)}
      ${cartoes ? `<ol class="eventos">${cartoes}</ol>` : ""}
      ${vazio ? `<div class="vazio">${carregado || !G.tokenValido() ? "Nada marcado para este dia.<br>Toque em ＋ para criar." : "Carregando…"}</div>` : ""}
    </section>`;
}
const i = (d) => (d.getDay() + 6) % 7;

function telaTarefas() {
  if (!E.tarefas) return `<div class="vazio">${E.carregando ? "Carregando suas tarefas…" : "Sem tarefas carregadas."}</div>`;
  const todas = E.tarefas.map(deTarefa).filter((t) => t.feita === E.verFeitas);
  const h = hoje(), am = mais(h, 1), semana = mais(h, 7);
  const grupos = E.verFeitas ? [["Concluídas", todas]] : [
    ["Atrasadas", todas.filter((t) => t.data && t.data < h)],
    ["Hoje", todas.filter((t) => t.data && iso(t.data) === iso(h))],
    ["Amanhã", todas.filter((t) => t.data && iso(t.data) === iso(am))],
    ["Próximos 7 dias", todas.filter((t) => t.data && t.data > am && t.data <= semana)],
    ["Mais pra frente", todas.filter((t) => t.data && t.data > semana)],
    ["Sem data", todas.filter((t) => !t.data)],
  ];
  const linhas = grupos.filter(([, l]) => l.length).map(([titulo, lista]) => `
    <h3 class="${titulo === "Atrasadas" ? "atraso" : ""}">${titulo} <small>${lista.length}</small></h3>
    <ul class="lista-tarefas">${lista.sort((a, b) => (a.data || 0) - (b.data || 0)).map((t) => `
      <li class="tarefa ${t.feita ? "feita" : ""}">
        <button class="check" data-acao="marcar" data-id="${esc(t.id)}" aria-label="${t.feita ? "Desmarcar" : "Concluir"}">${t.feita ? "✓" : ""}</button>
        <button class="texto" data-acao="tarefa" data-id="${esc(t.id)}">
          <b>${esc(t.titulo)}</b>
          ${t.data || t.notas ? `<small>${t.data ? rotuloDia(t.data) : ""}${t.data && t.notas ? " · " : ""}${esc(t.notas.split("\n")[0])}</small>` : ""}
        </button></li>`).join("")}</ul>`).join("");
  return `
    <div class="segmentado">
      <button class="${E.verFeitas ? "" : "ativa"}" data-acao="ver-feitas" data-valor="0">Pendentes</button>
      <button class="${E.verFeitas ? "ativa" : ""}" data-acao="ver-feitas" data-valor="1">Concluídas</button>
    </div>
    ${linhas || `<div class="vazio">${E.verFeitas ? "Nenhuma tarefa concluída." : "Tudo em dia! 🎉<br>Toque em ＋ para criar uma tarefa."}</div>`}`;
}

function telaAjustes() {
  const s = G.sessao(), tema = local.ler("agenda.tema", "auto"), cor = local.ler("agenda.cor", "#5B5BD6");
  return `
    <section class="cartao">
      <h3>Conta Google</h3>
      <div class="conta">
        ${s.foto ? `<img src="${esc(s.foto)}" alt="" referrerpolicy="no-referrer">` : '<span class="avatar">●</span>'}
        <div><b>${esc(s.nome || "Conectado")}</b><small>${esc(G.email())}</small></div>
      </div>
      <div class="linha-botoes">
        <button class="botao-leve" data-acao="trocar-conta">Trocar de conta</button>
        <button class="botao-leve perigo" data-acao="sair">Sair</button>
      </div>
    </section>
    <section class="cartao">
      <h3>Aparência</h3>
      <div class="segmentado">
        ${[["auto", "Automático"], ["claro", "Claro"], ["escuro", "Escuro"]].map(([v, n]) =>
    `<button class="${tema === v ? "ativa" : ""}" data-acao="tema" data-valor="${v}">${n}</button>`).join("")}
      </div>
      <div class="cores">${Object.entries(CORES_APP).map(([n, c]) =>
    `<button class="cor ${c === cor ? "sel" : ""}" style="background:${c}" data-acao="cor" data-valor="${c}" aria-label="${n}"></button>`).join("")}</div>
    </section>
    ${cartaoInstalar(true)}
    <section class="cartao">
      <h3>Sobre</h3>
      <p>As tarefas e eventos ficam na sua conta Google, os mesmos do app do computador. As metas ficam em sincronia com o app do computador. Em breve: foco e cronômetro também aqui.</p>
      <p class="suave">Versão ${VERSAO}${DEMO ? " · demonstração" : ""}</p>
      ${DEMO ? '<button class="botao-leve" data-acao="sair-demo">Sair da demonstração</button>' : ""}
    </section>`;
}

// ---------------------------------------------------------------- folhas (editar/criar)
let geracaoFolha = 0;
function abrirFolha(html, aoMontar) {
  geracaoFolha++;
  const f = document.getElementById("folha");
  f.innerHTML = `<div class="fundo" data-acao="fechar-folha"></div><div class="painel" role="dialog" aria-modal="true">
    <div class="alca"></div>${html}</div>`;
  f.hidden = false;
  requestAnimationFrame(() => f.classList.add("aberta"));
  aoMontar?.(f.querySelector(".painel"));
}
function fecharFolha() {
  const f = document.getElementById("folha");
  f.classList.remove("aberta");
  const g = geracaoFolha;
  setTimeout(() => { if (g === geracaoFolha) { f.hidden = true; f.innerHTML = ""; } }, 200);
}
function perguntar(titulo, texto, opcoes) {
  return new Promise((ok) => {
    abrirFolha(`<h2>${esc(titulo)}</h2><p>${esc(texto)}</p><div class="opcoes">${opcoes.map(([v, n, perigo]) =>
      `<button class="${perigo ? "botao-perigo" : "botao-leve"}" data-resp="${v}">${esc(n)}</button>`).join("")}
      <button class="botao-leve" data-resp="">Cancelar</button></div>`, (p) => {
      p.addEventListener("click", (e) => {
        const b = e.target.closest("[data-resp]");
        if (b) { fecharFolha(); ok(b.dataset.resp || null); }
      });
    });
  });
}

function chipsCategoria(atual) {
  return `<div class="chips-cat">${Object.keys(CATS).map((n) =>
    `<button type="button" class="chip-cat ${n === atual ? "sel" : ""}" style="--c:${corCat(n)}" data-cat="${esc(n)}">${esc(n)}</button>`).join("")}</div>`;
}

function editorEvento(ev, dia) {
  const novo = !ev;
  const ini = ev ? ev.ini : (() => { const d = new Date(dia); const agora = new Date();
    d.setHours(iso(dia) === iso(hoje()) ? Math.min(agora.getHours() + 1, 23) : 9, 0, 0, 0); return d; })();
  const fim = ev ? ev.fim : new Date(ini.getTime() + 3600_000);
  const diaInteiro = ev ? ev.diaInteiro : false;
  const cat = ev ? ev.categoria : "Pessoal";
  abrirFolha(`
    <form class="editor" novalidate>
      <h2>${novo ? "Novo evento" : ev.registro ? "Registro de meta" : "Editar evento"}</h2>
      ${ev?.registro ? '<p class="nota">Registrado pela meta no app do computador.</p>' : ""}
      <input name="titulo" class="campo-titulo" placeholder="Título" value="${esc(ev?.titulo || "")}" maxlength="200" required>
      ${chipsCategoria(cat)}
      <label class="alternar"><span>Dia inteiro</span><input type="checkbox" name="diaInteiro" ${diaInteiro ? "checked" : ""}><i></i></label>
      <div class="grade-datas">
        <label>Data<input type="date" name="data" value="${iso(ini)}" required></label>
        <label class="so-hora">Início<input type="time" name="inicio" value="${hora(ini)}"></label>
        <label class="so-hora">Fim<input type="time" name="fim" value="${hora(fim)}"></label>
      </div>
      ${novo ? `<label class="campo">Repetir<select name="repetir">
        <option value="">Não repete</option><option value="RRULE:FREQ=DAILY">Todo dia</option>
        <option value="RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR">Dias úteis (seg a sex)</option>
        <option value="RRULE:FREQ=WEEKLY">Toda semana</option></select></label>` : ""}
      ${ev?.serie ? '<p class="nota">↻ Evento que se repete: as mudanças valem só para este dia.</p>' : ""}
      ${novo || ev.registro ? "" : `<label class="alternar"><span>✓ Feito ${iso(dia) === iso(hoje()) ? "hoje" : "neste dia"}
        <small class="suave">conta nas metas, como no PC</small></span>
        <input type="checkbox" name="feito" ${S.ler1(chaveFeito(ev, dia)) !== undefined ? "checked" : ""}><i></i></label>`}
      <label class="campo">Notas<textarea name="notas" rows="3" placeholder="Opcional">${esc(ev?.notas || "")}</textarea></label>
      <div class="acoes">
        ${novo ? "" : '<button type="button" class="botao-perigo" data-acao-f="apagar">Apagar</button>'}
        <span></span>
        <button type="button" class="botao-leve" data-acao-f="cancelar">Cancelar</button>
        <button type="submit" class="botao-principal">Salvar</button>
      </div>
    </form>`, (p) => {
    const f = p.querySelector("form");
    let categoria = cat;
    const ajustar = () => f.classList.toggle("dia-inteiro", f.diaInteiro.checked);
    ajustar();
    f.diaInteiro.addEventListener("change", ajustar);
    f.feito?.addEventListener("change", () => {             // grava na hora (não depende de Salvar)
      const k = chaveFeito(ev, dia), h = ev.diaInteiro ? 0 : Math.round((ev.fim - ev.ini) / 36e5 * 10000) / 10000;
      S.alterar({ [k]: f.feito.checked ? h : null });
      render();
      avisar(f.feito.checked ? "Marcado como feito." : "Desmarcado.");
    });
    f.inicio.addEventListener("change", () => {                 // mantém a duração ao mudar o início
      const dur = fim - ini, [hh, mm] = f.inicio.value.split(":").map(Number);
      const n = new Date(2000, 0, 1, hh, mm); n.setTime(n.getTime() + Math.max(dur, 1800_000));
      if (n.getDate() === 1) f.fim.value = hora(n);
    });
    p.querySelector(".chips-cat").addEventListener("click", (e) => {
      const b = e.target.closest("[data-cat]"); if (!b) return;
      categoria = b.dataset.cat;
      p.querySelectorAll(".chip-cat").forEach((x) => x.classList.toggle("sel", x === b));
    });
    if (novo) setTimeout(() => f.titulo.focus(), 250);
    f.addEventListener("click", async (e) => {
      const a = e.target.closest("[data-acao-f]")?.dataset.acaoF;
      if (a === "cancelar") fecharFolha();
      if (a === "apagar") {
        const opcoes = ev.serie ? [["um", "Apagar só este dia", true], ["serie", "Apagar todas as repetições", true]]
          : [["um", "Apagar", true]];
        const r = await perguntar("Apagar evento", `“${ev.titulo}” será apagado também do Google Agenda.`, opcoes);
        if (!r) return;
        await salvando(async () => {
          await G.apagarEvento(r === "serie" ? ev.serie : ev.id);
          avisar("Evento apagado.");
        }, ev.ini);
      }
    });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const titulo = f.titulo.value.trim();
      if (!titulo) { f.titulo.focus(); avisar("Dê um título ao evento."); return; }
      if (!f.data.value) { avisar("Escolha a data."); return; }
      const corpo = { summary: titulo, description: f.notas.value, colorId: corGoogle(categoria),
        extendedProperties: { private: { categoria_agenda: categoria } } };
      const data = deIso(f.data.value);
      if (f.diaInteiro.checked) {
        corpo.start = { date: iso(data), dateTime: null, timeZone: null };
        corpo.end = { date: iso(mais(data, 1)), dateTime: null, timeZone: null };
      } else {
        if (!f.inicio.value || !f.fim.value) { avisar("Preencha início e fim."); return; }
        let fimData = data;
        if (f.fim.value <= f.inicio.value) fimData = mais(data, 1);       // passa da meia-noite
        corpo.start = { dateTime: `${iso(data)}T${f.inicio.value}:00`, timeZone: FUSO, date: null };
        corpo.end = { dateTime: `${iso(fimData)}T${f.fim.value}:00`, timeZone: FUSO, date: null };
      }
      if (novo) {
        for (const k of ["start", "end"]) for (const c of Object.keys(corpo[k])) if (corpo[k][c] === null) delete corpo[k][c];
        if (f.repetir?.value) corpo.recurrence = [f.repetir.value];
      }
      await salvando(async () => {
        if (novo) await G.criarEvento(corpo); else await G.alterarEvento(ev.id, corpo);
        avisar(novo ? "Evento criado." : "Evento salvo.");
      }, data, ev?.ini);
    });
  });
}

function editorTarefa(t, dia) {
  const novo = !t;
  const listas = E.listas.length ? E.listas : [{ id: "@default", title: "Minhas tarefas" }];
  abrirFolha(`
    <form class="editor" novalidate>
      <h2>${novo ? "Nova tarefa" : "Editar tarefa"}</h2>
      <input name="titulo" class="campo-titulo" placeholder="O que precisa fazer?" value="${esc(t?.titulo || "")}" maxlength="500" required>
      <div class="grade-datas">
        <label>Data<input type="date" name="data" value="${t ? (t.data ? iso(t.data) : "") : (dia ? iso(dia) : "")}"></label>
        ${listas.length > 1 ? `<label>Lista<select name="lista" ${novo ? "" : "disabled"}>${listas.map((l) =>
    `<option value="${esc(l.id)}" ${(t?.lista || listas[0].id) === l.id ? "selected" : ""}>${esc(l.title)}</option>`).join("")}</select></label>` : ""}
      </div>
      <label class="campo">Notas<textarea name="notas" rows="3" placeholder="Opcional">${esc(t?.notas || "")}</textarea></label>
      ${novo ? "" : `<label class="alternar"><span>Concluída</span><input type="checkbox" name="feita" ${t.feita ? "checked" : ""}><i></i></label>`}
      <p class="nota">O Google Tasks guarda só o dia (sem horário).</p>
      <div class="acoes">
        ${novo ? "" : '<button type="button" class="botao-perigo" data-acao-f="apagar">Apagar</button>'}
        <span></span>
        <button type="button" class="botao-leve" data-acao-f="cancelar">Cancelar</button>
        <button type="submit" class="botao-principal">Salvar</button>
      </div>
    </form>`, (p) => {
    const f = p.querySelector("form");
    if (novo) setTimeout(() => f.titulo.focus(), 250);
    f.addEventListener("click", async (e) => {
      const a = e.target.closest("[data-acao-f]")?.dataset.acaoF;
      if (a === "cancelar") fecharFolha();
      if (a === "apagar") {
        const r = await perguntar("Apagar tarefa", `“${t.titulo}” será apagada também do Google Tasks.`, [["sim", "Apagar", true]]);
        if (!r) return;
        await salvandoTarefas(async () => { await G.apagarTarefa(t.lista, t.id); avisar("Tarefa apagada."); });
      }
    });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const titulo = f.titulo.value.trim();
      if (!titulo) { f.titulo.focus(); avisar("Escreva a tarefa."); return; }
      const corpo = { title: titulo, notes: f.notas.value, due: f.data.value ? `${f.data.value}T00:00:00.000Z` : null };
      if (!novo) corpo.status = f.feita.checked ? "completed" : "needsAction";
      await salvandoTarefas(async () => {
        if (novo) {
          if (!corpo.due) delete corpo.due;
          await G.criarTarefa(f.lista?.value || listas[0].id, corpo);
        } else await G.alterarTarefa(t.lista, t.id, corpo);
        avisar(novo ? "Tarefa criada." : "Tarefa salva.");
      });
    });
  });
}

async function salvando(fn, ...dias) {
  const painel = document.querySelector("#folha .painel");
  painel?.classList.add("ocupado");
  try {
    await tentar(fn);
    fecharFolha();
    for (const d of new Set(dias.filter(Boolean).map((d) => iso(inicioSemana(d))))) delete E.semanas[d];
    await carregarSemana(inicioSemana(E.dia), true);
  } catch { /* aviso já mostrado */ } finally { painel?.classList.remove("ocupado"); }
}
async function salvandoTarefas(fn) {
  const painel = document.querySelector("#folha .painel");
  painel?.classList.add("ocupado");
  try { await tentar(fn); fecharFolha(); await carregarTarefas(true); }
  catch { /* aviso já mostrado */ } finally { painel?.classList.remove("ocupado"); }
}

async function marcarTarefa(id) {
  const t = E.tarefas?.find((x) => x.id === id); if (!t) return;
  const feita = t.status !== "completed";
  t.status = feita ? "completed" : "needsAction";                     // muda já na tela
  render();
  try {
    await tentar(() => G.alterarTarefa(t._lista, t.id, { status: t.status }));
    if (feita && navigator.vibrate) navigator.vibrate(12);
    salvarCache();
  } catch { t.status = feita ? "needsAction" : "completed"; render(); }
}

// ---------------------------------------------------------------- ações
function irPara(d) {
  const antes = iso(inicioSemana(E.dia));
  E.dia = zerar(d);
  render();
  if (iso(inicioSemana(E.dia)) !== antes) carregarSemana(inicioSemana(E.dia));
}

document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-acao]"); if (!b) return;
  const a = b.dataset.acao;
  if ((a.startsWith("foco-") || a === "meta-focar") && await F.acao(a, b, E)) { window.scrollTo(0, 0); return; }
  if (a.startsWith("meta") && M.acao(a, b, E)) return;
  if (a === "pet") { PET.folha(E); return; }
  if ((a.startsWith("nota-") || a.startsWith("lista-")) && N.acao(a, b)) return;
  if (a === "entrar") G.entrar();
  else if (a === "reconectar") G.entrar({ silencioso: false, volta: E.aba });
  else if (a === "trocar-conta") G.entrar({ trocarConta: true });
  else if (a === "sair") {
    const r = await perguntar("Sair da conta", "O app esquece a conta neste aparelho. Seus eventos e tarefas continuam no Google.",
      [["sim", "Sair", true]]);
    if (r) { G.sair(); S.esquecer(); localStorage.removeItem("agenda.cache.semanas"); localStorage.removeItem("agenda.cache.tarefas");
      E.semanas = {}; E.tarefas = null; render(); }
  } else if (a === "sair-demo") { G.sair(); S.esquecer(); localStorage.removeItem("agenda.demo.drive"); location.href = location.pathname; }
  else if (a === "aba") { E.aba = b.dataset.aba; local.gravar("agenda.aba", E.aba); render(); window.scrollTo(0, 0);
    if (E.aba === "tarefas") carregarTarefas(); }
  else if (a === "dia") irPara(deIso(b.dataset.dia));
  else if (a === "semana") irPara(mais(E.dia, 7 * Number(b.dataset.passo)));
  else if (a === "hoje") irPara(hoje());
  else if (a === "atualizar") { atualizarTudo(true); S.sincronizar(); }
  else if (a === "evento") {
    const ev = (E.semanas[iso(inicioSemana(E.dia))]?.itens || []).map(deEvento).find((x) => x.id === b.dataset.id);
    if (ev) editorEvento(ev, E.dia);
  } else if (a === "tarefa") {
    const t = E.tarefas?.find((x) => x.id === b.dataset.id);
    if (t) editorTarefa(deTarefa(t));
  } else if (a === "marcar") marcarTarefa(b.dataset.id);
  else if (a === "ver-feitas") { E.verFeitas = b.dataset.valor === "1"; render(); }
  else if (a === "tema") { local.gravar("agenda.tema", b.dataset.valor); aplicarTema(); render(); }
  else if (a === "cor") { local.gravar("agenda.cor", b.dataset.valor); aplicarTema(); render(); }
  else if (a === "instalar" && E.instalar) { E.instalar.prompt(); E.instalar = null; render(); }
  else if (a === "fechar-instalar") { local.gravar("agenda.instalar.fechado", true); render(); }
  else if (a === "fechar-folha") fecharFolha();
  else if (a === "novo") {
    if (E.aba === "notas") N.editorLista(null);
    else if (E.aba === "metas") M.editor(null);
    else if (E.aba === "tarefas") editorTarefa(null, null);
    else {
      const r = await perguntar("Criar", rotuloDia(E.dia), [["evento", "Evento com horário"], ["tarefa", "Tarefa do dia"]]);
      if (r === "evento") editorEvento(null, E.dia);
      if (r === "tarefa") editorTarefa(null, E.dia);
    }
  }
});

// deslizar para o lado: troca o dia (ou a semana, na faixa dos dias)
let toque = null;
document.addEventListener("touchstart", (e) => {
  const alvo = e.target.closest("[data-gesto]");
  toque = alvo && !document.getElementById("folha").classList.contains("aberta")
    ? { x: e.touches[0].clientX, y: e.touches[0].clientY, tipo: alvo.dataset.gesto } : null;
}, { passive: true });
document.addEventListener("touchend", (e) => {
  if (!toque) return;
  const dx = e.changedTouches[0].clientX - toque.x, dy = e.changedTouches[0].clientY - toque.y;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    const passo = dx < 0 ? 1 : -1;
    irPara(mais(E.dia, toque.tipo === "semana" ? 7 * passo : passo));
  }
  toque = null;
}, { passive: true });

document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharFolha(); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (iso(E.dia) < iso(hoje()) && E._abertoEm && iso(E._abertoEm) !== iso(hoje())) E.dia = hoje();   // virou o dia
  E._abertoEm = new Date();
  if (G.conectou() && !G.tokenValido() && !DEMO) { E.precisaEntrar = true; render(); return; }
  atualizarTudo(false);
  S.agendar(400);
});
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); E.instalar = e; render(); });
window.addEventListener("appinstalled", () => { E.instalar = null; avisar("Agenda instalada! Abra pelo ícone."); render(); });

// ---------------------------------------------------------------- início
S.iniciar(G);
M.iniciar({ render: () => render(), abrirFolha, fecharFolha, perguntar, avisar: (m) => avisar(m), corCat, CATS, chipsCategoria });
N.iniciar({ render: () => render(), abrirFolha, fecharFolha, perguntar, avisar: (m) => avisar(m) });
F.iniciar({ render: () => render(), abrirFolha, fecharFolha, perguntar, avisar: (m) => avisar(m), corCat });
setInterval(() => F.tique(), 1000);
S.ouvir(() => {
  categoriasDoPC();
  if (S.estado.precisaEntrar) { S.estado.precisaEntrar = false; E.precisaEntrar = true; }
  const digitando = document.activeElement?.matches?.("#conteudo input, #conteudo textarea");
  if (digitando) return;                         // não apaga o que está sendo escrito; desenha na próxima vez
  if (!document.getElementById("folha").classList.contains("aberta") || E.aba !== "metas") render();
});
categoriasDoPC();
PET.iniciar({ render: () => render(), abrirFolha, fecharFolha, avisar: (m) => avisar(m) }).then(() => render());
PET.animar();

async function iniciar() {
  aplicarTema();
  E._abertoEm = new Date();
  const ret = G.capturarRetorno();
  if (ret?.volta) E.aba = ret.volta;
  if (ret?.erro && !["access_denied", "interaction_required", "login_required", "consent_required"].includes(ret.erro)) {
    avisar("Não foi possível entrar: " + ret.erro);
  } else if (ret?.erro === "access_denied") avisar("Você não autorizou o acesso. Tente de novo e clique em Permitir.");
  render();
  if (!G.conectou() && ret?.ok) {
    try { await G.lerConta(); } catch { /* segue sem o nome */ }
    render();
  }
  if (!G.conectou()) return;
  if (!G.tokenValido()) {
    // a conexão (1 hora) venceu: renova sozinho se a conta ainda estiver logada no navegador (sem tela),
    // no máximo uma vez a cada 2 minutos, para não ficar em loop
    const ultima = Number(localStorage.getItem("agenda.renovou") || 0);
    if (!DEMO && navigator.onLine && Date.now() - ultima > 120_000 && !ret?.erro) {
      localStorage.setItem("agenda.renovou", String(Date.now()));
      try { G.entrar({ silencioso: true, volta: E.aba }); return; } catch { /* sem ID */ }
    }
    E.precisaEntrar = true; render();
    return;
  }
  if (!G.sessao().nome && !DEMO) G.lerConta().then(render).catch(() => {});
  carregarSemana(inicioSemana(E.dia));
  carregarTarefas();
  S.sincronizar();
  setInterval(() => { if (document.visibilityState === "visible") S.sincronizar(); }, 120_000);
}

if ("serviceWorker" in navigator && !DEMO && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
iniciar();
