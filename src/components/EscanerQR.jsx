import { useEffect, useRef, useState } from 'react';
import { Modal } from './ui.jsx';

// Lee un código QR con la cámara trasera. Usa el lector nativo del navegador si existe
// (más rápido) y si no, jsQR. Devuelve el texto leído con onLeido.
export default function EscanerQR({ open, onClose, onLeido }) {
  const video = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    let flujo = null;
    let activo = true;
    let cuadro = 0;
    setError('');

    async function iniciar() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no permite usar la cámara. Escribe el código a mano.');
        return;
      }
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        setError(
          /NotAllowed|Permission/i.test(e.name)
            ? 'Sin permiso para usar la cámara. Actívalo en el candado de la barra de direcciones.'
            : 'No se pudo abrir la cámara.',
        );
        return;
      }
      if (!activo) {
        flujo.getTracks().forEach((t) => t.stop());
        return;
      }
      const v = video.current;
      v.srcObject = flujo;
      await v.play().catch(() => {});

      let detector = null;
      if ('BarcodeDetector' in window) {
        try {
          const formatos = await window.BarcodeDetector.getSupportedFormats();
          if (formatos.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        } catch {
          detector = null;
        }
      }
      const jsQR = detector ? null : (await import('jsqr')).default;
      const lienzo = document.createElement('canvas');
      const ctx = lienzo.getContext('2d', { willReadFrequently: true });

      const leer = async () => {
        if (!activo) return;
        if (v.readyState >= 2 && v.videoWidth) {
          try {
            let texto = null;
            if (detector) {
              const r = await detector.detect(v);
              texto = r[0]?.rawValue || null;
            } else {
              // Se lee una versión reducida: suficiente para un QR en pantalla y mucho más rápido.
              const escala = Math.min(1, 640 / v.videoWidth);
              lienzo.width = Math.round(v.videoWidth * escala);
              lienzo.height = Math.round(v.videoHeight * escala);
              ctx.drawImage(v, 0, 0, lienzo.width, lienzo.height);
              const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
              texto = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data || null;
            }
            if (texto && activo) {
              activo = false;
              if (navigator.vibrate) navigator.vibrate(80);
              onLeido(texto);
              return;
            }
          } catch {
            // cuadro ilegible: se sigue intentando
          }
        }
        cuadro = requestAnimationFrame(leer);
      };
      leer();
    }
    iniciar();

    return () => {
      activo = false;
      cancelAnimationFrame(cuadro);
      if (flujo) flujo.getTracks().forEach((t) => t.stop());
    };
  }, [open, onLeido]);

  return (
    <Modal open={open} onClose={onClose} title="Escanear pase QR">
      {error ? (
        <p className="py-6 text-center text-sm text-peligroosc">{error}</p>
      ) : (
        <div className="relative overflow-hidden bg-black">
          <video ref={video} playsInline muted className="block aspect-[4/3] w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-56 w-56 border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        </div>
      )}
      <p className="mt-3 text-center text-sm text-gray-500">Apunta la cámara al código QR del pase de la visita.</p>
    </Modal>
  );
}
