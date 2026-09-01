import { useEffect, useRef, useState } from 'react';
import { useConnectionStatus } from '../context/ConnectionStatus';

// Al cargar, cada listener entrega primero el caché (fromCache: true) y
// después el servidor confirma -- con buena señal eso tarda bien menos de
// esto, así que un retardo acá evita que el banner parpadee en cada carga.
// Solo se retrasa el "aparecer": el "desaparecer" es inmediato.
const RETRASO_MS = 800;

// Un solo banner en el header de App.jsx, visible en las 6 pestañas -- lo
// que importa es que nadie marque asistencia o capture un partido sobre
// datos viejos creyendo que están al día.
export function ConnectionBanner() {
  const { online, fromCache } = useConnectionStatus();
  const desconectado = !online || fromCache;
  const [mostrar, setMostrar] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (desconectado) {
      timerRef.current = setTimeout(() => setMostrar(true), RETRASO_MS);
    } else {
      clearTimeout(timerRef.current);
      setMostrar(false);
    }
    return () => clearTimeout(timerRef.current);
  }, [desconectado]);

  if (!mostrar) return null;
  return (
    <div style={{ background:'#FBF2E3', border:'1px solid #E8CFA0', color:'#8A5A1E', borderRadius:10, padding:'8px 12px', fontSize:12, marginBottom:14 }}>
      {online
        ? 'Reconectando — algunos datos en pantalla son de la última sincronización.'
        : 'Sin conexión — mostrando datos de la última sincronización. Los cambios que hagas se guardan y se sincronizan solos al volver la señal.'}
    </div>
  );
}
