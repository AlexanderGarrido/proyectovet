import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Clock, User, PawPrint, Stethoscope, FileText } from 'lucide-react';

interface Appointment {
  id: number;
  scheduledAt: string;
  endAt: string;
  type: string;
  status: string;
  reason: string | null;
  notes: string | null;
  patientName: string | null;
  patientSpecies: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  veterinarianName: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  programada:   'bg-blue-100 border-blue-300 text-blue-800',
  confirmada:   'bg-green-100 border-green-300 text-green-800',
  en_camino:    'bg-purple-100 border-purple-300 text-purple-800',
  en_curso:     'bg-yellow-100 border-yellow-300 text-yellow-800',
  completada:   'bg-gray-100 border-gray-300 text-gray-600',
  cancelada:    'bg-red-100 border-red-300 text-red-700',
};

const STATUS_LABEL: Record<string, string> = {
  programada:  'Programada',
  confirmada:  'Confirmada',
  en_camino:   'En camino',
  en_curso:    'En curso',
  completada:  'Completada',
  cancelada:   'Cancelada',
};

const TYPE_LABEL: Record<string, string> = {
  consulta:      'Consulta',
  vacunacion:    'Vacunación',
  cirugia:       'Cirugía',
  control:       'Control',
  emergencia:    'Emergencia',
  desparasitacion: 'Desparasitación',
};

const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
// JS getDay(): 0=Sun,1=Mon,...,6=Sat → display index 0=Mon...6=Sun
const JS_DAY_TO_IDX = [6, 0, 1, 2, 3, 4, 5];

const GRID_START = 7 * 60;   // 07:00
const GRID_END   = 21 * 60;  // 21:00
const GRID_RANGE = GRID_END - GRID_START;
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7..21

function timeToMinutes(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function ScheduleManager() {
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appointment | null>(null);

  useEffect(() => {
    fetchWeek();
  }, [weekStart]);

  async function fetchWeek() {
    setLoading(true);
    const from = weekStart.toISOString();
    const to = addDays(weekStart, 7).toISOString();
    const res = await fetch(`/api/appointments?from=${from}&to=${to}`);
    if (res.ok) setAppointments(await res.json());
    setLoading(false);
  }

  function prevWeek() { setWeekStart(d => addDays(d, -7)); }
  function nextWeek() { setWeekStart(d => addDays(d, 7)); }
  function goToday()  { setWeekStart(getWeekStart(new Date())); }

  // Group appointments by display day index (0=Mon..6=Sun)
  function getAppointmentsForDay(dayIdx: number): Appointment[] {
    const dayDate = addDays(weekStart, dayIdx);
    return appointments.filter(a => {
      const d = new Date(a.scheduledAt);
      return d.getFullYear() === dayDate.getFullYear() &&
             d.getMonth()     === dayDate.getMonth() &&
             d.getDate()      === dayDate.getDate();
    });
  }

  function blockStyle(a: Appointment) {
    const start = new Date(a.scheduledAt);
    const end   = new Date(a.endAt);
    const startMin = Math.max(timeToMinutes(start), GRID_START) - GRID_START;
    const endMin   = Math.min(timeToMinutes(end),   GRID_END)   - GRID_START;
    const top    = (startMin / GRID_RANGE) * 100;
    const height = Math.max(((endMin - startMin) / GRID_RANGE) * 100, 1.5);
    return { top: `${top}%`, height: `${height}%` };
  }

  const today = new Date();
  const isCurrentWeek = getWeekStart(today).getTime() === weekStart.getTime();

  const weekLabel = (() => {
    const end = addDays(weekStart, 6);
    return `${formatDateLabel(weekStart)} – ${formatDateLabel(end)}`;
  })();

  return (
    <div className="space-y-4">
      {/* Week navigation */}
      <div className="flex items-center gap-2">
        <button onClick={prevWeek} className="p-1.5 rounded-lg border hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button onClick={nextWeek} className="p-1.5 rounded-lg border hover:bg-muted transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium px-2">{weekLabel}</span>
        {!isCurrentWeek && (
          <button onClick={goToday} className="ml-2 text-xs px-3 py-1 rounded-lg border hover:bg-muted transition-colors">
            Hoy
          </button>
        )}
        {loading && <span className="text-xs text-muted-foreground ml-2">Cargando...</span>}
      </div>

      {/* Calendar grid */}
      <div className="rounded-xl border overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-8 border-b bg-muted/50">
          <div className="p-2 text-xs text-muted-foreground text-center border-r">Hora</div>
          {DAYS_SHORT.map((d, i) => {
            const colDate = addDays(weekStart, i);
            const isToday = colDate.toDateString() === today.toDateString();
            return (
              <div key={i} className={`p-2 text-center border-r last:border-r-0 ${isToday ? 'bg-primary/5' : ''}`}>
                <p className={`text-xs font-semibold ${isToday ? 'text-primary' : ''}`}>{d}</p>
                <p className={`text-xs mt-0.5 ${isToday ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                  {formatDateLabel(colDate)}
                </p>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="grid grid-cols-8" style={{ height: '504px' }}>
          {/* Hour labels */}
          <div className="border-r relative">
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute w-full border-t border-muted/50 flex items-start justify-center"
                style={{ top: `${((h * 60 - GRID_START) / GRID_RANGE) * 100}%` }}
              >
                <span className="text-xs text-muted-foreground px-1 -mt-2 bg-background">{h}:00</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS_SHORT.map((_, dayIdx) => {
            const dayAppts = getAppointmentsForDay(dayIdx);
            const colDate  = addDays(weekStart, dayIdx);
            const isToday  = colDate.toDateString() === today.toDateString();
            return (
              <div
                key={dayIdx}
                className={`relative border-r last:border-r-0 ${isToday ? 'bg-primary/5' : ''}`}
              >
                {/* Hour lines */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-muted/20"
                    style={{ top: `${((h * 60 - GRID_START) / GRID_RANGE) * 100}%` }}
                  />
                ))}

                {/* Appointment blocks */}
                {dayAppts.map(a => {
                  const style = STATUS_STYLES[a.status] || STATUS_STYLES.programada;
                  return (
                    <button
                      key={a.id}
                      className={`absolute inset-x-0.5 rounded border ${style} flex flex-col p-1 overflow-hidden text-left hover:brightness-95 transition-all cursor-pointer`}
                      style={blockStyle(a)}
                      onClick={() => setSelected(a)}
                    >
                      <p className="text-xs font-semibold leading-tight truncate">
                        {formatTime(new Date(a.scheduledAt))}
                      </p>
                      <p className="text-xs leading-tight truncate opacity-80">{a.patientName}</p>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Haz clic en una cita para ver sus detalles.</p>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-card rounded-xl border w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{TYPE_LABEL[selected.type] ?? selected.type}</h3>
                <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLES[selected.status]}`}>
                  {STATUS_LABEL[selected.status] ?? selected.status}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 rounded hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>
                  {new Date(selected.scheduledAt).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                  {' · '}
                  {formatTime(new Date(selected.scheduledAt))} – {formatTime(new Date(selected.endAt))}
                </span>
              </div>

              {selected.patientName && (
                <div className="flex items-center gap-2">
                  <PawPrint className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>
                    {selected.patientName}
                    {selected.patientSpecies && <span className="text-muted-foreground"> ({selected.patientSpecies})</span>}
                  </span>
                </div>
              )}

              {(selected.ownerFirstName || selected.ownerLastName) && (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{[selected.ownerFirstName, selected.ownerLastName].filter(Boolean).join(' ')}</span>
                </div>
              )}

              {selected.veterinarianName && (
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{selected.veterinarianName}</span>
                </div>
              )}

              {selected.reason && (
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{selected.reason}</span>
                </div>
              )}
            </div>

            <a
              href={`/citas/${selected.id}`}
              className="block w-full text-center px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Ver cita completa
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
