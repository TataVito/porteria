import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { guardarLocal, leerLocal } from './local.js';

// Ejecuta una consulta y la repite sola cuando alguien cambia alguna de las `tablas` del
// condominio (Realtime). Guarda la última respuesta en el equipo para abrir sin señal.
export function useConsulta(clave, consulta, deps, { tablas = [], condominioId, filtro } = {}) {
  const claveLocal = clave && condominioId ? `${clave}_${condominioId}` : null;
  const [datos, setDatos] = useState(() => (claveLocal ? leerLocal(claveLocal, null) : null));
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const consultaRef = useRef(consulta);
  consultaRef.current = consulta;
  const turno = useRef(0);

  const recargar = useCallback(async () => {
    const mio = ++turno.current;
    const { data, error: err } = await consultaRef.current();
    if (mio !== turno.current) return;
    if (err) setError(err);
    else {
      setError(null);
      setDatos(data);
      if (claveLocal) guardarLocal(claveLocal, data);
    }
    setCargando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveLocal, ...deps]);

  useEffect(() => {
    setCargando(true);
    recargar();
  }, [recargar]);

  // Cambios en vivo: se agrupan (varios cambios seguidos = una sola recarga).
  const tablasClave = tablas.join(',');
  useEffect(() => {
    if (!tablasClave || !condominioId) return undefined;
    let t = null;
    const programar = () => {
      clearTimeout(t);
      t = setTimeout(recargar, 300);
    };
    const canal = supabase.channel(`${clave}-${condominioId}-${Math.random().toString(36).slice(2)}`);
    tablasClave.split(',').forEach((tabla) => {
      canal.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tabla, filter: filtro || `condominio_id=eq.${condominioId}` },
        programar,
      );
    });
    canal.subscribe();
    // Al volver a la pestaña o recuperar la señal se recarga (Realtime pudo perder eventos).
    const alVolver = () => document.visibilityState === 'visible' && programar();
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('online', programar);
    return () => {
      clearTimeout(t);
      supabase.removeChannel(canal);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('online', programar);
    };
  }, [tablasClave, condominioId, filtro, clave, recargar]);

  return { datos, setDatos, cargando, error, recargar };
}

// Hora actual que se actualiza cada `ms` (para contadores de tiempo).
export function useAhora(ms = 30000) {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return ahora;
}
