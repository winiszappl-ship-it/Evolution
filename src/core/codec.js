// Kompaktowe kodowanie tablic liczbowych. Zapis świata w pamięci przeglądarki
// ma twardy limit, a mapa to dziesiątki tysięcy kafli — JSON z liczbami
// zjadałby go w całości.

function bytesToBase64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function base64ToBytes(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Zapisuje tablicę liczb jako 16-bitowe wartości stałoprzecinkowe. */
export function encodeU16(arr, scale = 1) {
  const u = new Uint16Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const v = Math.round(arr[i] * scale);
    u[i] = v < 0 ? 0 : v > 65535 ? 65535 : v;
  }
  return bytesToBase64(new Uint8Array(u.buffer));
}

export function decodeU16(str, scale, out) {
  if (!str) return out;
  const bytes = base64ToBytes(str);
  const u = new Uint16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
  const n = Math.min(out.length, u.length);
  for (let i = 0; i < n; i++) out[i] = u[i] / scale;
  return out;
}
