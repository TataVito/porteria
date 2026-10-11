import { createClient } from '@supabase/supabase-js';
import { APP } from './app.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(url && anonKey);

// La anon key es pública por diseño: la seguridad la imponen las políticas RLS de la base.
export const supabase = configurado ? createClient(url, anonKey, { auth: { storageKey: `sb-las-palmas-${APP}` } }) : null;

// Los usuarios entran con "usuario + clave"; internamente Supabase Auth necesita un correo.
// Debe coincidir con DOMINIO en supabase/functions/admin-usuarios/index.ts.
export const DOMINIO_USUARIOS = 'porteria-rvc.invalid';

// Cada casa tiene una cuenta: usuario "casa33" (o "casab-12" si hay pasajes/sectores).
export function usuarioDeCasa(u) {
  return `casa${u.torre ? `${u.torre}-` : ''}${u.numero}`.toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

export function correoDeUsuario(usuario) {
  return `${usuario.trim().toLowerCase()}@${DOMINIO_USUARIOS}`;
}

// Llama la Edge Function de gestión de usuarios. Devuelve null si salió bien o el mensaje de error.
export async function gestionarUsuario(cuerpo) {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', { body: cuerpo });
  if (!error) return data?.error || null;
  try {
    const detalle = await error.context?.json?.();
    if (detalle?.error) return detalle.error;
  } catch {
    // sin detalle
  }
  return error.message || 'No se pudo completar la operación';
}

// Mensaje entendible a partir de un error de la base.
export function mensajeError(error) {
  if (!error) return '';
  const m = error.message || String(error);
  if (/fetch|network|Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sin conexión. Revisa la señal e intenta de nuevo.';
  if (/accesos_estacionamiento_ocupado/.test(m)) return 'Ese estacionamiento ya está ocupado.';
  if (/duplicate key|unique/i.test(m)) {
    if (/patente/.test(m)) return 'Esa patente ya está registrada en el condominio.';
    if (/codigo/.test(m)) return 'Ese código ya existe.';
    return 'Ya existe un registro igual.';
  }
  if (/row-level security|permission denied/i.test(m)) return 'No tienes permiso para hacer esto.';
  if (/patente_check/.test(m)) return 'Patente inválida (4 a 8 letras y números).';
  return m;
}
