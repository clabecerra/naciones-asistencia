import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Check, Users, RefreshCw, Lock, Download, LogIn, LogOut } from 'lucide-react';
import * as XLSX from 'xlsx';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';

// ─── CONFIGURACIÓN FIREBASE ────────────────────────────────────────────────
// Reemplaza estos valores con los de tu proyecto Firebase
const firebaseConfig = {
  apiKey:            "AIzaSyCOVvMulmSN9lQwD1-Kb35Mi9W2H2YA_1I",
  authDomain:        "naciones-asistencia.firebaseapp.com",
  projectId:         "naciones-asistencia",
  storageBucket:     "naciones-asistencia.firebasestorage.app",
  messagingSenderId: "313215448282",
  appId:             "1:313215448282:web:ba2a44016b3120b4c9e1e3",
};
// ──────────────────────────────────────────────────────────────────────────

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

const INK   = '#1B3A6B';
const PAPER = '#F4F6F9';
const LINE  = '#C8D4E3';
const MUTED = '#7B9BB8';
const PRESENTE = '#3A6B52';
const AUSENTE  = '#A8432F';
const NAVY  = '#1B3A6B';
const STEEL = '#4A6FA5';

const WEEKDAY_LABELS = ['Do','Lu','Ma','Mi','Ju','Vi','Sa'];
const DEFAULT_ACCESS_PASSWORD = 'naciones2026';

function pad(n) { return n.toString().padStart(2,'0'); }
function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function parseDateKey(key) { const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d); }
function isDayLocked(key) {
  const d = parseDateKey(key);
  return Date.now() > new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,30,0).getTime() + 86400000;
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
function timeAgo(ts) {
  if (!ts) return null;
  const mins = Math.floor(Math.max(0,Date.now()-ts)/60000);
  if (mins < 1) return 'justo ahora';
  if (mins === 1) return 'hace 1 minuto';
  if (mins < 60) return `hace ${mins} minutos`;
  const hrs = Math.floor(mins/60);
  return hrs===1 ? 'hace 1 hora' : `hace ${hrs} horas`;
}

function Stamp({ status, onClick, disabled }) {
  const base = { width:30, height:30, borderRadius:'9999px', display:'flex', alignItems:'center', justifyContent:'center',
    cursor:disabled?'default':'pointer', transition:'transform 0.12s ease', border:'1.5px solid' };
  if (status==='presente') return (
    <button onClick={onClick} disabled={disabled} aria-label="Presente" className="stamp-pop"
      style={{...base,borderColor:PRESENTE,background:'#EAF2EC',color:PRESENTE,transform:'rotate(-7deg)'}}>
      <Check size={16} strokeWidth={3}/>
    </button>
  );
  if (status==='ausente') return (
    <button onClick={onClick} disabled={disabled} aria-label="Ausente" className="stamp-pop"
      style={{...base,borderColor:AUSENTE,background:'#F6E9E6',color:AUSENTE,transform:'rotate(6deg)'}}>
      <X size={16} strokeWidth={3}/>
    </button>
  );
  return (
    <button onClick={onClick} disabled={disabled} aria-label="Sin marcar"
      style={{...base,borderStyle:'dashed',borderColor:LINE,background:'transparent'}}
      onMouseEnter={(e)=>{if(!disabled)e.currentTarget.style.borderColor=MUTED;}}
      onMouseLeave={(e)=>{e.currentTarget.style.borderColor=LINE;}}
    />
  );
}

const DEFAULT_MEMBERS = [
  'Luna Álvarez','Amanda Arratia','Mariela Arriagada','Angela (Coti) Bastidas',
  'Claudia Becerra','Camila Bravo','Viviana Cuvertino','Ivonne Durand',
  'Fabiola Finch Encina','Fernanda Gallego','Pilar Herrera','M. Magdalena Hurtado',
  'Loreto Imperatore','Maio Jordá','Natalia Knust','Maritza Linares',
  'Soledad Lobiano','Angie Lopez','Maria Mesonero','Ana Ortega',
  'Javiera Osorio','Katia Puyol','Paz Riquelme','María Paz Rodríguez',
  'Muriel Salamanca','Claudia Salazar','Karina Sánchez','Mara Santibañez',
  'Pamela Sepúlveda','Natalia Soto','Luz María Ulbrich','Patricia Urbina',
  'Titi Vallejos','Alejandra Véliz','Natalia Venegas','María José Zúñiga',
].map((name,i)=>({id:`default-${i}`,name}));

// ─── LOGO SVG ──────────────────────────────────────────────────────────────
const LOGO_SVG = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="186 165 1068 535" style={{width:85,height:'auto',display:'block'}} preserveAspectRatio="xMidYMid meet">
    <defs><clipPath id="cp1"><path d="M 0.71875 0.601562 L 1068.480469 0.601562 L 1068.480469 468 L 0.71875 468 Z" clipRule="nonzero"/></clipPath><clipPath id="cp2"><rect x="0" width="1069" y="0" height="468"/></clipPath><clipPath id="cp3"><path d="M 10 362 L 1058 362 L 1058 534.601562 L 10 534.601562 Z" clipRule="nonzero"/></clipPath><clipPath id="cp4"><rect x="0" width="1048" y="0" height="173"/></clipPath><clipPath id="cp5"><rect x="0" width="1069" y="0" height="535"/></clipPath></defs>
    <g transform="matrix(1,0,0,1,186,165)"><g clipPath="url(#cp5)"><g clipPath="url(#cp1)"><g clipPath="url(#cp2)">
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(7.815617,350.272005)"><g><path d="M 11.652344 -339.222656 L 172.351562 -339.222656 L 172.351562 -250.890625 L 134.246094 -250.890625 L 134.246094 -264.292969 L 147.644531 -264.292969 L 147.644531 -61.996094 L 134.246094 -61.996094 L 134.246094 -75.394531 L 194.375 -75.394531 L 194.375 -61.996094 L 180.972656 -61.996094 L 180.972656 -134.59375 L 286.085938 -134.59375 L 286.085938 13.402344 L -1.75 13.402344 L -1.75 -75.394531 L 37.289062 -75.394531 L 37.289062 -61.996094 L 23.890625 -61.996094 L 23.890625 -264.292969 L 37.289062 -264.292969 L 37.289062 -250.890625 L -1.75 -250.890625 L -1.75 -339.222656 Z M 11.652344 -312.421875 L 11.652344 -325.824219 L 25.054688 -325.824219 L 25.054688 -264.292969 L 11.652344 -264.292969 L 11.652344 -277.695312 L 50.691406 -277.695312 L 50.691406 -48.59375 L 11.652344 -48.59375 L 11.652344 -61.996094 L 25.054688 -61.996094 L 25.054688 0 L 11.652344 0 L 11.652344 -13.402344 L 272.683594 -13.402344 L 272.683594 0 L 259.28125 0 L 259.28125 -121.191406 L 272.683594 -121.191406 L 272.683594 -107.792969 L 194.375 -107.792969 L 194.375 -121.191406 L 207.777344 -121.191406 L 207.777344 -48.59375 L 120.84375 -48.59375 L 120.84375 -277.695312 L 158.949219 -277.695312 L 158.949219 -264.292969 L 145.546875 -264.292969 L 145.546875 -325.824219 L 158.949219 -325.824219 L 158.949219 -312.421875 Z"/></g></g></g>
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(278.168221,350.272005)"><g><path d="M 337.007812 -230.382812 L 335.144531 -230.382812 L 335.144531 -243.785156 L 348.328125 -241.386719 C 347.070312 -234.457031 345.574219 -226.75 343.847656 -218.269531 C 342.128906 -209.820312 340.484375 -201.996094 338.917969 -194.789062 C 337.261719 -187.171875 335.734375 -181.269531 334.339844 -177.085938 L 321.628906 -181.324219 L 334.566406 -177.832031 L 282.949219 13.402344 L 165.105469 13.402344 L 110.15625 -182.363281 L 123.058594 -185.984375 L 110.25 -182.042969 C 108.875 -186.503906 106.980469 -194.699219 104.5625 -206.628906 C 102.101562 -218.765625 100.542969 -230.910156 99.886719 -243.0625 L 113.269531 -243.785156 L 113.269531 -230.382812 L 111.402344 -230.382812 L 111.402344 -243.785156 L 124.804688 -243.785156 L 124.804688 -60.128906 L 111.402344 -60.128906 L 111.402344 -73.53125 L 151.375 -73.53125 L 151.375 13.402344 L -1.75 13.402344 L -1.75 -73.53125 L 36.824219 -73.53125 L 36.824219 -60.128906 L 23.421875 -60.128906 L 23.421875 -265.691406 L 36.824219 -265.691406 L 36.824219 -252.289062 L -1.28125 -252.289062 L -1.28125 -339.222656 L 199.042969 -339.222656 L 248.796875 -154.984375 L 235.859375 -151.492188 L 222.878906 -154.824219 L 270.210938 -339.222656 L 471.601562 -339.222656 L 471.601562 -252.289062 L 432.566406 -252.289062 L 432.566406 -265.691406 L 445.964844 -265.691406 L 445.964844 -60.597656 L 432.566406 -60.597656 L 432.566406 -73.996094 L 471.601562 -73.996094 L 471.601562 13.402344 L 297.503906 13.402344 L 297.503906 -73.996094 L 337.007812 -73.996094 L 337.007812 -60.597656 L 323.609375 -60.597656 L 323.609375 -243.785156 L 337.007812 -243.785156 Z M 350.410156 -257.183594 L 350.410156 -47.195312 L 310.90625 -47.195312 L 310.90625 -60.597656 L 324.308594 -60.597656 L 324.308594 0 L 310.90625 0 L 310.90625 -13.402344 L 458.203125 -13.402344 L 458.203125 0 L 444.800781 0 L 444.800781 -60.597656 L 458.203125 -60.597656 L 458.203125 -47.195312 L 419.164062 -47.195312 L 419.164062 -279.09375 L 458.203125 -279.09375 L 458.203125 -265.691406 L 444.800781 -265.691406 L 444.800781 -325.824219 L 458.203125 -325.824219 L 458.203125 -312.421875 L 280.609375 -312.421875 L 280.609375 -325.824219 L 293.589844 -322.492188 L 236.1875 -98.871094 L 175.84375 -322.328125 L 188.78125 -325.824219 L 188.78125 -312.421875 L 12.121094 -312.421875 L 12.121094 -325.824219 L 25.519531 -325.824219 L 25.519531 -265.691406 L 12.121094 -265.691406 L 12.121094 -279.09375 L 50.226562 -279.09375 L 50.226562 -46.730469 L 11.652344 -46.730469 L 11.652344 -60.128906 L 25.054688 -60.128906 L 25.054688 0 L 11.652344 0 L 11.652344 -13.402344 L 137.972656 -13.402344 L 137.972656 0 L 124.570312 0 L 124.570312 -60.128906 L 137.972656 -60.128906 L 137.972656 -46.730469 L 98.003906 -46.730469 L 98.003906 -257.183594 L 125.964844 -257.183594 L 126.652344 -244.507812 C 127.238281 -233.660156 128.628906 -222.8125 130.832031 -211.953125 C 133.074219 -200.886719 134.753906 -193.542969 135.867188 -189.925781 L 135.914062 -189.765625 L 188.167969 -3.621094 L 175.261719 0 L 175.261719 -13.402344 L 272.683594 -13.402344 L 272.683594 0 L 259.746094 -3.492188 L 308.789062 -185.191406 L 308.914062 -185.5625 C 310.003906 -188.832031 311.277344 -193.808594 312.726562 -200.484375 C 314.269531 -207.574219 315.886719 -215.285156 317.585938 -223.617188 C 319.273438 -231.917969 320.734375 -239.4375 321.960938 -246.179688 L 323.960938 -257.183594 Z"/></g></g></g>
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(734.038701,350.272005)"><g><path d="M -1.75 0 L -1.75 -130.863281 L 111.753906 -130.863281 L 111.753906 -117.464844 C 111.753906 -110.621094 113.058594 -105.316406 115.664062 -101.550781 C 118.582031 -97.335938 122.230469 -94.109375 126.601562 -91.867188 C 131.832031 -89.191406 137.078125 -87.347656 142.34375 -86.347656 C 148.320312 -85.207031 153.511719 -84.503906 157.921875 -84.226562 L 157.085938 -70.851562 L 157.085938 -84.253906 C 161.882812 -84.253906 166.921875 -84.726562 172.195312 -85.671875 C 176.066406 -86.367188 179.300781 -87.734375 181.898438 -89.777344 C 182.835938 -90.515625 183.304688 -91.972656 183.304688 -94.15625 C 183.304688 -93.820312 183.382812 -93.550781 183.539062 -93.339844 C 183.117188 -93.902344 182.171875 -94.566406 180.699219 -95.335938 C 174.953125 -98.347656 167.21875 -101.28125 157.5 -104.140625 C 146.988281 -107.234375 135.386719 -110.558594 122.699219 -114.117188 C 109.445312 -117.835938 96.199219 -122.4375 82.964844 -127.925781 C 69.109375 -133.671875 56.417969 -141.03125 44.898438 -150.011719 C 32.890625 -159.371094 23.183594 -170.753906 15.773438 -184.164062 C 8.132812 -197.988281 4.3125 -214.601562 4.3125 -233.996094 C 4.3125 -253.757812 8.46875 -270.957031 16.78125 -285.59375 C 24.902344 -299.898438 35.441406 -311.664062 48.394531 -320.890625 C 60.878906 -329.785156 74.164062 -336.464844 88.242188 -340.925781 C 102.300781 -345.386719 115.769531 -347.613281 128.652344 -347.613281 C 149.933594 -347.613281 170.382812 -343.726562 189.992188 -335.949219 C 211.054688 -327.597656 227.019531 -313.28125 237.882812 -292.996094 L 226.070312 -286.667969 L 212.765625 -288.25 L 218.832031 -339.222656 L 324.308594 -339.222656 L 324.308594 -195.421875 L 213.136719 -195.421875 L 213.136719 -208.824219 C 213.136719 -221.933594 208.984375 -231.808594 200.6875 -238.445312 C 191.480469 -245.8125 180.210938 -249.492188 166.875 -249.492188 C 162.421875 -249.492188 157.574219 -247.988281 152.339844 -244.980469 C 150.71875 -244.050781 149.59375 -243.058594 148.964844 -242 C 148.398438 -241.042969 148.113281 -239.773438 148.113281 -238.191406 C 148.113281 -235.925781 149.597656 -233.722656 152.570312 -231.582031 C 158.253906 -227.484375 166.03125 -223.628906 175.910156 -220.011719 C 186.773438 -216.03125 198.644531 -211.972656 211.527344 -207.832031 C 224.976562 -203.507812 238.421875 -198.46875 251.859375 -192.707031 C 265.769531 -186.746094 278.625 -179.613281 290.421875 -171.304688 C 303.007812 -162.441406 313.125 -151.601562 320.78125 -138.785156 C 328.726562 -125.480469 332.699219 -109.828125 332.699219 -91.828125 C 332.699219 -71.378906 328.355469 -53.742188 319.675781 -38.910156 C 311.097656 -24.257812 299.730469 -12.542969 285.574219 -3.761719 C 272.101562 4.59375 257.457031 10.730469 241.640625 14.640625 C 226.132812 18.476562 210.84375 20.394531 195.773438 20.394531 C 169.832031 20.394531 147.769531 15.320312 129.582031 5.179688 C 112.019531 -4.617188 98.210938 -15.40625 88.15625 -27.195312 L 98.351562 -35.890625 L 111.621094 -33.996094 L 104.847656 13.402344 L -1.75 13.402344 Z M 25.054688 0 L 11.652344 0 L 11.652344 -13.402344 L 93.226562 -13.402344 L 93.226562 0 L 79.957031 -1.894531 L 89.285156 -67.175781 L 108.546875 -44.589844 C 116.519531 -35.246094 127.878906 -26.460938 142.636719 -18.230469 C 156.765625 -10.347656 174.480469 -6.410156 195.773438 -6.410156 C 208.667969 -6.410156 221.8125 -8.066406 235.207031 -11.378906 C 248.289062 -14.613281 260.367188 -19.667969 271.445312 -26.539062 C 281.839844 -32.984375 290.203125 -41.621094 296.542969 -52.449219 C 302.777344 -63.101562 305.894531 -76.226562 305.894531 -91.828125 C 305.894531 -104.898438 303.1875 -115.972656 297.769531 -125.042969 C 292.0625 -134.597656 284.46875 -142.714844 274.988281 -149.390625 C 264.722656 -156.621094 253.492188 -162.847656 241.300781 -168.074219 C 228.636719 -173.5 215.976562 -178.25 203.324219 -182.316406 C 190.101562 -186.566406 177.894531 -190.742188 166.691406 -194.84375 C 154.507812 -199.304688 144.574219 -204.304688 136.894531 -209.839844 C 126.503906 -217.332031 121.308594 -226.78125 121.308594 -238.191406 C 121.308594 -244.6875 122.851562 -250.523438 125.933594 -255.707031 C 128.953125 -260.785156 133.308594 -264.957031 138.988281 -268.222656 C 148.359375 -273.605469 157.652344 -276.296875 166.875 -276.296875 C 186.476562 -276.296875 203.328125 -270.65625 217.429688 -259.375 C 232.4375 -247.371094 239.9375 -230.519531 239.9375 -208.824219 L 226.539062 -208.824219 L 226.539062 -222.226562 L 310.90625 -222.226562 L 310.90625 -208.824219 L 297.503906 -208.824219 L 297.503906 -325.824219 L 310.90625 -325.824219 L 310.90625 -312.421875 L 230.734375 -312.421875 L 230.734375 -325.824219 L 244.039062 -324.238281 L 234.347656 -242.835938 L 214.257812 -280.339844 C 206.480469 -294.859375 195.097656 -305.089844 180.113281 -311.035156 C 163.675781 -317.550781 146.519531 -320.8125 128.652344 -320.8125 C 118.535156 -320.8125 107.765625 -319 96.34375 -315.378906 C 84.941406 -311.761719 74.140625 -306.324219 63.945312 -299.058594 C 54.210938 -292.125 46.257812 -283.226562 40.085938 -272.359375 C 34.105469 -261.824219 31.113281 -249.039062 31.113281 -233.996094 C 31.113281 -219.207031 33.820312 -206.917969 39.230469 -197.128906 C 44.871094 -186.921875 52.253906 -178.261719 61.375 -171.152344 C 70.988281 -163.660156 81.605469 -157.503906 93.230469 -152.683594 C 105.476562 -147.605469 117.714844 -143.351562 129.941406 -139.921875 C 142.734375 -136.335938 154.441406 -132.976562 165.0625 -129.855469 C 176.472656 -126.5 185.828125 -122.90625 193.136719 -119.082031 C 198.1875 -116.433594 202.136719 -113.214844 204.980469 -109.421875 C 208.398438 -104.867188 210.105469 -99.777344 210.105469 -94.15625 C 210.105469 -83.289062 206.222656 -74.804688 198.460938 -68.703125 C 192.359375 -63.910156 185.183594 -60.773438 176.933594 -59.292969 C 170.089844 -58.0625 163.472656 -57.449219 157.085938 -57.449219 L 156.667969 -57.449219 L 156.25 -57.476562 C 150.714844 -57.820312 144.410156 -58.667969 137.332031 -60.015625 C 129.542969 -61.5 121.894531 -64.164062 114.382812 -68.011719 C 106.019531 -72.296875 99.097656 -78.394531 93.625 -86.296875 C 87.84375 -94.652344 84.953125 -105.039062 84.953125 -117.464844 L 98.351562 -117.464844 L 98.351562 -104.0625 L 11.652344 -104.0625 L 11.652344 -117.464844 L 25.054688 -117.464844 Z"/></g></g></g>
    <g fill="#18375d" fillOpacity="1"><g transform="translate(7.815617,350.272005)"><g><path d="M 11.65625 -325.828125 L 158.953125 -325.828125 L 158.953125 -264.296875 L 134.25 -264.296875 L 134.25 -62 L 194.375 -62 L 194.375 -121.1875 L 272.6875 -121.1875 L 272.6875 0 L 11.65625 0 L 11.65625 -62 L 37.296875 -62 L 37.296875 -264.296875 L 11.65625 -264.296875 Z"/></g></g></g>
    <g fill="#18375d" fillOpacity="1"><g transform="translate(278.168221,350.272005)"><g><path d="M 337.015625 -243.78125 L 335.140625 -243.78125 C 333.898438 -236.945312 332.425781 -229.332031 330.71875 -220.9375 C 329.007812 -212.550781 327.375 -204.785156 325.8125 -197.640625 C 324.257812 -190.492188 322.863281 -185.054688 321.625 -181.328125 L 272.6875 0 L 175.265625 0 L 123.0625 -185.984375 C 121.8125 -190.023438 120.019531 -197.789062 117.6875 -209.28125 C 115.363281 -220.78125 113.890625 -232.28125 113.265625 -243.78125 L 111.40625 -243.78125 L 111.40625 -60.125 L 137.96875 -60.125 L 137.96875 0 L 11.65625 0 L 11.65625 -60.125 L 36.828125 -60.125 L 36.828125 -265.6875 L 12.125 -265.6875 L 12.125 -325.828125 L 188.78125 -325.828125 L 235.859375 -151.484375 L 280.609375 -325.828125 L 458.203125 -325.828125 L 458.203125 -265.6875 L 432.5625 -265.6875 L 432.5625 -60.59375 L 458.203125 -60.59375 L 458.203125 0 L 310.90625 0 L 310.90625 -60.59375 L 337.015625 -60.59375 Z"/></g></g></g>
    <g fill="#18375d" fillOpacity="1"><g transform="translate(734.038701,350.272005)"><g><path d="M 11.65625 0 L 11.65625 -117.46875 L 98.359375 -117.46875 C 98.359375 -107.832031 100.453125 -99.984375 104.640625 -93.921875 C 108.835938 -87.859375 114.117188 -83.195312 120.484375 -79.9375 C 126.859375 -76.675781 133.304688 -74.421875 139.828125 -73.171875 C 146.359375 -71.929688 152.109375 -71.15625 157.078125 -70.84375 C 162.671875 -70.84375 168.5 -71.382812 174.5625 -72.46875 C 180.625 -73.5625 185.828125 -75.816406 190.171875 -79.234375 C 194.523438 -82.660156 196.703125 -87.632812 196.703125 -94.15625 C 196.703125 -99.4375 193.4375 -103.785156 186.90625 -107.203125 C 180.382812 -110.628906 171.84375 -113.894531 161.28125 -117 C 150.71875 -120.101562 139.0625 -123.441406 126.3125 -127.015625 C 113.570312 -130.585938 100.832031 -135.015625 88.09375 -140.296875 C 75.351562 -145.585938 63.703125 -152.347656 53.140625 -160.578125 C 42.578125 -168.816406 34.03125 -178.835938 27.5 -190.640625 C 20.976562 -202.453125 17.71875 -216.90625 17.71875 -234 C 17.71875 -251.394531 21.289062 -266.382812 28.4375 -278.96875 C 35.582031 -291.5625 44.828125 -301.894531 56.171875 -309.96875 C 67.515625 -318.050781 79.554688 -324.113281 92.296875 -328.15625 C 105.035156 -332.195312 117.15625 -334.21875 128.65625 -334.21875 C 148.226562 -334.21875 167.023438 -330.640625 185.046875 -323.484375 C 203.078125 -316.335938 216.753906 -304.066406 226.078125 -286.671875 L 230.734375 -325.828125 L 310.90625 -325.828125 L 310.90625 -208.828125 L 226.53125 -208.828125 C 226.53125 -226.222656 220.703125 -239.582031 209.046875 -248.90625 C 197.398438 -258.226562 183.34375 -262.890625 166.875 -262.890625 C 160.039062 -262.890625 152.96875 -260.789062 145.65625 -256.59375 C 138.351562 -252.40625 134.703125 -246.269531 134.703125 -238.1875 C 134.703125 -231.351562 138.039062 -225.523438 144.71875 -220.703125 C 151.40625 -215.890625 160.265625 -211.460938 171.296875 -207.421875 C 182.328125 -203.378906 194.367188 -199.257812 207.421875 -195.0625 C 220.472656 -190.875 233.523438 -185.984375 246.578125 -180.390625 C 259.628906 -174.796875 271.671875 -168.113281 282.703125 -160.34375 C 293.734375 -152.570312 302.585938 -143.09375 309.265625 -131.90625 C 315.953125 -120.726562 319.296875 -107.367188 319.296875 -91.828125 C 319.296875 -73.804688 315.566406 -58.421875 308.109375 -45.671875 C 300.648438 -32.929688 290.78125 -22.753906 278.5 -15.140625 C 266.226562 -7.535156 252.867188 -1.945312 238.421875 1.625 C 223.972656 5.195312 209.753906 6.984375 195.765625 6.984375 C 172.148438 6.984375 152.265625 2.476562 136.109375 -6.53125 C 119.953125 -15.539062 107.367188 -25.328125 98.359375 -35.890625 L 93.21875 0 Z"/></g></g></g>
    </g></g></g><g clipPath="url(#cp3)"><g transform="matrix(1,0,0,1,10,362)"><g clipPath="url(#cp4)">
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(0.321424,129.358327)"><g><path d="M 9.6875 0 L 37.078125 0 C 39.402344 0 40.179688 -0.90625 40.179688 -3.359375 L 40.179688 -4.78125 C 40.179688 -7.234375 39.402344 -8.140625 37.078125 -8.269531 L 27.777344 -8.914062 L 27.777344 -71.3125 L 68.34375 -1.9375 C 69.246094 -0.644531 70.410156 0 71.832031 0 L 77.257812 0 C 79.324219 0 80.746094 -1.421875 80.746094 -3.746094 L 80.746094 -81.390625 L 86.6875 -82.167969 C 89.011719 -82.296875 89.660156 -83.199219 89.660156 -85.65625 L 89.660156 -87.074219 C 89.660156 -89.53125 89.011719 -90.433594 86.6875 -90.433594 L 59.429688 -90.433594 C 57.75 -90.433594 57.101562 -88.753906 57.101562 -87.074219 L 57.101562 -85.65625 C 57.101562 -83.199219 57.75 -82.296875 60.074219 -82.167969 L 69.375 -81.390625 L 69.375 -21.960938 L 30.230469 -88.882812 C 29.714844 -89.917969 28.808594 -90.433594 27.648438 -90.433594 L 9.6875 -90.433594 C 7.363281 -90.433594 6.71875 -89.53125 6.71875 -87.074219 L 6.71875 -85.136719 C 6.71875 -82.683594 7.363281 -81.777344 9.6875 -81.648438 L 16.535156 -81.390625 L 16.535156 -8.914062 L 9.6875 -8.269531 C 7.363281 -8.140625 6.71875 -7.234375 6.71875 -4.78125 L 6.71875 -3.359375 C 6.71875 -0.90625 7.363281 0 9.6875 0 Z"/></g></g></g>
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(145.52641,129.358327)"><g><path d="M 5.8125 0.128906 L 31.007812 0.128906 C 33.203125 0.128906 34.105469 -0.773438 34.105469 -3.230469 L 34.105469 -5.167969 C 34.105469 -7.621094 33.460938 -8.65625 31.136719 -8.65625 L 21.316406 -9.042969 L 26.355469 -25.96875 L 63.175781 -25.96875 L 68.085938 -9.042969 L 58.910156 -8.65625 C 56.585938 -8.65625 55.941406 -7.621094 55.941406 -5.167969 L 55.941406 -3.230469 C 55.941406 -0.773438 56.84375 0.128906 59.039062 0.128906 L 84.234375 0.128906 C 86.558594 0.128906 87.335938 -0.773438 87.335938 -3.230469 L 87.335938 -5.167969 C 87.335938 -7.621094 86.816406 -8.65625 84.363281 -8.65625 L 79.96875 -8.914062 L 56.328125 -83.457031 C 54.648438 -88.882812 52.710938 -90.824219 48.316406 -90.824219 L 41.601562 -90.824219 C 37.078125 -90.824219 35.140625 -89.011719 33.332031 -83.328125 L 9.820312 -8.914062 L 5.683594 -8.65625 C 3.230469 -8.527344 2.714844 -7.621094 2.714844 -5.167969 L 2.714844 -3.230469 C 2.714844 -0.773438 3.488281 0.128906 5.8125 0.128906 Z M 28.9375 -34.882812 L 44.183594 -83.714844 L 45.476562 -83.714844 L 60.460938 -34.882812 Z"/></g></g></g>
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(285.176399,129.358327)"><g><path d="M 45.476562 2.324219 C 58.652344 2.324219 77.128906 -1.808594 77.515625 -26.355469 C 77.644531 -29.066406 76.222656 -31.007812 73.511719 -31.007812 L 70.539062 -31.007812 C 68.601562 -31.007812 66.921875 -29.972656 66.664062 -27.648438 C 66.40625 -12.917969 57.878906 -8.269531 45.605469 -8.269531 C 29.328125 -8.269531 20.542969 -19.25 20.285156 -44.828125 C 20.542969 -70.410156 29.328125 -81.519531 45.605469 -81.519531 C 58.136719 -81.519531 63.304688 -75.191406 66.792969 -60.851562 C 67.179688 -57.621094 69.246094 -56.972656 71.183594 -56.972656 L 74.285156 -56.972656 C 77.128906 -56.972656 78.160156 -58.265625 78.160156 -61.238281 L 78.160156 -86.171875 C 78.160156 -89.144531 77.128906 -90.304688 74.542969 -90.304688 L 73.382812 -90.304688 C 71.054688 -90.304688 70.023438 -89.402344 69.894531 -87.335938 L 69.632812 -78.03125 C 64.726562 -90.953125 55.683594 -92.113281 45.476562 -92.113281 C 20.671875 -92.113281 9.300781 -76.609375 9.042969 -44.828125 C 9.300781 -13.175781 20.671875 2.324219 45.476562 2.324219 Z"/></g></g></g>
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(426.506019,129.358327)"><g><path d="M 9.6875 0 L 39.53125 0 C 41.988281 0 42.632812 -0.90625 42.632812 -3.359375 L 42.632812 -4.78125 C 42.632812 -7.234375 41.859375 -8.140625 39.53125 -8.269531 L 30.230469 -8.914062 L 30.230469 -81.390625 L 39.53125 -81.777344 C 41.859375 -81.777344 42.632812 -82.683594 42.632812 -85.136719 L 42.632812 -87.074219 C 42.632812 -89.53125 41.988281 -90.433594 39.53125 -90.433594 L 9.6875 -90.433594 C 7.363281 -90.433594 6.71875 -89.53125 6.71875 -87.074219 L 6.71875 -85.136719 C 6.71875 -82.683594 7.363281 -81.777344 9.6875 -81.777344 L 18.992188 -81.390625 L 18.992188 -8.914062 L 9.6875 -8.269531 C 7.363281 -8.140625 6.71875 -7.234375 6.71875 -4.78125 L 6.71875 -3.359375 C 6.71875 -0.90625 7.363281 0 9.6875 0 Z"/></g></g></g>
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(529.984116,129.358327)"><g><path d="M 48.1875 -92.113281 C 20.414062 -92.113281 9.042969 -76.351562 9.042969 -44.441406 C 9.042969 -13.175781 20.414062 2.324219 48.1875 2.324219 C 75.707031 2.324219 86.945312 -13.175781 86.945312 -44.441406 C 86.945312 -76.351562 75.707031 -92.113281 48.1875 -92.113281 Z M 20.285156 -44.183594 C 20.285156 -69.246094 29.972656 -81.777344 48.1875 -81.777344 C 66.277344 -81.777344 75.707031 -69.246094 75.707031 -44.183594 C 75.707031 -19.765625 66.277344 -7.75 48.1875 -7.75 C 29.972656 -7.75 20.285156 -19.765625 20.285156 -44.183594 Z"/></g></g></g>
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(680.098386,129.358327)"><g><path d="M 9.6875 0 L 37.078125 0 C 39.402344 0 40.179688 -0.90625 40.179688 -3.359375 L 40.179688 -4.78125 C 40.179688 -7.234375 39.402344 -8.140625 37.078125 -8.269531 L 27.777344 -8.914062 L 27.777344 -71.3125 L 68.34375 -1.9375 C 69.246094 -0.644531 70.410156 0 71.832031 0 L 77.257812 0 C 79.324219 0 80.746094 -1.421875 80.746094 -3.746094 L 80.746094 -81.390625 L 86.6875 -82.167969 C 89.011719 -82.296875 89.660156 -83.199219 89.660156 -85.65625 L 89.660156 -87.074219 C 89.660156 -89.53125 89.011719 -90.433594 86.6875 -90.433594 L 59.429688 -90.433594 C 57.75 -90.433594 57.101562 -88.753906 57.101562 -87.074219 L 57.101562 -85.65625 C 57.101562 -83.199219 57.75 -82.296875 60.074219 -82.167969 L 69.375 -81.390625 L 69.375 -21.960938 L 30.230469 -88.882812 C 29.714844 -89.917969 28.808594 -90.433594 27.648438 -90.433594 L 9.6875 -90.433594 C 7.363281 -90.433594 6.71875 -89.53125 6.71875 -87.074219 L 6.71875 -85.136719 C 6.71875 -82.683594 7.363281 -81.777344 9.6875 -81.648438 L 16.535156 -81.390625 L 16.535156 -8.914062 L 9.6875 -8.269531 C 7.363281 -8.140625 6.71875 -7.234375 6.71875 -4.78125 L 6.71875 -3.359375 C 6.71875 -0.90625 7.363281 0 9.6875 0 Z"/></g></g></g>
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(829.825072,129.358327)"><g><path d="M 10.464844 0 L 69.117188 0 C 71.183594 0 72.089844 -0.90625 72.089844 -3.230469 L 72.089844 -24.160156 C 72.089844 -26.355469 71.445312 -27.390625 69.246094 -27.390625 L 66.535156 -27.390625 C 65.113281 -27.390625 63.691406 -27 63.433594 -24.289062 L 61.367188 -10.335938 L 27.648438 -10.335938 L 27.648438 -40.179688 L 49.609375 -40.179688 L 49.996094 -33.589844 C 49.996094 -32.296875 50.644531 -31.136719 51.804688 -31.136719 L 54.390625 -31.136719 C 56.070312 -31.136719 56.714844 -32.296875 56.714844 -33.847656 L 56.714844 -55.683594 C 56.714844 -57.621094 56.070312 -58.394531 54.390625 -58.394531 L 51.804688 -58.394531 C 50.773438 -58.394531 50.125 -57.621094 50.125 -56.457031 L 49.738281 -50.257812 L 27.648438 -50.257812 L 27.648438 -80.097656 L 61.238281 -80.097656 L 63.433594 -66.015625 C 63.691406 -63.433594 64.984375 -62.917969 66.535156 -62.917969 L 69.117188 -62.917969 C 71.183594 -62.917969 71.960938 -63.820312 71.960938 -66.277344 L 71.960938 -87.074219 C 71.960938 -89.660156 71.183594 -90.433594 68.859375 -90.433594 L 10.464844 -90.433594 C 8.011719 -90.433594 7.363281 -89.53125 7.363281 -87.074219 L 7.363281 -84.234375 C 7.363281 -81.777344 8.140625 -80.875 10.464844 -80.875 L 16.40625 -80.097656 L 16.40625 -10.335938 L 10.464844 -9.558594 C 8.140625 -9.429688 7.363281 -8.527344 7.363281 -6.070312 L 7.363281 -3.359375 C 7.363281 -0.90625 8.011719 0 10.464844 0 Z"/></g></g></g>
    <g fill="#ffffff" fillOpacity="1"><g transform="translate(965.341322,129.358327)"><g><path d="M 39.144531 1.9375 C 61.109375 1.9375 72.734375 -5.425781 72.734375 -23.769531 C 72.734375 -37.335938 63.949219 -44.054688 45.863281 -51.03125 C 26.226562 -58.78125 21.058594 -63.046875 21.058594 -70.023438 C 21.058594 -78.417969 26.871094 -81.648438 39.015625 -81.648438 C 50.644531 -81.777344 57.101562 -76.609375 61.109375 -61.109375 C 62.011719 -58.007812 63.691406 -57.230469 65.757812 -57.230469 L 67.957031 -57.230469 C 70.925781 -57.230469 71.703125 -58.523438 71.703125 -61.496094 L 71.960938 -86.042969 C 71.960938 -89.011719 70.925781 -90.304688 68.214844 -90.304688 L 67.050781 -90.304688 C 64.855469 -90.304688 63.820312 -89.273438 63.691406 -87.203125 L 63.433594 -76.480469 C 61.109375 -85.65625 52.324219 -91.984375 38.5 -91.984375 C 19.378906 -91.984375 9.6875 -85.785156 9.820312 -70.152344 C 9.949219 -58.910156 16.277344 -50.125 32.6875 -44.183594 C 51.675781 -36.949219 61.367188 -31.265625 61.367188 -24.03125 C 61.367188 -12.917969 53.097656 -8.398438 38.757812 -8.269531 C 26.613281 -8.269531 19.25 -12.660156 20.152344 -30.617188 C 20.285156 -32.945312 18.214844 -33.847656 16.277344 -33.847656 L 13.308594 -33.847656 C 10.722656 -33.847656 9.558594 -32.039062 9.429688 -29.199219 C 8.527344 -0.773438 26.097656 1.9375 39.144531 1.9375 Z"/></g></g></g>
    </g></g></g></g>
  </svg>
);

// ─── PANTALLA DE ACCESO ────────────────────────────────────────────────────
function AccessScreen({ correctPassword, onUnlock }) {
  const [value, setValue]   = useState('');
  const [error, setError]   = useState(false);
  function attempt() {
    if (value === correctPassword) { onUnlock(); }
    else { setError(true); setValue(''); }
  }
  return (
    <div style={{ background: NAVY, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ marginBottom: 8 }}>{LOGO_SVG}</div>
      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 28 }}>Registro de Asistencia</div>
      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: '28px 24px', width: '100%', maxWidth: 320 }}>
        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, margin: '0 0 16px', textAlign: 'center' }}>Ingresa la contraseña del equipo</p>
        <input type="password" value={value} onChange={(e) => { setValue(e.target.value); setError(false); }}
          onKeyDown={(e) => { if (e.key==='Enter') attempt(); }} placeholder="Contraseña" autoFocus
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${error ? '#E57373' : 'rgba(255,255,255,0.25)'}`,
            background: 'rgba(255,255,255,0.12)', color: 'white', fontSize: 15, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
        {error && <p style={{ color: '#EF9A9A', fontSize: 12, margin: '0 0 10px', textAlign: 'center' }}>Contraseña incorrecta</p>}
        <button onClick={attempt} style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', background: 'white', color: NAVY, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Entrar</button>
      </div>
    </div>
  );
}

// ─── PANTALLA DE LOGIN ADMIN ───────────────────────────────────────────────
function LoginScreen({ onCancel }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  async function handleLogin() {
    setError(''); setLoading(true);
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch (e) { setError('Correo o contraseña incorrectos.'); }
    finally { setLoading(false); }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(27,58,107,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'white', borderRadius: 14, padding: '32px 28px', width: 320, boxShadow: '0 8px 32px rgba(27,58,107,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <Lock size={16} color={NAVY} />
          <span style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>Acceso administración</span>
        </div>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo electrónico"
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 14, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }} />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key==='Enter') handleLogin(); }} placeholder="Contraseña"
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${error ? AUSENTE : LINE}`, fontSize: 14, outline: 'none', marginBottom: 4, boxSizing: 'border-box' }} />
        {error && <div style={{ fontSize: 12, color: AUSENTE, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1px solid ${LINE}`, background: 'white', color: MUTED, fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={handleLogin} disabled={loading}
            style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: NAVY, color: 'white', fontSize: 13, fontWeight: 600, cursor: loading?'default':'pointer', opacity: loading?0.7:1 }}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────
export default function AttendanceTracker() {
  const [members, setMembers]               = useState([]);
  const [records, setRecords]               = useState({});
  const [cancelledDays, setCancelledDays]   = useState({});
  const [accessPassword, setAccessPassword] = useState(DEFAULT_ACCESS_PASSWORD);
  const [monthDate, setMonthDate]           = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [newName, setNewName]               = useState('');
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [confirmClear, setConfirmClear]     = useState(false);
  const [lastSaved, setLastSaved]           = useState(null);
  const [remoteUpdate, setRemoteUpdate]     = useState(false);
  const [activeTab, setActiveTab]           = useState('registro');
  const [isAdmin, setIsAdmin]               = useState(false);
  const [showLogin, setShowLogin]           = useState(false);
  const [unlocked, setUnlocked]             = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword]       = useState('');
  const [newPasswordError, setNewPasswordError] = useState('');
  const skipNextSnapshot = useRef(false);
  const docRef = doc(db,'attendance','data');

  // Auth: detectar sesión activa
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsAdmin(!!user);
      if (user) setShowLogin(false);
    });
    return unsub;
  }, []);

  // Firestore: escucha en tiempo real
  useEffect(() => {
    const unsub = onSnapshot(docRef, (snap) => {
      if (skipNextSnapshot.current) { skipNextSnapshot.current = false; return; }
      if (snap.exists()) {
        const data = snap.data();
        setMembers(data.members || DEFAULT_MEMBERS);
        setRecords(data.records || {});
        setCancelledDays(data.cancelledDays || {});
        setAccessPassword(data.accessPassword || DEFAULT_ACCESS_PASSWORD);
        const ts = data.updatedAt || null;
        setLastSaved(prev => {
          if (prev && ts && ts !== prev) { setRemoteUpdate(true); setTimeout(() => setRemoteUpdate(false), 2500); }
          return ts;
        });
      } else {
        const now = Date.now();
        setDoc(docRef, { members: DEFAULT_MEMBERS, records: {}, cancelledDays: {}, accessPassword: DEFAULT_ACCESS_PASSWORD, updatedAt: now });
        setMembers(DEFAULT_MEMBERS);
        setLastSaved(now);
      }
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  async function persist(nextMembers, nextRecords, nextCancelled, nextPassword) {
    const now = Date.now();
    skipNextSnapshot.current = true;
    try {
      await setDoc(docRef, {
        members: nextMembers, records: nextRecords, cancelledDays: nextCancelled,
        accessPassword: nextPassword ?? accessPassword, updatedAt: now
      });
      setLastSaved(now); setError(null);
    } catch (e) { setError('No se pudo guardar el cambio.'); }
  }

  function changeAccessPassword() {
    if (!newPassword.trim()) { setNewPasswordError('Escribe una contraseña.'); return; }
    if (newPassword.trim().length < 4) { setNewPasswordError('Mínimo 4 caracteres.'); return; }
    const next = newPassword.trim();
    setAccessPassword(next); setShowChangePassword(false); setNewPassword(''); setNewPasswordError('');
    persist(members, records, cancelledDays, next);
  }
  function addMember() {
    if (!isAdmin) return;
    const name = newName.trim(); if (!name) return;
    const next = [...members, { id: Date.now().toString(), name }];
    setMembers(next); setNewName(''); persist(next, records, cancelledDays);
  }
  function removeMember(id) {
    if (!isAdmin) return;
    const next = members.filter(m => m.id !== id);
    setMembers(next); persist(next, records, cancelledDays);
  }
  function cycle(memberId, key) {
    if (cancelledDays[key]) return;
    if (isDayLocked(key) && !isAdmin) return;
    const fullKey = `${memberId}|${key}`;
    const current = records[fullKey];
    const nextStatus = current===undefined ? 'presente' : current==='presente' ? 'ausente' : undefined;
    const nextRecords = { ...records };
    if (nextStatus===undefined) delete nextRecords[fullKey]; else nextRecords[fullKey] = nextStatus;
    setRecords(nextRecords); persist(members, nextRecords, cancelledDays);
  }
  function markEmptyAsAbsent(key) {
    if (cancelledDays[key]) return;
    if (isDayLocked(key) && !isAdmin) return;
    const nextRecords = { ...records };
    members.forEach(m => { const fk = `${m.id}|${key}`; if (!nextRecords[fk]) nextRecords[fk] = 'ausente'; });
    setRecords(nextRecords); persist(members, nextRecords, cancelledDays);
  }
  function toggleCancelDay(key) {
    if (isDayLocked(key) && !isAdmin) return;
    const nextCancelled = { ...cancelledDays };
    if (nextCancelled[key]) delete nextCancelled[key]; else nextCancelled[key] = true;
    setCancelledDays(nextCancelled); persist(members, records, nextCancelled);
  }
  function clearMonth() {
    if (!isAdmin) return;
    const daysInMonth = getDaysInMonth(monthDate).filter(d => d.getDay()===0 || d.getDay()===3);
    const nextRecords = { ...records };
    members.forEach(m => daysInMonth.forEach(d => delete nextRecords[`${m.id}|${dateKey(d)}`]));
    setRecords(nextRecords); persist(members, nextRecords, cancelledDays); setConfirmClear(false);
  }
  function changeMonth(delta) { const d = new Date(monthDate); d.setMonth(d.getMonth()+delta); setMonthDate(d); }
  function getStats(memberId, daysArr) {
    let presente = 0, ausente = 0;
    daysArr.forEach(d => { const v = records[`${memberId}|${dateKey(d)}`]; if (v==='presente') presente++; else if (v==='ausente') ausente++; });
    const marked = presente+ausente;
    return { presente, ausente, pct: marked ? Math.round((presente/marked)*100) : null };
  }
  function downloadExcelReport() {
    const rows = members
      .map(m => ({ member: m, wed: getStats(m.id,wedDays), sun: getStats(m.id,sunDays), general: getStats(m.id,activeDays) }))
      .sort((a,b) => (b.general.pct??-1)-(a.general.pct??-1))
      .map(({ member, wed, sun, general }) => ({
        'Nombre': member.name,
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

  const days       = getDaysInMonth(monthDate).filter(d => d.getDay()===0 || d.getDay()===3);
  const activeDays = days.filter(d => !cancelledDays[dateKey(d)]);
  const wedDays    = activeDays.filter(d => d.getDay()===3);
  const sunDays    = activeDays.filter(d => d.getDay()===0);

  if (loading) return (
    <div style={{ background: NAVY, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      Cargando…
    </div>
  );

  if (!unlocked) return <AccessScreen correctPassword={accessPassword} onUnlock={() => setUnlocked(true)} />;

  return (
    <div style={{ background: PAPER, minHeight: '100vh', color: INK, fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      {showLogin && <LoginScreen onCancel={() => setShowLogin(false)} />}
      <style>{`
        @keyframes stampPop { 0%{transform:scale(0.4) rotate(0deg);opacity:0} 60%{transform:scale(1.15) rotate(var(--rot,0deg));opacity:1} 100%{transform:scale(1) rotate(var(--rot,0deg))} }
        @keyframes fadeFlash { 0%{opacity:0} 20%{opacity:1} 100%{opacity:1} }
        .stamp-pop { animation: stampPop 0.22s ease-out; }
        .remote-flash { animation: fadeFlash 0.3s ease-out; }
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
                <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Registro de Asistencia</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: 22, fontWeight: 700, margin: 0 }}>{monthLabel(monthDate)}</h2>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => changeMonth(-1)} style={{ width:32,height:32,borderRadius:8,border:`1px solid ${LINE}`,background:'white',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}><ChevronLeft size={16}/></button>
              <button onClick={() => changeMonth(1)}  style={{ width:32,height:32,borderRadius:8,border:`1px solid ${LINE}`,background:'white',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }}><ChevronRight size={16}/></button>
            </div>
          </div>
        </header>

        {members.length === 0 ? (
          <div style={{ textAlign:'center',color:MUTED,padding:'40px 0',border:`1px dashed ${LINE}`,borderRadius:12 }}>
            <p style={{ marginBottom:12 }}>Aún no hay personas en el equipo.{!isAdmin && ' Inicia sesión como administradora para agregar.'}</p>
            {isAdmin && (
              <div style={{ display:'flex',gap:8,maxWidth:320,margin:'0 auto' }}>
                <input value={newName} onChange={(e)=>setNewName(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter')addMember();}} placeholder="Agregar persona al equipo"
                  style={{ flex:1,padding:'9px 12px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:14,outline:'none',background:'white' }} />
                <button onClick={addMember} style={{ display:'flex',alignItems:'center',gap:4,padding:'9px 14px',borderRadius:8,border:'none',background:INK,color:PAPER,fontSize:14,cursor:'pointer' }}>
                  <Plus size={15}/> Agregar
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* PESTAÑAS */}
            <div style={{ display:'flex',gap:4,marginBottom:16,borderBottom:`1px solid ${LINE}` }}>
              {['registro','estadisticas'].map(tab => (
                <button key={tab} onClick={()=>setActiveTab(tab)}
                  style={{ padding:'8px 16px',fontSize:13,fontWeight:600,border:'none',background:'none',cursor:'pointer',
                    color:activeTab===tab?INK:MUTED, borderBottom:activeTab===tab?`2px solid ${INK}`:'2px solid transparent',marginBottom:-1 }}>
                  {tab==='registro'?'Registro':'Estadísticas'}
                </button>
              ))}
            </div>

            {/* TABLA REGISTRO */}
            {activeTab==='registro' && (
              <>
                <div style={{ overflowX:'auto',border:`1px solid ${LINE}`,borderRadius:12,background:'white' }}>
                  <table style={{ borderCollapse:'collapse',width:'100%' }}>
                    <thead>
                      <tr>
                        <th style={{ position:'sticky',left:0,zIndex:2,background:'white',textAlign:'left',padding:'10px 12px',fontSize:12,color:MUTED,fontWeight:600,borderBottom:`1px solid ${LINE}`,borderRight:`1px solid ${LINE}`,minWidth:140 }}>Nombre</th>
                        {days.map(d => {
                          const key=dateKey(d), isCancelled=!!cancelledDays[key], locked=isDayLocked(key);
                          return (
                            <th key={key} style={{ padding:'6px 4px',fontSize:11,fontWeight:500,textAlign:'center',minWidth:42,
                              color:isCancelled?'#C2938A':MUTED, background:isCancelled?'#F6E9E6':'white', borderBottom:`1px solid ${LINE}` }}>
                              <div>{WEEKDAY_LABELS[d.getDay()]}</div>
                              <div style={{ fontFamily:'monospace',fontSize:12,color:isCancelled?AUSENTE:INK,textDecoration:isCancelled?'line-through':'none' }}>{d.getDate()}</div>
                              {locked && !isAdmin ? (
                                <div title="Plazo vencido" style={{ marginTop:3,display:'flex',justifyContent:'center',color:'#C2BBAF' }}><Lock size={10} strokeWidth={2.5}/></div>
                              ) : (
                                <button onClick={()=>toggleCancelDay(key)} title={isCancelled?'Reactivar':'Marcar como no realizado'}
                                  style={{ marginTop:3,border:'none',background:'none',cursor:'pointer',padding:1,color:isCancelled?AUSENTE:locked?STEEL:'#C2BBAF' }}>
                                  <X size={10} strokeWidth={2.5}/>
                                </button>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map(m => (
                        <tr key={m.id}>
                          <td style={{ position:'sticky',left:0,zIndex:1,background:'white',padding:'8px 12px',fontSize:14,borderBottom:`1px solid ${LINE}`,borderRight:`1px solid ${LINE}`,whiteSpace:'nowrap' }}>
                            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:8 }}>
                              {isAdmin ? (
                                <input value={m.name}
                                  onChange={(e) => { const next=members.map(mem=>mem.id===m.id?{...mem,name:e.target.value}:mem); setMembers(next); }}
                                  onBlur={(e) => { const next=members.map(mem=>mem.id===m.id?{...mem,name:e.target.value.trim()||mem.name}:mem); setMembers(next); persist(next,records,cancelledDays); }}
                                  onKeyDown={(e)=>{if(e.key==='Enter')e.target.blur();}}
                                  style={{ border:'none',borderBottom:`1px solid ${LINE}`,background:'transparent',fontSize:14,color:INK,outline:'none',width:'100%',padding:'1px 0',fontFamily:"'Helvetica Neue',Arial,sans-serif" }}
                                />
                              ) : (
                                <span>{m.name}</span>
                              )}
                              {isAdmin && (
                                <button onClick={()=>removeMember(m.id)} aria-label={`Quitar a ${m.name}`}
                                  style={{ border:'none',background:'transparent',color:'#C2BBAF',cursor:'pointer',padding:2 }}>
                                  <X size={13}/>
                                </button>
                              )}
                            </div>
                          </td>
                          {days.map(d => {
                            const key=dateKey(d), isCancelled=!!cancelledDays[key], locked=isDayLocked(key), status=records[`${m.id}|${key}`];
                            return (
                              <td key={key} style={{ textAlign:'center',padding:'6px 4px',background:isCancelled?'#FBF2F0':'white',borderBottom:`1px solid ${LINE}` }}>
                                {isCancelled ? (
                                  <div style={{ width:30,height:30,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto' }}>
                                    <div style={{ width:16,height:1.5,background:'#D9B6AF' }}/>
                                  </div>
                                ) : (
                                  <div style={{ opacity:locked&&!isAdmin?0.45:1 }} title={locked&&!isAdmin?'Plazo vencido':undefined}>
                                    <Stamp status={status} onClick={()=>cycle(m.id,key)} disabled={locked&&!isAdmin}/>
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
                        {days.map(d => {
                          const key=dateKey(d), isCancelled=!!cancelledDays[key], locked=isDayLocked(key), disabled=isCancelled||(locked&&!isAdmin);
                          return (
                            <td key={key} style={{ textAlign:'center',padding:'4px 2px',borderTop:`1px solid ${LINE}` }}>
                              <button onClick={()=>markEmptyAsAbsent(key)} disabled={disabled}
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
                  Toca un día para marcar: vacío → presente → ausente. Usa la ✕ sobre la fecha para marcar el entrenamiento como no realizado, o la ✕ debajo para marcar ausentes a quienes quedaron sin marca. Cada registro se bloquea 24h después de las 23:30 del día del entrenamiento.
                </p>

                {/* BARRA GUARDADO / ADMIN */}
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:6 }}>
                  {lastSaved && (
                    <div className={remoteUpdate?'remote-flash':''} style={{ display:'flex',alignItems:'center',gap:5,fontSize:11,color:remoteUpdate?PRESENTE:MUTED }}>
                      <RefreshCw size={11}/> {remoteUpdate?'Actualizado por otra persona':`Guardado ${timeAgo(lastSaved)}`}
                    </div>
                  )}
                  <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                    {isAdmin ? (
                      <>
                        <div style={{ display:'flex',alignItems:'center',gap:5,fontSize:11,color:PRESENTE }}>
                          <Lock size={11}/> Sesión administradora activa
                        </div>
                        <button onClick={downloadExcelReport}
                          style={{ display:'flex',alignItems:'center',gap:4,border:`1px solid ${LINE}`,background:'white',color:INK,cursor:'pointer',fontSize:11,padding:'4px 8px',borderRadius:6 }}>
                          <Download size={11}/> Descargar reporte Excel
                        </button>
                        <button onClick={()=>signOut(auth)}
                          style={{ display:'flex',alignItems:'center',gap:4,border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:11,textDecoration:'underline',padding:0 }}>
                          <LogOut size={11}/> Cerrar sesión
                        </button>
                      </>
                    ) : (
                      <button onClick={()=>setShowLogin(true)}
                        style={{ display:'flex',alignItems:'center',gap:4,border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:11,textDecoration:'underline',padding:0 }}>
                        <LogIn size={11}/> Acceso administración
                      </button>
                    )}
                  </div>
                </div>

                {/* FUNCIONES ADMIN */}
                {isAdmin && (
                  <>
                    <div style={{ display:'flex',gap:8,marginBottom:12 }}>
                      <input value={newName} onChange={(e)=>setNewName(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter')addMember();}} placeholder="Agregar persona al equipo"
                        style={{ flex:1,padding:'9px 12px',borderRadius:8,border:`1px solid ${LINE}`,fontSize:14,outline:'none',background:'white' }} />
                      <button onClick={addMember} style={{ display:'flex',alignItems:'center',gap:4,padding:'9px 14px',borderRadius:8,border:'none',background:INK,color:PAPER,fontSize:14,cursor:'pointer' }}>
                        <Plus size={15}/> Agregar
                      </button>
                    </div>

                    <div style={{ marginBottom:12 }}>
                      {!showChangePassword ? (
                        <button onClick={()=>setShowChangePassword(true)} style={{ fontSize:12,color:MUTED,background:'none',border:'none',cursor:'pointer',textDecoration:'underline',padding:0 }}>
                          Cambiar contraseña de acceso
                        </button>
                      ) : (
                        <div style={{ display:'flex',alignItems:'center',gap:8,flexWrap:'wrap' }}>
                          <input type="text" value={newPassword} onChange={(e)=>{setNewPassword(e.target.value);setNewPasswordError('');}}
                            onKeyDown={(e)=>{if(e.key==='Enter')changeAccessPassword();}} placeholder="Nueva contraseña"
                            style={{ padding:'7px 10px',borderRadius:8,border:`1px solid ${newPasswordError?AUSENTE:LINE}`,fontSize:13,outline:'none',background:'white',width:200 }} />
                          <button onClick={changeAccessPassword} style={{ padding:'7px 12px',borderRadius:8,border:'none',background:INK,color:'white',fontSize:12,cursor:'pointer' }}>Guardar</button>
                          <button onClick={()=>{setShowChangePassword(false);setNewPassword('');setNewPasswordError('');}} style={{ border:'none',background:'none',color:MUTED,cursor:'pointer',fontSize:12 }}>Cancelar</button>
                          {newPasswordError && <span style={{ fontSize:11,color:AUSENTE }}>{newPasswordError}</span>}
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign:'right',marginBottom:8 }}>
                      {!confirmClear ? (
                        <button onClick={()=>setConfirmClear(true)} style={{ fontSize:12,color:MUTED,background:'none',border:'none',cursor:'pointer',textDecoration:'underline' }}>Borrar registros de este mes</button>
                      ) : (
                        <span style={{ fontSize:12,color:MUTED }}>
                          ¿Seguro?{' '}
                          <button onClick={clearMonth} style={{ color:AUSENTE,border:'none',background:'none',cursor:'pointer',textDecoration:'underline' }}>Sí, borrar</button>
                          {' · '}
                          <button onClick={()=>setConfirmClear(false)} style={{ color:MUTED,border:'none',background:'none',cursor:'pointer',textDecoration:'underline' }}>Cancelar</button>
                        </span>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {/* TABLA ESTADÍSTICAS */}
            {activeTab==='estadisticas' && (
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
                    {members
                      .map(m => ({ member:m, wed:getStats(m.id,wedDays), sun:getStats(m.id,sunDays), general:getStats(m.id,activeDays) }))
                      .sort((a,b) => (b.general.pct??-1)-(a.general.pct??-1))
                      .map(({ member, wed, sun, general }) => (
                        <tr key={member.id}>
                          <td style={{ position:'sticky',left:0,zIndex:1,background:'white',padding:'8px 12px',fontSize:14,borderBottom:`1px solid ${LINE}`,borderRight:`1px solid ${LINE}`,whiteSpace:'nowrap' }}>{member.name}</td>
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
          </>
        )}
        {error && <div style={{ marginTop:16,fontSize:12,color:AUSENTE,textAlign:'center' }}>{error}</div>}
      </div>
    </div>
  );
}
