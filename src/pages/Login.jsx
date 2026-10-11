import { useState } from 'react';
import { Button, Field, Input } from '../components/ui.jsx';
import { PREFIJO_APP, RAIZ } from '../lib/app.js';

export default function Login({ login }) {
  const [usuario, setUsuario] = useState('');
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

  async function submit(e) {
    e.preventDefault();
    if (!usuario.trim() || !clave) return;
    setEnviando(true);
    setError('');
    const fallo = await login(usuario, clave);
    setEnviando(false);
    if (fallo) {
      setError(fallo);
      setClave('');
    }
  }

  return (
    <div className="grid min-h-screen bg-papel lg:grid-cols-[1fr_480px]">
      <div className="relative hidden overflow-hidden bg-tinta lg:block">
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-white/50">Condominio Las Palmas · Control de acceso</p>
          <h1 className="mt-3 max-w-lg font-faenacond text-6xl font-bold uppercase leading-[0.95]">
            Portería,
            <br />
            visitas y
            <br />
            estacionamientos
          </h1>
          <div className="mt-6 h-1 w-24 bg-acento" />
          <p className="mt-6 max-w-md text-white/70">Pases con código QR, registro de entradas y salidas, encomiendas, lista negra y bitácora, en vivo para conserjería, administración y residentes.</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3">
            <img src={`${RAIZ}logo.png`} alt="Condominio Las Palmas" className="h-20 w-20 object-contain" />
            <div>
              <h1 className="text-xl font-bold text-marca">Portería Las Palmas</h1>
              <p className="text-xs text-gray-500">Condominio Las Palmas</p>
            </div>
          </div>
          {aviso && <p className="mb-3 border border-[#B07A1E] bg-[#F6EBD4] px-3 py-2 text-sm text-[#5C3D06]">{aviso}</p>}
          <form onSubmit={submit} className="space-y-4">
            <Field label="Usuario" required>
              <Input
                value={usuario}
                onChange={(e) => {
                  setUsuario(e.target.value);
                  setError('');
                }}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                autoFocus
                className="min-h-[48px] text-base"
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
                className="min-h-[48px] text-base"
              />
            </Field>
            {error && <p className="text-sm text-peligro">{error}</p>}
            <Button type="submit" className="min-h-[48px] w-full text-base" disabled={enviando}>
              {enviando ? 'Ingresando…' : 'Ingresar'}
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-gray-400">¿No tienes cuenta? Pídela a la administración de tu condominio.</p>
        </div>
      </div>
    </div>
  );
}
