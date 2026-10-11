// Copia local (en este navegador) de lo último que se cargó, para seguir viendo los datos sin
// señal. Nunca decide permisos: la base vuelve a validar todo cuando hay conexión.
import { PREFIJO_APP as PREFIJO } from './app.js';

export function leerLocal(clave, porDefecto = null) {
  try {
    const raw = localStorage.getItem(PREFIJO + clave);
    return raw ? JSON.parse(raw) : porDefecto;
  } catch {
    return porDefecto;
  }
}

export function guardarLocal(clave, valor) {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
  } catch {
    // sin espacio o almacenamiento bloqueado: solo se pierde la copia
  }
}

export function borrarLocal(clave) {
  try {
    localStorage.removeItem(PREFIJO + clave);
  } catch {
    // nada que hacer
  }
}

// Al cerrar sesión se borran las copias de datos (no deben quedar en un equipo compartido).
export function borrarTodoLocal() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIJO))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // nada que hacer
  }
}

// ¿El error es por falta de conexión (y no un rechazo de la base)?
export function esErrorDeRed(error) {
  if (!error) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return /fetch|network|Failed to fetch|NetworkError|Load failed/i.test(error.message || String(error));
}
