-- ===== Aplicar en Supabase (SQL Editor) — 2026-10-12 =====

-- 1) Migración: estacionamiento sin límite
-- Tiempo máximo de visita en estacionamiento opcional: null = sin límite (no hay alerta de exceso).
alter table public.condominios alter column max_minutos_estacionamiento drop not null;
alter table public.condominios alter column max_minutos_estacionamiento drop default;
alter table public.condominios drop constraint if exists condominios_max_minutos_estacionamiento_check;
alter table public.condominios add constraint condominios_max_minutos_estacionamiento_check
  check (max_minutos_estacionamiento is null or max_minutos_estacionamiento between 15 and 2880);

-- 2) Migración: cuenta compartida (part-time)
-- Cuenta de conserje compartida (ej. part-time): al entrar, quien está de turno escribe su nombre
-- y cada registro queda como "parttime (Nombre)".
alter table public.perfiles add column if not exists compartida boolean not null default false;
alter table public.perfiles add column if not exists nombre_turno text not null default '';

create or replace function public.usuario_actual()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.usuario || case when p.compartida and p.nombre_turno <> '' then ' (' || p.nombre_turno || ')' else '' end
    from public.perfiles p where p.id = auth.uid()
  ), '');
$$;

-- Quien usa una cuenta compartida fija (o borra, al salir) su nombre de turno.
create or replace function public.fijar_nombre_turno(p_nombre text)
returns void language plpgsql security definer set search_path = '' as $$
declare v text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
begin
  if v <> '' and length(v) not between 3 and 60 then
    raise exception 'El nombre debe tener entre 3 y 60 caracteres';
  end if;
  update public.perfiles set nombre_turno = v where id = auth.uid() and compartida;
  if not found then raise exception 'Esta cuenta no es compartida'; end if;
end;
$$;

-- Administración marca una cuenta de conserje como compartida.
create or replace function public.marcar_compartida(p_usuario uuid, p_compartida boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.administra_usuario(p_usuario) then raise exception 'No administras a ese usuario'; end if;
  update public.perfiles set compartida = coalesce(p_compartida, false), nombre_turno = ''
  where id = p_usuario and rol = 'conserje';
  if not found then raise exception 'Solo una cuenta de conserje puede ser compartida'; end if;
end;
$$;

revoke execute on function public.fijar_nombre_turno(text) from public, anon;
grant execute on function public.fijar_nombre_turno(text) to authenticated;
revoke execute on function public.marcar_compartida(uuid, boolean) from public, anon;
grant execute on function public.marcar_compartida(uuid, boolean) to authenticated;

-- 3) Las Palmas: sin tiempo máximo
update public.condominios set max_minutos_estacionamiento = null where nombre ilike '%palmas%';

-- 4) Estacionamientos de visita 1..15
insert into public.estacionamientos (condominio_id, codigo, tipo)
select c.id, n::text, 'visita'
from public.condominios c, generate_series(1, 15) n
where c.nombre ilike '%palmas%'
on conflict (condominio_id, codigo) do nothing;

-- 5) Revisión
select c.nombre, c.max_minutos_estacionamiento, e.tipo, count(*) as cantidad, string_agg(e.codigo, ', ' order by e.codigo) as codigos
from public.condominios c left join public.estacionamientos e on e.condominio_id = c.id
group by 1, 2, 3;
