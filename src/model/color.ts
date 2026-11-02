export const COLOR_PALETTE = ['#4f7a5a', '#a46315', '#397ca8', '#7655a6', '#267e7a', '#66746c'] as const;
export const validColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex: string) =>
  channels(hex).reduce((sum, c, i) => {
    const s = c / 255;
    return sum + (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i];
  }, 0);
export function contrast(a: string, b: string): number {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** Keep the chosen hue where possible; adjust only the drawn foreground for legibility. */
export function readableColor(color: string, background: string): string {
  if (contrast(color, background) >= 4.5) return color;
  const target = luminance(background) > 0.3 ? 0 : 255;
  for (let step = 1; step <= 100; step++) {
    const hex =
      '#' +
      channels(color)
        .map(c =>
          Math.round(c + ((target - c) * step) / 100)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
    if (contrast(hex, background) >= 4.5) return hex;
  }
  return target ? '#ffffff' : '#000000';
}
export function symbolTones(color: string) {
  return { light: readableColor(color, '#ffffff'), dark: readableColor(color, '#1b221e') };
}
