// Pet da semana no celular: mesmo pet, humor e prêmios do app do computador (pet.py).
// As animações vêm prontas (pets/<pet>/<humor>_<prêmio>.webp, 8 quadros lado a lado), geradas pelo motor do PC.
import * as S from "./sync.js";
import * as M from "./metas.js";

let C, INDICE = {};
export async function iniciar(ctx) {
  C = ctx;
  try { INDICE = await (await fetch("pets/pets.json")).json(); } catch { INDICE = {}; }
}

const ANTIGOS = { dragao: "img:meu_dragao", cavalo: "img:meu_cavalo" };
const NIVEIS = [
  ["radiante", 0.85, "Radiante!", "#16A34A", "#4ADE80"],
  ["feliz", 0.60, "Feliz", "#5B5BD6", "#7B7BF0"],
  ["ok", 0.35, "Tranquilo", "#D97706", "#FBBF24"],
  ["triste", 0.12, "Tristinho", "#EA580C", "#FB923C"],
  ["dormindo", 0.0, "Desanimado", "#64748B", "#94A3B8"],
];
const MENSAGENS = {
  radiante: "Que semana incrível! Estou nas nuvens!",
  feliz: "Tô gostando de ver! Continua assim.",
  ok: "Dá pra melhorar... que tal concluir uma tarefa agora?",
  triste: "Ei... faz uma tarefinha comigo? Fico triste parado.",
  dormindo: "Zzz... me acorda concluindo alguma coisa da semana!",
};
const MENSAGENS_ESPECIE = {
  "dragao|radiante": "Estou cuspindo fogo de alegria!",
  "dragao|dormindo": "Zzz... nem o tesouro me anima. Bora fazer algo?",
  "cavalo|radiante": "Hiiiin! Galopando rumo a todas as metas!",
  "cavalo|triste": "Tô empacado... me ajuda com uma tarefa?",
  "cavalo|dormindo": "Cochilando em pé... bora trotar numa tarefa?",
};
const PREMIOS = [[2, "Medalha", "🏅"], [4, "Louros", "🌿"], [8, "Coroa", "👑"], [12, "Aura", "✨"]];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mais = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const hoje = () => { const x = new Date(); x.setHours(0, 0, 0, 0); return x; };
const escuro = () => getComputedStyle(document.documentElement).colorScheme === "dark";

export function petAtual() {
  const p = S.ler1("config:pet") || {};
  const esp = ANTIGOS[p.especie] || p.especie;
  return { especie: INDICE[esp] ? esp : null, nome: p.nome || "" };
}

// ---------------------------------------------------------------- humor e prêmio (iguais aos do PC)
export function calcularHumor(E) {
  const agora = new Date(), hj = hoje(), seg = mais(hj, -((hj.getDay() + 6) % 7));
  // tarefas: eventos da semana que já começaram (agenda do Google) + tarefas do Google até hoje
  let nT = 0, nF = 0;
  for (const it of E.semanas[iso(seg)]?.itens || []) {
    if (it.extendedProperties?.private?.registro_meta === "1") continue;
    const ini = it.start?.dateTime ? new Date(it.start.dateTime) : it.start?.date ? new Date(it.start.date + "T00:00:00") : null;
    if (!ini || ini < seg || ini > agora) continue;
    nT++;
    if (S.ler1(`feito:g:${it.recurringEventId || it.id}|${iso(ini)}`) !== undefined) nF++;
  }
  for (const t of E.tarefas || []) {
    if (!t.due) continue;
    const d = t.due.slice(0, 10);
    if (d < iso(seg) || d > iso(hj)) continue;
    nT++; if (t.status === "completed") nF++;
  }
  const ritmo = ((hj.getDay() + 6) % 7 + 1) / 7;
  const notas = []; let noRitmo = 0;
  for (const m of M.metas()) {
    if (!m.ref || !(m.quantidade > 0)) continue;
    const dias = [...Array(7)].map((_, i) => mais(seg, i));
    let nota;
    if (m.periodo === "diaria") {
      const v = dias.filter((d) => d < hj).map((d) => Math.min(1, M.valorDia(m, d) / m.quantidade));
      if (M.valorDia(m, hj) >= m.quantidade - 1e-9) v.push(1);
      if (!v.length) continue;
      nota = v.reduce((a, b) => a + b, 0) / v.length;
    } else {
      const feito = dias.reduce((s, d) => s + M.valorDia(m, d), 0), esperado = m.quantidade * ritmo;
      nota = esperado ? Math.min(1, feito / esperado) : 1;
    }
    notas.push(nota); if (nota >= 0.999) noRitmo++;
  }
  const partes = [];
  if (notas.length) partes.push([0.6, notas.reduce((a, b) => a + b, 0) / notas.length]);
  if (nT) partes.push([0.4, nF / nT]);
  const temDados = partes.length > 0;
  const nota = temDados ? partes.reduce((s, [p, v]) => s + p * v, 0) / partes.reduce((s, [p]) => s + p, 0) : 0.5;
  const nv = NIVEIS.find(([, min]) => nota >= min) || NIVEIS.at(-1);
  return { nota, nivel: nv[0], nome: nv[2], cor: escuro() ? nv[4] : nv[3], temDados, nT, nF, nMetas: notas.length, noRitmo };
}

export function calcularPremio() {
  let melhor = 0, titulo = "";
  for (const m of M.metas()) {
    if (!m.ref || !(m.quantidade > 0)) continue;
    const s = M.sequencia(m), semanas = m.periodo === "diaria" ? Math.floor(s.atual / 7) : s.atual;
    if (semanas > melhor) { melhor = semanas; titulo = m.titulo; }
  }
  const nivel = PREMIOS.filter(([s]) => melhor >= s).length;
  return { nivel, semanas: melhor, meta: titulo, proximo: PREMIOS[nivel] || null };
}

function mensagem(especie, humor) {
  if (!especie) return "Um ovo misterioso! Toque para escolher quem vai nascer.";
  if (!humor.temDados) return "Crie tarefas e metas para a gente cuidar da semana juntos!";
  if (humor.nivel === "dormindo") return "Buááá... a semana tá parada. Me ajuda concluindo uma tarefa?";
  const base = INDICE[especie]?.base;
  return MENSAGENS_ESPECIE[`${base}|${humor.nivel}`] || MENSAGENS[humor.nivel];
}

// ---------------------------------------------------------------- animação (folhas de quadros)
function animacao(especie, nivel, premio, tam, classe = "") {
  if (!especie) return `<div class="pet-anim ovo ${classe}" style="--t:${tam}px;background-image:url(pets/ovo.webp)"></div>`;
  const info = INDICE[especie], [n, ms] = info.anim[`${nivel}_${premio}`] || [1, 750];
  return `<div class="pet-anim ${classe}" data-n="${n}" data-ms="${ms}" style="--t:${tam}px;--n:${n};
    background-image:url(pets/${info.pasta}/${nivel}_${premio}.webp)"></div>`;
}
let relogio = null;
export function animar() {                       // um relógio só para todos os pets na tela
  if (relogio) return;
  let t = 0;
  relogio = setInterval(() => {
    t += 60;
    for (const el of document.querySelectorAll(".pet-anim[data-n]")) {
      const n = Number(el.dataset.n), ms = Number(el.dataset.ms) || 180;
      if (n < 2) continue;
      const i = Math.floor(t / ms) % n;
      if (el._i !== i) { el._i = i; el.style.backgroundPosition = `${(i * 100) / (n - 1)}% 0`; }
    }
  }, 60);
}

// ---------------------------------------------------------------- cartão (topo da aba Metas)
let notaAnterior = null;
export function cartao(E) {
  const { especie, nome } = petAtual(), h = calcularHumor(E), pr = calcularPremio();
  const premioTxt = pr.nivel ? `${PREMIOS[pr.nivel - 1][2]} ${PREMIOS[pr.nivel - 1][1]} · 🔥 ${pr.semanas} semana${pr.semanas === 1 ? "" : "s"} seguida${pr.semanas === 1 ? "" : "s"}`
    : pr.semanas ? `🔥 ${pr.semanas} semana seguida · Medalha em ${2 - pr.semanas}` : "Bata uma meta 2 semanas seguidas: ganha uma Medalha";
  const comemora = notaAnterior !== null && h.nota > notaAnterior + 0.004;
  notaAnterior = h.nota;
  if (!especie) {
    return `<button class="pet-cartao" data-acao="pet">${animacao(null, "ok", 0, 110)}
      <div class="pet-info"><div class="pet-nome"><b>Ovo misterioso</b></div>
      <p class="fala">Toque para escolher quem vai nascer!</p></div></button>`;
  }
  const info = INDICE[especie];
  const detalhe = [h.nMetas ? `${h.noRitmo} de ${h.nMetas} meta${h.nMetas === 1 ? "" : "s"} no ritmo` : "",
    h.nT ? `${h.nF} de ${h.nT} tarefas feitas` : ""].filter(Boolean).join(" · ");
  return `<button class="pet-cartao ${comemora ? "comemora" : ""}" data-acao="pet" style="--h:${h.cor}">
    ${animacao(especie, h.nivel, pr.nivel, 132, comemora ? "pula" : "")}
    <div class="pet-info">
      <div class="pet-nome"><b>${esc(nome || info.nome_padrao)}</b>
        <span class="humor">${comemora ? "Oba! ♥" : h.temDados ? h.nome : "Esperando tarefas"}</span></div>
      <p class="fala">“${esc(mensagem(especie, h))}”</p>
      ${h.temDados ? `<div class="barra-humor"><i style="width:${Math.round(h.nota * 100)}%"></i></div>` : ""}
      ${detalhe ? `<small>${detalhe}</small>` : ""}
      <div class="pet-premio">${premioTxt}</div>
    </div></button>`;
}

// ---------------------------------------------------------------- janela do pet (prêmios e trocar)
export function folha(E) {
  const atual = petAtual(), h = calcularHumor(E), pr = calcularPremio();
  let escolhido = atual.especie || (INDICE["img:meu_dragao"] ? "img:meu_dragao" : Object.keys(INDICE)[0]);
  let nomeEditado = !!atual.nome;
  const grade = Object.entries(INDICE).map(([cod, inf]) => `
    <button type="button" class="pet-opcao ${cod === escolhido ? "sel" : ""}" data-especie="${esc(cod)}">
      ${animacao(cod, "feliz", 0, 72)}<span>${esc(inf.nome)}</span></button>`).join("");
  const premios = PREMIOS.map(([s, n, ic], i) => `<div class="premio ${pr.nivel > i ? "ganho" : ""}">
    <b>${pr.nivel > i ? "✓ " : ""}${ic} ${n}</b><small>${s} semanas</small></div>`).join("");
  let texto = pr.semanas ? `Maior sequência agora: ${pr.semanas} semana${pr.semanas === 1 ? "" : "s"}${pr.meta ? ` (${esc(pr.meta)})` : ""}.`
    : "Bata uma meta por 2 semanas seguidas para ganhar o primeiro prêmio.";
  if (pr.proximo && pr.semanas) { const f = pr.proximo[0] - pr.semanas; texto += ` Próximo: ${pr.proximo[1]} em ${f} semana${f === 1 ? "" : "s"}.`; }
  C.abrirFolha(`
    <div class="balao">${esc(mensagem(atual.especie, h))}</div>
    <div class="pet-grande">${animacao(atual.especie, h.nivel, pr.nivel, 200)}</div>
    ${atual.especie ? `<h2 class="centro">${esc(atual.nome || INDICE[atual.especie].nome_padrao)}</h2>
      <p class="centro" style="color:${h.cor};margin-top:-8px">${esc(INDICE[atual.especie].nome)} · ${h.temDados ? h.nome : "Esperando tarefas"}</p>
      <div class="linha-humor"><div class="barra-humor" style="--h:${h.cor}"><i style="width:${Math.round(h.nota * 100)}%"></i></div>
        <b>${Math.round(h.nota * 100)}%</b></div>
      ${h.nT ? `<p class="nota">Tarefas desta semana (até agora): ${h.nF} de ${h.nT} feitas</p>` : ""}
      ${h.nMetas ? `<p class="nota">Metas no ritmo: ${h.noRitmo} de ${h.nMetas}</p>` : ""}` : ""}
    <p class="nota">O humor vem da semana atual: tarefas feitas e o ritmo das metas (sem cobrar o que ainda não chegou). Toda segunda ele recomeça.</p>
    <h3>Prêmios da sequência</h3>
    <div class="premios">${premios}</div>
    <p class="nota">${texto} Metas diárias contam 7 dias seguidos como 1 semana.</p>
    <h3>${atual.especie ? "Trocar de pet" : "Chocar o ovo: escolha seu pet"}</h3>
    <div class="pet-grade">${grade}</div>
    <label class="campo">Nome<input name="nome" maxlength="24" value="${esc(atual.nome || INDICE[escolhido]?.nome_padrao || "")}"></label>
    <div class="acoes"><span></span><button class="botao-leve" data-f="fechar">Fechar</button>
      <button class="botao-principal" data-f="salvar">${atual.especie ? "Salvar" : "Chocar!"}</button></div>`, (p) => {
    const campo = p.querySelector("input[name=nome]");
    campo.addEventListener("input", () => { nomeEditado = true; });
    p.addEventListener("click", (e) => {
      const op = e.target.closest("[data-especie]");
      if (op) {
        escolhido = op.dataset.especie;
        p.querySelectorAll(".pet-opcao").forEach((x) => x.classList.toggle("sel", x === op));
        if (!nomeEditado) campo.value = INDICE[escolhido].nome_padrao;
      }
      const f = e.target.closest("[data-f]")?.dataset.f;
      if (f === "fechar") C.fecharFolha();
      if (f === "salvar") {
        const nome = campo.value.trim() || INDICE[escolhido].nome_padrao;
        S.alterar({ "config:pet": { especie: escolhido, nome } });
        C.fecharFolha(); C.render();
        C.avisar(atual.especie === escolhido ? "Pet salvo." : `${nome} chegou! 🎉`);
      }
    });
  });
}
