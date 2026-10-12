import { useState } from 'react';
import { Button, Field, Input } from '../components/ui.jsx';
import { RAIZ } from '../lib/app.js';

// Cuenta compartida (ej. part-time): antes de operar, quien está de turno escribe su nombre.
// Ese nombre queda en cada entrada, salida, encomienda y nota de bitácora.
export default function NombreTurno({ perfil, fijarTurno, onCancelar, textoCancelar = 'Salir' }) {
  const [nombre, setNombre] = useState(perfil.nombre_turno || '');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const v = nombre.trim().replace(/\s+/g, ' ');
    if (v.length < 3) return setError('Escribe tu nombre y apellido.');
    setEnviando(true);
    const fallo = await fijarTurno(v);
    setEnviando(false);
    if (fallo) setError(fallo);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-papel px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <img src={`${RAIZ}logo.png`} alt="" className="h-16 w-16 object-contain" />
          <div>
            <h1 className="text-xl font-bold text-marca">¿Quién está de turno?</h1>
            <p className="text-xs text-gray-500">Cuenta compartida «{perfil.usuario}»</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Tu nombre y apellido" required hint="Queda registrado en cada entrada, salida y encomienda que anotes.">
            <Input
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                setError('');
              }}
              maxLength={60}
              autoComplete="off"
              autoFocus
              required
              className="min-h-[48px] text-base"
            />
          </Field>
          {error && <p className="text-sm text-peligro">{error}</p>}
          <Button type="submit" className="min-h-[48px] w-full text-base" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Comenzar turno'}
          </Button>
          <Button variant="ghost" className="w-full" onClick={onCancelar}>
            {textoCancelar}
          </Button>
        </form>
      </div>
    </div>
  );
}
