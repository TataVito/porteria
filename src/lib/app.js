// Este proyecto publica dos apps con la misma base: Portería (conserjería y administración) y
// Mi Casa (cada casa invita a sus visitas). Cada una guarda su sesión y sus copias aparte, para
// que en un mismo equipo no se mezclen.
export const APP = typeof document !== 'undefined' && document.documentElement.dataset.app === 'casa' ? 'casa' : 'porteria';
export const PREFIJO_APP = APP === 'casa' ? 'lp_casa_' : 'lp_port_';

// Ruta a los archivos de la raíz (logo, íconos) desde cualquiera de las dos apps.
export const RAIZ = APP === 'casa' ? '../' : './';
