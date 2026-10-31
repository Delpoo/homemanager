/** Interpret labels, never identifiers or a particular manufacturer's model. */
export function readingChannel(name: string, deviceClass: string): { index: number; suffix: string } | null {
  if (!['power', 'energy'].includes(deviceClass)) return null;
  const explicit = name.match(/^(?:channel|canal|kanal)\s*(\d+)(?=$|[\s·:–—-])\s*[·:–—-]?\s*(.*)$/i);
  if (explicit) {
    const index = Number(explicit[1]);
    return Number.isSafeInteger(index) && index > 0 ? { index, suffix: explicit[2] } : null;
  }
  const normal = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const metric = deviceClass === 'power' ? '(?:power|potencia|leistung)' : '(?:energy|energia|energie)';
  const match = normal.match(
    new RegExp(`^(${metric})(?:\\s+(today|daily|hoy|diaria))?\\s+(\\d+)(?:\\s+(today|daily|hoy|diaria))?$`, 'i'),
  );
  if (!match || (deviceClass === 'power' && (match[2] || match[4]))) return null;
  const index = Number(match[3]);
  return Number.isSafeInteger(index) && index > 0
    ? { index, suffix: [match[1], match[2] ?? match[4]].filter(Boolean).join(' ') }
    : null;
}
export const isDailyReading = (name: string): boolean => /\b(?:hoy|today|daily|diaria|tagesenergie)\b/i.test(name);
