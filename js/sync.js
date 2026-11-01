// Dados compartilhados com o app do computador (metas, registros, feitos, categorias, pet),
// guardados neste aparelho e sincronizados por um arquivo escondido no Google Drive (mescla de 3 vias).
const K_LOCAL = "agenda.sync.local", K_BASE = "agenda.sync.base", K_FID = "agenda.sync.fid", K_ULTIMA = "agenda.sync.ultima";

let G = null;
const ler = (k, p) => { try { const v = localStorage.getItem(k); return v == null ? p : JSON.parse(v); } catch { return p; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* cheio */ } };

let itens = ler(K_LOCAL, {});
export const estado = { ocupado: false, erro: "", ultima: ler(K_ULTIMA, 0), carregou: !!ler(K_ULTIMA, 0) };
const ouvintes = [];
export const ouvir = (f) => ouvintes.push(f);
const avisar = () => ouvintes.forEach((f) => { try { f(); } catch { /* ignora */ } });

export function iniciar(google) { G = google; }
export const todos = () => itens;
export const ler1 = (k) => itens[k];

export function igual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => igual(a[k], b[k]));
}

export function mesclar(base, local, remoto) {
  const res = {}, aplicar = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remoto)])) {
    const b = base[k], l = local[k], r = remoto[k];
    const v = igual(l, r) ? l : igual(l, b) ? r : l;    // só o outro mudou -> vale o dele; senão, o daqui
    if (v !== undefined && v !== null) res[k] = v;
    if (!igual(v, l)) aplicar[k] = v;
  }
  return { res, aplicar };
}

/** Muda um item aqui (null/undefined apaga) e sincroniza logo em seguida. */
export function alterar(mudancas) {
  for (const [k, v] of Object.entries(mudancas)) {
    if (v === null || v === undefined) delete itens[k]; else itens[k] = v;
  }
  gravar(K_LOCAL, itens);
  avisar();
  agendar(1500);
}

let tempo;
export function agendar(ms = 1500) { clearTimeout(tempo); tempo = setTimeout(sincronizar, ms); }

export async function sincronizar() {
  if (!G || estado.ocupado || !G.tokenValido()) return;
  estado.ocupado = true; avisar();
  try {
    const { fid, itens: remoto } = await G.driveBaixar();
    const base = ler(K_BASE, {});
    const { res } = mesclar(base, itens, remoto);
    itens = res;
    gravar(K_LOCAL, itens);
    let id = fid;
    if (!igual(res, remoto) || !fid) id = await G.driveSubir(fid, res);
    gravar(K_FID, id);
    gravar(K_BASE, res);
    estado.ultima = Date.now(); estado.carregou = true; estado.erro = "";
    gravar(K_ULTIMA, estado.ultima);
  } catch (e) {
    estado.erro = e?.name === "PrecisaEntrar" ? "" : (e?.message || "Não consegui sincronizar.");
    if (e?.name === "PrecisaEntrar") estado.precisaEntrar = true;
  } finally {
    estado.ocupado = false; avisar();
  }
}

export function esquecer() {
  itens = {};
  for (const k of [K_LOCAL, K_BASE, K_FID, K_ULTIMA]) localStorage.removeItem(k);
  estado.ultima = 0; estado.carregou = false;
}
