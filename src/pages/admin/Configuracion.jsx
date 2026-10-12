import { useEffect, useState } from 'react';
import { Badge, Button, Card, Field, Input, Modal, Select, SelectorUnidad, Titulo, Vacio, useAvisar } from '../../components/ui.jsx';
import { useCondominio } from '../../lib/CondominioContext.jsx';
import { mensajeError, supabase } from '../../lib/supabase.js';
import { fechaHora, mostrarPatente, mostrarRut, nombreUnidad, normalizarPatente, rutValido } from '../../lib/formato.js';

const TIPOS_EST = { visita: 'Visita', discapacitado: 'Visita discapacitados', residente: 'Residente (propio)', carga: 'Carga / descarga' };

// ---------------------------------------------------------------------------
// Estacionamientos
// ---------------------------------------------------------------------------
export function Estacionamientos() {
  const { estacionamientos, condominioId, unidades, unidadPorId } = useCondominio();
  const avisar = useAvisar();
  const [editar, setEditar] = useState(null);
  const [varios, setVarios] = useState({ prefijo: 'V', desde: 1, hasta: 10, tipo: 'visita' });

  async function crearVarios() {
    const ya = new Set(estacionamientos.map((e) => e.codigo));
    const filas = [];
    for (let n = Number(varios.desde); n <= Number(varios.hasta) && filas.length < 500; n++) {
      const codigo = `${varios.prefijo}${n}`;
      if (!ya.has(codigo)) filas.push({ condominio_id: condominioId, codigo, tipo: varios.tipo });
    }
    if (!filas.length) return avisar('Esos códigos ya existen', 'ambar');
    const { error } = await supabase.from('estacionamientos').insert(filas);
    if (error) return avisar(mensajeError(error), 'rojo');
    avisar(`${filas.length} estacionamientos creados`);
  }

  const grupos = Object.keys(TIPOS_EST).map((t) => [t, estacionamientos.filter((e) => e.tipo === t)]).filter(([, l]) => l.length);

  return (
    <div>
      <Titulo sub="Los de visita se asignan en portería y, si el condominio tiene tiempo máximo, avisan cuando una visita lo excede." accion={<Button onClick={() => setEditar({})}>+ Estacionamiento</Button>}>
        Estacionamientos
      </Titulo>
      <Card className="mb-4 p-4">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-gray-500">Crear varios</p>
        <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-5">
          <Field label="Prefijo">
            <Input value={varios.prefijo} onChange={(e) => setVarios((v) => ({ ...v, prefijo: e.target.value.toUpperCase() }))} />
          </Field>
          <Field label="Desde">
            <Input type="number" value={varios.desde} onChange={(e) => setVarios((v) => ({ ...v, desde: e.target.value }))} />
          </Field>
          <Field label="Hasta">
            <Input type="number" value={varios.hasta} onChange={(e) => setVarios((v) => ({ ...v, hasta: e.target.value }))} />
          </Field>
          <Field label="Tipo">
            <Select value={varios.tipo} onChange={(e) => setVarios((v) => ({ ...v, tipo: e.target.value }))}>
              {Object.entries(TIPOS_EST).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="secondary" onClick={crearVarios}>
            Crear {varios.prefijo}
            {varios.desde}…{varios.prefijo}
            {varios.hasta}
          </Button>
        </div>
      </Card>
      {estacionamientos.length === 0 && <Vacio titulo="Sin estacionamientos" />}
      {grupos.map(([t, lista]) => (
        <section key={t} className="mb-4">
          <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wide text-gray-500">
            {TIPOS_EST[t]} ({lista.length})
          </h3>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {lista.map((e) => (
              <button key={e.id} type="button" onClick={() => setEditar(e)} className={`border bg-white p-2 text-left hover:border-tinta ${e.activo ? 'border-gray-300' : 'border-dashed border-gray-300 opacity-50'}`}>
                <b className="text-lg">{e.codigo}</b>
                <span className="block truncate text-xs text-gray-500">{e.unidad_id ? `Casa ${nombreUnidad(unidadPorId.get(e.unidad_id))}` : e.ubicacion || (e.activo ? '' : 'Inactivo')}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {editar && <EditarEstacionamiento e={editar} onClose={() => setEditar(null)} condominioId={condominioId} unidades={unidades} />}
    </div>
  );
}

function EditarEstacionamiento({ e, onClose, condominioId, unidades }) {
  const avisar = useAvisar();
  const [f, setF] = useState({ codigo: e.codigo || '', tipo: e.tipo || 'visita', unidad_id: e.unidad_id || null, ubicacion: e.ubicacion || '', activo: e.activo ?? true });
  const [error, setError] = useState('');
  async function guardar(ev) {
    ev.preventDefault();
    const datos = { ...f, codigo: f.codigo.trim().toUpperCase(), unidad_id: f.tipo === 'residente' ? f.unidad_id : null };
    const r = e.id ? await supabase.from('estacionamientos').update(datos).eq('id', e.id) : await supabase.from('estacionamientos').insert({ ...datos, condominio_id: condominioId });
    if (r.error) return setError(mensajeError(r.error));
    avisar('Guardado');
    onClose();
  }
  async function eliminar() {
    const { error: err } = await supabase.from('estacionamientos').delete().eq('id', e.id);
    if (err) return setError(mensajeError(err));
    onClose();
  }
  return (
    <Modal open onClose={onClose} title={e.id ? `Estacionamiento ${e.codigo}` : 'Nuevo estacionamiento'}>
      <form onSubmit={guardar} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Código" required>
            <Input value={f.codigo} onChange={(x) => setF((y) => ({ ...y, codigo: x.target.value }))} required />
          </Field>
          <Field label="Tipo">
            <Select value={f.tipo} onChange={(x) => setF((y) => ({ ...y, tipo: x.target.value }))}>
              {Object.entries(TIPOS_EST).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {f.tipo === 'residente' && (
          <Field label="Casa dueña">
            <SelectorUnidad unidades={unidades} valor={f.unidad_id} onChange={(v) => setF((y) => ({ ...y, unidad_id: v }))} />
          </Field>
        )}
        <Field label="Ubicación">
          <Input value={f.ubicacion} onChange={(x) => setF((y) => ({ ...y, ubicacion: x.target.value }))} placeholder="Ej: subterráneo -1, junto al ascensor" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.activo} onChange={(x) => setF((y) => ({ ...y, activo: x.target.checked }))} className="h-5 w-5" /> Activo (desmarcar si está en reparación o clausurado)
        </label>
        {error && <p className="text-sm text-peligro">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit">Guardar</Button>
          {e.id && (
            <Button variant="ghost" onClick={eliminar}>
              Eliminar
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Lista negra
// ---------------------------------------------------------------------------
export function ListaNegra() {
  const { listaNegra, condominioId } = useCondominio();
  const avisar = useAvisar();
  const vacio = { nombre: '', rut: '', patente: '', motivo: '' };
  const [f, setF] = useState(vacio);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function agregar(e) {
    e.preventDefault();
    setError('');
    if (!f.rut && !f.patente && !f.nombre) return setError('Indica al menos RUT, patente o nombre.');
    if (f.rut && !rutValido(f.rut)) return setError('RUT inválido.');
    const { error: err } = await supabase.from('lista_negra').insert({ ...f, patente: normalizarPatente(f.patente), condominio_id: condominioId });
    if (err) return setError(mensajeError(err));
    setF(vacio);
    avisar('Agregado a la lista negra. Portería verá la alerta al instante.');
  }

  return (
    <div>
      <Titulo sub="Personas o vehículos con prohibición de ingreso. Portería ve una alerta y no puede registrarlos; solo un administrador puede autorizar una excepción, que queda anotada.">
        Lista negra
      </Titulo>
      <Card className="mb-4 p-4">
        <form onSubmit={agregar} className="grid gap-2 sm:grid-cols-4">
          <Input value={f.nombre} onChange={set('nombre')} placeholder="Nombre completo" />
          <Input value={f.rut} onChange={set('rut')} placeholder="RUT" />
          <Input value={f.patente} onChange={(e) => setF((x) => ({ ...x, patente: normalizarPatente(e.target.value).slice(0, 8) }))} placeholder="Patente" className="font-mono uppercase" />
          <Input value={f.motivo} onChange={set('motivo')} placeholder="Motivo *" required />
          {error && <p className="text-sm text-peligro sm:col-span-3">{error}</p>}
          <Button type="submit" className="sm:col-start-4">
            + Agregar
          </Button>
        </form>
      </Card>
      {listaNegra.length === 0 ? (
        <Vacio titulo="La lista negra está vacía" />
      ) : (
        <Card className="divide-y divide-gray-100">
          {listaNegra.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <div className="flex-1">
                <b>{l.nombre || '(sin nombre)'}</b> {l.rut && <span className="text-gray-500">· {mostrarRut(l.rut)}</span>}{' '}
                {l.patente && <Badge tono="tinta">{mostrarPatente(l.patente)}</Badge>}
                <span className="block text-gray-600">{l.motivo}</span>
                <span className="block text-xs text-gray-400">
                  Agregado por {l.creado_por_usuario} el {fechaHora(l.creado_en)}
                </span>
              </div>
              <Button
                variant="ghost"
                onClick={async () => {
                  const { error: err } = await supabase.from('lista_negra').delete().eq('id', l.id);
                  if (err) avisar(mensajeError(err), 'rojo');
                  else avisar('Quitado de la lista negra');
                }}
              >
                Quitar
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Datos del condominio (uno solo: Las Palmas; no se crean ni eliminan condominios)
// ---------------------------------------------------------------------------
export function DatosCondominio() {
  const { activo, recargarCondominios } = useCondominio();
  const avisar = useAvisar();
  const [f, setF] = useState(null);
  useEffect(() => {
    if (activo) setF({ nombre: activo.nombre, direccion: activo.direccion, comuna: activo.comuna, telefono_conserjeria: activo.telefono_conserjeria, max_minutos_estacionamiento: activo.max_minutos_estacionamiento ?? '' });
  }, [activo]);

  async function guardar(e) {
    e.preventDefault();
    const { error } = await supabase.from('condominios').update({ ...f, max_minutos_estacionamiento: f.max_minutos_estacionamiento === '' ? null : Number(f.max_minutos_estacionamiento) }).eq('id', activo.id);
    if (error) return avisar(mensajeError(error), 'rojo');
    avisar('Datos guardados');
    recargarCondominios();
  }

  return (
    <div className="space-y-6">
      <Titulo>Condominio</Titulo>
      {activo && f && (
        <Card className="p-4">
          <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" required>
              <Input value={f.nombre} onChange={(e) => setF((x) => ({ ...x, nombre: e.target.value }))} required />
            </Field>
            <Field label="Teléfono de conserjería" hint="Lo ven los residentes en su portal">
              <Input value={f.telefono_conserjeria} onChange={(e) => setF((x) => ({ ...x, telefono_conserjeria: e.target.value }))} inputMode="tel" />
            </Field>
            <Field label="Dirección" hint="Va en el mensaje del pase de visita">
              <Input value={f.direccion} onChange={(e) => setF((x) => ({ ...x, direccion: e.target.value }))} />
            </Field>
            <Field label="Comuna">
              <Input value={f.comuna} onChange={(e) => setF((x) => ({ ...x, comuna: e.target.value }))} />
            </Field>
            <Field label="Tiempo máximo de visita en estacionamiento (minutos)" hint="Vacío = sin límite. Al pasarlo, portería lo ve en naranja">
              <Input type="number" min="15" max="2880" placeholder="Sin límite" value={f.max_minutos_estacionamiento} onChange={(e) => setF((x) => ({ ...x, max_minutos_estacionamiento: e.target.value }))} />
            </Field>
            <div className="flex items-end">
              <Button type="submit">Guardar</Button>
            </div>
          </form>
        </Card>
      )}

    </div>
  );
}
