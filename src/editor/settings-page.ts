import { tipsOn } from '../ui/tips.js';
import { t } from '../i18n/index.js';
import '../shell/layer-choice.js';
import '../ui/theme-choice.js';
import { showLink } from '../shell/show-link.js';
import { escapeHTML as esc, type Configuration } from '../card/types.js';
import { uiButton, uiIcon, uiStatus } from '../ui/components.js';
import { suggestRoomIcon } from '../shell/room-rail.js';
import { isSafeFix, type HealthIssue, type PlanHealth } from '../model/plan-health.js';
import type { StatusIssue } from '../model/home-status.js';

/** Settings as one page (#70): grouped sections on the left (a list first on a phone),
 * problems on top, spaces as a list. */
export type SettingsSection =
  | 'designer-section'
  | 'rooms-section'
  | 'views-section'
  | 'connect-section'
  | 'homes-section'
  | 'now-section'
  | 'appearance-section'
  | 'view-section'
  | 'controls-section'
  | 'rules-section'
  | 'health-section'
  | 'storage-section'
  | 'import-section'
  | 'actions-section'
  | 'panels-section'
  | 'pending-section'
  | 'help-section';
export interface SettingsPage {
  section: SettingsSection;
  /** On a phone: the list of sections, or the open section. */
  view: 'list' | 'section';
  /** Sections this person and this setup can use. */
  available: ReadonlySet<SettingsSection>;
  problems: number;
  /** Problems the diagnosis found. */
  health: number;
  pending: number;
  /** Shown above every section, so it cannot be missed. */
  notice: string;
  bodies: Record<SettingsSection, string>;
}

type SectionInfo = { id: SettingsSection; title: () => string; icon: string };
const SECTIONS: SectionInfo[] = [
  { id: 'rooms-section', title: () => t('Plano y espacios'), icon: 'mdi:floor-plan' },
  { id: 'views-section', title: () => t('Alternativas del plano'), icon: 'mdi:layers-outline' },
  { id: 'connect-section', title: () => t('Conectar con Home Assistant'), icon: 'mdi:home-automation' },
  { id: 'homes-section', title: () => t('Hogares'), icon: 'mdi:home-switch-outline' },
  { id: 'now-section', title: () => t('Panel Ahora'), icon: 'mdi:view-dashboard-outline' },
  { id: 'appearance-section', title: () => t('Apariencia'), icon: 'mdi:palette-outline' },
  { id: 'view-section', title: () => t('Tamaño y vista inicial'), icon: 'mdi:magnify-plus-outline' },
  { id: 'controls-section', title: () => t('Controles'), icon: 'mdi:remote' },
  { id: 'rules-section', title: () => t('Reglas'), icon: 'mdi:format-list-checks' },
  { id: 'health-section', title: () => t('Estado de la casa'), icon: 'mdi:stethoscope' },
  { id: 'storage-section', title: () => t('Almacenamiento'), icon: 'mdi:database-outline' },
  { id: 'import-section', title: () => t('Copias'), icon: 'mdi:swap-vertical' },
  { id: 'actions-section', title: () => t('Acciones lógicas'), icon: 'mdi:link-variant' },
  { id: 'panels-section', title: () => t('Paneles avanzados'), icon: 'mdi:view-list-outline' },
  { id: 'pending-section', title: () => t('Referencias pendientes'), icon: 'mdi:alert-outline' },
  { id: 'help-section', title: () => t('Ayuda'), icon: 'mdi:help-circle-outline' },
  // Reached from a symbol's sheet only; #73 merges it into one designer.
  { id: 'designer-section', title: () => t('Diseñador de controles'), icon: 'mdi:remote' },
];
const GROUPS: { title: () => string; sections: SettingsSection[]; advanced?: true }[] = [
  { title: () => t('Mi casa'), sections: ['rooms-section', 'homes-section'] },
  { title: () => t('Pantallas'), sections: ['now-section', 'appearance-section', 'view-section'] },
  { title: () => t('Controles'), sections: ['controls-section'] },
  { title: () => t('Reglas'), sections: ['rules-section'] },
  { title: () => t('Mantenimiento'), sections: ['health-section', 'storage-section', 'import-section'] },
  { title: () => t('Avanzado'), sections: ['actions-section', 'panels-section', 'pending-section'], advanced: true },
  { title: () => t('Ayuda'), sections: ['help-section'] },
];
/** One line under each section's title saying what it is for (#77). */
const PURPOSE: Record<SettingsSection, string> = {
  'rooms-section': 'El dibujo de tu casa y sus espacios: nombres, formas y orden.',
  'views-section': 'Otras imágenes del mismo plano, por ejemplo una clara y una oscura.',
  'connect-section': 'Une cada espacio con un área de Home Assistant y suma sus dispositivos.',
  'homes-section': 'Elegí qué hogar se muestra o empezá uno nuevo.',
  'now-section': 'Qué muestra el panel Ahora, al costado del plano.',
  'appearance-section': 'Claro u oscuro, qué capas se ven y cómo se mueven los símbolos. Sólo en este navegador.',
  'view-section': 'Cuánto crecen los símbolos con el zoom y en qué vista abre el plano.',
  'controls-section': 'Controles infrarrojos y de radio que aprendiste.',
  'rules-section': 'Avisos y resaltados cuando una lectura pasa un límite. Nunca envían comandos.',
  'health-section': 'Lo que no está funcionando y cómo arreglarlo.',
  'storage-section': 'Cuánto ocupa HomeManager en Home Assistant y cómo liberar espacio.',
  'import-section': 'Copias del plano para guardar, mover o volver atrás.',
  'actions-section': 'Acciones guardadas que usan los controles. Para usuarios avanzados.',
  'panels-section':
    'Pantallas de controles armadas a mano para un dispositivo. Se usan cuando el control automático no alcanza.',
  'pending-section': 'Símbolos que apuntan a algo que todavía no existe en Home Assistant.',
  'help-section': 'Cómo se usa HomeManager y qué significa cada cosa.',
  'designer-section': 'Cómo se ve el control de un símbolo.',
};
/** Where a fresh Settings page opens: the first section this person can use. */
export function firstSection(available: ReadonlySet<SettingsSection>): SettingsSection {
  return GROUPS.flatMap(group => group.sections).find(id => available.has(id)) ?? 'help-section';
}
export const settingsTitle = (id: SettingsSection) => SECTIONS.find(section => section.id === id)!.title();

export function settingsPage(page: SettingsPage): string {
  const badge = (id: SettingsSection) =>
    id === 'rooms-section' && page.problems
      ? `<span class="settings-badge warn">${page.problems}</span>`
      : id === 'health-section' && page.health
        ? `<span class="settings-badge warn">${page.health}</span>`
        : id === 'pending-section'
          ? `<span class="settings-badge${page.pending ? ' warn' : ''}">${page.pending}</span>`
          : '';
  // 0.13: one icon per section in a strip; the name and what it is for show on hover.
  const button = (section: SectionInfo) =>
    `<button type="button" data-settings="${section.id}" aria-label="${esc(section.title())}" title="${esc(section.title())}: ${esc(t(PURPOSE[section.id]))}"${section.id === page.section ? ' aria-current="page"' : ''}>${uiIcon(section.icon)}${badge(section.id)}</button>`;
  const nav = GROUPS.map(group => {
    const items = group.sections
      .filter(id => page.available.has(id))
      .map(id => button(SECTIONS.find(section => section.id === id)!))
      .join('');
    return items
      ? `<div class="settings-group-box" role="group" aria-label="${esc(group.title())}">${items}</div>`
      : '';
  })
    .filter(Boolean)
    .join('<span class="settings-sep" aria-hidden="true"></span>');
  const current = SECTIONS.find(section => section.id === page.section)!;
  return `<div class="settings-page" data-view="section"><nav class="settings-nav" aria-label="${esc(t('Secciones de configuración'))}">${nav}</nav><div class="settings-content">${page.notice}<section class="settings-section" id="${page.section}" aria-labelledby="settings-title"><h3 id="settings-title" title="${esc(t(PURPOSE[page.section]))}">${esc(current.title())}</h3>${page.bodies[page.section] ?? ''}</section></div></div>`;
}
/** The menu (0.13): every section by name, grouped, to open Settings right there. */
export function navMenuMarkup(admin: boolean): string {
  const allowed = (id: SettingsSection) =>
    id !== 'designer-section' && (admin || id === 'appearance-section' || id === 'help-section');
  return GROUPS.map(group => {
    const items = group.sections
      .filter(allowed)
      .map(id => {
        const section = SECTIONS.find(item => item.id === id)!;
        return `<button type="button" class="nav-item" data-command="nav-open" data-section="${id}">${uiIcon(section.icon)}<span>${esc(section.title())}</span></button>`;
      })
      .join('');
    return items ? `<div class="nav-group"><span class="nav-heading">${esc(group.title())}</span>${items}</div>` : '';
  }).join('');
}

/** Light and dark, which layers the plan shows and, for editors, the grid: per browser. */
export function appearanceBody(grid?: number): string {
  const steps: [number, string][] = [
    [0, t('Sin cuadrícula')],
    [0.005, t('Fina (0,5 %)')],
    [0.01, t('Normal (1 %)')],
    [0.025, t('Gruesa (2,5 %)')],
  ];
  const gridField =
    grid === undefined
      ? ''
      : `<label class="field" title="${esc(t('En modo edición, los símbolos saltan de celda en celda. Con Alt se mueven libres; en pantallas táctiles, mantené pulsado un símbolo para moverlo.'))}">${esc(t('Cuadrícula al mover'))}<select data-grid-step>${steps.map(([value, label]) => `<option value="${value}"${value === grid ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></label>`;
  const link = showLink();
  const linkField = `<label class="field">${esc(t('Mostrar vínculo'))}<select data-show-link>${(
    [
      ['unlinked', t('Sólo en símbolos sin vincular')],
      ['always', t('Siempre')],
      ['never', t('Nunca')],
    ] as const
  )
    .map(([value, label]) => `<option value="${value}"${value === link ? ' selected' : ''}>${esc(label)}</option>`)
    .join('')}</select></label>`;
  // 0.13: hover help can be turned off; the choice stays in this browser.
  const tips = `<label class="check"><input type="checkbox" data-tips${tipsOn() ? ' checked' : ''}><span>${esc(t('Ayudas al pasar el mouse'))}</span></label>`;
  return `<homemanager-theme-choice></homemanager-theme-choice><homemanager-layer-choice></homemanager-layer-choice>${linkField}${tips}${gridField}`;
}

/** A space's place in the plan, for its row: on the plan, drawn here, a kept copy, or nothing. */
export function spaceStatus(room: Configuration['rooms'][number], hasZone: boolean): { text: string; tone: string } {
  if (room.shapeSource === 'app') return { text: t('Forma propia'), tone: 'ok' };
  if (hasZone) return { text: t('En el plano'), tone: 'ok' };
  if (room.shape) return { text: t('Copia guardada'), tone: 'ok' };
  return { text: t('Sin zona'), tone: 'warn' };
}

export function spacesList(configuration: Configuration, zoneIds: ReadonlySet<string>): string {
  const count = (id: string) => configuration.catalog.devices.filter(device => device.roomId === id).length;
  if (!configuration.rooms.length) return `<p class="note">${esc(t('Todavía no hay espacios.'))}</p>`;
  return `<div class="k-list rooms-list" role="list" aria-label="${esc(t('Espacios'))}">${configuration.rooms
    .map(room => {
      const status = spaceStatus(room, zoneIds.has(room.id));
      const devices = count(room.id);
      return `<div class="k-row room-item" role="listitem" data-room-item="${esc(room.id)}"><button type="button" class="room-grip" data-room-grip="${esc(room.id)}" aria-label="${esc(t('Mover {room}: flechas arriba y abajo', { room: room.label }))}">${uiIcon('mdi:drag-vertical')}</button><button type="button" class="room-open" data-command="room-open" data-room="${esc(room.id)}" aria-label="${esc(t('Editar {room}', { room: room.label }))}"><span class="ico${status.tone === 'warn' ? ' grey' : ''}">${uiIcon(room.icon ?? suggestRoomIcon(room.label))}</span><span class="txt"><b>${esc(room.label)}</b><span>${esc(devices ? t('{count} dispositivos', { count: devices }) : t('Sin dispositivos'))}</span></span>${uiStatus(status.text, status.tone)}<span class="chev">${uiIcon('mdi:chevron-right')}</span></button></div>`;
    })
    .join('')}</div>`;
}

export function planCard(content: string, zones: number, rooms: number): string {
  return `<div class="plan-card"><div class="plan-thumb" aria-hidden="true">${content}</div><div class="plan-info"><b>${esc(t('Plano de la casa'))}</b><span class="k-sub">${esc(t('{zones} zonas · {rooms} espacios', { zones, rooms }))}</span><div class="plan-actions">${uiButton(t('Reemplazar plano'), 'settings-import', 'secondary', 'mdi:upload')}</div></div></div>`;
}

/** What a row says about a problem, and what its button does. */
function issueText(
  issue: HealthIssue,
  roomName: (id: string | null) => string,
): { title: string; detail: string; fix: string } {
  switch (issue.kind) {
    case 'no-geometry':
      return {
        title: issue.label,
        detail: issue.devices
          ? t('Espacio sin zona ni forma, con {count} dispositivos', { count: issue.devices })
          : t('Espacio sin zona ni forma, y sin dispositivos'),
        fix: issue.devices ? t('Abrir') : t('Quitar'),
      };
    case 'unused-zone':
      return { title: issue.label, detail: t('Zona del plano que ningún espacio usa'), fix: t('Agregar') };
    case 'misplaced':
      return {
        title: issue.label,
        detail: t('Dibujado en {drawn}, asignado a {assigned}', {
          drawn: roomName(issue.to),
          assigned: roomName(issue.from),
        }),
        fix: t('Mover a {room}', { room: roomName(issue.to) }),
      };
    case 'outside':
      return { title: issue.label, detail: t('Dibujado fuera de todos los espacios'), fix: t('Abrir') };
    case 'missing-entity':
      return { title: issue.label, detail: t('Su entidad ya no existe en Home Assistant'), fix: t('Abrir') };
    case 'same-name':
      return {
        title: issue.label,
        detail: t('Hay {count} espacios con este nombre', { count: issue.rooms.length }),
        fix: t('Abrir'),
      };
  }
}
/** What a home-status row says (#74), and what its button does. */
function statusText(issue: StatusIssue): { title: string; detail: string; fix: string } {
  switch (issue.kind) {
    case 'unlinked':
      return { title: issue.label, detail: t('Todavía no está conectado a un dispositivo'), fix: t('Vincular') };
    case 'offline':
      return {
        title: issue.label,
        detail: t('No responde: Home Assistant lo ve sin conexión'),
        fix: t('Ver dispositivo'),
      };
    case 'unknown-state':
      return { title: issue.label, detail: t('Home Assistant no sabe su estado'), fix: t('Ver dispositivo') };
    case 'remote-missing':
      return {
        title: issue.label,
        detail:
          issue.source === 'ir' ? t('Usa un control IR que ya no existe') : t('Usa un control RF que ya no existe'),
        fix: t('Elegir control'),
      };
    case 'view-image':
      return {
        title: issue.name,
        detail: issue.mode === 'light' ? t('Falta la imagen clara') : t('Falta la imagen oscura'),
        fix: t('Abrir alternativas'),
      };
    case 'rule-target':
      return { title: issue.name, detail: t('La regla apunta a algo que ya no existe'), fix: t('Abrir Reglas') };
    case 'storage':
      return {
        title: t('Almacenamiento'),
        detail: t('Está al {percent} %: conviene liberar espacio', { percent: issue.percent }),
        fix: t('Abrir almacenamiento'),
      };
  }
}
export function healthBody(
  health: PlanHealth,
  roomName: (id: string | null) => string,
  status: readonly StatusIssue[] = [],
): string {
  const { plan, issues } = health;
  const safe = issues.filter(isSafeFix).length;
  // The drawing's identity is technical: it stays folded at the end (#74).
  const summary = `<details class="health-tech"><summary>${esc(t('Datos técnicos del plano'))}</summary><p class="k-sub">${esc(plan.title ?? t('Plano sin título'))} · ${esc(t('{zones} zonas · {spaces} espacios · {devices} dispositivos · huella {print}', { zones: plan.zones, spaces: plan.spaces, devices: plan.devices, print: plan.fingerprint }))}</p></details>`;
  const statusRows = status
    .map((issue, index) => {
      const text = statusText(issue);
      return `<div class="k-row health-row"><span class="txt"><b>${esc(text.title)}</b><span>${esc(text.detail)}</span></span><button type="button" class="k-btn" data-command="status-action" data-status="${index}">${esc(text.fix)}</button></div>`;
    })
    .join('');
  if (!issues.length && !status.length)
    return `<div class="k-notice">${uiIcon('mdi:check-circle-outline')}<span>${esc(t('Todo en orden: cada símbolo funciona, cada espacio tiene su zona y cada dispositivo está donde está dibujado.'))}</span></div>${summary}`;
  if (!issues.length) return `<div class="k-list health-list">${statusRows}</div>${summary}`;
  const rows = issues
    .map((issue, index) => {
      const text = issueText(issue, roomName);
      return `<div class="k-row health-row"><span class="txt"><b>${esc(text.title)}</b><span>${esc(text.detail)}</span></span><button type="button" class="k-btn" data-command="health-action" data-issue="${index}">${esc(text.fix)}</button></div>`;
    })
    .join('');
  return `${statusRows ? `<div class="k-list health-list">${statusRows}</div>` : ''}${safe ? `<div class="rooms-actions"><button type="button" class="primary" data-command="health-fix-safe">${esc(t('Arreglar lo seguro ({count})', { count: safe }))}</button></div><p class="note">${esc(t('Mueve cada dispositivo al espacio donde está dibujado y quita los espacios vacíos sin zona. Se deshace con Deshacer.'))}</p>` : ''}<div class="k-list health-list">${rows}</div>${summary}`;
}

export const settingsPageStyles = `
.health-plan{display:grid;gap:4px;padding:14px;border:1px solid var(--hm-line);border-radius:14px;background:var(--hm-surface)}
.health-row{gap:12px}.health-row .k-btn{flex:none;min-height:36px;padding:6px 12px;font-size:13px}.health-row .txt span{white-space:normal}
.settings-dialog{width:min(1040px,calc(100vw - 24px));height:min(780px,calc(100dvh - 32px));padding:0;display:flex;flex-direction:column;overflow:hidden}
.settings-dialog[open]{display:flex}
.settings-dialog>.sheet-header{position:static;margin:0;padding:14px 18px;border-bottom:1px solid var(--hm-line);background:var(--hm-surface)}
.settings-page{flex:1;min-height:0;min-width:0;display:flex;flex-direction:column}
.settings-nav{flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:2px;min-width:0;padding:6px 8px;border-bottom:1px solid var(--hm-line);background:var(--hm-surface)}
.settings-nav button{position:relative;display:grid;place-items:center;flex:none;width:44px;height:44px;min-height:44px;padding:0;border:0;border-radius:12px;background:transparent;color:var(--hm-ink)}
.settings-nav button:hover{background:var(--hm-surface-2)}.settings-nav button ha-icon{--mdc-icon-size:22px}
.settings-nav button[aria-current=page]{background:var(--hm-brand);color:var(--hm-on-accent)}
.settings-nav .settings-badge{position:absolute;top:1px;right:1px;min-width:16px;height:16px;padding:0 4px;font-size:10px}
.settings-group-box{display:flex;flex-wrap:wrap;gap:2px}.settings-sep{flex:none;width:1px;height:22px;margin:0 4px;background:var(--hm-line)}
.settings-advanced>summary{list-style:none;cursor:pointer;min-height:44px;display:flex;align-items:center}.settings-advanced>summary::-webkit-details-marker{display:none}.settings-advanced>summary::after{content:'▸';margin-left:auto;padding-right:12px;color:var(--hm-muted)}.settings-advanced[open]>summary::after{content:'▾'}
.settings-chev{display:none}.settings-list{display:none}.section-purpose{margin:-8px 0 0;color:var(--hm-muted);font-size:13px;line-height:1.5}
.settings-badge{min-width:22px;height:22px;padding:0 6px;border-radius:11px;display:grid;place-items:center;font-size:11px;font-weight:700;background:var(--hm-surface-2,var(--hm-line));color:var(--hm-muted)}.settings-badge.warn{background:color-mix(in srgb,var(--hm-warn) 18%,transparent);color:var(--hm-warn)}
.settings-content{flex:1;min-height:0;overflow:auto;padding:14px 16px 24px;display:grid;align-content:start;gap:14px}
.settings-section{display:grid;gap:14px;min-width:0;max-width:720px}/* #66: a reading width on wide monitors */.settings-section>h3{margin:0;font-size:18px}
.plan-card{display:flex;gap:16px;align-items:center;padding:14px;border:1px solid var(--hm-line);border-radius:16px;background:var(--hm-surface)}
.plan-thumb{flex:none;width:160px;height:110px;border-radius:12px;overflow:hidden;background:var(--hm-bg);display:grid;place-items:center}.plan-thumb svg{width:100%;height:100%}
.plan-info{display:grid;gap:6px;min-width:0}.plan-actions{display:flex;gap:8px;flex-wrap:wrap}
.rooms-list .room-item{padding:0;gap:0;min-height:58px}
.room-grip{flex:none;width:40px;min-height:58px;border:0;border-radius:0;background:transparent;color:var(--hm-muted);cursor:grab;touch-action:none;padding:0}
.room-open{flex:1;min-width:0;display:flex;align-items:center;gap:12px;min-height:58px;padding:8px 14px 8px 0;border:0;border-radius:0;background:transparent;color:var(--hm-ink);text-align:left}
.room-item.dragging{position:relative;z-index:2;box-shadow:var(--hm-shadow);background:var(--hm-surface)}
.rooms-actions{display:flex;gap:8px;flex-wrap:wrap}.rooms-actions button{display:inline-flex;align-items:center;gap:8px}.rooms-actions ha-icon{--mdc-icon-size:18px}
@media(max-width:720px){
.settings-dialog{width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;margin:0;border-radius:0}
.settings-content{padding:12px 14px 20px}
.plan-thumb{width:110px;height:80px}
}
`;
