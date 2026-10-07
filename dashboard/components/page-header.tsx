import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions, eyebrow = 'QUALITY OPERATIONS' }: { title: string; description: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="flex max-w-3xl flex-col gap-1.5">
        <p className="qa-eyebrow mb-1">{eyebrow}</p>
        <h1 className="text-balance text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
