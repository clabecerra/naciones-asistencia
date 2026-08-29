import { Timestamp } from 'firebase/firestore';

// El reloj del set vive en Firestore (sets/{n}), no en el dispositivo — ver
// PLAN.md, Etapa 2, decisión 3. Quien registra lo controla a mano con
// iniciar/pausar/reanudar; no hay ingreso manual de minutos ni
// sincronización con el reloj oficial del árbitro.
export function relojInicial() {
  return { relojEstado: 'detenido', relojSegundosAcumulados: 0, relojUltimoInicio: null };
}

export function segundosTranscurridos(reloj) {
  const base = reloj?.relojSegundosAcumulados || 0;
  if (reloj?.relojEstado === 'corriendo' && reloj.relojUltimoInicio) {
    return base + Math.max(0, (Date.now() - reloj.relojUltimoInicio.toMillis()) / 1000);
  }
  return base;
}

export function minutoActual(reloj) {
  return Math.floor(segundosTranscurridos(reloj) / 60);
}

export function iniciarReloj() {
  return { relojEstado: 'corriendo', relojUltimoInicio: Timestamp.now() };
}

export function pausarReloj(reloj) {
  return { relojEstado: 'pausado', relojSegundosAcumulados: segundosTranscurridos(reloj), relojUltimoInicio: null };
}

export function formatoReloj(segundos) {
  const s = Math.max(0, Math.floor(segundos));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2,'0')}`;
}
