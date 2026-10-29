import { en } from './en.js';
import { enRf } from './en-rf.js';

/** Gettext-style translations: the key is the Spanish source text, so code reads
 * naturally and a missing translation degrades to readable Spanish, never to a
 * key. Variables use {name}. The language is shared through globalThis because
 * several entry points (card, panel, editor, test bundles) may each embed a copy
 * of this module. */
export type Language = 'es' | 'en';
const shared = globalThis as { __homemanagerLanguage?: Language };

export function setLanguage(input?: string | null): void {
  if (!input) return;
  shared.__homemanagerLanguage = input.toLowerCase().startsWith('es') ? 'es' : 'en';
}
export function getLanguage(): Language {
  return shared.__homemanagerLanguage ?? 'en';
}
/** HA exposes the user's language as hass.locale.language (and hass.language). */
export function languageFromHass(hass: unknown): string | undefined {
  const value = hass as { locale?: { language?: string }; language?: string } | undefined;
  return value?.locale?.language ?? value?.language;
}
export function t(source: string, vars?: Record<string, string | number>): string {
  const template = getLanguage() === 'es' ? source : (en[source] ?? enRf[source] ?? source);
  return vars
    ? template.replace(/\{(\w+)\}/g, (match: string, name: string) => (name in vars ? String(vars[name]) : match))
    : template;
}
