import { useCallback, useEffect, useState } from 'react';
import { correoDeUsuario, supabase } from './supabase.js';
import { borrarTodoLocal, guardarLocal, leerLocal } from './local.js';
import { PREFIJO_APP } from './app.js';

// Sesión de Supabase Auth + perfil (rol, unidad) del usuario conectado.
export function useSesion() {
  const [sesion, setSesion] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      if (!data.session) setCargando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSesion(nueva);
      if (!nueva) {
        setPerfil(null);
        setCargando(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = sesion?.user?.id;
  useEffect(() => {
    if (!userId) return;
    let vigente = true;
    setCargando(true);
    supabase
      .from('perfiles')
      .select('id, usuario, nombre, rol, unidad_id, compartida, nombre_turno')
      .eq('id', userId)
      .single()
      .then(({ data, error }) => {
        if (!vigente) return;
        // Sin señal: último perfil conocido de este usuario (la base igual valida todo).
        const perfilLocal = leerLocal('perfil');
        if (error && perfilLocal?.id === userId) setPerfil(perfilLocal);
        else {
          setPerfil(data);
          if (data) guardarLocal('perfil', data);
        }
        setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [userId]);

  const login = useCallback(async (usuario, clave) => {
    const { error } = await supabase.auth.signInWithPassword({ email: correoDeUsuario(usuario), password: clave });
    if (!error) return null;
    if (/rate|too many/i.test(error.message)) return 'Demasiados intentos. Espera unos minutos.';
    if (/fetch|network/i.test(error.message)) return 'Sin conexión. Revisa la señal.';
    return 'Usuario o clave incorrectos.';
  }, []);

  // Cuenta compartida: quien está de turno escribe su nombre (queda en cada registro).
  const fijarTurno = useCallback(async (nombre) => {
    const { error } = await supabase.rpc('fijar_nombre_turno', { p_nombre: nombre });
    if (error) return error.message;
    setPerfil((p) => {
      const nuevo = { ...p, nombre_turno: nombre.trim().replace(/\s+/g, ' ') };
      guardarLocal('perfil', nuevo);
      return nuevo;
    });
    return null;
  }, []);

  // Al salir se borran las copias locales: no deben quedar en un equipo compartido.
  const logout = useCallback(async (motivo) => {
    // El próximo que entre a una cuenta compartida debe escribir su propio nombre.
    if (perfil?.compartida) await supabase.rpc('fijar_nombre_turno', { p_nombre: '' });
    borrarTodoLocal();
    if (typeof motivo === 'string' && motivo) {
      try {
        sessionStorage.setItem(`${PREFIJO_APP}motivo_salida`, motivo);
      } catch {
        // sin almacenamiento: solo no se muestra el motivo
      }
    }
    await supabase.auth.signOut({ scope: 'local' });
  }, [perfil?.compartida]);

  const rol = perfil?.rol || '';
  return {
    cargando,
    conectado: Boolean(sesion && perfil),
    perfil,
    rol,
    esSuper: rol === 'superusuario',
    esAdmin: rol === 'admin' || rol === 'superusuario',
    esPersonal: ['conserje', 'admin', 'superusuario'].includes(rol),
    esResidente: rol === 'residente',
    login,
    logout,
    fijarTurno,
  };
}
