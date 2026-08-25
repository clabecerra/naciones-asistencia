import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

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

export const app  = initializeApp(firebaseConfig);
export const db   = initializeFirestore(app, { experimentalAutoDetectLongPolling: true, useFetchStreams: false });
export const auth = getAuth(app);
