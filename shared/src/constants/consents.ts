/**
 * Documents a user must accept to register. Versions are dates so a changed
 * document is a new row rather than an edit — consent cannot be collected
 * retroactively (spec section 10).
 */
export interface ConsentRef {
  document: string;
  version: string;
}

export const REQUIRED_CONSENTS: readonly ConsentRef[] = [
  { document: 'terms', version: '2026-07-01' },
  { document: 'privacy', version: '2026-07-01' },
  { document: 'beta-notice', version: '2026-07-01' },
] as const;
