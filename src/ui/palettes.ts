/** Colour palettes of the symbol sheet (0.13): five of ten colours each and the
 * person's own. Which one is shown, and "Mi paleta", stay in this browser; a symbol
 * stores only its colour. */

export const PALETTES: Record<string, string[]> = {
  home: ['#4F7A5A', '#7FA37A', '#C9A66B', '#D98B1F', '#D0453A', '#B2577F', '#6F6BB8', '#4F8FBF', '#3E9C9C', '#5F6E66'],
  pastel: [
    '#A8D5BA',
    '#F6D6AD',
    '#F7B7A3',
    '#E8A9C9',
    '#C7B8EA',
    '#A7C7E7',
    '#B5E2E0',
    '#F3E8A6',
    '#D9D2C5',
    '#C2CCC4',
  ],
  vivid: ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#00ACC1', '#1E88E5', '#5E35B1', '#D81B60', '#6D4C41', '#212121'],
  earth: ['#8D6E63', '#A1887F', '#C0A080', '#B5833C', '#9C6B3E', '#6B8E23', '#556B2F', '#8F9779', '#A0522D', '#5D4037'],
  greys: ['#111111', '#333333', '#555555', '#777777', '#999999', '#BBBBBB', '#DDDDDD', '#F0F0F0', '#4F7A5A', '#8FB38B'],
};
export const PALETTE_NAMES: [string, string][] = [
  ['home', 'Hogar'],
  ['pastel', 'Pastel'],
  ['vivid', 'Vivos'],
  ['earth', 'Tierra'],
  ['greys', 'Grises'],
  ['mine', 'Mi paleta'],
];
const NAME_KEY = 'homemanager:palette';
const MINE_KEY = 'homemanager:my-palette';
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* per-viewer convenience only */
  }
};
const HEX = /^#[0-9a-fA-F]{6}$/;
export function myPalette(): string[] {
  try {
    const list = JSON.parse(read(MINE_KEY) ?? '[]') as unknown;
    return Array.isArray(list)
      ? list.filter((item): item is string => typeof item === 'string' && HEX.test(item)).slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
export function changeMyPalette(color: string, add: boolean): void {
  if (!HEX.test(color)) return;
  const list = myPalette().filter(item => item.toLowerCase() !== color.toLowerCase());
  write(MINE_KEY, JSON.stringify(add ? [...list, color.toUpperCase()].slice(-20) : list));
}
export function paletteName(): string {
  const name = read(NAME_KEY) ?? 'home';
  return PALETTE_NAMES.some(([id]) => id === name) ? name : 'home';
}
export function setPaletteName(name: string): void {
  if (PALETTE_NAMES.some(([id]) => id === name)) write(NAME_KEY, name);
}
export function paletteColors(name: string): string[] {
  if (name === 'mine') return myPalette().length ? myPalette() : PALETTES.home.slice(0, 3);
  return PALETTES[name] ?? PALETTES.home;
}
