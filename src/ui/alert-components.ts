import { t } from '../i18n/index.js';
import type { DeviceAlert } from '../model/alerts.js';

/** All alert surfaces share a translated message and the same human reading label. */
export const alertText = (alert: Pick<DeviceAlert, 'message' | 'readingLabel'>): string =>
  [alert.readingLabel, t(alert.message)].filter(Boolean).join(' · ');

export const alertComponentStyles = `
.header .alert-pill[data-level=warning],.room-alerts[data-level=warning]{background:var(--hm-warn)}
.k-notice.warning{background:color-mix(in srgb,var(--hm-warn) 11%,transparent);color:var(--hm-warn)}.k-notice.warning ha-icon{color:var(--hm-warn)}
.marker[data-highlight=true] .primary{background:color-mix(in srgb,var(--hm-brand) 16%,var(--hm-surface));border-color:var(--hm-brand)}.marker[data-highlight=true] .symbol-body{color:var(--hm-brand)}
`;
