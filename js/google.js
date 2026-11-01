// Login no Google (OAuth por redirecionamento, funciona também no iPhone com o app na tela inicial)
// e acesso às APIs do Google Agenda e do Google Tasks.
import { CLIENT_ID } from "./config.js";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary";
const TASKS = "https://tasks.googleapis.com/tasks/v1";
export const ESCOPOS = [
  "https://www.googleapis.com/auth/calendar.events",
  "email",
  "profile",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/drive.appdata",
].join(" ");

const CHAVE = "agenda.sessao";      // {token, expira, email}
const CHAVE_ESTADO = "agenda.oauth"; // {state, volta}

export class PrecisaEntrar extends Error {
  constructor(msg = "Entre de novo na sua conta Google.") { super(msg); this.name = "PrecisaEntrar"; }
}

function ler(chave) {
  try { return JSON.parse(localStorage.getItem(chave) || "null"); } catch { return null; }
}
function gravar(chave, valor) {
  try { valor == null ? localStorage.removeItem(chave) : localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ }
}

export const sessao = () => ler(CHAVE) || {};
export const email = () => sessao().email || "";
export const conectou = () => !!email();
export const tokenValido = () => { const s = sessao(); return !!s.token && Date.now() < (s.expira || 0) - 60_000; };
export const configurado = () => !!CLIENT_ID;

function enderecoRetorno() {
  return location.origin + location.pathname.replace(/index\.html$/, "");
}

/** Vai para a página do Google. `silencioso`: só renova (sem tela), se a conta ainda estiver logada no navegador. */
export function entrar({ silencioso = false, trocarConta = false, volta = "" } = {}) {
  if (!CLIENT_ID) throw new Error("O ID do cliente do Google ainda não foi configurado.");
  const state = crypto.getRandomValues(new Uint32Array(4)).join("-");
  gravar(CHAVE_ESTADO, { state, volta, silencioso });
  const q = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: enderecoRetorno(), response_type: "token",
    scope: ESCOPOS, include_granted_scopes: "true", state,
  });
  if (silencioso) q.set("prompt", "none");
  else if (trocarConta) q.set("prompt", "select_account");
  if (email() && !trocarConta) q.set("login_hint", email());
  location.assign(AUTH + "?" + q.toString());
}

/** Na volta do Google (#access_token=... ou #error=...). Devolve {ok|erro, volta} ou null. */
export function capturarRetorno() {
  const h = location.hash.slice(1);
  if (!/(^|&)(access_token|error)=/.test(h)) return null;
  const p = new URLSearchParams(h);
  history.replaceState(null, "", location.pathname + location.search);
  const estado = ler(CHAVE_ESTADO) || {};
  gravar(CHAVE_ESTADO, null);
  if (!estado.state || p.get("state") !== estado.state) return { erro: "estado_invalido", volta: estado.volta };
  if (p.get("error")) return { erro: p.get("error"), volta: estado.volta, silencioso: estado.silencioso };
  const concedidos = (p.get("scope") || "").split(" ");
  gravar(CHAVE, {
    ...sessao(), token: p.get("access_token"),
    expira: Date.now() + Number(p.get("expires_in") || 3600) * 1000, escopos: concedidos,
  });
  return { ok: true, volta: estado.volta };
}

export function sair() {
  const s = sessao();
  if (s.token) fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(s.token), { method: "POST" }).catch(() => {});
  gravar(CHAVE, null);
}

function traduzir(status, dados) {
  const motivo = dados?.error?.errors?.[0]?.reason || dados?.error?.status || "";
  const msg = dados?.error?.message || "";
  if (/accessNotConfigured|SERVICE_DISABLED/.test(motivo + msg)) {
    const api = /tasks/i.test(msg) ? "Google Tasks API" : /drive/i.test(msg) ? "Google Drive API" : "Google Calendar API";
    return `Ative a “${api}” no seu projeto do Google Cloud.`;
  }
  if (status === 403 && /insufficient|scope/i.test(motivo + msg)) return "Falta permissão: saia e entre de novo.";
  if (status === 404) return "Não encontrado (talvez já tenha sido apagado).";
  if (status === 429 || /rateLimit|quota/i.test(motivo)) return "O Google pediu uma pausa. Tente daqui a pouco.";
  return msg || `O Google recusou o pedido (erro ${status}).`;
}

export async function api(metodo, url, corpo) {
  if (!tokenValido()) throw new PrecisaEntrar();
  let r;
  try {
    r = await fetch(url, {
      method: metodo,
      headers: { Authorization: "Bearer " + sessao().token, ...(corpo ? { "Content-Type": "application/json" } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new Error("Sem internet agora.");
  }
  if (r.status === 401) { gravar(CHAVE, { ...sessao(), token: null }); throw new PrecisaEntrar(); }
  if (r.status === 204) return {};
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(traduzir(r.status, dados));
  return dados;
}

// ---------------------------------------------------------------- conta
export async function lerConta() {
  const eu = await api("GET", "https://www.googleapis.com/oauth2/v3/userinfo");
  gravar(CHAVE, { ...sessao(), email: eu.email || "", nome: eu.name || "", foto: eu.picture || "" });
  return eu.email;
}

// ---------------------------------------------------------------- Google Agenda
export async function listarEventos(ini, fim) {
  const itens = [];
  let pagina = "";
  do {
    const q = new URLSearchParams({
      timeMin: ini.toISOString(), timeMax: fim.toISOString(), singleEvents: "true",
      orderBy: "startTime", maxResults: "250", ...(pagina ? { pageToken: pagina } : {}),
    });
    const d = await api("GET", `${CAL}/events?${q}`);
    itens.push(...(d.items || []));
    pagina = d.nextPageToken || "";
  } while (pagina);
  return itens;
}
export const criarEvento = (corpo) => api("POST", `${CAL}/events`, corpo);
export const alterarEvento = (id, corpo) => api("PATCH", `${CAL}/events/${encodeURIComponent(id)}`, corpo);
export const apagarEvento = (id) => api("DELETE", `${CAL}/events/${encodeURIComponent(id)}`);

// ---------------------------------------------------------------- Google Tasks
export async function listarTarefas() {
  const listas = (await api("GET", `${TASKS}/users/@me/lists?maxResults=100`)).items || [];
  const todas = [];
  for (const l of listas) {
    let pagina = "";
    do {
      const q = new URLSearchParams({ showCompleted: "true", showHidden: "true", maxResults: "100",
                                      ...(pagina ? { pageToken: pagina } : {}) });
      const d = await api("GET", `${TASKS}/lists/${encodeURIComponent(l.id)}/tasks?${q}`);
      for (const t of d.items || []) if (!t.deleted && t.title !== undefined) todas.push({ ...t, _lista: l.id, _nomeLista: l.title });
      pagina = d.nextPageToken || "";
    } while (pagina);
  }
  return { listas, tarefas: todas };
}
export const criarTarefa = (lista, corpo) => api("POST", `${TASKS}/lists/${encodeURIComponent(lista)}/tasks`, corpo);
export const alterarTarefa = (lista, id, corpo) =>
  api("PATCH", `${TASKS}/lists/${encodeURIComponent(lista)}/tasks/${encodeURIComponent(id)}`, corpo);
export const apagarTarefa = (lista, id) =>
  api("DELETE", `${TASKS}/lists/${encodeURIComponent(lista)}/tasks/${encodeURIComponent(id)}`);
