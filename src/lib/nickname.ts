/** Words never allowed in a child-facing nickname (replaced by "Pemain"). */
const BLOCKED = ['babi', 'bodoh', 'sial', 'celaka', 'bangsat', 'pukimak', 'puki', 'kimak', 'lancau', 'jahanam', 'bangang', 'setan', 'keparat'];

/**
 * Keep letters, digits, spaces and . _ - only; collapse spaces; max 16 chars;
 * reject offensive words. Pure — used by the client and the game server.
 */
export function sanitizeNickname(raw: string): string {
  const cleaned = String(raw ?? '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} ._-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  const lower = cleaned.toLowerCase();
  if (!cleaned || BLOCKED.some((w) => lower.includes(w))) return 'Pemain';
  return cleaned;
}
