import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { NAVY } from '../theme';
import { normEmail, formatRut, isValidRut } from '../utils/rut';
import { LOGO_SVG } from './Logo';

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

export function LoginScreen() {
  const [modo, setModo] = useState(null); // null | 'jugadora' | 'admin'
  if (modo === 'jugadora') return <JugadoraLoginScreen onVolver={() => setModo(null)} />;
  if (modo === 'admin')    return <AdminLoginScreen onVolver={() => setModo(null)} />;
  return <ChoiceScreen onElegir={setModo} />;
}
