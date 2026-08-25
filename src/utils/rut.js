// ─── RUT: copiadas tal cual de naciones-registro (public/index.html) ──────
// La contraseña real de cada cuenta de jugadora en Firebase Auth es el RUT
// ya formateado con puntos y guion (el campo del formulario de registro
// autoformatea con formatRut en cada tecla antes de crear la cuenta) — si
// esta app normalizara distinto, el login fallaría siempre para jugadoras.
export function normEmail(e) { return (e||'').trim().toLowerCase(); }
export function computeRutDv(body) {
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul;
    mul = (mul === 7) ? 2 : mul + 1;
  }
  const res = 11 - (sum % 11);
  if (res === 11) return '0';
  if (res === 10) return 'K';
  return String(res);
}
export function formatRut(raw) {
  const clean = (raw||'').replace(/[^0-9kK]/g,'').toUpperCase();
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean;
  const dv = clean.slice(-1);
  let body = clean.slice(0,-1).replace(/^0+(?=\d)/,'');
  let grouped = '';
  let count = 0;
  for (let i = body.length - 1; i >= 0; i--) {
    grouped = body[i] + grouped;
    count++;
    if (count % 3 === 0 && i !== 0) grouped = '.' + grouped;
  }
  return grouped + '-' + dv;
}
export function isValidRut(formatted) {
  const clean = (formatted||'').replace(/[^0-9kK]/g,'').toUpperCase();
  if (clean.length < 2) return false;
  const dv = clean.slice(-1);
  const body = clean.slice(0,-1);
  if (!/^\d+$/.test(body) || body.length === 0) return false;
  return computeRutDv(body) === dv;
}
