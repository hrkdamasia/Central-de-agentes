// Câmera frontal, sensor de movimento e tela sempre acesa
import { fotos } from './store.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

// ---------- Câmera ----------
let stream = null;
const video = () => document.getElementById('cam');

export async function camOn() {
  if (stream) return true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false,
    });
    const v = video();
    v.srcObject = stream;
    await v.play().catch(() => {});
    await new Promise((r) => { if (v.readyState >= 2 && v.videoWidth) r(); else { v.onloadeddata = r; setTimeout(r, 1500); } });
    await sleep(500); // tempo para ajustar a exposição
    return true;
  } catch { stream = null; return false; }
}

export function camOff() {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
  stream = null;
  video().srcObject = null;
}

export async function snap(ev) {
  const v = video();
  if (!stream || !v.videoWidth) return false;
  const c = document.getElementById('cv');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
  if (!blob) return false;
  try { await fotos.add({ ev, ts: Date.now(), blob }); return true; } catch { return false; }
}

// ---------- Movimento ----------
let last = null, ready = false, handler = null, threshold = 1.2;
export const motion = {
  quietUntil: 0,
  set threshold(v) { threshold = Number(v); },
  onMove(fn) { handler = fn; },
};
function onDeviceMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x === null) return;
  if (last) {
    const d = Math.abs(a.x - last.x) + Math.abs(a.y - last.y) + Math.abs(a.z - last.z);
    if (d > threshold && Date.now() > motion.quietUntil && handler) handler();
  }
  last = { x: a.x, y: a.y, z: a.z };
}
export async function enableMotion() {
  if (ready) return true;
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      if ((await DeviceMotionEvent.requestPermission()) !== 'granted') return false;
    }
    window.addEventListener('devicemotion', onDeviceMotion);
    ready = true;
    return true;
  } catch { return false; }
}

// ---------- Tela acesa ----------
let wake = null;
export async function keepAwake() { try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch {} }
export function releaseAwake() { try { wake && wake.release(); } catch {} wake = null; }
