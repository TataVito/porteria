import { useState } from 'react';
import { Button, Field, Input, Modal, useAvisar } from './ui.jsx';
import { mensajeError, supabase } from '../lib/supabase.js';

// Cambio de la propia clave (Portería y Mi Casa).
export default function MiCuenta({ open, onClose, perfil }) {
  const avisar = useAvisar();
  const [clave, setClave] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  async function cambiar(e) {
    e.preventDefault();
    if (clave.length < 8) return setError('Mínimo 8 caracteres.');
    if (clave !== repetir) return setError('Las claves no coinciden.');
    const { error: err } = await supabase.auth.updateUser({ password: clave });
    if (err) return setError(/different|same/i.test(err.message) ? 'La clave nueva debe ser distinta de la actual.' : mensajeError(err));
    setClave('');
    setRepetir('');
    setError('');
    avisar('Clave cambiada');
    onClose();
  }
  return (
    <Modal open={open} onClose={onClose} title="Mi cuenta">
      <p className="mb-4 text-sm text-gray-600">
        Usuario <b>{perfil.usuario}</b> · {perfil.nombre}
      </p>
      <form onSubmit={cambiar} className="space-y-3">
        <Field label="Nueva clave">
          <Input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label="Repetir nueva clave">
          <Input type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password" required />
        </Field>
        {error && <p className="text-sm text-peligro">{error}</p>}
        <Button type="submit">Cambiar clave</Button>
      </form>
    </Modal>
  );
}
