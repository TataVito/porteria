import { useState } from 'react';
import { useAvisar } from '../../components/ui.jsx';
import { useCondominio } from '../../lib/CondominioContext.jsx';
import { useConsulta } from '../../lib/useConsulta.js';
import { mensajeError, supabase } from '../../lib/supabase.js';
import { diaCorto, diaDe, hora } from '../../lib/formato.js';
import { BotonF, EtiquetaF, PanelF, CAMPO_F } from './comun.jsx';

export const TIPOS_BITACORA = {
  novedad: { label: 'Novedad', color: 'bg-white/15' },
  turno: { label: 'Cambio de turno', color: 'bg-[#2E5E8C]' },
  ronda: { label: 'Ronda', color: 'bg-[#2F7D4F]' },
  incidente: { label: 'Incidente', color: 'bg-peligro' },
  mantencion: { label: 'Mantención', color: 'bg-[#B07A1E]' },
};

// Libro de novedades: cada entrada queda con usuario y hora y no se puede editar ni borrar.
export default function Bitacora() {
  const { condominioId } = useCondominio();
  const avisar = useAvisar();
  const [tipo, setTipo] = useState('novedad');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [limite, setLimite] = useState(60);

  const { datos, recargar } = useConsulta(
    'bitacora',
    () => supabase.from('bitacora').select('*').eq('condominio_id', condominioId).order('fecha', { ascending: false }).limit(limite),
    [condominioId, limite],
    { condominioId, tablas: ['bitacora'] },
  );
  const entradas = datos || [];

  async function guardar(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    const { error } = await supabase.from('bitacora').insert({ condominio_id: condominioId, tipo, texto: texto.trim() });
    setEnviando(false);
    if (error) return avisar(mensajeError(error), 'rojo');
    setTexto('');
    setTipo('novedad');
    recargar();
  }

  let diaAnterior = '';
  return (
    <div className="space-y-4">
      <PanelF className="p-4">
        <form onSubmit={guardar} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(TIPOS_BITACORA).map(([k, v]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTipo(k)}
                className={`min-h-[44px] border-2 px-3 text-sm font-semibold ${tipo === k ? 'border-white bg-white text-tinta' : 'border-white/20 text-white/80'}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={4000}
            rows={3}
            placeholder={tipo === 'turno' ? 'Recibo turno sin novedades / Entrego turno con…' : 'Escribe la novedad…'}
            className={`${CAMPO_F} py-2`}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-white/50">Queda registrada con tu usuario y la hora. No se puede editar ni borrar.</span>
            <BotonF type="submit" variant="primario" disabled={enviando || !texto.trim()}>
              {enviando ? 'Guardando…' : 'Anotar'}
            </BotonF>
          </div>
        </form>
      </PanelF>

      <div>
        {entradas.map((b) => {
          const dia = diaDe(b.fecha);
          const cabecera = dia !== diaAnterior;
          diaAnterior = dia;
          return (
            <div key={b.id}>
              {cabecera && <EtiquetaF><span className="mt-4 block">{diaCorto(dia)}</span></EtiquetaF>}
              <div className="flex gap-3 border-b border-white/10 py-3">
                <span className="w-12 shrink-0 font-mono text-white/60">{hora(b.fecha)}</span>
                <div className="min-w-0 flex-1">
                  <span className={`mr-2 px-1.5 py-0.5 font-faenacond text-xs font-bold uppercase ${TIPOS_BITACORA[b.tipo]?.color}`}>{TIPOS_BITACORA[b.tipo]?.label}</span>
                  <span className="text-sm text-white/50">{b.usuario}</span>
                  <p className="mt-1 whitespace-pre-wrap">{b.texto}</p>
                </div>
              </div>
            </div>
          );
        })}
        {entradas.length === 0 && <PanelF className="p-6 text-center text-white/50">La bitácora está vacía.</PanelF>}
        {entradas.length >= limite && (
          <BotonF variant="secundario" className="mt-3 w-full" onClick={() => setLimite((l) => l + 100)}>
            Ver más antiguas
          </BotonF>
        )}
      </div>
    </div>
  );
}
