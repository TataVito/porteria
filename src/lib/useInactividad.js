import { useEffect } from 'react';
import { PREFIJO_APP } from './app.js';

// Cierra la sesión tras un rato sin uso (tablet de conserjería compartida, celular perdido).
// La última actividad se guarda para que cuente también si se cierra y reabre el navegador.
const CLAVE = `${PREFIJO_APP}ultima_actividad`;
const EVENTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

function leer() {
  try {
    return Number(localStorage.getItem(CLAVE)) || Date.now();
  } catch {
    return Date.now();
  }
}

function marcar() {
  try {
    localStorage.setItem(CLAVE, String(Date.now()));
  } catch {
    // sin almacenamiento: solo cuenta mientras la pestaña está abierta
  }
}

export function useInactividad(minutos, alVencer) {
  useEffect(() => {
    if (!minutos) return undefined;
    const limiteMs = minutos * 60 * 1000;
    const revisar = () => {
      if (Date.now() - leer() > limiteMs) alVencer();
    };
    revisar();
    marcar();
    let ultima = 0;
    const alUsar = () => {
      if (Date.now() - ultima > 15000) {
        ultima = Date.now();
        marcar();
      }
    };
    EVENTOS.forEach((ev) => window.addEventListener(ev, alUsar, { passive: true }));
    const alVolver = () => document.visibilityState === 'visible' && revisar();
    document.addEventListener('visibilitychange', alVolver);
    const t = setInterval(revisar, 60000);
    return () => {
      EVENTOS.forEach((ev) => window.removeEventListener(ev, alUsar));
      document.removeEventListener('visibilitychange', alVolver);
      clearInterval(t);
    };
  }, [minutos, alVencer]);
}
