import { t, getLanguage } from '../i18n/index.js';
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
  | 'automations-section'
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
  /** Where the page slides from (0.13 notebook): into a section, or back to the list. */
  direction?: 'fwd' | 'back' | '';
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
  { id: 'rules-section', title: () => t('Alertas'), icon: 'mdi:bell-outline' },
  { id: 'automations-section', title: () => t('Automatizaciones'), icon: 'mdi:robot-outline' },
  { id: 'health-section', title: () => t('Estado de la casa'), icon: 'mdi:stethoscope' },
  { id: 'storage-section', title: () => t('Almacenamiento'), icon: 'mdi:database-outline' },
  { id: 'import-section', title: () => t('Datos y copias'), icon: 'mdi:database-outline' },
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
  // In English "Alerts" is already the row below: the group says both.
  {
    title: () => (getLanguage() === 'es' ? 'Avisos' : 'Alerts & automations'),
    sections: ['rules-section', 'automations-section'],
  },
  { title: () => t('Mantenimiento'), sections: ['health-section', 'import-section'] },
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
  'automations-section': 'Cuando → Hacer → Comprobar → Si falla. Se guardan en Home Assistant.',
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

/** Settings as a notebook (0.13): ⚙ opens the classic menu, every section by icon and
 * name, grouped; a section slides in over it and ← slides back. */
export function settingsPage(page: SettingsPage): string {
  const badge = (id: SettingsSection) =>
    id === 'rooms-section' && page.problems
      ? `<span class="settings-badge warn">${page.problems}</span>`
      : id === 'health-section' && page.health
        ? `<span class="settings-badge warn">${page.health}</span>`
        : id === 'pending-section' && page.pending
          ? `<span class="settings-badge warn">${page.pending}</span>`
          : '';
  const slide = page.direction ? ` nb-${page.direction}` : '';
  if (page.view === 'list') {
    const groups = GROUPS.map(group => {
      const rows = group.sections
        .filter(id => page.available.has(id))
        .map(id => {
          const section = SECTIONS.find(item => item.id === id)!;
          return `<button type="button" class="nb-row" data-settings="${id}" title="${esc(t(PURPOSE[id]))}">${uiIcon(section.icon)}<span class="nb-name">${esc(section.title())}</span>${badge(id)}<span class="nb-chev">${uiIcon('mdi:chevron-right')}</span></button>`;
        })
        .join('');
      return rows
        ? `<div class="nb-group" role="group" aria-label="${esc(group.title())}"><span class="nb-heading">${esc(group.title())}</span>${rows}</div>`
        : '';
    }).join('');
    return `<div class="settings-page nb-list${slide}" data-view="list">${page.notice}<nav class="nb-menu" aria-label="${esc(t('Secciones de configuración'))}">${groups}</nav></div>`;
  }
  return `<div class="settings-page${slide}" data-view="section"><div class="settings-content">${page.notice}<section class="settings-section" id="${page.section}" aria-label="${esc(settingsTitle(page.section))}">${page.bodies[page.section] ?? ''}</section></div></div>`;
}
/** The group a section belongs to, for the path above its title. */
export const settingsGroupOf = (id: SettingsSection): string =>
  GROUPS.find(group => group.sections.includes(id))?.title() ?? '';
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
  // 0.13: the hover-help switch lives in Help.
  return `<homemanager-theme-choice></homemanager-theme-choice><homemanager-layer-choice></homemanager-layer-choice>${linkField}${gridField}`;
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
      return { title: issue.name, detail: t('La alerta apunta a algo que ya no existe'), fix: t('Abrir Alertas') };
    case 'unused-action':
      return { title: issue.name, detail: t('Acción que ningún control usa'), fix: t('Quitar acción') };
    case 'storage':
      return {
        title: t('Almacenamiento'),
        detail: t('Está al {percent} %: conviene liberar espacio', { percent: issue.percent }),
        fix: t('Abrir almacenamiento'),
      };
  }
}
/** 0.13 Home status: one list with filters on top (each with its count); the pending
 * references of Advanced are part of it. Each row: the symbol, what is wrong, and one
 * button that fixes it or opens where it is fixed. */
export type HealthFilter = 'all' | 'link' | 'out' | 'state' | 'ref';
type HealthRow = {
  cat: Exclude<HealthFilter, 'all'>;
  icon: string;
  title: string;
  detail: string;
  fix: string;
  fixIcon: string;
  attrs: string;
};
const STATUS_CAT: Record<StatusIssue['kind'], Exclude<HealthFilter, 'all'>> = {
  unlinked: 'link',
  offline: 'state',
  'unknown-state': 'state',
  'remote-missing': 'ref',
  'view-image': 'ref',
  'rule-target': 'ref',
  storage: 'state',
  'unused-action': 'ref',
};
const STATUS_ICON: Partial<Record<StatusIssue['kind'], string>> = {
  unlinked: 'mdi:link-variant-plus',
  offline: 'mdi:eye-outline',
  'unknown-state': 'mdi:eye-outline',
  'remote-missing': 'mdi:remote',
  'view-image': 'mdi:image-outline',
  'rule-target': 'mdi:bell-outline',
  storage: 'mdi:database-outline',
  'unused-action': 'mdi:trash-can-outline',
};
const ISSUE_CAT: Record<HealthIssue['kind'], Exclude<HealthFilter, 'all'>> = {
  'no-geometry': 'out',
  'unused-zone': 'out',
  misplaced: 'out',
  outside: 'out',
  'missing-entity': 'state',
  'same-name': 'out',
};
export function healthBody(
  health: PlanHealth,
  roomName: (id: string | null) => string,
  status: readonly StatusIssue[] = [],
  options: {
    filter?: HealthFilter;
    pending?: readonly string[];
    iconOf?: (deviceId: string) => string | undefined;
  } = {},
): string {
  const { plan, issues } = health;
  const filter = options.filter ?? 'all';
  const safe = issues.filter(isSafeFix).length;
  const rows: HealthRow[] = [
    ...status.map((issue, index) => {
      const text = statusText(issue);
      const device = 'deviceId' in issue ? options.iconOf?.(issue.deviceId) : undefined;
      return {
        cat: STATUS_CAT[issue.kind],
        icon: device ?? STATUS_ICON[issue.kind] ?? 'mdi:alert-circle-outline',
        ...text,
        fixIcon: STATUS_ICON[issue.kind] ?? 'mdi:wrench-outline',
        attrs: `data-command="status-action" data-status="${index}"`,
      };
    }),
    ...issues.map((issue, index) => {
      const text = issueText(issue, roomName);
      const device = 'deviceId' in issue ? options.iconOf?.(issue.deviceId) : undefined;
      const cat = ISSUE_CAT[issue.kind];
      return {
        cat,
        icon:
          device ??
          (issue.kind === 'unused-zone' || issue.kind === 'no-geometry' ? 'mdi:floor-plan' : 'mdi:map-marker-outline'),
        ...text,
        fixIcon:
          issue.kind === 'misplaced'
            ? 'mdi:map-marker-radius-outline'
            : issue.kind === 'unused-zone'
              ? 'mdi:plus'
              : issue.kind === 'no-geometry' && !issue.devices
                ? 'mdi:trash-can-outline'
                : 'mdi:wrench-outline',
        attrs: `data-command="health-action" data-issue="${index}"`,
      };
    }),
    ...(options.pending ?? []).map(text => ({
      cat: 'ref' as const,
      icon: 'mdi:link-variant-off',
      title: text,
      detail: t('Apunta a algo que todavía no existe en Home Assistant'),
      fix: '',
      fixIcon: '',
      attrs: '',
    })),
  ];
  // The drawing's identity is technical: it stays folded at the end (#74).
  const summary = `<details class="health-tech"><summary>${esc(t('Datos técnicos del plano'))}</summary><p class="k-sub">${esc(plan.title ?? t('Plano sin título'))} · ${esc(t('{zones} zonas · {spaces} espacios · {devices} dispositivos · huella {print}', { zones: plan.zones, spaces: plan.spaces, devices: plan.devices, print: plan.fingerprint }))}</p></details>`;
  if (!rows.length)
    return `<div class="k-notice">${uiIcon('mdi:check-circle-outline')}<span>${esc(t('Todo en orden: cada símbolo funciona, cada espacio tiene su zona y cada dispositivo está donde está dibujado.'))}</span></div>${summary}`;
  const filters: [HealthFilter, string][] = [
    ['all', t('Todo')],
    ['link', t('Sin vincular')],
    ['out', t('Plano y espacios')],
    ['state', t('Sin estado')],
    ['ref', t('Referencias')],
  ];
  const count = (cat: HealthFilter) => (cat === 'all' ? rows.length : rows.filter(row => row.cat === cat).length);
  const chips = `<div class="fchips" role="group" aria-label="${esc(t('Filtrar'))}">${filters
    .filter(([cat]) => cat === 'all' || count(cat))
    .map(
      ([cat, label]) =>
        `<button type="button" data-command="health-filter" data-filter="${cat}" aria-pressed="${filter === cat}">${esc(label)} <b>${count(cat)}</b></button>`,
    )
    .join(
      '',
    )}${safe ? `<span class="grow"></span><button type="button" class="hm-icon-button small" data-command="health-fix-safe" aria-label="${esc(t('Arreglar lo seguro ({count})', { count: safe }))}" title="${esc(t('Arreglar lo seguro ({count}): cada dispositivo a su espacio y fuera los espacios vacíos. Se deshace con Deshacer.', { count: safe }))}">${uiIcon('mdi:auto-fix')}</button>` : ''}</div>`;
  const list = rows
    .filter(row => filter === 'all' || row.cat === filter)
    .map(
      row =>
        `<div class="k-row health-row" data-cat="${row.cat}"><span class="ico-tile">${uiIcon(row.icon)}</span><span class="txt"><b>${esc(row.title)}</b><span>${esc(row.detail)}</span></span>${row.fix ? `<button type="button" class="hm-icon-button small" ${row.attrs} aria-label="${esc(row.fix)}" title="${esc(row.fix)}">${uiIcon(row.fixIcon)}</button>` : ''}</div>`,
    )
    .join('');
  return `${chips}<div class="k-list health-list">${list}</div>${summary}`;
}

export const settingsPageStyles = `
.health-plan{display:grid;gap:4px;padding:14px;border:1px solid var(--hm-line);border-radius:14px;background:var(--hm-surface)}
.health-row{gap:12px}.health-row .k-btn{flex:none;min-height:36px;padding:6px 12px;font-size:13px}.health-row .txt span{white-space:normal}
.copies{display:grid;grid-template-columns:auto 1fr;gap:10px}
.copy-tile{display:grid;place-items:center;width:64px;min-height:64px;border:1px solid var(--hm-line);border-radius:14px;background:var(--hm-surface);color:var(--hm-brand);cursor:pointer}.copy-tile ha-icon{--mdc-icon-size:26px}
.drop{position:relative;display:flex;align-items:center;gap:12px;padding:10px 14px;border:1.5px dashed var(--hm-line);border-radius:14px;background:var(--hm-surface);cursor:pointer}
.drop:hover{border-color:var(--hm-brand)}.drop ha-icon{--mdc-icon-size:26px;color:var(--hm-brand)}.drop span{display:grid;font-size:12.5px;color:var(--hm-muted)}.drop b{font-size:14px;font-weight:500;color:var(--hm-ink)}
.drop input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.fchips{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.fchips .grow{flex:1}
.fchips button[data-filter]{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 12px;border:1px solid var(--hm-line);border-radius:999px;background:var(--hm-surface);color:var(--hm-ink);font-size:13px;cursor:pointer}
.fchips button[data-filter] b{font-weight:600;color:var(--hm-muted)}
.fchips button[aria-pressed=true]{border-color:var(--hm-brand);background:color-mix(in srgb,var(--hm-brand) 12%,var(--hm-surface))}.fchips button[aria-pressed=true] b{color:var(--hm-brand)}
.ico-tile{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:10px;background:color-mix(in srgb,var(--hm-brand) 10%,transparent);color:var(--hm-brand)}.ico-tile ha-icon{--mdc-icon-size:20px}
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
.nb-menu{display:grid;gap:4px;padding:4px 0 16px}
.nb-group{display:grid}
.nb-heading{padding:14px 18px 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--hm-muted)}
.nb-row{display:flex;align-items:center;gap:14px;width:100%;min-height:48px;padding:8px 14px 8px 18px;border:0;border-radius:0;background:transparent;color:var(--hm-ink);text-align:left;font:inherit;font-size:14.5px;cursor:pointer}
.nb-row:hover{background:var(--hm-surface-2)}.nb-row>ha-icon:first-child{--mdc-icon-size:22px;color:var(--hm-brand);flex:none}
.nb-name{flex:1;min-width:0}.nb-chev{display:grid;color:var(--hm-muted)}.nb-chev ha-icon{--mdc-icon-size:20px}
.settings-page.nb-fwd{animation:hm-nb-in-right .26s cubic-bezier(.2,.7,.2,1) both}
.settings-page.nb-back{animation:hm-nb-in-left .26s cubic-bezier(.2,.7,.2,1) both}
@keyframes hm-nb-in-right{from{transform:translateX(100%)}to{transform:none}}
@keyframes hm-nb-in-left{from{transform:translateX(-28%);opacity:0}to{transform:none;opacity:1}}
@media(prefers-reduced-motion:reduce){.settings-page.nb-fwd,.settings-page.nb-back{animation:none}}
.task-crumb{display:block;font-size:11.5px;font-weight:400;color:var(--hm-muted)}
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
