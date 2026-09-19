import { useEffect, useState } from 'react';
import { FileText, Calendar, FlaskConical } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Skeleton } from '../ui/skeleton';
import { EmptyState } from '../ui/empty-state';
import { VaccineSection } from './VaccineSection';
import { PatientTimeline } from './PatientTimeline';
import { PatientAlertsPanel } from './PatientAlertsPanel';
import { ErrorState } from '../ui/error-state';
import { features } from '../../lib/features';

interface MedicalRecord {
  id: number;
  date: Date | string;
  reason: string;
  diagnosis: string | null;
}

interface Appointment {
  id: number;
  scheduledAt: Date | string;
  type: string;
  status: string;
  reason: string | null;
}

interface Prescription {
  id: number;
  date: string;
  status: string;
  veterinarianName: string | null;
}

interface LabOrder {
  id: number;
  type: string;
  status: string;
  requestedAt: string;
  results: string | null;
}

const typeLabels: Record<string, string> = {
  consulta: 'Consulta', vacunacion: 'Vacunación', cirugia: 'Cirugía',
  control: 'Control', emergencia: 'Emergencia', grooming: 'Grooming', desparasitacion: 'Desparasitación',
};

const apptStatusColors: Record<string, string> = {
  programada: 'bg-blue-100 text-blue-700', confirmada: 'bg-cyan-100 text-cyan-700',
  en_camino: 'bg-purple-100 text-purple-700', en_curso: 'bg-yellow-100 text-yellow-700',
  completada: 'bg-green-100 text-green-700', cancelada: 'bg-red-100 text-red-700',
  no_asistio: 'bg-gray-100 text-gray-600',
};

const rxStatusColors: Record<string, string> = {
  activa: 'bg-green-100 text-green-700', completada: 'bg-blue-100 text-blue-700', cancelada: 'bg-red-100 text-red-700',
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

interface Props {
  patientId: number;
  canEdit: boolean;
  records: MedicalRecord[];
  appointments: Appointment[];
}

export function PatientProfileTabs({ patientId, canEdit, records, appointments }: Props) {
  const [tab, setTab] = useState(features.cronologia ? 'cronologia' : 'historial');
  const [prescriptions, setPrescriptions] = useState<Prescription[] | null>(null);
  const [labOrders, setLabOrders] = useState<LabOrder[] | null>(null);
  // Un fallo de carga se distingue de «no hay nada»: convertirlo en lista
  // vacía hacía que una receta vigente pareciera inexistente.
  const [failed, setFailed] = useState<{ prescriptions: boolean; labOrders: boolean }>({ prescriptions: false, labOrders: false });

  function loadDocuments() {
    setFailed({ prescriptions: false, labOrders: false });
    fetch(`/api/prescriptions?patientId=${patientId}`)
      .then((r) => { if (!r.ok) throw new Error('recetas'); return r.json(); })
      .then(setPrescriptions)
      .catch(() => { setPrescriptions(null); setFailed((f) => ({ ...f, prescriptions: true })); });
    fetch(`/api/lab-orders?patientId=${patientId}`)
      .then((r) => { if (!r.ok) throw new Error('laboratorio'); return r.json(); })
      .then(setLabOrders)
      .catch(() => { setLabOrders(null); setFailed((f) => ({ ...f, labOrders: true })); });
  }

  useEffect(() => { loadDocuments(); }, [patientId]);

  return (
    <div className="space-y-4">
      <PatientAlertsPanel patientId={patientId} canEdit={canEdit} />
      <div className="rounded-xl border bg-card p-6">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          {features.cronologia && <TabsTrigger value="cronologia">Cronología</TabsTrigger>}
          <TabsTrigger value="historial">Historial ({records.length})</TabsTrigger>
          <TabsTrigger value="citas">Citas ({appointments.length})</TabsTrigger>
          <TabsTrigger value="vacunas">Vacunas</TabsTrigger>
          <TabsTrigger value="recetas">Recetas{prescriptions ? ` (${prescriptions.length})` : ''}</TabsTrigger>
          <TabsTrigger value="laboratorio">Laboratorio{labOrders ? ` (${labOrders.length})` : ''}</TabsTrigger>
        </TabsList>

        <TabsContent value="cronologia">
          <p className="mb-3 text-sm text-muted-foreground">
            Consultas, citas, vacunas, documentos, cobros y comunicaciones en orden, filtrables por tipo.
          </p>
          <PatientTimeline patientId={patientId} />
        </TabsContent>

        <TabsContent value="historial">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-muted-foreground">Registros médicos</span>
            <a href={`/historial/nuevo?patientId=${patientId}`} className="text-xs text-primary hover:underline">+ Nuevo registro</a>
          </div>
          {records.length === 0 ? (
            <EmptyState icon={FileText} title="Sin registros médicos" />
          ) : (
            <div className="space-y-2">
              {records.map((r) => (
                <a key={r.id} href={`/historial/${r.id}`} className="block border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{r.reason}</span>
                    <span className="text-xs text-muted-foreground">{format(new Date(r.date), 'dd/MM/yyyy', { locale: es })}</span>
                  </div>
                  {r.diagnosis && <p className="text-sm text-muted-foreground line-clamp-1">{r.diagnosis}</p>}
                </a>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="citas">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-muted-foreground">Citas registradas</span>
            <a href={`/citas/nueva?patientId=${patientId}`} className="text-xs text-primary hover:underline">+ Nueva cita</a>
          </div>
          {appointments.length === 0 ? (
            <EmptyState icon={Calendar} title="Sin citas registradas" />
          ) : (
            <div className="space-y-2">
              {appointments.map((a) => (
                <a key={a.id} href={`/citas/${a.id}`} className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{typeLabels[a.type] || a.type}</span>
                      <Badge className={apptStatusColors[a.status] || 'bg-gray-100 text-gray-700'}>{a.status}</Badge>
                    </div>
                    {a.reason && <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.reason}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">{format(new Date(a.scheduledAt), 'dd/MM/yyyy HH:mm', { locale: es })}</span>
                </a>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="vacunas" className="mt-0">
          <div className="-m-6">
            <VaccineSection patientId={patientId} canEdit={canEdit} />
          </div>
        </TabsContent>

        <TabsContent value="recetas">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-muted-foreground">Recetas emitidas</span>
            <a href={`/recetas/nueva?patientId=${patientId}`} className="text-xs text-primary hover:underline">+ Nueva receta</a>
          </div>
          {failed.prescriptions ? (
            <ErrorState title="No se pudieron cargar las recetas" description="No sabemos si este paciente tiene recetas vigentes." onRetry={loadDocuments} />
          ) : prescriptions === null ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : prescriptions.length === 0 ? (
            <EmptyState icon={FileText} title="Sin recetas registradas" />
          ) : (
            <div className="space-y-2">
              {prescriptions.map((rx) => (
                <a key={rx.id} href={`/recetas/${rx.id}`} className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                  <div>
                    <span className="text-sm font-medium">Receta médica</span>
                    {rx.veterinarianName && <span className="text-xs text-muted-foreground ml-2">· Dr. {rx.veterinarianName}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <Badge className={rxStatusColors[rx.status] || 'bg-gray-100 text-gray-700'}>{rx.status}</Badge>
                    <span className="text-xs text-muted-foreground">{format(new Date(rx.date), 'dd/MM/yyyy', { locale: es })}</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="laboratorio">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-muted-foreground">Órdenes de laboratorio</span>
            <a href={`/ordenes/nueva?patientId=${patientId}`} className="text-xs text-primary hover:underline">+ Nueva orden</a>
          </div>
          {failed.labOrders ? (
            <ErrorState title="No se pudieron cargar las órdenes de laboratorio" description="No sabemos si hay exámenes pendientes de revisar." onRetry={loadDocuments} />
          ) : labOrders === null ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : labOrders.length === 0 ? (
            <EmptyState icon={FlaskConical} title="Sin órdenes de laboratorio" />
          ) : (
            <div className="space-y-2">
              {labOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div>
                    <span className="text-sm font-medium">{labTypeLabels[o.type] || o.type}</span>
                    {o.results && <span className="text-xs text-muted-foreground ml-2">· Con resultados</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <Badge className={labStatusColors[o.status] || 'bg-gray-100 text-gray-700'}>{o.status}</Badge>
                    <span className="text-xs text-muted-foreground">{format(new Date(o.requestedAt), 'dd/MM/yyyy', { locale: es })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
