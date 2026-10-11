import { useState } from 'react';
import { Badge, Card, Cargando, Select, Titulo, Vacio } from '../../components/ui.jsx';
import { useCondominio } from '../../lib/CondominioContext.jsx';
import { useConsulta } from '../../lib/useConsulta.js';
import { supabase } from '../../lib/supabase.js';
import { fechaHora } from '../../lib/formato.js';

const TABLAS = {
  accesos: 'Accesos',
  invitaciones: 'Invitaciones',
  encomiendas: 'Encomiendas',
  unidades: 'Unidades',
  residentes: 'Residentes',
  vehiculos: 'Vehículos',
  estacionamientos: 'Estacionamientos',
  lista_negra: 'Lista negra',
  condominios: 'Condominio',
  usuarios: 'Usuarios',
};
const IGNORAR = new Set(['id', 'condominio_id', 'creado_en', 'creado_por']);

// Registro inmutable de todo cambio (lo escribe la base; nadie lo puede editar ni borrar).
export default function Auditoria() {
  const { condominioId } = useCondominio();
  const [tabla, setTabla] = useState('');
  const [limite, setLimite] = useState(100);
  const { datos, cargando } = useConsulta(
    null,
    () => {
      let q = supabase.from('auditoria').select('*').eq('condominio_id', condominioId).order('fecha', { ascending: false }).limit(limite);
      if (tabla) q = q.eq('tabla', tabla);
      return q;
    },
    [condominioId, tabla, limite],
  );
  const filas = datos || [];
  return (
    <div>
      <Titulo sub="Quién creó, modificó o eliminó cada cosa y cuándo. No se puede alterar.">Auditoría</Titulo>
      <Select value={tabla} onChange={(e) => setTabla(e.target.value)} className="mb-3 max-w-xs">
        <option value="">Todo</option>
        {Object.entries(TABLAS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Select>
      {cargando && !datos ? (
        <Cargando />
      ) : filas.length === 0 ? (
        <Vacio titulo="Sin registros" />
      ) : (
        <Card className="divide-y divide-gray-100">
          {filas.map((a) => (
            <details key={a.id} className="px-3 py-2 text-sm">
              <summary className="cursor-pointer">
                <span className="font-mono text-xs text-gray-500">{fechaHora(a.fecha)}</span>{' '}
                <Badge tono={a.accion === 'eliminar' ? 'rojo' : a.accion === 'crear' ? 'verde' : 'gris'}>{a.accion}</Badge> {TABLAS[a.tabla] || a.tabla} ·{' '}
                <b>{a.usuario || 'sistema'}</b> <span className="text-gray-500">{resumen(a)}</span>
              </summary>
              <Diferencias antes={a.antes} despues={a.despues} />
            </details>
          ))}
          {filas.length >= limite && (
            <button type="button" className="w-full py-3 text-sm underline" onClick={() => setLimite((l) => l + 200)}>
              Ver más
            </button>
          )}
        </Card>
      )}
    </div>
  );
}

function resumen(a) {
  const f = a.despues || a.antes || {};
  return f.nombre || f.usuario || f.patente || f.codigo || f.numero || f.empresa || '';
}

function Diferencias({ antes, despues }) {
  const claves = [...new Set([...Object.keys(antes || {}), ...Object.keys(despues || {})])].filter((k) => !IGNORAR.has(k));
  const cambios = claves.filter((k) => JSON.stringify(antes?.[k]) !== JSON.stringify(despues?.[k]));
  const mostrar = antes && despues ? cambios : claves;
  return (
    <table className="mt-2 w-full text-xs">
      <tbody>
        {mostrar.map((k) => (
          <tr key={k} className="border-t border-gray-100">
            <td className="w-40 py-1 pr-2 font-mono text-gray-500">{k}</td>
            {antes && <td className="py-1 pr-2 text-peligroosc line-through">{fmt(antes[k])}</td>}
            {despues && <td className="py-1">{fmt(despues[k])}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
