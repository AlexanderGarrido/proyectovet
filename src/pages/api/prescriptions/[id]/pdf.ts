import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { prescriptions, prescriptionItems } from '../../../../db/schema/prescriptions';
import { patients, owners } from '../../../../db/schema/patients';
import { users } from '../../../../db/schema/users';
import { eq } from 'drizzle-orm';
import { renderToStream } from '@react-pdf/renderer';
import { createElement } from 'react';
import { PrescriptionPDF } from '../../../../lib/pdf/prescription-template';
import { requireUnscopedPermission } from '../../../../lib/guard';

// SEGURIDAD (IDOR): antes solo exigía sesión — cualquier tutor autenticado
// podía descargar el PDF de cualquier receta ajena por su id.
export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  const guardErr = requireUnscopedPermission(user, 'prescriptions', 'read');
  if (guardErr) return guardErr;

  const id = Number(params.id);
  const [rx] = await db
    .select({
      id: prescriptions.id, date: prescriptions.date, status: prescriptions.status, notes: prescriptions.notes,
      patientId: prescriptions.patientId, patientName: patients.name, patientSpecies: patients.species,
      ownerFirstName: owners.firstName, ownerLastName: owners.lastName, ownerPhone: owners.phone,
      veterinarianName: users.name,
    })
    .from(prescriptions)
    .leftJoin(patients, eq(prescriptions.patientId, patients.id))
    .leftJoin(owners, eq(patients.ownerId, owners.id))
    .leftJoin(users, eq(prescriptions.veterinarianId, users.id))
    .where(eq(prescriptions.id, id));

  if (!rx) return new Response('No encontrada', { status: 404 });

  const items = await db.select().from(prescriptionItems).where(eq(prescriptionItems.prescriptionId, id));

  const stream = await renderToStream(
    createElement(PrescriptionPDF, {
      prescription: { ...rx, date: rx.date.toISOString() },
      items,
    })
  );

  const chunks: Buffer[] = [];
  for await (const chunk of stream as any) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="receta-${id}.pdf"`,
      'Content-Length': buffer.length.toString(),
    },
  });
};
