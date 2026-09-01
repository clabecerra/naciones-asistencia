import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// Estado de conexión compartido por toda la app: red (navigator.onLine) más
// si alguno de los listeners de Firestore activos está sirviendo desde el
// caché local en vez del servidor. Cada onSnapshot se registra con un id
// propio y reporta su metadata.fromCache en cada disparo -- así el banner
// global refleja la pantalla que sea, no solo la que montó el listener.
const ConnectionStatusContext = createContext(null);

export function ConnectionStatusProvider({ children }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [fromCache, setFromCache] = useState(false);
  const cacheFlags = useRef(new Map());

  useEffect(() => {
    const onOnline  = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const reportSnapshot = useCallback((id, metadata) => {
    cacheFlags.current.set(id, !!metadata.fromCache);
    setFromCache([...cacheFlags.current.values()].some(Boolean));
  }, []);

  const clearListener = useCallback((id) => {
    cacheFlags.current.delete(id);
    setFromCache([...cacheFlags.current.values()].some(Boolean));
  }, []);

  return (
    <ConnectionStatusContext.Provider value={{ online, fromCache, reportSnapshot, clearListener }}>
      {children}
    </ConnectionStatusContext.Provider>
  );
}

export function useConnectionStatus() {
  const ctx = useContext(ConnectionStatusContext);
  if (!ctx) throw new Error('useConnectionStatus debe usarse dentro de ConnectionStatusProvider');
  return ctx;
}
