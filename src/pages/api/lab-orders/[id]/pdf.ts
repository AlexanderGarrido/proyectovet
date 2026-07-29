import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { labOrders } from '../../../../db/schema/prescriptions';
import { patients, owners } from '../../../../db/schema/patients';
import { users } from '../../../../db/schema/users';
import { eq } from 'drizzle-orm';
import { renderToStream } from '@react-pdf/renderer';
import { createElement } from 'react';
import { LabOrderPDF } from '../../../../lib/pdf/lab-order-template';
import { requireUnscopedPermission } from '../../../../lib/guard';

// SEGURIDAD (IDOR): antes solo exigía sesión — cualquier tutor autenticado
// podía descargar el PDF de cualquier orden de examen ajena por su id.
export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  const guardErr = requireUnscopedPermission(user, 'lab-orders', 'read');
  if (guardErr) return guardErr;

  const id = Number(params.id);
  const [order] = await db
    .select({
      id: labOrders.id, type: labOrders.type, description: labOrders.description,
      status: labOrders.status, results: labOrders.results,
      requestedAt: labOrders.requestedAt, completedAt: labOrders.completedAt,
      patientName: patients.name, patientSpecies: patients.species,
      ownerFirstName: owners.firstName, ownerLastName: owners.lastName, ownerPhone: owners.phone,
      veterinarianName: users.name,
    })
    .from(labOrders)
    .leftJoin(patients, eq(labOrders.patientId, patients.id))
    .leftJoin(owners, eq(patients.ownerId, owners.id))
    .leftJoin(users, eq(labOrders.veterinarianId, users.id))
    .where(eq(labOrders.id, id));

  if (!order) return new Response('No encontrada', { status: 404 });

  const stream = await renderToStream(
    createElement(LabOrderPDF, {
      order: {
        ...order,
        requestedAt: order.requestedAt.toISOString(),
        completedAt: order.completedAt ? order.completedAt.toISOString() : null,
      },
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
      'Content-Disposition': `inline; filename="orden-examenes-${id}.pdf"`,
      'Content-Length': buffer.length.toString(),
    },
  });
};
