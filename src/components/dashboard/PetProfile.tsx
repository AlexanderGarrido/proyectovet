import { useMemo, useState } from 'react';
import {
  ArrowLeft, Calendar, Syringe, FileText, FlaskConical, MapPin, X,
  PawPrint, Cake, Scale, Fingerprint, Mars, Venus, Download,
} from 'lucide-react';

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
  veterinarianName: string | null;
}

interface Appointment {
  id: number;
  scheduledAt: string;
  type: string;
  status: string;
  reason: string | null;
  visitAddress: string | null;
  veterinarianName: string | null;
}

interface Vaccine {
  id: number;
  name: string;
  brand: string | null;
  applicationDate: string;
  nextDoseDate: string | null;
  notes: string | null;
  veterinarianName: string | null;
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
  photo: string | null;
  notes: string | null;
  appointments: Appointment[];
  vaccines: Vaccine[];
  prescriptions: Prescription[];
  labOrders: LabOrder[];
}

const speciesEmoji: Record<string, string> = {
  perro: '🐶', gato: '🐱', ave: '🦜', reptil: '🦎', roedor: '🐹', conejo: '🐰', otro: '🐾',
};

const apptTypeLabels: Record<string, string> = {
  consulta: 'Consulta', vacunacion: 'Vacunación', cirugia: 'Cirugía', control: 'Control',
  emergencia: 'Emergencia', desparasitacion: 'Desparasitación', grooming: 'Grooming',
};

const apptStatusColors: Record<string, string> = {
  programada: 'bg-blue-100 text-blue-700', confirmada: 'bg-cyan-100 text-cyan-700',
  en_camino: 'bg-purple-100 text-purple-700', en_curso: 'bg-yellow-100 text-yellow-700',
  completada: 'bg-green-100 text-green-700', cancelada: 'bg-red-100 text-red-700',
  no_asistio: 'bg-gray-100 text-gray-600',
};
const apptStatusLabels: Record<string, string> = {
  programada: 'Programada', confirmada: 'Confirmada', en_camino: 'En camino',
  en_curso: 'En curso', completada: 'Completada', cancelada: 'Cancelada', no_asistio: 'No asistió',
};

const labTypeLabels: Record<string, string> = {
  hemograma: 'Hemograma', quimica_sanguinea: 'Química Sanguínea', urinalisis: 'Urianálisis',
  coproparasitario: 'Coproparasitario', radiografia: 'Radiografía', ecografia: 'Ecografía',
  cultivo: 'Cultivo y Antibiograma', otro: 'Otro',
};
const labStatusColors: Record<string, string> = {
  solicitado: 'bg-blue-100 text-blue-700', en_proceso: 'bg-yellow-100 text-yellow-700',
  completado: 'bg-green-100 text-green-700', cancelado: 'bg-red-100 text-red-700',
};
const labStatusLabels: Record<string, string> = {
  solicitado: 'Solicitado', en_proceso: 'En proceso', completado: 'Completado', cancelado: 'Cancelado',
};

const rxStatusColors: Record<string, string> = {
  activa: 'bg-green-100 text-green-700', completada: 'bg-blue-100 text-blue-700', cancelada: 'bg-red-100 text-red-700',
};
const rxStatusLabels: Record<string, string> = {
  activa: 'Activa', completada: 'Completada', cancelada: 'Cancelada',
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
}
function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function calcAge(dob: string | null): string | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years <= 0 && months <= 0) return 'Menos de 1 mes';
  if (years <= 0) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  if (months === 0) return `${years} ${years === 1 ? 'año' : 'años'}`;
  return `${years} ${years === 1 ? 'año' : 'años'} y ${months} ${months === 1 ? 'mes' : 'meses'}`;
}

type Filter = 'todo' | 'cita' | 'vacuna' | 'receta' | 'examen';

type TimelineEvent =
  | { kind: 'cita'; date: string; data: Appointment }
  | { kind: 'vacuna'; date: string; data: Vaccine }
  | { kind: 'receta'; date: string; data: Prescription }
  | { kind: 'examen'; date: string; data: LabOrder };

type Modal =
  | { kind: 'receta'; data: Prescription }
  | { kind: 'examen'; data: LabOrder }
  | { kind: 'vacuna'; data: Vaccine }
  | null;

const eventMeta: Record<Filter, { label: string; icon: typeof Calendar; dot: string }> = {
  todo: { label: 'Todo', icon: PawPrint, dot: '' },
  cita: { label: 'Visitas', icon: Calendar, dot: 'bg-blue-500' },
  vacuna: { label: 'Vacunas', icon: Syringe, dot: 'bg-green-500' },
  receta: { label: 'Recetas', icon: FileText, dot: 'bg-primary' },
  examen: { label: 'Exámenes', icon: FlaskConical, dot: 'bg-amber-500' },
};

export function PetProfile({ pet }: { pet: Pet }) {
  const [filter, setFilter] = useState<Filter>('todo');
  const [modal, setModal] = useState<Modal>(null);

  const age = calcAge(pet.dateOfBirth);
  const now = Date.now();

  // Próxima cita (la más cercana en el futuro que no esté cancelada).
  const nextAppt = useMemo(() => {
    return [...pet.appointments]
      .filter((a) => new Date(a.scheduledAt).getTime() >= now && a.status !== 'cancelada' && a.status !== 'completada')
      .sort((x, y) => new Date(x.scheduledAt).getTime() - new Date(y.scheduledAt).getTime())[0] || null;
  }, [pet.appointments]);

  // Línea de tiempo unificada (más reciente primero).
  const timeline = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = [
      ...pet.appointments.map((a) => ({ kind: 'cita' as const, date: a.scheduledAt, data: a })),
      ...pet.vaccines.map((v) => ({ kind: 'vacuna' as const, date: v.applicationDate, data: v })),
      ...pet.prescriptions.map((r) => ({ kind: 'receta' as const, date: r.date, data: r })),
      ...pet.labOrders.map((l) => ({ kind: 'examen' as const, date: l.requestedAt, data: l })),
    ];
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [pet]);

  const filtered = filter === 'todo' ? timeline : timeline.filter((e) => e.kind === filter);

  const counts = {
    cita: pet.appointments.length,
    vacuna: pet.vaccines.length,
    receta: pet.prescriptions.length,
    examen: pet.labOrders.length,
  };

  return (
    <div className="space-y-6">
      <a href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Volver al portal
      </a>

      {/* Cabecera de la mascota */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div className="w-28 h-28 rounded-2xl overflow-hidden border bg-muted flex items-center justify-center shrink-0">
            {pet.photo
              ? <img src={pet.photo} alt={pet.name} className="w-full h-full object-cover" />
              : <span className="text-5xl">{speciesEmoji[pet.species] || '🐾'}</span>}
          </div>
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <h2 className="text-2xl font-bold">{pet.name}</h2>
              {pet.sex === 'macho'
                ? <Mars className="h-5 w-5 text-blue-500" aria-label="Macho" />
                : pet.sex === 'hembra'
                ? <Venus className="h-5 w-5 text-pink-500" aria-label="Hembra" />
                : null}
            </div>
            <p className="text-muted-foreground capitalize mt-0.5">
              {pet.breed || pet.species}{pet.color ? ` · ${pet.color}` : ''}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <Stat icon={Cake} label="Edad" value={age || '—'} />
              <Stat icon={Scale} label="Peso" value={pet.weight ? `${pet.weight} kg` : '—'} />
              <Stat icon={PawPrint} label="Especie" value={pet.species} capitalize />
              <Stat icon={Fingerprint} label="Microchip" value={pet.microchipNumber || '—'} />
            </div>
            <div className="mt-4 flex justify-center sm:justify-start">
              <a
                href={`/api/patients/${pet.id}/vaccine-card`}
                target="_blank"
                rel="noopener noreferrer"
                data-astro-prefetch="false"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border hover:bg-muted/40 transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> Descargar carnet de vacunas
              </a>
            </div>
            {pet.notes && (
              <div className="mt-4 text-sm bg-muted/40 rounded-lg p-3 text-left">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notas</p>
                <p className="whitespace-pre-wrap">{pet.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Próxima cita destacada */}
      {nextAppt && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-primary">Próxima cita</h3>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{apptTypeLabels[nextAppt.type] || nextAppt.type}</p>
              <p className="text-sm text-muted-foreground capitalize">
                {new Date(nextAppt.scheduledAt).toLocaleDateString('es-CL', { weekday: 'long', day: '2-digit', month: 'long' })} · {fmtTime(nextAppt.scheduledAt)}
              </p>
              {nextAppt.visitAddress && (
                <p className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                  <MapPin className="h-3.5 w-3.5" /> {nextAppt.visitAddress}
                </p>
              )}
              {nextAppt.veterinarianName && (
                <p className="text-sm text-muted-foreground mt-0.5">Dr. {nextAppt.veterinarianName}</p>
              )}
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${apptStatusColors[nextAppt.status] || 'bg-gray-100'}`}>
              {apptStatusLabels[nextAppt.status] || nextAppt.status}
            </span>
          </div>
        </div>
      )}

      {/* Historial clínico */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold mb-4">Historial clínico</h3>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 mb-5">
          {(['todo', 'cita', 'vacuna', 'receta', 'examen'] as Filter[]).map((f) => {
            const meta = eventMeta[f];
            const Icon = meta.icon;
            const active = filter === f;
            const n = f === 'todo' ? timeline.length : counts[f];
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-muted/40 border-border'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {meta.label}
                <span className={`${active ? 'opacity-80' : 'text-muted-foreground'}`}>{n}</span>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {timeline.length === 0
              ? 'Aún no hay registros clínicos para esta mascota.'
              : 'No hay registros de este tipo.'}
          </p>
        ) : (
          <ol className="relative border-l border-border ml-2 space-y-5">
            {filtered.map((ev) => (
              <li key={`${ev.kind}-${ev.data.id}`} className="ml-5">
                <span className={`absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-card ${eventMeta[ev.kind].dot}`} />
                <TimelineCard ev={ev} onOpen={setModal} />
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Modal de detalle */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-card rounded-xl border w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">
                {modal.kind === 'receta' && `Receta · ${fmtDateShort(modal.data.date)}`}
                {modal.kind === 'examen' && (labTypeLabels[modal.data.type] || modal.data.type)}
                {modal.kind === 'vacuna' && modal.data.name}
              </h3>
              <button onClick={() => setModal(null)} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>

            {modal.kind === 'receta' && (
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

            {modal.kind === 'examen' && (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
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

            {modal.kind === 'vacuna' && (
              <div className="space-y-2 text-sm">
                {modal.data.brand && <p><span className="text-muted-foreground">Marca:</span> {modal.data.brand}</p>}
                <p><span className="text-muted-foreground">Aplicada:</span> {fmtDate(modal.data.applicationDate)}</p>
                {modal.data.nextDoseDate && <p><span className="text-muted-foreground">Próxima dosis:</span> {fmtDate(modal.data.nextDoseDate)}</p>}
                {modal.data.veterinarianName && <p><span className="text-muted-foreground">Veterinario:</span> {modal.data.veterinarianName}</p>}
                {modal.data.notes && (
                  <div className="bg-muted/30 rounded-lg p-3 mt-2">
                    <p className="whitespace-pre-wrap">{modal.data.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, capitalize }: { icon: typeof Calendar; label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-sm font-medium truncate ${capitalize ? 'capitalize' : ''}`}>{value}</p>
      </div>
    </div>
  );
}

function TimelineCard({ ev, onOpen }: { ev: TimelineEvent; onOpen: (m: Modal) => void }) {
  if (ev.kind === 'cita') {
    const a = ev.data;
    const isPast = new Date(a.scheduledAt).getTime() < Date.now();
    return (
      <div className="border rounded-lg px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{apptTypeLabels[a.type] || a.type}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${apptStatusColors[a.status] || 'bg-gray-100'}`}>
            {apptStatusLabels[a.status] || a.status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {fmtDateShort(a.scheduledAt)} · {fmtTime(a.scheduledAt)}{!isPast ? ' · próxima' : ''}
        </p>
        {a.reason && <p className="text-xs text-muted-foreground mt-0.5">{a.reason}</p>}
        {a.veterinarianName && <p className="text-xs text-muted-foreground mt-0.5">Dr. {a.veterinarianName}</p>}
      </div>
    );
  }

  if (ev.kind === 'vacuna') {
    const v = ev.data;
    return (
      <button onClick={() => onOpen({ kind: 'vacuna', data: v })} className="w-full text-left border rounded-lg px-3 py-2.5 hover:bg-muted/30 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">💉 {v.name}</span>
          <span className="text-xs text-primary">Ver →</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Aplicada {fmtDateShort(v.applicationDate)}{v.nextDoseDate ? ` · próxima dosis ${fmtDateShort(v.nextDoseDate)}` : ''}
        </p>
      </button>
    );
  }

  if (ev.kind === 'receta') {
    const r = ev.data;
    return (
      <button onClick={() => onOpen({ kind: 'receta', data: r })} className="w-full text-left border rounded-lg px-3 py-2.5 hover:bg-muted/30 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Receta médica</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rxStatusColors[r.status] || 'bg-gray-100'}`}>
            {rxStatusLabels[r.status] || r.status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {fmtDateShort(r.date)} · {r.items.length} medicamento{r.items.length === 1 ? '' : 's'}
        </p>
      </button>
    );
  }

  // examen
  const l = ev.data;
  return (
    <button onClick={() => onOpen({ kind: 'examen', data: l })} className="w-full text-left border rounded-lg px-3 py-2.5 hover:bg-muted/30 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{labTypeLabels[l.type] || l.type}</span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${labStatusColors[l.status] || 'bg-gray-100'}`}>
          {labStatusLabels[l.status] || l.status}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">
        {fmtDateShort(l.requestedAt)}{l.results ? ' · resultados disponibles' : ''}
      </p>
    </button>
  );
}
