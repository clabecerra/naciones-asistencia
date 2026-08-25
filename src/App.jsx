import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Check, Users, Lock, Download, LogOut } from 'lucide-react';
import * as XLSX from 'xlsx';
import { initializeApp } from 'firebase/app';
import {
  initializeFirestore, collection, query, where, orderBy, onSnapshot,
  doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, deleteField, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';

// ─── CONFIGURACIÓN FIREBASE ────────────────────────────────────────────────
// Apunta a naciones-registro: es la Firestore compartida, dueña de los datos
// de asistencia desde el cutover (ver PLAN.md, Etapa 0). Ya no existe una
// Firestore propia de esta app — la vieja (naciones-asistencia) quedó
// congelada tras la migración.
const firebaseConfig = {
  apiKey:            "AIzaSyBlpHTU4Fn9gbIunHWP14VSYOSRN4YnxrQ",
  authDomain:        "naciones-registro.firebaseapp.com",
  projectId:         "naciones-registro",
  storageBucket:     "naciones-registro.firebasestorage.app",
  messagingSenderId: "445639540799",
  appId:             "1:445639540799:web:b5dbc4e76bfbe852b9b88a",
};
// ──────────────────────────────────────────────────────────────────────────

const app  = initializeApp(firebaseConfig);
const db   = initializeFirestore(app, { experimentalAutoDetectLongPolling: true, useFetchStreams: false });
const auth = getAuth(app);

const INK   = '#1B3A6B';
const PAPER = '#F4F6F9';
const LINE  = '#C8D4E3';
const MUTED = '#7B9BB8';
const PRESENTE = '#3A6B52';
const AUSENTE  = '#A8432F';
const NAVY  = '#1B3A6B';

const WEEKDAY_LABELS = ['Do','Lu','Ma','Mi','Ju','Vi','Sa'];
const PROXIMOS_MIN = 6; // aviso admin si quedan menos entrenamientos programados que esto

function pad(n) { return n.toString().padStart(2,'0'); }
function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
// Inverso de dateKey, para leer el valor de <input type="date"> (mismo
// formato "AAAA-MM-DD") como fecha local, no UTC.
function parseDateInput(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ─── RUT: copiadas tal cual de naciones-registro (public/index.html) ──────
// La contraseña real de cada cuenta de jugadora en Firebase Auth es el RUT
// ya formateado con puntos y guion (el campo del formulario de registro
// autoformatea con formatRut en cada tecla antes de crear la cuenta) — si
// esta app normalizara distinto, el login fallaría siempre para jugadoras.
function normEmail(e) { return (e||'').trim().toLowerCase(); }
function computeRutDv(body) {
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
function formatRut(raw) {
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
function isValidRut(formatted) {
  const clean = (formatted||'').replace(/[^0-9kK]/g,'').toUpperCase();
  if (clean.length < 2) return false;
  const dv = clean.slice(-1);
  const body = clean.slice(0,-1);
  if (!/^\d+$/.test(body) || body.length === 0) return false;
  return computeRutDv(body) === dv;
}
function getDaysInMonth(monthDate) {
  const year = monthDate.getFullYear(), month = monthDate.getMonth();
  const days = [];
  for (let d = 1; d <= new Date(year,month+1,0).getDate(); d++) days.push(new Date(year,month,d));
  return days;
}
function monthLabel(monthDate) {
  const s = monthDate.toLocaleDateString('es-CL',{month:'long',year:'numeric'});
  return s.charAt(0).toUpperCase()+s.slice(1);
}
// 23:30 del día del entrenamiento + 1 día — mismo criterio que isDayLocked
// tenía antes. new Date(y,m,d,23,30,0) ya resuelve el horario de verano de
// Chile correctamente porque usa el reloj local del navegador de quien
// crea el entrenamiento.
function calcularBloqueaEn(fecha) {
  const limite = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 23, 30, 0).getTime() + 86400000;
  return Timestamp.fromMillis(limite);
}
function bloqueado(ent) {
  return !!ent.bloqueaEn && Date.now() > ent.bloqueaEn.getTime();
}

function Stamp({ status, onClick, disabled, title }) {
  // borderWidth/borderStyle por separado, no el shorthand "border": el
  // estado "sin marcar" pisa borderStyle solo, y mezclar shorthand con
  // longhand en el mismo nodo entre renders es lo que React advertía.
  const base = { width:30, height:30, borderRadius:'9999px', display:'flex', alignItems:'center', justifyContent:'center',
    cursor:disabled?'default':'pointer', transition:'transform 0.12s ease', borderWidth:'1.5px', borderStyle:'solid' };
  if (status==='presente') return (
    <button onClick={onClick} disabled={disabled} aria-label="Presente" title={title} className="stamp-pop"
      style={{...base,borderColor:PRESENTE,background:'#EAF2EC',color:PRESENTE,transform:'rotate(-7deg)'}}>
      <Check size={16} strokeWidth={3}/>
    </button>
  );
  if (status==='ausente') return (
    <button onClick={onClick} disabled={disabled} aria-label="Ausente" title={title} className="stamp-pop"
      style={{...base,borderColor:AUSENTE,background:'#F6E9E6',color:AUSENTE,transform:'rotate(6deg)'}}>
      <X size={16} strokeWidth={3}/>
    </button>
  );
  return (
    <button onClick={onClick} disabled={disabled} aria-label="Sin marcar" title={title}
      style={{ ...base,borderStyle:'dashed',borderColor:LINE,background:'transparent'}}
      onMouseEnter={(e)=>{if(!disabled)e.currentTarget.style.borderColor=MUTED;}}
      onMouseLeave={(e)=>{e.currentTarget.style.borderColor=LINE;}}
    />
  );
}

// ─── LOGO SVG ──────────────────────────────────────────────────────────────
const LOGO_SVG = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="186 165 1068 535" style={{width:85,height:'auto',display:'block'}} preserveAspectRatio="xMidYMid meet">
    <defs><clipPath id="cp1"><path d="M 0.71875 0.601562 L 1068.480469 0.601562 L 1068.480469 468 L 0.71875 468 Z" clipRule="nonzero"/></clipPath><clipPath id="cp2"><rect x="0" width="1069" y="0" height="468"/></clipPath><clipPath id="cp3"><path d="M 10 362 L 1058 362 L 1058 534.601562 L 10 534.601562 Z" clipRule="nonzero"/></clipPath><clipPath id="cp4"><rect x="0" width="1048" y="0" height="173"/></clipPath><clipPath id="cp5"><rect x="0" width="1069" y="0" height="535"/></clipPath></defs>
    <g transform="matrix(1,0,0,1,186,165)"><g clipPath="url(#cp5)"><g clipPath="url(#cp1)"><g clipPath="url(#cp2)">
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(7.815617,350.272005)"><g><path d="M 11.652344 -339.222656 L 172.351562 -339.222656 L 172.351562 -250.890625 L 134.246094 -250.890625 L 134.246094 -264.292969 L 147.644531 -264.292969 L 147.644531 -61.996094 L 134.246094 -61.996094 L 134.246094 -75.394531 L 194.375 -75.394531 L 194.375 -61.996094 L 180.972656 -61.996094 L 180.972656 -134.59375 L 286.085938 -134.59375 L 286.085938 13.402344 L -1.75 13.402344 L -1.75 -75.394531 L 37.289062 -75.394531 L 37.289062 -61.996094 L 23.890625 -61.996094 L 23.890625 -264.292969 L 37.289062 -264.292969 L 37.289062 -250.890625 L -1.75 -250.890625 L -1.75 -339.222656 Z M 11.652344 -312.421875 L 11.652344 -325.824219 L 25.054688 -325.824219 L 25.054688 -264.292969 L 11.652344 -264.292969 L 11.652344 -277.695312 L 50.691406 -277.695312 L 50.691406 -48.59375 L 11.652344 -48.59375 L 11.652344 -61.996094 L 25.054688 -61.996094 L 25.054688 0 L 11.652344 0 L 11.652344 -13.402344 L 272.683594 -13.402344 L 272.683594 0 L 259.28125 0 L 259.28125 -121.191406 L 272.683594 -121.191406 L 272.683594 -107.792969 L 194.375 -107.792969 L 194.375 -121.191406 L 207.777344 -121.191406 L 207.777344 -48.59375 L 120.84375 -48.59375 L 120.84375 -277.695312 L 158.949219 -277.695312 L 158.949219 -264.292969 L 145.546875 -264.292969 L 145.546875 -325.824219 L 158.949219 -325.824219 L 158.949219 -312.421875 Z"/></g></g></g>
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(278.168221,350.272005)"><g><path d="M 337.007812 -230.382812 L 335.144531 -230.382812 L 335.144531 -243.785156 L 348.328125 -241.386719 C 347.070312 -234.457031 345.574219 -226.75 343.847656 -218.269531 C 342.128906 -209.820312 340.484375 -201.996094 338.917969 -194.789062 C 337.261719 -187.171875 335.734375 -181.269531 334.339844 -177.085938 L 321.628906 -181.324219 L 334.566406 -177.832031 L 282.949219 13.402344 L 165.105469 13.402344 L 110.15625 -182.363281 L 123.058594 -185.984375 L 110.25 -182.042969 C 108.875 -186.503906 106.980469 -194.699219 104.5625 -206.628906 C 102.101562 -218.765625 100.542969 -230.910156 99.886719 -243.0625 L 113.269531 -243.785156 L 113.269531 -230.382812 L 111.402344 -230.382812 L 111.402344 -243.785156 L 124.804688 -243.785156 L 124.804688 -60.128906 L 111.402344 -60.128906 L 111.402344 -73.53125 L 151.375 -73.53125 L 151.375 13.402344 L -1.75 13.402344 L -1.75 -73.53125 L 36.824219 -73.53125 L 36.824219 -60.128906 L 23.421875 -60.128906 L 23.421875 -265.691406 L 36.824219 -265.691406 L 36.824219 -252.289062 L -1.28125 -252.289062 L -1.28125 -339.222656 L 199.042969 -339.222656 L 248.796875 -154.984375 L 235.859375 -151.492188 L 222.878906 -154.824219 L 270.210938 -339.222656 L 471.601562 -339.222656 L 471.601562 -252.289062 L 432.566406 -252.289062 L 432.566406 -265.691406 L 445.964844 -265.691406 L 445.964844 -60.597656 L 432.566406 -60.597656 L 432.566406 -73.996094 L 471.601562 -73.996094 L 471.601562 13.402344 L 297.503906 13.402344 L 297.503906 -73.996094 L 337.007812 -73.996094 L 337.007812 -60.597656 L 323.609375 -60.597656 L 323.609375 -243.785156 L 337.007812 -243.785156 Z M 350.410156 -257.183594 L 350.410156 -47.195312 L 310.90625 -47.195312 L 310.90625 -60.597656 L 324.308594 -60.597656 L 324.308594 0 L 310.90625 0 L 310.90625 -13.402344 L 458.203125 -13.402344 L 458.203125 0 L 444.800781 0 L 444.800781 -60.597656 L 458.203125 -60.597656 L 458.203125 -47.195312 L 419.164062 -47.195312 L 419.164062 -279.09375 L 458.203125 -279.09375 L 458.203125 -265.691406 L 444.800781 -265.691406 L 444.800781 -325.824219 L 458.203125 -325.824219 L 458.203125 -312.421875 L 280.609375 -312.421875 L 280.609375 -325.824219 L 293.589844 -322.492188 L 236.1875 -98.871094 L 175.84375 -322.328125 L 188.78125 -325.824219 L 188.78125 -312.421875 L 12.121094 -312.421875 L 12.121094 -325.824219 L 25.519531 -325.824219 L 25.519531 -265.691406 L 12.121094 -265.691406 L 12.121094 -279.09375 L 50.226562 -279.09375 L 50.226562 -46.730469 L 11.652344 -46.730469 L 11.652344 -60.128906 L 25.054688 -60.128906 L 25.054688 0 L 11.652344 0 L 11.652344 -13.402344 L 137.972656 -13.402344 L 137.972656 0 L 124.570312 0 L 124.570312 -60.128906 L 137.972656 -60.128906 L 137.972656 -46.730469 L 98.003906 -46.730469 L 98.003906 -257.183594 L 125.964844 -257.183594 L 126.652344 -244.507812 C 127.238281 -233.660156 128.628906 -222.8125 130.832031 -211.953125 C 133.074219 -200.886719 134.753906 -193.542969 135.867188 -189.925781 L 135.914062 -189.765625 L 188.167969 -3.621094 L 175.261719 0 L 175.261719 -13.402344 L 272.683594 -13.402344 L 272.683594 0 L 259.746094 -3.492188 L 308.789062 -185.191406 L 308.914062 -185.5625 C 310.003906 -188.832031 311.277344 -193.808594 312.726562 -200.484375 C 314.269531 -207.574219 315.886719 -215.285156 317.585938 -223.617188 C 319.273438 -231.917969 320.734375 -239.4375 321.960938 -246.179688 L 323.960938 -257.183594 Z"/></g></g></g>
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(734.038701,350.272005)"><g><path d="M -1.75 0 L -1.75 -130.863281 L 111.753906 -130.863281 L 111.753906 -117.464844 C 111.753906 -110.621094 113.058594 -105.316406 115.664062 -101.550781 C 118.582031 -97.335938 122.230469 -94.109375 126.601562 -91.867188 C 131.832031 -89.191406 137.078125 -87.347656 142.34375 -86.347656 C 148.320312 -85.207031 153.511719 -84.503906 157.921875 -84.226562 L 157.085938 -70.851562 L 157.085938 -84.253906 C 161.882812 -84.253906 166.921875 -84.726562 172.195312 -85.671875 C 176.066406 -86.367188 179.300781 -87.734375 181.898438 -89.777344 C 182.835938 -90.515625 183.304688 -91.972656 183.304688 -94.15625 C 183.304688 -93.820312 183.382812 -93.550781 183.539062 -93.339844 C 183.117188 -93.902344 182.171875 -94.566406 180.699219 -95.335938 C 174.953125 -98.347656 167.21875 -101.28125 157.5 -104.140625 C 146.988281 -107.234375 135.386719 -110.558594 122.699219 -114.117188 C 109.445312 -117.835938 96.199219 -122.4375 82.964844 -127.925781 C 69.109375 -133.671875 56.417969 -141.03125 44.898438 -150.011719 C 32.890625 -159.371094 23.183594 -170.753906 15.773438 -184.164062 C 8.132812 -197.988281 4.3125 -214.601562 4.3125 -233.996094 C 4.3125 -253.757812 8.46875 -270.957031 16.78125 -285.59375 C 24.902344 -299.898438 35.441406 -311.664062 48.394531 -320.890625 C 60.878906 -329.785156 74.164062 -336.464844 88.242188 -340.925781 C 102.300781 -345.386719 115.769531 -347.613281 128.652344 -347.613281 C 149.933594 -347.613281 170.382812 -343.726562 189.992188 -335.949219 C 211.054688 -327.597656 227.019531 -313.28125 237.882812 -292.996094 L 226.070312 -286.667969 L 212.765625 -288.25 L 218.832031 -339.222656 L 324.308594 -339.222656 L 324.308594 -195.421875 L 213.136719 -195.421875 L 213.136719 -208.824219 C 213.136719 -221.933594 208.984375 -231.808594 200.6875 -238.445312 C 191.480469 -245.8125 180.210938 -249.492188 166.875 -249.492188 C 162.421875 -249.492188 157.574219 -247.988281 152.339844 -244.980469 C 150.71875 -244.050781 149.59375 -243.058594 148.964844 -242 C 148.398438 -241.042969 148.113281 -239.773438 148.113281 -238.191406 C 148.113281 -235.925781 149.597656 -233.722656 152.570312 -231.582031 C 158.253906 -227.484375 166.03125 -223.628906 175.910156 -220.011719 C 186.773438 -216.03125 198.644531 -211.972656 211.527344 -207.832031 C 224.976562 -203.507812 238.421875 -198.46875 251.859375 -192.707031 C 265.769531 -186.746094 278.625 -179.613281 290.421875 -171.304688 C 303.007812 -162.441406 313.125 -151.601562 320.78125 -138.785156 C 328.726562 -125.480469 332.699219 -109.828125 332.699219 -91.828125 C 332.699219 -71.378906 328.355469 -53.742188 319.675781 -38.910156 C 311.097656 -24.257812 299.730469 -12.542969 285.574219 -3.761719 C 272.101562 4.59375 257.457031 10.730469 241.640625 14.640625 C 226.132812 18.476562 210.84375 20.394531 195.773438 20.394531 C 169.832031 20.394531 147.769531 15.320312 129.582031 5.179688 C 112.019531 -4.617188 98.210938 -15.40625 88.15625 -27.195312 L 98.351562 -35.890625 L 111.621094 -33.996094 L 104.847656 13.402344 L -1.75 13.402344 Z M 25.054688 0 L 11.652344 0 L 11.652344 -13.402344 L 93.226562 -13.402344 L 93.226562 0 L 79.957031 -1.894531 L 89.285156 -67.175781 L 108.546875 -44.589844 C 116.519531 -35.246094 127.878906 -26.460938 142.636719 -18.230469 C 156.765625 -10.347656 174.480469 -6.410156 195.773438 -6.410156 C 208.667969 -6.410156 221.8125 -8.066406 235.207031 -11.378906 C 248.289062 -14.613281 260.367188 -19.667969 271.445312 -26.539062 C 281.839844 -32.984375 290.203125 -41.621094 296.542969 -52.449219 C 302.777344 -63.101562 305.894531 -76.226562 305.894531 -91.828125 C 305.894531 -104.898438 303.1875 -115.972656 297.769531 -125.042969 C 292.0625 -134.597656 284.46875 -142.714844 274.988281 -149.390625 C 264.722656 -156.621094 253.492188 -162.847656 241.300781 -168.074219 C 228.636719 -173.5 215.976562 -178.25 203.324219 -182.316406 C 190.101562 -186.566406 177.894531 -190.742188 166.691406 -194.84375 C 154.507812 -199.304688 144.574219 -204.304688 136.894531 -209.839844 C 126.503906 -217.332031 121.308594 -226.78125 121.308594 -238.191406 C 121.308594 -244.6875 122.851562 -250.523438 125.933594 -255.707031 C 128.953125 -260.785156 133.308594 -264.957031 138.988281 -268.222656 C 148.359375 -273.605469 157.652344 -276.296875 166.875 -276.296875 C 186.476562 -276.296875 203.328125 -270.65625 217.429688 -259.375 C 232.4375 -247.371094 239.9375 -230.519531 239.9375 -208.824219 L 226.539062 -208.824219 L 226.539062 -222.226562 L 310.90625 -222.226562 L 310.90625 -208.824219 L 297.503906 -208.824219 L 297.503906 -325.824219 L 310.90625 -325.824219 L 310.90625 -312.421875 L 230.734375 -312.421875 L 230.734375 -325.824219 L 244.039062 -324.238281 L 234.347656 -242.835938 L 214.257812 -280.339844 C 206.480469 -294.859375 195.097656 -305.089844 180.113281 -311.035156 C 163.675781 -317.550781 146.519531 -320.8125 128.652344 -320.8125 C 118.535156 -320.8125 107.765625 -319 96.34375 -315.378906 C 84.941406 -311.761719 74.140625 -306.324219 63.945312 -299.058594 C 54.210938 -292.125 46.257812 -283.226562 40.085938 -272.359375 C 34.105469 -261.824219 31.113281 -249.039062 31.113281 -233.996094 C 31.113281 -219.207031 33.820312 -206.917969 39.230469 -197.128906 C 44.871094 -186.921875 52.253906 -178.261719 61.375 -171.152344 C 70.988281 -163.660156 81.605469 -157.503906 93.230469 -152.683594 C 105.476562 -147.605469 117.714844 -143.351562 129.941406 -139.921875 C 142.734375 -136.335938 154.441406 -132.976562 165.0625 -129.855469 C 176.472656 -126.5 185.828125 -122.90625 193.136719 -119.082031 C 198.1875 -116.433594 202.136719 -113.214844 204.980469 -109.421875 C 208.398438 -104.867188 210.105469 -99.777344 210.105469 -94.15625 C 210.105469 -83.289062 206.222656 -74.804688 198.460938 -68.703125 C 192.359375 -63.910156 185.183594 -60.773438 176.933594 -59.292969 C 170.089844 -58.0625 163.472656 -57.449219 157.085938 -57.449219 L 156.667969 -57.449219 L 156.25 -57.476562 C 150.714844 -57.820312 144.410156 -58.667969 137.332031 -60.015625 C 129.542969 -61.5 121.894531 -64.164062 114.382812 -68.011719 C 106.019531 -72.296875 99.097656 -78.394531 93.625 -86.296875 C 87.84375 -94.652344 84.953125 -105.039062 84.953125 -117.464844 L 98.351562 -117.464844 L 98.351562 -104.0625 L 11.652344 -104.0625 L 11.652344 -117.464844 L 25.054688 -117.464844 Z"/></g></g></g>
    </g></g></g><g clipPath="url(#cp3)"><g transform="matrix(1,0,0,1,10,362)"><g clipPath="url(#cp4)">
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(0.321424,129.358327)"><g><path d="M 9.6875 0 L 37.078125 0 C 39.402344 0 40.179688 -0.90625 40.179688 -3.359375 L 40.179688 -4.78125 C 40.179688 -7.234375 39.402344 -8.140625 37.078125 -8.269531 L 27.777344 -8.914062 L 27.777344 -71.3125 L 68.34375 -1.9375 C 69.246094 -0.644531 70.410156 0 71.832031 0 L 77.257812 0 C 79.324219 0 80.746094 -1.421875 80.746094 -3.746094 L 80.746094 -81.390625 L 86.6875 -82.167969 C 89.011719 -82.296875 89.660156 -83.199219 89.660156 -85.65625 L 89.660156 -87.074219 C 89.660156 -89.53125 89.011719 -90.433594 86.6875 -90.433594 L 59.429688 -90.433594 C 57.75 -90.433594 57.101562 -88.753906 57.101562 -87.074219 L 57.101562 -85.65625 C 57.101562 -83.199219 57.75 -82.296875 60.074219 -82.167969 L 69.375 -81.390625 L 69.375 -21.960938 L 30.230469 -88.882812 C 29.714844 -89.917969 28.808594 -90.433594 27.648438 -90.433594 L 9.6875 -90.433594 C 7.363281 -90.433594 6.71875 -89.53125 6.71875 -87.074219 L 6.71875 -85.136719 C 6.71875 -82.683594 7.363281 -81.777344 9.6875 -81.648438 L 16.535156 -81.390625 L 16.535156 -8.914062 L 9.6875 -8.269531 C 7.363281 -8.140625 6.71875 -7.234375 6.71875 -4.78125 L 6.71875 -3.359375 C 6.71875 -0.90625 7.363281 0 9.6875 0 Z"/></g></g></g>
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(145.52641,129.358327)"><g><path d="M 5.8125 0.128906 L 31.007812 0.128906 C 33.203125 0.128906 34.105469 -0.773438 34.105469 -3.230469 L 34.105469 -5.167969 C 34.105469 -7.621094 33.460938 -8.65625 31.136719 -8.65625 L 21.316406 -9.042969 L 26.355469 -25.96875 L 63.175781 -25.96875 L 68.085938 -9.042969 L 58.910156 -8.65625 C 56.585938 -8.65625 55.941406 -7.621094 55.941406 -5.167969 L 55.941406 -3.230469 C 55.941406 -0.773438 56.84375 0.128906 59.039062 0.128906 L 84.234375 0.128906 C 86.558594 0.128906 87.335938 -0.773438 87.335938 -3.230469 L 87.335938 -5.167969 C 87.335938 -7.621094 86.816406 -8.65625 84.363281 -8.65625 L 79.96875 -8.914062 L 56.328125 -83.457031 C 54.648438 -88.882812 52.710938 -90.824219 48.316406 -90.824219 L 41.601562 -90.824219 C 37.078125 -90.824219 35.140625 -89.011719 33.332031 -83.328125 L 9.820312 -8.914062 L 5.683594 -8.65625 C 3.230469 -8.527344 2.714844 -7.621094 2.714844 -5.167969 L 2.714844 -3.230469 C 2.714844 -0.773438 3.488281 0.128906 5.8125 0.128906 Z M 28.9375 -34.882812 L 44.183594 -83.714844 L 45.476562 -83.714844 L 60.460938 -34.882812 Z"/></g></g></g>
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(285.176399,129.358327)"><g><path d="M 45.476562 2.324219 C 58.652344 2.324219 77.128906 -1.808594 77.515625 -26.355469 C 77.644531 -29.066406 76.222656 -31.007812 73.511719 -31.007812 L 70.539062 -31.007812 C 68.601562 -31.007812 66.921875 -29.972656 66.664062 -27.648438 C 66.40625 -12.917969 57.878906 -8.269531 45.605469 -8.269531 C 29.328125 -8.269531 20.542969 -19.25 20.285156 -44.828125 C 20.542969 -70.410156 29.328125 -81.519531 45.605469 -81.519531 C 58.136719 -81.519531 63.304688 -75.191406 66.792969 -60.851562 C 67.179688 -57.621094 69.246094 -56.972656 71.183594 -56.972656 L 74.285156 -56.972656 C 77.128906 -56.972656 78.160156 -58.265625 78.160156 -61.238281 L 78.160156 -86.171875 C 78.160156 -89.144531 77.128906 -90.304688 74.542969 -90.304688 L 73.382812 -90.304688 C 71.054688 -90.304688 70.023438 -89.402344 69.894531 -87.335938 L 69.632812 -78.03125 C 64.726562 -90.953125 55.683594 -92.113281 45.476562 -92.113281 C 20.671875 -92.113281 9.300781 -76.609375 9.042969 -44.828125 C 9.300781 -13.175781 20.671875 2.324219 45.476562 2.324219 Z"/></g></g></g>
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(426.506019,129.358327)"><g><path d="M 9.6875 0 L 39.53125 0 C 41.988281 0 42.632812 -0.90625 42.632812 -3.359375 L 42.632812 -4.78125 C 42.632812 -7.234375 41.859375 -8.140625 39.53125 -8.269531 L 30.230469 -8.914062 L 30.230469 -81.390625 L 39.53125 -81.777344 C 41.859375 -81.777344 42.632812 -82.683594 42.632812 -85.136719 L 42.632812 -87.074219 C 42.632812 -89.53125 41.988281 -90.433594 39.53125 -90.433594 L 9.6875 -90.433594 C 7.363281 -90.433594 6.71875 -89.53125 6.71875 -87.074219 L 6.71875 -85.136719 C 6.71875 -82.683594 7.363281 -81.777344 9.6875 -81.777344 L 18.992188 -81.390625 L 18.992188 -8.914062 L 9.6875 -8.269531 C 7.363281 -8.140625 6.71875 -7.234375 6.71875 -4.78125 L 6.71875 -3.359375 C 6.71875 -0.90625 7.363281 0 9.6875 0 Z"/></g></g></g>
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(529.984116,129.358327)"><g><path d="M 48.1875 -92.113281 C 20.414062 -92.113281 9.042969 -76.351562 9.042969 -44.441406 C 9.042969 -13.175781 20.414062 2.324219 48.1875 2.324219 C 75.707031 2.324219 86.945312 -13.175781 86.945312 -44.441406 C 86.945312 -76.351562 75.707031 -92.113281 48.1875 -92.113281 Z M 20.285156 -44.183594 C 20.285156 -69.246094 29.972656 -81.777344 48.1875 -81.777344 C 66.277344 -81.777344 75.707031 -69.246094 75.707031 -44.183594 C 75.707031 -19.765625 66.277344 -7.75 48.1875 -7.75 C 29.972656 -7.75 20.285156 -19.765625 20.285156 -44.183594 Z"/></g></g></g>
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(680.098386,129.358327)"><g><path d="M 9.6875 0 L 37.078125 0 C 39.402344 0 40.179688 -0.90625 40.179688 -3.359375 L 40.179688 -4.78125 C 40.179688 -7.234375 39.402344 -8.140625 37.078125 -8.269531 L 27.777344 -8.914062 L 27.777344 -71.3125 L 68.34375 -1.9375 C 69.246094 -0.644531 70.410156 0 71.832031 0 L 77.257812 0 C 79.324219 0 80.746094 -1.421875 80.746094 -3.746094 L 80.746094 -81.390625 L 86.6875 -82.167969 C 89.011719 -82.296875 89.660156 -83.199219 89.660156 -85.65625 L 89.660156 -87.074219 C 89.660156 -89.53125 89.011719 -90.433594 86.6875 -90.433594 L 59.429688 -90.433594 C 57.75 -90.433594 57.101562 -88.753906 57.101562 -87.074219 L 57.101562 -85.65625 C 57.101562 -83.199219 57.75 -82.296875 60.074219 -82.167969 L 69.375 -81.390625 L 69.375 -21.960938 L 30.230469 -88.882812 C 29.714844 -89.917969 28.808594 -90.433594 27.648438 -90.433594 L 9.6875 -90.433594 C 7.363281 -90.433594 6.71875 -89.53125 6.71875 -87.074219 L 6.71875 -85.65625 C 6.71875 -83.199219 7.363281 -82.296875 9.6875 -82.167969 L 16.535156 -81.390625 L 16.535156 -8.914062 L 9.6875 -8.269531 C 7.363281 -8.140625 6.71875 -7.234375 6.71875 -4.78125 L 6.71875 -3.359375 C 6.71875 -0.90625 7.363281 0 9.6875 0 Z"/></g></g></g>
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(829.825072,129.358327)"><g><path d="M 10.464844 0 L 69.117188 0 C 71.183594 0 72.089844 -0.90625 72.089844 -3.230469 L 72.089844 -24.160156 C 72.089844 -26.355469 71.445312 -27.390625 69.246094 -27.390625 L 66.535156 -27.390625 C 65.113281 -27.390625 63.691406 -27 63.433594 -24.289062 L 61.367188 -10.335938 L 27.648438 -10.335938 L 27.648438 -40.179688 L 49.609375 -40.179688 L 49.996094 -33.589844 C 49.996094 -32.296875 50.644531 -31.136719 51.804688 -31.136719 L 54.390625 -31.136719 C 56.070312 -31.136719 56.714844 -32.296875 56.714844 -33.847656 L 56.714844 -55.683594 C 56.714844 -57.621094 56.070312 -58.394531 54.390625 -58.394531 L 51.804688 -58.394531 C 50.773438 -58.394531 50.125 -57.621094 50.125 -56.457031 L 49.738281 -50.257812 L 27.648438 -50.257812 L 27.648438 -80.097656 L 61.238281 -80.097656 L 63.433594 -66.015625 C 63.691406 -63.433594 64.984375 -62.917969 66.535156 -62.917969 L 69.117188 -62.917969 C 71.183594 -62.917969 71.960938 -63.820312 71.960938 -66.277344 L 71.960938 -87.074219 C 71.960938 -89.660156 71.183594 -90.433594 68.859375 -90.433594 L 10.464844 -90.433594 C 8.011719 -90.433594 7.363281 -89.53125 7.363281 -87.074219 L 7.363281 -84.234375 C 7.363281 -81.777344 8.140625 -80.875 10.464844 -80.875 L 16.40625 -80.097656 L 16.40625 -10.335938 L 10.464844 -9.558594 C 8.140625 -9.429688 7.363281 -8.527344 7.363281 -6.070312 L 7.363281 -3.359375 C 7.363281 -0.90625 8.011719 0 10.464844 0 Z"/></g></g></g>
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(965.341322,129.358327)"><g><path d="M 39.144531 1.9375 C 61.109375 1.9375 72.734375 -5.425781 72.734375 -23.769531 C 72.734375 -37.335938 63.949219 -44.054688 45.863281 -51.03125 C 26.226562 -58.78125 21.058594 -63.046875 21.058594 -70.023438 C 21.058594 -78.417969 26.871094 -81.648438 39.015625 -81.648438 C 50.644531 -81.777344 57.101562 -76.609375 61.109375 -61.109375 C 62.011719 -58.007812 63.691406 -57.230469 65.757812 -57.230469 L 67.957031 -57.230469 C 70.925781 -57.230469 71.703125 -58.523438 71.703125 -61.496094 L 71.960938 -86.042969 C 71.960938 -89.011719 70.925781 -90.304688 68.214844 -90.304688 L 67.050781 -90.304688 C 64.855469 -90.304688 63.820312 -89.273438 63.691406 -87.203125 L 63.433594 -76.480469 C 61.109375 -85.65625 52.324219 -91.984375 38.5 -91.984375 C 19.378906 -91.984375 9.6875 -85.785156 9.820312 -70.152344 C 9.949219 -58.910156 16.277344 -50.125 32.6875 -44.183594 C 51.675781 -36.949219 61.367188 -31.265625 61.367188 -24.03125 C 61.367188 -12.917969 53.097656 -8.398438 38.757812 -8.269531 C 26.613281 -8.269531 19.25 -12.660156 20.152344 -30.617188 C 20.285156 -32.945312 18.214844 -33.847656 16.277344 -33.847656 L 13.308594 -33.847656 C 10.722656 -33.847656 9.558594 -32.039062 9.429688 -29.199219 C 8.527344 -0.773438 26.097656 1.9375 39.144531 1.9375 Z"/></g></g></g>
    </g></g></g></g>
  </svg>
);

// ─── PANTALLA DE LOGIN ─────────────────────────────────────────────────────
// Reemplaza a AccessScreen (clave compartida) y al modal de login admin.
// Dos entradas separadas, misma experiencia que naciones-registro: jugadora
// (correo + RUT) o administradora/DT (correo + clave) — no un formulario
// único, para que el flujo sea idéntico al que ya conocen del registro.
function LoginShell({ children }) {
  return (
    <div style={{ background: NAVY, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      <div style={{ marginBottom: 8 }}>{LOGO_SVG}</div>
      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 28 }}>Gestión del Equipo</div>
      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: '28px 24px', width: '100%', maxWidth: 320 }}>
        {children}
      </div>
    </div>
  );
}

function loginInputStyle(hasError) {
  return { width: '100%', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${hasError ? '#E57373' : 'rgba(255,255,255,0.25)'}`,
    background: 'rgba(255,255,255,0.12)', color: 'white', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 8 };
}

function ChoiceScreen({ onElegir }) {
  return (
    <LoginShell>
      <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, margin: '0 0 16px', textAlign: 'center' }}>¿Cómo quieres entrar?</p>
      <button onClick={() => onElegir('jugadora')}
        style={{ width: '100%', padding: '14px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)',
          color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left', marginBottom: 10 }}>
        Jugadora
        <div style={{ fontWeight: 400, fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>Con tu correo y tu RUT</div>
      </button>
      <button onClick={() => onElegir('admin')}
        style={{ width: '100%', padding: '14px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)',
          color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
        Administradora / DT
        <div style={{ fontWeight: 400, fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>Con tu correo y tu clave</div>
      </button>
    </LoginShell>
  );
}

function JugadoraLoginScreen({ onVolver }) {
  const [email, setEmail] = useState('');
  const [rut, setRut]     = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function handleLogin() {
    setError('');
    const correo = normEmail(email);
    const rutFormateado = formatRut(rut);
    if (!correo || !rutFormateado) { setError('Completa tu correo y RUT.'); return; }
    if (!isValidRut(rutFormateado)) { setError('El RUT ingresado no es válido. Revisa el dígito verificador.'); return; }
    setLoading(true);
    try { await signInWithEmailAndPassword(auth, correo, rutFormateado); }
    catch (e) { setError('Correo o RUT incorrectos.'); }
    finally { setLoading(false); }
  }
  return (
    <LoginShell>
      <button onClick={onVolver} style={{ border:'none',background:'none',color:'rgba(255,255,255,0.6)',cursor:'pointer',fontSize:12,padding:0,marginBottom:14 }}>← Volver</button>
      <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, margin: '0 0 16px', textAlign: 'center' }}>Entra con tu correo y tu RUT</p>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo electrónico" autoFocus
        style={loginInputStyle(false)} />
      <input type="text" value={rut} onChange={(e) => { setRut(formatRut(e.target.value)); setError(''); }}
        onKeyDown={(e) => { if (e.key==='Enter') handleLogin(); }} placeholder="12.345.678-9"
        style={loginInputStyle(!!error)} />
      {error && <p style={{ color: '#EF9A9A', fontSize: 12, margin: '0 0 10px', textAlign: 'center' }}>{error}</p>}
      <button onClick={handleLogin} disabled={loading}
        style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', background: 'white', color: NAVY, fontSize: 14, fontWeight: 700, cursor: loading?'default':'pointer', opacity: loading?0.7:1 }}>
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </LoginShell>
  );
}

function AdminLoginScreen({ onVolver }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  async function handleLogin() {
    setError(''); setLoading(true);
    try { await signInWithEmailAndPassword(auth, normEmail(email), password); }
    catch (e) { setError('Correo o contraseña incorrectos.'); }
    finally { setLoading(false); }
  }
  return (
    <LoginShell>
      <button onClick={onVolver} style={{ border:'none',background:'none',color:'rgba(255,255,255,0.6)',cursor:'pointer',fontSize:12,padding:0,marginBottom:14 }}>← Volver</button>
      <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, margin: '0 0 16px', textAlign: 'center' }}>Entra con tu correo y tu clave</p>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo electrónico" autoFocus
        style={loginInputStyle(false)} />
      <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }}
        onKeyDown={(e) => { if (e.key==='Enter') handleLogin(); }} placeholder="Contraseña"
        style={loginInputStyle(!!error)} />
      {error && <p style={{ color: '#EF9A9A', fontSize: 12, margin: '0 0 10px', textAlign: 'center' }}>{error}</p>}
      <button onClick={handleLogin} disabled={loading}
        style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', background: 'white', color: NAVY, fontSize: 14, fontWeight: 700, cursor: loading?'default':'pointer', opacity: loading?0.7:1 }}>
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </LoginShell>
  );
}

function LoginScreen() {
  const [modo, setModo] = useState(null); // null | 'jugadora' | 'admin'
  if (modo === 'jugadora') return <JugadoraLoginScreen onVolver={() => setModo(null)} />;
  if (modo === 'admin')    return <AdminLoginScreen onVolver={() => setModo(null)} />;
  return <ChoiceScreen onElegir={setModo} />;
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────
export default function AttendanceTracker() {
  const [authUser, setAuthUser]     = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin]       = useState(false);

  const [roster, setRoster]               = useState([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError]     = useState(null);

  const [monthDate, setMonthDate]         = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [entrenamientos, setEntrenamientos] = useState([]);
  const [entrenamientosLoading, setEntrenamientosLoading] = useState(true);
  const [asistencia, setAsistencia]       = useState({}); // { entrenamientoId: { jugadoraId: {estado, marcadoPor, actualizadoEn} } }

  const [activeTab, setActiveTab] = useState('registro');
  const [error, setError]         = useState(null);
  const [proximosCount, setProximosCount] = useState(null);

  const [crearMesMonth, setCrearMesMonth]   = useState(() => { const d = new Date(); d.setMonth(d.getMonth()+1); d.setDate(1); return d; });
  const [crearMesDias, setCrearMesDias]     = useState([]);
  const [crearMesCargando, setCrearMesCargando] = useState(false);
  const [crearMesEnviando, setCrearMesEnviando] = useState(false);
  const [crearMesMensaje, setCrearMesMensaje]   = useState(null);

  const [competencias, setCompetencias]           = useState([]);
  const [competenciasLoading, setCompetenciasLoading] = useState(true);
  const [competenciasError, setCompetenciasError] = useState(null);
  const [nuevaComp, setNuevaComp]                 = useState({ nombre:'', fechaInicio:'', fechaTermino:'' });
  const [compEditandoId, setCompEditandoId]       = useState(null);
  const [compEdicion, setCompEdicion]             = useState({ nombre:'', fechaInicio:'', fechaTermino:'' });

  const PARTIDO_VACIO = { competenciaId:'', fecha:'', lugar:'', tipo:'oficial', rival:'' };
  const [partidos, setPartidos]                   = useState([]);
  const [partidosLoading, setPartidosLoading]     = useState(true);
  const [partidosError, setPartidosError]         = useState(null);
  const [nuevoPartido, setNuevoPartido]           = useState(PARTIDO_VACIO);
  const [partidoEditandoId, setPartidoEditandoId] = useState(null);
  const [partidoEdicion, setPartidoEdicion]       = useState(PARTIDO_VACIO);

  // Auth: sesión + rol
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        try { setIsAdmin((await getDoc(doc(db,'admins',user.uid))).exists()); }
        catch { setIsAdmin(false); }
      } else {
        setIsAdmin(false);
      }
      setAuthChecked(true);
    });
    return unsub;
  }, []);

  // Nómina: jugadoras activas del registro. Se lee jugadorasRoster, no
  // jugadoras — esa consulta de colección no se puede permitir sobre
  // jugadoras (su regla de lectura depende de docId, ver firestore.rules
  // de naciones-registro), y jugadorasRoster es justo el espejo liviano
  // pensado para esto (solo nombre, apellido, activa).
  useEffect(() => {
    if (!authUser) { setRoster([]); setRosterError(null); return; }
    setRosterLoading(true);
    setRosterError(null);
    const q = query(collection(db,'jugadorasRoster'), where('activa','==',true));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a,b) => (a.apellido||'').localeCompare(b.apellido||'') || (a.nombre||'').localeCompare(b.nombre||''));
      setRoster(list);
      setRosterLoading(false);
    }, (err) => {
      // No mostrar como "sin jugadoras" — un permission-denied silencioso
      // se ve exactamente igual que una nómina vacía si no se distingue.
      console.error('Error cargando nómina:', err);
      setRosterError(err.code === 'permission-denied'
        ? 'No se pudo cargar la nómina: tu cuenta no tiene permiso para verla.'
        : 'No se pudo cargar la nómina. Intenta de nuevo.');
      setRosterLoading(false);
    });
    return unsub;
  }, [authUser]);

  // Entrenamientos del mes visible
  useEffect(() => {
    if (!authUser) { setEntrenamientos([]); return; }
    setEntrenamientosLoading(true);
    const inicio = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const fin    = new Date(monthDate.getFullYear(), monthDate.getMonth()+1, 1);
    const q = query(collection(db,'entrenamientos'),
      where('fecha','>=',Timestamp.fromDate(inicio)),
      where('fecha','<',Timestamp.fromDate(fin)),
      orderBy('fecha'));
    const unsub = onSnapshot(q, (snap) => {
      setEntrenamientos(snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, fecha: data.fecha.toDate(), estado: data.estado,
          bloqueaEn: data.bloqueaEn ? data.bloqueaEn.toDate() : null };
      }));
      setEntrenamientosLoading(false);
    }, () => setEntrenamientosLoading(false));
    return unsub;
  }, [authUser, monthDate.getFullYear(), monthDate.getMonth()]);

  // Asistencia: un listener por entrenamiento visible.
  // Dependencia por ids concatenados, no por la referencia del arreglo:
  // entrenamientos cambia de referencia en cada snapshot aunque los ids
  // sigan siendo los mismos, y no queremos recrear los listeners por eso.
  const entrenamientoIds = entrenamientos.map((e) => e.id).join(',');
  useEffect(() => {
    if (!authUser || entrenamientos.length === 0) { setAsistencia({}); return; }
    const unsubs = entrenamientos.map((ent) => onSnapshot(
      collection(db,'entrenamientos',ent.id,'asistencia'),
      (snap) => {
        const porJugadora = {};
        snap.forEach((d) => { porJugadora[d.id] = d.data(); });
        setAsistencia((prev) => ({ ...prev, [ent.id]: porJugadora }));
      }
    ));
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser, entrenamientoIds]);

  // Aviso admin: cuántos entrenamientos programados quedan por delante
  useEffect(() => {
    if (!isAdmin) { setProximosCount(null); return; }
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const q = query(collection(db,'entrenamientos'), where('fecha','>=',Timestamp.fromDate(hoy)));
    const unsub = onSnapshot(q, (snap) => {
      setProximosCount(snap.docs.filter((d) => d.data().estado !== 'suspendido').length);
    });
    return unsub;
  }, [isAdmin]);

  // Competencias (admin)
  useEffect(() => {
    if (!isAdmin) { setCompetencias([]); return; }
    setCompetenciasLoading(true);
    const q = query(collection(db,'competencias'), orderBy('fechaInicio','desc'));
    const unsub = onSnapshot(q, (snap) => {
      setCompetencias(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setCompetenciasLoading(false);
    }, () => setCompetenciasLoading(false));
    return unsub;
  }, [isAdmin]);

  async function crearCompetencia() {
    const nombre = nuevaComp.nombre.trim();
    if (!nombre || !nuevaComp.fechaInicio || !nuevaComp.fechaTermino) {
      setCompetenciasError('Completa nombre y las dos fechas.');
      return;
    }
    try {
      await addDoc(collection(db,'competencias'), {
        nombre,
        fechaInicio: Timestamp.fromDate(parseDateInput(nuevaComp.fechaInicio)),
        fechaTermino: Timestamp.fromDate(parseDateInput(nuevaComp.fechaTermino)),
        estado: 'activa',
      });
      setNuevaComp({ nombre:'', fechaInicio:'', fechaTermino:'' });
      setCompetenciasError(null);
    } catch (e) { setCompetenciasError('No se pudo crear la competencia.'); }
  }

  function empezarEdicionCompetencia(c) {
    setCompEditandoId(c.id);
    setCompEdicion({
      nombre: c.nombre,
      fechaInicio: dateKey(c.fechaInicio.toDate()),
      fechaTermino: dateKey(c.fechaTermino.toDate()),
    });
  }

  async function guardarEdicionCompetencia() {
    const nombre = compEdicion.nombre.trim();
    if (!nombre || !compEdicion.fechaInicio || !compEdicion.fechaTermino) {
      setCompetenciasError('Completa nombre y las dos fechas.');
      return;
    }
    try {
      await updateDoc(doc(db,'competencias',compEditandoId), {
        nombre,
        fechaInicio: Timestamp.fromDate(parseDateInput(compEdicion.fechaInicio)),
        fechaTermino: Timestamp.fromDate(parseDateInput(compEdicion.fechaTermino)),
      });
      setCompEditandoId(null);
      setCompetenciasError(null);
    } catch (e) { setCompetenciasError('No se pudo guardar la edición.'); }
  }

  // cerrada no es un borrado: solo deja de ofrecerse al crear un partido
  // nuevo. Sigue existiendo igual para estadísticas y para los partidos
  // que ya la tengan asignada.
  async function alternarCierreCompetencia(c) {
    try {
      await updateDoc(doc(db,'competencias',c.id), { estado: c.estado==='cerrada' ? 'activa' : 'cerrada' });
    } catch (e) { setCompetenciasError('No se pudo actualizar el estado.'); }
  }

  // Partidos (admin)
  useEffect(() => {
    if (!isAdmin) { setPartidos([]); return; }
    setPartidosLoading(true);
    const q = query(collection(db,'partidos'), orderBy('fecha','asc'));
    const unsub = onSnapshot(q, (snap) => {
      setPartidos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPartidosLoading(false);
    }, () => setPartidosLoading(false));
    return unsub;
  }, [isAdmin]);

  // Un oficial sin competencia queda fuera de los acumulados; un
  // entrenamiento no lleva competencia; un amistoso puede tener o no.
  // Mismo criterio que ya hace cumplir firestore.rules — esto es solo para
  // no dejar tocar "Crear"/"Guardar" antes de llegar al servidor.
  function competenciaValidaParaPartido(tipo, competenciaId) {
    if (tipo === 'oficial' && !competenciaId) return false;
    return true;
  }

  async function crearPartido() {
    const { competenciaId, fecha, lugar, tipo, rival } = nuevoPartido;
    if (!fecha || !lugar.trim() || !tipo) { setPartidosError('Completa fecha, lugar y tipo.'); return; }
    if (!competenciaValidaParaPartido(tipo, competenciaId)) { setPartidosError('Un partido oficial necesita competencia.'); return; }
    try {
      const data = {
        fecha: Timestamp.fromDate(parseDateInput(fecha)),
        lugar: lugar.trim(),
        tipo,
        competenciaId: tipo === 'entrenamiento' ? '' : competenciaId,
        estado: 'programado',
        creadoPor: authUser.uid,
      };
      // rival no existe en absoluto para un entrenamiento -- no se guarda
      // ni vacío ni con un valor de relleno. La estructura real de dos
      // equipos internos llega con el armado de equipos de la Etapa 3.
      if (tipo !== 'entrenamiento') data.rival = rival.trim();
      await addDoc(collection(db,'partidos'), data);
      setNuevoPartido(PARTIDO_VACIO);
      setPartidosError(null);
    } catch (e) { setPartidosError('No se pudo crear el partido.'); }
  }

  function empezarEdicionPartido(p) {
    setPartidoEditandoId(p.id);
    setPartidoEdicion({
      competenciaId: p.competenciaId || '',
      fecha: dateKey(p.fecha.toDate()),
      lugar: p.lugar,
      tipo: p.tipo,
      rival: p.rival || '',
    });
  }

  async function guardarEdicionPartido() {
    const { competenciaId, fecha, lugar, tipo, rival } = partidoEdicion;
    if (!fecha || !lugar.trim() || !tipo) { setPartidosError('Completa fecha, lugar y tipo.'); return; }
    if (!competenciaValidaParaPartido(tipo, competenciaId)) { setPartidosError('Un partido oficial necesita competencia.'); return; }
    try {
      const data = {
        fecha: Timestamp.fromDate(parseDateInput(fecha)),
        lugar: lugar.trim(),
        tipo,
        competenciaId: tipo === 'entrenamiento' ? '' : competenciaId,
      };
      // Si se cambia a entrenamiento en la edición, se borra el rival que
      // pudiera haber quedado de antes -- no se deja un dato huérfano.
      data.rival = tipo === 'entrenamiento' ? deleteField() : rival.trim();
      await updateDoc(doc(db,'partidos',partidoEditandoId), data);
      setPartidoEditandoId(null);
      setPartidosError(null);
    } catch (e) { setPartidosError('No se pudo guardar la edición.'); }
  }

  async function alternarSuspensionPartido(p) {
    try {
      await updateDoc(doc(db,'partidos',p.id), { estado: p.estado==='suspendido' ? 'programado' : 'suspendido' });
    } catch (e) { setPartidosError('No se pudo actualizar el estado.'); }
  }

  function nombreCompetencia(competenciaId) {
    return competencias.find((c) => c.id === competenciaId)?.nombre || '';
  }

  function estaBloqueado(ent) { return bloqueado(ent) && !isAdmin; }

  async function marcar(entrenamientoId, jugadoraId) {
    const ent = entrenamientos.find((e) => e.id === entrenamientoId);
    if (!ent || ent.estado === 'suspendido' || estaBloqueado(ent)) return;
    const actual = asistencia[entrenamientoId]?.[jugadoraId]?.estado;
    const ref = doc(db,'entrenamientos',entrenamientoId,'asistencia',jugadoraId);
    try {
      if (actual === undefined) {
        await setDoc(ref, { estado:'presente', marcadoPor: authUser.uid, actualizadoEn: serverTimestamp() });
      } else if (actual === 'presente') {
        await setDoc(ref, { estado:'ausente', marcadoPor: authUser.uid, actualizadoEn: serverTimestamp() });
      } else {
        await deleteDoc(ref);
      }
      setError(null);
    } catch (e) { setError('No se pudo guardar el cambio.'); }
  }

  async function marcarVaciosComoAusentes(entrenamientoId) {
    const ent = entrenamientos.find((e) => e.id === entrenamientoId);
    if (!ent || ent.estado === 'suspendido' || estaBloqueado(ent)) return;
    const marcados = asistencia[entrenamientoId] || {};
    const faltantes = roster.filter((j) => marcados[j.id] === undefined);
    try {
      await Promise.all(faltantes.map((j) => setDoc(
        doc(db,'entrenamientos',entrenamientoId,'asistencia',j.id),
        { estado:'ausente', marcadoPor: authUser.uid, actualizadoEn: serverTimestamp() }
      )));
      setError(null);
    } catch (e) { setError('No se pudo guardar el cambio.'); }
  }

  async function alternarSuspension(entrenamientoId) {
    if (!isAdmin) return;
    const ent = entrenamientos.find((e) => e.id === entrenamientoId);
    if (!ent) return;
    try {
      await updateDoc(doc(db,'entrenamientos',entrenamientoId),
        { estado: ent.estado === 'suspendido' ? 'programado' : 'suspendido' });
    } catch (e) { setError('No se pudo actualizar el entrenamiento.'); }
  }

  function getStats(jugadoraId, ents) {
    let presente = 0, ausente = 0;
    ents.forEach((ent) => {
      const v = asistencia[ent.id]?.[jugadoraId]?.estado;
      if (v==='presente') presente++; else if (v==='ausente') ausente++;
    });
    const marked = presente+ausente;
    return { presente, ausente, pct: marked ? Math.round((presente/marked)*100) : null };
  }

  function downloadExcelReport() {
    const rows = roster
      .map((j) => ({ j, wed: getStats(j.id,wedEnt), sun: getStats(j.id,sunEnt), general: getStats(j.id,activeEnt) }))
      .sort((a,b) => (b.general.pct??-1)-(a.general.pct??-1))
      .map(({ j, wed, sun, general }) => ({
        'Nombre': `${j.nombre} ${j.apellido}`.trim(),
        'Miércoles - Presentes': wed.presente, 'Miércoles - Ausentes': wed.ausente, 'Miércoles - %': wed.pct??'',
        'Domingo - Presentes': sun.presente, 'Domingo - Ausentes': sun.ausente, 'Domingo - %': sun.pct??'',
        'General - Presentes': general.presente, 'General - Ausentes': general.ausente, 'General - %': general.pct??'',
      }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{wch:26},{wch:20},{wch:19},{wch:10},{wch:19},{wch:18},{wch:10},{wch:18},{wch:17},{wch:10}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estadísticas');
    XLSX.writeFile(wb, `asistencia_${monthLabel(monthDate).replace(/\s+/g,'_')}.xlsx`);
  }

  function changeMonth(delta) { const d = new Date(monthDate); d.setMonth(d.getMonth()+delta); setMonthDate(d); }

  // ── Crear nuevo mes ──────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'crearMes' || !isAdmin) return;
    let cancelado = false;
    setCrearMesCargando(true);
    setCrearMesMensaje(null);
    (async () => {
      const propuestos = getDaysInMonth(crearMesMonth)
        .filter((d) => d.getDay()===0 || d.getDay()===3)
        .map((d) => ({ key: dateKey(d), date: d, marcado: true }));
      const existentes = await Promise.all(propuestos.map((p) => getDoc(doc(db,'entrenamientos',p.key))));
      if (cancelado) return;
      setCrearMesDias(propuestos.map((p,i) => ({ ...p, yaExiste: existentes[i].exists() })));
      setCrearMesCargando(false);
    })();
    return () => { cancelado = true; };
  }, [activeTab, isAdmin, crearMesMonth.getFullYear(), crearMesMonth.getMonth()]);

  function toggleCrearMesDia(key) {
    setCrearMesDias((prev) => prev.map((d) => d.key===key && !d.yaExiste ? { ...d, marcado: !d.marcado } : d));
  }

  async function confirmarCrearMes() {
    const aCrear = crearMesDias.filter((d) => d.marcado && !d.yaExiste);
    if (aCrear.length === 0) { setCrearMesMensaje('No hay días nuevos para crear.'); return; }
    setCrearMesEnviando(true);
    try {
      await Promise.all(aCrear.map((d) => setDoc(doc(db,'entrenamientos',d.key), {
        fecha: Timestamp.fromDate(d.date),
        estado: 'programado',
        bloqueaEn: calcularBloqueaEn(d.date),
        creadoPor: authUser.uid,
      })));
      setCrearMesMensaje(`Se crearon ${aCrear.length} entrenamientos.`);
      setCrearMesDias((prev) => prev.map((d) => d.marcado ? { ...d, yaExiste:true } : d));
    } catch (e) {
      setCrearMesMensaje('No se pudo completar. Revisa e intenta de nuevo.');
    } finally { setCrearMesEnviando(false); }
  }

  const activeEnt = entrenamientos.filter((e) => e.estado !== 'suspendido');
  const wedEnt    = activeEnt.filter((e) => e.fecha.getDay()===3);
  const sunEnt    = activeEnt.filter((e) => e.fecha.getDay()===0);

  if (!authChecked) return (
    <div style={{ background: NAVY, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      Cargando…
    </div>
  );

  if (!authUser) return <LoginScreen />;

  const tabs = isAdmin ? ['registro','estadisticas','competencias','partidos','crearMes'] : ['registro','estadisticas'];
  const tabLabel = { registro:'Registro de asistencia', estadisticas:'Estadísticas de asistencia', competencias:'Competencias', partidos:'Partidos', crearMes:'Crear mes de asistencia' };

  return (
    <div style={{ background: PAPER, minHeight: '100vh', color: INK, fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      <style>{`
        @keyframes stampPop { 0%{transform:scale(0.4) rotate(0deg);opacity:0} 60%{transform:scale(1.15) rotate(var(--rot,0deg));opacity:1} 100%{transform:scale(1) rotate(var(--rot,0deg))} }
        .stamp-pop { animation: stampPop 0.22s ease-out; }
        ::-webkit-scrollbar { height: 8px; }
        ::-webkit-scrollbar-thumb { background: ${LINE}; border-radius: 4px; }
      `}</style>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 16px 48px' }}>
        {/* HEADER */}
        <header style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', background: NAVY, borderRadius: 12, padding: '12px 20px', marginBottom: 20 }}>
            <div style={{ flexShrink: 0 }}>{LOGO_SVG}</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ffffff', opacity: 0.9 }}>
                <Users size={15} />
                <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Gestión del Equipo</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: MUTED }}>{authUser.email}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {isAdmin && <div style={{ display:'flex',alignItems:'center',gap:5,fontSize:11,color:PRESENTE }}><Lock size={11}/> Sesión administradora</div>}
              <button onClick={()=>signOut(auth)}
                style={{ display:'flex',alignItems:'center',gap:4,border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:11,textDecoration:'underline',padding:0 }}>
                <LogOut size={11}/> Cerrar sesión
              </button>
            </div>
          </div>

          {isAdmin && proximosCount !== null && proximosCount < PROXIMOS_MIN && (
            <div style={{ background:'#FBF2E3', border:`1px solid #E8CFA0`, color:'#8A5A1E', borderRadius:10, padding:'8px 12px', fontSize:12, marginBottom:14 }}>
              Quedan {proximosCount} entrenamiento{proximosCount===1?'':'s'} programado{proximosCount===1?'':'s'} por delante — conviene generar el próximo mes en "Crear nuevo mes".
            </div>
          )}

          {(activeTab === 'registro' || activeTab === 'estadisticas') && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: 22, fontWeight: 700, margin: 0 }}>{monthLabel(monthDate)}</h2>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => changeMonth(-1)} style={{ width:32,height:32,borderRadius:8,border:`1px solid ${LINE}`,background:'white',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}><ChevronLeft size={16}/></button>
                <button onClick={() => changeMonth(1)}  style={{ width:32,height:32,borderRadius:8,border:`1px solid ${LINE}`,background:'white',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}><ChevronRight size={16}/></button>
              </div>
            </div>
          )}
        </header>

        {/* PESTAÑAS */}
        <div style={{ display:'flex',gap:4,marginBottom:16,borderBottom:`1px solid ${LINE}` }}>
          {tabs.map((tab) => (
            <button key={tab} onClick={()=>setActiveTab(tab)}
              style={{ padding:'8px 16px',fontSize:13,fontWeight:600,border:'none',background:'none',cursor:'pointer',
                color:activeTab===tab?INK:MUTED, borderBottom:activeTab===tab?`2px solid ${INK}`:'2px solid transparent',marginBottom:-1 }}>
              {tabLabel[tab]}
            </button>
          ))}
        </div>

        {/* TABLA REGISTRO */}
        {activeTab==='registro' && (
          rosterLoading || entrenamientosLoading ? (
            <div style={{ textAlign:'center',color:MUTED,padding:'40px 0' }}>Cargando…</div>
          ) : rosterError ? (
            <div style={{ textAlign:'center',color:AUSENTE,padding:'40px 0',border:`1px dashed ${AUSENTE}`,borderRadius:12 }}>
              {rosterError}
            </div>
          ) : roster.length === 0 ? (
            <div style={{ textAlign:'center',color:MUTED,padding:'40px 0',border:`1px dashed ${LINE}`,borderRadius:12 }}>
              No hay jugadoras activas en el registro.
            </div>
          ) : entrenamientos.length === 0 ? (
            <div style={{ textAlign:'center',color:MUTED,padding:'40px 0',border:`1px dashed ${LINE}`,borderRadius:12 }}>
              Este mes todavía no tiene entrenamientos creados{isAdmin ? ' — usa "Crear nuevo mes" para generarlos.' : ' — pide a una administradora que los genere.'}
            </div>
          ) : (
            <>
              <div style={{ overflowX:'auto',border:`1px solid ${LINE}`,borderRadius:12,background:'white' }}>
                <table style={{ borderCollapse:'collapse',width:'100%' }}>
                  <thead>
                    <tr>
                      <th style={{ position:'sticky',left:0,zIndex:2,background:'white',textAlign:'left',padding:'10px 12px',fontSize:12,color:MUTED,fontWeight:600,borderBottom:`1px solid ${LINE}`,borderRight:`1px solid ${LINE}`,minWidth:140 }}>Nombre</th>
                      {entrenamientos.map((ent) => {
                        const suspendido = ent.estado === 'suspendido', locked = bloqueado(ent);
                        return (
                          <th key={ent.id} style={{ padding:'6px 4px',fontSize:11,fontWeight:500,textAlign:'center',minWidth:42,
                            color:suspendido?'#C2938A':MUTED, background:suspendido?'#F6E9E6':'white', borderBottom:`1px solid ${LINE}` }}>
                            <div>{WEEKDAY_LABELS[ent.fecha.getDay()]}</div>
                            <div style={{ fontFamily:'monospace',fontSize:12,color:suspendido?AUSENTE:INK,textDecoration:suspendido?'line-through':'none' }}>{ent.fecha.getDate()}</div>
                            {isAdmin ? (
                              <button onClick={()=>alternarSuspension(ent.id)} title={suspendido?'Reactivar':'Marcar como no realizado'}
                                style={{ marginTop:3,border:'none',background:'none',cursor:'pointer',padding:1,color:suspendido?AUSENTE:'#C2BBAF' }}>
                                <X size={10} strokeWidth={2.5}/>
                              </button>
                            ) : locked && !suspendido ? (
                              <div title="Plazo vencido" style={{ marginTop:3,display:'flex',justifyContent:'center',color:'#C2BBAF' }}><Lock size={10} strokeWidth={2.5}/></div>
                            ) : null}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((j) => (
                      <tr key={j.id}>
                        <td style={{ position:'sticky',left:0,zIndex:1,background:'white',padding:'8px 12px',fontSize:14,borderBottom:`1px solid ${LINE}`,borderRight:`1px solid ${LINE}`,whiteSpace:'nowrap' }}>
                          {`${j.nombre} ${j.apellido}`.trim()}
                        </td>
                        {entrenamientos.map((ent) => {
                          const suspendido = ent.estado === 'suspendido';
                          const locked = estaBloqueado(ent);
                          const status = asistencia[ent.id]?.[j.id]?.estado;
                          return (
                            <td key={ent.id} style={{ textAlign:'center',padding:'6px 4px',background:suspendido?'#FBF2F0':'white',borderBottom:`1px solid ${LINE}` }}>
                              {suspendido ? (
                                <div style={{ width:30,height:30,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto' }}>
                                  <div style={{ width:16,height:1.5,background:'#D9B6AF' }}/>
                                </div>
                              ) : (
                                <div style={{ opacity:locked?0.45:1 }} title={locked?'Plazo vencido':undefined}>
                                  <Stamp status={status} onClick={()=>marcar(ent.id,j.id)} disabled={locked}/>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td style={{ position:'sticky',left:0,zIndex:1,background:'white',padding:'8px 12px',fontSize:11,color:MUTED,borderRight:`1px solid ${LINE}`,borderTop:`1px solid ${LINE}`,whiteSpace:'nowrap' }}>Marcar vacíos ausentes</td>
                      {entrenamientos.map((ent) => {
                        const suspendido = ent.estado === 'suspendido';
                        const disabled = suspendido || estaBloqueado(ent);
                        return (
                          <td key={ent.id} style={{ textAlign:'center',padding:'4px 2px',borderTop:`1px solid ${LINE}` }}>
                            <button onClick={()=>marcarVaciosComoAusentes(ent.id)} disabled={disabled}
                              style={{ width:22,height:22,borderRadius:6,border:`1px solid ${disabled?LINE:AUSENTE}`,background:disabled?'#F5F4F1':'#F6E9E6',
                                color:disabled?'#C2BBAF':AUSENTE,display:'flex',alignItems:'center',justifyContent:'center',cursor:disabled?'default':'pointer',margin:'0 auto' }}>
                              <X size={12} strokeWidth={2.5}/>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p style={{ fontSize:12,color:MUTED,margin:'10px 2px 16px' }}>
                Toca un día para marcar: vacío → presente → ausente → vacío. Cualquiera puede corregir la marca de cualquiera. Usa la ✕ sobre la fecha para marcar el entrenamiento como no realizado (solo administradoras), o la ✕ debajo para marcar ausentes a quienes quedaron sin marca. Cada registro se bloquea 24h después de las 23:30 del día del entrenamiento.
              </p>

              {isAdmin && (
                <div style={{ textAlign:'right',marginBottom:8 }}>
                  <button onClick={downloadExcelReport}
                    style={{ display:'inline-flex',alignItems:'center',gap:4,border:`1px solid ${LINE}`,background:'white',color:INK,cursor:'pointer',fontSize:11,padding:'4px 8px',borderRadius:6 }}>
                    <Download size={11}/> Descargar reporte Excel
                  </button>
                </div>
              )}
            </>
          )
        )}

        {/* TABLA ESTADÍSTICAS */}
        {activeTab==='estadisticas' && rosterError && (
          <div style={{ textAlign:'center',color:AUSENTE,padding:'40px 0',border:`1px dashed ${AUSENTE}`,borderRadius:12 }}>
            {rosterError}
          </div>
        )}
        {activeTab==='estadisticas' && !rosterLoading && !rosterError && roster.length > 0 && (
          <div style={{ overflowX:'auto',border:`1px solid ${LINE}`,borderRadius:12,background:'white',marginTop:4,marginBottom:24 }}>
            <table style={{ borderCollapse:'collapse',width:'100%' }}>
              <thead>
                <tr>
                  <th style={{ position:'sticky',left:0,zIndex:2,background:'white',textAlign:'left',padding:'10px 12px',fontSize:12,color:MUTED,fontWeight:600,borderBottom:`1px solid ${LINE}`,borderRight:`1px solid ${LINE}`,minWidth:150 }}>Nombre</th>
                  {['Miércoles','Domingo','General'].map(label => (
                    <th key={label} colSpan={3} style={{ padding:'6px 4px',fontSize:11,fontWeight:600,color:MUTED,textAlign:'center',borderBottom:`1px solid ${LINE}`,borderLeft:`1px solid ${LINE}` }}>{label}</th>
                  ))}
                </tr>
                <tr>
                  <th style={{ position:'sticky',left:0,zIndex:1,background:'white',borderRight:`1px solid ${LINE}`,borderBottom:`1px solid ${LINE}` }}></th>
                  {['Pres.','Aus.','%','Pres.','Aus.','%','Pres.','Aus.','%'].map((label,i) => (
                    <th key={i} style={{ padding:'4px 8px',fontSize:11,fontWeight:500,color:MUTED,textAlign:'center',borderBottom:`1px solid ${LINE}`,borderLeft:i%3===0?`1px solid ${LINE}`:'none',minWidth:44 }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster
                  .map((j) => ({ j, wed:getStats(j.id,wedEnt), sun:getStats(j.id,sunEnt), general:getStats(j.id,activeEnt) }))
                  .sort((a,b) => (b.general.pct??-1)-(a.general.pct??-1))
                  .map(({ j, wed, sun, general }) => (
                    <tr key={j.id}>
                      <td style={{ position:'sticky',left:0,zIndex:1,background:'white',padding:'8px 12px',fontSize:14,borderBottom:`1px solid ${LINE}`,borderRight:`1px solid ${LINE}`,whiteSpace:'nowrap' }}>{`${j.nombre} ${j.apellido}`.trim()}</td>
                      {[wed,sun,general].flatMap((s,gi) => [
                        <td key={`${gi}p`} style={{ textAlign:'center',padding:'6px 8px',fontSize:13,color:PRESENTE,borderBottom:`1px solid ${LINE}`,borderLeft:`1px solid ${LINE}` }}>{s.presente}</td>,
                        <td key={`${gi}a`} style={{ textAlign:'center',padding:'6px 8px',fontSize:13,color:AUSENTE,borderBottom:`1px solid ${LINE}` }}>{s.ausente}</td>,
                        <td key={`${gi}pct`} style={{ textAlign:'center',padding:'6px 8px',fontSize:13,fontFamily:'monospace',fontWeight:gi===2?700:600,borderBottom:`1px solid ${LINE}`,
                          color:s.pct===null?MUTED:s.pct>=75?PRESENTE:s.pct>=50?'#B07D2A':AUSENTE }}>
                          {s.pct===null?'—':`${s.pct}%`}
                        </td>,
                      ])}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {/* COMPETENCIAS */}
        {activeTab==='competencias' && isAdmin && (
          <div style={{ background:'white',border:`1px solid ${LINE}`,borderRadius:12,padding:'20px 20px 24px' }}>
            <h3 style={{ margin:'0 0 14px',fontSize:16,fontWeight:700 }}>Nueva competencia</h3>
            <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:10 }}>
              <input value={nuevaComp.nombre} onChange={(e)=>setNuevaComp({...nuevaComp,nombre:e.target.value})}
                placeholder="Nombre" style={{ flex:'1 1 200px',padding:'9px 12px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:14,outline:'none' }} />
              <input type="date" value={nuevaComp.fechaInicio} onChange={(e)=>setNuevaComp({...nuevaComp,fechaInicio:e.target.value})}
                style={{ padding:'9px 12px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:14,outline:'none' }} />
              <input type="date" value={nuevaComp.fechaTermino} onChange={(e)=>setNuevaComp({...nuevaComp,fechaTermino:e.target.value})}
                style={{ padding:'9px 12px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:14,outline:'none' }} />
              <button onClick={crearCompetencia}
                style={{ display:'flex',alignItems:'center',gap:4,padding:'9px 14px',borderRadius:8,border:'none',background:INK,color:PAPER,fontSize:14,cursor:'pointer' }}>
                <Plus size={15}/> Crear
              </button>
            </div>
            {competenciasError && <p style={{ fontSize:12,color:AUSENTE,margin:'0 0 14px' }}>{competenciasError}</p>}

            <h3 style={{ margin:'20px 0 10px',fontSize:16,fontWeight:700 }}>Competencias</h3>
            {competenciasLoading ? (
              <div style={{ color:MUTED,fontSize:13,padding:'12px 0' }}>Cargando…</div>
            ) : competencias.length === 0 ? (
              <div style={{ color:MUTED,fontSize:13,padding:'12px 0' }}>Todavía no hay ninguna.</div>
            ) : (
              <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                {competencias.map((c) => (
                  <div key={c.id} style={{ border:`1px solid ${LINE}`,borderRadius:8,padding:'10px 14px' }}>
                    {compEditandoId === c.id ? (
                      <div style={{ display:'flex',flexWrap:'wrap',gap:8,alignItems:'center' }}>
                        <input value={compEdicion.nombre} onChange={(e)=>setCompEdicion({...compEdicion,nombre:e.target.value})}
                          style={{ flex:'1 1 200px',padding:'7px 10px',borderRadius:6,border:`1px solid ${LINE}`,fontSize:13,outline:'none' }} />
                        <input type="date" value={compEdicion.fechaInicio} onChange={(e)=>setCompEdicion({...compEdicion,fechaInicio:e.target.value})}
                          style={{ padding:'7px 10px',borderRadius:6,border:`1px solid ${LINE}`,fontSize:13,outline:'none' }} />
                        <input type="date" value={compEdicion.fechaTermino} onChange={(e)=>setCompEdicion({...compEdicion,fechaTermino:e.target.value})}
                          style={{ padding:'7px 10px',borderRadius:6,border:`1px solid ${LINE}`,fontSize:13,outline:'none' }} />
                        <button onClick={guardarEdicionCompetencia}
                          style={{ padding:'7px 12px',borderRadius:6,border:'none',background:INK,color:'white',fontSize:12,cursor:'pointer' }}>Guardar</button>
                        <button onClick={()=>setCompEditandoId(null)}
                          style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12 }}>Cancelar</button>
                      </div>
                    ) : (
                      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8 }}>
                        <div>
                          <span style={{ fontWeight:600,fontSize:14 }}>{c.nombre}</span>
                          <span style={{ marginLeft:8,fontSize:12,color:MUTED }}>
                            {dateKey(c.fechaInicio.toDate())} – {dateKey(c.fechaTermino.toDate())}
                          </span>
                          <span style={{ marginLeft:8,fontSize:11,padding:'2px 8px',borderRadius:999,
                            background:c.estado==='cerrada'?'#F6E9E6':'#EAF2EC',color:c.estado==='cerrada'?AUSENTE:PRESENTE }}>
                            {c.estado==='cerrada'?'Cerrada':'Activa'}
                          </span>
                        </div>
                        <div style={{ display:'flex',gap:10 }}>
                          <button onClick={()=>empezarEdicionCompetencia(c)}
                            style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12,textDecoration:'underline' }}>Editar</button>
                          <button onClick={()=>alternarCierreCompetencia(c)}
                            style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12,textDecoration:'underline' }}>
                            {c.estado==='cerrada'?'Reabrir':'Cerrar'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PARTIDOS */}
        {activeTab==='partidos' && isAdmin && (
          <div style={{ background:'white',border:`1px solid ${LINE}`,borderRadius:12,padding:'20px 20px 24px' }}>
            <h3 style={{ margin:'0 0 14px',fontSize:16,fontWeight:700 }}>Nuevo partido</h3>
            <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:10 }}>
              <select value={nuevoPartido.tipo}
                onChange={(e)=>setNuevoPartido({ ...nuevoPartido, tipo:e.target.value, ...(e.target.value==='entrenamiento' ? { competenciaId:'', rival:'' } : {}) })}
                style={{ padding:'9px 12px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:14,outline:'none',background:'white' }}>
                <option value="oficial">Oficial</option>
                <option value="amistoso">Amistoso</option>
                <option value="entrenamiento">Entrenamiento (interno)</option>
              </select>
              {nuevoPartido.tipo !== 'entrenamiento' && (
                <select value={nuevoPartido.competenciaId} onChange={(e)=>setNuevoPartido({ ...nuevoPartido, competenciaId:e.target.value })}
                  style={{ padding:'9px 12px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:14,outline:'none',background:'white' }}>
                  <option value="">
                    {nuevoPartido.tipo==='oficial' ? '— Selecciona competencia —' : 'Sin competencia'}
                  </option>
                  {competencias.filter((c)=>c.estado==='activa').map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              )}
              <input type="date" value={nuevoPartido.fecha} onChange={(e)=>setNuevoPartido({ ...nuevoPartido, fecha:e.target.value })}
                style={{ padding:'9px 12px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:14,outline:'none' }} />
              <input value={nuevoPartido.lugar} onChange={(e)=>setNuevoPartido({ ...nuevoPartido, lugar:e.target.value })}
                placeholder="Lugar" style={{ flex:'1 1 160px',padding:'9px 12px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:14,outline:'none' }} />
              {nuevoPartido.tipo !== 'entrenamiento' && (
                <input value={nuevoPartido.rival} onChange={(e)=>setNuevoPartido({ ...nuevoPartido, rival:e.target.value })}
                  placeholder="Rival" style={{ flex:'1 1 160px',padding:'9px 12px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:14,outline:'none' }} />
              )}
              <button onClick={crearPartido}
                style={{ display:'flex',alignItems:'center',gap:4,padding:'9px 14px',borderRadius:8,border:'none',background:INK,color:PAPER,fontSize:14,cursor:'pointer' }}>
                <Plus size={15}/> Crear
              </button>
            </div>
            {partidosError && <p style={{ fontSize:12,color:AUSENTE,margin:'0 0 14px' }}>{partidosError}</p>}

            <h3 style={{ margin:'20px 0 10px',fontSize:16,fontWeight:700 }}>Partidos</h3>
            {partidosLoading ? (
              <div style={{ color:MUTED,fontSize:13,padding:'12px 0' }}>Cargando…</div>
            ) : partidos.length === 0 ? (
              <div style={{ color:MUTED,fontSize:13,padding:'12px 0' }}>Todavía no hay ninguno.</div>
            ) : (
              <div style={{ display:'flex',flexDirection:'column',gap:8 }}>
                {partidos.map((p) => (
                  <div key={p.id} style={{ border:`1px solid ${LINE}`,borderRadius:8,padding:'10px 14px' }}>
                    {partidoEditandoId === p.id ? (
                      <div style={{ display:'flex',flexWrap:'wrap',gap:8,alignItems:'center' }}>
                        <select value={partidoEdicion.tipo}
                          onChange={(e)=>setPartidoEdicion({ ...partidoEdicion, tipo:e.target.value, ...(e.target.value==='entrenamiento' ? { competenciaId:'', rival:'' } : {}) })}
                          style={{ padding:'7px 10px',borderRadius:6,border:`1px solid ${LINE}`,fontSize:13,outline:'none',background:'white' }}>
                          <option value="oficial">Oficial</option>
                          <option value="amistoso">Amistoso</option>
                          <option value="entrenamiento">Entrenamiento (interno)</option>
                        </select>
                        {partidoEdicion.tipo !== 'entrenamiento' && (
                          <select value={partidoEdicion.competenciaId} onChange={(e)=>setPartidoEdicion({ ...partidoEdicion, competenciaId:e.target.value })}
                            style={{ padding:'7px 10px',borderRadius:6,border:`1px solid ${LINE}`,fontSize:13,outline:'none',background:'white' }}>
                            <option value="">
                              {partidoEdicion.tipo==='oficial' ? '— Selecciona competencia —' : 'Sin competencia'}
                            </option>
                            {competencias.filter((c)=>c.estado==='activa' || c.id===partidoEdicion.competenciaId).map((c) => (
                              <option key={c.id} value={c.id}>{c.nombre}</option>
                            ))}
                          </select>
                        )}
                        <input type="date" value={partidoEdicion.fecha} onChange={(e)=>setPartidoEdicion({ ...partidoEdicion, fecha:e.target.value })}
                          style={{ padding:'7px 10px',borderRadius:6,border:`1px solid ${LINE}`,fontSize:13,outline:'none' }} />
                        <input value={partidoEdicion.lugar} onChange={(e)=>setPartidoEdicion({ ...partidoEdicion, lugar:e.target.value })}
                          placeholder="Lugar" style={{ flex:'1 1 140px',padding:'7px 10px',borderRadius:6,border:`1px solid ${LINE}`,fontSize:13,outline:'none' }} />
                        {partidoEdicion.tipo !== 'entrenamiento' && (
                          <input value={partidoEdicion.rival} onChange={(e)=>setPartidoEdicion({ ...partidoEdicion, rival:e.target.value })}
                            placeholder="Rival" style={{ flex:'1 1 140px',padding:'7px 10px',borderRadius:6,border:`1px solid ${LINE}`,fontSize:13,outline:'none' }} />
                        )}
                        <button onClick={guardarEdicionPartido}
                          style={{ padding:'7px 12px',borderRadius:6,border:'none',background:INK,color:'white',fontSize:12,cursor:'pointer' }}>Guardar</button>
                        <button onClick={()=>setPartidoEditandoId(null)}
                          style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12 }}>Cancelar</button>
                      </div>
                    ) : (
                      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8 }}>
                        <div>
                          <span style={{ fontWeight:600,fontSize:14 }}>
                            {dateKey(p.fecha.toDate())} · {p.lugar}
                            {p.rival ? ` vs ${p.rival}` : ''}
                          </span>
                          <span style={{ marginLeft:8,fontSize:11,padding:'2px 8px',borderRadius:999,background:'#EEF1F6',color:INK }}>
                            {p.tipo}
                          </span>
                          {p.competenciaId && (
                            <span style={{ marginLeft:8,fontSize:12,color:MUTED }}>{nombreCompetencia(p.competenciaId)}</span>
                          )}
                          <span style={{ marginLeft:8,fontSize:11,padding:'2px 8px',borderRadius:999,
                            background:p.estado==='suspendido'?'#F6E9E6':'#EAF2EC',color:p.estado==='suspendido'?AUSENTE:PRESENTE }}>
                            {p.estado==='suspendido'?'Suspendido':'Programado'}
                          </span>
                        </div>
                        <div style={{ display:'flex',gap:10 }}>
                          <button onClick={()=>empezarEdicionPartido(p)}
                            style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12,textDecoration:'underline' }}>Editar</button>
                          <button onClick={()=>alternarSuspensionPartido(p)}
                            style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12,textDecoration:'underline' }}>
                            {p.estado==='suspendido'?'Reactivar':'Suspender'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CREAR NUEVO MES */}
        {activeTab==='crearMes' && isAdmin && (
          <div style={{ background:'white',border:`1px solid ${LINE}`,borderRadius:12,padding:'20px 20px 24px' }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16 }}>
              <h3 style={{ margin:0,fontSize:16,fontWeight:700 }}>{monthLabel(crearMesMonth)}</h3>
              <div style={{ display:'flex',gap:4 }}>
                <button onClick={()=>{const d=new Date(crearMesMonth);d.setMonth(d.getMonth()-1);setCrearMesMonth(d);}}
                  style={{ width:32,height:32,borderRadius:8,border:`1px solid ${LINE}`,background:'white',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}><ChevronLeft size={16}/></button>
                <button onClick={()=>{const d=new Date(crearMesMonth);d.setMonth(d.getMonth()+1);setCrearMesMonth(d);}}
                  style={{ width:32,height:32,borderRadius:8,border:`1px solid ${LINE}`,background:'white',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}><ChevronRight size={16}/></button>
              </div>
            </div>

            <p style={{ fontSize:13,color:MUTED,margin:'0 0 14px' }}>
              Se proponen los miércoles y domingos de este mes. Desmarca los que no correspondan (feriados, receso) antes de confirmar.
            </p>

            {crearMesCargando ? (
              <div style={{ color:MUTED,fontSize:13,padding:'12px 0' }}>Cargando…</div>
            ) : (
              <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:18 }}>
                {crearMesDias.map((d) => (
                  <label key={d.key} style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 12px',borderRadius:8,
                    border:`1px solid ${LINE}`,background:d.yaExiste?'#F5F4F1':'white',fontSize:13,cursor:d.yaExiste?'default':'pointer' }}>
                    <input type="checkbox" checked={d.marcado} disabled={d.yaExiste} onChange={()=>toggleCrearMesDia(d.key)} />
                    {WEEKDAY_LABELS[d.date.getDay()]} {d.date.getDate()}
                    {d.yaExiste && <span style={{ color:MUTED,fontSize:11 }}>ya existe</span>}
                  </label>
                ))}
              </div>
            )}

            <button onClick={confirmarCrearMes} disabled={crearMesEnviando || crearMesCargando}
              style={{ display:'flex',alignItems:'center',gap:4,padding:'9px 14px',borderRadius:8,border:'none',background:INK,color:PAPER,fontSize:14,
                cursor:crearMesEnviando?'default':'pointer',opacity:crearMesEnviando?0.7:1 }}>
              <Plus size={15}/> {crearMesEnviando ? 'Creando…' : 'Crear entrenamientos'}
            </button>

            {crearMesMensaje && <p style={{ fontSize:12,color:MUTED,marginTop:10 }}>{crearMesMensaje}</p>}
          </div>
        )}

        {error && <div style={{ marginTop:16,fontSize:12,color:AUSENTE,textAlign:'center' }}>{error}</div>}
      </div>
    </div>
  );
}
