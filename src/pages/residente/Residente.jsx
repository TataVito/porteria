import { useEffect, useMemo, useRef, useState } from 'react';
import PaseQR from '../../components/PaseQR.jsx';
import { Badge, Button, Card, Cargando, Field, Input, Modal, Pestanas, Select, Vacio, useAvisar } from '../../components/ui.jsx';
import { useCondominio } from '../../lib/CondominioContext.jsx';
import { useConsulta } from '../../lib/useConsulta.js';
import { mensajeError, supabase } from '../../lib/supabase.js';
import {
  TIPOS_ACCESO, diaCorto, duracion, fechaCorta, fechaHora, hora, hoyISO, minutosDesde, mostrarPatente, mostrarRut, nombreUnidad,
  normalizarPatente, rutValido, sumarDias,
} from '../../lib/formato.js';
import { RAIZ } from '../../lib/app.js';

// Portal del residente: invita visitas (pase con QR), ve quién llegó y sus encomiendas, en vivo.
export default function Residente({ perfil }) {
  const { activo, unidadPorId, condominioId } = useCondominio();
  const unidadId = perfil.unidad_id;
  const unidad = unidadPorId.get(unidadId);
  const [vista, setVista] = useState('invitar');
  const avisar = useAvisar();
  const filtro = `unidad_id=eq.${unidadId}`;

  const invitaciones = useConsulta(
    'mis_invitaciones',
    () => supabase.from('invitaciones').select('*').eq('unidad_id', unidadId).order('creado_en', { ascending: false }).limit(200),
    [unidadId],
    { condominioId, tablas: ['invitaciones'], filtro },
  );
  const llegadas = useConsulta(
    'mis_llegadas',
    () => supabase.from('accesos').select('*').eq('unidad_id', unidadId).order('entrada_en', { ascending: false }).limit(100),
    [unidadId],
    { condominioId, tablas: ['accesos'], filtro },
  );
  const encomiendas = useConsulta(
    'mis_encomiendas',
    () => supabase.from('encomiendas').select('*').eq('unidad_id', unidadId).order('recibida_en', { ascending: false }).limit(100),
    [unidadId],
    { condominioId, tablas: ['encomiendas'], filtro },
  );

  // Aviso cuando llega una visita o una encomienda mientras la app está abierta.
  useAvisosEnVivo(llegadas.datos, encomiendas.datos, avisar);

  const pendientes = (encomiendas.datos || []).filter((e) => !e.retirada_en);
  const hoy = hoyISO();
  const activas = (invitaciones.datos || []).filter((i) => i.estado === 'activa' && i.hasta >= hoy);
  const adentro = (llegadas.datos || []).filter((a) => !a.salida_en);

  if (!unidadId || !unidad) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Vacio titulo="Tu usuario no tiene una casa asignada">Pide a la administración que asocie tu cuenta a tu casa.</Vacio>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wide text-gray-500">{activo?.nombre}</p>
          <h2 className="text-2xl font-bold">Casa {nombreUnidad(unidad)}</h2>
        </div>
        {activo?.telefono_conserjeria && (
          <a href={`tel:${activo.telefono_conserjeria}`} className="inline-flex min-h-[40px] items-center border border-tinta px-3 text-sm font-medium hover:bg-tinta/5">
            ☎ Conserjería {activo.telefono_conserjeria}
          </a>
        )}
      </div>

      {pendientes.length > 0 && vista !== 'encomiendas' && (
        <button type="button" onClick={() => setVista('encomiendas')} className="mb-4 flex w-full items-center gap-3 border-2 border-peligro bg-[#FBE6E6] px-4 py-3 text-left">
          <span className="text-2xl">📦</span>
          <span>
            <b>
              Tienes {pendientes.length} encomienda{pendientes.length > 1 ? 's' : ''} en conserjería
            </b>
            <span className="block text-sm text-gray-600">Toca para ver el detalle.</span>
          </span>
        </button>
      )}
      {adentro.length > 0 && (
        <div className="mb-4 border border-[#2F7D4F] bg-[#E3F1E8] px-4 py-3 text-sm text-[#1F5A37]">
          <b>Visitas en el condominio ahora:</b> {adentro.map((a) => `${a.nombre} (desde ${hora(a.entrada_en)})`).join(', ')}
        </div>
      )}

      <Pestanas
        className="mb-5"
        valor={vista}
        onChange={setVista}
        opciones={[
          { id: 'invitar', label: 'Invitar', cuenta: activas.length },
          { id: 'llegadas', label: 'Llegadas' },
          { id: 'encomiendas', label: 'Encomiendas', cuenta: pendientes.length },
          { id: 'unidad', label: 'Mi casa' },
        ]}
      />

      {vista === 'invitar' && (
        <Invitar
          unidad={unidad}
          condominio={activo}
          invitaciones={invitaciones.datos}
          cargando={invitaciones.cargando && !invitaciones.datos}
          recargar={invitaciones.recargar}
        />
      )}
      {vista === 'llegadas' && <Llegadas lista={llegadas.datos} cargando={llegadas.cargando && !llegadas.datos} />}
      {vista === 'encomiendas' && <MisEncomiendas lista={encomiendas.datos} cargando={encomiendas.cargando && !encomiendas.datos} />}
      {vista === 'unidad' && <MiUnidad unidad={unidad} />}
    </div>
  );
}

function useAvisosEnVivo(llegadas, encomiendas, avisar) {
  const vistos = useRef(null);
  useEffect(() => {
    if (!llegadas || !encomiendas) return;
    const ids = new Set([...llegadas.map((a) => a.id), ...encomiendas.map((e) => e.id)]);
    if (vistos.current) {
      const nuevasLlegadas = llegadas.filter((a) => !vistos.current.has(a.id));
      const nuevasEnc = encomiendas.filter((e) => !vistos.current.has(e.id));
      for (const a of nuevasLlegadas) notificar(`Llegó ${a.nombre || 'tu visita'}`, `Ingresó a las ${hora(a.entrada_en)}`, avisar);
      for (const e of nuevasEnc) notificar('Llegó una encomienda', `${e.empresa || 'Paquete'}${e.descripcion ? ` · ${e.descripcion}` : ''}`, avisar);
    }
    vistos.current = ids;
  }, [llegadas, encomiendas, avisar]);
}

function notificar(titulo, cuerpo, avisar) {
  avisar(`${titulo}: ${cuerpo}`, 'azul', 8000);
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      new Notification(titulo, { body: cuerpo, icon: `${RAIZ}icono-192.png` });
    }
  } catch {
    // algunos navegadores móviles solo notifican desde el service worker
  }
}

// ---------------------------------------------------------------------------
function Invitar({ unidad, condominio, invitaciones, cargando, recargar }) {
  const { condominioId } = useCondominio();
  const avisar = useAvisar();
  const hoy = hoyISO();
  const vacio = { nombre: '', rut: '', patente: '', telefono: '', tipo: 'visita', desde: hoy, hasta: hoy, frecuencia: 'unica', notas: '' };
  const [f, setF] = useState(vacio);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [pase, setPase] = useState(null);
  const [verPasadas, setVerPasadas] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function crear(e) {
    e.preventDefault();
    setError('');
    if (f.hasta < f.desde) return setError('La fecha final no puede ser anterior a la inicial.');
    if (f.rut && !rutValido(f.rut)) return setError('El RUT no es válido. Revísalo o déjalo en blanco.');
    setEnviando(true);
    const { data, error: err } = await supabase
      .from('invitaciones')
      .insert({
        ...f,
        nombre: f.nombre.trim(),
        patente: normalizarPatente(f.patente),
        hasta: f.frecuencia === 'unica' && f.hasta === f.desde ? f.desde : f.hasta,
        condominio_id: condominioId,
        unidad_id: unidad.id,
        codigo: '',
      })
      .select()
      .single();
    setEnviando(false);
    if (err) return setError(mensajeError(err));
    setF(vacio);
    setPase(data);
    recargar();
    // Se pide permiso para avisar cuando llegue (solo una vez).
    try {
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    } catch {
      // sin notificaciones
    }
  }

  async function anular(i) {
    const { error: err } = await supabase.from('invitaciones').update({ estado: 'anulada' }).eq('id', i.id);
    if (err) return avisar(mensajeError(err), 'rojo');
    avisar('Invitación anulada: el código ya no sirve.');
    recargar();
  }

  const lista = invitaciones || [];
  const vigentes = lista.filter((i) => i.estado === 'activa' && i.hasta >= hoy);
  const pasadas = lista.filter((i) => !(i.estado === 'activa' && i.hasta >= hoy));

  return (
    <div className="space-y-6">
      <Card className="border-t-4 border-t-marca p-4 sm:p-5">
        <h3 className="mb-3 text-lg font-bold">Nueva invitación</h3>
        <form onSubmit={crear} className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre de la visita" required className="sm:col-span-2">
            <Input value={f.nombre} onChange={set('nombre')} required autoComplete="off" />
          </Field>
          <Field label="Tipo">
            <Select value={f.tipo} onChange={set('tipo')}>
              <option value="visita">Visita</option>
              <option value="servicio">Servicio (nana, gasfíter, profesor…)</option>
              <option value="delivery">Delivery</option>
              <option value="proveedor">Proveedor</option>
            </Select>
          </Field>
          <Field label="Patente" hint="Si viene en auto, para reservarle estacionamiento de visita">
            <Input value={f.patente} onChange={(e) => setF((x) => ({ ...x, patente: normalizarPatente(e.target.value).slice(0, 8) }))} className="font-mono uppercase" />
          </Field>
          <Field label="RUT (opcional)">
            <Input value={f.rut} onChange={set('rut')} onBlur={() => f.rut && rutValido(f.rut) && setF((x) => ({ ...x, rut: mostrarRut(x.rut) }))} />
          </Field>
          <Field label="Frecuencia">
            <Select
              value={f.frecuencia}
              onChange={(e) => {
                const v = e.target.value;
                setF((x) => ({ ...x, frecuencia: v, hasta: v === 'frecuente' && x.hasta === x.desde ? sumarDias(x.desde, 30) : x.hasta }));
              }}
            >
              <option value="unica">Una vez</option>
              <option value="frecuente">Frecuente (puede entrar cada día del período)</option>
            </Select>
          </Field>
          <Field label="Desde" required>
            <Input type="date" value={f.desde} min={hoy} onChange={(e) => setF((x) => ({ ...x, desde: e.target.value, hasta: x.hasta < e.target.value ? e.target.value : x.hasta }))} required />
          </Field>
          <Field label="Hasta" required>
            <Input type="date" value={f.hasta} min={f.desde} max={sumarDias(f.desde, 366)} onChange={set('hasta')} required />
          </Field>
          <Field label="Nota para conserjería (opcional)" className="sm:col-span-2">
            <Input value={f.notas} onChange={set('notas')} placeholder="Ej: llega cerca de las 20:00, viene con mascota" maxLength={200} />
          </Field>
          {error && <p className="text-sm text-peligro sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" className="w-full sm:w-auto" disabled={enviando}>
              {enviando ? 'Creando…' : 'Crear invitación y pase QR'}
            </Button>
          </div>
        </form>
      </Card>

      <section>
        <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wide text-gray-500">Invitaciones vigentes</h3>
        {cargando && <Cargando />}
        {!cargando && vigentes.length === 0 && <Vacio titulo="No tienes invitaciones vigentes">Crea una arriba y envíale el pase a tu visita.</Vacio>}
        <div className="space-y-2">
          {vigentes.map((i) => (
            <FilaInvitacion key={i.id} i={i} onVer={() => setPase(i)} onAnular={() => anular(i)} />
          ))}
        </div>
      </section>

      {pasadas.length > 0 && (
        <section>
          <button type="button" className="font-mono text-[11px] uppercase tracking-wide text-gray-500 underline" onClick={() => setVerPasadas((v) => !v)}>
            {verPasadas ? 'Ocultar' : 'Ver'} anteriores ({pasadas.length})
          </button>
          {verPasadas && (
            <div className="mt-2 space-y-2">
              {pasadas.map((i) => (
                <FilaInvitacion key={i.id} i={i} />
              ))}
            </div>
          )}
        </section>
      )}

      <Modal open={Boolean(pase)} onClose={() => setPase(null)} title="Pase de visita">
        {pase && (
          <>
            <p className="mb-3 text-center text-sm text-gray-600">
              Envíale este pase a <b>{pase.nombre}</b>. En conserjería escanean el QR o le piden el código <b className="font-mono">{pase.codigo}</b>.
            </p>
            <PaseQR invitacion={pase} condominio={condominio} unidad={nombreUnidad(unidad)} />
          </>
        )}
      </Modal>
    </div>
  );
}

function FilaInvitacion({ i, onVer, onAnular }) {
  const [confirmar, setConfirmar] = useState(false);
  const estado =
    i.estado === 'anulada' ? <Badge tono="gris">Anulada</Badge> : i.estado === 'usada' ? <Badge tono="verde">Ingresó</Badge> : i.hasta < hoyISO() ? <Badge tono="gris">Vencida</Badge> : <Badge tono="azul">Vigente</Badge>;
  return (
    <Card className="flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="font-bold">
          {i.nombre} {estado}
        </p>
        <p className="text-sm text-gray-500">
          {TIPOS_ACCESO[i.tipo]} ·{' '}
          {i.desde === i.hasta ? diaCorto(i.desde) : `${fechaCorta(i.desde)} al ${fechaCorta(i.hasta)}`}
          {i.frecuencia === 'frecuente' && ` · frecuente (${i.usos} ingreso${i.usos === 1 ? '' : 's'})`}
          {i.patente && ` · ${mostrarPatente(i.patente)}`}
          {' · '}
          <span className="font-mono">{i.codigo}</span>
        </p>
      </div>
      {onVer && (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onVer}>
            Ver pase
          </Button>
          {confirmar ? (
            <Button variant="danger" onClick={onAnular}>
              ¿Anular?
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmar(true)}>
              Anular
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function Llegadas({ lista, cargando }) {
  if (cargando) return <Cargando />;
  if (!lista?.length) return <Vacio titulo="Aún no hay llegadas registradas">Cuando conserjería registre una visita a tu casa aparecerá aquí al instante.</Vacio>;
  return (
    <div className="space-y-2">
      {lista.map((a) => (
        <Card key={a.id} className="flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="font-bold">
              {a.nombre || '(sin nombre)'} {!a.salida_en && <Badge tono="verde">Adentro</Badge>}
            </p>
            <p className="text-sm text-gray-500">
              {TIPOS_ACCESO[a.tipo]} · entró {fechaHora(a.entrada_en)}
              {a.salida_en && ` · salió ${hora(a.salida_en)} (${duracion(minutosDesde(a.entrada_en, new Date(a.salida_en).getTime()))})`}
              {a.patente && ` · ${mostrarPatente(a.patente)}`}
              {a.acompanantes > 0 && ` · +${a.acompanantes}`}
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}

function MisEncomiendas({ lista, cargando }) {
  if (cargando) return <Cargando />;
  if (!lista?.length) return <Vacio titulo="Sin encomiendas">Cuando llegue un paquete a conserjería te avisamos aquí.</Vacio>;
  return (
    <div className="space-y-2">
      {lista.map((e) => (
        <Card key={e.id} className={`flex items-center gap-3 p-3 ${!e.retirada_en ? 'border-l-4 border-l-peligro' : ''}`}>
          <span className="text-2xl">📦</span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">
              {e.empresa || 'Encomienda'} {!e.retirada_en ? <Badge tono="rojo">Por retirar</Badge> : <Badge tono="gris">Retirada</Badge>}
            </p>
            <p className="text-sm text-gray-500">
              {e.descripcion && `${e.descripcion} · `}
              {e.destinatario && `Para ${e.destinatario} · `}
              Llegó {fechaHora(e.recibida_en)}
              {e.retirada_en && ` · retiró ${e.retirada_por} el ${fechaHora(e.retirada_en)}`}
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}

function MiUnidad({ unidad }) {
  const { residentes, vehiculos, estacionamientos } = useCondominio();
  const gente = useMemo(() => residentes.filter((r) => r.unidad_id === unidad.id), [residentes, unidad.id]);
  const autos = vehiculos.filter((v) => v.unidad_id === unidad.id);
  const propios = estacionamientos.filter((e) => e.unidad_id === unidad.id);
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="mb-2 font-bold">Residentes registrados</h3>
        {gente.length === 0 ? <p className="text-sm text-gray-500">Ninguno.</p> : gente.map((r) => <p key={r.id} className="text-sm">{r.nombre} {r.telefono && <span className="text-gray-500">· {r.telefono}</span>}</p>)}
      </Card>
      <Card className="p-4">
        <h3 className="mb-2 font-bold">Vehículos</h3>
        {autos.length === 0 ? <p className="text-sm text-gray-500">Ninguno.</p> : autos.map((v) => <p key={v.id} className="text-sm"><span className="font-mono">{mostrarPatente(v.patente)}</span> {[v.marca, v.modelo, v.color].filter(Boolean).join(' ')}</p>)}
      </Card>
      <Card className="p-4">
        <h3 className="mb-2 font-bold">Estacionamientos</h3>
        {propios.length === 0 ? <p className="text-sm text-gray-500">Ninguno asignado.</p> : <p className="text-sm">{propios.map((e) => e.codigo).join(', ')}</p>}
      </Card>
      <p className="text-sm text-gray-500">¿Algún dato está mal o falta? Pídele a la administración que lo actualice.</p>
    </div>
  );
}
