import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Clock, User, PawPrint, Stethoscope, FileText, MapPin, Calendar } from 'lucide-react';
import { googleMapsUrl, wazeUrl, appleMapsUrl } from '../../lib/maps';

interface Appointment {
  id: number;
  scheduledAt: string;
  endAt: string;
  type: string;
  status: string;
  reason: string | null;
  notes: string | null;
  visitAddress: string | null;
  patientName: string | null;
  patientSpecies: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  veterinarianName: string | null;
}

// Paleta café claro — texto blanco
const STATUS_COLOR: Record<string, { solid: string; light: string; label: string }> = {
  programada: { solid: 'bg-amber-700',  light: 'bg-amber-50 text-amber-800 border-amber-200',  label: 'Programada' },
  confirmada: { solid: 'bg-amber-800',  light: 'bg-amber-50 text-amber-900 border-amber-300',  label: 'Confirmada' },
  en_camino:  { solid: 'bg-stone-600',  light: 'bg-stone-50 text-stone-700 border-stone-200',  label: 'En camino'  },
  en_curso:   { solid: 'bg-amber-600',  light: 'bg-amber-50 text-amber-700 border-amber-200',  label: 'En curso'   },
  completada: { solid: 'bg-stone-400',  light: 'bg-stone-50 text-stone-600 border-stone-200',  label: 'Completada' },
  cancelada:  { solid: 'bg-stone-300',  light: 'bg-stone-50 text-stone-500 border-stone-200',  label: 'Cancelada'  },
};

const TYPE_LABEL: Record<string, string> = {
  consulta: 'Consulta', vacunacion: 'Vacunación', cirugia: 'Cirugía',
  control: 'Control', emergencia: 'Emergencia', desparasitacion: 'Desparasitación',
};

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const GRID_START = 7 * 60;
const GRID_END   = 21 * 60;
const GRID_RANGE = GRID_END - GRID_START;
const HOURS      = Array.from({ length: 15 }, (_, i) => i + 7);

function toMin(d: Date) { return d.getHours() * 60 + d.getMinutes(); }
function hhmm(d: Date)  { return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function getWeekStart(d: Date) {
  const r = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() + (day === 0 ? -6 : 1 - day));
  r.setHours(0,0,0,0);
  return r;
}
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

export function AppointmentCalendar() {
  const [weekStart, setWeekStart]       = useState(() => getWeekStart(new Date()));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState<Appointment | null>(null);
  useEffect(() => { fetchWeek(); }, [weekStart]);

  async function fetchWeek() {
    setLoading(true);
    const res = await fetch(`/api/appointments?from=${weekStart.toISOString()}&to=${addDays(weekStart, 7).toISOString()}`);
    if (res.ok) setAppointments(await res.json());
    setLoading(false);
  }

  function dayAppts(idx: number) {
    const day = addDays(weekStart, idx);
    return appointments.filter(a => {
      const d = new Date(a.scheduledAt);
      return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
    });
  }

  function blockStyle(a: Appointment) {
    const s = Math.max(toMin(new Date(a.scheduledAt)), GRID_START) - GRID_START;
    const e = Math.min(toMin(new Date(a.endAt)),       GRID_END)   - GRID_START;
    return {
      top:       `${(s / GRID_RANGE) * 100}%`,
      height:    `${((e - s) / GRID_RANGE) * 100}%`,
      minHeight: '42px',   // garantiza espacio para hora + nombre
    };
  }

  const today         = new Date();
  const isCurrentWeek = getWeekStart(today).getTime() === weekStart.getTime();
  const monthLabel    = weekStart.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  return (
    <div className="flex flex-col gap-4">

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setWeekStart(d => addDays(d, -7))}
            className="px-3 py-2 hover:bg-muted transition-colors border-r border-border"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setWeekStart(d => addDays(d, 7))}
            className="px-3 py-2 hover:bg-muted transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <h2 className="text-lg font-semibold capitalize">{monthLabel}</h2>

        {!isCurrentWeek && (
          <button
            onClick={() => setWeekStart(getWeekStart(new Date()))}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <Calendar className="h-3.5 w-3.5" />
            Hoy
          </button>
        )}

        {loading && <span className="text-sm text-muted-foreground animate-pulse">Cargando…</span>}
      </div>

      {/* ── Grid ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden bg-background shadow-sm">

        {/* Day headers */}
        <div className="grid grid-cols-8 border-b border-border bg-muted/30">
          <div className="py-3 border-r border-border" />
          {DAYS.map((name, i) => {
            const col     = addDays(weekStart, i);
            const isToday = col.toDateString() === today.toDateString();
            return (
              <div key={i} className={`py-3 border-r last:border-r-0 border-border text-center ${isToday ? 'bg-primary/5' : ''}`}>
                <p className={`text-xs font-medium uppercase tracking-widest ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                  {name}
                </p>
                <div className={`mx-auto mt-1.5 w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold
                  ${isToday ? 'bg-primary text-white' : 'text-foreground'}`}>
                  {col.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time grid — scrollable */}
        <div className="grid grid-cols-8 overflow-y-auto" style={{ height: '600px' }}>

          {/* Hour labels */}
          <div className="border-r border-border relative col-span-1 bg-muted/10">
            {HOURS.map(h => (
              <div
                key={h}
                className="absolute w-full flex items-center justify-center"
                style={{ top: `${((h * 60 - GRID_START) / GRID_RANGE) * 100}%`, height: `${(60 / GRID_RANGE) * 100}%` }}
              >
                <span className="text-xs font-mono text-muted-foreground select-none">
                  {String(h).padStart(2,'0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS.map((_, dayIdx) => {
            const col     = addDays(weekStart, dayIdx);
            const isToday = col.toDateString() === today.toDateString();
            const appts   = dayAppts(dayIdx);

            return (
              <div key={dayIdx} className={`relative border-r last:border-r-0 border-border ${isToday ? 'bg-primary/[0.02]' : ''}`}>
                {/* Hour lines */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute w-full border-t border-border/30"
                    style={{ top: `${((h * 60 - GRID_START) / GRID_RANGE) * 100}%` }}
                  />
                ))}

                {/* Half-hour lines */}
                {HOURS.map(h => (
                  <div
                    key={`h${h}`}
                    className="absolute w-full border-t border-dashed border-border/15"
                    style={{ top: `${(((h * 60 + 30) - GRID_START) / GRID_RANGE) * 100}%` }}
                  />
                ))}

                {/* Appointment blocks */}
                {appts.map(a => {
                  const cfg = STATUS_COLOR[a.status] ?? STATUS_COLOR.programada;
                  return (
                    <button
                      key={a.id}
                      className={`absolute inset-x-1 rounded-lg ${cfg.solid} text-white
                        overflow-hidden hover:opacity-90 hover:shadow-lg active:scale-95
                        transition-all cursor-pointer z-10 flex flex-col
                        items-center justify-center text-center px-1.5`}
                      style={blockStyle(a)}
                      onClick={() => setSelected(a)}
                    >
                      <span className="text-[11px] font-bold leading-tight w-full truncate">
                        {hhmm(new Date(a.scheduledAt))} – {hhmm(new Date(a.endAt))}
                      </span>
                      {a.patientName && (
                        <span className="text-[11px] leading-tight font-medium w-full truncate mt-0.5 opacity-90">
                          {a.patientName}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {Object.entries(STATUS_COLOR).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm ${v.solid}`} />
            <span className="text-xs text-muted-foreground">{v.label}</span>
          </div>
        ))}
      </div>

      {/* ── Detail modal ─────────────────────────────────────── */}
      {selected && (() => {
        const cfg = STATUS_COLOR[selected.status] ?? STATUS_COLOR.programada;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setSelected(null)}
          >
            <div
              className="bg-card w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-border"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className={`${cfg.solid} px-5 py-4 text-white`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium opacity-80 uppercase tracking-wider">
                      {TYPE_LABEL[selected.type] ?? selected.type}
                    </p>
                    <h3 className="text-lg font-bold mt-0.5">
                      {selected.patientName ?? 'Sin paciente'}
                    </h3>
                    <span className="inline-block mt-1 text-xs bg-white/20 rounded-full px-2.5 py-0.5 font-medium">
                      {cfg.label}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-3 text-sm">
                <Row icon={<Clock className="h-4 w-4 text-muted-foreground" />}>
                  <div>
                    <p className="font-medium capitalize">
                      {new Date(selected.scheduledAt).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      {hhmm(new Date(selected.scheduledAt))} – {hhmm(new Date(selected.endAt))}
                    </p>
                  </div>
                </Row>

                {selected.patientName && (
                  <Row icon={<PawPrint className="h-4 w-4 text-muted-foreground" />}>
                    <span>
                      {selected.patientName}
                      {selected.patientSpecies && <span className="text-muted-foreground text-xs ml-1">({selected.patientSpecies})</span>}
                    </span>
                  </Row>
                )}

                {(selected.ownerFirstName || selected.ownerLastName) && (
                  <Row icon={<User className="h-4 w-4 text-muted-foreground" />}>
                    <span>{[selected.ownerFirstName, selected.ownerLastName].filter(Boolean).join(' ')}</span>
                  </Row>
                )}

                {selected.veterinarianName && (
                  <Row icon={<Stethoscope className="h-4 w-4 text-muted-foreground" />}>
                    <span>{selected.veterinarianName}</span>
                  </Row>
                )}

                {selected.visitAddress && (
                  <Row icon={<MapPin className="h-4 w-4 text-muted-foreground" />}>
                    <div>
                      <p className="text-muted-foreground">{selected.visitAddress}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <a href={googleMapsUrl(selected.visitAddress)} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline" onClick={e => e.stopPropagation()}>
                          Google Maps ↗
                        </a>
                        <a href={wazeUrl(selected.visitAddress)} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline" onClick={e => e.stopPropagation()}>
                          Waze ↗
                        </a>
                        <a href={appleMapsUrl(selected.visitAddress)} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline" onClick={e => e.stopPropagation()}>
                          Apple Maps ↗
                        </a>
                      </div>
                    </div>
                  </Row>
                )}

                {selected.reason && (
                  <Row icon={<FileText className="h-4 w-4 text-muted-foreground" />}>
                    <span className="text-muted-foreground">{selected.reason}</span>
                  </Row>
                )}
              </div>

              <div className="px-5 pb-5">
                <a
                  href={`/citas/${selected.id}`}
                  className={`block w-full text-center py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 ${cfg.solid}`}
                >
                  Ver cita completa →
                </a>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
