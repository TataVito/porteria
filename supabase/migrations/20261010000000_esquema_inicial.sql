-- Portería Las Palmas — control de acceso, visitas, estacionamientos y encomiendas de condominios.
-- Seguridad a nivel de fila (RLS): sin sesión no se ve nada y cada rol ve solo lo suyo.
--   superusuario : todo; único que crea/elimina condominios y crea administradores.
--   admin        : administrador DE CONDOMINIO (solo los asignados): configura, ve reportes,
--                  auditoría y gestiona conserjes y residentes (vía Edge Function).
--   conserje     : portería de sus condominios: registra entradas/salidas, encomiendas, bitácora.
--   residente    : su unidad: invita visitas, ve quién llegó y sus encomiendas.
-- La gestión de usuarios pasa por la Edge Function `admin-usuarios` (service role).
-- Se puede ejecutar más de una vez (if not exists / drop if exists / create or replace).

-- ---------------------------------------------------------------------------
-- Condominios y unidades
-- ---------------------------------------------------------------------------
create table if not exists public.condominios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  direccion text not null default '',
  comuna text not null default '',
  telefono_conserjeria text not null default '',
  -- Tiempo máximo que una visita puede ocupar un estacionamiento (alerta de exceso).
  max_minutos_estacionamiento integer not null default 240 check (max_minutos_estacionamiento between 15 and 2880),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists public.unidades (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id) on delete cascade,
  torre text not null default '',
  numero text not null check (length(trim(numero)) > 0),
  piso text not null default '',
  telefono text not null default '',
  notas text not null default '',
  creado_en timestamptz not null default now(),
  unique (condominio_id, torre, numero)
);
create index if not exists unidades_condominio on public.unidades (condominio_id);

-- ---------------------------------------------------------------------------
-- Perfiles (rol de cada usuario). Se crea solo al crear el usuario en Auth.
-- ---------------------------------------------------------------------------
create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  usuario text not null unique,
  nombre text not null default '',
  rol text not null default 'residente' check (rol in ('residente', 'conserje', 'admin', 'superusuario')),
  -- Solo residentes: la unidad que representan.
  unidad_id uuid references public.unidades (id) on delete set null,
  creado_en timestamptz not null default now()
);

-- Condominios asignados a admin y conserje (el residente se deriva de su unidad).
create table if not exists public.condominio_usuarios (
  condominio_id uuid not null references public.condominios (id) on delete cascade,
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  primary key (condominio_id, usuario_id)
);
create index if not exists condominio_usuarios_usuario on public.condominio_usuarios (usuario_id);

-- El rol siempre nace como 'residente' sin unidad (no ve nada); solo un admin lo cambia.
create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, usuario, nombre)
  values (new.id, split_part(new.email, '@', 1), coalesce(new.raw_user_meta_data ->> 'nombre', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- ---------------------------------------------------------------------------
-- Ayudas de permisos (security definer: leen perfiles sin pasar por RLS)
-- ---------------------------------------------------------------------------
create or replace function public.rol_actual()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select rol from public.perfiles where id = auth.uid()), '');
$$;

create or replace function public.usuario_actual()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select usuario from public.perfiles where id = auth.uid()), '');
$$;

create or replace function public.mi_unidad()
returns uuid language sql stable security definer set search_path = '' as $$
  select unidad_id from public.perfiles where id = auth.uid() and rol = 'residente';
$$;

-- ¿Trabaja (admin o conserje) en el condominio? El súper usuario, en todos.
create or replace function public.trabaja_en(p_condominio uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.rol_actual() = 'superusuario'
    or (
      public.rol_actual() in ('admin', 'conserje')
      and exists (select 1 from public.condominio_usuarios where condominio_id = p_condominio and usuario_id = auth.uid())
    );
$$;

-- ¿Administra el condominio? (súper o admin asignado)
create or replace function public.administra(p_condominio uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.rol_actual() = 'superusuario'
    or (
      public.rol_actual() = 'admin'
      and exists (select 1 from public.condominio_usuarios where condominio_id = p_condominio and usuario_id = auth.uid())
    );
$$;

-- ¿Ve el condominio? Personal asignado o residente de una unidad del condominio.
create or replace function public.ve_condominio(p_condominio uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.trabaja_en(p_condominio)
    or exists (select 1 from public.unidades u where u.id = public.mi_unidad() and u.condominio_id = p_condominio);
$$;

-- ¿El usuario actual administra a p_usuario? Súper: a todos. Admin: a conserjes y residentes
-- de sus condominios.
create or replace function public.administra_usuario(p_usuario uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.rol_actual() = 'superusuario'
    or (
      public.rol_actual() = 'admin'
      and exists (
        select 1 from public.perfiles p
        where p.id = p_usuario
          and (
            (p.rol = 'conserje' and exists (
              select 1 from public.condominio_usuarios cu
              where cu.usuario_id = p.id and public.administra(cu.condominio_id)))
            or (p.rol = 'residente' and exists (
              select 1 from public.unidades u where u.id = p.unidad_id and public.administra(u.condominio_id)))
          )
      )
    );
$$;

revoke execute on function public.crear_perfil() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['rol_actual()', 'usuario_actual()', 'mi_unidad()', 'trabaja_en(uuid)',
                           'administra(uuid)', 've_condominio(uuid)', 'administra_usuario(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Personas, vehículos y estacionamientos
-- ---------------------------------------------------------------------------
create table if not exists public.residentes (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id) on delete cascade,
  unidad_id uuid not null references public.unidades (id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  rut text not null default '',
  telefono text not null default '',
  email text not null default '',
  tipo text not null default 'propietario' check (tipo in ('propietario', 'arrendatario', 'familiar', 'otro')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create index if not exists residentes_unidad on public.residentes (unidad_id);
create index if not exists residentes_condominio on public.residentes (condominio_id);

create table if not exists public.estacionamientos (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id) on delete cascade,
  codigo text not null check (length(trim(codigo)) > 0),
  tipo text not null default 'visita' check (tipo in ('visita', 'residente', 'discapacitado', 'carga')),
  -- Estacionamiento propio de una unidad (tipo residente).
  unidad_id uuid references public.unidades (id) on delete set null,
  ubicacion text not null default '',
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (condominio_id, codigo)
);

create table if not exists public.vehiculos (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id) on delete cascade,
  unidad_id uuid not null references public.unidades (id) on delete cascade,
  patente text not null check (patente ~ '^[A-Z0-9]{4,8}$'),
  marca text not null default '',
  modelo text not null default '',
  color text not null default '',
  creado_en timestamptz not null default now(),
  unique (condominio_id, patente)
);

-- Personas o patentes con prohibición de ingreso.
create table if not exists public.lista_negra (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id) on delete cascade,
  nombre text not null default '',
  rut text not null default '',
  patente text not null default '',
  motivo text not null check (length(trim(motivo)) > 0),
  creado_en timestamptz not null default now(),
  creado_por_usuario text not null default '',
  check (rut <> '' or patente <> '' or nombre <> '')
);
create index if not exists lista_negra_condominio on public.lista_negra (condominio_id);

-- ---------------------------------------------------------------------------
-- Invitaciones (pre-autorizaciones del residente con código / QR)
-- ---------------------------------------------------------------------------
create table if not exists public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id) on delete cascade,
  unidad_id uuid not null references public.unidades (id) on delete cascade,
  nombre text not null check (length(trim(nombre)) > 0),
  rut text not null default '',
  patente text not null default '',
  telefono text not null default '',
  tipo text not null default 'visita' check (tipo in ('visita', 'servicio', 'delivery', 'proveedor')),
  desde date not null,
  hasta date not null,
  -- 'unica': se usa una vez. 'frecuente': cada día del rango (nana, profesor, etc).
  frecuencia text not null default 'unica' check (frecuencia in ('unica', 'frecuente')),
  codigo text not null,
  usos integer not null default 0,
  estado text not null default 'activa' check (estado in ('activa', 'usada', 'anulada')),
  notas text not null default '',
  creado_en timestamptz not null default now(),
  creado_por uuid default auth.uid(),
  creado_por_usuario text not null default '',
  check (hasta >= desde),
  check (hasta - desde <= 366)
);
create unique index if not exists invitaciones_codigo on public.invitaciones (condominio_id, codigo);
create index if not exists invitaciones_unidad on public.invitaciones (unidad_id, desde desc);
create index if not exists invitaciones_fecha on public.invitaciones (condominio_id, desde, hasta);

-- ---------------------------------------------------------------------------
-- Registro de accesos (entradas y salidas en portería)
-- ---------------------------------------------------------------------------
create table if not exists public.accesos (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id) on delete cascade,
  tipo text not null check (tipo in ('visita', 'servicio', 'delivery', 'proveedor', 'residente', 'otro')),
  nombre text not null default '',
  rut text not null default '',
  patente text not null default '',
  unidad_id uuid references public.unidades (id) on delete set null,
  invitacion_id uuid references public.invitaciones (id) on delete set null,
  estacionamiento_id uuid references public.estacionamientos (id) on delete set null,
  -- Cómo se autorizó: invitación, residente por teléfono / citófono, admin, etc.
  autorizacion text not null default 'invitacion'
    check (autorizacion in ('invitacion', 'telefono', 'presencial', 'admin', 'residente', 'otro')),
  acompanantes integer not null default 0 check (acompanantes between 0 and 50),
  observaciones text not null default '',
  entrada_en timestamptz not null default now(),
  salida_en timestamptz,
  registrado_por_usuario text not null default '',
  salida_por_usuario text not null default '',
  check (salida_en is null or salida_en >= entrada_en)
);
create index if not exists accesos_condominio_entrada on public.accesos (condominio_id, entrada_en desc);
create index if not exists accesos_dentro on public.accesos (condominio_id) where salida_en is null;
create index if not exists accesos_unidad on public.accesos (unidad_id, entrada_en desc);
-- Un estacionamiento no puede estar ocupado dos veces a la vez.
create unique index if not exists accesos_estacionamiento_ocupado
  on public.accesos (estacionamiento_id) where salida_en is null and estacionamiento_id is not null;

-- ---------------------------------------------------------------------------
-- Encomiendas y bitácora
-- ---------------------------------------------------------------------------
create table if not exists public.encomiendas (
  id uuid primary key default gen_random_uuid(),
  condominio_id uuid not null references public.condominios (id) on delete cascade,
  unidad_id uuid not null references public.unidades (id) on delete cascade,
  empresa text not null default '',
  descripcion text not null default '',
  destinatario text not null default '',
  recibida_en timestamptz not null default now(),
  recibida_por_usuario text not null default '',
  retirada_en timestamptz,
  retirada_por text not null default '',
  entregada_por_usuario text not null default ''
);
create index if not exists encomiendas_pendientes on public.encomiendas (condominio_id) where retirada_en is null;
create index if not exists encomiendas_unidad on public.encomiendas (unidad_id, recibida_en desc);

-- Libro de novedades de conserjería: solo se agregan entradas, nunca se editan ni borran.
create table if not exists public.bitacora (
  id bigint generated always as identity primary key,
  condominio_id uuid not null references public.condominios (id) on delete cascade,
  fecha timestamptz not null default now(),
  usuario text not null default '',
  tipo text not null default 'novedad' check (tipo in ('novedad', 'incidente', 'ronda', 'turno', 'mantencion')),
  texto text not null check (length(trim(texto)) > 0 and length(texto) <= 4000)
);
create index if not exists bitacora_condominio on public.bitacora (condominio_id, fecha desc);

-- ---------------------------------------------------------------------------
-- Normalización y marcas que el cliente no puede falsear
-- ---------------------------------------------------------------------------
create or replace function public.normalizar_patente(p text)
returns text language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- RUT sin puntos, con guion y DV en mayúscula: 12345678-K
create or replace function public.normalizar_rut(p text)
returns text language sql immutable set search_path = '' as $$
  select case
    when length(regexp_replace(coalesce(p, ''), '[^0-9kK]', '', 'g')) < 2 then upper(trim(coalesce(p, '')))
    else
      left(upper(regexp_replace(p, '[^0-9kK]', '', 'g')), -1) || '-' || right(upper(regexp_replace(p, '[^0-9kK]', '', 'g')), 1)
  end;
$$;

create or replace function public.antes_de_guardar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name in ('vehiculos', 'lista_negra', 'invitaciones', 'accesos') then
    new.patente := public.normalizar_patente(new.patente);
  end if;
  if tg_table_name in ('residentes', 'lista_negra', 'invitaciones', 'accesos') then
    new.rut := public.normalizar_rut(new.rut);
  end if;

  if tg_op = 'INSERT' then
    if tg_table_name = 'lista_negra' then
      new.creado_por_usuario := public.usuario_actual();
    elsif tg_table_name = 'invitaciones' then
      new.creado_por := auth.uid();
      new.creado_por_usuario := public.usuario_actual();
      new.creado_en := now();
      new.usos := 0;
      new.estado := 'activa';
    elsif tg_table_name = 'accesos' then
      new.registrado_por_usuario := public.usuario_actual();
      new.salida_por_usuario := '';
      new.salida_en := null;
      -- La hora de entrada la pone la base (se acepta hasta 12 h atrás: registro sin señal).
      if new.entrada_en is null or new.entrada_en > now() or new.entrada_en < now() - interval '12 hours' then
        new.entrada_en := now();
      end if;
    elsif tg_table_name = 'encomiendas' then
      new.recibida_por_usuario := public.usuario_actual();
      new.recibida_en := now();
      new.retirada_en := null;
      new.retirada_por := '';
      new.entregada_por_usuario := '';
    elsif tg_table_name = 'bitacora' then
      new.usuario := public.usuario_actual();
      new.fecha := now();
    end if;
    -- La unidad debe pertenecer al mismo condominio.
    if tg_table_name in ('residentes', 'vehiculos', 'invitaciones', 'accesos', 'encomiendas', 'estacionamientos')
       and (to_jsonb(new) ->> 'unidad_id') is not null
       and not exists (select 1 from public.unidades u
                       where u.id = (to_jsonb(new) ->> 'unidad_id')::uuid and u.condominio_id = new.condominio_id) then
      raise exception 'La unidad no pertenece a este condominio';
    end if;
  else
    -- Nadie cambia el condominio de un registro ni reescribe quién lo creó.
    if new.condominio_id <> old.condominio_id then
      raise exception 'No se puede cambiar el condominio de un registro';
    end if;
    if tg_table_name in ('residentes', 'vehiculos', 'estacionamientos')
       and (to_jsonb(new) ->> 'unidad_id') is not null
       and (to_jsonb(new) ->> 'unidad_id') is distinct from (to_jsonb(old) ->> 'unidad_id')
       and not exists (select 1 from public.unidades u
                       where u.id = (to_jsonb(new) ->> 'unidad_id')::uuid and u.condominio_id = new.condominio_id) then
      raise exception 'La unidad no pertenece a este condominio';
    end if;
    if tg_table_name = 'lista_negra' then
      new.creado_por_usuario := old.creado_por_usuario;
      new.creado_en := old.creado_en;
    elsif tg_table_name = 'invitaciones' then
      -- El residente solo modifica (o anula) invitaciones aún activas, y no las reactiva.
      if not public.trabaja_en(old.condominio_id) then
        if old.estado <> 'activa' then
          raise exception 'Esta invitación ya no se puede modificar';
        end if;
        if new.estado not in ('activa', 'anulada') then
          new.estado := old.estado;
        end if;
        new.usos := old.usos;
      end if;
      new.creado_por := old.creado_por;
      new.creado_por_usuario := old.creado_por_usuario;
      new.creado_en := old.creado_en;
      new.codigo := old.codigo;
      new.unidad_id := old.unidad_id;
    elsif tg_table_name = 'accesos' then
      new.registrado_por_usuario := old.registrado_por_usuario;
      new.entrada_en := old.entrada_en;
      if old.salida_en is null and new.salida_en is not null then
        new.salida_por_usuario := public.usuario_actual();
        if new.salida_en > now() or new.salida_en < new.entrada_en then
          new.salida_en := now();
        end if;
      elsif old.salida_en is not null then
        -- Una salida ya registrada no se reescribe (salvo administración).
        if not public.administra(old.condominio_id) then
          new.salida_en := old.salida_en;
          new.salida_por_usuario := old.salida_por_usuario;
        end if;
      end if;
    elsif tg_table_name = 'encomiendas' then
      new.recibida_en := old.recibida_en;
      new.recibida_por_usuario := old.recibida_por_usuario;
      if old.retirada_en is null and new.retirada_en is not null then
        new.retirada_en := now();
        new.entregada_por_usuario := public.usuario_actual();
      elsif old.retirada_en is not null and not public.administra(old.condominio_id) then
        new.retirada_en := old.retirada_en;
        new.retirada_por := old.retirada_por;
        new.entregada_por_usuario := old.entregada_por_usuario;
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.antes_de_guardar() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['residentes', 'vehiculos', 'estacionamientos', 'lista_negra', 'invitaciones',
                           'accesos', 'encomiendas', 'bitacora'] loop
    execute format('drop trigger if exists %I_antes on public.%I', t, t);
    execute format('create trigger %I_antes before insert or update on public.%I
                    for each row execute function public.antes_de_guardar()', t, t);
  end loop;
end $$;

-- La bitácora no se edita ni se borra (solo el súper usuario puede borrar un condominio entero).
create or replace function public.bitacora_inmutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'La bitácora no se puede modificar';
end;
$$;
drop trigger if exists bitacora_sin_cambios on public.bitacora;
create trigger bitacora_sin_cambios before update on public.bitacora
  for each row execute function public.bitacora_inmutable();

-- ---------------------------------------------------------------------------
-- Código de invitación: 6 caracteres sin ambiguos (sin 0/O, 1/I/L). La base lo genera.
-- ---------------------------------------------------------------------------
create or replace function public.generar_codigo()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  -- 16 bytes aleatorios del generador de la base (gen_random_uuid usa un generador seguro).
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  r text := '';
begin
  for i in 0..5 loop
    r := r || substr(alfabeto, (get_byte(bytes, i) % length(alfabeto)) + 1, 1);
  end loop;
  return r;
end;
$$;

create or replace function public.codigo_invitacion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare intento int := 0;
begin
  loop
    new.codigo := public.generar_codigo();
    exit when not exists (select 1 from public.invitaciones where condominio_id = new.condominio_id and codigo = new.codigo);
    intento := intento + 1;
    if intento > 20 then raise exception 'No se pudo generar un código'; end if;
  end loop;
  return new;
end;
$$;
revoke execute on function public.codigo_invitacion() from public, anon, authenticated;
revoke execute on function public.generar_codigo() from public, anon, authenticated;

drop trigger if exists invitaciones_codigo on public.invitaciones;
create trigger invitaciones_codigo before insert on public.invitaciones
  for each row execute function public.codigo_invitacion();

-- ---------------------------------------------------------------------------
-- Funciones de portería
-- ---------------------------------------------------------------------------
-- Busca prohibiciones que coincidan con RUT, patente o nombre exacto.
create or replace function public.revisar_lista_negra(p_condominio uuid, p_rut text, p_patente text, p_nombre text default '')
returns setof public.lista_negra
language sql stable security definer set search_path = '' as $$
  select l.* from public.lista_negra l
  where public.trabaja_en(p_condominio)
    and l.condominio_id = p_condominio
    and (
      (l.rut <> '' and l.rut = public.normalizar_rut(p_rut))
      or (l.patente <> '' and l.patente = public.normalizar_patente(p_patente))
      or (l.nombre <> '' and lower(trim(l.nombre)) = lower(trim(coalesce(p_nombre, ''))) and trim(coalesce(p_nombre, '')) <> '')
    );
$$;

-- Valida un código (escrito o leído del QR). Devuelve la invitación con su unidad y un motivo
-- si no sirve hoy. Solo personal del condominio.
create or replace function public.validar_codigo(p_condominio uuid, p_codigo text)
returns table (
  invitacion_id uuid, nombre text, rut text, patente text, tipo text, unidad_id uuid, unidad text,
  desde date, hasta date, frecuencia text, usos integer, estado text, notas text, valida boolean, motivo text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  hoy date := (now() at time zone 'America/Santiago')::date;
  cod text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  i public.invitaciones;
  ya_hoy boolean;
begin
  if not public.trabaja_en(p_condominio) then
    raise exception 'Sin permiso en este condominio';
  end if;
  -- QR con formato "PRT:<código>"
  if cod like 'PRT%' and length(cod) = 9 then cod := substr(cod, 4); end if;
  select * into i from public.invitaciones x where x.condominio_id = p_condominio and x.codigo = cod;
  if not found then
    return;
  end if;
  select exists (
    select 1 from public.accesos a where a.invitacion_id = i.id
      and (a.entrada_en at time zone 'America/Santiago')::date = hoy
  ) into ya_hoy;
  return query
  select i.id, i.nombre, i.rut, i.patente, i.tipo, i.unidad_id,
         (select trim(both ' ' from concat_ws(' ', nullif(u.torre, ''), u.numero)) from public.unidades u where u.id = i.unidad_id),
         i.desde, i.hasta, i.frecuencia, i.usos, i.estado, i.notas,
         (i.estado = 'activa' and hoy between i.desde and i.hasta and not (i.frecuencia = 'frecuente' and ya_hoy)),
         case
           when i.estado = 'anulada' then 'La invitación fue anulada por el residente'
           when i.estado = 'usada' then 'La invitación ya fue usada'
           when hoy < i.desde then 'La invitación es válida desde el ' || to_char(i.desde, 'DD-MM-YYYY')
           when hoy > i.hasta then 'La invitación venció el ' || to_char(i.hasta, 'DD-MM-YYYY')
           when i.frecuencia = 'frecuente' and ya_hoy then 'Ya ingresó hoy con esta invitación'
           else ''
         end;
end;
$$;

-- Registra una entrada. Revisa lista negra (bloquea salvo que un administrador fuerce),
-- consume la invitación y ocupa el estacionamiento, todo en una sola operación.
create or replace function public.registrar_entrada(
  p_condominio uuid,
  p_tipo text,
  p_nombre text,
  p_rut text default '',
  p_patente text default '',
  p_unidad uuid default null,
  p_invitacion uuid default null,
  p_estacionamiento uuid default null,
  p_autorizacion text default 'invitacion',
  p_acompanantes integer default 0,
  p_observaciones text default '',
  p_forzar boolean default false,
  p_momento timestamptz default null
)
returns public.accesos
language plpgsql volatile security definer set search_path = '' as $$
declare
  inv public.invitaciones;
  fila public.accesos;
  prohibido text;
  v record;
begin
  if not public.trabaja_en(p_condominio) then
    raise exception 'Sin permiso en este condominio';
  end if;

  select string_agg(motivo, '; ') into prohibido from public.revisar_lista_negra(p_condominio, p_rut, p_patente, p_nombre);
  if prohibido is not null and not (p_forzar and public.administra(p_condominio)) then
    raise exception 'INGRESO PROHIBIDO: %', prohibido using errcode = 'P0001', hint = 'lista_negra';
  end if;

  if p_invitacion is not null then
    select * into inv from public.invitaciones where id = p_invitacion and condominio_id = p_condominio for update;
    if not found then raise exception 'Invitación no encontrada'; end if;
    select * into v from public.validar_codigo(p_condominio, inv.codigo);
    if not v.valida then raise exception '%', v.motivo; end if;
    update public.invitaciones
      set usos = usos + 1, estado = case when frecuencia = 'unica' then 'usada' else estado end
      where id = inv.id;
    p_unidad := inv.unidad_id;
  end if;

  if p_estacionamiento is not null then
    perform 1 from public.estacionamientos e where e.id = p_estacionamiento and e.condominio_id = p_condominio and e.activo;
    if not found then raise exception 'Estacionamiento no válido'; end if;
    if exists (select 1 from public.accesos a where a.estacionamiento_id = p_estacionamiento and a.salida_en is null) then
      raise exception 'Ese estacionamiento ya está ocupado';
    end if;
  end if;

  insert into public.accesos (condominio_id, tipo, nombre, rut, patente, unidad_id, invitacion_id,
                              estacionamiento_id, autorizacion, acompanantes, observaciones, entrada_en)
  values (p_condominio, p_tipo, trim(coalesce(p_nombre, '')), coalesce(p_rut, ''), coalesce(p_patente, ''),
          p_unidad, p_invitacion, p_estacionamiento,
          case when p_invitacion is not null then 'invitacion'
               when prohibido is not null then 'admin'
               else coalesce(nullif(p_autorizacion, 'invitacion'), 'otro') end,
          coalesce(p_acompanantes, 0),
          case when prohibido is not null then trim('[Lista negra forzada: ' || prohibido || '] ' || coalesce(p_observaciones, ''))
               else coalesce(p_observaciones, '') end,
          coalesce(p_momento, now()))
  returning * into fila;
  return fila;
end;
$$;

-- Registra la salida (con hora del equipo si se marcó sin señal, hasta 12 h atrás).
create or replace function public.registrar_salida(p_acceso uuid, p_momento timestamptz default null)
returns public.accesos
language plpgsql volatile security definer set search_path = '' as $$
declare fila public.accesos;
begin
  select * into fila from public.accesos where id = p_acceso for update;
  if not found or not public.trabaja_en(fila.condominio_id) then
    raise exception 'Registro no encontrado';
  end if;
  if fila.salida_en is not null then
    return fila;  -- ya salió: no es error (puede venir repetido de la cola sin señal)
  end if;
  update public.accesos
    set salida_en = greatest(fila.entrada_en,
                             case when p_momento is null or p_momento > now() or p_momento < now() - interval '12 hours'
                                  then now() else p_momento end)
    where id = p_acceso
    returning * into fila;
  return fila;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['revisar_lista_negra(uuid, text, text, text)', 'validar_codigo(uuid, text)',
                           'registrar_entrada(uuid, text, text, text, text, uuid, uuid, uuid, text, integer, text, boolean, timestamptz)',
                           'registrar_salida(uuid, timestamptz)', 'normalizar_patente(text)', 'normalizar_rut(text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Las entradas solo se crean por registrar_entrada (revisa lista negra e invitación).
-- registrar_entrada es security definer: el insert directo desde la app queda cerrado.

-- ---------------------------------------------------------------------------
-- Auditoría inmutable (solo administración la lee)
-- ---------------------------------------------------------------------------
create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  fecha timestamptz not null default now(),
  usuario_id uuid,
  usuario text not null default '',
  accion text not null check (accion in ('crear', 'modificar', 'eliminar')),
  tabla text not null,
  registro_id text not null,
  condominio_id uuid,
  antes jsonb,
  despues jsonb
);
create index if not exists auditoria_condominio on public.auditoria (condominio_id, fecha desc);
create index if not exists auditoria_fecha on public.auditoria (fecha desc);

create or replace function public.registrar_auditoria()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  fila_antes jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  fila_despues jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  fila jsonb := coalesce(fila_despues, fila_antes);
begin
  if tg_op = 'UPDATE' and fila_antes = fila_despues then
    return null;
  end if;
  insert into public.auditoria (usuario_id, usuario, accion, tabla, registro_id, condominio_id, antes, despues)
  values (
    auth.uid(), public.usuario_actual(),
    case tg_op when 'INSERT' then 'crear' when 'UPDATE' then 'modificar' else 'eliminar' end,
    tg_table_name, fila ->> 'id',
    case when tg_table_name = 'condominios' then (fila ->> 'id')::uuid else (fila ->> 'condominio_id')::uuid end,
    fila_antes, fila_despues
  );
  return null;
end;
$$;
revoke execute on function public.registrar_auditoria() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['condominios', 'unidades', 'residentes', 'vehiculos', 'estacionamientos', 'lista_negra',
                           'invitaciones', 'accesos', 'encomiendas'] loop
    execute format('drop trigger if exists %I_auditoria on public.%I', t, t);
    execute format('create trigger %I_auditoria after insert or update or delete on public.%I
                    for each row execute function public.registrar_auditoria()', t, t);
  end loop;
end $$;

create or replace function public.auditoria_inmutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'El registro de auditoría no se puede modificar ni eliminar';
end;
$$;
drop trigger if exists auditoria_sin_cambios on public.auditoria;
create trigger auditoria_sin_cambios before update or delete on public.auditoria
  for each row execute function public.auditoria_inmutable();
drop trigger if exists auditoria_sin_truncate on public.auditoria;
create trigger auditoria_sin_truncate before truncate on public.auditoria
  for each statement execute function public.auditoria_inmutable();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.condominios enable row level security;
alter table public.unidades enable row level security;
alter table public.perfiles enable row level security;
alter table public.condominio_usuarios enable row level security;
alter table public.residentes enable row level security;
alter table public.estacionamientos enable row level security;
alter table public.vehiculos enable row level security;
alter table public.lista_negra enable row level security;
alter table public.invitaciones enable row level security;
alter table public.accesos enable row level security;
alter table public.encomiendas enable row level security;
alter table public.bitacora enable row level security;
alter table public.auditoria enable row level security;

-- Borra todas las políticas existentes de estas tablas (permite re-ejecutar el archivo).
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Condominios: lo ve quien trabaja o vive ahí; el admin lo edita; solo el súper crea y elimina.
create policy "condominios: ver" on public.condominios for select to authenticated
  using (public.ve_condominio(id));
create policy "condominios: crear super" on public.condominios for insert to authenticated
  with check (public.rol_actual() = 'superusuario');
create policy "condominios: editar admin" on public.condominios for update to authenticated
  using (public.administra(id)) with check (public.administra(id));
create policy "condominios: eliminar super" on public.condominios for delete to authenticated
  using (public.rol_actual() = 'superusuario');

-- Perfiles: el propio y los que administra. Nadie escribe desde el cliente (Edge Function).
create policy "perfiles: ver" on public.perfiles for select to authenticated
  using (id = auth.uid() or public.administra_usuario(id));
create policy "condominio_usuarios: ver" on public.condominio_usuarios for select to authenticated
  using (usuario_id = auth.uid() or public.administra(condominio_id));

-- Unidades: el personal ve todas las de su condominio; el residente solo la suya.
create policy "unidades: ver" on public.unidades for select to authenticated
  using (public.trabaja_en(condominio_id) or id = public.mi_unidad());

-- Residentes y vehículos: personal ve todo el condominio; el residente, los de su unidad.
create policy "residentes: ver" on public.residentes for select to authenticated
  using (public.trabaja_en(condominio_id) or unidad_id = public.mi_unidad());
create policy "vehiculos: ver" on public.vehiculos for select to authenticated
  using (public.trabaja_en(condominio_id) or unidad_id = public.mi_unidad());
create policy "estacionamientos: ver" on public.estacionamientos for select to authenticated
  using (public.trabaja_en(condominio_id) or unidad_id = public.mi_unidad());
create policy "lista_negra: ver" on public.lista_negra for select to authenticated
  using (public.trabaja_en(condominio_id));

-- Administración escribe en unidades, residentes, vehículos, estacionamientos y lista negra.
do $$
declare t text;
begin
  foreach t in array array['unidades', 'residentes', 'vehiculos', 'estacionamientos', 'lista_negra'] loop
    execute format('create policy "%s: crear admin" on public.%I for insert to authenticated
                    with check (public.administra(condominio_id))', t, t);
    execute format('create policy "%s: editar admin" on public.%I for update to authenticated
                    using (public.administra(condominio_id)) with check (public.administra(condominio_id))', t, t);
    execute format('create policy "%s: eliminar admin" on public.%I for delete to authenticated
                    using (public.administra(condominio_id))', t, t);
  end loop;
end $$;

-- Invitaciones: solo la casa crea las suyas (desde la app Mi Casa) y puede anularlas; el
-- personal las ve y las valida en portería, pero no las crea (una visita sin pase se registra
-- en portería llamando a la casa para autorizar).
create policy "invitaciones: ver" on public.invitaciones for select to authenticated
  using (public.trabaja_en(condominio_id) or unidad_id = public.mi_unidad());
create policy "invitaciones: crear" on public.invitaciones for insert to authenticated
  with check (unidad_id = public.mi_unidad());
create policy "invitaciones: editar" on public.invitaciones for update to authenticated
  using (public.trabaja_en(condominio_id) or unidad_id = public.mi_unidad())
  with check (public.trabaja_en(condominio_id) or unidad_id = public.mi_unidad());
create policy "invitaciones: eliminar admin" on public.invitaciones for delete to authenticated
  using (public.administra(condominio_id));

-- Accesos: el personal los ve y registra salidas; el residente ve las llegadas a su unidad.
-- Las entradas se crean solo con registrar_entrada (sin política de insert).
create policy "accesos: ver" on public.accesos for select to authenticated
  using (public.trabaja_en(condominio_id) or unidad_id = public.mi_unidad());
create policy "accesos: editar personal" on public.accesos for update to authenticated
  using (public.trabaja_en(condominio_id)) with check (public.trabaja_en(condominio_id));
create policy "accesos: eliminar admin" on public.accesos for delete to authenticated
  using (public.administra(condominio_id));

-- Encomiendas: el personal las recibe y entrega; el residente ve las suyas.
create policy "encomiendas: ver" on public.encomiendas for select to authenticated
  using (public.trabaja_en(condominio_id) or unidad_id = public.mi_unidad());
create policy "encomiendas: crear personal" on public.encomiendas for insert to authenticated
  with check (public.trabaja_en(condominio_id));
create policy "encomiendas: editar personal" on public.encomiendas for update to authenticated
  using (public.trabaja_en(condominio_id)) with check (public.trabaja_en(condominio_id));
create policy "encomiendas: eliminar admin" on public.encomiendas for delete to authenticated
  using (public.administra(condominio_id));

-- Bitácora: el personal lee y agrega. Nadie edita ni borra.
create policy "bitacora: ver" on public.bitacora for select to authenticated
  using (public.trabaja_en(condominio_id));
create policy "bitacora: agregar" on public.bitacora for insert to authenticated
  with check (public.trabaja_en(condominio_id));

-- Auditoría: solo administración.
create policy "auditoria: ver admin" on public.auditoria for select to authenticated
  using (public.rol_actual() = 'superusuario' or (condominio_id is not null and public.administra(condominio_id)));

-- Sin acceso anónimo; sin escritura directa en perfiles ni auditoría.
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on public.perfiles, public.condominio_usuarios, public.auditoria from authenticated;
revoke insert on public.accesos from authenticated;
revoke delete, truncate on public.bitacora from authenticated;
revoke update on public.bitacora from authenticated;

-- ---------------------------------------------------------------------------
-- Cambios en vivo (Realtime respeta RLS): portería y residentes ven llegadas al instante.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['accesos', 'invitaciones', 'encomiendas', 'bitacora', 'unidades', 'residentes',
                           'vehiculos', 'estacionamientos', 'lista_negra'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
