import { alertText } from './alert-components.js';
import type { DeviceAlert } from '../model/alerts.js';
import { t } from '../i18n/index.js';
import type { Control } from '../model/control-capabilities.js';
import type { CatalogReading } from '../model/device-catalog.js';
import type { ChannelReading } from '../model/device-screen.js';
import { uiButton, uiEscape as e, uiIcon, uiStatus } from './components.js';

/** Shared compositions from mockup §6/§8. Screens contain no style rules. */
export const uiDeviceHeader = (name: string, detail: string, icon: string, health: string, tone: string) =>
  `<header class="device-head"><span class="device-icon">${uiIcon(icon)}</span><span class="device-title"><h2 tabindex="-1">${e(name)}</h2><span>${e(detail)}<span data-age></span></span></span>${uiStatus(health, tone)}${uiButton(t('Cerrar'), 'close', 'icon', 'mdi:close')}</header>`;
export const uiValues = (values: readonly CatalogReading[]) =>
  `<div class="device-values">${values.map(value => `<div class="device-value"><span>${e(value.name)}</span><strong>${e(value.value)}</strong></div>`).join('')}</div>`;
export const uiChannels = (rows: readonly ChannelReading[]) =>
  `<table class="device-channels"><caption>${e(t('Canales de energía'))}</caption><thead><tr><th scope="col">${e(t('Canal'))}</th><th scope="col">${e(t('Ahora'))}</th><th scope="col">${e(t('Hoy'))}</th></tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${e(row.name)}</th><td>${row.watts !== null ? `<svg class="channel-bar" viewBox="0 0 42 6" aria-hidden="true"><rect width="${Math.max(0, Math.min(42, (42 * row.watts) / Math.max(1, ...rows.map(item => item.watts ?? 0))))}" height="6" rx="3"/></svg>` : ''}${e(row.now)}</td><td>${e(row.today)}</td></tr>`).join('')}</tbody></table>`;
export function uiEntityControl(control: Control): string {
  const id = e(control.id),
    label = e(t(control.label));
  if (control.kind === 'reading') return '';
  const button = (value: string, text: string, pressed?: boolean) =>
    `<button class="k-btn${pressed ? ' primary' : ''}" type="button" aria-label="${e(text)}" data-control="${id}" data-value="${e(value)}"${pressed === undefined ? '' : ` aria-pressed="${pressed}"`}>${e(text)}</button>`;
  let body = '';
  if (control.kind === 'toggle')
    body = `<div class="device-options">${button('on', t('Encender'), control.value === true)}${button('off', t('Apagar'), control.value === false)}</div>`;
  else if (control.kind === 'select')
    body = `<div class="device-options">${control.options.map(option => button(option.value, t(option.label), option.value === control.value)).join('')}</div>`;
  else if (control.kind === 'stepper')
    body = `<div class="device-stepper">${button('decrease', t('Bajar temperatura'))}<output>${e(control.value === null ? t('Sin dato') : `${control.value}${control.unit}`)}</output>${button('increase', t('Subir temperatura'))}</div>`;
  else if (control.kind === 'range')
    body = `<input type="range" aria-label="${label}" data-control="${id}" min="${control.min}" max="${control.max}" step="${control.step}" value="${control.value ?? control.min}"><output>${e(control.value === null ? t('Sin dato') : `${control.value} ${control.unit}`)}</output>`;
  else if (control.kind === 'steps')
    body = `<div class="device-options">${Array.from(
      { length: control.count + (control.off ? 1 : 0) },
      (_, index) => index + (control.off ? 0 : 1),
    )
      .map(value => button(String(value), String(value), value === control.value))
      .join('')}</div>`;
  else if (control.kind === 'buttons')
    body = `<div class="device-options">${control.buttons.map(item => button(item.id, t(item.label))).join('')}</div>`;
  else if (control.kind === 'script')
    body = `<form data-control="${id}">${control.fields.map(field => `<label class="device-field">${e(field.label)}${field.type === 'select' ? `<select name="${e(field.name)}"${field.required ? ' required' : ''}>${(field.options ?? []).map(option => `<option value="${e(option)}"${option === field.default ? ' selected' : ''}>${e(option)}</option>`).join('')}</select>` : `<input name="${e(field.name)}" type="${field.type === 'boolean' ? 'checkbox' : field.type}"${field.required && field.type !== 'boolean' ? ' required' : ''}${field.type === 'number' ? `${field.min !== undefined ? ` min="${field.min}"` : ''}${field.max !== undefined ? ` max="${field.max}"` : ''} step="${field.step ?? 1}"` : ''}${field.type === 'boolean' && field.default === true ? ' checked' : ''} value="${e(field.default ?? '')}">`}</label>`).join('')}<button class="k-btn" type="submit">${e(t('Ejecutar'))}</button></form>`;
  return `<section class="device-control" data-control-group="${id}"><h3>${label}</h3>${body}</section>`;
}
export const uiNowRow = (row: {
  id: string;
  name: string;
  detail?: string;
  value?: string;
  icon: string;
  off?: unknown;
  tone?: string;
  estimated?: boolean;
  alert?: DeviceAlert;
}) =>
  `<div class="now-row" data-tone="${e(row.tone ?? 'normal')}"><button class="now-open" type="button" data-action="device" data-key="${e(row.id)}">${uiIcon(row.icon)}<span><b>${e(row.alert ? alertText(row.alert) : row.name)}</b>${row.detail ? `<small>${e(row.detail)}</small>` : ''}</span>${row.value ? `<strong>${e(row.estimated ? `${row.value} · ${t('estimado')}` : row.value)}</strong>` : ''}</button>${row.off ? `<button class="k-btn icon" type="button" data-action="off" data-key="${e(row.id)}" aria-label="${e(t('Apagar {name}', { name: row.name }))}">${uiIcon('mdi:power')}</button>` : ''}</div>`;
export const uiInsightsFrame = (title: string, content: string, expanded: boolean) =>
  `<button class="insights-handle" type="button" data-action="expand" aria-label="${e(t('Mostrar Ahora'))}" aria-expanded="${expanded}"><span></span>${e(title)}${uiIcon(expanded ? 'mdi:chevron-down' : 'mdi:chevron-up')}</button><section class="insights-surface" aria-label="${e(title)}"><div class="insights-scroll">${content}</div><div class="insights-feedback" role="status" aria-live="polite"></div></section>`;

export const insightsLayoutStyles = `
:host{container-type:inline-size;container-name:homemanager}
.workspace{display:flex}.workspace>.viewport{flex:1;min-width:0}.workspace>homemanager-insights{flex:none;width:300px;align-self:stretch;min-height:0}.workspace>homemanager-insights[data-device=true]{width:420px}.is-editing .workspace>homemanager-insights{display:none}
@container homemanager (max-width:1099px){.shell{grid-template-columns:minmax(0,1fr);grid-template-areas:"header" "edit" "workspace" "rooms" "selection" "status"}.rooms{flex-direction:row;justify-content:flex-start;height:64px;gap:6px;padding:8px 12px;border-right:0;border-top:1px solid var(--hm-line)}.rooms button{width:44px;height:44px;min-height:44px}.workspace>homemanager-insights{position:absolute;right:12px;bottom:12px;z-index:7;width:360px;max-width:calc(100% - 24px);max-height:calc(100% - 24px);border-radius:18px;overflow:hidden;box-shadow:var(--hm-shadow)}.workspace>homemanager-insights[data-device=true]{width:360px}.workspace>homemanager-insights:not([data-expanded=true]){width:160px}}
@container homemanager (max-width:650px){.workspace>homemanager-insights{left:0;right:0;bottom:0;width:100%;max-width:100%;max-height:82%;border-radius:18px 18px 0 0}.workspace>homemanager-insights[data-device=true],.workspace>homemanager-insights:not([data-expanded=true]){width:100%}.viewport>.layers{bottom:58px}.is-editing .viewport>.layers{bottom:8px}}
`;
export const deviceComponentStyles = `
:host{display:flex;flex-direction:column;min-width:0;background:var(--hm-surface);border-left:1px solid var(--hm-line);height:var(--hm-viewport-height,clamp(420px,66vh,920px));max-height:100%;overflow:hidden}
.insights-handle{display:none}.insights-surface{display:flex;flex:1;min-height:0;flex-direction:column}.insights-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}.insights-feedback:empty{display:none}.insights-feedback{font-size:13px;padding:12px 16px;border-top:1px solid var(--hm-line)}
.device-head{display:flex;align-items:center;gap:10px;padding:16px;border-bottom:1px solid var(--hm-line);background:var(--hm-surface)}.device-icon{width:52px;height:52px;flex:none;border-radius:16px;background:color-mix(in srgb,var(--hm-brand) 11%,transparent);color:var(--hm-brand);display:grid;place-items:center}.device-icon ha-icon{--mdc-icon-size:26px}.device-title{min-width:0;flex:1}.device-title h2{font-size:18px;margin:0 0 4px;font-weight:600;overflow-wrap:anywhere}.device-title>span{font-size:12px;color:var(--hm-muted)}.device-head .k-status{font-size:10px;padding:2px 6px;flex:none}.device-head .k-btn{width:30px;height:30px;min-height:30px}.device-content{padding:14px 16px}.device-content .k-notice:first-child{margin-top:0;margin-bottom:12px}
.device-values{display:grid;grid-template-columns:repeat(auto-fit,minmax(85px,1fr));gap:8px;margin-bottom:12px}.device-value{padding:10px;border:1px solid var(--hm-line);border-radius:12px;display:flex;flex-direction:column;gap:5px;overflow-wrap:anywhere}.device-value>span{font-size:11px;color:var(--hm-muted)}.device-value strong{font-size:19px;font-weight:600;font-variant-numeric:tabular-nums}
.device-channels{border-collapse:collapse;width:100%;font-size:12px;font-variant-numeric:tabular-nums}.device-channels caption{position:absolute;clip-path:inset(50%);width:1px;height:1px;overflow:hidden}.device-channels th,.device-channels td{text-align:right;padding:11px 5px;border-bottom:1px solid var(--hm-line);font-weight:400}.device-channels thead th{font-size:11px;color:var(--hm-muted);font-weight:600}.device-channels th:first-child{text-align:left}.channel-bar{width:42px;height:6px;vertical-align:middle;margin-right:6px;fill:var(--hm-active)}.device-control{margin:0 0 16px}.device-control h3{font-size:12px;color:var(--hm-muted);font-weight:500;margin:0 0 8px}.device-options{display:flex;gap:6px;flex-wrap:wrap}.device-options .k-btn{flex:1 0 auto;min-width:55px;padding:8px 10px;font-size:13px}.device-stepper{display:flex;align-items:center;gap:8px}.device-stepper output{flex:1;text-align:center;font-size:30px;font-weight:500;font-variant-numeric:tabular-nums}.device-stepper button{font-size:0!important;min-width:44px;min-height:44px;border-radius:50%;padding:0}.device-stepper button:before{content:'−';font-size:22px}.device-stepper button:last-child:before{content:'+'}.device-field{display:grid;gap:6px;margin-bottom:10px;font-size:13px}.device-control input[type=range]{width:100%}.device-control output{color:var(--hm-ink)}.device-footer{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.device-footer a{color:var(--hm-brand);font-size:12px;display:inline-flex;gap:6px;align-items:center;min-height:44px;text-decoration:none}
.now-head{font-size:16px;font-weight:600;padding:18px 16px 0;margin:0}.now-content{padding:16px}.now-content .k-group-section{margin-bottom:20px}.now-content .k-list{border:0;border-radius:0}.now-row{display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--hm-line)}.now-row:last-child{border:0}.now-row[data-tone=alert] .now-open,.now-row[data-tone=alert] .now-open>ha-icon{color:var(--hm-alert)}.now-row[data-tone=warning] .now-open,.now-row[data-tone=warning] .now-open>ha-icon{color:var(--hm-warn)}.now-open{flex:1;min-width:0;min-height:52px;display:flex;gap:10px;align-items:center;text-align:left;border:0;background:transparent;border-radius:8px;padding:8px 0}.now-open>ha-icon{--mdc-icon-size:20px;color:var(--hm-brand);flex:none}.now-open>span{flex:1;min-width:0}.now-open b{font-size:13px;font-weight:500;display:block;overflow-wrap:anywhere}.now-open small{font-size:11px;color:var(--hm-muted);display:block;overflow-wrap:anywhere}.now-open strong{font-size:13px;font-weight:500;font-variant-numeric:tabular-nums}.now-row .k-btn{width:34px;height:34px;min-height:34px}.now-row .k-btn ha-icon{--mdc-icon-size:18px}.k-status.unavailable,.k-status.unknown{color:var(--hm-muted);background:var(--hm-surface-2)}.k-status.estimated{color:var(--hm-warn);background:color-mix(in srgb,var(--hm-warn) 12%,transparent)}.device-custom{display:grid;gap:14px;margin-bottom:14px}
@container homemanager (max-width:1099px){:host{border:1px solid var(--hm-line);height:auto;max-height:calc(var(--hm-viewport-height,66vh) - 24px)}.insights-handle{display:flex;flex:none;align-items:center;justify-content:space-between;gap:8px;border:0;border-bottom:1px solid var(--hm-line);background:var(--hm-surface);border-radius:0;font-size:13px;font-weight:500;padding:10px 16px;touch-action:none}.insights-handle>span{display:none}.insights-handle ha-icon{--mdc-icon-size:18px}:host(:not([data-expanded=true])) .insights-surface{display:none}.now-head{display:none}.insights-surface{max-height:calc(var(--hm-viewport-height,66vh) - 70px)}}
@container homemanager (max-width:650px){:host{border:0;max-height:100%}.insights-handle{position:relative;min-height:48px;padding-top:16px}.insights-handle>span{display:block;position:absolute;top:6px;left:calc(50% - 18px);width:36px;height:4px;border-radius:4px;background:var(--hm-line)}.device-head{padding:12px 16px}.device-icon{width:44px;height:44px;border-radius:14px}.device-content{padding:14px 16px 20px}.device-values{grid-template-columns:repeat(auto-fit,minmax(85px,1fr))}.device-options .k-btn{min-height:44px}.device-stepper button{min-height:44px}.insights-scroll{touch-action:pan-y}.device-head h2{font-size:16px}.device-head .k-status{font-size:10px}.insights-surface{max-height:calc(var(--hm-viewport-height,62dvh)*.82 - 48px)}}
`;
