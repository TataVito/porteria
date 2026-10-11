import { useCallback, useState } from 'react';
import { Button, Cargando, Field, Input, ProveedorAvisos, Vacio } from '../components/ui.jsx';
import MiCuenta from '../components/MiCuenta.jsx';
import { ProveedorCondominio, useCondominio } from '../lib/CondominioContext.jsx';
import { configurado } from '../lib/supabase.js';
import { useSesion } from '../lib/useSesion.js';
import { useInactividad } from '../lib/useInactividad.js';
import { PREFIJO_APP, RAIZ } from '../lib/app.js';
import { nombreUnidad } from '../lib/formato.js';
import Residente from '../pages/residente/Residente.jsx';

// Mi Casa: la app de cada casa. Invita visitas con pase QR (la portería lo valida al instante),
// ve quién llegó y sus encomiendas. Usa la misma base que Portería.
export default function CasaApp() {
  if (!configurado) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <Vacio titulo="Falta configurar Supabase">Copia .env.example a .env.local y vuelve a iniciar.</Vacio>
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
  if (!sesion.conectado) return <LoginCasa login={sesion.login} />;
  if (!sesion.esResidente) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Vacio titulo="Esta es la app de las casas">
          Tu usuario es de conserjería o administración: usa la app de Portería.
          <span className="mt-4 flex justify-center gap-2">
            <a href={RAIZ} className="inline-flex min-h-[44px] items-center bg-marca px-4 font-bold text-white">
              Abrir Portería
            </a>
            <Button variant="secondary" onClick={() => sesion.logout()}>
              Salir
            </Button>
          </span>
        </Vacio>
      </div>
    );
  }
  return (
    <ProveedorCondominio perfil={sesion.perfil}>
      <Principal sesion={sesion} />
    </ProveedorCondominio>
  );
}

function Principal({ sesion }) {
  const { perfil } = sesion;
  const { activo, unidadPorId, cargandoCondominios } = useCondominio();
  const [cuenta, setCuenta] = useState(false);
  const unidad = unidadPorId.get(perfil.unidad_id);
  // Celular personal: la sesión dura 30 días sin uso.
  const salir = useCallback(() => sesion.logout('Se cerró la sesión por inactividad.'), [sesion]);
  useInactividad(30 * 24 * 60, salir);

  return (
    <div className="min-h-screen bg-papel">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b-4 border-acento bg-tinta px-3 text-white">
        <img src={`${RAIZ}logo.png`} alt="" className="h-10 w-10 rounded-full bg-white object-contain" />
        <div className="min-w-0 leading-tight">
          <p className="font-bold">{unidad ? `Casa ${nombreUnidad(unidad)}` : 'Mi Casa'}</p>
          <p className="truncate text-xs text-white/60">{activo?.nombre}</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setCuenta(true)} className="min-h-[40px] px-2 text-sm text-white/80 hover:text-white">
            Mi clave
          </button>
          <button type="button" onClick={() => sesion.logout()} className="min-h-[40px] border border-white/25 px-3 text-sm hover:bg-white/10">
            Salir
          </button>
        </div>
      </header>
      {cargandoCondominios ? <Cargando /> : !activo ? <Vacio titulo="Tu casa no está asociada a un condominio">Avisa a la administración.</Vacio> : <Residente perfil={perfil} />}
      <MiCuenta open={cuenta} onClose={() => setCuenta(false)} perfil={perfil} />
    </div>
  );
}

// Se entra con el número de casa (usuario "casa33") y la clave que entrega la administración.
function LoginCasa({ login }) {
  const [casa, setCasa] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso] = useState(() => {
    try {
      const m = sessionStorage.getItem(`${PREFIJO_APP}motivo_salida`);
      sessionStorage.removeItem(`${PREFIJO_APP}motivo_salida`);
      return m || '';
    } catch {
      return '';
    }
  });

  async function entrar(e) {
    e.preventDefault();
    const n = casa.trim().toLowerCase().replace(/\s+/g, '');
    if (!n || !clave) return;
    setEnviando(true);
    setError('');
    // "33" → casa33; un usuario personal (p.ej. "valvarez") se usa tal cual.
    const fallo = await login(/^\d/.test(n) ? `casa${n}` : n, clave);
    setEnviando(false);
    if (fallo) {
      setError(fallo === 'Usuario o clave incorrectos.' ? 'Número de casa o clave incorrectos.' : fallo);
      setClave('');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-papel px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src={`${RAIZ}logo.png`} alt="Condominio Las Palmas" className="mx-auto h-28 w-28 object-contain" />
          <h1 className="mt-3 text-2xl font-bold text-marca">Mi Casa</h1>
          <p className="text-sm text-gray-500">Condominio Las Palmas</p>
        </div>
        {aviso && <p className="mb-3 border border-[#B07A1E] bg-[#F6EBD4] px-3 py-2 text-sm text-[#5C3D06]">{aviso}</p>}
        <form onSubmit={entrar} className="space-y-4">
          <Field label="Número de casa (o tu usuario)" required>
            <Input
              value={casa}
              onChange={(e) => {
                setCasa(e.target.value);
                setError('');
              }}
                            autoComplete="username"
              placeholder="Ej: 33"
              required
              autoFocus
              className="min-h-[52px] text-center text-2xl font-bold"
            />
          </Field>
          <Field label="Clave" required>
            <Input
              type="password"
              value={clave}
              onChange={(e) => {
                setClave(e.target.value);
                setError('');
              }}
              autoComplete="current-password"
              required
              className="min-h-[52px] text-base"
            />
          </Field>
          {error && <p className="text-sm text-peligro">{error}</p>}
          <Button type="submit" className="min-h-[52px] w-full text-base" disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-gray-400">¿No tienes tu clave? Pídela a la administración del condominio.</p>
      </div>
    </div>
  );
}
