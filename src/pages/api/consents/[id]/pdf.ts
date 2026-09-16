import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { consentForms } from '../../../../db/schema/consents';
import { patients, owners } from '../../../../db/schema/patients';
import { users } from '../../../../db/schema/users';
import { eq } from 'drizzle-orm';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { ConsentPDF } from '../../../../lib/pdf/consent-template';
import { requirePermission } from '../../../../lib/guard';

export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  const guardErr = requirePermission(user, 'consents', 'read');
  if (guardErr) return guardErr;

  const id = Number(params.id);
  if (!id || isNaN(id)) return new Response('ID inválido', { status: 400 });

  const [consent] = await db
    .select({
      id: consentForms.id, type: consentForms.type, description: consentForms.description,
      signedByName: consentForms.signedByName, signedByRelation: consentForms.signedByRelation,
      signature: consentForms.signature, createdAt: consentForms.createdAt,
      patientName: patients.name,
      ownerFirstName: owners.firstName, ownerLastName: owners.lastName,
      veterinarianName: users.name,
    })
    .from(consentForms)
    .leftJoin(patients, eq(consentForms.patientId, patients.id))
    .leftJoin(owners, eq(patients.ownerId, owners.id))
    .leftJoin(users, eq(consentForms.veterinarianId, users.id))
    .where(eq(consentForms.id, id));

  if (!consent) return new Response('No encontrado', { status: 404 });

  const buffer = await renderToBuffer(
    createElement(ConsentPDF, { consent: { ...consent, createdAt: consent.createdAt.toISOString() } }) as ReactElement<DocumentProps>
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="consentimiento-${id}.pdf"`,
      'Content-Length': buffer.length.toString(),
    },
  });
};
