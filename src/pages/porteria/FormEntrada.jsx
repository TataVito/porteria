import { useEffect, useMemo, useState } from 'react';
import { Modal, SelectorUnidad, useAvisar } from '../../components/ui.jsx';
import { useCondominio } from '../../lib/CondominioContext.jsx';
import { mensajeError, supabase } from '../../lib/supabase.js';
import { AUTORIZACIONES, TIPOS_ACCESO, mostrarRut, nombreUnidad, normalizarPatente, rutValido } from '../../lib/formato.js';
import { AlertaListaNegra, BotonF, EtiquetaF, InputF, coincidenciasListaNegra } from './comun.jsx';

// Registro de una entrada. Con invitación: los datos vienen del pase y la unidad queda fija.
// Sin invitación: el conserje elige la unidad, llama al residente y anota cómo se autorizó.
export default function FormEntrada({ open, onClose, inicial, ocupados, esAdmin }) {
  const { condominioId, unidades, unidadPorId, residentes, estacionamientos, listaNegra } = useCondominio();
  const avisar = useAvisar();
  const [f, setF] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [prohibido, setProhibido] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF({
      tipo: 'visita',
      nombre: '',
      rut: '',
      patente: '',
      unidad_id: null,
      autorizacion: 'telefono',
      estacionamiento_id: '',
      acompanantes: 0,
      observaciones: '',
      ...inicial,
    });
    setError('');
    setProhibido(false);
  }, [open, inicial]);

  const inv = inicial?.invitacion;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const coincidencias = useMemo(() => coincidenciasListaNegra(listaNegra, f), [listaNegra, f]);
  const contactos = useMemo(
    () => residentes.filter((r) => r.unidad_id === f.unidad_id && r.activo && r.telefono),
    [residentes, f.unidad_id],
  );
  const unidad = unidadPorId.get(f.unidad_id);
  const libres = estacionamientos.filter((e) => e.activo && e.tipo !== 'residente' && !ocupados.has(e.id));
  const rutMalo = f.rut && f.rut.replace(/[^0-9kK]/g, '').length >= 2 && !rutValido(f.rut);

  async function registrar(forzar = false) {
    setError('');
    if (!f.nombre?.trim()) return setError('Falta el nombre.');
    if (!f.unidad_id && f.tipo !== 'proveedor' && f.tipo !== 'otro') return setError('Elige a qué unidad va.');
    setEnviando(true);
    const { error: err } = await supabase.rpc('registrar_entrada', {
      p_condominio: condominioId,
      p_tipo: f.tipo,
      p_nombre: f.nombre.trim(),
      p_rut: f.rut || '',
      p_patente: normalizarPatente(f.patente),
      p_unidad: f.unidad_id || null,
      p_invitacion: inv?.invitacion_id || null,
      p_estacionamiento: f.estacionamiento_id || null,
      p_autorizacion: inv ? 'invitacion' : f.autorizacion,
      p_acompanantes: Number(f.acompanantes) || 0,
      p_observaciones: f.observaciones || '',
      p_forzar: forzar,
    });
    setEnviando(false);
    if (err) {
      if (/PROHIBIDO/.test(err.message)) setProhibido(true);
      return setError(mensajeError(err));
    }
    const est = estacionamientos.find((e) => e.id === f.estacionamiento_id);
    avisar(`Entrada registrada: ${f.nombre.trim()}${unidad ? ` → casa ${nombreUnidad(unidad)}` : ''}${est ? ` · Estac. ${est.codigo}` : ''}`);
    onClose(true);
  }

  return (
    <Modal open={open} onClose={() => onClose(false)} title={inv ? 'Ingreso con invitación' : 'Registrar ingreso'} oscuro wide>
      <form
        className="space-y-4 font-faena"
        onSubmit={(e) => {
          e.preventDefault();
          registrar(false);
        }}
      >
        <AlertaListaNegra coincidencias={coincidencias} />

        {inv && (
          <div className="border-2 border-[#2F7D4F] bg-[#2F7D4F]/20 px-4 py-3">
            <p className="font-faenacond text-xl font-bold uppercase text-[#8FE0AE]">✓ Invitación válida</p>
            <p className="text-white/80">
              Invitado por casa <b className="text-white">{inv.unidad}</b>
              {inv.notas ? ` · “${inv.notas}”` : ''}
            </p>
          </div>
        )}

        {!inv && (
          <div>
            <EtiquetaF>Tipo</EtiquetaF>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {Object.entries(TIPOS_ACCESO).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setF((x) => ({ ...x, tipo: k, autorizacion: k === 'residente' ? 'residente' : x.autorizacion === 'residente' ? 'telefono' : x.autorizacion }))}
                  className={`min-h-[48px] border-2 font-faenacond text-base font-bold uppercase ${
                    f.tipo === k ? 'border-white bg-white text-tinta' : 'border-white/20 text-white/80 hover:border-white/50'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <EtiquetaF>Nombre *</EtiquetaF>
            <InputF value={f.nombre || ''} onChange={set('nombre')} autoComplete="off" autoFocus={!inv} required />
          </label>
          <label className="block">
            <EtiquetaF>RUT</EtiquetaF>
            <InputF
              value={f.rut || ''}
              onChange={set('rut')}
              onBlur={() => f.rut && rutValido(f.rut) && setF((x) => ({ ...x, rut: mostrarRut(x.rut) }))}
              inputMode="text"
              autoComplete="off"
              placeholder="12.345.678-9"
            />
            {rutMalo && <span className="mt-1 block text-sm text-[#FFB27A]">El dígito verificador no calza. Revísalo.</span>}
          </label>
          <label className="block">
            <EtiquetaF>Patente</EtiquetaF>
            <InputF
              value={f.patente || ''}
              onChange={(e) => setF((x) => ({ ...x, patente: normalizarPatente(e.target.value).slice(0, 8) }))}
              autoComplete="off"
              placeholder="Sin vehículo"
              className="font-mono uppercase tracking-widest"
            />
          </label>
          {!inv && (
            <div className="sm:col-span-2">
              <EtiquetaF>Va a la casa {f.tipo === 'proveedor' || f.tipo === 'otro' ? '(opcional)' : '*'}</EtiquetaF>
              <SelectorUnidad unidades={unidades} valor={f.unidad_id} onChange={set('unidad_id')} oscuro />
            </div>
          )}
        </div>

        {!inv && f.unidad_id && (
          <div className="border border-white/15 bg-white/5 px-4 py-3">
            <p className="font-faenacond text-sm font-semibold uppercase tracking-wider text-white/55">
              Llamar para autorizar — casa {nombreUnidad(unidad)}
            </p>
            {contactos.length === 0 && !unidad?.telefono && <p className="mt-1 text-white/60">No hay teléfonos registrados para esta casa.</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {unidad?.telefono && (
                <a href={`tel:${unidad.telefono}`} className="inline-flex min-h-[44px] items-center border border-white/30 px-3 text-white hover:bg-white/10">
                  ☎ Citófono / fijo: {unidad.telefono}
                </a>
              )}
              {contactos.map((r) => (
                <a key={r.id} href={`tel:${r.telefono}`} className="inline-flex min-h-[44px] items-center border border-white/30 px-3 text-white hover:bg-white/10">
                  ☎ {r.nombre}: {r.telefono}
                </a>
              ))}
            </div>
          </div>
        )}

        {!inv && f.tipo !== 'residente' && (
          <div>
            <EtiquetaF>¿Cómo se autorizó?</EtiquetaF>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {['telefono', 'presencial', 'admin', 'otro'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setF((x) => ({ ...x, autorizacion: k }))}
                  className={`min-h-[48px] border-2 px-2 text-sm font-semibold ${
                    f.autorizacion === k ? 'border-white bg-white text-tinta' : 'border-white/20 text-white/80 hover:border-white/50'
                  }`}
                >
                  {AUTORIZACIONES[k]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <div>
            <EtiquetaF>Estacionamiento de visita {f.patente ? '' : '(si viene en vehículo)'}</EtiquetaF>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setF((x) => ({ ...x, estacionamiento_id: '' }))}
                className={`min-h-[48px] min-w-[64px] border-2 px-3 font-faenacond text-lg font-bold ${
                  !f.estacionamiento_id ? 'border-white bg-white text-tinta' : 'border-white/20 text-white/70'
                }`}
              >
                Ninguno
              </button>
              {libres.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setF((x) => ({ ...x, estacionamiento_id: e.id }))}
                  title={e.ubicacion}
                  className={`min-h-[48px] min-w-[64px] border-2 px-3 font-faenacond text-lg font-bold ${
                    f.estacionamiento_id === e.id ? 'border-[#8FE0AE] bg-[#2F7D4F] text-white' : 'border-[#2F7D4F] text-[#8FE0AE] hover:bg-[#2F7D4F]/25'
                  }`}
                >
                  {e.codigo}
                  {e.tipo === 'discapacitado' && ' ♿'}
                </button>
              ))}
              {libres.length === 0 && <span className="self-center text-white/60">No quedan estacionamientos libres.</span>}
            </div>
          </div>
          <label className="block">
            <EtiquetaF>Acompañantes</EtiquetaF>
            <InputF type="number" min="0" max="50" value={f.acompanantes ?? 0} onChange={set('acompanantes')} />
          </label>
        </div>

        <label className="block">
          <EtiquetaF>Observaciones</EtiquetaF>
          <InputF value={f.observaciones || ''} onChange={set('observaciones')} placeholder="Opcional" autoComplete="off" />
        </label>

        {error && <p className="border border-peligro bg-peligro/15 px-3 py-2 text-[#FF9EA2]">{error}</p>}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <BotonF variant="secundario" onClick={() => onClose(false)}>
            Cancelar
          </BotonF>
          {(coincidencias.length > 0 || prohibido) && esAdmin && (
            <BotonF variant="peligro" disabled={enviando} onClick={() => registrar(true)}>
              Autorizar igual (admin)
            </BotonF>
          )}
          <BotonF type="submit" variant="verde" grande disabled={enviando || ((coincidencias.length > 0 || prohibido) && !esAdmin)}>
            {enviando ? 'Registrando…' : '✓ Registrar entrada'}
          </BotonF>
        </div>
      </form>
    </Modal>
  );
}
