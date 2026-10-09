/**
 * Normalizes alternate callback numbers from APIs / tools.
 * Strips mistaken literal placeholders (e.g. variable names sent instead of a number).
 */
export function sanitizeAlternateCallbackNumberInput(
  value: string | undefined | null,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  let t = String(value).trim();
  if (!t) {
    return null;
  }
  t = t.replace(/\{\{|\}\}/g, '').trim();
  if (!t) {
    return null;
  }

  const lower = t.toLowerCase();
  const placeholders = new Set([
    'caller_phone',
    'call_back_number',
    'callback_number',
    'callerphone',
    'phone',
    'n/a',
    'na',
    'none',
    '-',
    '--',
    'null',
    'undefined',
  ]);
  if (placeholders.has(lower)) {
    return null;
  }

  return t;
}
