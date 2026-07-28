import { useEffect, useState } from 'react';
import { PawPrint, Calendar, Receipt, MapPin, Phone, Mail, AlertCircle, FileText, FlaskConical, X, HelpCircle } from 'lucide-react';
import { WhatsappCta } from '../common/WhatsappCta';
import { EditContactDialog } from './EditContactDialog';
import { AddPetDialog } from './AddPetDialog';

interface Owner {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

interface Pet {
  id: number;
  name: string;
  species: string;
  breed: string | null;
  color: string | null;
  sex: string;
  dateOfBirth: string | null;
  weight: string | null;
  microchipNumber: string | null;
  notes: string | null;
}

interface Appointment {
  id: number;
  scheduledAt: string;
  endAt: string;
  type: string;
  status: string;
  reason: string | null;
  visitAddress: string | null;
  veterinarianName: string | null;
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  date: string;
  total: string;
  status: string;
}

interface RxItem {
  medicationName: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  quantity: number | null;
  instructions: string | null;
}

interface Prescription {
  id: number;
  date: string;
  status: string;
  notes: string | null;
  patientName: string | null;
  veterinarianName: string | null;
  items: RxItem[];
}

interface LabOrder {
  id: number;
  type: string;
  description: string | null;
  status: string;
  results: string | null;
  requestedAt: string;
  completedAt: string | null;
  patientName: string | null;
  veterinarianName: string | null;
}

interface PortalData {
  owner: Owner | null;
  pets: Pet[];
  appointments: Appointment[];
  invoices: Invoice[];
  prescriptions: Prescription[];
  labOrders: LabOrder[];
}

const typeLabels: Record<string, string> = {
  consulta: 'Consulta', vacunacion: 'Vacunación', cirugia: 'Cirugía',
  control: 'Control', emergencia: 'Emergencia', desparasitacion: 'Desparasitación', grooming: 'Grooming',
};

const labTypeLabels: Record<string, string> = {
  hemograma: 'Hemograma', quimica_sanguinea: 'Química Sanguínea', urinalisis: 'Urianálisis',
  coproparasitario: 'Coproparasitario', radiografia: 'Radiografía', ecografia: 'Ecografía',
  cultivo: 'Cultivo y Antibiograma', otro: 'Otro',
};

const statusColors: Record<string, string> = {
  programada: 'bg-blue-100 text-blue-700', confirmada: 'bg-cyan-100 text-cyan-700',
  en_camino: 'bg-purple-100 text-purple-700', en_curso: 'bg-yellow-100 text-yellow-700',
  completada: 'bg-green-100 text-green-700', cancelada: 'bg-red-100 text-red-700',
  no_asistio: 'bg-gray-100 text-gray-600',
};

const statusLabels: Record<string, string> = {
  programada: 'Programada', confirmada: 'Confirmada', en_camino: 'En camino',
  en_curso: 'En curso', completada: 'Completada', cancelada: 'Cancelada', no_asistio: 'No asistió',
};

const rxStatusColors: Record<string, string> = {
  activa: 'bg-green-100 text-green-700', completada: 'bg-blue-100 text-blue-700', cancelada: 'bg-red-100 text-red-700',
};

const labStatusColors: Record<string, string> = {
  solicitado: 'bg-blue-100 text-blue-700', en_proceso: 'bg-yellow-100 text-yellow-700',
  completado: 'bg-green-100 text-green-700', cancelado: 'bg-red-100 text-red-700',
};
const labStatusLabels: Record<string, string> = {
  solicitado: 'Solicitado', en_proceso: 'En Proceso', completado: 'Completado', cancelado: 'Cancelado',
};

const invoiceStatusColors: Record<string, string> = {
  borrador: 'bg-gray-100 text-gray-600', emitida: 'bg-blue-100 text-blue-700',
  parcial: 'bg-orange-100 text-orange-700', anulada: 'bg-red-100 text-red-700',
};

const speciesEmoji: Record<string, string> = {
  perro: '🐶', gato: '🐱', ave: '🦜', reptil: '🦎', roedor: '🐹', conejo: '🐰', otro: '🐾',
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
}

type Modal =
  | { kind: 'rx'; data: Prescription }
  | { kind: 'lab'; data: LabOrder }
  | null;

export function ClientPortal() {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Modal>(null);

  function load() {
    fetch('/api/client/portal')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data?.owner) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <h3 className="font-semibold mb-1">Perfil no vinculado</h3>
        <p className="text-sm text-muted-foreground">
          Tu cuenta aún no está vinculada a un tutor en el sistema. Contacta a la clínica para que asocien tu perfil.
        </p>
      </div>
    );
  }

  const { owner, pets, appointments, invoices, prescriptions, labOrders } = data;

  return (
    <div className="space-y-6">
      {/* Guía de uso + datos de contacto */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 shrink-0">
            <HelpCircle className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold">Cómo usar tu portal</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <PawPrint className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <span>Toca el nombre de una mascota para ver su <strong className="text-foreground font-medium">ficha completa</strong>: vacunas, recetas, exámenes e historial de visitas.</span>
              </li>
              <li className="flex gap-2">
                <Calendar className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <span>Más abajo verás tus <strong className="text-foreground font-medium">próximas citas</strong>. Para agendar o cambiar una hora, escríbenos por WhatsApp.</span>
              </li>
              <li className="flex gap-2">
                <FileText className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <span>Toca una <strong className="text-foreground font-medium">receta</strong> o un <strong className="text-foreground font-medium">examen</strong> para ver los detalles y resultados.</span>
              </li>
            </ul>
            <div className="mt-4">
              <WhatsappCta variant="button" />
            </div>
          </div>
        </div>

        {/* Datos de contacto del tutor */}
        <div className="mt-5 pt-4 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {owner.phone && (
              <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {owner.phone}</span>
            )}
            {owner.email && (
              <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {owner.email}</span>
            )}
            {owner.address && (
              <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {owner.address}</span>
            )}
          </div>
          <EditContactDialog phone={owner.phone} address={owner.address} onSaved={load} />
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Pets */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <PawPrint className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Mis Mascotas</h3>
            <span className="text-xs text-muted-foreground">{pets.length} registradas</span>
            <div className="ml-auto">
              <AddPetDialog onSaved={load} />
            </div>
          </div>
          {pets.length === 0 ? (
            <div className="text-center py-2">
              <p className="text-sm text-muted-foreground mb-3">Aún no tienes mascotas registradas.</p>
              <AddPetDialog onSaved={load} />
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3">👉 Toca una mascota para ver toda su información.</p>
              <div className="space-y-2">
              {pets.map((pet) => (
                <a
                  key={pet.id}
                  href={`/dashboard/mascota/${pet.id}`}
                  className="w-full text-left flex items-center gap-3 border rounded-lg px-3 py-2.5 hover:bg-muted/30 transition-colors"
                >
                  <span className="text-xl">{speciesEmoji[pet.species] || '🐾'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{pet.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {pet.breed || pet.species} · {pet.sex}{pet.weight ? ` · ${pet.weight} kg` : ''}
                    </p>
                  </div>
                  <span className="text-xs text-primary">Ver ficha →</span>
                </a>
              ))}
              </div>
            </>
          )}
        </div>

        {/* Upcoming appointments */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Próximas Citas</h3>
          </div>
          {appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tienes citas próximas. Cuando agendes por WhatsApp, aparecerán aquí.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3">📅 Para agendar o reprogramar, escríbenos por WhatsApp.</p>
              <div className="space-y-2">
              {appointments.map((appt) => (
                <div key={appt.id} className="block border rounded-lg px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{typeLabels[appt.type] || appt.type}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[appt.status] || 'bg-gray-100'}`}>
                      {statusLabels[appt.status] || appt.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(appt.scheduledAt).toLocaleDateString('es-CL', { weekday: 'long', day: '2-digit', month: 'long' })}{' '}
                    {new Date(appt.scheduledAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {appt.visitAddress && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <MapPin className="h-3 w-3" /> {appt.visitAddress}
                    </p>
                  )}
                  {appt.veterinarianName && (
                    <p className="text-xs text-muted-foreground mt-0.5">Dr. {appt.veterinarianName}</p>
                  )}
                </div>
              ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Prescriptions */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Recetas</h3>
            <span className="ml-auto text-xs text-muted-foreground">{prescriptions.length}</span>
          </div>
          {prescriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay recetas registradas.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3">👉 Toca una receta para ver los medicamentos y cómo darlos.</p>
              <div className="space-y-2">
              {prescriptions.map((rx) => (
                <button
                  key={rx.id}
                  onClick={() => setModal({ kind: 'rx', data: rx })}
                  className="w-full text-left border rounded-lg px-3 py-2.5 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{rx.patientName || 'Mascota'}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rxStatusColors[rx.status] || 'bg-gray-100'}`}>
                      {rx.status.charAt(0).toUpperCase() + rx.status.slice(1)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {fmtDate(rx.date)} · {rx.items.length} medicamento{rx.items.length === 1 ? '' : 's'}
                  </p>
                </button>
              ))}
              </div>
            </>
          )}
        </div>

        {/* Lab orders */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <FlaskConical className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Órdenes de Examen</h3>
            <span className="ml-auto text-xs text-muted-foreground">{labOrders.length}</span>
          </div>
          {labOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay órdenes de examen registradas.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3">👉 Toca un examen para ver sus resultados e indicaciones.</p>
              <div className="space-y-2">
              {labOrders.map((lo) => (
                <button
                  key={lo.id}
                  onClick={() => setModal({ kind: 'lab', data: lo })}
                  className="w-full text-left border rounded-lg px-3 py-2.5 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{labTypeLabels[lo.type] || lo.type}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${labStatusColors[lo.status] || 'bg-gray-100'}`}>
                      {labStatusLabels[lo.status] || lo.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {lo.patientName || 'Mascota'} · {fmtDate(lo.requestedAt)}
                  </p>
                </button>
              ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Pending invoices */}
      {invoices.length > 0 && (
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="h-5 w-5 text-orange-500" />
            <h3 className="font-semibold">Facturas Pendientes</h3>
            <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
              {invoices.length} pendiente{invoices.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between border rounded-lg px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(inv.date)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${invoiceStatusColors[inv.status] || 'bg-gray-100'}`}>
                    {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                  </span>
                  <span className="text-sm font-semibold">${parseFloat(inv.total).toLocaleString('es-CL')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-card rounded-xl border w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">
                {modal.kind === 'rx' && `Receta · ${modal.data.patientName || 'Mascota'}`}
                {modal.kind === 'lab' && (labTypeLabels[modal.data.type] || modal.data.type)}
              </h3>
              <button onClick={() => setModal(null)} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>

            {modal.kind === 'rx' && (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>Fecha: <strong className="text-foreground">{fmtDate(modal.data.date)}</strong></span>
                  {modal.data.veterinarianName && <span>Veterinario: <strong className="text-foreground">{modal.data.veterinarianName}</strong></span>}
                </div>
                {modal.data.items.length === 0 ? (
                  <p className="text-muted-foreground">Sin medicamentos.</p>
                ) : (
                  modal.data.items.map((it, i) => (
                    <div key={i} className="border rounded-lg p-3">
                      <p className="font-medium">{i + 1}. {it.medicationName}</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                        {it.dosage && <span>Dosis: {it.dosage}</span>}
                        {it.frequency && <span>Frecuencia: {it.frequency}</span>}
                        {it.duration && <span>Duración: {it.duration}</span>}
                        {it.quantity != null && <span>Cantidad: {it.quantity}</span>}
                      </div>
                      {it.instructions && <p className="text-xs mt-1">{it.instructions}</p>}
                    </div>
                  ))
                )}
                {modal.data.notes && (
                  <div className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notas del veterinario</p>
                    <p className="whitespace-pre-wrap">{modal.data.notes}</p>
                  </div>
                )}
              </div>
            )}

            {modal.kind === 'lab' && (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                  <span>Mascota: <strong className="text-foreground">{modal.data.patientName || '—'}</strong></span>
                  <span>Solicitado: <strong className="text-foreground">{fmtDate(modal.data.requestedAt)}</strong></span>
                  <span>Estado: <strong className="text-foreground">{labStatusLabels[modal.data.status] || modal.data.status}</strong></span>
                </div>
                {modal.data.description && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Indicaciones</p>
                    <p className="bg-muted/30 rounded-lg p-3">{modal.data.description}</p>
                  </div>
                )}
                {modal.data.results ? (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Resultados</p>
                    <p className="bg-muted/30 rounded-lg p-3 whitespace-pre-wrap">{modal.data.results}</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Aún no hay resultados cargados.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
