import { Timestamp } from 'firebase/firestore';

export function pad(n) { return n.toString().padStart(2,'0'); }
export function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
// Inverso de dateKey, para leer el valor de <input type="date"> (mismo
// formato "AAAA-MM-DD") como fecha local, no UTC.
export function parseDateInput(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function getDaysInMonth(monthDate) {
  const year = monthDate.getFullYear(), month = monthDate.getMonth();
  const days = [];
  for (let d = 1; d <= new Date(year,month+1,0).getDate(); d++) days.push(new Date(year,month,d));
  return days;
}
export function monthLabel(monthDate) {
  const s = monthDate.toLocaleDateString('es-CL',{month:'long',year:'numeric'});
  return s.charAt(0).toUpperCase()+s.slice(1);
}
// 23:30 del día del entrenamiento + 1 día — mismo criterio que isDayLocked
// tenía antes. new Date(y,m,d,23,30,0) ya resuelve el horario de verano de
// Chile correctamente porque usa el reloj local del navegador de quien
// crea el entrenamiento.
export function calcularBloqueaEn(fecha) {
  const limite = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 23, 30, 0).getTime() + 86400000;
  return Timestamp.fromMillis(limite);
}
export function bloqueado(ent) {
  return !!ent.bloqueaEn && Date.now() > ent.bloqueaEn.getTime();
}
