# Baseline technical quality implementation — 2026-09-16

Implemented in existing flows:

- Patient payloads accept notes/isActive, normalize missing sex to desconocido, persist owner changes, represent decimal weight as a string for Drizzle, preserve omitted birth date/weight during partial updates, and allow clearing photos. Patient list/detail include ownerAddress for appointment context.
- Appointment API accepts explicit ISO timestamps with offsets, validates patient-owner linkage and active veterinarian, validates merged time ranges on partial edits, and rejects overlapping active appointments with 409. Creation and update use the same PostgreSQL transaction advisory lock (764210) to serialize schedule writers. Interval overlap uses strict comparisons so adjacent appointments remain possible. Cancelled/no-show appointments do not block scheduling.
- Veterinarian appointment list/detail/update/cancel are restricted to their assignment; administrator/reception retain clinic scope.
- Linked legacy medical record creation rejects appointments of another patient or assigned veterinarian. Prescription/lab-order creation rejects medical records belonging to another patient.
- Legacy medical form handles failed requests with try/catch/finally, retains editable data, catches initial fetch failures, scopes IndexedDB keys to staff user, and only reports successful draft storage after actual transaction completion. Storage failure returns false; write handles close afterward.
- All five PDF routes use typed renderToBuffer inputs and Uint8Array response bodies instead of untyped stream iteration. Recharts handles optional tooltip/percent values.

Verification:

- 119 targeted tests passed across schemas, PUT validation, assignment/RBAC regressions, and initial appointment integrity cases.
- 13 additional draft persistence / IDOR tests passed.
- Appointment integrity suite expanded to 7 tests and passed, including invalid timestamps, wrong owner, inactive vet, conflict, successful insert, merged partial-date rejection, and assignment rejection.
- TypeScript validation reports no errors in these owned files. At last check the only remaining diagnostic was VisitWorkspace.tsx files.map(compressImage), reported to the coordinating agent.
- No database operations, migrations, git mutations, or deployment performed. PostgreSQL overlap concurrency was reviewed structurally and covered through transaction mocks; no live DB integration test was run.
- Direct graphify query was attempted but the graphify executable is unavailable on PATH. Coordinating agent owns final graph hook rebuild and full-project checks.


## Billing integration follow-up

- Legacy invoice creation now locks the linked appointment with SELECT FOR UPDATE, validates its context inside the transaction, and rejects a second active invoice with HTTP 409 plus invoiceId. It uses the same appointment lock as visit finalization.
- Legacy manual payments now read invoice and balance, insert payment, and update status in one transaction with an invoice FOR UPDATE lock.
- Mercado Pago webhook now locks invoice before checking provider-reference idempotency and rereading balance; payment/status changes commit atomically, and audit occurs after commit. Positive amount validation and a 409 reconciliation response prevent applying provider payments above the current balance.
- 19 targeted billing/webhook/IDOR tests passed, including existing-charge rejection with returned id and concurrent-writer balance guard under lock. Live PostgreSQL concurrency was not executed.
