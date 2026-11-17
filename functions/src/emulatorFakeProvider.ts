/**
 * EMULATOR-ONLY fake dictionary provider for automated tests. It is refused
 * outside the Functions emulator (see index.ts). The words below are test
 * fixtures chosen to fit a seeded rack — they are NOT linguistic claims.
 */
import type { DictionaryProvider, ProviderVerdict } from './dictionary';

const VALID = new Set(['يا']);
const INVALID = new Set(['يم']);
/** Any word starting with this letter makes the fake provider fail (outage test). */
const FAIL_PREFIX = 'ظ';

export const emulatorFakeProvider: DictionaryProvider = {
  info: { id: 'ujian-emulator', name: 'Penyedia ujian (emulator)', version: 'ujian-1', configured: true },
  lookup: async (keys) => {
    if (keys.some((k) => k.startsWith(FAIL_PREFIX))) throw new Error('fake provider outage');
    return new Map<string, ProviderVerdict>(
      keys.map((k) => [k, VALID.has(k) ? { status: 'VALID', reference: `ujian:${k}` } : INVALID.has(k) ? { status: 'INVALID', reason: 'Ejaan salah (data ujian)' } : { status: 'NOT_FOUND' }]),
    );
  },
};
