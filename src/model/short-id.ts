/** A short random id that also works on plain http:// (no secure context), where
 * crypto.randomUUID does not exist but crypto.getRandomValues does. */
export function shortId(length = 8): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
}
