// Formatos chilenos (hora de Santiago), RUT y patentes.
const ZONA = 'America/Santiago';

export function hoyISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
}

export function sumarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fechaCorta(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${a}`;
}

const fmtHora = new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false });
const fmtFechaHora = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});
const fmtDia = new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, weekday: 'short', day: '2-digit', month: 'short' });

export const hora = (ts) => (ts ? fmtHora.format(new Date(ts)) : '');
export const fechaHora = (ts) => (ts ? fmtFechaHora.format(new Date(ts)).replace(',', '') : '');
export const diaCorto = (iso) => fmtDia.format(new Date(`${iso}T12:00:00Z`));

// Fecha (YYYY-MM-DD) en hora de Santiago de un timestamp.
export function diaDe(ts) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date(ts));
}

// Inicio del día en Santiago como ISO (para filtrar en la base).
export function inicioDelDia(iso) {
  // Se prueba con -03 y -04 (horario de verano/invierno) y se queda con el que cae en ese día.
  for (const off of ['-03:00', '-04:00']) {
    const t = new Date(`${iso}T00:00:00${off}`);
    if (diaDe(t) === iso && diaDe(new Date(t.getTime() - 60000)) !== iso) return t.toISOString();
  }
  return new Date(`${iso}T00:00:00-03:00`).toISOString();
}

export function minutosDesde(ts, hasta = Date.now()) {
  return Math.max(0, Math.floor((hasta - new Date(ts).getTime()) / 60000));
}

export function duracion(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24} h`;
}

export function normalizarPatente(p) {
  return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Patente chilena con guiones para mostrar: ABCD12 → AB·CD·12, AB1234 → AB·12·34
export function mostrarPatente(p) {
  const n = normalizarPatente(p);
  if (n.length === 6) return `${n.slice(0, 2)}·${n.slice(2, 4)}·${n.slice(4)}`;
  return n;
}

export function limpiarRut(r) {
  return String(r || '').toUpperCase().replace(/[^0-9K]/g, '');
}

export function rutValido(r) {
  const s = limpiarRut(r);
  if (s.length < 2) return false;
  const cuerpo = s.slice(0, -1);
  const dv = s.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;
  let suma = 0;
  let mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const r11 = 11 - (suma % 11);
  const esperado = r11 === 11 ? '0' : r11 === 10 ? 'K' : String(r11);
  return dv === esperado;
}

export function mostrarRut(r) {
  const s = limpiarRut(r);
  if (s.length < 2) return r || '';
  const cuerpo = s.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${s.slice(-1)}`;
}

export function nombreUnidad(u) {
  if (!u) return '';
  return u.torre ? `${u.torre}-${u.numero}` : u.numero;
}

// Orden natural: "2" antes que "10", torre A antes que B.
export function compararUnidades(a, b) {
  return nombreUnidad(a).localeCompare(nombreUnidad(b), 'es', { numeric: true });
}

export const TIPOS_ACCESO = {
  visita: 'Visita',
  servicio: 'Servicio',
  delivery: 'Delivery',
  proveedor: 'Proveedor',
  residente: 'Residente',
  otro: 'Otro',
};

export const AUTORIZACIONES = {
  invitacion: 'Invitación',
  telefono: 'Llamada al residente',
  presencial: 'Residente presente',
  admin: 'Administración',
  residente: 'Es residente',
  otro: 'Otro',
};
