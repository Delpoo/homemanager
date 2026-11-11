import { escapeHTML as e, type Hass } from '../card/types.js';
import { t } from '../i18n/index.js';
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
const action = (name: string, title: string, style = '') =>
  '<button type="button" data-act="' + name + '" class="' + style + '">' + e(t(title)) + '</button>';
const primary = (title: string) => '<button type="submit" class="primary-action">' + e(t(title)) + '</button>';
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
.library-row label{display:flex;align-items:center;gap:7px;min-height:44px}
[hidden]{display:none!important}
`;

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
      '</h3>' +
      '<p class="muted">' +
      e(t('Elegí una captura aprendida de tu mando para identificar el perfil y la portadora.')) +
      '</p><div class="form-grid">' +
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
      '</div>' +
      primary('Crear control') +
      '</form>'
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
        e(new Date(requested.at).toLocaleString()) +
        ' · ' +
        e(String(requested.state.temperature ?? '')) +
        ' °C'
      : e(t('Sin solicitudes registradas'));
    const navigation =
      '<div class="row">' +
      action('directory', 'Volver a la lista') +
      action(this.tab === 'control' ? 'timers' : 'control', this.tab === 'control' ? 'Temporizadores' : 'Control') +
      action('design', 'Diseñar') +
      '</div>';
    const summary =
      '<div class="resource-card requested"><strong>' +
      e(t('Estado solicitado')) +
      '</strong><span>' +
      status +
      '</span><span>' +
      e(t('Estado físico sin confirmación')) +
      '</span></div>';
    const actions =
      '<div class="row">' +
      action('send', 'Enviar estado', 'primary-action') +
      action('preset', 'Guardar SMART SET') +
      (control.preset ? action('recall', 'Recuperar SMART SET') : '') +
      (control.powerful_configured ? action('powerful', 'POWERFUL COOL') : '') +
      '</div>' +
      (control.powerful && new Date(control.powerful).getTime() > Date.now()
        ? '<small>' +
          e(t('Fin previsto de POWERFUL COOL')) +
          ' · ' +
          e(new Date(control.powerful).toLocaleTimeString()) +
          '</small>'
        : '');
    const powerful =
      control.profile === 'mitsubishi-electric-144'
        ? '<form class="resource-card" data-form="link-powerful"><h3>POWERFUL COOL</h3><p class="muted">' +
          e(t('Vinculá la señal que aprendiste con POWERFUL COOL activado en el mando.')) +
          '</p><div class="form-grid">' +
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
          '</div><div class="row">' +
          primary('Vincular señal') +
          (control.powerful_configured ? action('unlink-powerful', 'Quitar vínculo') : '') +
          '</div></form>'
        : '';
    return (
      '<h3>' +
      e(control.name) +
      '</h3>' +
      navigation +
      (this.tab === 'timers' ? this.timers(control) : '<div data-player-slot></div>' + actions) +
      summary +
      '<details><summary>' +
      e(t('Ajustes del control')) +
      '</summary><form class="resource-card" data-form="settings"><div class="form-grid">' +
      label('Nombre', input('name', control.name, 'maxlength="80" required')) +
      label('Emisor IR', '<select name="emitter" required>' + this.emitters(control.emitter) + '</select>') +
      '</div><div class="row">' +
      primary('Guardar ajustes') +
      action('remove', 'Eliminar control') +
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
        '<input type="checkbox"' +
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
      '</h3>' +
      '<div class="form-grid">' +
      native.map(key => this.capability(key, control)).join('') +
      '</div>' +
      '<p class="muted">' +
      e(t('La hora del mando admite pasos de 10 minutos.')) +
      '</p>' +
      primary('Enviar temporizador al equipo') +
      '</form>';
    const scheduleRows = control.schedules
      .map(
        row =>
          '<div class="schedule"><b>' +
          e(t(row.power ? 'Encender' : 'Apagar')) +
          ' · ' +
          e(row.time) +
          ' · ' +
          e(row.zone) +
          '</b><small>' +
          e(row.days.map(day => t(days[day])).join(' · ')) +
          (row.power && row.state.temperature !== undefined
            ? ' · ' + e(optionFor(String(row.state.mode))) + ' · ' + e(row.state.temperature) + ' °C'
            : '') +
          (row.next
            ? ' · ' + e(t('Próximo')) + ' ' + e(new Date(row.next).toLocaleString(undefined, { timeZone: row.zone }))
            : '') +
          (row.last
            ? ' · ' +
              e(t('Último intento')) +
              ' ' +
              e(row.last) +
              ' · ' +
              e(row.result === 'sent' ? t('Emisión solicitada') : row.result)
            : '') +
          '</small><div class="row">' +
          action('schedule-' + row.id, 'Editar') +
          action('toggle-' + row.id, row.enabled ? 'Pausar' : 'Activar') +
          '</div></div>',
      )
      .join('');
    const editor = this.scheduleOpen
      ? '<form data-form="schedule" class="resource-card"><h3>' +
        e(t(schedule ? 'Editar horario' : 'Nuevo horario')) +
        '</h3><div class="form-grid">' +
        label(
          'Acción',
          '<select name="power">' +
            option('on', t('Encender'), power) +
            option('off', t('Apagar'), power) +
            '</select>',
        ) +
        label('Hora', input('time', String(draft?.get('time') ?? schedule?.time ?? '22:00'), 'type="time" required')) +
        label(
          'Zona horaria',
          input('zone', String(draft?.get('zone') ?? schedule?.zone ?? this.data!.zone), 'maxlength="80" required'),
        ) +
        '</div><div class="row">' +
        days
          .map(
            (day, index) =>
              '<label class="check"><input type="checkbox" name="day" value="' +
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
        '</div><label class="check"><span><input type="checkbox" name="current"' +
        ((draft ? draft.has('current') : !schedule) ? ' checked' : '') +
        '> ' +
        e(t('Usar el ajuste del control para este horario')) +
        '</span></label><div class="row">' +
        primary('Guardar horario') +
        action('cancel-schedule', 'Cancelar') +
        (schedule ? action('remove-schedule', 'Eliminar horario') : '') +
        '</div></form>'
      : '';
    return (
      builtIn +
      '<section class="resource-card"><h3>' +
      e(t('Programación de Home Management')) +
      '</h3>' +
      scheduleRows +
      action('new-schedule', 'Agregar horario', 'primary-action') +
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
    node.innerHTML =
      key === 'schedules'
        ? action('timers', 'Programación')
        : key === 'send'
          ? action('send', 'Enviar estado')
          : control.capabilities[key]
            ? this.capability(key, control)
            : '';
    if (!node.childElementCount) return null;
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
      label('Archivo del catálogo', '<input name="file" type="file" accept=".ir,.json,.txt,.cpp,.h">') +
      (this.filename ? '<p class="muted">' + e(this.filename) + '</p>' : '') +
      action('preview', 'Revisar señales') +
      '</div>';
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
      '<form data-form="import" class="resource-card"><h3>' +
      e(t('Señales disponibles')) +
      '</h3>' +
      label('Buscar función', input('filter', '', 'type="search"')) +
      '<div class="row">' +
      action('select-all', 'Seleccionar disponibles') +
      '<small>' +
      e(t('Hasta 64 señales por control.')) +
      '</small>' +
      '</div><div class="list">' +
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
            '>' +
            e(row.name) +
            '</label>' +
            (row.supported ? '' : '<small>' + e(t('Formato de señal pendiente de soporte')) + '</small>') +
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
      '</div><button type="submit" class="primary-action" data-import></button></form>' +
      installed
    );
  }

  private updateCatalogAction(): void {
    const button = this.root.querySelector<HTMLButtonElement>('[data-import]');
    if (!button) return;
    button.disabled = this.busy || !this.chosen.size;
    button.textContent = t('Importar {count} señales disponibles', { count: this.chosen.size });
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
    this.message = t(
      command === 'send' || command === 'powerful'
        ? 'Emisión solicitada. Estado físico sin confirmación.'
        : 'Guardado.',
    );
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
          power: data.get('power') === 'on',
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
