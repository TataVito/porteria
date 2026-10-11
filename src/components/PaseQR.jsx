import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from './ui.jsx';
import { fechaCorta, mostrarPatente } from '../lib/formato.js';
import { RAIZ } from '../lib/app.js';

// Pase de visita: imagen con QR + código que el residente envía a su visita (WhatsApp, etc.).
// El QR contiene "PRT:<código>"; en portería también se puede escribir el código a mano.
const ANCHO = 720;
const ALTO = 1080;

function texto(ctx, t, x, y, fuente, color, alineado = 'center') {
  ctx.font = fuente;
  ctx.fillStyle = color;
  ctx.textAlign = alineado;
  ctx.fillText(t, x, y);
}

function cortar(ctx, t, max) {
  if (ctx.measureText(t).width <= max) return t;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

async function dibujarPase(lienzo, { invitacion, condominio, unidad, logo }) {
  const ctx = lienzo.getContext('2d');
  lienzo.width = ANCHO;
  lienzo.height = ALTO;
  ctx.fillStyle = '#F5F3EE';
  ctx.fillRect(0, 0, ANCHO, ALTO);

  // Encabezado
  ctx.fillStyle = '#26262B';
  ctx.fillRect(0, 0, ANCHO, 150);
  ctx.fillStyle = '#E39B4F';
  ctx.fillRect(0, 150, ANCHO, 10);
  if (logo) {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(85, 75, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(logo, 33, 23, 104, 104);
  }
  texto(ctx, 'PASE DE VISITA', 155, 75, '700 40px "DM Sans", sans-serif', '#FFFFFF', 'left');
  ctx.font = '400 26px "DM Sans", sans-serif';
  texto(ctx, cortar(ctx, condominio?.nombre || '', ANCHO - 200), 155, 115, '400 26px "DM Sans", sans-serif', '#CBC7BE', 'left');

  // Visita
  ctx.font = '700 46px "DM Sans", sans-serif';
  texto(ctx, cortar(ctx, invitacion.nombre, ANCHO - 80), ANCHO / 2, 240, '700 46px "DM Sans", sans-serif', '#26262B');
  const detalle = [`Casa ${unidad}`, invitacion.patente ? `Patente ${mostrarPatente(invitacion.patente)}` : ''].filter(Boolean).join('  ·  ');
  texto(ctx, detalle, ANCHO / 2, 290, '400 28px "DM Sans", sans-serif', '#4A4844');

  // QR
  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, `PRT:${invitacion.codigo}`, { width: 440, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#26262B', light: '#FFFFFF' } });
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(130, 320, 460, 460);
  ctx.strokeStyle = '#26262B';
  ctx.lineWidth = 2;
  ctx.strokeRect(130, 320, 460, 460);
  ctx.drawImage(qr, 140, 330, 440, 440);

  // Código
  texto(ctx, 'CÓDIGO', ANCHO / 2, 840, '500 22px "DM Mono", monospace', '#8F8B82');
  texto(ctx, invitacion.codigo.split('').join(' '), ANCHO / 2, 910, '500 64px "DM Mono", monospace', '#2E7D32');

  // Vigencia
  const vig =
    invitacion.desde === invitacion.hasta
      ? `Válido el ${fechaCorta(invitacion.desde)}`
      : `Válido del ${fechaCorta(invitacion.desde)} al ${fechaCorta(invitacion.hasta)}`;
  texto(ctx, vig + (invitacion.frecuencia === 'frecuente' ? ' (1 ingreso por día)' : ' (un solo ingreso)'), ANCHO / 2, 975, '400 26px "DM Sans", sans-serif', '#26262B');
  texto(ctx, 'Muestra este código en conserjería al llegar.', ANCHO / 2, 1030, '400 22px "DM Sans", sans-serif', '#8F8B82');
}

function cargarLogo() {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = `${RAIZ}logo.png`;
  });
}

export default function PaseQR({ invitacion, condominio, unidad }) {
  const lienzo = useRef(null);
  const [listo, setListo] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    let vigente = true;
    setListo(false);
    (async () => {
      await document.fonts?.ready;
      const logo = await cargarLogo();
      if (!vigente || !lienzo.current) return;
      await dibujarPase(lienzo.current, { invitacion, condominio, unidad, logo });
      if (vigente) setListo(true);
    })();
    return () => {
      vigente = false;
    };
  }, [invitacion, condominio, unidad]);

  const nombreArchivo = `pase-${invitacion.codigo}.png`;
  const textoMensaje =
    `Hola ${invitacion.nombre.split(' ')[0]}, te dejo tu pase para ${condominio?.nombre || 'el condominio'} (casa ${unidad}). ` +
    `Al llegar muestra el QR o di el código ${invitacion.codigo} en conserjería.` +
    (condominio?.direccion ? ` Dirección: ${condominio.direccion}${condominio.comuna ? `, ${condominio.comuna}` : ''}.` : '');

  async function archivo() {
    const blob = await new Promise((ok) => lienzo.current.toBlob(ok, 'image/png'));
    return new File([blob], nombreArchivo, { type: 'image/png' });
  }

  async function compartir() {
    setMensaje('');
    try {
      const f = await archivo();
      if (navigator.canShare?.({ files: [f] })) {
        await navigator.share({ files: [f], text: textoMensaje, title: 'Pase de visita' });
        return;
      }
      descargar(f);
      window.open(`https://wa.me/?text=${encodeURIComponent(textoMensaje)}`, '_blank', 'noopener');
      setMensaje('Se descargó la imagen del pase: adjúntala en el chat que se abrió.');
    } catch (e) {
      if (e?.name !== 'AbortError') setMensaje('No se pudo compartir. Descarga la imagen y envíala.');
    }
  }

  function descargar(f) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div>
      <canvas ref={lienzo} className="mx-auto block h-auto w-full max-w-[300px] border border-gray-300" aria-label={`Pase con código ${invitacion.codigo}`} />
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button onClick={compartir} disabled={!listo}>
          Compartir pase
        </Button>
        <Button variant="secondary" disabled={!listo} onClick={async () => descargar(await archivo())}>
          Descargar imagen
        </Button>
      </div>
      <button
        type="button"
        className="mt-2 w-full py-2 text-center text-sm text-gray-500 underline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(textoMensaje);
            setMensaje('Mensaje copiado.');
          } catch {
            setMensaje(textoMensaje);
          }
        }}
      >
        Copiar mensaje con el código
      </button>
      {mensaje && <p className="mt-2 text-center text-sm text-gray-600">{mensaje}</p>}
    </div>
  );
}
