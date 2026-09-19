import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNavigation } from './MobileNavigation';
import { Toaster } from 'sonner';
import type { NavItem } from '../../lib/permissions';

interface DashboardShellProps {
  navItems: NavItem[];
  currentPath: string;
  pageTitle: string;
  userName: string;
  userRole: string;
  initialCollapsed?: boolean;
  children: React.ReactNode;
}

export function DashboardShell({
  navItems,
  currentPath,
  pageTitle,
  userName,
  userRole,
  initialCollapsed = false,
  children,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // El estado inicial viene del servidor (cookie), por lo que el SSR y la
  // hidratacion coinciden: no hay salto visual al cargar la pagina.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialCollapsed);
  const [ready, setReady] = useState(false);

  // Habilitamos las transiciones recien despues del primer frame, para que
  // cualquier ajuste no dispare una animacion en la carga inicial.
  useEffect(() => {
    requestAnimationFrame(() => setReady(true));
  }, []);

  // Persistimos en cookie para que el servidor pueda leerla en la proxima
  // navegacion y renderizar el sidebar con el ancho correcto.
  useEffect(() => {
    if (!ready) return;
    document.cookie = `sidebarCollapsed=${sidebarCollapsed}; path=/; max-age=31536000; SameSite=Lax`;
  }, [sidebarCollapsed, ready]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        navItems={navItems}
        currentPath={currentPath}
        isOpen={sidebarOpen}
        collapsed={sidebarCollapsed}
        animated={ready}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header
          title={pageTitle}
          userName={userName}
          userRole={userRole}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          onSidebarCollapse={() => setSidebarCollapsed((c) => !c)}
        />
        {/* pb-20 en móvil deja libre la altura de la barra inferior; sin
            eso, el último control de cada pantalla queda debajo de ella. */}
        <main className="flex-1 overflow-y-auto p-4 pb-20 lg:p-6 lg:pb-6">{children}</main>
      </div>
      <MobileNavigation navItems={navItems} currentPath={currentPath} />
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
