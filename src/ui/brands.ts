/** About eighty brands, apps and usual remote keys (0.13 designer). A brand key
 * shows its mark (an icon when Material Design Icons has one, else its initials)
 * on its colour; the name is what is stored. Names are trademarks of their owners. */
export type Brand = [name: string, icon: string, color: string];
export const BRAND_GROUPS: [string, Brand[]][] = [
  [
    'Video',
    [
      ['Netflix', 'mdi:netflix', '#E50914'],
      ['YouTube', 'mdi:youtube', '#FF0000'],
      ['YouTube TV', 'mdi:youtube-tv', '#FF0000'],
      ['Prime Video', '', '#00A8E1'],
      ['Disney+', '', '#113CCF'],
      ['Max', '', '#002BE7'],
      ['Apple TV', 'mdi:apple', '#111111'],
      ['Paramount+', '', '#0064FF'],
      ['Hulu', 'mdi:hulu', '#1CE783'],
      ['Peacock', '', '#111111'],
      ['Crunchyroll', '', '#F47521'],
      ['Mubi', '', '#111111'],
      ['Pluto TV', '', '#2A2A2A'],
      ['Tubi', '', '#7408FF'],
      ['Rakuten TV', '', '#BF0000'],
      ['ViX', '', '#FF4F00'],
      ['Plex', 'mdi:plex', '#E5A00D'],
      ['Kodi', 'mdi:kodi', '#17B2E7'],
      ['Vimeo', 'mdi:vimeo', '#1AB7EA'],
      ['Twitch', 'mdi:twitch', '#9146FF'],
      ['Globoplay', '', '#FB0234'],
      ['Canal+', '', '#111111'],
      ['BBC iPlayer', '', '#F54997'],
      ['Sky', '', '#0072C9'],
      ['NOW', '', '#00B2A9'],
    ],
  ],
  [
    'Deportes',
    [
      ['DAZN', '', '#111111'],
      ['ESPN', '', '#D50A0A'],
      ['Fox Sports', '', '#00205B'],
      ['TyC Sports', '', '#E30613'],
      ['NBA', '', '#1D428A'],
      ['F1 TV', '', '#E10600'],
    ],
  ],
  [
    'TV y cable',
    [
      ['Flow', '', '#111111'],
      ['DirecTV GO', '', '#00A6D6'],
      ['Telecentro', '', '#E30613'],
      ['Claro video', '', '#DA291C'],
      ['Movistar TV', '', '#019DF4'],
      ['Samsung TV Plus', '', '#1428A0'],
      ['LG Channels', '', '#A50034'],
    ],
  ],
  [
    'Música y radio',
    [
      ['Spotify', 'mdi:spotify', '#1DB954'],
      ['Apple Music', 'mdi:apple', '#FA243C'],
      ['YouTube Music', 'mdi:youtube', '#FF0000'],
      ['Amazon Music', '', '#25D1DA'],
      ['Deezer', '', '#A238FF'],
      ['Tidal', '', '#111111'],
      ['SoundCloud', 'mdi:soundcloud', '#FF5500'],
      ['TuneIn', '', '#14D8CC'],
      ['Radio', 'mdi:radio', '#5f6e66'],
      ['Podcasts', 'mdi:podcast', '#8c4fd1'],
    ],
  ],
  [
    'Equipos y juegos',
    [
      ['Google TV', 'mdi:google', '#4285F4'],
      ['Chromecast', 'mdi:cast', '#4285F4'],
      ['Android TV', 'mdi:android', '#3DDC84'],
      ['Fire TV', '', '#FF9900'],
      ['Roku', '', '#6C3C97'],
      ['Xbox', 'mdi:microsoft-xbox', '#107C10'],
      ['PlayStation', 'mdi:sony-playstation', '#003791'],
      ['Nintendo Switch', 'mdi:nintendo-switch', '#E60012'],
      ['Steam', 'mdi:steam', '#1b2838'],
      ['Google Play', 'mdi:google-play', '#01875f'],
      ['Navegador', 'mdi:web', '#4f7a5a'],
      ['Asistente', 'mdi:google-assistant', '#4285F4'],
    ],
  ],
  [
    'Teclas del control',
    [
      ['Inicio', 'mdi:home-outline', '#4f7a5a'],
      ['Menú', 'mdi:menu', '#4f7a5a'],
      ['Atrás', 'mdi:arrow-left', '#4f7a5a'],
      ['Guía', 'mdi:television-guide', '#4f7a5a'],
      ['Info', 'mdi:information-outline', '#4f7a5a'],
      ['Fuente', 'mdi:video-input-hdmi', '#4f7a5a'],
      ['HDMI 1', 'mdi:hdmi-port', '#4f7a5a'],
      ['HDMI 2', 'mdi:hdmi-port', '#4f7a5a'],
      ['HDMI 3', 'mdi:hdmi-port', '#4f7a5a'],
      ['Silencio', 'mdi:volume-off', '#4f7a5a'],
      ['Subtítulos', 'mdi:subtitles-outline', '#4f7a5a'],
      ['Apps', 'mdi:apps', '#4f7a5a'],
      ['Micrófono', 'mdi:microphone', '#4f7a5a'],
      ['Grabar', 'mdi:record-rec', '#d0453a'],
      ['Pausa', 'mdi:pause', '#4f7a5a'],
      ['Reproducir', 'mdi:play', '#4f7a5a'],
      ['Detener', 'mdi:stop', '#4f7a5a'],
      ['Adelantar', 'mdi:fast-forward', '#4f7a5a'],
      ['Retroceder', 'mdi:rewind', '#4f7a5a'],
    ],
  ],
];
const ALL = new Map(BRAND_GROUPS.flatMap(([, list]) => list).map(brand => [brand[0], brand]));
export const brandOf = (name: string | undefined): Brand | undefined => (name ? ALL.get(name) : undefined);
export const BRAND_COUNT = ALL.size;
/** Two letters for a brand without its own icon: "Prime Video" → "PV", "DAZN" → "DA". */
export function brandInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}+ ]/gu, '')
    .split(/\s+/)
    .filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '').slice(0, 2)).toUpperCase();
}
