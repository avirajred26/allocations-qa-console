'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { scenarios, type Triage } from '@/lib/fixture';
import { computeReadiness, initialTriageMap, type Readiness, type TriageMap } from '@/lib/readiness';

interface TriageContextValue {
  triage: TriageMap;
  readiness: Readiness;
  dirtyIds: string[];
  setTriage: (id: string, value: Triage | undefined) => void;
  resetTriage: (id?: string) => void;
}

const TriageContext = createContext<TriageContextValue | null>(null);

const INITIAL = initialTriageMap(scenarios);

function same(a: Triage | undefined, b: Triage | undefined) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** In-memory only by design: triage edits are a local demo and vanish on reload. */
export function TriageProvider({ children }: { children: ReactNode }) {
  const [triage, setMap] = useState<TriageMap>(INITIAL);

  const setTriage = useCallback((id: string, value: Triage | undefined) => {
    setMap((prev) => ({ ...prev, [id]: value }));
  }, []);

  const resetTriage = useCallback((id?: string) => {
    setMap((prev) => (id ? { ...prev, [id]: INITIAL[id] } : INITIAL));
  }, []);

  const value = useMemo<TriageContextValue>(
    () => ({
      triage,
      readiness: computeReadiness(scenarios, triage),
      dirtyIds: scenarios.filter((s) => !same(triage[s.id], INITIAL[s.id])).map((s) => s.id),
      setTriage,
      resetTriage,
    }),
    [triage, setTriage, resetTriage],
  );

  return <TriageContext.Provider value={value}>{children}</TriageContext.Provider>;
}

export function useTriage() {
  const ctx = useContext(TriageContext);
  if (!ctx) throw new Error('useTriage must be used within TriageProvider');
  return ctx;
}
