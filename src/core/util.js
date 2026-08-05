export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const mix = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
export const TAU = Math.PI * 2;

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

// Sigmoidalna funkcja aktywacji o łagodnym nasyceniu
export function tanhApprox(x) {
  if (x < -3) return -1;
  if (x > 3) return 1;
  const x2 = x * x;
  return x * (27 + x2) / (27 + 9 * x2);
}

export function formatNumber(n) {
  if (!isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + ' mld';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + ' mln';
  if (a >= 1e4) return Math.round(n / 1e3) + ' tys.';
  if (a >= 100) return Math.round(n).toString();
  if (a >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

export function formatYear(y) {
  return formatNumber(Math.floor(y));
}

// Krótkie, wymawialne nazwy generowane z liczb — używane dla gatunków.
const SYL_A = ['ar', 'be', 'cy', 'do', 'el', 'fa', 'gi', 'ho', 'ik', 'ju', 'ka', 'lo', 'mu', 'ne', 'or', 'pi', 'qu', 'ra', 'si', 'to', 'ur', 'va', 'wi', 'xe', 'yl', 'zo'];
const SYL_B = ['ban', 'cid', 'dor', 'fen', 'gil', 'hum', 'ion', 'kar', 'lys', 'mor', 'nex', 'pod', 'rin', 'sar', 'tel', 'vor', 'zim', 'thr', 'ques', 'nak'];
const SYL_C = ['a', 'us', 'ix', 'on', 'ex', 'is', 'ar', 'um', 'ys', 'or'];

export function coinName(n) {
  n = Math.abs(Math.floor(n));
  const a = SYL_A[n % SYL_A.length];
  const b = SYL_B[Math.floor(n / SYL_A.length) % SYL_B.length];
  const c = SYL_C[Math.floor(n / (SYL_A.length * SYL_B.length)) % SYL_C.length];
  const s = a + b + c;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function hsl(h, s, l, a = 1) {
  return `hsla(${h.toFixed(0)},${(s * 100).toFixed(0)}%,${(l * 100).toFixed(0)}%,${a})`;
}
