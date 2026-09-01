import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { patients, owners } from '../../../../db/schema/patients';
import { vaccines } from '../../../../db/schema/medical';
import { users } from '../../../../db/schema/users';
import { eq, and, desc } from 'drizzle-orm';
import { renderToStream } from '@react-pdf/renderer';
import { createElement } from 'react';
import { VaccineCardPDF } from '../../../../lib/pdf/vaccine-card-template';

const STAFF_ROLES = ['admin', 'veterinario', 'recepcionista'];

export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return new Response('No autorizado', { status: 401 });

  const patientId = Number(params.id);
  if (!Number.isInteger(patientId) || patientId <= 0) return new Response('Paciente inválido', { status: 400 });

  const [patient] = await db
    .select({
      id: patients.id, name: patients.name, species: patients.species, breed: patients.breed,
      sex: patients.sex, dateOfBirth: patients.dateOfBirth, color: patients.color,
      microchipNumber: patients.microchipNumber, ownerId: patients.ownerId,
      ownerFirstName: owners.firstName, ownerLastName: owners.lastName,
    })
    .from(patients)
    .leftJoin(owners, eq(patients.ownerId, owners.id))
    .where(eq(patients.id, patientId));

  if (!patient) return new Response('Paciente no encontrado', { status: 404 });

  if (!STAFF_ROLES.includes(user.role)) {
    return new Response('Sin permiso', { status: 403 });
  }

  const vaccineList = await db
    .select({
      name: vaccines.name, brand: vaccines.brand, batchNumber: vaccines.batchNumber,
      applicationDate: vaccines.applicationDate, nextDoseDate: vaccines.nextDoseDate,
      notes: vaccines.notes, veterinarianName: users.name,
    })
    .from(vaccines)
    .leftJoin(users, eq(vaccines.veterinarianId, users.id))
    .where(and(eq(vaccines.patientId, patientId)))
    .orderBy(desc(vaccines.applicationDate));

  const stream = await renderToStream(
    createElement(VaccineCardPDF, { pet: patient, vaccines: vaccineList })
  );

  const chunks: Buffer[] = [];
  for await (const chunk of stream as any) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="carnet-vacunas-${patient.name.replace(/\s+/g, '-').toLowerCase()}.pdf"`,
      'Content-Length': buffer.length.toString(),
    },
  });
};
