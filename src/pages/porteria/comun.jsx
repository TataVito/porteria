// Piezas visuales de Portería: estilo "Faena" (fondo oscuro, Barlow, botones grandes para
// usar de pie, con guantes o con mala luz), igual que la portería del Calendario de Camiones.
import { normalizarPatente, limpiarRut } from '../../lib/formato.js';

export function BotonF({ children, variant = 'primario', className = '', grande, ...props }) {
  const v = {
    primario: 'bg-marca text-white hover:bg-marcaosc',
    secundario: 'border-2 border-white/30 bg-transparent text-white hover:bg-white/10',
    verde: 'bg-[#2F7D4F] text-white hover:bg-[#256641]',
    claro: 'bg-white text-tinta hover:bg-papel',
    peligro: 'border-2 border-peligro bg-transparent text-[#FF8A8F] hover:bg-peligro/15',
  };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 px-4 font-faenacond font-bold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
        grande ? 'min-h-[64px] text-xl' : 'min-h-[48px] text-base'
      } ${v[variant] || v.primario} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function PanelF({ children, className = '' }) {
  return <div className={`border border-white/15 bg-[#26262B] ${className}`}>{children}</div>;
}

export function EtiquetaF({ children }) {
  return <span className="mb-1 block font-faenacond text-sm font-semibold uppercase tracking-wider text-white/55">{children}</span>;
}

export const CAMPO_F =
  'w-full min-h-[52px] border border-white/25 bg-white/5 px-3 text-lg text-white placeholder-white/35 focus:border-white focus:outline-none disabled:opacity-50';

export function InputF({ className = '', ...props }) {
  return <input {...props} className={`${CAMPO_F} ${className}`} />;
}

export function SelectF({ className = '', ...props }) {
  return <select {...props} className={`${CAMPO_F} [&>option]:bg-[#26262B] ${className}`} />;
}

export function Patente({ valor, className = '' }) {
  if (!valor) return null;
  const n = normalizarPatente(valor);
  return (
    <span
      className={`inline-flex items-center border-2 border-tinta bg-white px-1.5 font-mono text-[15px] font-medium leading-6 tracking-[0.12em] text-tinta ${className}`}
    >
      {n.length === 6 ? `${n.slice(0, 2)}·${n.slice(2, 4)}·${n.slice(4)}` : n}
    </span>
  );
}

// Prohibiciones de la lista negra que coinciden (en el equipo, para avisar al instante; la
// base igual lo vuelve a revisar al registrar).
export function coincidenciasListaNegra(listaNegra, { rut, patente, nombre }) {
  const r = limpiarRut(rut);
  const p = normalizarPatente(patente);
  const n = String(nombre || '').trim().toLowerCase();
  return listaNegra.filter(
    (l) =>
      (l.rut && r.length >= 2 && limpiarRut(l.rut) === r) ||
      (l.patente && p.length >= 4 && l.patente === p) ||
      (l.nombre && n && l.nombre.trim().toLowerCase() === n),
  );
}

export function AlertaListaNegra({ coincidencias }) {
  if (!coincidencias?.length) return null;
  return (
    <div className="border-4 border-peligro bg-peligro/20 px-4 py-3 text-white" role="alert">
      <p className="font-faenacond text-2xl font-bold uppercase tracking-wide">⛔ Ingreso prohibido</p>
      {coincidencias.map((l) => (
        <p key={l.id} className="mt-1 text-base">
          {[l.nombre, l.rut, l.patente].filter(Boolean).join(' · ')} — <b>{l.motivo}</b>
        </p>
      ))}
      <p className="mt-1 text-sm text-white/70">Está en la lista negra del condominio. Solo administración puede autorizarlo.</p>
    </div>
  );
}
