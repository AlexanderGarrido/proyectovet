import type { APIRoute } from 'astro';
import { db } from '../../../../db';
import { invoices, invoiceItems } from '../../../../db/schema/billing';
import { owners } from '../../../../db/schema/patients';
import { eq } from 'drizzle-orm';
import { renderToStream } from '@react-pdf/renderer';
import { createElement } from 'react';
import { InvoicePDF } from '../../../../lib/pdf/invoice-template';
import { requireUnscopedPermission } from '../../../../lib/guard';

// SEGURIDAD (IDOR): antes solo exigía sesión — cualquier tutor autenticado
// podía descargar el PDF de cualquier factura ajena por su id.
export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  const guardErr = requireUnscopedPermission(user, 'invoices', 'read');
  if (guardErr) return guardErr;

  const id = Number(params.id);
  const [inv] = await db
    .select({
      id: invoices.id, invoiceNumber: invoices.invoiceNumber, date: invoices.date,
      status: invoices.status, subtotal: invoices.subtotal, taxRate: invoices.taxRate,
      taxAmount: invoices.taxAmount, discount: invoices.discount, total: invoices.total,
      notes: invoices.notes,
      ownerFirstName: owners.firstName, ownerLastName: owners.lastName,
      ownerEmail: owners.email, ownerPhone: owners.phone,
    })
    .from(invoices)
    .leftJoin(owners, eq(invoices.ownerId, owners.id))
    .where(eq(invoices.id, id));

  if (!inv) return new Response('No encontrada', { status: 404 });

  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));

  const stream = await renderToStream(
    createElement(InvoicePDF, {
      invoice: { ...inv, date: inv.date.toISOString() },
      items: items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        subtotal: i.subtotal,
      })),
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
      'Content-Disposition': `inline; filename="factura-${inv.invoiceNumber}.pdf"`,
      'Content-Length': buffer.length.toString(),
    },
  });
};
