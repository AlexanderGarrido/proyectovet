import { cn } from '../../lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  className?: string;
  href?: string;
}

export function StatCard({ title, value, description, icon: Icon, className, href }: StatCardProps) {
  const cardClass = cn(
    'rounded-xl border bg-card text-card-foreground shadow-sm p-6',
    href && 'hover:bg-muted/30 transition-colors cursor-pointer',
    className
  );

  const inner = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold">{value}</p>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </div>
    </>
  );

  if (href) {
    return <a href={href} className={cardClass}>{inner}</a>;
  }
  return <div className={cardClass}>{inner}</div>;
}
