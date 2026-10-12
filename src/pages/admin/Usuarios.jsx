import { useMemo, useState } from 'react';
import { Badge, Button, Card, Field, Input, Modal, Pestanas, Select, SelectorUnidad, Titulo, Vacio, useAvisar } from '../../components/ui.jsx';
import { useCondominio } from '../../lib/CondominioContext.jsx';
import { useConsulta } from '../../lib/useConsulta.js';
import { gestionarUsuario, supabase, usuarioDeCasa } from '../../lib/supabase.js';
import { exportarExcel } from '../../lib/exportarExcel.js';
import { compararUnidades, nombreUnidad } from '../../lib/formato.js';

const ROLES = { residente: 'Residente', conserje: 'Conserje', admin: 'Administrador', superusuario: 'Súper usuario' };
const TONO_ROL = { residente: 'azul', conserje: 'verde', admin: 'rojo', superusuario: 'tinta' };

// Clave inicial fácil de dictar: sin letras ni números que se confundan.
function claveAleatoria() {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  const r = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(r, (n) => a[n % a.length]).join('');
}

export default function Usuarios({ perfil, esSuper }) {
  const { condominioId, condominios, unidades, unidadPorId, activo } = useCondominio();
  const avisar = useAvisar();
  const [vista, setVista] = useState('personal');
  const [editar, setEditar] = useState(null);
  const [masivo, setMasivo] = useState(false);

  const perfiles = useConsulta(null, () => supabase.from('perfiles').select('id, usuario, nombre, rol, unidad_id, compartida, nombre_turno').order('usuario'), [perfil.id]);
  const asignaciones = useConsulta(null, () => supabase.from('condominio_usuarios').select('*'), [perfil.id]);
  const recargar = () => {
    perfiles.recargar();
    asignaciones.recargar();
  };

  const condDe = useMemo(() => {
    const m = new Map();
    for (const a of asignaciones.datos || []) m.set(a.usuario_id, [...(m.get(a.usuario_id) || []), a.condominio_id]);
    return m;
  }, [asignaciones.datos]);

  const todos = perfiles.datos || [];
  const personal = todos.filter((p) => p.rol !== 'residente' && (p.rol === 'superusuario' || (condDe.get(p.id) || []).includes(condominioId)));
  const residentes = todos
    .filter((p) => p.rol === 'residente' && unidadPorId.has(p.unidad_id))
    .sort((a, b) => compararUnidades(unidadPorId.get(a.unidad_id), unidadPorId.get(b.unidad_id)));
  // La cuenta de la casa es "casa33"; si la casa solo tiene cuentas personales, igual le falta la suya.
  const sinCuenta = unidades.filter((u) => !residentes.some((p) => p.usuario === usuarioDeCasa(u))).sort(compararUnidades);
  const lista = vista === 'personal' ? personal : residentes;

  return (
    <div>
      <Titulo
        sub={`Cuentas de ${activo?.nombre}. Los usuarios entran con usuario + clave (sin correo).`}
        accion={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setEditar({ rol: vista === 'personal' ? 'conserje' : 'residente' })}>+ Usuario</Button>
            <Button variant="secondary" onClick={() => setMasivo(true)} disabled={!sinCuenta.length}>
              {sinCuenta.length === 1 ? `Cuenta para la casa ${nombreUnidad(sinCuenta[0])}` : `Cuentas para ${sinCuenta.length} casas sin cuenta`}
            </Button>
          </div>
        }
      >
        Usuarios
      </Titulo>
      <Pestanas
        className="mb-4"
        valor={vista}
        onChange={setVista}
        opciones={[
          { id: 'personal', label: `Personal (${personal.length})` },
          { id: 'residentes', label: `Casas (${residentes.length})` },
        ]}
      />
      {lista.length === 0 ? (
        <Vacio titulo="Sin usuarios aquí todavía" />
      ) : (
        <Card className="divide-y divide-gray-100">
          {lista.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {p.usuario} <Badge tono={TONO_ROL[p.rol]}>{ROLES[p.rol]}</Badge> {p.id === perfil.id && <Badge>Tú</Badge>} {p.rol === 'conserje' && p.compartida && <Badge tono="ambar">Compartida</Badge>}
                </p>
                <p className="text-sm text-gray-500">
                  {p.nombre}
                  {p.rol === 'conserje' && p.compartida && (p.nombre_turno ? ` · de turno: ${p.nombre_turno}` : ' · pide nombre al entrar')}
                  {p.rol === 'residente' && ` · casa ${nombreUnidad(unidadPorId.get(p.unidad_id))}`}
                  {p.rol !== 'residente' && p.rol !== 'superusuario' && condDe.get(p.id)?.length > 1 && ` · ${condDe.get(p.id).length} condominios`}
                </p>
              </div>
              {p.id !== perfil.id && (p.rol !== 'admin' || esSuper) && p.rol !== 'superusuario' && (
                <Button variant="secondary" onClick={() => setEditar({ ...p, condominios: condDe.get(p.id) || [] })}>
                  Editar
                </Button>
              )}
            </div>
          ))}
        </Card>
      )}

      {editar && (
        <EditarUsuario
          u={editar}
          esSuper={esSuper}
          condominios={condominios}
          condominioId={condominioId}
          unidades={unidades}
          onClose={(ok) => {
            setEditar(null);
            if (ok) recargar();
          }}
          avisar={avisar}
        />
      )}
      <CuentasMasivas
        open={masivo}
        unidades={sinCuenta}
        onClose={() => {
          setMasivo(false);
          recargar();
        }}
      />
    </div>
  );
}

function EditarUsuario({ u, esSuper, condominios, condominioId, unidades, onClose, avisar }) {
  const nuevo = !u.id;
  const [f, setF] = useState({
    usuario: u.usuario || '',
    nombre: u.nombre || '',
    rol: u.rol || 'conserje',
    unidad_id: u.unidad_id || null,
    condominios: u.condominios?.length ? u.condominios : [condominioId],
    clave: nuevo ? claveAleatoria() : '',
    compartida: Boolean(u.compartida),
  });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const roles = esSuper ? ['residente', 'conserje', 'admin'] : ['residente', 'conserje'];

  async function guardar(e) {
    e.preventDefault();
    setEnviando(true);
    setError('');
    const cuerpo = {
      accion: nuevo ? 'crear' : 'actualizar',
      id: u.id,
      nombre: f.nombre,
      rol: f.rol,
      unidad_id: f.rol === 'residente' ? f.unidad_id : null,
      condominios: f.rol === 'residente' ? [] : f.condominios,
      ...(nuevo ? { usuario: f.usuario } : {}),
      ...(f.clave ? { clave: f.clave } : {}),
    };
    let err = await gestionarUsuario(cuerpo);
    // Cuenta compartida (part-time): se marca aparte, ya creada la cuenta.
    const compartida = f.rol === 'conserje' && f.compartida;
    if (!err && f.rol === 'conserje' && compartida !== Boolean(u.compartida)) {
      const { data } = await supabase.from('perfiles').select('id').eq('usuario', f.usuario).single();
      const r = data ? await supabase.rpc('marcar_compartida', { p_usuario: data.id, p_compartida: compartida }) : { error: { message: 'No se encontró el usuario' } };
      if (r.error) err = `Guardado, pero no se pudo marcar como compartida: ${r.error.message}`;
    }
    setEnviando(false);
    if (err) return setError(err);
    avisar(nuevo ? `Usuario ${f.usuario} creado` : 'Usuario actualizado');
    onClose(true);
  }

  async function eliminar() {
    const err = await gestionarUsuario({ accion: 'eliminar', id: u.id });
    if (err) return setError(err);
    avisar('Usuario eliminado');
    onClose(true);
  }

  return (
    <Modal open onClose={() => onClose(false)} title={nuevo ? 'Nuevo usuario' : `Editar ${u.usuario}`}>
      <form onSubmit={guardar} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Usuario" required hint={nuevo ? 'minúsculas, sin espacios' : ''}>
            <Input value={f.usuario} disabled={!nuevo} onChange={(e) => setF((x) => ({ ...x, usuario: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }))} required autoCapitalize="none" />
          </Field>
          <Field label="Rol">
            <Select value={f.rol} onChange={(e) => setF((x) => ({ ...x, rol: e.target.value }))}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLES[r]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Nombre">
          <Input value={f.nombre} onChange={(e) => setF((x) => ({ ...x, nombre: e.target.value }))} />
        </Field>
        {f.rol === 'residente' ? (
          <Field label="Casa" required>
            <SelectorUnidad unidades={unidades} valor={f.unidad_id} onChange={(v) => setF((x) => ({ ...x, unidad_id: v }))} requerido />
          </Field>
        ) : (
          <Field label="Condominios donde trabaja">
            <div className="space-y-1">
              {condominios.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={f.condominios.includes(c.id)}
                    onChange={(e) => setF((x) => ({ ...x, condominios: e.target.checked ? [...x.condominios, c.id] : x.condominios.filter((y) => y !== c.id) }))}
                  />
                  {c.nombre}
                </label>
              ))}
            </div>
          </Field>
        )}
        {f.rol === 'conserje' && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={f.compartida} onChange={(e) => setF((x) => ({ ...x, compartida: e.target.checked }))} className="mt-0.5 h-5 w-5" />
            <span>
              <b>Cuenta compartida</b> (ej. part-time): al entrar pide el nombre de quien está de turno, y ese nombre queda en cada registro.
            </span>
          </label>
        )}
        <Field label={nuevo ? 'Clave inicial' : 'Nueva clave (vacío = no cambiar)'} hint="Mínimo 8 caracteres. Anótala y entrégasela; después la puede cambiar en «Mi cuenta».">
          <div className="flex gap-2">
            <Input value={f.clave} onChange={(e) => setF((x) => ({ ...x, clave: e.target.value }))} className="font-mono" autoComplete="new-password" required={nuevo} minLength={8} />
            <Button variant="secondary" onClick={() => setF((x) => ({ ...x, clave: claveAleatoria() }))}>
              Generar
            </Button>
          </div>
        </Field>
        {error && <p className="text-sm text-peligro">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar'}
          </Button>
          {!nuevo && !borrar && (
            <Button variant="ghost" onClick={() => setBorrar(true)}>
              Eliminar usuario
            </Button>
          )}
          {!nuevo && borrar && (
            <Button variant="danger" onClick={eliminar}>
              Sí, eliminar {u.usuario}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

// Crea una cuenta por cada casa sin cuenta (usuario "casa33") y entrega un Excel con las claves
// para repartir. Cada casa entra a la app Mi Casa con su número y su clave.
function CuentasMasivas({ open, unidades, onClose }) {
  const [progreso, setProgreso] = useState(null);
  const [resultado, setResultado] = useState(null);

  async function crear() {
    const filas = [];
    for (let i = 0; i < unidades.length; i++) {
      const u = unidades[i];
      setProgreso(`${i + 1} de ${unidades.length}…`);
      const usuario = usuarioDeCasa(u);
      const clave = claveAleatoria();
      const err = await gestionarUsuario({ accion: 'crear', usuario, clave, nombre: `Casa ${nombreUnidad(u)}`, rol: 'residente', unidad_id: u.id });
      filas.push({ Casa: nombreUnidad(u), 'Entra con casa n°': nombreUnidad(u), Clave: err ? '' : clave, Estado: err || 'Creada' });
    }
    setProgreso(null);
    setResultado(filas);
    await exportarExcel('claves_mi_casa.xlsx', [{ nombre: 'Claves Mi Casa', filas }]);
  }

  return (
    <Modal open={open} onClose={progreso ? undefined : onClose} title="Cuentas para residentes">
      {!resultado ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Se creará una cuenta para cada una de las <b>{unidades.length}</b> casas sin cuenta, con clave al azar. Cada casa entra a la app <b>Mi Casa</b> con su
            número y su clave. Al terminar se descarga un Excel con las claves para entregar a cada casa (guárdalo en un lugar seguro).
          </p>
          <Button onClick={crear} disabled={Boolean(progreso)}>
            {progreso ? `Creando ${progreso}` : `Crear ${unidades.length} cuentas`}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p>
            Listo: <b>{resultado.filter((r) => r.Estado === 'Creada').length}</b> cuentas creadas. Se descargó el Excel con las claves.
          </p>
          {resultado.some((r) => r.Estado !== 'Creada') && (
            <Card className="max-h-40 overflow-y-auto p-2 text-sm">
              {resultado
                .filter((r) => r.Estado !== 'Creada')
                .map((r) => (
                  <p key={r.Casa}>
                    Casa {r.Casa}: {r.Estado}
                  </p>
                ))}
            </Card>
          )}
          <Button
            onClick={() => {
              setResultado(null);
              onClose();
            }}
          >
            Cerrar
          </Button>
        </div>
      )}
    </Modal>
  );
}
