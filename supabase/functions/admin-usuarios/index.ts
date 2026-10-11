// Gestión de usuarios de Portería Las Palmas. La usan el súper usuario (todo) y el admin de condominio
// (solo conserjes y residentes de sus condominios).
// Usa la service role key (solo existe en el servidor de Supabase, nunca en el navegador).
import { createClient } from 'npm:@supabase/supabase-js@2';

const DOMINIO = 'porteria-rvc.invalid';
const ROLES = ['residente', 'conserje', 'admin', 'superusuario'];
const ROLES_ADMIN = ['residente', 'conserje'];
const UUID_RE = /^[0-9a-f-]{36}$/i;
const USUARIO_RE = /^[a-z0-9._-]{3,30}$/;
const CLAVE_MIN = 8;

const ORIGENES = (Deno.env.get('ORIGENES_PERMITIDOS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function cors(req: Request) {
  const origen = req.headers.get('origin') ?? '';
  const permitido = ORIGENES.length === 0 || ORIGENES.includes(origen) ? origen : ORIGENES[0];
  return {
    'Access-Control-Allow-Origin': permitido || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function responder(req: Request, status: number, cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });
}

type Perfil = { usuario: string; nombre: string; rol: string; unidad_id: string | null; condominios: string[] };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return responder(req, 405, { error: 'Método no permitido' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Identificar a quien llama a partir de su token de sesión.
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: quien, error: errAuth } = await admin.auth.getUser(token);
  if (errAuth || !quien?.user) return responder(req, 401, { error: 'Sesión inválida' });

  const { data: yo } = await admin.from('perfiles').select('rol, usuario').eq('id', quien.user.id).single();
  const esSuper = yo?.rol === 'superusuario';
  if (!esSuper && yo?.rol !== 'admin') return responder(req, 403, { error: 'Solo un administrador puede gestionar usuarios' });

  const anotar = (accion: string, registroId: string, condominio: string | null, antes: unknown, despues: unknown) =>
    admin.from('auditoria').insert({
      usuario_id: quien.user.id,
      usuario: yo.usuario,
      accion,
      tabla: 'usuarios',
      registro_id: registroId,
      condominio_id: condominio,
      antes,
      despues,
    });

  const leerCondominios = async (id: string): Promise<string[]> =>
    ((await admin.from('condominio_usuarios').select('condominio_id').eq('usuario_id', id)).data ?? []).map((r) => r.condominio_id).sort();
  const condominioDeUnidad = async (unidad: string | null): Promise<string | null> =>
    unidad ? ((await admin.from('unidades').select('condominio_id').eq('id', unidad).single()).data?.condominio_id ?? null) : null;
  const leerPerfil = async (id: string): Promise<Perfil | null> => {
    const p = (await admin.from('perfiles').select('usuario, nombre, rol, unidad_id').eq('id', id).single()).data;
    return p ? { ...p, condominios: await leerCondominios(id) } : null;
  };

  const misCondominios = esSuper ? null : new Set(await leerCondominios(quien.user.id));
  const esMio = (c: string | null) => esSuper || (c !== null && misCondominios!.has(c));
  const rolesPermitidos = esSuper ? ROLES : ROLES_ADMIN;

  // ¿Puede tocar a este usuario? Admin: conserjes de sus condominios y residentes de sus unidades.
  const administra = async (p: Perfil) => {
    if (esSuper) return true;
    if (p.rol === 'conserje') return p.condominios.some((c) => misCondominios!.has(c));
    if (p.rol === 'residente') return esMio(await condominioDeUnidad(p.unidad_id));
    return false;
  };

  // Condominios finales: el admin solo cambia los suyos; los demás del usuario se conservan.
  const condominiosFinales = (pedidos: unknown, actuales: string[]): string[] | string => {
    if (!Array.isArray(pedidos) || !pedidos.every((c) => typeof c === 'string' && UUID_RE.test(c))) return 'Condominios inválidos';
    if (esSuper) return [...new Set(pedidos as string[])];
    if ((pedidos as string[]).some((c) => !misCondominios!.has(c))) return 'Solo puedes asignar tus propios condominios.';
    return [...new Set([...actuales.filter((c) => !misCondominios!.has(c)), ...(pedidos as string[])])];
  };
  const guardarCondominios = async (id: string, lista: string[]) => {
    const { error: e1 } = await admin.from('condominio_usuarios').delete().eq('usuario_id', id);
    if (e1) return e1.message;
    if (lista.length) {
      const { error: e2 } = await admin.from('condominio_usuarios').insert(lista.map((condominio_id) => ({ condominio_id, usuario_id: id })));
      if (e2) return e2.message;
    }
    return null;
  };

  // Valida rol + unidad/condominios pedidos. Devuelve error o los valores finales.
  const validarAsignacion = async (rol: string, unidad: unknown, condominios: unknown, actuales: string[]) => {
    if (rol === 'residente') {
      if (typeof unidad !== 'string' || !UUID_RE.test(unidad)) return { error: 'Elige la unidad del residente.' };
      const c = await condominioDeUnidad(unidad);
      if (!c) return { error: 'Unidad no encontrada.' };
      if (!esMio(c)) return { error: 'Esa unidad no es de tus condominios.' };
      return { unidad_id: unidad, condominios: [] as string[], condominio: c };
    }
    if (rol === 'superusuario') return { unidad_id: null, condominios: [] as string[], condominio: null };
    const lista = condominiosFinales(condominios ?? [], actuales);
    if (typeof lista === 'string') return { error: lista };
    if (lista.length === 0) return { error: 'Asigna al menos un condominio.' };
    return { unidad_id: null, condominios: lista, condominio: lista[0] };
  };

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return responder(req, 400, { error: 'Solicitud inválida' });
  }
  const accion = body.accion;

  if (accion === 'crear') {
    const usuario = String(body.usuario ?? '').trim().toLowerCase();
    const nombre = String(body.nombre ?? '').trim();
    const clave = String(body.clave ?? '');
    const rol = String(body.rol ?? 'residente');
    if (!USUARIO_RE.test(usuario)) return responder(req, 400, { error: 'Usuario inválido: 3 a 30 caracteres, solo letras minúsculas, números, punto o guion.' });
    if (clave.length < CLAVE_MIN) return responder(req, 400, { error: `La clave debe tener al menos ${CLAVE_MIN} caracteres.` });
    if (!rolesPermitidos.includes(rol)) return responder(req, 403, { error: 'No puedes asignar ese rol.' });
    const asig = await validarAsignacion(rol, body.unidad_id, body.condominios, []);
    if ('error' in asig) return responder(req, 400, { error: asig.error });

    const { data, error } = await admin.auth.admin.createUser({
      email: `${usuario}@${DOMINIO}`,
      password: clave,
      email_confirm: true,
      user_metadata: { nombre },
    });
    if (error) {
      const msg = /already|registered|exists/i.test(error.message) ? 'Ese usuario ya existe.' : error.message;
      return responder(req, 400, { error: msg });
    }
    // El trigger crea el perfil como residente sin unidad; aquí se asigna lo elegido.
    const { error: e1 } = await admin.from('perfiles').update({ rol, nombre, unidad_id: asig.unidad_id }).eq('id', data.user.id);
    if (e1) return responder(req, 400, { error: e1.message });
    const e2 = await guardarCondominios(data.user.id, asig.condominios);
    if (e2) return responder(req, 400, { error: e2 });
    await anotar('crear', data.user.id, asig.condominio, null, await leerPerfil(data.user.id));
    return responder(req, 200, { ok: true });
  }

  if (accion === 'actualizar') {
    const id = String(body.id ?? '');
    if (!UUID_RE.test(id)) return responder(req, 400, { error: 'Falta el usuario' });
    const antes = await leerPerfil(id);
    if (!antes) return responder(req, 404, { error: 'Usuario no encontrado' });
    const esUnoMismo = id === quien.user.id;
    if (!esUnoMismo && !(await administra(antes))) return responder(req, 403, { error: 'No puedes modificar a este usuario.' });

    const cambios: Record<string, unknown> = {};
    if (body.nombre !== undefined) cambios.nombre = String(body.nombre).trim();
    let condominios: string[] | undefined;
    let condominio: string | null = antes.condominios[0] ?? (await condominioDeUnidad(antes.unidad_id));
    const tocaAsignacion = !esUnoMismo && (body.rol !== undefined || body.unidad_id !== undefined || body.condominios !== undefined);
    if (tocaAsignacion) {
      const rol = String(body.rol ?? antes.rol);
      if (!rolesPermitidos.includes(rol)) return responder(req, 403, { error: 'No puedes asignar ese rol.' });
      const asig = await validarAsignacion(rol, body.unidad_id ?? antes.unidad_id, body.condominios ?? antes.condominios, antes.condominios);
      if ('error' in asig) return responder(req, 400, { error: asig.error });
      cambios.rol = rol;
      cambios.unidad_id = asig.unidad_id;
      condominios = asig.condominios;
      condominio = asig.condominio;
    } else if (esUnoMismo && (body.rol !== undefined && body.rol !== antes.rol)) {
      return responder(req, 400, { error: 'No puedes cambiar tu propio rol.' });
    }
    if (body.clave) {
      const clave = String(body.clave);
      if (clave.length < CLAVE_MIN) return responder(req, 400, { error: `La clave debe tener al menos ${CLAVE_MIN} caracteres.` });
      const { error } = await admin.auth.admin.updateUserById(id, { password: clave });
      if (error) return responder(req, 400, { error: error.message });
    }
    if (Object.keys(cambios).length) {
      const { error } = await admin.from('perfiles').update(cambios).eq('id', id);
      if (error) return responder(req, 400, { error: error.message });
    }
    if (condominios) {
      const e = await guardarCondominios(id, condominios);
      if (e) return responder(req, 400, { error: e });
    }
    const despues = { ...(await leerPerfil(id)), ...(body.clave ? { clave: '(cambiada)' } : {}) };
    if (JSON.stringify(despues) !== JSON.stringify(antes)) await anotar('modificar', id, condominio, antes, despues);
    return responder(req, 200, { ok: true });
  }

  if (accion === 'eliminar') {
    const id = String(body.id ?? '');
    if (!UUID_RE.test(id)) return responder(req, 400, { error: 'Falta el usuario' });
    if (id === quien.user.id) return responder(req, 400, { error: 'No puedes eliminar tu propio usuario.' });
    const antes = await leerPerfil(id);
    if (!antes) return responder(req, 404, { error: 'Usuario no encontrado' });
    if (!(await administra(antes))) return responder(req, 403, { error: 'No puedes eliminar a este usuario.' });
    if (!esSuper && antes.condominios.some((c) => !misCondominios!.has(c))) {
      return responder(req, 403, { error: 'Este conserje también trabaja en otros condominios: quítale los tuyos editándolo en vez de eliminarlo.' });
    }
    const condominio = antes.condominios[0] ?? (await condominioDeUnidad(antes.unidad_id));
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return responder(req, 400, { error: error.message });
    await anotar('eliminar', id, condominio, antes, null);
    return responder(req, 200, { ok: true });
  }

  return responder(req, 400, { error: 'Acción desconocida' });
});
