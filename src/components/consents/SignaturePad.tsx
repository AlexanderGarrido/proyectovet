import { useRef, useState, useEffect } from 'react';
import { Eraser } from 'lucide-react';

interface Props {
  onChange: (dataUrl: string | null) => void;
}

/**
 * Captura de firma manuscrita en un canvas táctil — pensado para firmar con
 * el dedo en una tablet/teléfono en el domicilio del tutor, no con mouse en
 * un escritorio. Exporta PNG base64 vía onChange; null mientras está vacío.
 */
export function SignaturePad({ onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Escala el canvas al tamaño real del contenedor en dispositivos de alta
    // densidad de píxeles, para que la firma no se vea pixelada.
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, []);

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasSignature) setHasSignature(true);
  }

  function stop() {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (hasSignature) onChange(canvasRef.current!.toDataURL('image/png'));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onChange(null);
  }

  return (
    <div>
      <div className="relative border-2 border-dashed rounded-lg bg-white">
        <canvas
          ref={canvasRef}
          className="w-full h-40 touch-none cursor-crosshair rounded-lg"
          onPointerDown={start}
          onPointerMove={draw}
          onPointerUp={stop}
          onPointerLeave={stop}
        />
        {!hasSignature && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none">
            Firme aquí con el dedo o el mouse
          </p>
        )}
      </div>
      <button type="button" onClick={clear}
        className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <Eraser className="h-3.5 w-3.5" /> Borrar firma
      </button>
    </div>
  );
}
