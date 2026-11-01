// Modo demonstração (?demo): mesmas funções de google.js, com dados de exemplo guardados só neste aparelho.
// Serve para ver o app antes de configurar o Google e para os testes automáticos.
export class PrecisaEntrar extends Error {}
const CHAVE = "agenda.demo";
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mais = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function inicial() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const em = (dias, h, m = 0) => { const d = mais(hoje, dias); d.setHours(h, m); return d.toISOString(); };
  const ev = (id, titulo, cat, cor, ini, fim, extra = {}) => ({
    id, summary: titulo, colorId: cor, start: { dateTime: ini }, end: { dateTime: fim },
    extendedProperties: { private: { categoria_agenda: cat } }, ...extra,
  });
  const dia = (id, titulo, cat, cor, d, extra = {}) => ({
    id, summary: titulo, colorId: cor, start: { date: iso(mais(hoje, d)) }, end: { date: iso(mais(hoje, d + 1)) },
    extendedProperties: { private: { categoria_agenda: cat, ...(extra.registro ? { registro_meta: "1" } : {}) } },
    ...(extra.registro ? { transparency: "transparent" } : {}),
  });
  return {
    eventos: [
      ev("e1", "Aula de Cálculo", "Estudos", "3", em(0, 8), em(0, 10), { description: "Bloco CJ, sala 4" }),
      ev("e2", "Almoço com a família", "Pessoal", "9", em(0, 12), em(0, 13, 30)),
      ev("e3", "Reunião do projeto", "Trabalho", "6", em(0, 15), em(0, 16)),
      ev("e4", "Academia", "Pessoal", "9", em(1, 7), em(1, 8)),
      ev("e5", "Dentista", "Compromisso", "10", em(2, 9, 30), em(2, 10, 30)),
      ev("e6", "Estudar circuitos", "Estudos", "3", em(-1, 19), em(-1, 21)),
      dia("e7", "✓ Leitura ×3", "Estudos", "3", 0, { registro: true }),
      dia("e8", "Aniversário da Ana", "Pessoal", "9", 3),
    ],
    listas: [{ id: "l1", title: "Minhas tarefas" }],
    tarefas: [
      { id: "t1", _lista: "l1", title: "Entregar relatório", due: iso(hoje) + "T00:00:00.000Z", status: "needsAction" },
      { id: "t2", _lista: "l1", title: "Pagar conta de luz", due: iso(mais(hoje, -1)) + "T00:00:00.000Z", status: "needsAction" },
      { id: "t3", _lista: "l1", title: "Comprar presente", due: iso(mais(hoje, 2)) + "T00:00:00.000Z", status: "needsAction",
        notes: "Livro ou fone" },
      { id: "t4", _lista: "l1", title: "Ler capítulo 3", status: "needsAction" },
      { id: "t5", _lista: "l1", title: "Revisar lista 2", due: iso(hoje) + "T00:00:00.000Z", status: "completed" },
    ],
  };
}
const ler = () => { try { return JSON.parse(localStorage.getItem(CHAVE)) || inicial(); } catch { return inicial(); } };
const gravar = (d) => { try { localStorage.setItem(CHAVE, JSON.stringify(d)); } catch { /* sem armazenamento */ } };
const espera = (v) => new Promise((ok) => setTimeout(() => ok(v), 120));
const novoId = () => "x" + Math.random().toString(36).slice(2, 9);

export const sessao = () => ({ email: "demonstracao@exemplo.com" });
export const email = () => "demonstracao@exemplo.com";
export const conectou = () => true;
export const tokenValido = () => true;
export const configurado = () => true;
export const capturarRetorno = () => null;
export const entrar = () => {};
export const sair = () => { localStorage.removeItem(CHAVE); };
export const lerConta = () => espera(email());

export async function listarEventos(ini, fim) {
  const d = ler();
  const de = (x) => new Date(x.dateTime || x.date + "T00:00:00");
  return espera(d.eventos.filter((e) => de(e.start) < fim && de(e.end) > ini)
    .sort((a, b) => de(a.start) - de(b.start)));
}
export async function criarEvento(corpo) {
  const d = ler(); const e = { ...corpo, id: novoId() }; d.eventos.push(e); gravar(d); return espera(e);
}
export async function alterarEvento(id, corpo) {
  const d = ler(); const e = d.eventos.find((x) => x.id === id); Object.assign(e, corpo); gravar(d); return espera(e);
}
export async function apagarEvento(id) {
  const d = ler(); d.eventos = d.eventos.filter((x) => x.id !== id); gravar(d); return espera({});
}
export async function listarTarefas() {
  const d = ler(); return espera({ listas: d.listas, tarefas: d.tarefas.map((t) => ({ ...t, _nomeLista: "Minhas tarefas" })) });
}
export async function criarTarefa(lista, corpo) {
  const d = ler(); const t = { ...corpo, id: novoId(), _lista: lista, status: "needsAction" }; d.tarefas.push(t); gravar(d); return espera(t);
}
export async function alterarTarefa(lista, id, corpo) {
  const d = ler(); const t = d.tarefas.find((x) => x.id === id); Object.assign(t, corpo);
  if (corpo.due === null) delete t.due;
  gravar(d); return espera(t);
}
export async function apagarTarefa(lista, id) {
  const d = ler(); d.tarefas = d.tarefas.filter((x) => x.id !== id); gravar(d); return espera({});
}

// Drive de mentira (dados de exemplo das metas)
export async function driveBaixar() {
  let doc = null;
  try { doc = JSON.parse(localStorage.getItem("agenda.demo.drive")); } catch { /* nada */ }
  if (!doc) {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const itens = {
      "meta:m1": { titulo: "Leitura", categoria: "Estudos", unidade: "vezes", quantidade: 5, periodo: "semanal", ref: "u:a1" },
      "tarefa:a1": { titulo: "Leitura", categoria: "Estudos", notas: "", agendada: false, data: iso(hoje), inicio: "00:00",
        fim: "00:00", dia_inteiro: false, repetir: "nenhuma", repetir_ate: null },
      "meta:m2": { titulo: "Estudar circuitos", categoria: "Estudos", unidade: "horas", quantidade: 6, periodo: "semanal", ref: "g:e6" },
      "meta:m3": { titulo: "Academia", categoria: "Pessoal", unidade: "vezes", quantidade: 1, periodo: "diaria", ref: "g:e4" },
    };
    for (let k = 1; k < 70; k++) {
      const d = iso(mais(hoje, -k));
      if (k % 3) itens[`reg:m1|${d}`] = 1 + (k % 4 === 0 ? 2 : 0);
      if (k % 2) itens[`feito:g:e6|${d}`] = 2;
      if (k < 9 || k % 4) itens[`feito:g:e4|${d}`] = 1;
    }
    itens[`reg:m1|${iso(hoje)}`] = 1;
    doc = { itens };
    localStorage.setItem("agenda.demo.drive", JSON.stringify(doc));
  }
  return espera({ fid: "demo", itens: doc.itens });
}
export async function driveSubir(fid, itens) {
  localStorage.setItem("agenda.demo.drive", JSON.stringify({ itens })); return espera("demo");
}
