import { useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, Field, Input, Modal, Select, Titulo, Vacio, useAvisar } from '../../components/ui.jsx';
import { useCondominio } from '../../lib/CondominioContext.jsx';
import { mensajeError, supabase } from '../../lib/supabase.js';
import { exportarExcel, leerExcel } from '../../lib/exportarExcel.js';
import { compararUnidades, mostrarPatente, mostrarRut, nombreUnidad, normalizarPatente, rutValido } from '../../lib/formato.js';

// Unidades con sus residentes y vehículos. Carga masiva por rango o desde Excel.
export default function Unidades() {
  const { unidades, residentes, vehiculos, condominioId, activo } = useCondominio();
  const avisar = useAvisar();
  const [buscar, setBuscar] = useState('');
  const [ficha, setFicha] = useState(null); // id de unidad o 'nueva'
  const [rango, setRango] = useState(false);
  const [importar, setImportar] = useState(false);

  const lista = useMemo(() => {
    const b = buscar.trim().toLowerCase();
    const bp = normalizarPatente(buscar);
    return [...unidades].sort(compararUnidades).filter((u) => {
      if (!b) return true;
      if (nombreUnidad(u).toLowerCase().includes(b)) return true;
      if (residentes.some((r) => r.unidad_id === u.id && (r.nombre.toLowerCase().includes(b) || r.rut.toLowerCase().includes(b)))) return true;
      return bp.length >= 3 && vehiculos.some((v) => v.unidad_id === u.id && v.patente.includes(bp));
    });
  }, [unidades, residentes, vehiculos, buscar]);

  async function exportar() {
    const filas = [];
    for (const u of [...unidades].sort(compararUnidades)) {
      const gente = residentes.filter((r) => r.unidad_id === u.id);
      const autos = vehiculos.filter((v) => v.unidad_id === u.id).map((v) => v.patente).join(', ');
      if (gente.length === 0) filas.push({ Casa: u.numero, Pasaje: u.torre, 'Teléfono casa': u.telefono, Nombre: '', RUT: '', Teléfono: '', Email: '', Tipo: '', Patentes: autos });
      gente.forEach((r, i) =>
        filas.push({ Casa: u.numero, Pasaje: u.torre, 'Teléfono casa': u.telefono, Nombre: r.nombre, RUT: mostrarRut(r.rut), Teléfono: r.telefono, Email: r.email, Tipo: r.tipo, Patentes: i === 0 ? autos : '' }),
      );
    }
    await exportarExcel(`casas_${activo?.nombre || 'condominio'}.xlsx`, [{ nombre: 'Casas', filas }]);
  }

  return (
    <div>
      <Titulo
        sub={`${unidades.length} casas · ${residentes.length} residentes · ${vehiculos.length} vehículos`}
        accion={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setFicha('nueva')}>+ Casa</Button>
            <Button variant="secondary" onClick={() => setRango(true)}>
              Crear varias
            </Button>
            <Button variant="secondary" onClick={() => setImportar(true)}>
              Importar Excel
            </Button>
            <Button variant="secondary" onClick={() => exportar().catch((e) => avisar(mensajeError(e), 'rojo'))} disabled={!unidades.length}>
              ⬇ Excel
            </Button>
          </div>
        }
      >
        Casas y residentes
      </Titulo>
      <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar casa, residente, RUT o patente" className="mb-3" />
      {unidades.length === 0 ? (
        <Vacio titulo="Aún no hay casas">Créalas todas de una vez (ej. casas 1 a 61), una a una o importa un Excel.</Vacio>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((u) => {
            const gente = residentes.filter((r) => r.unidad_id === u.id && r.activo);
            const autos = vehiculos.filter((v) => v.unidad_id === u.id);
            return (
              <button key={u.id} type="button" onClick={() => setFicha(u.id)} className="border border-gray-300 bg-white p-3 text-left hover:border-tinta">
                <p className="text-lg font-bold">
                  {nombreUnidad(u)} {u.piso && <span className="text-sm font-normal text-gray-500">· piso {u.piso}</span>}
                </p>
                <p className="truncate text-sm text-gray-600">{gente.length ? gente.map((r) => r.nombre).join(', ') : <span className="text-gray-400">Sin residentes</span>}</p>
                {autos.length > 0 && <p className="mt-1 font-mono text-xs text-gray-500">{autos.map((v) => mostrarPatente(v.patente)).join('  ')}</p>}
              </button>
            );
          })}
        </div>
      )}

      {ficha && <FichaUnidad id={ficha} onClose={() => setFicha(null)} onCreada={(id) => setFicha(id)} />}
      <CrearRango open={rango} onClose={() => setRango(false)} condominioId={condominioId} existentes={unidades} />
      <Importar open={importar} onClose={() => setImportar(false)} />
    </div>
  );
}

function FichaUnidad({ id, onClose, onCreada }) {
  const { condominioId, unidadPorId, residentes, vehiculos, estacionamientos } = useCondominio();
  const avisar = useAvisar();
  const u = id === 'nueva' ? null : unidadPorId.get(id);
  const [f, setF] = useState(() => ({ torre: u?.torre || '', numero: u?.numero || '', piso: u?.piso || '', telefono: u?.telefono || '', notas: u?.notas || '' }));
  const [error, setError] = useState('');
  const [borrar, setBorrar] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    setError('');
    const datos = { ...f, torre: f.torre.trim().toUpperCase(), numero: f.numero.trim() };
    const r = u
      ? await supabase.from('unidades').update(datos).eq('id', u.id).select().single()
      : await supabase.from('unidades').insert({ ...datos, condominio_id: condominioId }).select().single();
    if (r.error) return setError(mensajeError(r.error));
    avisar(u ? 'Casa actualizada' : 'Casa creada');
    if (!u) onCreada(r.data.id);
  }

  async function eliminar() {
    const { error: err } = await supabase.from('unidades').delete().eq('id', u.id);
    if (err) return avisar(mensajeError(err), 'rojo');
    avisar('Casa eliminada');
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={u ? `Casa ${nombreUnidad(u)}` : 'Nueva casa'} wide>
      <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-4">
        <Field label="Casa n°" required>
          <Input value={f.numero} onChange={set('numero')} required autoFocus={!u} />
        </Field>
        <Field label="Pasaje / sector">
          <Input value={f.torre} onChange={set('torre')} placeholder="Opcional" />
        </Field>
        <Field label="Teléfono / citófono" className="sm:col-span-2">
          <Input value={f.telefono} onChange={set('telefono')} inputMode="tel" />
        </Field>
        <Field label="Notas para conserjería" className="sm:col-span-4">
          <Input value={f.notas} onChange={set('notas')} placeholder="Ej: tiene perro, no tocar timbre de noche" />
        </Field>
        {error && <p className="text-sm text-peligro sm:col-span-4">{error}</p>}
        <div className="flex gap-2 sm:col-span-4">
          <Button type="submit">{u ? 'Guardar cambios' : 'Crear casa'}</Button>
          {u && !borrar && (
            <Button variant="ghost" onClick={() => setBorrar(true)}>
              Eliminar casa
            </Button>
          )}
          {u && borrar && (
            <Button variant="danger" onClick={eliminar}>
              Sí, eliminar con sus residentes y vehículos
            </Button>
          )}
        </div>
      </form>

      {u && (
        <>
          <Residentes unidad={u} lista={residentes.filter((r) => r.unidad_id === u.id)} />
          <Vehiculos unidad={u} lista={vehiculos.filter((v) => v.unidad_id === u.id)} />
          {estacionamientos.some((e) => e.unidad_id === u.id) && (
            <p className="mt-4 text-sm text-gray-600">
              Estacionamientos propios:{' '}
              {estacionamientos
                .filter((e) => e.unidad_id === u.id)
                .map((e) => e.codigo)
                .join(', ')}{' '}
              (se asignan en Estacionamientos)
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

function Residentes({ unidad, lista }) {
  const avisar = useAvisar();
  const vacio = { nombre: '', rut: '', telefono: '', email: '', tipo: 'propietario' };
  const [f, setF] = useState(vacio);
  const [editando, setEditando] = useState(null);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    setError('');
    if (f.rut && !rutValido(f.rut)) return setError('RUT inválido.');
    const r = editando
      ? await supabase.from('residentes').update(f).eq('id', editando)
      : await supabase.from('residentes').insert({ ...f, condominio_id: unidad.condominio_id, unidad_id: unidad.id });
    if (r.error) return setError(mensajeError(r.error));
    setF(vacio);
    setEditando(null);
    avisar('Residente guardado');
  }

  async function quitar(r) {
    const { error: err } = await supabase.from('residentes').delete().eq('id', r.id);
    if (err) avisar(mensajeError(err), 'rojo');
  }

  async function alternar(r) {
    const { error: err } = await supabase.from('residentes').update({ activo: !r.activo }).eq('id', r.id);
    if (err) avisar(mensajeError(err), 'rojo');
  }

  return (
    <section className="mt-6">
      <h4 className="mb-2 border-b border-gray-300 pb-1 font-mono text-[11px] uppercase tracking-wide text-gray-500">Residentes</h4>
      {lista.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-2 border-b border-gray-100 py-2 text-sm">
          <span className={`flex-1 ${r.activo ? '' : 'text-gray-400 line-through'}`}>
            <b>{r.nombre}</b> <Badge>{r.tipo}</Badge>
            <span className="block text-gray-500">{[mostrarRut(r.rut), r.telefono, r.email].filter(Boolean).join(' · ')}</span>
          </span>
          <Button
            variant="ghost"
            onClick={() => {
              setEditando(r.id);
              setF({ nombre: r.nombre, rut: mostrarRut(r.rut), telefono: r.telefono, email: r.email, tipo: r.tipo });
            }}
          >
            Editar
          </Button>
          <Button variant="ghost" onClick={() => alternar(r)}>
            {r.activo ? 'Desactivar' : 'Activar'}
          </Button>
          <Button variant="ghost" onClick={() => quitar(r)}>
            Quitar
          </Button>
        </div>
      ))}
      <form onSubmit={guardar} className="mt-2 grid gap-2 sm:grid-cols-6">
        <Input className="sm:col-span-2" value={f.nombre} onChange={set('nombre')} placeholder="Nombre *" required />
        <Input value={f.rut} onChange={set('rut')} placeholder="RUT" />
        <Input value={f.telefono} onChange={set('telefono')} placeholder="Teléfono" inputMode="tel" />
        <Select value={f.tipo} onChange={set('tipo')}>
          <option value="propietario">Propietario</option>
          <option value="arrendatario">Arrendatario</option>
          <option value="familiar">Familiar</option>
          <option value="otro">Otro</option>
        </Select>
        <Button type="submit" variant="secondary">
          {editando ? 'Guardar' : '+ Agregar'}
        </Button>
        <Input className="sm:col-span-3" value={f.email} onChange={set('email')} placeholder="Email (opcional)" type="email" />
        {editando && (
          <Button variant="ghost" onClick={() => { setEditando(null); setF(vacio); }}>
            Cancelar edición
          </Button>
        )}
      </form>
      {error && <p className="mt-1 text-sm text-peligro">{error}</p>}
    </section>
  );
}

function Vehiculos({ unidad, lista }) {
  const avisar = useAvisar();
  const vacio = { patente: '', marca: '', modelo: '', color: '' };
  const [f, setF] = useState(vacio);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function guardar(e) {
    e.preventDefault();
    setError('');
    const { error: err } = await supabase.from('vehiculos').insert({ ...f, patente: normalizarPatente(f.patente), condominio_id: unidad.condominio_id, unidad_id: unidad.id });
    if (err) return setError(mensajeError(err));
    setF(vacio);
    avisar('Vehículo agregado');
  }

  return (
    <section className="mt-6">
      <h4 className="mb-2 border-b border-gray-300 pb-1 font-mono text-[11px] uppercase tracking-wide text-gray-500">Vehículos</h4>
      {lista.map((v) => (
        <div key={v.id} className="flex items-center gap-2 border-b border-gray-100 py-2 text-sm">
          <span className="flex-1">
            <b className="font-mono">{mostrarPatente(v.patente)}</b> {[v.marca, v.modelo, v.color].filter(Boolean).join(' ')}
          </span>
          <Button
            variant="ghost"
            onClick={async () => {
              const { error: err } = await supabase.from('vehiculos').delete().eq('id', v.id);
              if (err) avisar(mensajeError(err), 'rojo');
            }}
          >
            Quitar
          </Button>
        </div>
      ))}
      <form onSubmit={guardar} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Input value={f.patente} onChange={(e) => setF((x) => ({ ...x, patente: normalizarPatente(e.target.value).slice(0, 8) }))} placeholder="Patente *" required className="font-mono uppercase" />
        <Input value={f.marca} onChange={set('marca')} placeholder="Marca" />
        <Input value={f.modelo} onChange={set('modelo')} placeholder="Modelo" />
        <Input value={f.color} onChange={set('color')} placeholder="Color" />
        <Button type="submit" variant="secondary">
          + Agregar
        </Button>
      </form>
      {error && <p className="mt-1 text-sm text-peligro">{error}</p>}
    </section>
  );
}

function CrearRango({ open, onClose, condominioId, existentes }) {
  const avisar = useAvisar();
  const [f, setF] = useState({ torre: '', desde: 1, hasta: 61 });
  const [enviando, setEnviando] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const nuevas = useMemo(() => {
    const r = [];
    const desde = Number(f.desde);
    const hasta = Number(f.hasta);
    if (!(desde >= 1 && hasta >= desde && hasta - desde < 2000)) return r;
    for (let n = desde; n <= hasta; n++) r.push({ torre: f.torre.trim().toUpperCase(), numero: String(n) });
    return r;
  }, [f]);
  const ya = new Set(existentes.map((u) => `${u.torre}|${u.numero}`));
  const aCrear = nuevas.filter((u) => !ya.has(`${u.torre}|${u.numero}`));

  async function crear() {
    setEnviando(true);
    const { error } = await supabase.from('unidades').insert(aCrear.map((u) => ({ ...u, condominio_id: condominioId })));
    setEnviando(false);
    if (error) return avisar(mensajeError(error), 'rojo');
    avisar(`${aCrear.length} casas creadas`);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Crear varias casas">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Desde casa n°">
          <Input type="number" min="1" value={f.desde} onChange={set('desde')} />
        </Field>
        <Field label="Hasta casa n°">
          <Input type="number" min="1" value={f.hasta} onChange={set('hasta')} />
        </Field>
        <Field label="Pasaje / sector" hint="Opcional">
          <Input value={f.torre} onChange={set('torre')} />
        </Field>
      </div>
      <p className="mt-3 text-sm text-gray-600">
        Se crearán <b>{aCrear.length}</b> casas
        {nuevas.length > 0 && `: ${nuevas.slice(0, 4).map(nombreUnidad).join(', ')}${nuevas.length > 4 ? ` … ${nombreUnidad(nuevas[nuevas.length - 1])}` : ''}`}
        {nuevas.length !== aCrear.length && ` (${nuevas.length - aCrear.length} ya existen y se omiten)`}.
      </p>
      <div className="mt-4 flex gap-2">
        <Button onClick={crear} disabled={!aCrear.length || enviando}>
          {enviando ? 'Creando…' : `Crear ${aCrear.length}`}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </Modal>
  );
}

// Importa unidades, residentes y patentes desde un Excel con las mismas columnas que exporta.
function Importar({ open, onClose }) {
  const { condominioId, unidades, residentes, vehiculos } = useCondominio();
  const avisar = useAvisar();
  const archivo = useRef(null);
  const [filas, setFilas] = useState(null);
  const [progreso, setProgreso] = useState('');
  const [errores, setErrores] = useState([]);

  const campo = (f, ...nombres) => {
    for (const n of nombres) {
      const k = Object.keys(f).find((x) => x.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === n);
      if (k && String(f[k]).trim()) return String(f[k]).trim();
    }
    return '';
  };

  async function leer(e) {
    const a = e.target.files?.[0];
    if (!a) return;
    try {
      const datos = await leerExcel(a);
      setFilas(
        datos
          .map((f) => ({
            torre: campo(f, 'pasaje', 'sector', 'torre', 'block').toUpperCase(),
            numero: campo(f, 'numero', 'casa', 'depto', 'departamento', 'unidad'),
            piso: campo(f, 'piso'),
            telefonoUnidad: campo(f, 'telefono casa', 'telefono unidad', 'citofono'),
            nombre: campo(f, 'nombre', 'residente'),
            rut: campo(f, 'rut'),
            telefono: campo(f, 'telefono', 'celular'),
            email: campo(f, 'email', 'correo'),
            tipo: ['propietario', 'arrendatario', 'familiar', 'otro'].includes(campo(f, 'tipo').toLowerCase()) ? campo(f, 'tipo').toLowerCase() : 'propietario',
            patentes: campo(f, 'patentes', 'patente').split(/[,;\s]+/).map(normalizarPatente).filter((p) => p.length >= 4),
          }))
          .filter((f) => f.numero),
      );
      setErrores([]);
    } catch (err) {
      avisar(`No se pudo leer el archivo: ${mensajeError(err)}`, 'rojo');
    }
  }

  async function importar() {
    const errs = [];
    const mapa = new Map(unidades.map((u) => [`${u.torre}|${u.numero}`, u.id]));
    // 1. Unidades que faltan
    const faltan = [];
    for (const f of filas) {
      const k = `${f.torre}|${f.numero}`;
      if (!mapa.has(k) && !faltan.some((x) => `${x.torre}|${x.numero}` === k))
        faltan.push({ condominio_id: condominioId, torre: f.torre, numero: f.numero, piso: f.piso, telefono: f.telefonoUnidad });
    }
    setProgreso(`Creando ${faltan.length} casas…`);
    for (let i = 0; i < faltan.length; i += 200) {
      const { data, error } = await supabase.from('unidades').insert(faltan.slice(i, i + 200)).select('id, torre, numero');
      if (error) errs.push(`Unidades: ${mensajeError(error)}`);
      (data || []).forEach((u) => mapa.set(`${u.torre}|${u.numero}`, u.id));
    }
    // 2. Residentes (se omiten los que ya existen con el mismo nombre en la unidad)
    const nuevosRes = [];
    for (const f of filas) {
      const uid = mapa.get(`${f.torre}|${f.numero}`);
      if (!uid || !f.nombre) continue;
      if (residentes.some((r) => r.unidad_id === uid && r.nombre.toLowerCase() === f.nombre.toLowerCase())) continue;
      if (f.rut && !rutValido(f.rut)) errs.push(`${f.numero} · ${f.nombre}: RUT inválido (${f.rut}), se carga sin RUT`);
      nuevosRes.push({ condominio_id: condominioId, unidad_id: uid, nombre: f.nombre, rut: f.rut && rutValido(f.rut) ? f.rut : '', telefono: f.telefono, email: f.email, tipo: f.tipo });
    }
    setProgreso(`Creando ${nuevosRes.length} residentes…`);
    for (let i = 0; i < nuevosRes.length; i += 200) {
      const { error } = await supabase.from('residentes').insert(nuevosRes.slice(i, i + 200));
      if (error) errs.push(`Residentes: ${mensajeError(error)}`);
    }
    // 3. Vehículos (uno a uno: una patente repetida no debe frenar el resto)
    const yaPat = new Set(vehiculos.map((v) => v.patente));
    let nAutos = 0;
    for (const f of filas) {
      const uid = mapa.get(`${f.torre}|${f.numero}`);
      for (const p of f.patentes) {
        if (!uid || yaPat.has(p)) continue;
        yaPat.add(p);
        setProgreso(`Agregando patente ${p}…`);
        const { error } = await supabase.from('vehiculos').insert({ condominio_id: condominioId, unidad_id: uid, patente: p });
        if (error) errs.push(`Patente ${p}: ${mensajeError(error)}`);
        else nAutos++;
      }
    }
    setProgreso('');
    setErrores(errs);
    avisar(`Importación lista: ${faltan.length} casas, ${nuevosRes.length} residentes, ${nAutos} vehículos`);
    if (!errs.length) {
      setFilas(null);
      onClose();
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Importar desde Excel" wide>
      <p className="text-sm text-gray-600">
        Columnas reconocidas: <b>Casa, Pasaje, Teléfono casa, Nombre, RUT, Teléfono, Email, Tipo, Patentes</b>. Una fila por residente; solo <b>Casa</b> es obligatoria.
        Lo que ya existe no se duplica. Tip: exporta primero el Excel para usarlo como plantilla.
      </p>
      <input ref={archivo} type="file" accept=".xlsx,.xls,.csv" onChange={leer} className="mt-3 block text-sm" />
      {filas && (
        <>
          <p className="mt-3 text-sm">
            <b>{filas.length}</b> filas leídas. Primeras: {filas.slice(0, 3).map((f) => `${nombreUnidad(f)} ${f.nombre}`).join(' · ')}
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={importar} disabled={Boolean(progreso)}>
              {progreso || 'Importar'}
            </Button>
          </div>
        </>
      )}
      {errores.length > 0 && (
        <Card className="mt-3 max-h-48 overflow-y-auto border-[#B07A1E] p-3 text-sm">
          <b>Avisos ({errores.length}):</b>
          {errores.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </Card>
      )}
    </Modal>
  );
}
