-- La app es solo para Condominio Las Palmas: nadie crea ni elimina condominios desde el cliente,
-- ni siquiera el súper usuario. La administración solo edita los datos del suyo.
drop policy if exists "condominios: crear super" on public.condominios;
drop policy if exists "condominios: eliminar super" on public.condominios;
