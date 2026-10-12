-- Tiempo máximo de visita en estacionamiento opcional: null = sin límite (no hay alerta de exceso).
alter table public.condominios alter column max_minutos_estacionamiento drop not null;
alter table public.condominios alter column max_minutos_estacionamiento drop default;
alter table public.condominios drop constraint if exists condominios_max_minutos_estacionamiento_check;
alter table public.condominios add constraint condominios_max_minutos_estacionamiento_check
  check (max_minutos_estacionamiento is null or max_minutos_estacionamiento between 15 and 2880);
