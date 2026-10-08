import registry from '@/qa-environments.json';

/** Environments from qa-environments.json (shared with the harness and CI). Safe for client and server. */
export type QaEnvironment = { id: string; label: string; baseUrl: string | null; notes: string };
export const ENVIRONMENTS = registry.environments as QaEnvironment[];
export const GATES = registry.gates as Record<string, string>;
export const isTargetable = (id: unknown): id is string => typeof id === 'string' && ENVIRONMENTS.some((e) => e.id === id && !!e.baseUrl);
