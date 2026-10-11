import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';
import { guardarLocal, leerLocal } from './local.js';
import { useConsulta } from './useConsulta.js';

// Condominios que ve el usuario, el elegido y su "catálogo" (unidades, residentes, vehículos,
// estacionamientos, lista negra), compartido por todas las pantallas y actualizado en vivo.
const Ctx = createContext(null);

export function ProveedorCondominio({ perfil, children }) {
  const condominios = useConsulta('condominios', () => supabase.from('condominios').select('*').order('nombre'), [perfil.id]);

  const [elegidoId, setElegidoId] = useState(() => leerLocal('condominio_activo'));
  const lista = condominios.datos || [];
  const activo = lista.find((c) => c.id === elegidoId) || lista[0] || null;
  const condominioId = activo?.id;
  useEffect(() => {
    if (condominioId) guardarLocal('condominio_activo', condominioId);
  }, [condominioId]);

  const opciones = { condominioId };
  const deps = [condominioId];
  const sinCondominio = async () => ({ data: [], error: null });
  const esResidente = perfil.rol === 'residente';

  const unidades = useConsulta(
    'unidades',
    () => (condominioId ? supabase.from('unidades').select('*').eq('condominio_id', condominioId) : sinCondominio()),
    deps,
    { ...opciones, tablas: ['unidades'] },
  );
  const residentes = useConsulta(
    'residentes',
    () => (condominioId ? supabase.from('residentes').select('*').eq('condominio_id', condominioId).order('nombre') : sinCondominio()),
    deps,
    { ...opciones, tablas: ['residentes'] },
  );
  const vehiculos = useConsulta(
    'vehiculos',
    () => (condominioId ? supabase.from('vehiculos').select('*').eq('condominio_id', condominioId).order('patente') : sinCondominio()),
    deps,
    { ...opciones, tablas: ['vehiculos'] },
  );
  const estacionamientos = useConsulta(
    'estacionamientos',
    () => (condominioId ? supabase.from('estacionamientos').select('*').eq('condominio_id', condominioId) : sinCondominio()),
    deps,
    { ...opciones, tablas: ['estacionamientos'] },
  );
  const listaNegra = useConsulta(
    'lista_negra',
    () =>
      condominioId && !esResidente
        ? supabase.from('lista_negra').select('*').eq('condominio_id', condominioId).order('creado_en', { ascending: false })
        : sinCondominio(),
    [condominioId, esResidente],
    { ...opciones, tablas: esResidente ? [] : ['lista_negra'] },
  );

  const valor = useMemo(() => {
    const unidadPorId = new Map((unidades.datos || []).map((u) => [u.id, u]));
    const estPorId = new Map((estacionamientos.datos || []).map((e) => [e.id, e]));
    return {
      condominios: lista,
      cargandoCondominios: condominios.cargando && !condominios.datos,
      recargarCondominios: condominios.recargar,
      activo,
      condominioId,
      elegir: setElegidoId,
      unidades: unidades.datos || [],
      unidadPorId,
      residentes: residentes.datos || [],
      vehiculos: vehiculos.datos || [],
      estacionamientos: (estacionamientos.datos || []).slice().sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true })),
      estPorId,
      listaNegra: listaNegra.datos || [],
    };
  }, [lista, condominios.cargando, condominios.datos, condominios.recargar, activo, condominioId, unidades.datos, residentes.datos, vehiculos.datos, estacionamientos.datos, listaNegra.datos]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export const useCondominio = () => useContext(Ctx);
