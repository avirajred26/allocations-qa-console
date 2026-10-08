import { V0_URL } from '@/lib/fixture';

export function SiteFooter() {
  return (
    <footer className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-7 py-3 text-[11px] text-muted-foreground">
      <span>Aviraj Lall · QA assignment for Allocations</span>
      <a href={V0_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">v0</a>
    </footer>
  );
}
