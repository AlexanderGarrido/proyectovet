import { useState } from 'react';
import { toast } from 'sonner';
import { FOLLOWUP_TEMPLATES, buildFollowupMessage, buildWhatsappLink, type FollowupTemplateId } from '../../lib/whatsapp';

const field = 'w-full rounded-lg border bg-background px-3 py-2.5 text-base sm:text-sm';
const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50';

/**
 * Prepara un mensaje de seguimiento y lo deja registrado en la ficha.
 *
 * Dos pasos separados a propósito: abrir WhatsApp no envía el mensaje —el
 * envío ocurre en la otra aplicación, y puede no ocurrir— así que el
 * registro «declarado enviado» lo confirma la persona, no el clic. No
 * existe el estado «entregado»: ninguna integración lo acredita hoy.
 */
export function FollowupComposer({ patientId, appointmentId, ownerName, patientName, phone, instructions, veterinarianName }: {
  patientId: number;
  appointmentId?: number;
  ownerName: string;
  patientName: string;
  phone?: string | null;
  instructions?: string;
  veterinarianName?: string;
}) {
  const [templateId, setTemplateId] = useState<FollowupTemplateId>('resumen');
  const [message, setMessage] = useState(() => buildFollowupMessage('resumen', { ownerName, patientName, instructions, veterinarianName }));
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState(false);

  const link = buildWhatsappLink(phone, message);

  function pick(id: FollowupTemplateId) {
    setTemplateId(id);
    setMessage(buildFollowupMessage(id, { ownerName, patientName, instructions, veterinarianName }));
    setPrepared(false);
  }

  async function record(status: 'preparado' | 'enviado_manual') {
    setBusy(true);
    try {
      const response = await fetch('/api/communications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId, appointmentId: appointmentId ?? null, channel: 'whatsapp', status,
          summary: FOLLOWUP_TEMPLATES.find((t) => t.id === templateId)?.label, body: message,
        }),
      });
      if (!response.ok) throw new Error('No se pudo registrar la comunicación');
      if (status === 'preparado') setPrepared(true);
      toast.success(status === 'enviado_manual' ? 'Registrado como enviado por ti' : 'Mensaje registrado como preparado');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo registrar la comunicación'); }
    finally { setBusy(false); }
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <h3 className="font-semibold">Seguimiento por WhatsApp</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {FOLLOWUP_TEMPLATES.map((template) => (
          <button
            key={template.id} type="button" aria-pressed={templateId === template.id} onClick={() => pick(template.id)}
            className={`min-h-11 rounded-full border px-3 py-1 text-sm ${templateId === template.id ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            {template.label}
          </button>
        ))}
      </div>

      <label className="mt-3 block text-sm font-medium">
        Mensaje (editable antes de enviar)
        <textarea className={`${field} mt-1`} rows={5} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={button} disabled={busy} onClick={() => record('preparado')}>
          Guardar como preparado
        </button>
        {link ? (
          <a className={`${button} bg-primary text-primary-foreground`} target="_blank" rel="noreferrer" href={link} onClick={() => setPrepared(true)}>
            Abrir WhatsApp ↗
          </a>
        ) : (
          <span className="text-sm text-muted-foreground">Sin teléfono válido registrado para este responsable.</span>
        )}
        <button type="button" className={button} disabled={busy || !prepared} onClick={() => record('enviado_manual')}>
          Ya lo envié
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Abrir el enlace no envía el mensaje ni acredita su entrega. «Ya lo envié» queda registrado como declaración tuya en la ficha.
      </p>
    </section>
  );
}
