import { useCallback, useEffect, useState } from 'react';
import { Button, Cargando, ProveedorAvisos, Vacio } from './components/ui.jsx';
import { ProveedorCondominio, useCondominio } from './lib/CondominioContext.jsx';
import { configurado } from './lib/supabase.js';
import { useSesion } from './lib/useSesion.js';
import { useInactividad } from './lib/useInactividad.js';
import { PREFIJO_APP, RAIZ } from './lib/app.js';
import Login from './pages/Login.jsx';
import NombreTurno from './pages/NombreTurno.jsx';
import MiCuenta from './components/MiCuenta.jsx';
import Porteria from './pages/porteria/Porteria.jsx';
import Panel from './pages/admin/Panel.jsx';
import Registro from './pages/admin/Registro.jsx';
import Unidades from './pages/admin/Unidades.jsx';
import Usuarios from './pages/admin/Usuarios.jsx';
import Auditoria from './pages/admin/Auditoria.jsx';
import { DatosCondominio, Estacionamientos, ListaNegra } from './pages/admin/Configuracion.jsx';

export default function App() {
  if (!configurado) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <Vacio titulo="Falta configurar Supabase">
          Copia <code>.env.example</code> a <code>.env.local</code> con la URL y la llave del proyecto, y vuelve a iniciar.
        </Vacio>
      </div>
    );
  }
  return (
    <ProveedorAvisos>
      <Raiz />
    </ProveedorAvisos>
  );
}

function Raiz() {
  const sesion = useSesion();
  if (sesion.cargando) return <Cargando />;
  if (!sesion.conectado) return <Login login={sesion.login} />;
  // Las casas usan su propia app (Mi Casa); esta es solo para conserjería y administración.
  if (sesion.esResidente) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Vacio titulo="Esta es la app de portería">
          Para invitar visitas y ver tus encomiendas usa la app <b>Mi Casa</b>.
          <span className="mt-4 flex justify-center gap-2">
            <a href={`${RAIZ}casa/`} className="inline-flex min-h-[44px] items-center bg-marca px-4 font-bold text-white">
              Abrir Mi Casa
            </a>
            <Button variant="secondary" onClick={() => sesion.logout()}>
              Salir
            </Button>
          </span>
        </Vacio>
      </div>
    );
  }
  if (sesion.perfil.rol === 'conserje' && sesion.perfil.compartida && !sesion.perfil.nombre_turno) {
    return <NombreTurno perfil={sesion.perfil} fijarTurno={sesion.fijarTurno} onCancelar={() => sesion.logout()} />;
  }
  return (
    <ProveedorCondominio perfil={sesion.perfil}>
      <Principal sesion={sesion} />
    </ProveedorCondominio>
  );
}

// Secciones por rol. La seguridad real la impone la base (RLS); esto solo ordena la pantalla.
function seccionesDe(sesion) {
  const s = [{ id: 'porteria', label: 'Portería' }];
  if (sesion.esAdmin) {
    s.unshift({ id: 'panel', label: 'Panel' });
    s.push(
      { id: 'registro', label: 'Historial' },
      { id: 'unidades', label: 'Casas' },
      { id: 'estacionamientos', label: 'Estacionamientos' },
      { id: 'lista_negra', label: 'Lista negra' },
      { id: 'usuarios', label: 'Usuarios' },
      { id: 'auditoria', label: 'Auditoría' },
      { id: 'condominio', label: 'Condominio' },
    );
  }
  return s;
}

function Principal({ sesion }) {
  const { perfil, esAdmin, esSuper } = sesion;
  const { condominios, activo, elegir, cargandoCondominios } = useCondominio();
  const secciones = seccionesDe(sesion);
  const [seccion, setSeccion] = useState(() => {
    try {
      const s = sessionStorage.getItem(`${PREFIJO_APP}seccion`);
      return secciones.some((x) => x.id === s) ? s : secciones[0]?.id;
    } catch {
      return secciones[0]?.id;
    }
  });
  const [menu, setMenu] = useState(false);
  const [cuenta, setCuenta] = useState(false);
  const [cambiarTurno, setCambiarTurno] = useState(false);

  useEffect(() => {
    try {
      if (seccion) sessionStorage.setItem(`${PREFIJO_APP}seccion`, seccion);
    } catch {
      // nada
    }
  }, [seccion]);

  // Conserjería: tablet compartida → 12 h (un turno). Administración: 8 h.
  const salirPorInactividad = useCallback(() => sesion.logout('Se cerró la sesión por inactividad.'), [sesion]);
  useInactividad(perfil.rol === 'conserje' ? 12 * 60 : 8 * 60, salirPorInactividad);

  const irA = (id) => {
    setSeccion(id);
    setMenu(false);
    window.scrollTo(0, 0);
  };
  const oscuro = seccion === 'porteria';

  if (cambiarTurno) {
    const fijar = async (nombre) => {
      const fallo = await sesion.fijarTurno(nombre);
      if (!fallo) setCambiarTurno(false);
      return fallo;
    };
    return <NombreTurno perfil={perfil} fijarTurno={fijar} onCancelar={() => setCambiarTurno(false)} textoCancelar="Volver" />;
  }

  return (
    <div className={`min-h-screen ${oscuro ? 'bg-[#1C1C20]' : 'bg-papel'}`}>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b-4 border-acento bg-tinta px-3 text-white">
        {secciones.length > 1 && (
          <button type="button" className="flex h-11 w-11 items-center justify-center text-2xl lg:hidden" onClick={() => setMenu((m) => !m)} aria-label="Menú">
            ☰
          </button>
        )}
        <img src={`${RAIZ}logo.png`} alt="" className="h-10 w-10 rounded-full bg-white object-contain" />
        <span className="hidden font-faenacond text-xl font-bold uppercase tracking-wide sm:inline">Portería</span>
        {condominios.length > 1 ? (
          <select
            value={activo?.id || ''}
            onChange={(e) => elegir(e.target.value)}
            className="min-h-[40px] max-w-[45vw] border border-white/25 bg-white/10 px-2 text-sm text-white [&>option]:text-tinta"
            aria-label="Condominio"
          >
            {condominios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        ) : (
          <span className="truncate text-sm text-white/70">{activo?.nombre}</span>
        )}
        <nav className="ml-2 hidden flex-1 items-center gap-0.5 overflow-x-auto lg:flex">
          {secciones.length > 1 &&
            secciones.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => irA(s.id)}
                className={`min-h-[40px] whitespace-nowrap px-3 text-sm ${seccion === s.id ? 'bg-white/15 font-bold' : 'text-white/70 hover:text-white'}`}
              >
                {s.label}
              </button>
            ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {perfil.rol === 'conserje' && perfil.compartida && (
            <button type="button" onClick={() => setCambiarTurno(true)} className="min-h-[40px] max-w-[40vw] truncate border border-acento px-2 text-sm" title="Cambiar quién está de turno">
              Turno: <b>{perfil.nombre_turno}</b>
            </button>
          )}
          <button type="button" onClick={() => setCuenta(true)} className="min-h-[40px] px-2 text-sm text-white/80 hover:text-white" title="Mi cuenta">
            {perfil.nombre || perfil.usuario}
          </button>
          <button type="button" onClick={() => sesion.logout()} className="min-h-[40px] border border-white/25 px-3 text-sm hover:bg-white/10">
            Salir
          </button>
        </div>
      </header>

      {menu && (
        <div className="fixed inset-0 top-14 z-40 bg-tinta/60 lg:hidden" onClick={() => setMenu(false)}>
          <nav className="w-72 max-w-[85vw] bg-white py-2 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {secciones.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => irA(s.id)}
                className={`block min-h-[48px] w-full border-l-4 px-4 text-left ${seccion === s.id ? 'border-marca bg-papel font-bold' : 'border-transparent'}`}
              >
                {s.label}
              </button>
            ))}
          </nav>
        </div>
      )}

      {cargandoCondominios ? (
        <Cargando />
      ) : !activo ? (
        <div className="mx-auto max-w-lg p-6">
          {esSuper ? (
            <DatosCondominio esSuper />
          ) : (
            <Vacio titulo="No tienes condominios asignados">Pide a la administración que te asigne uno.</Vacio>
          )}
        </div>
      ) : seccion === 'porteria' ? (
        <Porteria key={activo.id} esAdmin={esAdmin} />
      ) : (
        <main className="mx-auto max-w-6xl px-4 py-5">
          {seccion === 'panel' && <Panel irA={irA} />}
          {seccion === 'registro' && <Registro />}
          {seccion === 'unidades' && <Unidades />}
          {seccion === 'estacionamientos' && <Estacionamientos />}
          {seccion === 'lista_negra' && <ListaNegra />}
          {seccion === 'usuarios' && <Usuarios perfil={perfil} esSuper={esSuper} />}
          {seccion === 'auditoria' && <Auditoria />}
          {seccion === 'condominio' && <DatosCondominio esSuper={esSuper} />}
        </main>
      )}

      <MiCuenta open={cuenta} onClose={() => setCuenta(false)} perfil={perfil} />
    </div>
  );
}
