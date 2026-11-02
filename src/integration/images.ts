import type { Hass } from '../card/types.js';
import type { PlanImage } from '../model/plan-views.js';
import { sanitizeArchitecture } from '../card/geometry.js';
import { t } from '../i18n/index.js';
export interface ImageData {
  format: 'svg' | 'png' | 'jpg';
  content: string;
  sha256?: string;
}
const cache = new Map<string, Promise<ImageData>>();
export async function readImage(hass: Hass | undefined, image: PlanImage): Promise<ImageData> {
  if (!hass?.callWS) throw Error(t('La sesión de Home Assistant no está conectada.'));
  const key = [hass.user?.id, image.scope, image.sha256].join(':');
  if (!cache.has(key))
    cache.set(
      key,
      hass
        .callWS<ImageData>({ type: 'homemanager/image/get', scope: image.scope, sha256: image.sha256 })
        .then(data => {
          if (data.format !== image.format) throw Error(t('La imagen no coincide con su referencia.'));
          return data;
        })
        .catch(error => {
          cache.delete(key);
          throw error;
        }),
    );
  return cache.get(key)!;
}
export function imageUrl(image: ImageData) {
  return `data:image/${image.format === 'svg' ? 'svg+xml' : image.format === 'jpg' ? 'jpeg' : 'png'};base64,${image.content}`;
}
export async function putImage(hass: Hass | undefined, scope: string, image: ImageData) {
  if (!hass?.callWS) throw Error(t('La sesión de Home Assistant no está conectada.'));
  return hass.callWS<{ sha256: string; format: PlanImage['format'] }>({
    type: 'homemanager/image/put',
    scope,
    image: { format: image.format, content: image.content },
  });
}
export async function fileImage(file: File): Promise<{ data: ImageData; box: PlanImage['box'] }> {
  if (file.size > 1024 * 1024) throw Error(t('Cada imagen admite hasta 1 MiB.'));
  const format = /\.svg$/i.test(file.name)
    ? 'svg'
    : /\.png$/i.test(file.name)
      ? 'png'
      : /\.jpe?g$/i.test(file.name)
        ? 'jpg'
        : null;
  if (!format) throw Error(t('Usá SVG, PNG o JPG. Convertí el PDF antes de subirlo.'));
  if (format === 'svg') {
    const clean = sanitizeArchitecture(await file.text());
    const bytes = new TextEncoder().encode(clean.content);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return {
      data: { format, content: btoa(binary) },
      box: [clean.box.x, clean.box.y, clean.box.width, clean.box.height],
    };
  }
  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const data: ImageData = { format, content };
  const image = new Image();
  image.src = imageUrl(data);
  await image.decode();
  if (image.width * image.height > 40000000) throw Error(t('La imagen supera las dimensiones admitidas.'));
  return { data, box: [0, 0, image.width, image.height] };
}
