// Aba Metas: o mesmo que o app do computador (progresso da semana, dias, sequência 🔥, histórico e mapa de dias).
import * as S from "./sync.js";

let C;                                   // funções da tela principal (abrirFolha, render, avisar...)
export function iniciar(ctx) { C = ctx; }

// ---------------------------------------------------------------- datas e textos
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro",
  "outubro", "novembro", "dezembro"];
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const LETRA = ["S", "T", "Q", "Q", "S", "S", "D"];
const CURTO = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const deIso = (s) => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };
const mais = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const zerar = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const inicioSemana = (d) => mais(zerar(d), -((d.getDay() + 6) % 7));
const hoje = () => zerar(new Date());
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const num = (x) => (Math.round(x * 100) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const qtd = (v, u) => u === "horas" ? horasTxt(v) : `${num(v)} ${Math.abs(v - 1) < 1e-9 ? "vez" : "vezes"}`;
function horasTxt(h) {
  const min = Math.round(h * 60);
  if (min < 60) return `${min} min`;
  return min % 60 ? `${Math.floor(min / 60)}h${pad(min % 60)}` : `${min / 60} h`;
}
const periodoTxt = (p) => p === "diaria" ? "por dia" : "por semana";
const curtoDia = (d) => `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;

// ---------------------------------------------------------------- cálculos (iguais aos do PC: banco.py)
export function metas() {
  return Object.entries(S.todos()).filter(([k]) => k.startsWith("meta:"))
    .map(([k, v]) => ({ uid: k.slice(5), ...v }))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
}
const metaPorUid = (uid) => metas().find((m) => m.uid === uid);

export function valorDia(m, d) {
  const dia = iso(d);
  let v = Number(S.ler1(`reg:${m.uid}|${dia}`) || 0);
  if (m.ref) {
    const f = S.ler1(`feito:${m.ref}|${dia}`);
    if (f !== undefined) v += m.unidade === "horas" ? Number(f) || 0 : 1;
  }
  return v;
}
function progresso(m, seg) {
  const dias = [...Array(7)].map((_, i) => mais(seg, i));
  const valores = dias.map((d) => valorDia(m, d));
  const feito = valores.reduce((a, b) => a + b, 0);
  const cumpridos = valores.filter((v) => v >= m.quantidade - 1e-9).length;
  return { dias, valores, feito, cumpridos };
}
function historico(m, semanas = 12) {
  const segAtual = inicioSemana(hoje()), res = [];
  for (let k = semanas - 1; k >= 0; k--) {
    const seg = mais(segAtual, -7 * k), r = progresso(m, seg);
    const [valor, alvo] = m.periodo === "diaria" ? [r.cumpridos, 7] : [r.feito, m.quantidade];
    res.push({ seg, valor, alvo, batida: valor >= alvo - 1e-9, atual: k === 0, r });
  }
  return res;
}
export function sequencia(m) {
  const h = historico(m, 52), hj = iso(hoje());
  let ok;
  if (m.periodo === "diaria") {
    ok = [];
    for (const s of h) s.r.dias.forEach((d, i) => { if (iso(d) <= hj) ok.push(s.r.valores[i] >= m.quantidade - 1e-9); });
  } else ok = h.map((s) => s.batida);
  const atualOk = ok.at(-1) || false;
  let atual = 0;
  for (const v of ok.slice(0, -1).reverse()) { if (!v) break; atual++; }
  atual += atualOk ? 1 : 0;
  let recorde = 0, corrida = 0;
  for (const v of ok) { corrida = v ? corrida + 1 : 0; recorde = Math.max(recorde, corrida); }
  return { atual, recorde, unidade: m.periodo === "diaria" ? "dias" : "semanas", hojeOk: atualOk };
}
const seqTxt = (n, u) => `${n} ${n === 1 ? u.slice(0, -1) : u}`;

// ---------------------------------------------------------------- tela
export function tela(E) {
  const seg = E.semanaMetas, fim = mais(seg, 6), lista = metas();
  const st = S.estado;
  const nav = `
    <div class="semana-metas">
      <button class="seta" data-acao="metas-semana" data-passo="-1" aria-label="Semana anterior">‹</button>
      <div><b>${iso(seg) === iso(inicioSemana(hoje())) ? "Esta semana" : `Semana de ${seg.getDate()}/${pad(seg.getMonth() + 1)}`}</b>
        <small>${seg.getDate()} de ${MESES[seg.getMonth()]} a ${fim.getDate()} de ${MESES[fim.getMonth()]}</small></div>
      <button class="seta" data-acao="metas-semana" data-passo="1" aria-label="Próxima semana">›</button>
    </div>`;
  const status = st.erro ? `<div class="faixa erro">⚠ ${esc(st.erro)}</div>` : "";
  if (!lista.length) {
    return nav + status + `<div class="vazio">${st.ocupado && !st.carregou ? "Buscando suas metas…" : `Nenhuma meta ainda.<br>
      Toque em ＋ para criar a primeira.<br><br><small>As metas do computador aparecem aqui depois que o app do PC
      sincronizar (abra a Agenda no PC e entre com o Google de novo, se ela pedir).</small>`}</div>`;
  }
  return nav + status + lista.map((m) => cartao(m, seg)).join("") +
    `<p class="rodape-sync">${st.ocupado ? "Sincronizando…" : st.ultima ? `Sincronizado com o PC ${quando(st.ultima)}` : ""}</p>`;
}
function quando(t) {
  const s = (Date.now() - t) / 1000;
  return s < 60 ? "agora" : s < 3600 ? `há ${Math.floor(s / 60)} min` : `às ${pad(new Date(t).getHours())}:${pad(new Date(t).getMinutes())}`;
}

function anel(fracao, cor, texto, sub) {
  const r = 30, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, fracao));
  return `<svg class="anel" viewBox="0 0 76 76" aria-hidden="true">
    <circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--borda)" stroke-width="7"/>
    <circle cx="38" cy="38" r="${r}" fill="none" stroke="${cor}" stroke-width="7" stroke-linecap="round"
      stroke-dasharray="${c * f} ${c}" transform="rotate(-90 38 38)"/>
    <text x="38" y="${sub ? 37 : 43}" text-anchor="middle" class="anel-num">${texto}</text>
    ${sub ? `<text x="38" y="52" text-anchor="middle" class="anel-sub">${sub}</text>` : ""}</svg>`;
}

function cartao(m, seg) {
  const cor = C.corCat(m.categoria), r = progresso(m, seg), seq = sequencia(m), hj = iso(hoje());
  const diaria = m.periodo === "diaria";
  const fracao = diaria ? r.cumpridos / 7 : r.feito / m.quantidade;
  const batida = diaria ? r.cumpridos >= 7 : r.feito >= m.quantidade - 1e-9;
  const centro = diaria ? `${r.cumpridos}/7` : m.unidade === "horas" ? num(r.feito) : `${num(r.feito)}/${num(m.quantidade)}`;
  const sub = diaria ? "dias" : m.unidade === "horas" ? `de ${num(m.quantidade)} h` : "";
  const dias = r.dias.map((d, i) => {
    const v = r.valores[i], ok = diaria ? v >= m.quantidade - 1e-9 : v > 0;
    const marca = v <= 0 ? "" : m.unidade === "horas" ? horasTxt(v).replace(" ", "") : diaria && m.quantidade === 1 ? "✓" : num(v);
    return `<button class="mdia ${ok ? "ok" : v > 0 ? "parcial" : ""} ${iso(d) === hj ? "hoje" : ""} ${iso(d) > hj ? "futuro" : ""}"
      data-acao="meta-dia" data-uid="${esc(m.uid)}" data-dia="${iso(d)}"><span>${LETRA[i]}</span><b>${marca}</b></button>`;
  }).join("");
  const faltam = diaria ? "" : batida ? "Meta da semana batida! 🎉" :
    `Faltam ${qtd(m.quantidade - r.feito, m.unidade)}`;
  return `<article class="meta ${batida ? "batida" : ""}" style="--c:${cor}">
    <div class="meta-topo">
      <button class="meta-titulo" data-acao="meta-hist" data-uid="${esc(m.uid)}">
        <b>${esc(m.titulo)}</b><small>${qtd(m.quantidade, m.unidade)} ${periodoTxt(m.periodo)} · ${esc(m.categoria)}</small></button>
      <button class="fogo ${seq.atual ? "" : "apagado"}" data-acao="meta-hist" data-uid="${esc(m.uid)}"
        aria-label="Sequência">🔥 ${seq.atual}</button>
    </div>
    <div class="meta-corpo">
      ${anel(fracao, cor, centro, sub)}
      <div class="meta-dias">${dias}</div>
    </div>
    <div class="meta-rodape">
      <small>${faltam}</small>
      <div class="meta-botoes"><button class="botao-meta focar" data-acao="meta-focar" data-uid="${esc(m.uid)}" aria-label="Focar">▶ Focar</button>
      <button class="botao-meta" data-acao="meta-mais" data-uid="${esc(m.uid)}">${m.unidade === "horas" ? "＋ tempo" : "＋1"}</button></div>
    </div>
  </article>`;
}

// ---------------------------------------------------------------- ações
export function acao(a, b, E) {
  const m = b.dataset.uid ? metaPorUid(b.dataset.uid) : null;
  if (a === "metas-semana") {
    const novo = mais(E.semanaMetas, 7 * Number(b.dataset.passo));
    if (novo > inicioSemana(hoje())) return true;
    E.semanaMetas = novo; C.render(); return true;
  }
  if (a === "meta-mais" && m) { m.unidade === "horas" ? folhaHoras(m, hoje()) : somar(m, hoje(), 1); return true; }
  if (a === "meta-dia" && m) { folhaDia(m, deIso(b.dataset.dia)); return true; }
  if (a === "meta-hist" && m) { folhaHistorico(m); return true; }
  return false;
}

function somar(m, d, delta) {
  const k = `reg:${m.uid}|${iso(d)}`, atual = Number(S.ler1(k) || 0);
  let novo = atual + delta;
  if (delta < 0 && atual <= 0) {                        // tira primeiro o registro; depois o "feito" da agenda
    const kf = `feito:${m.ref}|${iso(d)}`;
    if (m.ref && S.ler1(kf) !== undefined) { S.alterar({ [kf]: null }); C.render(); return; }
    return;
  }
  novo = Math.max(0, Math.round(novo * 10000) / 10000);
  S.alterar({ [k]: novo > 0 ? novo : null });
  if (delta > 0 && navigator.vibrate) navigator.vibrate(12);
  C.render();
  if (delta > 0) {
    const sq = sequencia(m);
    C.avisar(`${m.titulo}: ${qtd(valorDia(m, d), m.unidade)} ${iso(d) === iso(hoje()) ? "hoje" : "neste dia"}` +
      (sq.atual ? ` · 🔥 ${seqTxt(sq.atual, sq.unidade)}` : ""));
  }
}

function folhaHoras(m, d) {
  C.abrirFolha(`
    <h2>${esc(m.titulo)}</h2><p>${iso(d) === iso(hoje()) ? "Quanto tempo você fez hoje?" : curtoDia(d)}</p>
    <div class="grade-botoes">${[[0.25, "＋15 min"], [0.5, "＋30 min"], [1, "＋1 h"], [2, "＋2 h"]].map(([h, t]) =>
      `<button class="botao-leve" data-h="${h}">${t}</button>`).join("")}</div>
    <form class="linha-form"><input type="number" name="min" inputmode="numeric" min="1" max="1440" placeholder="Outro (minutos)">
      <button class="botao-principal">Somar</button></form>`, (p) => {
    p.addEventListener("click", (e) => { const b = e.target.closest("[data-h]"); if (b) { C.fecharFolha(); somar(m, d, Number(b.dataset.h)); } });
    p.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault(); const v = Number(e.target.min.value);
      if (v > 0) { C.fecharFolha(); somar(m, d, v / 60); }
    });
  });
}

function folhaDia(m, d) {
  if (iso(d) > iso(hoje())) { C.avisar("Esse dia ainda não chegou."); return; }
  const v = valorDia(m, d), temFeito = m.ref && S.ler1(`feito:${m.ref}|${iso(d)}`) !== undefined;
  const horas = m.unidade === "horas";
  C.abrirFolha(`
    <h2>${esc(m.titulo)}</h2>
    <p>${curtoDia(d)} · feito: <b>${qtd(v, m.unidade)}</b>${temFeito ? " (inclui a tarefa marcada como feita na agenda)" : ""}</p>
    ${horas ? `<div class="grade-botoes">${[[0.25, "＋15 min"], [0.5, "＋30 min"], [1, "＋1 h"], [-0.25, "−15 min"]].map(([h, t]) =>
      `<button class="botao-leve" data-h="${h}">${t}</button>`).join("")}</div>`
    : `<div class="contador"><button class="botao-leve" data-h="-1" aria-label="Menos um">−</button><b>${num(v)}</b>
        <button class="botao-principal" data-h="1" aria-label="Mais um">＋</button></div>`}
    <div class="opcoes">${v > 0 ? '<button class="botao-perigo" data-limpar="1">Zerar este dia</button>' : ""}
      <button class="botao-leve" data-fechar="1">Pronto</button></div>`, (p) => {
    p.addEventListener("click", (e) => {
      const b = e.target.closest("[data-h],[data-limpar],[data-fechar]"); if (!b) return;
      if (b.dataset.fechar) { C.fecharFolha(); return; }
      if (b.dataset.limpar) {
        S.alterar({ [`reg:${m.uid}|${iso(d)}`]: null, ...(m.ref ? { [`feito:${m.ref}|${iso(d)}`]: null } : {}) });
        C.fecharFolha(); C.render(); return;
      }
      const h = Number(b.dataset.h);
      if (h < 0 && horas) {                                 // tira tempo só do que foi registrado na meta
        const k = `reg:${m.uid}|${iso(d)}`, atual = Number(S.ler1(k) || 0);
        const novo = Math.max(0, atual + h);
        S.alterar({ [k]: novo > 0 ? novo : null }); C.render();
      } else somar(m, d, h);
      C.fecharFolha(); folhaDia(m, d);
    });
  });
}

// ---------------------------------------------------------------- criar / editar
export function editor(m) {
  const novo = !m, cats = Object.keys(C.CATS);
  const doGoogle = m?.ref?.startsWith("g:");
  const v = m || { titulo: "", categoria: cats.includes("Estudos") ? "Estudos" : cats[0], unidade: "vezes", quantidade: 3, periodo: "semanal" };
  C.abrirFolha(`
    <form class="editor" novalidate>
      <h2>${novo ? "Nova meta" : "Editar meta"}</h2>
      <input name="titulo" class="campo-titulo" placeholder="Atividade (ex.: Leitura, Academia)" value="${esc(v.titulo)}"
        maxlength="120" ${doGoogle ? "disabled" : ""}>
      ${doGoogle ? '<p class="nota">O nome vem do evento do Google Agenda.</p>' : ""}
      ${C.chipsCategoria(v.categoria)}
      <div class="segmentado" data-grupo="unidade">
        <button type="button" data-v="vezes" class="${v.unidade === "vezes" ? "ativa" : ""}">Vezes</button>
        <button type="button" data-v="horas" class="${v.unidade === "horas" ? "ativa" : ""}">Horas</button></div>
      <div class="segmentado" data-grupo="periodo">
        <button type="button" data-v="semanal" class="${v.periodo !== "diaria" ? "ativa" : ""}">Por semana</button>
        <button type="button" data-v="diaria" class="${v.periodo === "diaria" ? "ativa" : ""}">Por dia</button></div>
      <label class="campo">Quantidade<input type="number" name="quantidade" inputmode="decimal" min="0.25" step="0.25"
        value="${num(v.quantidade).replace(",", ".")}"></label>
      <div class="acoes">
        ${novo ? "" : '<button type="button" class="botao-perigo" data-acao-f="apagar">Apagar</button>'}
        <span></span>
        <button type="button" class="botao-leve" data-acao-f="cancelar">Cancelar</button>
        <button type="submit" class="botao-principal">Salvar</button>
      </div>
    </form>`, (p) => {
    const f = p.querySelector("form");
    const sel = { unidade: v.unidade, periodo: v.periodo === "diaria" ? "diaria" : "semanal", categoria: v.categoria };
    p.addEventListener("click", async (e) => {
      const g = e.target.closest("[data-grupo] [data-v]");
      if (g) {
        sel[g.parentElement.dataset.grupo] = g.dataset.v;
        g.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("ativa", x === g));
      }
      const c = e.target.closest("[data-cat]");
      if (c) { sel.categoria = c.dataset.cat; p.querySelectorAll(".chip-cat").forEach((x) => x.classList.toggle("sel", x === c)); }
      const a = e.target.closest("[data-acao-f]")?.dataset.acaoF;
      if (a === "cancelar") C.fecharFolha();
      if (a === "apagar") {
        const r = await C.perguntar("Apagar meta", `A meta de “${m.titulo}” e os registros dela serão apagados aqui e no PC.`,
          [["sim", "Apagar meta", true]]);
        if (!r) return;
        const mud = { [`meta:${m.uid}`]: null };
        for (const k of Object.keys(S.todos())) if (k.startsWith(`reg:${m.uid}|`)) mud[k] = null;
        S.alterar(mud); C.render(); C.avisar("Meta apagada.");
      }
    });
    if (novo) setTimeout(() => f.titulo.focus(), 250);
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const titulo = f.titulo.value.trim(), quantidade = Number(String(f.quantidade.value).replace(",", "."));
      if (!titulo) { C.avisar("Dê um nome para a atividade."); f.titulo.focus(); return; }
      if (!(quantidade > 0)) { C.avisar("A quantidade precisa ser maior que zero."); return; }
      const dup = metas().find((x) => x.titulo.trim().toLowerCase() === titulo.toLowerCase() && x.uid !== m?.uid);
      if (dup) { C.avisar("Já existe uma meta com esse nome."); return; }
      const uid = m?.uid || crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(16).padStart(8, "0"), "");
      const mud = {};
      let ref = m?.ref;
      if (!ref) {                                   // atividade nova, sem horário (como "Nova tarefa" no PC)
        const tuid = crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(16).padStart(8, "0"), "");
        ref = "u:" + tuid;
        mud[`tarefa:${tuid}`] = { titulo, categoria: sel.categoria, notas: "", agendada: false, data: iso(hoje()),
          inicio: "00:00", fim: "00:00", dia_inteiro: false, repetir: "nenhuma", repetir_ate: null };
      } else if (ref.startsWith("u:")) {             // muda também a tarefa ligada
        const t = S.ler1(`tarefa:${ref.slice(2)}`);
        if (t) mud[`tarefa:${ref.slice(2)}`] = { ...t, titulo, categoria: sel.categoria };
      }
      mud[`meta:${uid}`] = { titulo: doGoogle ? m.titulo : titulo, categoria: sel.categoria, unidade: sel.unidade,
        quantidade, periodo: sel.periodo, ref };
      S.alterar(mud);
      C.fecharFolha(); C.render(); C.avisar(novo ? "Meta criada." : "Meta salva.");
    });
  });
}

// ---------------------------------------------------------------- histórico (mapa de dias e 12 semanas)
function hexRgb(h) { h = h.trim(); if (h.startsWith("#") && h.length === 4) h = "#" + [...h.slice(1)].map((c) => c + c).join(""); return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); }
function misturar(a, b, t) { const x = hexRgb(a), y = hexRgb(b); return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join(""); }
function paradas(cor) {
  const css = getComputedStyle(document.documentElement);
  const fundo = css.getPropertyValue("--cartao").trim() || "#ffffff";
  const escuro = hexRgb(fundo).reduce((a, b) => a + b, 0) < 300;
  return [misturar(cor, fundo, 0.78), misturar(cor, fundo, 0.45), cor, escuro ? misturar(cor, "#ffffff", 0.28) : misturar(cor, "#000000", 0.32)];
}
function gradiente(p, t) {
  t = Math.max(0, Math.min(1, t)) * (p.length - 1);
  const i = Math.min(Math.floor(t), p.length - 2);
  return misturar(p[i], p[i + 1], t - i);
}
const legivel = (c) => hexRgb(c).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0) / 255 < 0.55 ? "#fff" : "#1a1a1a";

function mapa(m, modo, ref) {
  const hj = hoje();
  let ini, fim;
  if (modo === "semana") { ini = inicioSemana(ref); fim = mais(ini, 6); }
  else { ini = new Date(ref.getFullYear(), ref.getMonth(), 1); fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0); }
  const dias = []; for (let d = ini; d <= fim; d = mais(d, 1)) dias.push(d);
  const val = dias.map((d) => valorDia(m, d)), ate = dias.filter((d) => d <= hj);
  const pos = val.filter((v, i) => v > 0 && dias[i] <= hj);
  const min = pos.length ? Math.min(...pos) : 0, max = pos.length ? Math.max(...pos) : 0;
  const p = paradas(C.corCat(m.categoria));
  const cel = (d, v) => {
    if (d > hj) return `<div class="mc futuro"><span>${d.getDate()}</span></div>`;
    if (v <= 0) return `<div class="mc vazio" title="${curtoDia(d)} · nada"><span>${d.getDate()}</span></div>`;
    const c = gradiente(p, max - min < 1e-9 ? 0.75 : (v - min) / (max - min));
    return `<div class="mc" style="background:${c};color:${legivel(c)}" title="${curtoDia(d)} · ${qtd(v, m.unidade)}">
      <span>${d.getDate()}</span>${modo === "semana" ? `<small>${m.unidade === "horas" ? horasTxt(v) : num(v)}</small>` : ""}</div>`;
  };
  const cab = (modo === "semana" ? CURTO : LETRA).map((l) => `<i>${l}</i>`).join("");
  const vazios = modo === "mes" ? (ini.getDay() + 6) % 7 : 0;
  const grade = `<div class="mapa ${modo}">${cab}${'<div class="mc nada"></div>'.repeat(vazios)}${dias.map((d, i) => cel(d, val[i])).join("")}</div>`;
  const feitos = ate.filter((d) => valorDia(m, d) > 0);
  const total = ate.reduce((s, d) => s + valorDia(m, d), 0);
  let maior = 0, corr = 0;
  for (const d of ate) { corr = valorDia(m, d) > 0 ? corr + 1 : 0; maior = Math.max(maior, corr); }
  let atual = 0; { let d = valorDia(m, hj) > 0 ? hj : mais(hj, -1); while (valorDia(m, d) > 0 && atual < 400) { atual++; d = mais(d, -1); } }
  const titulo = modo === "semana" ? `${ini.getDate()}/${pad(ini.getMonth() + 1)} a ${fim.getDate()}/${pad(fim.getMonth() + 1)}`
    : `${MESES[ini.getMonth()][0].toUpperCase() + MESES[ini.getMonth()].slice(1)} de ${ini.getFullYear()}`;
  const legenda = max > 0 ? (max - min > 1e-9 ? `menos = ${qtd(min, m.unidade)} · mais = ${qtd(max, m.unidade)}` : `todos: ${qtd(max, m.unidade)}`) : "nada registrado";
  return `
    <div class="mapa-topo"><b>${titulo}</b>
      <span><button class="seta" data-mapa="-1">‹</button><button class="seta" data-mapa="1" ${fim >= hj ? "disabled" : ""}>›</button></span></div>
    ${grade}
    <div class="mapa-legenda">Menos ${[0, 0, 1 / 3, 2 / 3, 1].map((t, i) => `<i style="background:${i ? gradiente(p, t) : "var(--cartao2)"}"></i>`).join("")} Mais
      <small>${legenda}</small></div>
    <div class="numeros">
      <div><small>Média diária</small><b>${ate.length ? qtd(total / ate.length, m.unidade) : "—"}</b></div>
      <div><small>Dias feitos</small><b>${ate.length ? Math.round(feitos.length / ate.length * 100) + "%" : "—"}</b></div>
      <div><small>Maior sequência</small><b>${maior} dia${maior === 1 ? "" : "s"}</b></div>
      <div><small>Sequência atual</small><b>${atual} dia${atual === 1 ? "" : "s"}</b></div>
    </div>`;
}

function grafico(m) {
  const h = historico(m, 12), cor = C.corCat(m.categoria);
  const maior = Math.max(1, ...h.map((x) => Math.max(x.valor, x.alvo)));
  const L = 340, A = 170, base = 140, topo = 16, passo = L / 12;
  const y = (v) => base - (v / (maior * 1.08)) * (base - topo);
  const barras = h.map((x, i) => {
    const x0 = i * passo + passo * 0.18, w = passo * 0.64, yv = y(x.valor);
    const fill = x.atual ? `color-mix(in srgb, ${cor} 45%, var(--cartao))` : x.batida ? cor : `color-mix(in srgb, ${cor} 25%, var(--cartao))`;
    return `${x.valor > 0 ? `<rect x="${x0}" y="${Math.min(yv, base - 3)}" width="${w}" height="${base - Math.min(yv, base - 3)}" rx="4" fill="${fill}"/>
      <text x="${x0 + w / 2}" y="${Math.min(yv, base - 3) - 4}" text-anchor="middle" class="g-num">${num(x.valor)}</text>` : ""}
      <text x="${x0 + w / 2}" y="${base + 16}" text-anchor="middle" class="g-rot">${x.atual ? "atual" : `${x.seg.getDate()}/${pad(x.seg.getMonth() + 1)}`}</text>`;
  }).join("");
  return `<svg class="grafico" viewBox="0 0 ${L} ${A}" role="img" aria-label="Últimas 12 semanas">
    <line x1="0" x2="${L}" y1="${base}" y2="${base}" stroke="var(--borda)"/>
    <line x1="0" x2="${L}" y1="${y(h.at(-1).alvo)}" y2="${y(h.at(-1).alvo)}" stroke="var(--dest)" stroke-dasharray="4 4"/>
    <text x="2" y="${y(h.at(-1).alvo) - 4}" class="g-meta">meta ${num(h.at(-1).alvo)}</text>${barras}</svg>
    <p class="nota">${m.periodo === "diaria" ? "Dias cumpridos por semana. " : ""}Barra cheia: semana em que a meta foi batida. A semana atual (mais clara) ainda está em andamento.</p>`;
}

function folhaHistorico(m) {
  const seq = sequencia(m), h = historico(m, 12);
  const passadas = h.filter((x) => !x.atual), batidas = passadas.filter((x) => x.batida).length;
  let terceiro;
  if (m.periodo === "diaria") {
    const dias = h.flatMap((s) => s.r.dias.map((d, i) => [d, s.r.valores[i]])).filter(([d]) => d <= hoje());
    const p = dias.findIndex(([, v]) => v > 0), uteis = p < 0 ? [] : dias.slice(p);
    terceiro = ["Dias cumpridos", `${uteis.filter(([, v]) => v >= m.quantidade - 1e-9).length} de ${uteis.length}`];
  } else terceiro = ["Semanas batidas", `${batidas} de ${passadas.length}`];
  let modo = "mes", ref = hoje(), aba = "mapa";
  const desenhar = (p) => {
    p.querySelector(".hist-conteudo").innerHTML = aba === "mapa" ? `
      <div class="segmentado pequeno"><button data-modo="semana" class="${modo === "semana" ? "ativa" : ""}">Semana</button>
        <button data-modo="mes" class="${modo === "mes" ? "ativa" : ""}">Mês</button></div>${mapa(m, modo, ref)}` : grafico(m);
  };
  C.abrirFolha(`
    <h2>${esc(m.titulo)}</h2>
    <p>Meta: ${qtd(m.quantidade, m.unidade)} ${periodoTxt(m.periodo)}</p>
    <div class="numeros tres">
      <div><small>Sequência atual</small><b>🔥 ${seqTxt(seq.atual, seq.unidade)}</b></div>
      <div><small>Recorde</small><b>${seqTxt(seq.recorde, seq.unidade)}</b></div>
      <div><small>${terceiro[0]}</small><b>${terceiro[1]}</b></div>
    </div>
    <div class="segmentado"><button data-aba-h="mapa" class="ativa">Mapa de dias</button><button data-aba-h="semanas">Últimas 12 semanas</button></div>
    <div class="hist-conteudo"></div>
    <div class="acoes"><button class="botao-leve" data-editar="1">Editar meta</button><span></span>
      <button class="botao-principal" data-fechar="1">Fechar</button></div>`, (p) => {
    desenhar(p);
    p.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.abaH) { aba = b.dataset.abaH; p.querySelectorAll("[data-aba-h]").forEach((x) => x.classList.toggle("ativa", x === b)); desenhar(p); }
      if (b.dataset.modo) { modo = b.dataset.modo; ref = hoje(); desenhar(p); }
      if (b.dataset.mapa) {
        const s = Number(b.dataset.mapa);
        ref = modo === "semana" ? mais(ref, 7 * s) : new Date(ref.getFullYear(), ref.getMonth() + s, 1);
        if (ref > hoje()) ref = hoje();
        desenhar(p);
      }
      if (b.dataset.fechar) C.fecharFolha();
      if (b.dataset.editar) { C.fecharFolha(); setTimeout(() => editor(m), 220); }
    });
  });
}
