'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';

export interface QuotaData {
  used: number;
  limit: number;
  cooldownRemaining: number;
  /** Client timestamp when cooldownRemaining was observed. */
  observedAt: number;
}

export class QuotaUnavailableError extends Error {}

async function fetchQuota(url: string): Promise<QuotaData> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new QuotaUnavailableError('Quota unavailable');
  const body: unknown = await res.json().catch(() => null);
  const b = body as Partial<QuotaData> | null;
  if (!b || typeof b.used !== 'number' || typeof b.limit !== 'number' || typeof b.cooldownRemaining !== 'number') {
    throw new QuotaUnavailableError('Quota unavailable');
  }
  return { used: b.used, limit: b.limit, cooldownRemaining: Math.max(0, b.cooldownRemaining), observedAt: Date.now() };
}

export const QUOTA_KEY = '/api/quota';

export function useQuota() {
  return useSWR<QuotaData>(QUOTA_KEY, fetchQuota, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
}

/** Seconds of cooldown left, ticking locally between quota refreshes. */
export function useCooldownSeconds(data: QuotaData | undefined): number {
  const deadline = data ? data.observedAt + data.cooldownRemaining * 1000 : 0;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (deadline <= Date.now()) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= deadline) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export type TriggerBlock =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'daily-limit' }
  | { kind: 'cooldown'; seconds: number }
  | null;

export function triggerBlock(
  data: QuotaData | undefined,
  error: unknown,
  isLoading: boolean,
  cooldown: number,
): TriggerBlock {
  if (error) return { kind: 'unavailable' };
  if (!data) return isLoading ? { kind: 'loading' } : { kind: 'unavailable' };
  if (data.used >= data.limit) return { kind: 'daily-limit' };
  if (cooldown > 0) return { kind: 'cooldown', seconds: cooldown };
  return null;
}
