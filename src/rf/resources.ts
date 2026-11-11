import { escapeHTML as e, type Hass } from '../card/types.js';
import { t, getLanguage } from '../i18n/index.js';
import { historySeries } from '../integration/history.js';
import {
  remoteResources,
  type AbsoluteControl,
  type AbsoluteState,
  type CatalogRow,
  type Resources,
  type Schedule,
} from '../integration/remote-resources.js';
import type { RfWidget } from '../integration/rf.js';
import { ControlDesigner } from '../ui/control-designer.js';
import { installPanelComponents, keepPanelFocus } from '../ui/panel-components.js';
import { panelLabel, sidePanelStyles, sourceTag } from '../ui/side-panel.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { HomeManagerRfRemote } from './remote-view.js';

const titles: Record<string, string> = {
  power: 'Encendido',
  temperature: 'Temperatura solicitada',
  mode: 'Modo',
  fan: 'Ventilador',
  vane: 'Lamas verticales',
  wide_vane: 'Lamas horizontales',
  econo_cool: 'ECONO COOL',
  clock: 'Reloj del mando',
  native_timer: 'Temporizador del mando',
  start_time: 'Hora de encendido',
  stop_time: 'Hora de apagado',
  schedules: 'Programación',
  send: 'Enviar estado',
  'power-on': 'Encender',
  'power-off': 'Apagar',
};
const choices: Record<string, string> = {
  auto: 'Automático',
  cool: 'Frío',
  heat: 'Calor',
  dry: 'Seco',
  fan: 'Ventilación',
  quiet: 'Silencioso',
  low: 'Bajo',
  medium: 'Medio',
  high: 'Alto',
  max: 'Máximo',
  middle: 'Media',
  highest: 'Superior',
  lowest: 'Inferior',
  swing: 'Oscilar',
  center: 'Centro',
  left: 'Izquierda',
  right: 'Derecha',
  far_left: 'Extremo izquierdo',
  far_right: 'Extremo derecho',
  wide: 'Amplio',
  none: 'Desactivado',
  stop: 'Apagar',
  start: 'Encender',
  both: 'Encender y apagar',
};
const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const sources = ['Flipper-IRDB', 'SmartIR', 'IRremoteESP8266'];
const option = (value: string, title: string, selected?: string) =>
  '<option value="' + e(value) + '"' + (value === selected ? ' selected' : '') + '>' + e(title) + '</option>';
const label = (title: string, field: string) => '<label><span>' + e(t(title)) + '</span>' + field + '</label>';
const input = (name: string, value = '', attrs = '') =>
  '<input name="' + name + '" value="' + e(value) + '" ' + attrs + '>';
const glyph = (icon: string) => '<ha-icon icon="' + e(icon) + '" aria-hidden="true"></ha-icon>';
/** 0.13 design: actions are icons; their name shows on hover and is read aloud. */
const ICONS: Record<string, string> = {
  directory: 'mdi:arrow-left',
  control: 'mdi:remote',
  timers: 'mdi:timer-outline',
  design: 'mdi:pencil-ruler',
  send: 'mdi:send',
  preset: 'mdi:content-save-outline',
  recall: 'mdi:backup-restore',
  powerful: 'mdi:snowflake-alert',
  'unlink-powerful': 'mdi:link-variant-off',
  remove: 'mdi:trash-can-outline',
  'new-schedule': 'mdi:plus',
  'cancel-schedule': 'mdi:close',
  'remove-schedule': 'mdi:trash-can-outline',
  preview: 'mdi:file-search-outline',
  'select-all': 'mdi:checkbox-multiple-marked-outline',
};
const iconOf = (name: string) =>
  ICONS[name] ??
  (name.startsWith('schedule-') ? 'mdi:pencil-outline' : name.startsWith('toggle-') ? 'mdi:pause' : 'mdi:gesture-tap');
const action = (name: string, title: string, style = '', icon = iconOf(name), hint = title) =>
  '<button type="button" data-act="' +
  name +
  '" class="ib' +
  (style === 'primary-action' ? ' primary' : style === 'danger' ? ' danger' : '') +
  '" aria-label="' +
  e(t(title)) +
  '" title="' +
  e(t(hint)) +
  '">' +
  glyph(icon) +
  '</button>';
const primary = (title: string, icon = 'mdi:check') =>
  '<button type="submit" class="ib primary" aria-label="' +
  e(t(title)) +
  '" title="' +
  e(t(title)) +
  '">' +
  glyph(icon) +
  '</button>';
/** What used to be a line of explanation is now on hover. */
const info = (text: string) =>
  '<ha-icon class="info" icon="mdi:information-outline" title="' +
  e(t(text)) +
  '" aria-label="' +
  e(t(text)) +
  '" role="img"></ha-icon>';
const when = (iso: string, timeZone?: string) => {
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(getLanguage(), { dateStyle: 'short', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) })
    : iso.replace('T', ' ');
};
const titleFor = (key: string) => t(titles[key] ?? key);
const optionFor = (key: string) => t(choices[key] ?? key);

const styles = `
:host{display:block;min-width:0}.resources{display:grid;gap:12px;min-width:0}
.resource-card{border:1px solid var(--hm-line);border-radius:14px;padding:12px;display:grid;gap:10px;min-width:0}
h3,p{margin:0}h3{font-size:15px;font-weight:600}
.form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(145px,100%),1fr));gap:10px}
label{display:grid;gap:4px;font-size:12px;color:var(--hm-muted);min-width:0}
label :is(input,select,textarea){font-size:14px;color:var(--hm-ink)}
.row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.row .check{display:flex;align-items:center;gap:4px;border:1px solid var(--hm-line);border-radius:10px;padding:0 7px;min-height:44px}
.status{min-height:1.2em}.requested{display:grid;gap:5px;color:var(--hm-muted);font-size:13px}
.schedule{border-top:1px solid var(--hm-line);padding-top:8px;display:grid;gap:5px}
.library-row{display:flex;align-items:center;gap:8px;padding:5px;border-bottom:1px solid var(--hm-line);overflow-wrap:anywhere}
.library-row label{display:flex;align-items:center;gap:10px;min-height:44px;flex:1;min-width:0;font-size:14px;color:var(--hm-ink)}
.library-row label span{flex:1;min-width:0;overflow-wrap:normal;word-break:normal}
.library-row .info{color:var(--hm-warn)}
[hidden]{display:none!important}
.ib{display:grid;place-items:center;width:40px;height:40px;min-height:40px;padding:0;border:0;border-radius:11px;background:transparent;color:var(--hm-ink);cursor:pointer;flex:none}
.ib:hover:not(:disabled){background:var(--hm-surface-2)}.ib ha-icon{--mdc-icon-size:21px}.ib:disabled{opacity:.4;cursor:default}
.ib.primary{background:var(--hm-brand);color:var(--hm-on-accent,#fff);border-radius:50%;width:44px;height:44px}
.ib.danger{color:var(--hm-alert)}.ib[aria-pressed=true]{background:color-mix(in srgb,var(--hm-brand) 16%,transparent);color:var(--hm-brand)}
.ib .count{position:absolute;margin:-26px -26px 0 0;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:var(--hm-ink);color:var(--hm-surface);font-size:11px;line-height:18px}
.bar{display:flex;align-items:center;gap:4px;flex-wrap:wrap}.bar .grow{flex:1}
.seg{display:inline-flex;gap:2px;padding:3px;border-radius:12px;background:var(--hm-surface-2)}
.seg .ib{width:36px;height:34px;min-height:34px;border-radius:9px;color:var(--hm-muted)}
.seg .ib[aria-pressed=true],.seg label:has(input:checked){background:var(--hm-surface);color:var(--hm-ink);box-shadow:var(--hm-shadow)}
.seg label{display:grid;place-items:center;width:40px;height:34px;border-radius:9px;color:var(--hm-muted);cursor:pointer}
.seg label input{position:absolute;opacity:0;width:1px;height:1px}
h3{display:flex;align-items:center;gap:6px}.info{--mdc-icon-size:17px;color:var(--hm-muted);cursor:help;flex:none}
select,input:not([type=checkbox]):not([type=radio]):not([type=file]){min-height:40px;padding:4px 10px;border:1px solid var(--hm-line);border-radius:10px;background:var(--hm-surface);color:var(--hm-ink);font:inherit;min-width:0}
input[type=checkbox]{appearance:none;-webkit-appearance:none;box-sizing:border-box;width:42px!important;min-width:42px!important;max-width:42px;height:24px!important;min-height:24px!important;padding:0;border:0;flex:none;margin:0;border-radius:12px;background:var(--hm-line);position:relative;cursor:pointer}
input[type=checkbox]::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--hm-surface);box-shadow:var(--hm-shadow);transition:left .15s}
input[type=checkbox]:checked{background:var(--hm-brand)}input[type=checkbox]:checked::after{left:21px}input[type=checkbox]:disabled{opacity:.45}
.days{display:flex;gap:6px;flex-wrap:wrap}
.days label{display:grid;place-items:center;min-width:44px;height:36px;padding:0 8px;border:1px solid var(--hm-line);border-radius:999px;color:var(--hm-ink);font-size:13px;cursor:pointer}
.days label:has(input:checked){background:color-mix(in srgb,var(--hm-brand) 16%,var(--hm-surface));border-color:var(--hm-brand);color:var(--hm-brand)}
.days input{position:absolute;opacity:0;width:1px;height:1px}
.drop{position:relative;display:flex;align-items:center;gap:12px;padding:10px 14px;border:1.5px dashed var(--hm-line);border-radius:14px;cursor:pointer;color:var(--hm-ink)}
.drop:hover{border-color:var(--hm-brand)}.drop ha-icon{--mdc-icon-size:24px;color:var(--hm-brand)}.drop span{display:grid;font-size:12.5px;color:var(--hm-muted)}.drop b{font-size:14px;font-weight:500;color:var(--hm-ink)}
.drop input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.requested{display:flex;align-items:center;gap:8px;font-size:13px}.requested>ha-icon{color:var(--hm-brand)}
.state{padding:2px 8px;border-radius:999px;font-size:11.5px;color:var(--hm-accent,#3f7fbf);background:color-mix(in srgb,var(--hm-accent,#3f7fbf) 12%,transparent);white-space:nowrap}
.schedule{display:flex;align-items:center;gap:8px}.schedule .when{flex:1;min-width:0;display:grid;gap:2px}.schedule .when small{color:var(--hm-muted)}
.schedule.paused .when{opacity:.55}
`;

const pieceStyles = `.absolute-widget label{display:grid;gap:4px;font-size:12px;color:var(--hm-muted);min-width:0}
.absolute-widget :is(select,input[type=number],input[type=time]){min-height:36px;padding:2px 8px;border:1px solid var(--hm-line);border-radius:10px;background:var(--hm-surface);color:var(--hm-ink);font:inherit;font-size:14px;min-width:0}
.absolute-widget label{justify-items:start}.absolute-widget input[type=checkbox]{appearance:none;-webkit-appearance:none;box-sizing:border-box;flex:none;width:42px!important;min-width:42px!important;height:24px!important;min-height:24px!important;padding:0;border:0;margin:0;border-radius:12px;background:var(--hm-line);position:relative;cursor:pointer}
.absolute-widget input[type=checkbox]::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--hm-surface);box-shadow:var(--hm-shadow);transition:left .15s}
.absolute-widget input[type=checkbox]:checked{background:var(--hm-brand)}.absolute-widget input[type=checkbox]:checked::after{left:21px}.absolute-widget input[type=checkbox]:disabled{opacity:.45}
.absolute-widget .ib{display:grid;place-items:center;width:40px;height:40px;margin:auto;padding:0;border:0;border-radius:50%;background:var(--hm-brand);color:var(--hm-on-accent,#fff);cursor:pointer}
.absolute-widget .ib ha-icon{--mdc-icon-size:21px}`;

export class HomeManagerRemoteResources extends HTMLElement {
  private readonly root = this.attachShadow({ mode: 'open' });
  private readonly designer = new ControlDesigner();
  private readonly player = new HomeManagerRfRemote();
  private data?: Resources;
  private hass?: Hass;
  private section: 'absolute' | 'catalog' = 'absolute';
  private control?: AbsoluteControl;
  private draft: AbsoluteState = {};
  private tab: 'control' | 'timers' | 'design' = 'control';
  private schedule?: Schedule;
  private scheduleOpen = false;
  private scheduleDraft?: FormData;
  private busy = false;
  private error = false;
  private message = '';
  private generation = 0;
  private document = '';
  private filename = '';
  private source = sources[0];
  private catalogRows: CatalogRow[] = [];
  private chosen = new Set<number>();
  private catalogForm: Record<string, string> = {};
  onImported?: (id: string) => void;
  onDesign?: (open: boolean) => void;

  constructor() {
    super();
    installPanelComponents(this.root, 'remote-resources', sidePanelStyles + styles);
    this.root.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      if (button && !this.busy) void this.handleAction(button.dataset.act!);
    });
    this.root.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.target as HTMLFormElement;
      if (!this.busy) void this.submit(form.dataset.form!, new FormData(form));
    });
    this.root.addEventListener('change', event => {
      const field = event.target as HTMLInputElement;
      if (field.name === 'file') void this.readFile(field.files?.[0]);
      if (field.name === 'source') {
        this.source = field.value;
        this.catalogRows = [];
        this.chosen.clear();
        this.render();
      }
      if (field.name === 'remote_id' && field.closest('[data-form=create],[data-form=link-powerful]'))
        this.fillButtons(field.value, field.form!);
      if (field.matches('[data-catalog-choice]')) {
        if (field.checked && this.chosen.size >= 64) {
          field.checked = false;
          return;
        }
        const index = Number(field.value);
        if (field.checked) this.chosen.add(index);
        else this.chosen.delete(index);
        this.updateCatalogAction();
      }
      if (field.name === 'filter') this.filterCatalog(field.value);
    });
    this.root.addEventListener('input', event => {
      const field = event.target as HTMLInputElement;
      if (field.name === 'filter') this.filterCatalog(field.value);
      if (field.name === 'installed-filter') this.filterInstalled(field.value);
      if (field.closest('[data-form=schedule]') && field.form) this.scheduleDraft = new FormData(field.form);
      if (field.closest('[data-form=import]') && field.name) this.catalogForm[field.name] = field.value;
    });
  }

  setSession(hass: Hass): void {
    this.hass = hass;
    if (this.tab === 'design') this.designer.refreshIndicators();
    else this.player.updateIndicators();
  }

  open(section: 'absolute' | 'catalog', hass: Hass): void {
    this.section = section;
    this.hass = hass;
    this.control = undefined;
    this.tab = 'control';
    this.scheduleOpen = false;
    this.scheduleDraft = undefined;
    const generation = ++this.generation;
    this.busy = false;
    void this.run(async () => {
      const data = await remoteResources.list(hass);
      if (generation === this.generation) this.data = data;
    });
  }

  private async run(work: () => Promise<void>): Promise<void> {
    const generation = this.generation;
    this.busy = true;
    this.message = '';
    this.error = false;
    this.render();
    try {
      await work();
    } catch (error) {
      if (this.generation !== generation) return;
      this.error = true;
      this.message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
    } finally {
      if (this.generation === generation) {
        this.busy = false;
        this.render();
      }
    }
  }

  private emitters(current?: string): string {
    const list = this.data?.emitters ?? [];
    return (
      option('', t('Elegí un equipo'), current) +
      (current && !list.some(device => device.id === current)
        ? option(current, t('Emisor sin conexión'), current)
        : '') +
      list.map(device => option(device.id, device.name, current)).join('')
    );
  }

  private render(): void {
    const restore = keepPanelFocus(this.root);
    let content = '';
    if (!this.data) content = '<p>' + e(t(this.error ? 'No se pudieron abrir los controles' : 'Cargando…')) + '</p>';
    else if (this.section === 'catalog') content = this.catalog();
    else if (!this.control) content = this.directory();
    else if (this.tab === 'design') content = '<div data-designer-slot></div>' + action('control', 'Volver al control');
    else content = this.absolute(this.control);
    this.root.innerHTML =
      '<div class="resources" aria-busy="' +
      this.busy +
      '">' +
      content +
      '<p class="status' +
      (this.error ? ' error' : '') +
      '" role="status">' +
      e(this.message) +
      '</p></div>';
    if (this.busy)
      this.root
        .querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('button,input,select')
        .forEach(control => {
          control.disabled = true;
        });
    if (this.control && this.tab === 'design') this.mountDesigner(this.control);
    if (this.control && this.tab === 'control') this.mountPlayer(this.control);
    const native = this.root.querySelector<HTMLElement>('[data-form=native]');
    if (native) this.bindCapabilities(native);
    this.updateCatalogAction();
    restore();
  }

  private directory(): string {
    return (
      '<div class="list">' +
      this.data!.controls.map(
        control =>
          '<div class="li open"><button type="button" class="t" data-act="open-' +
          e(control.id) +
          '"><b>' +
          e(control.name) +
          '</b><span>' +
          e(control.brand + ' · ' + control.model) +
          '</span></button>' +
          sourceTag('ir') +
          '</div>',
      ).join('') +
      '</div><form class="resource-card" data-form="create"><h3>' +
      e(t('Nuevo control de estado absoluto')) +
      info('Elegí una captura aprendida de tu mando para identificar el perfil y la portadora.') +
      '</h3><div class="form-grid">' +
      label('Nombre', input('name', '', 'required maxlength="80"')) +
      label('Marca', input('brand', 'Mitsubishi Electric', 'required maxlength="80"')) +
      label('Modelo', input('model', '', 'required maxlength="80"')) +
      label(
        'Perfil',
        '<select name="profile">' +
          this.data!.profiles.map(profile =>
            option(profile, profile === 'mitsubishi-electric-144' ? 'Mitsubishi Electric · 144 bits' : profile),
          ).join('') +
          '</select>',
      ) +
      label(
        'Control IR aprendido',
        '<select name="remote_id" required>' +
          option('', t('Elegí un control')) +
          this.data!.learned.map(remote => option(remote.id, remote.name)).join('') +
          '</select>',
      ) +
      label(
        'Señal de referencia',
        '<select name="button_id" required>' + option('', t('Elegí una señal')) + '</select>',
      ) +
      label('Emisor IR', '<select name="emitter" required>' + this.emitters() + '</select>') +
      '</div><div class="bar"><span class="grow"></span>' +
      primary('Crear control', 'mdi:plus') +
      '</div></form>'
    );
  }

  private fillButtons(id: string, form: HTMLFormElement): void {
    const field = form.querySelector<HTMLSelectElement>('select[name=button_id]');
    const remote = this.data?.learned.find(item => item.id === id);
    if (field)
      field.innerHTML =
        option('', t('Elegí una señal')) +
        (remote?.buttons ?? []).map(button => option(button.id, button.name)).join('');
  }

  private absolute(control: AbsoluteControl): string {
    const requested = control.requested;
    const status = requested
      ? e(requested.state.power ? t('Encendido solicitado') : t('Apagado solicitado')) +
        ' · ' +
        e(when(requested.at)) +
        ' · ' +
        e(String(requested.state.temperature ?? '')) +
        ' °C'
      : e(t('Sin solicitudes registradas'));
    const tab = (name: 'control' | 'timers', title: string) =>
      '<button type="button" class="ib" data-act="' +
      name +
      '" aria-pressed="' +
      (this.tab === name) +
      '" aria-label="' +
      e(t(title)) +
      '" title="' +
      e(t(title)) +
      '">' +
      glyph(ICONS[name]!) +
      '</button>';
    const navigation =
      '<div class="bar">' +
      action('directory', 'Volver a la lista') +
      '<h3 class="grow">' +
      e(control.name) +
      '</h3><span class="seg">' +
      tab('control', 'Control') +
      tab('timers', 'Temporizadores') +
      '</span>' +
      action('design', 'Diseñar') +
      '</div>';
    const summary =
      '<div class="resource-card requested" title="' +
      e(t('Estado solicitado')) +
      '">' +
      glyph('mdi:send-check-outline') +
      '<span class="grow">' +
      status +
      '</span>' +
      (requested
        ? '<span class="state" title="' +
          e(t('Estado físico sin confirmación')) +
          '">' +
          e(t('Comando aceptado')) +
          '</span>'
        : '') +
      '</div>';
    const powerfulUntil =
      control.powerful && new Date(control.powerful).getTime() > Date.now()
        ? ' · ' +
          t('hasta {time}', {
            time: new Date(control.powerful).toLocaleTimeString(getLanguage(), { timeStyle: 'short' }),
          })
        : '';
    const actions =
      '<div class="bar">' +
      action('preset', 'Guardar SMART SET') +
      (control.preset ? action('recall', 'Recuperar SMART SET') : '') +
      (control.powerful_configured
        ? action('powerful', 'POWERFUL COOL', '', ICONS.powerful, 'POWERFUL COOL' + powerfulUntil)
        : '') +
      '<span class="grow"></span>' +
      action('send', 'Enviar estado', 'primary-action') +
      '</div>';
    const powerful =
      control.profile === 'mitsubishi-electric-144'
        ? '<form class="resource-card" data-form="link-powerful"><h3>POWERFUL COOL' +
          info('Vinculá la señal que aprendiste con POWERFUL COOL activado en el mando.') +
          '</h3><div class="form-grid">' +
          label(
            'Control IR aprendido',
            '<select name="remote_id" required>' +
              option('', t('Elegí un control')) +
              this.data!.learned.map(remote => option(remote.id, remote.name)).join('') +
              '</select>',
          ) +
          label(
            'Señal de referencia',
            '<select name="button_id" required>' + option('', t('Elegí una señal')) + '</select>',
          ) +
          '</div><div class="bar">' +
          (control.powerful_configured ? action('unlink-powerful', 'Quitar vínculo', 'danger') : '') +
          '<span class="grow"></span>' +
          primary('Vincular señal', 'mdi:link-variant') +
          '</div></form>'
        : '';
    return (
      navigation +
      (this.tab === 'timers' ? this.timers(control) : '<div data-player-slot></div>' + actions) +
      summary +
      '<details><summary>' +
      e(t('Ajustes del control')) +
      '</summary><form class="resource-card" data-form="settings"><div class="form-grid">' +
      label('Nombre', input('name', control.name, 'maxlength="80" required')) +
      label('Emisor IR', '<select name="emitter" required>' + this.emitters(control.emitter) + '</select>') +
      '</div><div class="bar">' +
      action('remove', 'Eliminar control', 'danger') +
      '<span class="grow"></span>' +
      primary('Guardar ajustes') +
      '</div></form>' +
      powerful +
      '</details>'
    );
  }

  private capability(key: string, control: AbsoluteControl): string {
    const cap = control.capabilities[key];
    const value = this.draft[key];
    const attrs = ' data-cap="' + e(key) + '"';
    if (cap.type === 'boolean')
      return label(
        titles[key] ?? key,
        '<input type="checkbox" role="switch"' +
          attrs +
          (value ? ' checked' : '') +
          (cap.mode && cap.mode !== this.draft.mode ? ' disabled' : '') +
          '>',
      );
    if (cap.type === 'select')
      return label(
        titles[key] ?? key,
        '<select' +
          attrs +
          '>' +
          (cap.options ?? []).map(choice => option(choice, optionFor(choice), String(value))).join('') +
          '</select>',
      );
    if (cap.type === 'time')
      return label(
        titles[key] ?? key,
        '<input type="time"' + attrs + ' required step="' + (cap.step ?? 60) + '" value="' + e(value) + '">',
      );
    return label(
      (key === 'temperature' ? 'Temperatura' : (titles[key] ?? key)) + (cap.unit ? ' · ' + cap.unit : ''),
      '<input type="number"' +
        attrs +
        ' aria-label="' +
        e(titleFor(key) + (cap.unit ? ' · ' + cap.unit : '')) +
        '"' +
        ' required min="' +
        cap.min +
        '" max="' +
        cap.max +
        '" step="' +
        cap.step +
        '" value="' +
        e(value) +
        '">',
    );
  }

  private bindCapabilities(host: HTMLElement): void {
    host.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-cap]').forEach(field => {
      field.addEventListener('change', () => {
        if (!field.reportValidity()) return;
        this.draft[field.dataset.cap!] =
          field instanceof HTMLInputElement && field.type === 'checkbox'
            ? field.checked
            : field instanceof HTMLInputElement && field.type === 'number'
              ? field.valueAsNumber
              : field.value;
        if (field.dataset.cap === 'mode' && this.draft.mode !== 'cool') this.draft.econo_cool = false;
        if (field.dataset.cap === 'mode' && this.tab === 'control') {
          const eco = this.player.shadowRoot?.querySelector<HTMLInputElement>('[data-cap=econo_cool]');
          if (eco) {
            eco.disabled = this.draft.mode !== 'cool';
            eco.checked = Boolean(this.draft.econo_cool);
          }
        }
      });
    });
  }

  private timers(control: AbsoluteControl): string {
    const schedule = this.schedule;
    const draft = this.scheduleDraft;
    const power = String(draft?.get('power') ?? (schedule?.power === false ? 'off' : 'on'));
    const native = Object.keys(control.capabilities).filter(key =>
      ['clock', 'native_timer', 'start_time', 'stop_time'].includes(key),
    );
    const builtIn =
      '<form data-form="native" class="resource-card"><h3>' +
      e(t('Temporizador del mando')) +
      info('La hora del mando admite pasos de 10 minutos.') +
      '</h3>' +
      '<div class="form-grid">' +
      native.map(key => this.capability(key, control)).join('') +
      '</div><div class="bar"><span class="grow"></span>' +
      primary('Enviar temporizador al equipo', 'mdi:send') +
      '</div></form>';
    const zone = this.data!.zone;
    const scheduleRows = control.schedules
      .map(
        row =>
          '<div class="schedule' +
          (row.enabled ? '' : ' paused') +
          '">' +
          glyph(row.power ? 'mdi:power' : 'mdi:power-off') +
          '<span class="when"><b>' +
          e(t(row.power ? 'Encender' : 'Apagar')) +
          ' · ' +
          e(row.time) +
          (row.zone !== zone ? ' · ' + e(row.zone.split('/').pop()!.replace(/_/g, ' ')) : '') +
          '</b><small>' +
          e(row.days.map(day => t(days[day])).join(' · ')) +
          (row.power && row.state.temperature !== undefined
            ? ' · ' + e(optionFor(String(row.state.mode))) + ' · ' + e(row.state.temperature) + ' °C'
            : '') +
          (row.next ? ' · ' + e(t('Próximo')) + ' ' + e(when(row.next, row.zone)) : '') +
          (row.last
            ? ' · ' +
              e(t('Último intento')) +
              ' ' +
              e(when(row.last)) +
              ' · ' +
              e(
                row.result === 'sent'
                  ? t('Comando aceptado')
                  : row.result === 'pending'
                    ? t('Pendiente')
                    : t('No se pudo enviar'),
              )
            : '') +
          '</small></span>' +
          action('schedule-' + row.id, 'Editar') +
          action('toggle-' + row.id, row.enabled ? 'Pausar' : 'Activar', '', row.enabled ? 'mdi:pause' : 'mdi:play') +
          '</div>',
      )
      .join('');
    const editor = this.scheduleOpen
      ? '<form data-form="schedule" class="resource-card"><h3>' +
        e(t(schedule ? 'Editar horario' : 'Nuevo horario')) +
        '</h3><div class="bar"><span class="seg" role="radiogroup" aria-label="' +
        e(t('Acción')) +
        '">' +
        (
          [
            ['on', 'Encender', 'mdi:power'],
            ['off', 'Apagar', 'mdi:power-off'],
          ] as const
        )
          .map(
            ([value, title, icon]) =>
              '<label title="' +
              e(t(title)) +
              '"><input type="radio" name="power" value="' +
              value +
              '" aria-label="' +
              e(t(title)) +
              '"' +
              (power === value ? ' checked' : '') +
              '>' +
              glyph(icon) +
              '</label>',
          )
          .join('') +
        '</span>' +
        label('Hora', input('time', String(draft?.get('time') ?? schedule?.time ?? '22:00'), 'type="time" required')) +
        '</div>' +
        ((draft?.get('zone') ?? schedule?.zone ?? zone) !== zone
          ? label(
              'Zona horaria',
              input('zone', String(draft?.get('zone') ?? schedule?.zone), 'maxlength="80" required'),
            )
          : '<input type="hidden" name="zone" value="' + e(zone) + '">') +
        '<div class="days">' +
        days
          .map(
            (day, index) =>
              '<label><input type="checkbox" name="day" value="' +
              index +
              '"' +
              ((draft ? draft.getAll('day').map(Number) : (schedule?.days ?? [0, 1, 2, 3, 4])).includes(index)
                ? ' checked'
                : '') +
              '>' +
              e(t(day)) +
              '</label>',
          )
          .join('') +
        '</div><label class="bar" title="' +
        e(t('Usar el ajuste del control para este horario')) +
        '"><span class="grow">' +
        e(t('Ajuste actual del control')) +
        '</span><input type="checkbox" role="switch" name="current" aria-label="' +
        e(t('Usar el ajuste del control para este horario')) +
        '"' +
        ((draft ? draft.has('current') : !schedule) ? ' checked' : '') +
        '></label><div class="bar">' +
        (schedule ? action('remove-schedule', 'Eliminar horario', 'danger') : '') +
        action('cancel-schedule', 'Cancelar') +
        '<span class="grow"></span>' +
        primary('Guardar horario') +
        '</div></form>'
      : '';
    return (
      builtIn +
      '<section class="resource-card"><div class="bar"><h3 class="grow">' +
      e(t('Horarios de HomeManager')) +
      '</h3>' +
      action('new-schedule', 'Agregar horario') +
      '</div>' +
      scheduleRows +
      '</section>' +
      editor
    );
  }

  private controls(control: AbsoluteControl) {
    return [
      ...Object.keys(control.capabilities).filter(
        key => !['clock', 'native_timer', 'start_time', 'stop_time'].includes(key),
      ),
      'schedules',
      'send',
    ].map(id => ({ id, label: titleFor(id) }));
  }

  private drawable(control: AbsoluteControl) {
    const defaultLayout = this.controls(control)
      .filter(item => item.id in control.capabilities)
      .map(
        (item, index): RfWidget => ({
          id: 'control-' + item.id,
          type: 'control',
          buttons: [item.id],
          label: null,
          icon: null,
          x: (index % 2) * 2,
          y: Math.floor(index / 2),
          w: 2,
          h: 1,
        }),
      );
    defaultLayout.unshift({
      id: 'canvas',
      type: 'canvas',
      x: 0,
      y: 0,
      w: 4,
      h: Math.max(2, Math.ceil(defaultLayout.length / 2)),
      buttons: [],
      label: null,
      icon: null,
    });
    return {
      id: control.id,
      buttons: ['power-on', 'power-off'].map(id => ({
        id,
        name: titleFor(id),
        icon: 'mdi:power',
        fingerprint: id,
      })),
      parts: [],
      layout: control.layout ?? defaultLayout,
    };
  }

  private embedded(
    widget: RfWidget,
    control: AbsoluteControl,
    interactive: boolean,
    design = false,
  ): HTMLElement | null {
    const key = widget.buttons[0];
    if (!key) return null;
    const node = document.createElement('div');
    node.className = 'absolute-widget';
    node.style.alignContent = 'center';
    // The piece lives inside the player: it carries the app's switch, select and icon look with it.
    node.innerHTML =
      '<style>' +
      pieceStyles +
      '</style>' +
      (key === 'schedules'
        ? action('timers', 'Programación')
        : key === 'send'
          ? action('send', 'Enviar estado')
          : control.capabilities[key]
            ? this.capability(key, control)
            : '');
    if (node.childElementCount < 2) return null;
    if (interactive) {
      this.bindCapabilities(node);
      const button = node.querySelector<HTMLButtonElement>('button[data-act]');
      if (button && design) button.disabled = true;
      else button?.addEventListener('click', () => void this.handleAction(key === 'send' ? 'send' : 'timers'));
    } else
      node.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,select,button').forEach(field => {
        field.disabled = true;
      });
    return node;
  }

  private mountPlayer(control: AbsoluteControl): void {
    const slot = this.root.querySelector('[data-player-slot]');
    if (!slot) return;
    this.player.estimated = false;
    this.player.readValues = () => this.hass?.states ?? {};
    this.player.history = (id, period, attribute) => historySeries(this.hass, id, period, attribute);
    this.player.renderContent = piece => this.embedded(piece, control, !this.busy);
    this.player.onPress = async id => {
      this.draft.power = id === 'power-on';
      await this.run(() => this.update('send', { state: { ...this.draft } }));
    };
    this.player.remote = this.drawable(control);
    slot.replaceWith(this.player);
  }

  private mountDesigner(control: AbsoluteControl): void {
    this.root.querySelector('[data-designer-slot]')?.replaceWith(this.designer);
    this.designer.configure({
      key: 'absolute:' + control.id,
      name: control.name,
      remote: this.drawable(control),
      estimated: false,
      controls: this.controls(control),
      absolute: true,
      renderContent: (piece, testing) => this.embedded(piece, control, testing, true),
      press: async id => {
        this.draft.power = id === 'power-on';
      },
      readValues: () => this.hass?.states ?? {},
      history: (id, period, attribute) => historySeries(this.hass, id, period, attribute),
      save: async layout => {
        if (!this.hass) return;
        const saved = await remoteResources.command(this.hass, 'design', { layout }, control.id);
        this.control = saved;
      },
    });
  }

  private catalog(): string {
    const rows = this.catalogRows;
    const catalog =
      '<div class="resource-card"><h3>' +
      e(t('Importar desde un archivo local')) +
      '</h3>' +
      label(
        'Fuente',
        '<select name="source">' + sources.map(source => option(source, source, this.source)).join('') + '</select>',
      ) +
      '<div class="bar"><label class="drop grow">' +
      glyph('mdi:upload') +
      '<span><b>' +
      e(this.filename || t('Archivo del catálogo')) +
      '</b>.ir · .json · .txt · .h</span><input name="file" type="file" aria-label="' +
      e(t('Archivo del catálogo')) +
      '" accept=".ir,.json,.txt,.cpp,.h"></label>' +
      action('preview', 'Revisar señales') +
      '</div></div>';
    const learned = this.data!.learned.filter(remote => remote.buttons.some(button => button.provenance));
    const installed = learned.length
      ? panelLabel(t('Controles importados')) +
        label('Buscar por marca, modelo o fuente', input('installed-filter', '', 'type="search"')) +
        '<div class="list">' +
        learned
          .map(remote => {
            const origin = remote.buttons.find(button => button.provenance)?.provenance;
            const terms = [
              remote.name,
              ...remote.buttons.flatMap(button => [
                button.name,
                button.provenance?.brand,
                button.provenance?.model,
                button.provenance?.source,
              ]),
            ].filter(Boolean);
            return (
              '<div class="li open" data-installed="' +
              e(terms.join(' ').toLocaleLowerCase()) +
              '"><button type="button" class="t" data-act="imported-' +
              e(remote.id) +
              '"><b>' +
              e(remote.name) +
              '</b><span>' +
              e([origin?.brand, origin?.model, origin?.source].filter(Boolean).join(' · ')) +
              (remote.buttons.some(button => button.provenance?.partial) ? ' · ' + e(t('Importación parcial')) : '') +
              '</span></button></div>'
            );
          })
          .join('') +
        '</div>'
      : '';
    if (!rows.length) return catalog + installed;
    return (
      catalog +
      '<form data-form="import" class="resource-card"><div class="bar"><h3 class="grow">' +
      e(t('Señales disponibles')) +
      '</h3>' +
      action(
        'select-all',
        'Seleccionar disponibles',
        '',
        ICONS['select-all'],
        'Seleccionar disponibles · hasta 64 señales por control',
      ) +
      '</div>' +
      label('Buscar función', input('filter', '', 'type="search"')) +
      '<div class="list">' +
      rows
        .map(
          row =>
            '<div class="library-row" data-catalog-row="' +
            row.index +
            '"><label><input type="checkbox" data-catalog-choice value="' +
            row.index +
            '"' +
            (this.chosen.has(row.index) ? ' checked' : '') +
            (row.supported ? '' : ' disabled') +
            '><span>' +
            e(row.name) +
            '</span></label>' +
            (row.supported ? '' : info('Formato de señal pendiente de soporte')) +
            '</div>',
        )
        .join('') +
      '</div><div class="form-grid">' +
      [
        ['name', 'Nombre del control'],
        ['brand', 'Marca'],
        ['model', 'Modelo'],
        ['entry', 'Entrada de origen'],
        ['revision', 'Revisión de origen'],
      ]
        .map(([key, title]) => label(title, input(key, this.catalogForm[key] ?? '', 'required maxlength="80"')))
        .join('') +
      label('Emisor IR', '<select name="emitter" required>' + this.emitters(this.catalogForm.emitter) + '</select>') +
      label(
        'Agregar a un control existente',
        '<select name="remote_id">' +
          option('', t('Nuevo control'), this.catalogForm.remote_id) +
          this.data!.learned.map(remote => option(remote.id, remote.name, this.catalogForm.remote_id)).join('') +
          '</select>',
      ) +
      '</div><div class="bar"><span class="grow"></span><button type="submit" class="ib primary" data-import>' +
      glyph('mdi:download') +
      '<span class="count"></span></button></div></form>' +
      installed
    );
  }

  private updateCatalogAction(): void {
    const button = this.root.querySelector<HTMLButtonElement>('[data-import]');
    if (!button) return;
    button.disabled = this.busy || !this.chosen.size;
    const name = t('Importar {count} señales disponibles', { count: this.chosen.size });
    button.setAttribute('aria-label', name);
    button.title = name;
    const count = button.querySelector('.count');
    if (count) count.textContent = this.chosen.size ? String(this.chosen.size) : '';
  }

  private filterCatalog(query: string): void {
    const words = query.toLocaleLowerCase().trim().split(/\s+/);
    this.root.querySelectorAll<HTMLElement>('[data-catalog-row]').forEach(row => {
      const name = this.catalogRows[Number(row.dataset.catalogRow)]?.name.toLocaleLowerCase() ?? '';
      row.hidden = !words.every(word => name.includes(word));
    });
  }

  private filterInstalled(query: string): void {
    const words = query.toLocaleLowerCase().trim().split(/\s+/);
    this.root.querySelectorAll<HTMLElement>('[data-installed]').forEach(row => {
      row.hidden = !words.every(word => row.dataset.installed?.includes(word));
    });
  }

  private async readFile(file?: File): Promise<void> {
    this.catalogRows = [];
    this.chosen.clear();
    this.document = '';
    this.filename = '';
    if (!file) return;
    await this.run(async () => {
      if (file.size > 512000) throw new Error(t('El archivo supera 512 KB.'));
      this.document = await file.text();
      this.filename = file.name;
      this.catalogForm.entry ||= file.name.slice(0, 80);
    });
  }

  private async update(
    command: Parameters<typeof remoteResources.command>[1],
    fields: Record<string, unknown>,
  ): Promise<void> {
    const saved = await remoteResources.command(this.hass!, command, fields, this.control?.id);
    if (command === 'remove') {
      this.data!.controls = this.data!.controls.filter(item => item.id !== this.control?.id);
      this.control = undefined;
      return;
    }
    this.control = saved;
    const index = this.data!.controls.findIndex(item => item.id === saved.id);
    if (index < 0) this.data!.controls.push(saved);
    else this.data!.controls[index] = saved;
    if (command === 'create') this.draft = { ...saved.state };
    this.message = t(command === 'send' || command === 'powerful' ? 'Comando aceptado' : 'Guardado');
  }

  private async handleAction(command: string): Promise<void> {
    if (command.startsWith('open-')) {
      this.control = this.data?.controls.find(item => item.id === command.slice(5));
      this.draft = { ...this.control?.state };
      this.tab = 'control';
    } else if (command.startsWith('imported-')) {
      this.onImported?.(command.slice(9));
      return;
    } else if (command === 'directory') {
      this.control = undefined;
      this.tab = 'control';
    } else if (command === 'control' || command === 'timers' || command === 'design') {
      this.tab = command;
      this.onDesign?.(command === 'design');
    } else if (command === 'send' || command === 'preset') {
      if (
        command === 'send' &&
        [...(this.player.shadowRoot?.querySelectorAll<HTMLInputElement>('[data-cap]') ?? [])].some(
          input => !input.reportValidity(),
        )
      )
        return;
      return this.run(() => this.update(command, { state: { ...this.draft } }));
    } else if (command === 'recall') {
      this.draft = { ...this.control?.preset };
    } else if (command === 'powerful') {
      return this.run(() => this.update('powerful', {}));
    } else if (command === 'unlink-powerful') {
      return this.run(() => this.update('link-powerful', { remove: true }));
    } else if (command === 'remove') {
      if (
        await confirmDialog(this.root, {
          title: t('¿Eliminar el control absoluto y sus horarios?'),
          message: t('Esta acción elimina los ajustes guardados.'),
          confirm: t('Eliminar'),
        })
      )
        await this.run(() => this.update('remove', {}));
      return;
    } else if (command === 'new-schedule' || command.startsWith('schedule-')) {
      this.scheduleDraft = undefined;
      this.schedule = this.control?.schedules.find(row => row.id === command.slice(9));
      this.scheduleOpen = true;
    } else if (command === 'cancel-schedule') {
      this.scheduleOpen = false;
    } else if (command === 'remove-schedule') {
      const schedule = this.schedule;
      if (
        schedule &&
        (await confirmDialog(this.root, {
          title: t('¿Eliminar este horario?'),
          message: t('Esta acción elimina los ajustes guardados.'),
          confirm: t('Eliminar'),
        }))
      )
        await this.run(async () => {
          await this.update('schedule', { schedule_id: schedule.id, remove: true });
          this.scheduleOpen = false;
        });
      return;
    } else if (command.startsWith('toggle-')) {
      const row = this.control?.schedules.find(item => item.id === command.slice(7));
      if (row)
        return this.run(() =>
          this.update('schedule', {
            schedule_id: row.id,
            days: row.days,
            time: row.time,
            zone: row.zone,
            power: row.power,
            enabled: !row.enabled,
            state: row.state,
          }),
        );
    } else if (command === 'preview') {
      return this.run(async () => {
        if (!this.document) throw new Error(t('Elegí un archivo primero.'));
        this.catalogRows = await remoteResources.preview(this.hass!, this.source, this.document);
        this.chosen.clear();
      });
    } else if (command === 'select-all') {
      this.chosen = new Set(
        this.catalogRows
          .filter(row => row.supported)
          .slice(0, 64)
          .map(row => row.index),
      );
    }
    this.render();
  }

  private async submit(form: string, data: FormData): Promise<void> {
    const values = Object.fromEntries(data.entries());
    await this.run(async () => {
      if (form === 'create') await this.update('create', values);
      else if (form === 'settings') await this.update('configure', { ...values, state: { ...this.draft } });
      else if (form === 'link-powerful') await this.update('link-powerful', values);
      else if (form === 'native') await this.update('send', { state: { ...this.draft } });
      else if (form === 'schedule') {
        const schedule = this.schedule;
        await this.update('schedule', {
          ...(schedule ? { schedule_id: schedule.id } : {}),
          days: data.getAll('day').map(Number),
          time: data.get('time'),
          zone: data.get('zone'),
          power: (data.get('power') ?? 'on') === 'on',
          enabled: schedule?.enabled ?? true,
          state: data.has('current') || !schedule ? { ...this.draft } : schedule.state,
        });
        this.scheduleOpen = false;
      } else if (form === 'import') {
        if (!values.remote_id) delete values.remote_id;
        const result = await remoteResources.import(this.hass!, {
          ...values,
          source: this.source,
          document: this.document,
          indexes: [...this.chosen],
        });
        this.data = await remoteResources.list(this.hass!);
        this.message = t('{added} importadas · {duplicates} duplicadas', result);
      }
    });
  }
}
if (!customElements.get('homemanager-remote-resources'))
  customElements.define('homemanager-remote-resources', HomeManagerRemoteResources);
