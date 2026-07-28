import { useState, useEffect } from 'react';
import { Menu, Moon, Sun, PanelLeft } from 'lucide-react';
import { OnlineStatus } from '../common/OnlineStatus';

interface HeaderProps {
  title: string;
  onMenuToggle: () => void;
  onSidebarCollapse?: () => void;
}

export function Header({ title, onMenuToggle, onSidebarCollapse }: HeaderProps) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved === 'dark' || (!saved && prefersDark);
    setDark(isDark);
    if (isDark) document.documentElement.classList.add('dark');
  }, []);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  }

  return (
    <header className="sticky top-0 z-30 flex items-center gap-4 border-b bg-card/95 backdrop-blur px-4 h-14 lg:px-6">
      {/* Mobile hamburger — p-3 + icono 20px ≈ 44px, mínimo táctil de campo */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-3 -m-1 rounded-md hover:bg-muted"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>
      {/* Desktop sidebar toggle */}
      <button
        onClick={onSidebarCollapse}
        className="hidden lg:flex p-3 -m-1 rounded-md hover:bg-muted transition-colors"
        aria-label="Colapsar menú lateral"
      >
        <PanelLeft size={20} />
      </button>

      <h1 className="text-lg font-semibold truncate">{title}</h1>

      <div className="ml-auto flex items-center gap-2">
        <OnlineStatus />
        <button
          onClick={toggleDark}
          className="p-3 -m-1 rounded-md hover:bg-muted transition-colors"
          aria-label={dark ? 'Modo claro' : 'Modo oscuro'}
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
}
