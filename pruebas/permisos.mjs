// Pruebas de permisos y reglas de la base, sin nube: ejecuta la migración real en un Postgres
// embebido (PGlite) con una imitación mínima del esquema `auth` de Supabase y revisa qué puede
// y qué no puede hacer cada rol. Uso: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

const db = new PGlite();

// --- Imitación de Supabase -------------------------------------------------
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated;
`);

for (const f of readdirSync(new URL('../supabase/migrations/', import.meta.url)).sort()) {
  const sql = readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8');
  await db.exec(sql);
  // Debe poder ejecutarse dos veces (el SQL Editor a veces se re-ejecuta).
  await db.exec(sql);
}

// --- Ayudas -----------------------------------------------------------------
let ok = 0;
let fallas = 0;
function check(nombre, cond, detalle = '') {
  if (cond) ok++;
  else {
    fallas++;
    console.log(`  ✗ ${nombre} ${detalle}`);
  }
}

async function como(uid, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
const q = async (sql, params) => (await db.query(sql, params)).rows;
async function falla(sql, params) {
  try {
    await db.query(sql, params);
    return null;
  } catch (e) {
    return e.message;
  }
}

async function crearUsuario(usuario, rol, extra = {}) {
  const [{ id }] = await q(`insert into auth.users (email) values ($1) returning id`, [`${usuario}@porteria-rvc.invalid`]);
  await q(`update public.perfiles set rol = $2, unidad_id = $3 where id = $1`, [id, rol, extra.unidad ?? null]);
  for (const c of extra.condominios ?? []) await q(`insert into public.condominio_usuarios values ($1, $2)`, [c, id]);
  return id;
}

// --- Datos base (como dueño de la base) -------------------------------------
const [{ id: c1 }] = await q(`insert into condominios (nombre) values ('Los Aromos') returning id`);
const [{ id: c2 }] = await q(`insert into condominios (nombre) values ('El Roble') returning id`);
const [{ id: u101 }] = await q(`insert into unidades (condominio_id, numero) values ($1, '101') returning id`, [c1]);
const [{ id: u102 }] = await q(`insert into unidades (condominio_id, numero) values ($1, '102') returning id`, [c1]);
const [{ id: u201 }] = await q(`insert into unidades (condominio_id, numero) values ($1, '201') returning id`, [c2]);
const [{ id: e1 }] = await q(`insert into estacionamientos (condominio_id, codigo) values ($1, 'V1') returning id`, [c1]);
const [{ id: e2 }] = await q(`insert into estacionamientos (condominio_id, codigo) values ($1, 'V2') returning id`, [c1]);
const [{ id: e3 }] = await q(`insert into estacionamientos (condominio_id, codigo) values ($1, 'X1') returning id`, [c2]);

const sup = await crearUsuario('victor', 'superusuario');
const adm1 = await crearUsuario('admin.aromos', 'admin', { condominios: [c1] });
const con1 = await crearUsuario('conserje.aromos', 'conserje', { condominios: [c1] });
const con2 = await crearUsuario('conserje.roble', 'conserje', { condominios: [c2] });
const res101 = await crearUsuario('depto101', 'residente', { unidad: u101 });
const res102 = await crearUsuario('depto102', 'residente', { unidad: u102 });
const nuevo = (await q(`insert into auth.users (email) values ('nuevo@porteria-rvc.invalid') returning id`))[0].id;

console.log('Perfiles y alcance');
check('perfil nace como residente sin unidad', (await q(`select rol, unidad_id from perfiles where id=$1`, [nuevo]))[0].rol === 'residente');
await como(null, async () => {
  check('anónimo no ve condominios', (await falla(`select * from condominios`)) !== null);
});
await como(nuevo, async () => {
  check('usuario sin unidad no ve nada', (await q(`select * from condominios`)).length === 0);
});
await como(sup, async () => {
  check('súper ve los 2 condominios', (await q(`select * from condominios`)).length === 2);
});
await como(adm1, async () => {
  check('admin ve solo su condominio', (await q(`select * from condominios`)).length === 1);
  check('admin no crea condominios', (await falla(`insert into condominios (nombre) values ('x')`)) !== null);
  check('admin edita su condominio', (await q(`update condominios set telefono_conserjeria='123' where id=$1 returning id`, [c1])).length === 1);
  check('admin no edita otro condominio', (await q(`update condominios set telefono_conserjeria='123' where id=$1 returning id`, [c2])).length === 0);
  check('admin crea unidad', (await q(`insert into unidades (condominio_id, numero) values ($1, '103') returning id`, [c1])).length === 1);
  check('admin no crea unidad en otro', (await falla(`insert into unidades (condominio_id, numero) values ($1, '999')`, [c2])) !== null);
  check('admin ve perfiles de su gente (admin, conserje, 2 residentes)',
    (await q(`select usuario from perfiles`)).length === 4, JSON.stringify(await q(`select usuario from perfiles`)));
  check('admin no cambia roles', (await falla(`update perfiles set rol='superusuario' where id=$1`, [adm1])) !== null);
});
await como(con1, async () => {
  check('conserje ve unidades de su condominio', (await q(`select * from unidades`)).length === 3);
  check('conserje no crea unidades', (await falla(`insert into unidades (condominio_id, numero) values ($1, '104')`, [c1])) !== null);
  check('conserje no ve perfiles ajenos', (await q(`select * from perfiles`)).length === 1);
});
await como(res101, async () => {
  check('residente ve su condominio', (await q(`select * from condominios`)).length === 1);
  check('residente ve solo su unidad', (await q(`select * from unidades`)).length === 1);
  check('residente no ve lista negra', (await q(`select * from lista_negra`)).length === 0);
});

console.log('Vehículos, residentes, lista negra');
await como(adm1, async () => {
  const [v] = await q(`insert into vehiculos (condominio_id, unidad_id, patente) values ($1, $2, 'ab-cd 12') returning patente`, [c1, u101]);
  check('patente se normaliza', v.patente === 'ABCD12', v.patente);
  const [r] = await q(`insert into residentes (condominio_id, unidad_id, nombre, rut) values ($1, $2, 'Ana', '12.345.678-k') returning rut`, [c1, u101]);
  check('rut se normaliza', r.rut === '12345678-K', r.rut);
  check('unidad de otro condominio rechazada',
    (await falla(`insert into residentes (condominio_id, unidad_id, nombre) values ($1, $2, 'X')`, [c1, u201])) !== null);
  const [l] = await q(`insert into lista_negra (condominio_id, rut, motivo) values ($1, '11.111.111-1', 'Robo') returning creado_por_usuario`, [c1]);
  check('lista negra anota autor', l.creado_por_usuario === 'admin.aromos');
});
await como(res101, async () => {
  check('residente ve sus vehículos', (await q(`select * from vehiculos`)).length === 1);
  check('residente no agrega vehículos', (await falla(`insert into vehiculos (condominio_id, unidad_id, patente) values ($1,$2,'ZZZZ11')`, [c1, u101])) !== null);
});
await como(res102, async () => {
  check('otro residente no ve vehículos ajenos', (await q(`select * from vehiculos`)).length === 0);
  check('otro residente no ve residentes ajenos', (await q(`select * from residentes`)).length === 0);
});

console.log('Invitaciones');
const hoy = (await q(`select (now() at time zone 'America/Santiago')::date::text as d`))[0].d;
let inv;
await como(res101, async () => {
  [inv] = await q(
    `insert into invitaciones (condominio_id, unidad_id, nombre, patente, desde, hasta, codigo, usos, estado)
     values ($1, $2, 'Pedro', 'xx-yy-11', $3, $3, 'AAAAAA', 5, 'usada') returning *`,
    [c1, u101, hoy],
  );
  check('código generado por la base', /^[A-HJ-NP-Z2-9]{6}$/.test(inv.codigo) && inv.codigo !== 'AAAAAA', inv.codigo);
  check('estado y usos no falsificables', inv.estado === 'activa' && inv.usos === 0);
  check('autor anotado', inv.creado_por_usuario === 'depto101');
  check('residente no invita a otra unidad',
    (await falla(`insert into invitaciones (condominio_id, unidad_id, nombre, desde, hasta, codigo) values ($1,$2,'X',$3,$3,'')`, [c1, u102, hoy])) !== null);
  check('residente no cambia el código', (await q(`update invitaciones set codigo='ZZZZZZ' where id=$1 returning codigo`, [inv.id]))[0].codigo === inv.codigo);
});
await como(res102, async () => {
  check('otro residente no ve la invitación', (await q(`select * from invitaciones`)).length === 0);
  check('otro residente no la anula', (await q(`update invitaciones set estado='anulada' where id=$1 returning id`, [inv.id])).length === 0);
  check('residente no valida códigos', (await falla(`select * from validar_codigo($1, $2)`, [c1, inv.codigo])) !== null);
});
await como(con2, async () => {
  check('conserje de otro condominio no valida', (await falla(`select * from validar_codigo($1, $2)`, [c1, inv.codigo])) !== null);
  check('conserje de otro condominio no registra entrada',
    (await falla(`select * from registrar_entrada($1, 'visita', 'X')`, [c1])) !== null);
});

console.log('Portería');
let acc;
await como(con1, async () => {
  const [v] = await q(`select * from validar_codigo($1, $2)`, [c1, inv.codigo.toLowerCase()]);
  check('código válido (minúsculas aceptadas)', v?.valida === true && v.unidad === '101', JSON.stringify(v));
  const [v2] = await q(`select * from validar_codigo($1, $2)`, [c1, 'PRT:' + inv.codigo]);
  check('código desde QR "PRT:"', v2?.valida === true);
  check('código inexistente sin filas', (await q(`select * from validar_codigo($1, 'QQQQQQ')`, [c1])).length === 0);
  check('insert directo a accesos bloqueado',
    (await falla(`insert into accesos (condominio_id, tipo, nombre) values ($1, 'visita', 'X')`, [c1])) !== null);
  [acc] = await q(`select * from registrar_entrada($1, 'visita', 'Pedro', '', 'XXYY11', null, $2, $3)`, [c1, inv.id, e1]);
  check('entrada registrada con unidad de la invitación', acc.unidad_id === u101 && acc.registrado_por_usuario === 'conserje.aromos');
  check('autorización = invitación', acc.autorizacion === 'invitacion');
  const [despues] = await q(`select estado, usos from invitaciones where id=$1`, [inv.id]);
  check('invitación única queda usada', despues.estado === 'usada' && despues.usos === 1);
  check('no se reutiliza', /usada/.test((await falla(`select * from registrar_entrada($1, 'visita', 'Pedro', '', '', null, $2)`, [c1, inv.id])) ?? ''));
  check('estacionamiento ocupado rechazado',
    /ocupado/.test((await falla(`select * from registrar_entrada($1, 'visita', 'Juan', '', '', $2, null, $3, 'telefono')`, [c1, u102, e1])) ?? ''));
  check('estacionamiento de otro condominio rechazado',
    (await falla(`select * from registrar_entrada($1, 'visita', 'Juan', '', '', $2, null, $3, 'telefono')`, [c1, u102, e3])) !== null);
  const [sin] = await q(`select * from registrar_entrada($1, 'delivery', 'Rappi', '', '', $2, null, $3, 'telefono', 0, '', false, now() - interval '30 days')`, [c1, u102, e2]);
  check('autorización por teléfono', sin.autorizacion === 'telefono');
  check('hora de entrada muy vieja se corrige a ahora', Date.now() - new Date(sin.entrada_en).getTime() < 60000);
  const msg = await falla(`select * from registrar_entrada($1, 'visita', 'Malo', '11111111-1', '', $2, null, null, 'telefono')`, [c1, u102]);
  check('lista negra bloquea al conserje', /PROHIBIDO.*Robo/.test(msg ?? ''), msg);
  check('conserje no puede forzar lista negra',
    (await falla(`select * from registrar_entrada($1, 'visita', 'Malo', '11.111.111-1', '', $2, null, null, 'telefono', 0, '', true)`, [c1, u102])) !== null);
  check('lista negra visible para conserje', (await q(`select * from revisar_lista_negra($1, '111111111', '')`, [c1])).length === 1);
  const [sal] = await q(`select * from registrar_salida($1)`, [acc.id]);
  check('salida registrada', sal.salida_en && sal.salida_por_usuario === 'conserje.aromos');
  const [sal2] = await q(`select * from registrar_salida($1, now() - interval '1 day')`, [acc.id]);
  check('salida repetida no cambia la hora', sal2.salida_en === sal.salida_en || +sal2.salida_en === +sal.salida_en);
  check('estacionamiento liberado', (await q(`select * from registrar_entrada($1, 'visita', 'Juan', '', '', $2, null, $3, 'telefono')`, [c1, u102, e1])).length === 1);
  const [mod] = await q(`update accesos set salida_en = now() - interval '5 minutes', entrada_en = now() - interval '9 days', registrado_por_usuario = 'otro' where id=$1 returning *`, [acc.id]);
  check('conserje no reescribe entrada, autor ni salida ya registrada',
    +new Date(mod.entrada_en) === +new Date(acc.entrada_en) && mod.registrado_por_usuario === 'conserje.aromos' && +new Date(mod.salida_en) === +new Date(sal.salida_en));
  check('conserje no borra accesos', (await q(`delete from accesos where id=$1 returning id`, [acc.id])).length === 0);
});
await como(adm1, async () => {
  const [f] = await q(`select * from registrar_entrada($1, 'visita', 'Malo', '11.111.111-1', '', $2, null, null, 'telefono', 0, 'autorizado por directiva', true)`, [c1, u102]);
  check('admin fuerza lista negra y queda anotado', f.autorizacion === 'admin' && /Lista negra forzada/.test(f.observaciones));
});
await como(res101, async () => {
  const filas = await q(`select * from accesos`);
  check('residente ve llegadas a su unidad', filas.length === 1 && filas[0].unidad_id === u101);
  check('residente no registra salidas', (await q(`update accesos set salida_en=now() returning id`)).length === 0);
  check('residente no modifica invitación usada', /ya no se puede/.test((await falla(`update invitaciones set estado='activa' where id=$1`, [inv.id])) ?? ''));
});
await como(res102, async () => {
  check('residente 102 ve sus 3 llegadas', (await q(`select * from accesos`)).length === 3);
});

console.log('Invitación frecuente y vencida');
await como(res102, async () => {
  const [frec] = await q(
    `insert into invitaciones (condominio_id, unidad_id, nombre, desde, hasta, frecuencia, codigo) values ($1,$2,'Nana',$3::date - 1,$3::date + 30,'frecuente','') returning *`,
    [c1, u102, hoy],
  );
  const [venc] = await q(
    `insert into invitaciones (condominio_id, unidad_id, nombre, desde, hasta, codigo) values ($1,$2,'Viejo',$3::date - 5,$3::date - 1,'') returning *`,
    [c1, u102, hoy],
  );
  const [fut] = await q(
    `insert into invitaciones (condominio_id, unidad_id, nombre, desde, hasta, codigo) values ($1,$2,'Futuro',$3::date + 2,$3::date + 2,'') returning *`,
    [c1, u102, hoy],
  );
  const [anul] = await q(`update invitaciones set estado='anulada' where id=$1 returning estado`, [fut.id]);
  check('residente anula su invitación', anul.estado === 'anulada');
  await como(adm1, async () => {
    check('admin no crea invitaciones',
      (await falla(`insert into invitaciones (condominio_id, unidad_id, nombre, desde, hasta, codigo) values ($1,$2,'X',$3,$3,'')`, [c1, u102, hoy])) !== null);
  });
  await como(con1, async () => {
    check('conserje no crea invitaciones',
      (await falla(`insert into invitaciones (condominio_id, unidad_id, nombre, desde, hasta, codigo) values ($1,$2,'X',$3,$3,'')`, [c1, u102, hoy])) !== null);
    await q(`select * from registrar_entrada($1, 'servicio', 'Nana', '', '', null, $2)`, [c1, frec.id]);
    const [f2] = await q(`select * from invitaciones where id=$1`, [frec.id]);
    check('frecuente sigue activa', f2.estado === 'activa' && f2.usos === 1);
    check('frecuente no entra dos veces el mismo día',
      /hoy/.test((await falla(`select * from registrar_entrada($1, 'servicio', 'Nana', '', '', null, $2)`, [c1, frec.id])) ?? ''));
    const [v] = await q(`select * from validar_codigo($1,$2)`, [c1, venc.codigo]);
    check('vencida no válida', v.valida === false && /venció/.test(v.motivo));
    const [a] = await q(`select * from validar_codigo($1,$2)`, [c1, fut.codigo]);
    check('anulada no válida', a.valida === false && /anulada/.test(a.motivo));
  });
});

console.log('Encomiendas y bitácora');
let enc;
await como(con1, async () => {
  [enc] = await q(`insert into encomiendas (condominio_id, unidad_id, empresa, recibida_por_usuario) values ($1,$2,'Chilexpress','falso') returning *`, [c1, u101]);
  check('encomienda anota quién recibió', enc.recibida_por_usuario === 'conserje.aromos');
  const [r] = await q(`update encomiendas set retirada_en = now() - interval '3 days', retirada_por='Ana' where id=$1 returning *`, [enc.id]);
  check('entrega anota hora real y conserje', Date.now() - new Date(r.retirada_en).getTime() < 60000 && r.entregada_por_usuario === 'conserje.aromos');
  const [b] = await q(`insert into bitacora (condominio_id, texto, usuario) values ($1, 'Ronda sin novedad', 'x') returning *`, [c1]);
  check('bitácora anota usuario real', b.usuario === 'conserje.aromos');
  check('bitácora no se edita', (await falla(`update bitacora set texto='y' where id=$1`, [b.id])) !== null);
  check('bitácora no se borra', (await falla(`delete from bitacora where id=$1`, [b.id])) !== null);
});
await como(res101, async () => {
  check('residente ve su encomienda', (await q(`select * from encomiendas`)).length === 1);
  check('residente no marca retiro', (await q(`update encomiendas set retirada_por='yo' returning id`)).length === 0);
  check('residente no ve bitácora', (await q(`select * from bitacora`)).length === 0);
});
await como(con2, async () => {
  check('conserje de otro condominio no ve encomiendas', (await q(`select * from encomiendas`)).length === 0);
  check('ni accesos', (await q(`select * from accesos`)).length === 0);
  check('ni crea encomiendas allá', (await falla(`insert into encomiendas (condominio_id, unidad_id) values ($1,$2)`, [c1, u101])) !== null);
});

console.log('Cuenta compartida (part-time)');
const part = await crearUsuario('parttime', 'conserje', { condominios: [c1] });
await como(con1, async () => {
  check('conserje no marca cuentas compartidas', (await falla(`select marcar_compartida($1, true)`, [part])) !== null);
});
await como(adm1, async () => {
  check('admin marca su conserje como compartida', (await falla(`select marcar_compartida($1, true)`, [part])) === null);
  check('admin no marca a un residente', (await falla(`select marcar_compartida($1, true)`, [res101])) !== null);
  check('admin no marca conserje de otro condominio', (await falla(`select marcar_compartida($1, true)`, [con2])) !== null);
});
await como(con1, async () => {
  check('cuenta no compartida no fija nombre de turno', (await falla(`select fijar_nombre_turno('Juan Pérez')`)) !== null);
});
await como(part, async () => {
  check('nombre de turno muy corto rechazado', (await falla(`select fijar_nombre_turno('J')`)) !== null);
  check('fija nombre de turno', (await falla(`select fijar_nombre_turno('  Juan   Pérez ')`)) === null);
  const [b] = await q(`insert into bitacora (condominio_id, texto) values ($1, 'Turno part-time') returning usuario`, [c1]);
  check('registro anota cuenta + nombre de turno', b.usuario === 'parttime (Juan Pérez)', b.usuario);
  check('no se cambia a sí misma a no compartida', (await falla(`select marcar_compartida($1, false)`, [part])) !== null);
  check('al salir borra el nombre', (await falla(`select fijar_nombre_turno('')`)) === null);
  const [b2] = await q(`insert into bitacora (condominio_id, texto) values ($1, 'Sin nombre') returning usuario`, [c1]);
  check('sin nombre anota solo la cuenta', b2.usuario === 'parttime', b2.usuario);
});

console.log('Auditoría');
await como(adm1, async () => {
  const n = (await q(`select count(*)::int as n from auditoria`))[0].n;
  check('admin ve auditoría de su condominio', n > 5, String(n));
  check('auditoría no se borra', (await falla(`delete from auditoria`)) !== null);
});
await como(con1, async () => {
  check('conserje no ve auditoría', (await q(`select * from auditoria`)).length === 0);
});
await como(sup, async () => {
  check('súper elimina condominio (cascade)', (await q(`delete from condominios where id=$1 returning id`, [c2])).length === 1);
});

console.log(`\n${ok} pruebas OK, ${fallas} fallidas`);
process.exit(fallas ? 1 : 0);
