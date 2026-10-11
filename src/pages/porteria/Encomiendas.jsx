import { useMemo, useState } from 'react';
import { Modal, SelectorUnidad, useAvisar } from '../../components/ui.jsx';
import { useCondominio } from '../../lib/CondominioContext.jsx';
import { mensajeError, supabase } from '../../lib/supabase.js';
import { duracion, fechaHora, minutosDesde, nombreUnidad } from '../../lib/formato.js';
import { BotonF, EtiquetaF, InputF, PanelF } from './comun.jsx';

const EMPRESAS = ['Chilexpress', 'Starken', 'Correos de Chile', 'Blue Express', 'Mercado Libre', 'Falabella', 'Ripley', 'Paris', 'Amazon', 'Otra'];

// Encomiendas: recepción en conserjería (el residente ve el aviso al instante) y entrega.
export default function Encomiendas({ pendientes, recargar }) {
  const { condominioId, unidades, unidadPorId, residentes } = useCondominio();
  const avisar = useAvisar();
  const [nueva, setNueva] = useState(false);
  const [entregar, setEntregar] = useState(null);
  const [filtro, setFiltro] = useState('');

  const agrupadas = useMemo(() => {
    const f = filtro.trim().toLowerCase().replace(/[\s-]/g, '');
    const m = new Map();
    for (const e of pendientes) {
      const u = unidadPorId.get(e.unidad_id);
      if (f && !nombreUnidad(u).toLowerCase().replace(/[\s-]/g, '').includes(f) && !e.destinatario.toLowerCase().includes(f)) continue;
      if (!m.has(e.unidad_id)) m.set(e.unidad_id, []);
      m.get(e.unidad_id).push(e);
    }
    return [...m.entries()].sort((a, b) => nombreUnidad(unidadPorId.get(a[0])).localeCompare(nombreUnidad(unidadPorId.get(b[0])), 'es', { numeric: true }));
  }, [pendientes, unidadPorId, filtro]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <BotonF variant="primario" grande onClick={() => setNueva(true)}>
          + Recibir encomienda
        </BotonF>
        <InputF value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar casa o destinatario" className="min-h-[64px]" />
      </div>

      {agrupadas.length === 0 && <PanelF className="p-6 text-center text-white/50">{pendientes.length ? 'Sin coincidencias.' : 'No hay encomiendas por entregar.'}</PanelF>}

      <div className="grid gap-3 md:grid-cols-2">
        {agrupadas.map(([unidadId, lista]) => (
          <PanelF key={unidadId} className="p-4">
            <p className="font-faenacond text-2xl font-bold">
              Casa {nombreUnidad(unidadPorId.get(unidadId))} <span className="text-white/50">· {lista.length}</span>
            </p>
            <div className="mt-2 divide-y divide-white/10">
              {lista.map((e) => (
                <div key={e.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {e.empresa || 'Encomienda'} {e.descripcion && <span className="font-normal text-white/70">· {e.descripcion}</span>}
                    </p>
                    <p className="text-sm text-white/55">
                      {e.destinatario && `Para ${e.destinatario} · `}
                      Llegó {fechaHora(e.recibida_en)} ({duracion(minutosDesde(e.recibida_en))})
                    </p>
                  </div>
                  <BotonF variant="claro" onClick={() => setEntregar(e)}>
                    Entregar
                  </BotonF>
                </div>
              ))}
            </div>
          </PanelF>
        ))}
      </div>

      <NuevaEncomienda
        open={nueva}
        onClose={(ok) => {
          setNueva(false);
          if (ok) recargar();
        }}
        condominioId={condominioId}
        unidades={unidades}
        residentes={residentes}
        avisar={avisar}
      />

      <Modal open={Boolean(entregar)} onClose={() => setEntregar(null)} title="Entregar encomienda" oscuro>
        {entregar && (
          <Entrega
            e={entregar}
            residentes={residentes.filter((r) => r.unidad_id === entregar.unidad_id && r.activo)}
            onListo={async (retiradaPor) => {
              const { error } = await supabase
                .from('encomiendas')
                .update({ retirada_en: new Date().toISOString(), retirada_por: retiradaPor })
                .eq('id', entregar.id);
              if (error) return avisar(mensajeError(error), 'rojo');
              avisar(`Encomienda entregada a ${retiradaPor}`);
              setEntregar(null);
              recargar();
            }}
            onCancelar={() => setEntregar(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function NuevaEncomienda({ open, onClose, condominioId, unidades, residentes, avisar }) {
  const [f, setF] = useState({ unidad_id: null, empresa: '', descripcion: '', destinatario: '' });
  const [cantidad, setCantidad] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const gente = residentes.filter((r) => r.unidad_id === f.unidad_id && r.activo);

  async function guardar(e) {
    e.preventDefault();
    if (!f.unidad_id) return setError('Elige la unidad.');
    setEnviando(true);
    setError('');
    const filas = Array.from({ length: Math.max(1, Math.min(20, Number(cantidad) || 1)) }, () => ({ ...f, condominio_id: condominioId }));
    const { error: err } = await supabase.from('encomiendas').insert(filas);
    setEnviando(false);
    if (err) return setError(mensajeError(err));
    avisar(`Encomienda registrada. El residente ya ve el aviso.`);
    setF({ unidad_id: null, empresa: '', descripcion: '', destinatario: '' });
    setCantidad(1);
    onClose(true);
  }

  return (
    <Modal open={open} onClose={() => onClose(false)} title="Recibir encomienda" oscuro>
      <form onSubmit={guardar} className="space-y-4 font-faena">
        <div>
          <EtiquetaF>Casa *</EtiquetaF>
          <SelectorUnidad unidades={unidades} valor={f.unidad_id} onChange={(v) => setF((x) => ({ ...x, unidad_id: v }))} oscuro autoFocus />
        </div>
        <div>
          <EtiquetaF>Empresa</EtiquetaF>
          <div className="flex flex-wrap gap-2">
            {EMPRESAS.map((emp) => (
              <button
                key={emp}
                type="button"
                onClick={() => setF((x) => ({ ...x, empresa: emp === 'Otra' ? '' : emp }))}
                className={`min-h-[44px] border-2 px-3 text-sm font-semibold ${f.empresa === emp ? 'border-white bg-white text-tinta' : 'border-white/20 text-white/80'}`}
              >
                {emp}
              </button>
            ))}
          </div>
          <InputF className="mt-2" value={f.empresa} onChange={(e) => setF((x) => ({ ...x, empresa: e.target.value }))} placeholder="Empresa" />
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <label className="block">
            <EtiquetaF>Descripción</EtiquetaF>
            <InputF value={f.descripcion} onChange={(e) => setF((x) => ({ ...x, descripcion: e.target.value }))} placeholder="Caja grande, sobre, refrigerado…" />
          </label>
          <label className="block">
            <EtiquetaF>Bultos</EtiquetaF>
            <InputF type="number" min="1" max="20" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </label>
        </div>
        <label className="block">
          <EtiquetaF>Destinatario</EtiquetaF>
          <InputF value={f.destinatario} onChange={(e) => setF((x) => ({ ...x, destinatario: e.target.value }))} list="destinatarios" placeholder="Nombre en la etiqueta" />
          <datalist id="destinatarios">
            {gente.map((r) => (
              <option key={r.id} value={r.nombre} />
            ))}
          </datalist>
        </label>
        {error && <p className="text-[#FF9EA2]">{error}</p>}
        <div className="flex gap-2">
          <BotonF variant="secundario" className="flex-1" onClick={() => onClose(false)}>
            Cancelar
          </BotonF>
          <BotonF type="submit" variant="verde" grande className="flex-1" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Registrar'}
          </BotonF>
        </div>
      </form>
    </Modal>
  );
}

function Entrega({ e, residentes, onListo, onCancelar }) {
  const [quien, setQuien] = useState(e.destinatario || '');
  const [enviando, setEnviando] = useState(false);
  return (
    <form
      className="space-y-4 font-faena"
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (!quien.trim()) return;
        setEnviando(true);
        await onListo(quien.trim());
        setEnviando(false);
      }}
    >
      <p className="text-lg">
        {e.empresa || 'Encomienda'} {e.descripcion && `· ${e.descripcion}`}
      </p>
      <div>
        <EtiquetaF>¿Quién la retira? *</EtiquetaF>
        <div className="mb-2 flex flex-wrap gap-2">
          {residentes.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setQuien(r.nombre)}
              className={`min-h-[44px] border-2 px-3 text-sm font-semibold ${quien === r.nombre ? 'border-white bg-white text-tinta' : 'border-white/20 text-white/80'}`}
            >
              {r.nombre}
            </button>
          ))}
        </div>
        <InputF value={quien} onChange={(ev) => setQuien(ev.target.value)} placeholder="Nombre de quien retira" required autoFocus={residentes.length === 0} />
      </div>
      <div className="flex gap-2">
        <BotonF variant="secundario" className="flex-1" onClick={onCancelar}>
          Cancelar
        </BotonF>
        <BotonF type="submit" variant="verde" grande className="flex-1" disabled={enviando || !quien.trim()}>
          ✓ Entregada
        </BotonF>
      </div>
    </form>
  );
}
