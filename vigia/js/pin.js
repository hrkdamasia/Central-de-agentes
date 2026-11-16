// Código de acesso: hash e teclado numérico
import { LS } from './store.js';

const $ = (id) => document.getElementById(id);

export async function hash(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('vigia:' + s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
}
export const hasPin = () => !!LS.get('pin', null);
export const setPin = async (p) => LS.set('pin', await hash(p));
export const clearPin = () => LS.set('pin', null);
const checkPin = async (p) => (await hash(p)) === LS.get('pin', null);

let resolveFn = null, buf = '';

function dots() {
  const n = Math.max(4, buf.length);
  $('l_dots').innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < buf.length ? 'f' : ''}"></i>`).join('');
}
async function key(k) {
  if (k === '⌫') { buf = buf.slice(0, -1); dots(); return; }
  if (!k || buf.length >= 8) return;
  buf += k; dots();
  if (buf.length >= 4 && (await checkPin(buf))) { const r = resolveFn; close(); r && r(true); }
  else if (buf.length === 8) {
    $('l_dots').classList.add('shake');
    setTimeout(() => { $('l_dots').classList.remove('shake'); buf = ''; dots(); }, 350);
  }
}
function close() { $('lock').hidden = true; resolveFn = null; buf = ''; }

export function initPad() {
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].forEach((k) => {
    const b = document.createElement('button');
    b.textContent = k;
    if (!k) b.style.visibility = 'hidden';
    if (k === '⌫') b.className = 'nb';
    b.onclick = () => key(k);
    $('l_pad').appendChild(b);
  });
  $('l_cancel').onclick = () => { const r = resolveFn; close(); r && r(false); };
}

/** Mostra o teclado. Resolve true quando o código está certo, false se cancelar. */
export function askPin(title, sub, cancelable) {
  buf = ''; dots();
  $('l_title').textContent = title;
  $('l_sub').textContent = sub;
  $('l_cancel').hidden = !cancelable;
  $('lock').hidden = false;
  return new Promise((r) => { resolveFn = r; });
}
