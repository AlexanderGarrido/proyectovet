import { useState, useEffect } from 'react';
import { Search, Plus, Calendar, Eye, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { buildWhatsappLink, buildAppointmentReminderMessage, appointmentTypeLabels } from '../../lib/whatsapp';
import { Skeleton } from '../ui/skeleton';
import { EmptyState } from '../ui/empty-state';

interface Appointment {
  id: number;
  scheduledAt: string;
  endAt: string;
  type: string;
  status: string;
  reason?: string;
  patientName?: string;
  patientSpecies?: string;
  ownerFirstName?: string;
  ownerLastName?: string;
  ownerPhone?: string | null;
  veterinarianName?: string;
}

const ACTIVE_STATUSES = ['programada', 'confirmada', 'en_camino', 'en_curso'];

function whatsappReminderLink(a: Appointment): string | null {
  if (!ACTIVE_STATUSES.includes(a.status)) return null;
  return buildWhatsappLink(
    a.ownerPhone,
    buildAppointmentReminderMessage({
      ownerName: `${a.ownerFirstName ?? ''} ${a.ownerLastName ?? ''}`.trim() || 'tutor/a',
      patientName: a.patientName || 'su mascota',
      appointmentDate: format(new Date(a.scheduledAt), "EEEE dd 'de' MMMM 'de' yyyy", { locale: es }),
      appointmentTime: format(new Date(a.scheduledAt), 'HH:mm'),
      appointmentTypeLabel: appointmentTypeLabels[a.type] || a.type,
      veterinarianName: a.veterinarianName || 'nuestro equipo',
    }),
  );
}

const statusColors: Record<string, string> = {
  programada: 'bg-blue-100 text-blue-700',
  confirmada: 'bg-cyan-100 text-cyan-700',
  en_camino: 'bg-purple-100 text-purple-700',
  en_curso: 'bg-yellow-100 text-yellow-700',
  completada: 'bg-green-100 text-green-700',
  cancelada: 'bg-red-100 text-red-700',
  no_asistio: 'bg-gray-100 text-gray-600',
};

const typeLabels: Record<string, string> = {
  consulta: 'Consulta', vacunacion: 'Vacunación', cirugia: 'Cirugía',
  control: 'Control', emergencia: 'Emergencia', desparasitacion: 'Desparasitación', grooming: 'Grooming',
};

export function AppointmentList() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchAppointments();
  }, [statusFilter]);

  async function fetchAppointments() {
    setLoading(true);
    const params = statusFilter ? `?status=${statusFilter}` : '';
    const res = await fetch(`/api/appointments${params}`);
    const data = await res.json();
    setAppointments(data);
    setLoading(false);
  }

  async function updateStatus(id: number, newStatus: string, currentStatus: string) {
    if (newStatus === 'cancelada' && currentStatus !== 'cancelada') {
      if (!window.confirm('¿Estás segura de cancelar esta cita? Esta acción no se puede deshacer.')) return;
    }
    const res = await fetch(`/api/appointments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const statusLabels: Record<string, string> = {
        programada: 'Programada', confirmada: 'Confirmada', en_camino: 'En camino',
        en_curso: 'En curso', completada: 'Completada', cancelada: 'Cancelada', no_asistio: 'No asistió',
      };
      toast.success(`Cita marcada como "${statusLabels[newStatus] || newStatus}"`);
    } else {
      toast.error('Error al actualizar el estado');
    }
    fetchAppointments();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filtrar por estado"
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Todos los estados</option>
          <option value="programada">Programadas</option>
          <option value="confirmada">Confirmadas</option>
          <option value="en_camino">En camino</option>
          <option value="en_curso">En curso</option>
          <option value="completada">Completadas</option>
          <option value="cancelada">Canceladas</option>
        </select>
        <div className="ml-auto">
          <a
            href="/citas/nueva"
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nueva Cita
          </a>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border overflow-hidden">
          <div className="bg-muted/50 p-3"><Skeleton className="h-4 w-32" /></div>
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-24 hidden sm:block" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : appointments.length === 0 ? (
        <EmptyState icon={Calendar} title="No hay citas registradas" />
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <caption className="sr-only">Lista de citas</caption>
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha y hora</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Paciente</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tutor</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Veterinario</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {appointments.map((a) => (
                <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{format(new Date(a.scheduledAt), 'dd/MM/yyyy', { locale: es })}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(a.scheduledAt), 'HH:mm')}</div>
                  </td>
                  <td className="px-4 py-3 font-medium">{a.patientName || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.ownerFirstName} {a.ownerLastName}</td>
                  <td className="px-4 py-3">{typeLabels[a.type] || a.type}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.veterinarianName || '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={a.status}
                      onChange={(e) => updateStatus(a.id, e.target.value, a.status)}
                      aria-label={`Cambiar estado de cita de ${a.patientName}`}
                      className={`text-xs px-2 py-1 rounded-full border-0 font-medium cursor-pointer ${statusColors[a.status] || 'bg-gray-100'}`}
                    >
                      <option value="programada">Programada</option>
                      <option value="confirmada">Confirmada</option>
                      <option value="en_camino">En camino</option>
                      <option value="en_curso">En curso</option>
                      <option value="completada">Completada</option>
                      <option value="cancelada">Cancelada</option>
                      <option value="no_asistio">No asistió</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {whatsappReminderLink(a) && (
                        <a
                          href={whatsappReminderLink(a)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Recordar por WhatsApp a ${a.ownerFirstName} ${a.ownerLastName}`}
                          className="flex items-center gap-1 text-xs font-medium hover:underline"
                          style={{ color: '#1DA851' }}
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                        </a>
                      )}
                      <a href={`/citas/${a.id}`} className="flex items-center gap-1 text-primary hover:underline text-xs">
                        <Eye className="h-3.5 w-3.5" /> Ver
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
