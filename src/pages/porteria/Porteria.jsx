import { useCallback, useMemo, useState } from 'react';
import EscanerQR from '../../components/EscanerQR.jsx';
import { Modal, useAvisar } from '../../components/ui.jsx';
import { useCondominio } from '../../lib/CondominioContext.jsx';
import { useAhora, useConsulta } from '../../lib/useConsulta.js';
import { mensajeError, supabase } from '../../lib/supabase.js';
import {
  TIPOS_ACCESO, duracion, fechaCorta, hora, hoyISO, limpiarRut, minutosDesde, mostrarRut, nombreUnidad, normalizarPatente,
} from '../../lib/formato.js';
import { AlertaListaNegra, BotonF, EtiquetaF, InputF, PanelF, Patente, coincidenciasListaNegra } from './comun.jsx';
import FormEntrada from './FormEntrada.jsx';
import Encomiendas from './Encomiendas.jsx';
import Bitacora from './Bitacora.jsx';

const CODIGO_RE = /^(PRT:?)?[A-HJ-NP-Z2-9]{6}$/i;

export default function Porteria({ esAdmin }) {
  const { condominioId, activo, unidadPorId, estacionamientos, estPorId } = useCondominio();
  const avisar = useAvisar();
  const [vista, setVista] = useState('ingreso');
  const [entrada, setEntrada] = useState(null); // datos iniciales del formulario de entrada
  const ahora = useAhora(30000);
  const hoy = hoyISO();

  const dentro = useConsulta(
    'dentro',
    () => supabase.from('accesos').select('*').eq('condominio_id', condominioId).is('salida_en', null).order('entrada_en', { ascending: false }),
    [condominioId],
    { condominioId, tablas: ['accesos'] },
  );
  const esperadas = useConsulta(
    'esperadas',
    () =>
      supabase
        .from('invitaciones')
        .select('*')
        .eq('condominio_id', condominioId)
        .eq('estado', 'activa')
        .lte('desde', hoy)
        .gte('hasta', hoy)
        .order('creado_en', { ascending: false }),
    [condominioId, hoy],
    { condominioId, tablas: ['invitaciones'] },
  );
  const pendientes = useConsulta(
    'encomiendas_pend',
    () => supabase.from('encomiendas').select('*').eq('condominio_id', condominioId).is('retirada_en', null).order('recibida_en', { ascending: false }),
    [condominioId],
    { condominioId, tablas: ['encomiendas'] },
  );

  const listaDentro = useMemo(() => dentro.datos || [], [dentro.datos]);
  const ocupados = useMemo(() => new Map(listaDentro.filter((a) => a.estacionamiento_id).map((a) => [a.estacionamiento_id, a])), [listaDentro]);
  const maxMin = activo?.max_minutos_estacionamiento || 240;
  const excedidos = listaDentro.filter((a) => a.estacionamiento_id && minutosDesde(a.entrada_en, ahora) > maxMin);
  const deVisita = estacionamientos.filter((e) => e.activo && e.tipo !== 'residente');
  const libres = deVisita.filter((e) => !ocupados.has(e.id)).length;

  // Ya entraron hoy con una invitación frecuente: no se muestran como "esperadas".
  const esperadasHoy = (esperadas.datos || []).filter(
    (i) => !(i.frecuencia === 'frecuente' && listaDentro.some((a) => a.invitacion_id === i.id)),
  );

  const salida = useCallback(
    async (a) => {
      const { error } = await supabase.rpc('registrar_salida', { p_acceso: a.id });
      if (error) return avisar(mensajeError(error), 'rojo');
      avisar(`Salida registrada: ${a.nombre || 'sin nombre'}${a.estacionamiento_id ? ` · libera ${estPorId.get(a.estacionamiento_id)?.codigo}` : ''}`);
      dentro.recargar();
    },
    [avisar, estPorId, dentro],
  );

  const cerrarEntrada = (ok) => {
    setEntrada(null);
    if (ok) {
      dentro.recargar();
      esperadas.recargar();
    }
  };

  const vistas = [
    { id: 'ingreso', label: 'Ingreso' },
    { id: 'dentro', label: 'Adentro', cuenta: listaDentro.length },
    { id: 'estacionamientos', label: 'Estacionam.', alerta: excedidos.length },
    { id: 'encomiendas', label: 'Encomiendas', cuenta: (pendientes.datos || []).length },
    { id: 'bitacora', label: 'Bitácora' },
  ];

  return (
    <div className="min-h-[calc(100vh-56px)] bg-[#1C1C20] font-faena text-white">
      {/* Resumen siempre visible */}
      <div className="grid grid-cols-2 border-b border-white/10 sm:grid-cols-4">
        <Indicador titulo="Adentro" valor={listaDentro.length} onClick={() => setVista('dentro')} />
        <Indicador titulo="Estac. libres" valor={`${libres}/${deVisita.length}`} alerta={excedidos.length > 0 && `${excedidos.length} excedido${excedidos.length > 1 ? 's' : ''}`} onClick={() => setVista('estacionamientos')} />
        <Indicador titulo="Esperadas hoy" valor={esperadasHoy.length} onClick={() => setVista('ingreso')} />
        <Indicador titulo="Encomiendas" valor={(pendientes.datos || []).length} onClick={() => setVista('encomiendas')} />
      </div>

      <nav className="sticky top-14 z-20 flex overflow-x-auto border-b border-white/10 bg-[#1C1C20]">
        {vistas.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setVista(v.id)}
            className={`flex min-h-[56px] shrink-0 flex-1 items-center justify-center gap-2 border-b-4 px-4 font-faenacond text-lg font-bold uppercase tracking-wide ${
              vista === v.id ? 'border-acento text-white' : 'border-transparent text-white/50 hover:text-white'
            }`}
          >
            {v.label}
            {v.cuenta > 0 && <span className="bg-white/15 px-2 text-base">{v.cuenta}</span>}
            {v.alerta > 0 && <span className="bg-[#E07A1F] px-2 text-base text-white">!</span>}
          </button>
        ))}
      </nav>

      {(dentro.error || esperadas.error) && (
        <p className="border-b border-[#E07A1F] bg-[#E07A1F]/15 px-4 py-2 text-sm">
          Sin conexión con el servidor: mostrando los últimos datos conocidos. {mensajeError(dentro.error || esperadas.error)}
        </p>
      )}

      <div className="mx-auto max-w-5xl p-3 sm:p-5">
        {vista === 'ingreso' && (
          <Ingreso
            dentro={listaDentro}
            esperadas={esperadasHoy}
            onEntrada={setEntrada}
            onSalida={salida}
            unidadPorId={unidadPorId}
          />
        )}
        {vista === 'dentro' && <Adentro lista={listaDentro} onSalida={salida} ahora={ahora} maxMin={maxMin} />}
        {vista === 'estacionamientos' && (
          <MapaEstacionamientos estacionamientos={estacionamientos} ocupados={ocupados} ahora={ahora} maxMin={maxMin} onSalida={salida} onEntrada={setEntrada} />
        )}
        {vista === 'encomiendas' && <Encomiendas pendientes={pendientes.datos || []} recargar={pendientes.recargar} />}
        {vista === 'bitacora' && <Bitacora />}
      </div>

      <FormEntrada open={Boolean(entrada)} inicial={entrada} onClose={cerrarEntrada} ocupados={ocupados} esAdmin={esAdmin} />
    </div>
  );
}

function Indicador({ titulo, valor, alerta, onClick }) {
  return (
    <button type="button" onClick={onClick} className="border-r border-white/10 px-4 py-3 text-left last:border-r-0 hover:bg-white/5">
      <span className="block font-faenacond text-sm font-semibold uppercase tracking-wider text-white/50">{titulo}</span>
      <span className="font-faenacond text-3xl font-bold leading-tight">{valor}</span>
      {alerta && <span className="ml-2 bg-[#E07A1F] px-1.5 py-0.5 align-middle text-xs font-bold uppercase">{alerta}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Ingreso: un solo buscador para código, patente, RUT, nombre o casa + escáner QR.
// ---------------------------------------------------------------------------
function Ingreso({ dentro, esperadas, onEntrada, onSalida, unidadPorId }) {
  const { condominioId, unidades, residentes, vehiculos, listaNegra } = useCondominio();
  const [texto, setTexto] = useState('');
  const [escanear, setEscanear] = useState(false);
  const [codigo, setCodigo] = useState(null); // { cargando, resultado, error, codigo }

  const validar = useCallback(
    async (valor) => {
      const cod = String(valor).trim();
      setCodigo({ cargando: true, codigo: cod });
      const { data, error } = await supabase.rpc('validar_codigo', { p_condominio: condominioId, p_codigo: cod });
      if (error) return setCodigo({ error: mensajeError(error), codigo: cod });
      setCodigo({ resultado: data?.[0] || null, codigo: cod });
    },
    [condominioId],
  );

  const alLeerQR = useCallback(
    (t) => {
      setEscanear(false);
      const limpio = String(t).trim();
      setTexto(limpio.replace(/^PRT:/i, ''));
      validar(limpio);
    },
    [validar],
  );

  const q = texto.trim();
  const qPat = normalizarPatente(q);
  const qRut = limpiarRut(q);
  const qMin = q.toLowerCase();
  const pareceCodigo = CODIGO_RE.test(q.replace(/\s/g, ''));

  const resultados = useMemo(() => {
    if (q.length < 2) return null;
    const conPatente = (p) => qPat.length >= 3 && normalizarPatente(p).includes(qPat);
    const conRut = (r) => qRut.length >= 4 && /^\d/.test(qRut) && limpiarRut(r).startsWith(qRut);
    const conNombre = (n) => qMin.length >= 3 && String(n || '').toLowerCase().includes(qMin);
    const qUnidad = qMin.replace(/[\s-]/g, '');
    return {
      dentro: dentro.filter((a) => conPatente(a.patente) || conRut(a.rut) || conNombre(a.nombre)).slice(0, 8),
      esperadas: esperadas.filter((i) => conPatente(i.patente) || conRut(i.rut) || conNombre(i.nombre)).slice(0, 8),
      vehiculos: vehiculos.filter((v) => conPatente(v.patente)).slice(0, 6),
      residentes: residentes.filter((r) => r.activo && (conRut(r.rut) || conNombre(r.nombre))).slice(0, 6),
      unidades: unidades.filter((u) => nombreUnidad(u).toLowerCase().replace(/[\s-]/g, '') === qUnidad).slice(0, 3),
      prohibidos: coincidenciasListaNegra(listaNegra, { rut: q, patente: q, nombre: q }),
    };
  }, [q, qPat, qRut, qMin, dentro, esperadas, vehiculos, residentes, unidades, listaNegra]);

  const sinResultados =
    resultados && !pareceCodigo && Object.values(resultados).every((l) => l.length === 0);

  function abrirConInvitacion(r) {
    onEntrada({
      tipo: r.tipo,
      nombre: r.nombre,
      rut: r.rut ? mostrarRut(r.rut) : '',
      patente: r.patente,
      unidad_id: r.unidad_id,
      invitacion: r,
    });
    setTexto('');
    setCodigo(null);
  }

  // Desde la lista de esperadas: se valida igual en la base antes de abrir el formulario.
  async function ingresarEsperada(i) {
    const { data, error } = await supabase.rpc('validar_codigo', { p_condominio: condominioId, p_codigo: i.codigo });
    const r = data?.[0];
    if (error || !r) return setCodigo({ error: mensajeError(error) || 'Invitación no encontrada', codigo: i.codigo });
    if (!r.valida) return setCodigo({ resultado: r, codigo: i.codigo });
    abrirConInvitacion(r);
  }

  return (
    <div className="space-y-4">
      <PanelF className="p-4">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (pareceCodigo) validar(q);
          }}
        >
          <div className="relative flex-1">
            <InputF
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setCodigo(null);
              }}
              placeholder="Código, patente, RUT, nombre o casa"
              className="min-h-[64px] pr-12 text-2xl"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label="Buscar"
            />
            {texto && (
              <button
                type="button"
                aria-label="Borrar búsqueda"
                onClick={() => {
                  setTexto('');
                  setCodigo(null);
                }}
                className="absolute right-2 top-1/2 h-11 w-11 -translate-y-1/2 text-2xl text-white/50 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
          {pareceCodigo && (
            <BotonF type="submit" variant="claro" grande>
              Validar código
            </BotonF>
          )}
          <BotonF variant="primario" grande onClick={() => setEscanear(true)}>
            ▣ Escanear QR
          </BotonF>
        </form>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <BotonF variant="secundario" onClick={() => onEntrada({ tipo: 'visita' })}>
            + Visita sin pase
          </BotonF>
          <BotonF variant="secundario" onClick={() => onEntrada({ tipo: 'delivery', autorizacion: 'telefono' })}>
            + Delivery
          </BotonF>
          <BotonF variant="secundario" onClick={() => onEntrada({ tipo: 'servicio' })}>
            + Servicio
          </BotonF>
          <BotonF variant="secundario" onClick={() => onEntrada({ tipo: 'proveedor', autorizacion: 'admin' })}>
            + Proveedor
          </BotonF>
        </div>
      </PanelF>

      {codigo && <ResultadoCodigo estado={codigo} onIngresar={abrirConInvitacion} />}

      {resultados && (
        <div className="space-y-3">
          <AlertaListaNegra coincidencias={resultados.prohibidos} />
          {resultados.dentro.map((a) => (
            <PanelF key={a.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex-1">
                <EtiquetaF>Está adentro desde las {hora(a.entrada_en)}</EtiquetaF>
                <p className="text-xl font-semibold">
                  {a.nombre} <Patente valor={a.patente} />
                </p>
                <p className="text-white/60">
                  {TIPOS_ACCESO[a.tipo]} {a.unidad_id && `→ casa ${nombreUnidad(unidadPorId.get(a.unidad_id))}`}
                </p>
              </div>
              <BotonF variant="claro" grande onClick={() => onSalida(a)}>
                Registrar salida
              </BotonF>
            </PanelF>
          ))}
          {resultados.esperadas.map((i) => (
            <TarjetaEsperada key={i.id} i={i} unidad={unidadPorId.get(i.unidad_id)} onIngresar={() => ingresarEsperada(i)} />
          ))}
          {resultados.vehiculos.map((v) => (
            <PanelF key={v.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex-1">
                <EtiquetaF>Vehículo de residente</EtiquetaF>
                <p className="text-xl font-semibold">
                  <Patente valor={v.patente} /> <span className="ml-1">{[v.marca, v.modelo, v.color].filter(Boolean).join(' ')}</span>
                </p>
                <p className="text-white/60">Casa {nombreUnidad(unidadPorId.get(v.unidad_id))}</p>
              </div>
              <BotonF
                variant="secundario"
                onClick={() =>
                  onEntrada({ tipo: 'residente', autorizacion: 'residente', patente: v.patente, unidad_id: v.unidad_id, nombre: `Residente ${nombreUnidad(unidadPorId.get(v.unidad_id))}` })
                }
              >
                Anotar ingreso
              </BotonF>
            </PanelF>
          ))}
          {resultados.unidades.map((u) => (
            <FichaUnidad key={u.id} unidad={u} onEntrada={onEntrada} />
          ))}
          {resultados.residentes.map((r) => (
            <PanelF key={r.id} className="p-4">
              <EtiquetaF>Residente</EtiquetaF>
              <p className="text-xl font-semibold">{r.nombre}</p>
              <p className="text-white/60">
                Casa {nombreUnidad(unidadPorId.get(r.unidad_id))} {r.rut && `· ${mostrarRut(r.rut)}`}{' '}
                {r.telefono && (
                  <a className="underline" href={`tel:${r.telefono}`}>
                    · ☎ {r.telefono}
                  </a>
                )}
              </p>
            </PanelF>
          ))}
          {sinResultados && (
            <PanelF className="p-5 text-center">
              <p className="text-lg">Sin coincidencias para “{q}”.</p>
              <BotonF
                variant="claro"
                className="mt-3"
                onClick={() =>
                  onEntrada({
                    tipo: 'visita',
                    ...(qPat.length >= 5 && /\d/.test(qPat) && /[A-Z]/.test(qPat) ? { patente: qPat } : /^\d{6,}/.test(qRut) ? { rut: q } : { nombre: q }),
                  })
                }
              >
                Registrar como visita nueva
              </BotonF>
            </PanelF>
          )}
        </div>
      )}

      {!resultados && !codigo && (
        <div>
          <h3 className="mb-2 font-faenacond text-xl font-bold uppercase tracking-wide text-white/70">Visitas esperadas hoy ({esperadas.length})</h3>
          {esperadas.length === 0 ? (
            <PanelF className="p-6 text-center text-white/50">Ningún residente ha avisado visitas para hoy.</PanelF>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {esperadas.map((i) => (
                <TarjetaEsperada key={i.id} i={i} unidad={unidadPorId.get(i.unidad_id)} onIngresar={() => ingresarEsperada(i)} />
              ))}
            </div>
          )}
        </div>
      )}

      <EscanerQR open={escanear} onClose={() => setEscanear(false)} onLeido={alLeerQR} />
    </div>
  );
}

function TarjetaEsperada({ i, unidad, onIngresar }) {
  return (
    <PanelF className="flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <EtiquetaF>
          {TIPOS_ACCESO[i.tipo]} · casa {nombreUnidad(unidad)}
          {i.frecuencia === 'frecuente' && ` · frecuente hasta ${fechaCorta(i.hasta)}`}
        </EtiquetaF>
        <p className="truncate text-xl font-semibold">{i.nombre}</p>
        <p className="flex flex-wrap items-center gap-2 text-white/60">
          <Patente valor={i.patente} />
          {i.rut && <span>{mostrarRut(i.rut)}</span>}
          {i.notas && <span className="truncate">“{i.notas}”</span>}
        </p>
      </div>
      <BotonF variant="verde" onClick={onIngresar}>
        Ingresar
      </BotonF>
    </PanelF>
  );
}

function ResultadoCodigo({ estado, onIngresar }) {
  if (estado.cargando) return <PanelF className="p-5 text-center text-white/60">Validando {estado.codigo}…</PanelF>;
  if (estado.error) return <PanelF className="border-peligro p-5 text-[#FF9EA2]">{estado.error}</PanelF>;
  const r = estado.resultado;
  if (!r)
    return (
      <div className="border-4 border-peligro bg-peligro/15 p-5">
        <p className="font-faenacond text-2xl font-bold uppercase">✕ Código no existe</p>
        <p className="text-white/70">“{estado.codigo}” no corresponde a ninguna invitación de este condominio. Llama al residente para confirmar.</p>
      </div>
    );
  return (
    <div className={`border-4 p-5 ${r.valida ? 'border-[#2F7D4F] bg-[#2F7D4F]/20' : 'border-[#E07A1F] bg-[#E07A1F]/15'}`}>
      <p className={`font-faenacond text-2xl font-bold uppercase ${r.valida ? 'text-[#8FE0AE]' : 'text-[#FFB27A]'}`}>
        {r.valida ? '✓ Invitación válida' : `✕ ${r.motivo}`}
      </p>
      <p className="mt-1 text-2xl font-semibold">{r.nombre}</p>
      <p className="flex flex-wrap items-center gap-2 text-white/70">
        {TIPOS_ACCESO[r.tipo]} → casa <b className="text-white">{r.unidad}</b>
        <Patente valor={r.patente} />
        {r.rut && <span>{mostrarRut(r.rut)}</span>}
      </p>
      {r.notas && <p className="mt-1 text-white/70">Nota del residente: “{r.notas}”</p>}
      {r.valida && (
        <BotonF variant="verde" grande className="mt-4 w-full sm:w-auto" onClick={() => onIngresar(r)}>
          Registrar entrada
        </BotonF>
      )}
    </div>
  );
}

function FichaUnidad({ unidad, onEntrada }) {
  const { residentes, vehiculos, estacionamientos } = useCondominio();
  const gente = residentes.filter((r) => r.unidad_id === unidad.id && r.activo);
  const autos = vehiculos.filter((v) => v.unidad_id === unidad.id);
  const propios = estacionamientos.filter((e) => e.unidad_id === unidad.id);
  return (
    <PanelF className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <EtiquetaF>Casa</EtiquetaF>
          <p className="font-faenacond text-3xl font-bold">Casa {nombreUnidad(unidad)}</p>
          {unidad.notas && <p className="text-white/60">{unidad.notas}</p>}
        </div>
        <BotonF variant="secundario" onClick={() => onEntrada({ tipo: 'visita', unidad_id: unidad.id })}>
          + Visita a este casa
        </BotonF>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {unidad.telefono && (
          <a href={`tel:${unidad.telefono}`} className="inline-flex min-h-[44px] items-center border border-white/30 px-3 hover:bg-white/10">
            ☎ {unidad.telefono}
          </a>
        )}
        {gente.map((r) => (
          <span key={r.id} className="inline-flex min-h-[44px] items-center border border-white/15 px-3">
            {r.nombre}
            {r.telefono && (
              <a href={`tel:${r.telefono}`} className="ml-2 underline">
                ☎ {r.telefono}
              </a>
            )}
          </span>
        ))}
        {gente.length === 0 && <span className="text-white/50">Sin residentes registrados.</span>}
      </div>
      {(autos.length > 0 || propios.length > 0) && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-white/60">
          {autos.map((v) => (
            <Patente key={v.id} valor={v.patente} />
          ))}
          {propios.length > 0 && <span>Estacionamiento: {propios.map((e) => e.codigo).join(', ')}</span>}
        </p>
      )}
    </PanelF>
  );
}

// ---------------------------------------------------------------------------
// Adentro: quién está en el condominio ahora.
// ---------------------------------------------------------------------------
function Adentro({ lista, onSalida, ahora, maxMin }) {
  const { unidadPorId, estPorId } = useCondominio();
  const [filtro, setFiltro] = useState('');
  const [confirmar, setConfirmar] = useState(null);
  const f = filtro.trim().toLowerCase();
  const fPat = normalizarPatente(filtro);
  const visibles = f
    ? lista.filter(
        (a) =>
          a.nombre.toLowerCase().includes(f) ||
          (fPat.length >= 2 && a.patente.includes(fPat)) ||
          nombreUnidad(unidadPorId.get(a.unidad_id)).toLowerCase().includes(f),
      )
    : lista;
  return (
    <div className="space-y-3">
      <InputF value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por nombre, patente o casa" />
      {visibles.length === 0 && <PanelF className="p-6 text-center text-white/50">{lista.length ? 'Sin coincidencias.' : 'No hay nadie registrado adentro.'}</PanelF>}
      {visibles.map((a) => {
        const min = minutosDesde(a.entrada_en, ahora);
        const excedido = a.estacionamiento_id && min > maxMin;
        const est = estPorId.get(a.estacionamiento_id);
        return (
          <PanelF key={a.id} className={`flex flex-wrap items-center gap-3 p-4 ${excedido ? 'border-[#E07A1F]' : ''}`}>
            <div className="min-w-0 flex-1">
              <EtiquetaF>
                {TIPOS_ACCESO[a.tipo]} · entró {hora(a.entrada_en)} · hace {duracion(min)}
              </EtiquetaF>
              <p className="truncate text-xl font-semibold">{a.nombre || '(sin nombre)'}</p>
              <p className="flex flex-wrap items-center gap-2 text-white/60">
                {a.unidad_id && <span>→ casa {nombreUnidad(unidadPorId.get(a.unidad_id))}</span>}
                <Patente valor={a.patente} />
                {est && (
                  <span className={`px-2 font-faenacond font-bold ${excedido ? 'bg-[#E07A1F] text-white' : 'bg-white/10'}`}>
                    Estac. {est.codigo}
                    {excedido && ' · tiempo excedido'}
                  </span>
                )}
                {a.acompanantes > 0 && <span>+{a.acompanantes} acomp.</span>}
              </p>
            </div>
            <BotonF variant="claro" grande onClick={() => setConfirmar(a)}>
              Salida
            </BotonF>
          </PanelF>
        );
      })}
      <Modal open={Boolean(confirmar)} onClose={() => setConfirmar(null)} title="Confirmar salida" oscuro>
        {confirmar && (
          <div className="space-y-4 font-faena">
            <p className="text-xl">
              ¿Registrar la salida de <b>{confirmar.nombre || '(sin nombre)'}</b>
              {confirmar.patente && (
                <>
                  {' '}
                  <Patente valor={confirmar.patente} />
                </>
              )}
              ?
            </p>
            <div className="flex gap-2">
              <BotonF variant="secundario" className="flex-1" onClick={() => setConfirmar(null)}>
                Cancelar
              </BotonF>
              <BotonF
                variant="verde"
                grande
                className="flex-1"
                onClick={() => {
                  onSalida(confirmar);
                  setConfirmar(null);
                }}
              >
                Sí, salió
              </BotonF>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mapa de estacionamientos: libres, ocupados y con tiempo excedido.
// ---------------------------------------------------------------------------
function MapaEstacionamientos({ estacionamientos, ocupados, ahora, maxMin, onSalida, onEntrada }) {
  const { unidadPorId } = useCondominio();
  const [elegido, setElegido] = useState(null);
  const deVisita = estacionamientos.filter((e) => e.activo && e.tipo !== 'residente');
  const propios = estacionamientos.filter((e) => e.activo && e.tipo === 'residente');
  if (estacionamientos.length === 0)
    return <PanelF className="p-6 text-center text-white/50">Administración aún no ha cargado los estacionamientos.</PanelF>;

  const acceso = elegido && ocupados.get(elegido.id);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-4 text-sm text-white/70">
        <span><i className="mr-1 inline-block h-3 w-3 bg-[#2F7D4F] align-middle" /> Libre</span>
        <span><i className="mr-1 inline-block h-3 w-3 bg-white/25 align-middle" /> Ocupado</span>
        <span><i className="mr-1 inline-block h-3 w-3 bg-[#E07A1F] align-middle" /> Más de {duracion(maxMin)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
        {deVisita.map((e) => {
          const a = ocupados.get(e.id);
          const min = a ? minutosDesde(a.entrada_en, ahora) : 0;
          const exc = a && min > maxMin;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setElegido(e)}
              className={`flex min-h-[104px] flex-col items-start justify-between border-2 p-2 text-left ${
                !a ? 'border-[#2F7D4F] bg-[#2F7D4F]/25 hover:bg-[#2F7D4F]/40' : exc ? 'border-[#E07A1F] bg-[#E07A1F]/30' : 'border-white/25 bg-white/10'
              }`}
            >
              <span className="font-faenacond text-2xl font-bold leading-none">
                {e.codigo}
                {e.tipo === 'discapacitado' && ' ♿'}
              </span>
              {a ? (
                <span className="w-full">
                  <Patente valor={a.patente} className="text-[12px]" />
                  <span className="mt-1 block truncate text-xs text-white/80">{a.nombre}</span>
                  <span className={`block text-xs font-bold ${exc ? 'text-white' : 'text-white/60'}`}>{duracion(min)}</span>
                </span>
              ) : (
                <span className="font-faenacond text-sm font-semibold uppercase text-[#8FE0AE]">Libre</span>
              )}
            </button>
          );
        })}
      </div>
      {propios.length > 0 && (
        <details className="text-white/70">
          <summary className="cursor-pointer font-faenacond text-lg font-bold uppercase">Estacionamientos de residentes ({propios.length})</summary>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {propios.map((e) => (
              <div key={e.id} className="border border-white/15 p-2 text-sm">
                <b className="font-faenacond text-lg">{e.codigo}</b>
                <span className="block text-white/60">{e.unidad_id ? `Casa ${nombreUnidad(unidadPorId.get(e.unidad_id))}` : 'Sin asignar'}</span>
              </div>
            ))}
          </div>
        </details>
      )}
      <Modal open={Boolean(elegido)} onClose={() => setElegido(null)} title={`Estacionamiento ${elegido?.codigo || ''}`} oscuro>
        {elegido && (
          <div className="space-y-4 font-faena">
            {elegido.ubicacion && <p className="text-white/60">{elegido.ubicacion}</p>}
            {acceso ? (
              <>
                <p className="text-xl">
                  Ocupado por <b>{acceso.nombre}</b> <Patente valor={acceso.patente} />
                </p>
                <p className="text-white/70">
                  Entró a las {hora(acceso.entrada_en)} (hace {duracion(minutosDesde(acceso.entrada_en, ahora))})
                  {acceso.unidad_id && ` · visita al casa ${nombreUnidad(unidadPorId.get(acceso.unidad_id))}`}
                </p>
                <BotonF
                  variant="verde"
                  grande
                  className="w-full"
                  onClick={() => {
                    onSalida(acceso);
                    setElegido(null);
                  }}
                >
                  Registrar salida y liberar
                </BotonF>
              </>
            ) : (
              <>
                <p className="text-xl text-[#8FE0AE]">Libre</p>
                <BotonF
                  variant="primario"
                  grande
                  className="w-full"
                  onClick={() => {
                    onEntrada({ tipo: 'visita', estacionamiento_id: elegido.id });
                    setElegido(null);
                  }}
                >
                  Registrar visita aquí
                </BotonF>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
