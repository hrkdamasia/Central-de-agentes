// Vigia · telas, abas e lógica da missão
import { LS, cfg, saveCfg, fotos, isArmed, inWindow, graceUntil, hhmm, pad2, dataHora } from './store.js';
import { camOn, camOff, snap, motion, enableMotion, keepAwake, releaseAwake, sleep } from './sensors.js';
import { initPad, askPin, hasPin, setPin, clearPin } from './pin.js';

const $ = (id) => document.getElementById(id);

// ---------- utilidades de interface ----------
function toast(t) {
  const el = $('toast'); el.textContent = t; el.classList.add('s');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('s'), 2800);
}
function ask(title, value = '') {
  $('d_title').textContent = title; $('d_input').value = value; $('dialog').hidden = false;
  setTimeout(() => $('d_input').focus(), 50);
  return new Promise((r) => {
    $('d_ok').onclick = () => { $('dialog').hidden = true; r($('d_input').value.trim()); };
    $('d_no').onclick = () => { $('dialog').hidden = true; r(null); };
  });
}

// ---------- abas ----------
const TABS = { missao: 'Missão', evidencias: 'Evidências', operacao: 'Operação', alertas: 'Alertas', cofre: 'Cofre' };
function go(tab) {
  if (!TABS[tab]) tab = 'missao';
  document.querySelectorAll('.tab').forEach((s) => (s.hidden = s.dataset.tab !== tab));
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.go === tab));
  const sec = document.querySelector(`.tab[data-tab="${tab}"]`);
  $('hdr_kicker').textContent = TABS[tab];
  $('hdr_title').textContent = sec.dataset.title;
  if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
  window.scrollTo(0, 0);
  render(tab);
}
document.querySelectorAll('.tabbar button').forEach((b) => (b.onclick = () => go(b.dataset.go)));

function render(tab) {
  $('hdr_agent').textContent = cfg.name ? 'Agente ' + cfg.name : 'Agente';
  if (tab === 'missao') renderMissao();
  if (tab === 'evidencias') renderDossie();
  if (tab === 'operacao') ['ini', 'fim', 'sens', 'int', 'max', 'grace'].forEach((k) => ($('c_' + k).value = cfg[k]));
  if (tab === 'alertas') $('c_lem').value = cfg.lem;
  if (tab === 'cofre') renderProtocolo();
}
const currentTab = () => (location.hash.slice(1) in TABS ? location.hash.slice(1) : 'missao');

// ---------- Missão ----------
async function renderMissao() {
  const now = Date.now(), g = graceUntil(), st = $('m_status'), radar = document.querySelector('.radar');
  if (now < g) { st.textContent = 'Pausado até ' + hhmm(new Date(g)); st.className = 'status pause'; radar.classList.add('off'); }
  else if (isArmed()) { st.textContent = 'Em horário de vigia'; st.className = 'status armed'; radar.classList.remove('off'); }
  else { st.textContent = 'Fora de operação'; st.className = 'status'; radar.classList.add('off'); }
  $('m_window').textContent = 'Janela: ' + cfg.ini + ' → ' + cfg.fim;
  let all = [];
  try { all = await fotos.all(); } catch {}
  const evs = [...new Set(all.map((f) => f.ev))].sort((a, b) => b - a);
  $('st_events').textContent = evs.length;
  $('st_photos').textContent = all.length;
  $('st_last').textContent = evs.length ? (() => { const d = new Date(evs[0]); return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1); })() : '—';
}

// ---------- Evidências ----------
const urls = [];
async function renderDossie() {
  urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  let all = [];
  try { all = await fotos.all(); } catch {}
  const box = $('dossie');
  if (!all.length) {
    box.innerHTML = '<div class="empty"><svg><use href="#i-pasta"/></svg><p><b>Nenhuma evidência</b></p><p class="small">Quando alguém mexer no celular durante a vigia, as fotos aparecem aqui.</p></div>';
    return;
  }
  const byEv = {};
  all.forEach((f) => (byEv[f.ev] = byEv[f.ev] || []).push(f));
  const evs = Object.keys(byEv).map(Number).sort((a, b) => b - a);
  box.innerHTML = '';
  evs.forEach((ev, i) => {
    const list = byEv[ev].sort((a, b) => a.ts - b.ts);
    const ok = list.some((f) => f.ok);
    const el = document.createElement('article');
    el.className = 'file';
    el.innerHTML = `<div class="file-h"><div><b>Ocorrência #${pad2(evs.length - i)}</b><small>${dataHora(ev)} · ${list.length} foto${list.length > 1 ? 's' : ''}</small></div>
      <span class="stamp ${ok ? 'ok' : ''}">${ok ? 'Código ok' : 'Suspeito'}</span></div><div class="grid"></div>`;
    const grid = el.querySelector('.grid');
    list.forEach((f) => {
      const im = document.createElement('img');
      const u = URL.createObjectURL(f.blob); urls.push(u);
      im.src = u; im.loading = 'lazy'; im.alt = 'Evidência';
      im.onclick = () => openViewer(f);
      grid.appendChild(im);
    });
    box.appendChild(el);
  });
}
let vCur = null, vUrl = null;
function openViewer(f) {
  vCur = f; if (vUrl) URL.revokeObjectURL(vUrl);
  vUrl = URL.createObjectURL(f.blob);
  $('v_img').src = vUrl; $('v_cap').textContent = dataHora(f.ts); $('viewer').hidden = false;
}
$('v_close').onclick = () => ($('viewer').hidden = true);
$('v_save').onclick = async () => {
  if (!vCur) return;
  const file = new File([vCur.blob], 'evidencia-' + vCur.ts + '.jpg', { type: 'image/jpeg' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file] });
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); }
  } catch {}
};

// ---------- Operação ----------
['ini', 'fim', 'sens', 'int', 'max', 'grace', 'lem'].forEach((k) =>
  $('c_' + k).addEventListener('change', (e) => { if (!e.target.value) return; cfg[k] = e.target.value; saveCfg(); toast('Parâmetro atualizado'); })
);

// ---------- Alertas (.ics) ----------
$('b_ics').onclick = () => {
  const [h, m] = cfg.lem.split(':').map(Number), d = new Date();
  const ds = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + 'T' + pad2(h) + pad2(m) + '00';
  const url = location.href.split('#')[0];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vigia//PT-BR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    'UID:vigia-' + Date.now() + '@vigia', 'DTSTAMP:' + stamp,
    'DTSTART;TZID=America/Sao_Paulo:' + ds, 'DURATION:PT5M', 'RRULE:FREQ=DAILY',
    'SUMMARY:Vamos ativar seu vigia noturno? 🌙', 'DESCRIPTION:Abra o Vigia e toque em Iniciar vigia: ' + url, 'URL:' + url,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Vamos ativar seu vigia noturno? 🌙', 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  a.download = 'lembrete-vigia.ics';
  document.body.appendChild(a); a.click(); a.remove();
};

// ---------- Cofre ----------
function renderProtocolo() {
  const done = LS.get('proto', {});
  document.querySelectorAll('#protocolo li').forEach((li) => {
    li.classList.toggle('done', !!done[li.dataset.k]);
    li.onclick = () => { done[li.dataset.k] = !done[li.dataset.k]; LS.set('proto', done); li.classList.toggle('done'); };
  });
}
$('b_name').onclick = async () => {
  const n = await ask('Novo codinome', cfg.name);
  if (n === null) return;
  cfg.name = n; saveCfg(); render(currentTab()); toast('Codinome atualizado');
};
$('b_pin').onclick = async () => {
  if (!(await askPin('Código atual', 'Confirme para trocar', true))) return;
  clearPin(); showSetup(true);
};
$('b_wipe').onclick = async () => {
  if (!(await askPin('Destruir evidências', 'Digite o código para confirmar', true))) return;
  await fotos.clear(); render(currentTab()); toast('Evidências destruídas');
};

// ---------- Recrutamento ----------
function showSetup(onlyPin) {
  $('app').hidden = true; $('setup').hidden = false;
  $('s_name').value = cfg.name; $('s_pin').value = ''; $('s_pin2').value = ''; $('s_err').textContent = '';
  $('s_name').closest('.card').querySelector('label').hidden = !!onlyPin;
  $('s_name').hidden = !!onlyPin;
}
$('s_save').onclick = async () => {
  const a = $('s_pin').value.trim(), b = $('s_pin2').value.trim();
  if (!/^\d{4,8}$/.test(a)) return ($('s_err').textContent = 'O código precisa ter de 4 a 8 números.');
  if (a !== b) return ($('s_err').textContent = 'Os códigos não conferem.');
  if (!$('s_name').hidden) cfg.name = $('s_name').value.trim();
  await setPin(a); saveCfg();
  $('setup').hidden = true; $('app').hidden = false; go(currentTab()); toast('Credenciais registradas ✓');
};

// ---------- Missão: modo vigia ----------
let watching = false, alarm = false, tick = null;

$('b_start').onclick = () => startWatch(false);
$('b_test').onclick = () => startWatch(true);

async function startWatch(test) {
  if (!(await enableMotion())) return toast('Permita o acesso ao movimento para o vigia funcionar.');
  const okCam = await camOn(); camOff(); // pede a permissão da câmera agora, com você olhando
  if (!okCam) return toast('Permita o acesso à câmera para o vigia funcionar.');
  if (test) LS.set('testUntil', Date.now() + 5 * 60 * 1000);
  motion.threshold = cfg.sens;
  motion.quietUntil = Date.now() + 15000;
  motion.onMove(trigger);
  watching = true;
  $('watch').hidden = false; keepAwake(); updWatch();
  clearInterval(tick); tick = setInterval(updWatch, 1000);
  toast('Posicione o celular. Armando em 15 s.');
}

function updWatch() {
  $('w_clock').textContent = hhmm(new Date());
  const now = Date.now(), g = graceUntil(), st = $('w_st');
  let s, armed = false;
  if (now < motion.quietUntil && !alarm) s = 'Armando em ' + Math.ceil((motion.quietUntil - now) / 1000) + ' s';
  else if (now < g) s = 'Pausado até ' + hhmm(new Date(g));
  else if (isArmed()) { s = '● Vigia ativo'; armed = true; }
  else s = 'Aguardando ' + cfg.ini;
  st.textContent = s; st.classList.toggle('armed', armed);
}

async function trigger() {
  if (!watching || alarm || !isArmed()) return;
  alarm = true;
  const ev = Date.now();
  askPin('Acesso restrito', 'Digite o código para continuar', false).then(() => {
    alarm = false;
    LS.set('grace', Date.now() + Number(cfg.grace) * 60 * 1000);
    LS.set('testUntil', 0);
    fotos.markOk(ev).catch(() => {});
    camOff();
    motion.quietUntil = Date.now() + 3000;
    toast('Identidade confirmada. Vigia pausado.');
  });
  if (!(await camOn())) return;
  for (let i = 0; i < 3 && alarm; i++) { await snap(ev); await sleep(600); }
  let n = 3;
  const max = Number(cfg.max), every = Number(cfg.int) * 1000;
  while (alarm && n < max) {
    await sleep(every);
    if (alarm) { await snap(ev); n++; }
  }
  if (alarm) camOff(); // limite atingido; o código continua sendo pedido
}

$('w_exit').onclick = async () => {
  if (alarm) return;
  motion.quietUntil = Date.now() + 60000; // não dispara enquanto você digita
  const ok = await askPin('Encerrar missão', 'Digite seu código', true);
  if (!ok) { motion.quietUntil = Date.now() + 3000; return; }
  watching = false; motion.onMove(null); clearInterval(tick); camOff(); releaseAwake();
  LS.set('testUntil', 0);
  $('watch').hidden = true; go('missao');
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && watching) keepAwake();
});

// ---------- Início ----------
initPad();
if (!window.isSecureContext) toast('Abra o Vigia por um endereço https:// para liberar a câmera.');
if (hasPin()) { $('app').hidden = false; go(currentTab()); } else showSetup(false);
setInterval(() => { if (!watching && !$('app').hidden && currentTab() === 'missao') renderMissao(); }, 30000);

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
