import { useMemo } from 'react';
import { Card, Titulo } from '../../components/ui.jsx';
import { useCondominio } from '../../lib/CondominioContext.jsx';
import { useAhora, useConsulta } from '../../lib/useConsulta.js';
import { supabase } from '../../lib/supabase.js';
import { TIPOS_ACCESO, diaCorto, diaDe, duracion, hora, hoyISO, inicioDelDia, minutosDesde, nombreUnidad, sumarDias } from '../../lib/formato.js';

const DIAS = 14;

// Resumen del condominio: ocupación ahora, movimiento de hoy y de las últimas dos semanas.
export default function Panel({ irA }) {
  const { activo, condominioId, estacionamientos, unidades, unidadPorId, estPorId } = useCondominio();
  const ahora = useAhora(60000);
  const hoy = hoyISO();
  const desde = sumarDias(hoy, -(DIAS - 1));

  const accesos = useConsulta(
    'panel_accesos',
    () =>
      supabase
        .from('accesos')
        .select('id, tipo, nombre, patente, unidad_id, estacionamiento_id, entrada_en, salida_en, autorizacion')
        .eq('condominio_id', condominioId)
        .or(`entrada_en.gte.${inicioDelDia(desde)},salida_en.is.null`)
        .order('entrada_en', { ascending: false })
        .limit(5000),
    [condominioId, desde],
    { condominioId, tablas: ['accesos'] },
  );
  const encomiendas = useConsulta(
    'panel_encomiendas',
    () => supabase.from('encomiendas').select('id, recibida_en').eq('condominio_id', condominioId).is('retirada_en', null),
    [condominioId],
    { condominioId, tablas: ['encomiendas'] },
  );
  const invitaciones = useConsulta(
    'panel_invitaciones',
    () => supabase.from('invitaciones').select('id').eq('condominio_id', condominioId).eq('estado', 'activa').lte('desde', hoy).gte('hasta', hoy),
    [condominioId, hoy],
    { condominioId, tablas: ['invitaciones'] },
  );

  const lista = useMemo(() => accesos.datos || [], [accesos.datos]);
  const dentro = lista.filter((a) => !a.salida_en);
  const deHoy = lista.filter((a) => diaDe(a.entrada_en) === hoy);
  const maxMin = activo?.max_minutos_estacionamiento || 240;
  const deVisita = estacionamientos.filter((e) => e.activo && e.tipo !== 'residente');
  const ocupados = dentro.filter((a) => a.estacionamiento_id);
  const excedidos = ocupados.filter((a) => minutosDesde(a.entrada_en, ahora) > maxMin);
  const encViejas = (encomiendas.datos || []).filter((e) => minutosDesde(e.recibida_en, ahora) > 3 * 24 * 60);

  const porDia = useMemo(() => {
    const m = new Map();
    for (let i = 0; i < DIAS; i++) m.set(sumarDias(desde, i), 0);
    for (const a of lista) {
      const d = diaDe(a.entrada_en);
      if (m.has(d)) m.set(d, m.get(d) + 1);
    }
    return [...m.entries()];
  }, [lista, desde]);
  const maxDia = Math.max(1, ...porDia.map(([, n]) => n));

  const porHora = useMemo(() => {
    const h = Array(24).fill(0);
    for (const a of lista) h[Number(hora(a.entrada_en).slice(0, 2))]++;
    return h;
  }, [lista]);
  const maxHora = Math.max(1, ...porHora);

  const porTipo = useMemo(() => {
    const m = {};
    for (const a of deHoy) m[a.tipo] = (m[a.tipo] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [deHoy]);

  return (
    <div>
      <Titulo sub={`${unidades.length} casas · ${deVisita.length} estacionamientos de visita`}>{activo?.nombre}</Titulo>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo="Adentro ahora" valor={dentro.length} onClick={() => irA('porteria')} />
        <Kpi titulo="Ingresos hoy" valor={deHoy.length} onClick={() => irA('registro')} />
        <Kpi titulo="Estacionamientos ocupados" valor={`${ocupados.length}/${deVisita.length}`} alerta={excedidos.length ? `${excedidos.length} excedido${excedidos.length > 1 ? 's' : ''}` : ''} onClick={() => irA('porteria')} />
        <Kpi titulo="Encomiendas por retirar" valor={(encomiendas.datos || []).length} alerta={encViejas.length ? `${encViejas.length} con +3 días` : ''} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <h3 className="mb-3 font-mono text-[11px] uppercase tracking-wide text-gray-500">Ingresos por día — últimos {DIAS} días</h3>
          <div className="flex h-44 items-end gap-1" role="img" aria-label="Ingresos por día">
            {porDia.map(([d, n]) => (
              <div key={d} className="group flex h-full flex-1 flex-col items-center justify-end" title={`${diaCorto(d)}: ${n}`}>
                <span className="mb-1 font-mono text-[10px] text-gray-500 opacity-0 group-hover:opacity-100">{n}</span>
                <div className={`w-full ${d === hoy ? 'bg-marca' : 'bg-tinta'} transition-all`} style={{ height: `${(n / maxDia) * 100}%`, minHeight: n ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            {porDia.map(([d]) => (
              <span key={d} className="flex-1 text-center font-mono text-[9px] text-gray-400">
                {d.slice(8)}
              </span>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 font-mono text-[11px] uppercase tracking-wide text-gray-500">Hoy por tipo</h3>
          {porTipo.length === 0 && <p className="text-sm text-gray-500">Sin ingresos todavía.</p>}
          <div className="space-y-2">
            {porTipo.map(([t, n]) => (
              <div key={t}>
                <div className="flex justify-between text-sm">
                  <span>{TIPOS_ACCESO[t]}</span>
                  <b>{n}</b>
                </div>
                <div className="mt-0.5 h-2 bg-gray-100">
                  <div className="h-2 bg-tinta" style={{ width: `${(n / deHoy.length) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-gray-500">{(invitaciones.datos || []).length} invitaciones vigentes hoy.</p>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <h3 className="mb-3 font-mono text-[11px] uppercase tracking-wide text-gray-500">Horas de más movimiento (últimos {DIAS} días)</h3>
          <div className="flex h-24 items-end gap-0.5">
            {porHora.map((n, h) => (
              <div key={h} className="flex h-full flex-1 flex-col justify-end" title={`${String(h).padStart(2, '0')}:00 — ${n}`}>
                <div className="w-full bg-[#2E5E8C]" style={{ height: `${(n / maxHora) * 100}%`, minHeight: n ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[9px] text-gray-400">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 font-mono text-[11px] uppercase tracking-wide text-gray-500">Estacionamiento excedido (+{duracion(maxMin)})</h3>
          {excedidos.length === 0 && <p className="text-sm text-gray-500">Ninguno.</p>}
          {excedidos.map((a) => (
            <p key={a.id} className="border-b border-gray-100 py-1.5 text-sm">
              <b>{estPorId.get(a.estacionamiento_id)?.codigo}</b> · {a.nombre} · {a.patente} · {duracion(minutosDesde(a.entrada_en, ahora))}
              {a.unidad_id && ` · casa ${nombreUnidad(unidadPorId.get(a.unidad_id))}`}
            </p>
          ))}
        </Card>
      </div>

      <Card className="mt-4 p-4">
        <h3 className="mb-3 font-mono text-[11px] uppercase tracking-wide text-gray-500">Últimos movimientos</h3>
        <div className="divide-y divide-gray-100">
          {lista.slice(0, 12).map((a) => (
            <div key={a.id} className="flex flex-wrap gap-x-3 py-2 text-sm">
              <span className="w-24 font-mono text-gray-500">{diaDe(a.entrada_en) === hoy ? hora(a.entrada_en) : diaCorto(diaDe(a.entrada_en))}</span>
              <span className="flex-1 font-medium">{a.nombre}</span>
              <span className="text-gray-500">
                {TIPOS_ACCESO[a.tipo]}
                {a.unidad_id && ` → ${nombreUnidad(unidadPorId.get(a.unidad_id))}`}
              </span>
              <span className={a.salida_en ? 'text-gray-400' : 'font-bold text-[#2F7D4F]'}>{a.salida_en ? `salió ${hora(a.salida_en)}` : 'adentro'}</span>
            </div>
          ))}
          {lista.length === 0 && <p className="text-sm text-gray-500">Sin movimientos todavía.</p>}
        </div>
      </Card>
    </div>
  );
}

function Kpi({ titulo, valor, alerta, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="border border-gray-300 bg-white p-4 text-left enabled:hover:border-tinta">
      <span className="block font-mono text-[11px] uppercase tracking-wide text-gray-500">{titulo}</span>
      <span className="text-3xl font-bold">{valor}</span>
      {alerta && <span className="mt-1 block text-xs font-bold text-[#B0581E]">{alerta}</span>}
    </button>
  );
}
