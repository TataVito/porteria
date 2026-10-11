import { useMemo, useState } from 'react';
import { Badge, Button, Card, Cargando, Field, Input, Pestanas, Select, Titulo, Vacio, useAvisar } from '../../components/ui.jsx';
import { useCondominio } from '../../lib/CondominioContext.jsx';
import { useConsulta } from '../../lib/useConsulta.js';
import { mensajeError, supabase } from '../../lib/supabase.js';
import { exportarExcel } from '../../lib/exportarExcel.js';
import {
  AUTORIZACIONES, TIPOS_ACCESO, duracion, fechaHora, hoyISO, inicioDelDia, minutosDesde, mostrarPatente, mostrarRut, nombreUnidad,
  normalizarPatente, sumarDias,
} from '../../lib/formato.js';
import { TIPOS_BITACORA } from '../porteria/Bitacora.jsx';

// Historial: accesos, encomiendas, invitaciones y bitácora por rango de fechas, con Excel.
export default function Registro() {
  const [vista, setVista] = useState('accesos');
  const hoy = hoyISO();
  const [desde, setDesde] = useState(sumarDias(hoy, -6));
  const [hasta, setHasta] = useState(hoy);
  return (
    <div>
      <Titulo sub="Todo lo registrado en portería, con filtros y exportación a Excel.">Historial</Titulo>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Desde">
          <Input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <Input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
        </Field>
        <div className="flex gap-1">
          {[
            ['Hoy', 0],
            ['7 días', 6],
            ['30 días', 29],
          ].map(([t, n]) => (
            <Button key={t} variant="secondary" onClick={() => { setDesde(sumarDias(hoy, -n)); setHasta(hoy); }}>
              {t}
            </Button>
          ))}
        </div>
      </div>
      <Pestanas
        className="mb-4"
        valor={vista}
        onChange={setVista}
        opciones={[
          { id: 'accesos', label: 'Accesos' },
          { id: 'encomiendas', label: 'Encomiendas' },
          { id: 'invitaciones', label: 'Invitaciones' },
          { id: 'bitacora', label: 'Bitácora' },
        ]}
      />
      {vista === 'accesos' && <Accesos desde={desde} hasta={hasta} />}
      {vista === 'encomiendas' && <EncomiendasHist desde={desde} hasta={hasta} />}
      {vista === 'invitaciones' && <InvitacionesHist desde={desde} hasta={hasta} />}
      {vista === 'bitacora' && <BitacoraHist desde={desde} hasta={hasta} />}
    </div>
  );
}

const rango = (q, campo, desde, hasta) => q.gte(campo, inicioDelDia(desde)).lt(campo, inicioDelDia(sumarDias(hasta, 1)));

function Accesos({ desde, hasta }) {
  const { condominioId, unidades, unidadPorId, estPorId } = useCondominio();
  const avisar = useAvisar();
  const [tipo, setTipo] = useState('');
  const [unidad, setUnidad] = useState('');
  const [buscar, setBuscar] = useState('');
  const { datos, cargando, error } = useConsulta(
    null,
    () => rango(supabase.from('accesos').select('*').eq('condominio_id', condominioId), 'entrada_en', desde, hasta).order('entrada_en', { ascending: false }).limit(10000),
    [condominioId, desde, hasta],
    { condominioId, tablas: ['accesos'] },
  );
  const filas = useMemo(() => {
    const b = buscar.trim().toLowerCase();
    const bp = normalizarPatente(buscar);
    return (datos || []).filter(
      (a) =>
        (!tipo || a.tipo === tipo) &&
        (!unidad || a.unidad_id === unidad) &&
        (!b || a.nombre.toLowerCase().includes(b) || (bp.length >= 2 && a.patente.includes(bp)) || a.rut.toLowerCase().includes(b)),
    );
  }, [datos, tipo, unidad, buscar]);

  async function excel() {
    try {
      await exportarExcel(`accesos_${desde}_${hasta}.xlsx`, [
        {
          nombre: 'Accesos',
          filas: filas.map((a) => ({
            Entrada: fechaHora(a.entrada_en),
            Salida: fechaHora(a.salida_en),
            Permanencia: a.salida_en ? duracion(minutosDesde(a.entrada_en, new Date(a.salida_en).getTime())) : 'Adentro',
            Tipo: TIPOS_ACCESO[a.tipo],
            Nombre: a.nombre,
            RUT: mostrarRut(a.rut),
            Patente: a.patente,
            Unidad: nombreUnidad(unidadPorId.get(a.unidad_id)),
            Estacionamiento: estPorId.get(a.estacionamiento_id)?.codigo || '',
            Autorización: AUTORIZACIONES[a.autorizacion],
            Acompañantes: a.acompanantes,
            Observaciones: a.observaciones,
            'Registró entrada': a.registrado_por_usuario,
            'Registró salida': a.salida_por_usuario,
          })),
        },
      ]);
    } catch (e) {
      avisar(mensajeError(e), 'rojo');
    }
  }

  return (
    <div>
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_180px_160px_auto]">
        <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar nombre, RUT o patente" />
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_ACCESO).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select value={unidad} onChange={(e) => setUnidad(e.target.value)}>
          <option value="">Todas las casas</option>
          {[...unidades]
            .sort((a, b) => nombreUnidad(a).localeCompare(nombreUnidad(b), 'es', { numeric: true }))
            .map((u) => (
              <option key={u.id} value={u.id}>
                {nombreUnidad(u)}
              </option>
            ))}
        </Select>
        <Button variant="dark" onClick={excel} disabled={!filas.length}>
          ⬇ Excel ({filas.length})
        </Button>
      </div>
      {error && <p className="mb-2 text-sm text-peligro">{mensajeError(error)}</p>}
      {cargando && !datos ? (
        <Cargando />
      ) : filas.length === 0 ? (
        <Vacio titulo="Sin registros en este período" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-tinta text-left font-mono text-[11px] uppercase tracking-wide text-white">
              <tr>
                <th className="px-3 py-2">Entrada</th>
                <th className="px-3 py-2">Salida</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Casa</th>
                <th className="px-3 py-2">Patente</th>
                <th className="px-3 py-2">Autorización</th>
                <th className="px-3 py-2">Conserje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.slice(0, 1000).map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{fechaHora(a.entrada_en)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{a.salida_en ? fechaHora(a.salida_en) : <Badge tono="verde">Adentro</Badge>}</td>
                  <td className="px-3 py-2">
                    <b>{a.nombre}</b>
                    {a.rut && <span className="block text-xs text-gray-500">{mostrarRut(a.rut)}</span>}
                    {a.observaciones && <span className="block text-xs text-gray-500">{a.observaciones}</span>}
                  </td>
                  <td className="px-3 py-2">{TIPOS_ACCESO[a.tipo]}</td>
                  <td className="px-3 py-2">{nombreUnidad(unidadPorId.get(a.unidad_id))}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {mostrarPatente(a.patente)}
                    {a.estacionamiento_id && <span className="block text-gray-500">Est. {estPorId.get(a.estacionamiento_id)?.codigo}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tono={a.autorizacion === 'invitacion' ? 'azul' : a.autorizacion === 'admin' ? 'rojo' : 'gris'}>{AUTORIZACIONES[a.autorizacion]}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{a.registrado_por_usuario}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filas.length > 1000 && <p className="p-3 text-center text-sm text-gray-500">Se muestran 1.000 de {filas.length}. El Excel incluye todos.</p>}
        </Card>
      )}
    </div>
  );
}

function EncomiendasHist({ desde, hasta }) {
  const { condominioId, unidadPorId } = useCondominio();
  const { datos, cargando } = useConsulta(
    null,
    () => rango(supabase.from('encomiendas').select('*').eq('condominio_id', condominioId), 'recibida_en', desde, hasta).order('recibida_en', { ascending: false }).limit(5000),
    [condominioId, desde, hasta],
    { condominioId, tablas: ['encomiendas'] },
  );
  const filas = datos || [];
  const exportar = () =>
    exportarExcel(`encomiendas_${desde}_${hasta}.xlsx`, [
      {
        nombre: 'Encomiendas',
        filas: filas.map((e) => ({
          Recibida: fechaHora(e.recibida_en),
          Unidad: nombreUnidad(unidadPorId.get(e.unidad_id)),
          Empresa: e.empresa,
          Descripción: e.descripcion,
          Destinatario: e.destinatario,
          'Recibió (conserje)': e.recibida_por_usuario,
          Retirada: fechaHora(e.retirada_en),
          'Retiró': e.retirada_por,
          'Entregó (conserje)': e.entregada_por_usuario,
        })),
      },
    ]);
  if (cargando && !datos) return <Cargando />;
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button variant="dark" onClick={exportar} disabled={!filas.length}>
          ⬇ Excel ({filas.length})
        </Button>
      </div>
      {filas.length === 0 ? (
        <Vacio titulo="Sin encomiendas en este período" />
      ) : (
        <Card className="divide-y divide-gray-100">
          {filas.map((e) => (
            <div key={e.id} className="flex flex-wrap gap-x-4 px-3 py-2 text-sm">
              <span className="w-32 font-mono text-xs text-gray-500">{fechaHora(e.recibida_en)}</span>
              <b className="w-16">{nombreUnidad(unidadPorId.get(e.unidad_id))}</b>
              <span className="flex-1">
                {e.empresa} {e.descripcion && `· ${e.descripcion}`}
              </span>
              {e.retirada_en ? <span className="text-gray-500">Retiró {e.retirada_por} · {fechaHora(e.retirada_en)}</span> : <Badge tono="rojo">Pendiente</Badge>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function InvitacionesHist({ desde, hasta }) {
  const { condominioId, unidadPorId } = useCondominio();
  const { datos, cargando } = useConsulta(
    null,
    () => supabase.from('invitaciones').select('*').eq('condominio_id', condominioId).lte('desde', hasta).gte('hasta', desde).order('desde', { ascending: false }).limit(5000),
    [condominioId, desde, hasta],
    { condominioId, tablas: ['invitaciones'] },
  );
  const filas = datos || [];
  const exportar = () =>
    exportarExcel(`invitaciones_${desde}_${hasta}.xlsx`, [
      {
        nombre: 'Invitaciones',
        filas: filas.map((i) => ({
          Creada: fechaHora(i.creado_en),
          'Creada por': i.creado_por_usuario,
          Unidad: nombreUnidad(unidadPorId.get(i.unidad_id)),
          Nombre: i.nombre,
          RUT: mostrarRut(i.rut),
          Patente: i.patente,
          Tipo: TIPOS_ACCESO[i.tipo],
          Desde: i.desde,
          Hasta: i.hasta,
          Frecuencia: i.frecuencia,
          Código: i.codigo,
          Usos: i.usos,
          Estado: i.estado,
        })),
      },
    ]);
  if (cargando && !datos) return <Cargando />;
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button variant="dark" onClick={exportar} disabled={!filas.length}>
          ⬇ Excel ({filas.length})
        </Button>
      </div>
      {filas.length === 0 ? (
        <Vacio titulo="Sin invitaciones en este período" />
      ) : (
        <Card className="divide-y divide-gray-100">
          {filas.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-x-4 px-3 py-2 text-sm">
              <b className="w-16">{nombreUnidad(unidadPorId.get(i.unidad_id))}</b>
              <span className="flex-1">
                {i.nombre} <span className="text-gray-500">· {TIPOS_ACCESO[i.tipo]} · {i.desde === i.hasta ? i.desde : `${i.desde} → ${i.hasta}`}</span>
              </span>
              <span className="font-mono text-xs">{i.codigo}</span>
              <Badge tono={i.estado === 'usada' ? 'verde' : i.estado === 'anulada' ? 'gris' : 'azul'}>{i.estado}</Badge>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function BitacoraHist({ desde, hasta }) {
  const { condominioId } = useCondominio();
  const { datos, cargando } = useConsulta(
    null,
    () => rango(supabase.from('bitacora').select('*').eq('condominio_id', condominioId), 'fecha', desde, hasta).order('fecha', { ascending: false }).limit(5000),
    [condominioId, desde, hasta],
    { condominioId, tablas: ['bitacora'] },
  );
  const filas = datos || [];
  const exportar = () =>
    exportarExcel(`bitacora_${desde}_${hasta}.xlsx`, [
      { nombre: 'Bitácora', filas: filas.map((b) => ({ Fecha: fechaHora(b.fecha), Tipo: TIPOS_BITACORA[b.tipo]?.label, Usuario: b.usuario, Texto: b.texto })) },
    ]);
  if (cargando && !datos) return <Cargando />;
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button variant="dark" onClick={exportar} disabled={!filas.length}>
          ⬇ Excel ({filas.length})
        </Button>
      </div>
      {filas.length === 0 ? (
        <Vacio titulo="Sin anotaciones en este período" />
      ) : (
        <Card className="divide-y divide-gray-100">
          {filas.map((b) => (
            <div key={b.id} className="px-3 py-2 text-sm">
              <span className="font-mono text-xs text-gray-500">{fechaHora(b.fecha)}</span> <Badge tono={b.tipo === 'incidente' ? 'rojo' : 'gris'}>{TIPOS_BITACORA[b.tipo]?.label}</Badge>{' '}
              <span className="text-gray-500">{b.usuario}</span>
              <p className="mt-0.5 whitespace-pre-wrap">{b.texto}</p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
