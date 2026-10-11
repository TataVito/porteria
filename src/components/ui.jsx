// Componentes base con el estilo "Plano técnico" de Las Palmas: verde palma, tinta carbón, líneas finas
// y esquinas rectas (igual que el Calendario de Camiones).
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { compararUnidades, nombreUnidad } from '../lib/formato.js';

export function Card({ children, className = '' }) {
  return <div className={`border border-gray-300 bg-white ${className}`}>{children}</div>;
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const base =
    'inline-flex min-h-[40px] items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta';
  const variants = {
    primary: 'bg-marca font-bold text-white hover:bg-marcaosc',
    secondary: 'border border-tinta bg-transparent text-tinta hover:bg-tinta/5',
    ghost: 'text-tinta underline-offset-4 hover:underline',
    danger: 'border border-peligro bg-transparent text-peligro hover:bg-peligro/5',
    dark: 'bg-tinta font-bold text-white hover:bg-gray-800',
  };
  return (
    <button type="button" className={`${base} ${variants[variant] || variants.primary} ${className}`} {...props}>
      {children}
    </button>
  );
}

const TONOS = {
  gris: 'border-gray-300 bg-gray-50 text-gray-600',
  verde: 'border-[#2F7D4F] bg-[#E3F1E8] text-[#1F5A37]',
  rojo: 'border-peligro bg-[#FBE6E6] text-peligroosc',
  ambar: 'border-[#B07A1E] bg-[#F6EBD4] text-[#5C3D06]',
  azul: 'border-[#2E5E8C] bg-[#E2ECF5] text-[#1D3F60]',
  tinta: 'border-tinta bg-tinta text-white',
};

export function Badge({ children, tono = 'gris', className = '' }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${TONOS[tono] || TONOS.gris} ${className}`}
    >
      {children}
    </span>
  );
}

export function Aviso({ children, tono = 'ambar', className = '' }) {
  return <div className={`border px-3 py-2 text-sm ${TONOS[tono]} ${className}`}>{children}</div>;
}

export function Field({ label, children, hint, required, className = '' }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block font-mono text-[11px] uppercase tracking-wide text-gray-500">
        {label}
        {required && <span className="text-peligro"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

const CAMPO =
  'w-full min-h-[40px] border border-gray-300 bg-white px-3 py-2 text-sm text-tinta focus:border-tinta focus:outline-none focus:ring-1 focus:ring-tinta disabled:bg-gray-100 disabled:text-gray-500';

export function Input({ className = '', ...props }) {
  return <input {...props} className={`${CAMPO} ${className}`} />;
}

export function Select({ className = '', ...props }) {
  return <select {...props} className={`${CAMPO} ${className}`} />;
}

export function Textarea({ className = '', ...props }) {
  return <textarea {...props} className={`${CAMPO} ${className}`} />;
}

export function Modal({ open, onClose, title, children, wide, oscuro }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/50 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[94vh] w-full flex-col ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} border border-tinta ${oscuro ? 'bg-[#1C1C20] text-white' : 'bg-white'} shadow-xl`}
      >
        <div className="flex shrink-0 items-center justify-between border-b-4 border-acento bg-tinta px-5 py-3 text-white">
          <h3 className="text-base font-bold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 items-center justify-center text-papel/80 hover:bg-white/10 hover:text-papel"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Vacio({ titulo, children }) {
  return (
    <div className="border border-dashed border-gray-300 px-4 py-10 text-center">
      <p className="font-bold text-tinta">{titulo}</p>
      {children && <div className="mt-1 text-sm text-gray-500">{children}</div>}
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }) {
  return <p className="py-8 text-center font-mono text-xs uppercase tracking-wide text-gray-400">{texto}</p>;
}

export function Pestanas({ opciones, valor, onChange, className = '' }) {
  return (
    <div className={`flex gap-1 overflow-x-auto border-b border-gray-300 ${className}`}>
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`-mb-px flex min-h-[44px] shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium ${
            valor === o.id ? 'border-marca text-tinta' : 'border-transparent text-gray-500 hover:text-tinta'
          }`}
        >
          {o.label}
          {o.cuenta > 0 && <span className="bg-peligro px-1.5 font-mono text-[11px] font-bold text-white">{o.cuenta}</span>}
        </button>
      ))}
    </div>
  );
}

export function Titulo({ children, accion, sub }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-tinta">{children}</h2>
        {sub && <p className="text-sm text-gray-500">{sub}</p>}
      </div>
      {accion}
    </div>
  );
}

// Selector de unidad con búsqueda (condominios con muchas casas o departamentos).
export function SelectorUnidad({ unidades, valor, onChange, oscuro, autoFocus, requerido }) {
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const ordenadas = useMemo(() => [...(unidades || [])].sort(compararUnidades), [unidades]);
  const elegida = ordenadas.find((u) => u.id === valor);
  const filtro = texto.trim().toLowerCase().replace(/\s+/g, '');
  const lista = filtro
    ? ordenadas.filter((u) => nombreUnidad(u).toLowerCase().replace(/[\s-]/g, '').includes(filtro.replace(/-/g, '')))
    : ordenadas;
  const estiloCampo = oscuro
    ? 'w-full min-h-[52px] border border-white/25 bg-white/5 px-3 text-lg text-white placeholder-white/40 focus:border-white focus:outline-none'
    : CAMPO;
  return (
    <div className="relative">
      <input
        className={estiloCampo}
        value={abierto ? texto : elegida ? nombreUnidad(elegida) : texto}
        placeholder="Escribe el número…"
        inputMode="text"
        autoFocus={autoFocus}
        required={requerido && !valor}
        onFocus={() => {
          setAbierto(true);
          setTexto('');
        }}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          if (valor) onChange(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && abierto && lista.length > 0) {
            e.preventDefault();
            onChange(lista[0].id);
            setAbierto(false);
            e.currentTarget.blur();
          }
        }}
      />
      {abierto && (
        <div
          className={`absolute z-30 mt-1 max-h-60 w-full overflow-y-auto border shadow-xl ${
            oscuro ? 'border-white/25 bg-[#26262B]' : 'border-tinta bg-white'
          }`}
        >
          {lista.length === 0 && <p className="px-3 py-2 text-sm opacity-60">Sin coincidencias</p>}
          {lista.slice(0, 80).map((u) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(u.id);
                setAbierto(false);
                setTexto('');
              }}
              className={`block w-full px-3 py-2 text-left ${oscuro ? 'text-lg hover:bg-white/10' : 'text-sm hover:bg-gray-100'}`}
            >
              {nombreUnidad(u)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avisos flotantes (toasts)
// ---------------------------------------------------------------------------
const ToastCtx = createContext(() => {});

export function ProveedorAvisos({ children }) {
  const [avisos, setAvisos] = useState([]);
  const id = useRef(0);
  const avisar = useCallback((texto, tono = 'verde', ms = 4500) => {
    const n = ++id.current;
    setAvisos((a) => [...a.slice(-3), { n, texto, tono }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.n !== n)), ms);
  }, []);
  return (
    <ToastCtx.Provider value={avisar}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.n} className={`pointer-events-auto max-w-md border px-4 py-3 text-sm font-medium shadow-xl ${TONOS[a.tono] || TONOS.verde}`}>
            {a.texto}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useAvisar = () => useContext(ToastCtx);
