import { useState } from 'react';
import { List, CalendarDays, Route } from 'lucide-react';
import { AppointmentList } from './AppointmentList';
import { AppointmentCalendar } from './AppointmentCalendar';
import { RoutePlanner } from './RoutePlanner';
import { features } from '../../lib/features';

export function AppointmentsPage() {
  const [view, setView] = useState<'list' | 'calendar' | 'route'>('list');

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setView('list')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === 'list' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <List className="h-4 w-4" />
          Lista
        </button>
        <button
          onClick={() => setView('calendar')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === 'calendar' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <CalendarDays className="h-4 w-4" />
          Calendario
        </button>
        {features.recorrido && <button
          onClick={() => setView('route')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === 'route' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Route className="h-4 w-4" />
          Recorrido
        </button>}
      </div>

      {view === 'list' && <AppointmentList />}
      {view === 'calendar' && <AppointmentCalendar />}
      {view === 'route' && features.recorrido && <RoutePlanner />}
    </div>
  );
}
