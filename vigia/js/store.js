// Armazenamento: configurações (localStorage) e evidências (IndexedDB)

export const LS = {
  get(k, d) { try { const v = localStorage.getItem('vigia_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('vigia_' + k, JSON.stringify(v)); } catch {} },
};

export const cfg = Object.assign(
  { ini: '23:30', fim: '06:30', sens: '1.2', lem: '23:15', int: '10', max: '20', grace: '60', name: '' },
  LS.get('cfg', {})
);
export const saveCfg = () => LS.set('cfg', cfg);

let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open('vigia', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('fotos', { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction('fotos', mode);
    const req = fn(t.objectStore('fotos'));
    t.oncomplete = () => res(req && 'result' in req ? req.result : undefined);
    t.onerror = () => rej(t.error);
  });
}

export const fotos = {
  add: (f) => tx('readwrite', (s) => s.add(f)),
  all: () => tx('readonly', (s) => s.getAll()),
  clear: () => tx('readwrite', (s) => s.clear()),
  async markOk(ev) {
    const all = await fotos.all();
    await tx('readwrite', (s) => { all.filter((f) => f.ev === ev).forEach((f) => { f.ok = true; s.put(f); }); });
  },
};

// ---- Janela de horário ----
const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export function inWindow(d = new Date()) {
  const n = d.getHours() * 60 + d.getMinutes(), a = mins(cfg.ini), b = mins(cfg.fim);
  return a <= b ? n >= a && n < b : n >= a || n < b;
}
export const graceUntil = () => LS.get('grace', 0);
export function isArmed(now = Date.now()) {
  if (now < graceUntil()) return false;            // pausado após código correto
  if (now < LS.get('testUntil', 0)) return true;   // simulação
  return inWindow(new Date(now));
}

// ---- Formatação ----
export const pad2 = (n) => String(n).padStart(2, '0');
export const hhmm = (d) => pad2(d.getHours()) + ':' + pad2(d.getMinutes());
export const dataHora = (ts) => { const d = new Date(ts); return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + ' · ' + hhmm(d) + ':' + pad2(d.getSeconds()); };
