import { iconPicker } from '../ui/icon-picker.js';
import { ControlDesigner } from '../ui/control-designer.js';
import { t } from '../i18n/index.js';
import { TaskScreen, taskScreen } from '../ui/task-screen.js';
import { escapeHTML as e, type Hass } from '../card/types.js';
import {
  installPanelComponents,
  panelField,
  panelIconAction,
  panelChoices,
  keepPanelFocus,
} from '../ui/panel-components.js';
import { rfManagerStyles, rfText, rfEditedText, rfWorkspace } from '../ui/rf-components.js';
import {
  ROLES,
  rf,
  type PartKind,
  type RfAbout,
  type RfPart,
  type RfRemote,
  type RfTransmitter,
  type RfWidget,
} from '../integration/rf.js';
import { icon, kindLabel, roleLabel } from './catalog.js';
import { uiEmpty, uiNotice } from '../ui/components.js';
import { iconLabel } from './catalog.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import './remote-view.js';
import './learn.js';
import './devices.js';
import type { HomeManagerRfRemote } from './remote-view.js';
import type { HomeManagerRfLearn } from './learn.js';
import type { HomeManagerRfDevices } from './devices.js';

/** RF remotes, administrators only (the integration enforces it). A remote is
 * a name and an icon; its buttons are learned in any order and drawn as a
 * remote that can be designed on a grid. What Home Assistant gets (fans and
 * lights) is decided apart, in "In Home Assistant". The RF devices page shows
 * which ESPHome devices can send and listen, and how to prepare the others.
 * Codes never reach this page. */

type View = 'list' | 'new' | 'remote' | 'devices';
export class HomeManagerRf extends HTMLElement {
  private readonly root = this.attachShadow({ mode: 'open' });
  private _hass?: Hass;
  private remotes: RfRemote[] = [];
  private transmitters: RfTransmitter[] = [];
  private defaultReceiver: string | null = null;
  private view: View = 'list';
  private selected: string | null = null;
  /** A new remote that is stored with its first learned button. */
  private draft: RfAbout | null = null;
  private newRemote: RfAbout = { name: '', icon: 'mdi:remote', description: null };
  private editing = false;
  private learning = false;
  private readonly designer = new ControlDesigner();
  private learnSuspended = false;
  private learnOwner: string | null = null;
  private message = '';
  private failed = false;
  private loaded = false;
  // Kept across renders: they hold a live capture, a drag or a probe.
  private readonly remoteView = document.createElement('homemanager-rf-remote') as HomeManagerRfRemote;
  private readonly learn = document.createElement('homemanager-rf-learn') as HomeManagerRfLearn;
  private readonly devices = document.createElement('homemanager-rf-devices') as HomeManagerRfDevices;

  constructor() {
    super();
    installPanelComponents(this.root, 'rf-manager', rfManagerStyles, true);
    this.remoteView.onPress = buttonId => rf.press(this._hass!, this.selected!, buttonId);
    this.learn.onSaved = id => void this.learned(id);
    this.learn.onClose = () => this.closeLearn();
    this.devices.onChange = () => void this.reload();
  }

  set hass(hass: Hass) {
    if (typeof hass.themes?.darkMode === 'boolean') this.dataset.theme = hass.themes.darkMode ? 'dark' : 'light';
    const first = !this._hass;
    this._hass = hass;
    this.learn.hass = hass;
    if (this.view === 'devices') this.devices.hass = hass;
    if (first) void this.load();
  }
  get hass(): Hass | undefined {
    return this._hass;
  }

  disconnectedCallback(): void {
    this.learn.stop();
    this.devices.stop();
  }

  private async load(): Promise<void> {
    try {
      await this.reload();
      this.loaded = true;
    } catch (error) {
      this.report(error);
    }
    this.render();
  }

  private async reload(): Promise<void> {
    const hass = this._hass;
    if (!hass) return;
    const [library, transmitters, devices] = await Promise.all([
      rf.library(hass),
      rf.transmitters(hass),
      rf.devices(hass).catch(() => null),
    ]);
    this.remotes = library.remotes;
    this.transmitters = transmitters;
    this.defaultReceiver = devices?.default_receiver ?? null;
  }

  private report(error: unknown): void {
    const message = (error as { message?: string })?.message;
    this.failed = true;
    this.message = message ? t('Home Assistant rechazó la operación: {message}', { message }) : t('Algo falló.');
  }
  private say(message: string): void {
    this.failed = false;
    this.message = message;
  }

  private remote(): RfRemote | undefined {
    return this.remotes.find(item => item.id === this.selected);
  }

  private receiver(): string {
    const usable = (id: string | null | undefined) =>
      !!id && this.transmitters.some(item => item.id === id && item.can_capture);
    if (usable(this.defaultReceiver)) return this.defaultReceiver!;
    const remote = this.remote();
    if (usable(remote?.transmitter)) return remote!.transmitter;
    return this.transmitters.find(item => item.can_capture)?.id ?? '';
  }

  // Rendering -------------------------------------------------------------

  private render(): void {
    const restoreFocus = keepPanelFocus(this.root, '[data-button],[data-part]');
    const status = `<p class="status${this.failed ? ' error' : ''}" role="status">${e(this.message)}</p>`;
    let body: string;
    if (!this.loaded) body = `<p>${e(t('Cargando…'))}</p>${status}`;
    else if (this.view === 'devices') body = this.renderDevices(status);
    else if (this.view === 'new') body = this.renderNew(status);
    else if (this.view === 'remote' && (this.remote() || this.draft)) body = this.renderRemote(status);
    else body = this.renderList(status);
    const tabs = `<div class="tabs" role="tablist"><button type="button" role="tab" data-view="list" aria-selected="${this.view !== 'devices'}">${e(t('Controles'))}</button><button type="button" role="tab" data-view="devices" aria-label="${e(t('Equipos RF'))}" aria-selected="${this.view === 'devices'}">${e(t('Equipos'))}</button></div>`;
    this.root.innerHTML =
      rfWorkspace(this.renderNavigation(tabs), body, '', this.view) +
      (this.learning ? taskScreen(t('Aprender botones'), '<div data-slot="learn"></div>', '', 'learning-page') : '');
    for (const [slot, element] of [
      ['remote', this.editing ? this.designer : this.remoteView],
      ['learn', this.learn],
      ['devices', this.devices],
    ] as const)
      this.root.querySelector(`[data-slot=${slot}]`)?.replaceWith(element);
    this.bind();
    const learnPage = this.root.querySelector<TaskScreen>('.learning-page');
    if (learnPage) {
      learnPage.onBack = () => {
        this.learn.stop();
        this.learning = false;
        this.learnSuspended = true;
        this.render();
      };
      learnPage.show(this.root);
    }
    restoreFocus();
  }

  private renderNavigation(tabs: string): string {
    const cards = this.remotes.length
      ? `<div class="cards">${this.remotes.map(remote => `<button type="button" class="card" data-open="${e(remote.id)}" aria-current="${this.view === 'remote' && this.selected === remote.id}">${icon(remote.icon ?? 'mdi:remote')}<span class="info"><span class="name">${e(rfText(remote.name))}</span><span class="muted">${e(rfText(remote.description ?? t('{count} botones', { count: remote.buttons.length })))}</span></span></button>`).join('')}</div>`
      : '';
    return (
      tabs +
      cards +
      `<button type="button" data-command="new"${this.transmitters.length ? '' : ' disabled'}>${icon('mdi:plus')}${e(t('Nuevo control'))}</button>`
    );
  }
  private renderList(status: string): string {
    const notice = this.transmitters.length
      ? ''
      : uiNotice(t('Primero prepará un equipo RF: un dispositivo ESPHome con el paquete HomeManager RF.')) +
        `<button type="button" data-view="devices">${e(t('Ver equipos RF'))}</button>`;
    return (
      `<div class="head"><div class="title"><h2>${e(t('Controles RF'))}</h2></div></div>` +
      notice +
      uiEmpty(
        this.remotes.length
          ? t('Elegí un control para ver sus botones.')
          : t('Todavía no hay controles. Creá uno y enseñale sus botones.'),
      ) +
      status
    );
  }

  private iconPicker(name: string, selected: string | null): string {
    return iconPicker(selected ?? '', t('Icono'), `wide clearable data-rf-icon="${name}"`);
  }

  private renderNew(status: string): string {
    const draft = this.newRemote;
    return (
      `<div class="head">${panelIconAction(t('Volver'), 'data-command="list"', 'mdi:arrow-left')}<div class="title"><h2>${e(t('Nuevo control'))}</h2></div></div>` +
      panelField(
        t('Nombre'),
        `<input name="new-name" maxlength="80" value="${e(draft.name)}" placeholder="${e(t('p. ej. Ventilador del living'))}">`,
        t('El nombre identifica el control. Podés cambiarlo después.'),
      ) +
      panelChoices(t('Icono'), this.iconPicker('new', draft.icon)) +
      panelField(
        t('Descripción (opcional)'),
        `<input name="new-description" maxlength="200" value="${e(draft.description ?? '')}">`,
      ) +
      `<div class="actions"><button type="button" data-command="list">${e(t('Cancelar'))}</button><button type="button" data-variant="primary" data-command="create"${draft.name.trim() ? '' : ' disabled'}>${e(t('Aprender botones'))}</button></div>${status}`
    );
  }

  private renderRemote(status: string): string {
    const remote = this.remote();
    const about: RfAbout = remote ?? this.draft!;
    const head = `<div class="head"><button type="button" class="back" data-command="list" aria-label="${e(t('Volver'))}">←</button><div class="title">${icon(about.icon ?? 'mdi:remote')}<div><h2>${e(rfText(about.name))}</h2>${about.description ? `<p class="muted">${e(rfText(about.description))}</p>` : ''}</div></div>${remote ? panelIconAction(this.editing ? t('Terminar edición') : t('Editar'), `data-command="edit" aria-pressed="${this.editing}"`, this.editing ? 'mdi:check' : 'mdi:pencil-outline') : ''}</div>`;
    if (!remote)
      return `${head}<p class="notice">${e(t('Todavía no está guardado: se guarda con el primer botón que aprendas.'))}</p>${status}`;
    const sections = this.editing ? this.renderEditSections(remote) : '';
    return `${head}<div data-slot="remote"></div>${this.learning ? '' : `<div class="actions"><button type="button" data-command="learn" aria-label="${e(t('Aprender botones'))}">${icon('mdi:plus')}${e(t('Agregar botón'))}</button></div>`}${uiNotice(t('El envío no confirma que el equipo reaccionó. El eco «en el aire» sólo indica que la señal salió.'))}${status}${sections}`;
  }

  private entities(remoteId: string): string[] {
    return Object.entries(this._hass?.states ?? {})
      .filter(([, state]) => state.attributes?.homemanager_remote === remoteId)
      .map(([entityId]) => entityId);
  }

  private buttonOptions(remote: RfRemote, selected: string | undefined, empty: string): string {
    return `<option value="">${e(empty)}</option>${remote.buttons
      .map(
        button =>
          `<option value="${e(button.id)}"${button.id === selected ? ' selected' : ''}>${e(rfText(button.name))}</option>`,
      )
      .join('')}`;
  }

  private renderEditSections(remote: RfRemote): string {
    const about = `<section aria-labelledby="about-title"><h3 id="about-title">${e(t('Nombre e icono'))}</h3><div class="row"><label>${e(t('Nombre'))}<input name="remote-name" maxlength="80" value="${e(rfText(remote.name))}"></label><label>${e(t('Descripción (opcional)'))}<input name="remote-description" maxlength="200" value="${e(rfText(remote.description))}"></label></div>${this.iconPicker('remote', remote.icon)}</section>`;
    const buttons = remote.buttons.length
      ? remote.buttons
          .map(
            button =>
              `<div class="btn-row" data-button="${e(button.id)}"><span>${icon(button.icon)}</span><input name="button-name" maxlength="80" value="${e(rfText(button.name))}" aria-label="${e(t('Nombre de {name}', { name: button.name }))}">${iconPicker(button.icon ?? '', t('Icono de {name}', { name: button.name }), 'name="button-icon" clearable')}<button type="button" data-press="${e(button.id)}">${e(t('Probar'))}</button><button type="button" class="danger" data-delete-button="${e(button.id)}" aria-label="${e(t('Eliminar {name}', { name: button.name }))}">✕</button></div>`,
          )
          .join('')
      : `<p class="muted">${e(t('Todavía no hay botones.'))}</p>`;
    const learned = `<section aria-labelledby="buttons-title"><h3 id="buttons-title">${e(t('Botones aprendidos ({count})', { count: remote.buttons.length }))}</h3>${buttons}</section>`;
    const parts = remote.parts.map(part => this.renderPart(remote, part)).join('');
    const entities = this.entities(remote.id);
    const ha = `<section aria-labelledby="ha-title"><h3 id="ha-title">${e(t('En Home Assistant'))}</h3><p class="muted">${e(t('Para tener un ventilador o una luz en Home Assistant, elegí qué botón hace cada cosa. Los botones sin función aparecen como botones.'))}</p>${parts}<div class="row"><button type="button" data-add-part="fan">${e(t('Agregar ventilador'))}</button><button type="button" data-add-part="light">${e(t('Agregar luz'))}</button></div>${entities.length ? `<p class="muted">${e(t('Vinculados: {entities}', { entities: entities.map(id => rfText(this._hass?.states[id]?.attributes.friendly_name, t('Dispositivo'))).join(', ') }))}</p>` : ''}</section>`;
    const transmitters = this.transmitters
      .map(
        item =>
          `<option value="${e(item.id)}"${item.id === remote.transmitter ? ' selected' : ''}>${e(rfText(item.name))}</option>`,
      )
      .join('');
    const measured =
      remote.measured_pulse_us === null
        ? t('No hay una medición guardada.')
        : remote.measured_pulse_us === remote.pulse_us
          ? t('Medido de la señal: {pulse} µs.', { pulse: remote.measured_pulse_us })
          : t('Medido de la señal: {measured} µs; ahora usa {pulse} µs.', {
              measured: remote.measured_pulse_us,
              pulse: remote.pulse_us,
            });
    const advanced = `<section><details><summary>${e(t('Avanzado'))}</summary><form class="settings"><p class="muted">${e(t('Tipo {protocol} · tamaño {bits}.', { protocol: remote.protocol, bits: remote.nbits }))}</p><div class="row">${panelField(t('Transmisor'), `<select name="transmitter">${transmitters}</select>`)}${panelField(t('Pulso (µs)'), `<input name="pulse_us" type="number" min="50" max="2000" value="${remote.pulse_us}">`, measured)}${panelField(t('Repeticiones'), `<input name="repeats" type="number" min="1" max="20" value="${remote.repeats}">`)}${panelField(t('Pausa entre señales (µs)'), `<input name="wait_us" type="number" min="0" max="100000" value="${remote.wait_us}">`, t('La espera suele ser 0: cada señal ya incluye su propia pausa.'))}</div><div>${panelIconAction(t('Guardar ajustes'), '', 'mdi:check', 'primary', 'submit')}</div></form></details></section>`;
    const remove = `<section><div><button type="button" class="danger" data-command="delete-remote">${e(t('Eliminar control'))}</button></div></section>`;
    return `${about}${learned}${ha}${advanced}${remove}`;
  }

  private renderPart(remote: RfRemote, part: RfPart): string {
    const highest = Object.keys(part.roles).reduce(
      (max, role) => Math.max(max, Number(/^speed_(\d+)$/.exec(role)?.[1] ?? 0)),
      0,
    );
    const roles = ROLES[part.kind].filter(role => {
      const level = Number(/^speed_(\d+)$/.exec(role)?.[1] ?? 0);
      return !level || level <= Math.min(12, Math.max(3, highest + 1));
    });
    const selects = roles
      .map(
        role =>
          `<label>${e(roleLabel(role))}<select data-role="${e(role)}" aria-label="${e(roleLabel(role))}">${this.buttonOptions(remote, part.roles[role], '—')}</select></label>`,
      )
      .join('');
    const speeds =
      part.kind === 'fan'
        ? `<label>${e(t('Velocidades (si sólo tiene más/menos)'))}<select name="part-speeds"><option value="">—</option>${Array.from(
            { length: 12 },
            (_, index) =>
              `<option value="${index + 1}"${part.speeds === index + 1 ? ' selected' : ''}>${index + 1}</option>`,
          ).join('')}</select></label>`
        : '';
    return `<div class="part" data-part="${e(part.id)}" data-kind="${part.kind}"><div class="row"><span class="badge">${e(kindLabel(part.kind))}</span><input name="part-name" maxlength="80" value="${e(rfText(part.name))}" aria-label="${e(t('Nombre en Home Assistant'))}"><button type="button" class="danger" data-remove-part="${e(part.id)}" aria-label="${e(t('Quitar {name}', { name: part.name }))}">✕</button></div><div class="roles">${selects}${speeds}</div></div>`;
  }

  private renderDevices(status: string): string {
    return `<div class="head"><div class="title"><h2>${e(t('Equipos ESPHome'))}</h2></div></div><div data-slot="devices"></div>${status}`;
  }

  private bind(): void {
    const root = this.root;
    const remote = this.remote();
    root
      .querySelectorAll<HTMLButtonElement>('[data-command]')
      .forEach(button => button.addEventListener('click', () => void this.command(button.dataset.command!)));
    root
      .querySelectorAll<HTMLButtonElement>('[data-view]')
      .forEach(button => button.addEventListener('click', () => this.show(button.dataset.view as View)));
    root
      .querySelectorAll<HTMLButtonElement>('[data-open]')
      .forEach(button => button.addEventListener('click', () => this.open(button.dataset.open!)));
    root.querySelectorAll<HTMLInputElement>('[data-rf-icon]').forEach(picker =>
      picker.addEventListener('change', () => {
        if (picker.dataset.rfIcon === 'new') this.newRemote.icon = picker.value || null;
        else void this.saveAbout({ icon: picker.value || null });
      }),
    );
    root.querySelector<HTMLInputElement>('input[name=new-name]')?.addEventListener('input', event => {
      this.newRemote.name = (event.target as HTMLInputElement).value;
      root.querySelector<HTMLButtonElement>('[data-command=create]')!.disabled = !this.newRemote.name.trim();
    });
    root.querySelector<HTMLInputElement>('input[name=new-description]')?.addEventListener('input', event => {
      this.newRemote.description = (event.target as HTMLInputElement).value || null;
    });
    if (this.view === 'remote' && remote) {
      this.remoteView.readValues = () => this._hass?.states ?? {};
      this.designer.configure({
        key: remote.id,
        remote,
        estimated: true,
        readValues: () => this._hass?.states ?? {},
        save: async layout => {
          const saved = await rf.saveLayout(this._hass!, remote.id, layout);
          this.remotes = this.remotes.map(r => (r.id === saved.id ? saved : r));
          this.render();
        },
      });
      this.remoteView.remote = remote;
      this.remoteView.editing = this.editing;
      this.bindEditSections(remote);
    }
    if (this.view === 'devices') this.devices.hass = this._hass!;
  }

  private bindEditSections(remote: RfRemote): void {
    const root = this.root;
    root
      .querySelector<HTMLInputElement>('input[name=remote-name]')
      ?.addEventListener('change', event => void this.saveAbout({ name: (event.target as HTMLInputElement).value }));
    root
      .querySelector<HTMLInputElement>('input[name=remote-description]')
      ?.addEventListener(
        'change',
        event => void this.saveAbout({ description: (event.target as HTMLInputElement).value || null }),
      );
    root.querySelectorAll<HTMLElement>('.btn-row').forEach(row => {
      const save = () =>
        void this.run(async () => {
          const name = rfEditedText(
            row.querySelector<HTMLInputElement>('[name=button-name]')!.value.trim(),
            remote.buttons.find(button => button.id === row.dataset.button)?.name,
          );
          const glyph = row.querySelector<HTMLSelectElement>('[name=button-icon]')!.value || null;
          if (!name) return;
          await rf.saveButton(this._hass!, remote.id, { name, icon: glyph }, { buttonId: row.dataset.button });
          await this.reload();
          this.say(t('Cambios guardados.'));
        });
      row.querySelector('[name=button-name]')!.addEventListener('change', save);
      row.querySelector('[name=button-icon]')!.addEventListener('change', save);
    });
    root.querySelectorAll<HTMLButtonElement>('[data-press]').forEach(button =>
      button.addEventListener(
        'click',
        () =>
          void this.run(async () => {
            await rf.press(this._hass!, remote.id, button.dataset.press!);
            this.say(t('Señal enviada. Mirá el equipo.'));
          }),
      ),
    );
    root
      .querySelectorAll<HTMLButtonElement>('[data-delete-button]')
      .forEach(button => button.addEventListener('click', () => void this.deleteButton(button.dataset.deleteButton!)));
    root.querySelectorAll<HTMLElement>('.part').forEach(element => {
      element
        .querySelectorAll('select, input')
        .forEach(field => field.addEventListener('change', () => void this.saveParts()));
    });
    root
      .querySelectorAll<HTMLButtonElement>('[data-add-part]')
      .forEach(button => button.addEventListener('click', () => void this.addPart(button.dataset.addPart as PartKind)));
    root
      .querySelectorAll<HTMLButtonElement>('[data-remove-part]')
      .forEach(button => button.addEventListener('click', () => void this.removePart(button.dataset.removePart!)));
    root.querySelector<HTMLFormElement>('form.settings')?.addEventListener('submit', event => {
      event.preventDefault();
      void this.saveSettings(new FormData(event.target as HTMLFormElement));
    });
  }

  private show(view: View): void {
    if (view !== 'remote') this.closeLearn(false);
    if (view !== 'devices') this.devices.stop();
    this.view = view;
    this.editing = false;
    this.say('');
    this.render();
  }

  private open(remoteId: string): void {
    if (this.selected !== remoteId) this.closeLearn(false);
    this.selected = remoteId;
    this.draft = null;
    this.show('remote');
  }

  private async run(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.report(error);
    }
    this.render();
  }

  private async command(name: string): Promise<void> {
    const hass = this._hass;
    if (!hass) return;
    await this.run(async () => {
      switch (name) {
        case 'new':
          this.newRemote = { name: '', icon: 'mdi:remote', description: null };
          this.show('new');
          break;
        case 'list':
          this.closeLearn(false);
          this.draft = null;
          this.selected = null;
          await this.reload();
          this.show('list');
          break;
        case 'create':
          this.draft = {
            name: this.newRemote.name.trim(),
            icon: this.newRemote.icon,
            description: this.newRemote.description?.trim() || null,
          };
          this.selected = null;
          this.view = 'remote';
          this.startLearn();
          break;
        case 'learn':
          this.editing = false;
          this.startLearn();
          break;
        case 'edit':
          this.editing = !this.editing;
          if (this.editing) this.closeLearn(false);
          this.say('');
          break;
        case 'delete-remote': {
          const remote = this.remote()!;
          const ok = await confirmDialog(this.root, {
            title: t('¿Eliminar «{name}»?', { name: rfText(remote.name) }),
            message: t('Se borran sus botones y sus entidades de Home Assistant. El equipo físico no cambia.'),
            confirm: t('Eliminar'),
          });
          if (!ok) break;
          await rf.deleteRemote(hass, remote.id);
          this.selected = null;
          await this.reload();
          this.show('list');
          this.say(t('Control eliminado.'));
          break;
        }
      }
    });
  }

  // Learning ------------------------------------------------------------

  private startLearn(): void {
    const learn = this.learn;
    if (this.learnSuspended && this.learnOwner === this.selected) {
      this.learnSuspended = false;
      this.learning = true;
      learn.resume();
      return;
    }
    learn.hass = this._hass;
    this.learnOwner = this.selected;
    learn.transmitters = this.transmitters;
    learn.remote = this.remote() ?? null;
    learn.draft = learn.remote ? null : this.draft;
    this.learning = true;
    this.say('');
    learn.start(this.receiver());
  }

  private closeLearn(render = true): void {
    if (!this.learning && !this.learnSuspended) return;
    this.learnSuspended = false;
    this.learn.stop();
    this.learning = false;
    if (this.draft && !this.remote()) {
      // Nothing was learned: the draft is not kept.
      this.draft = null;
      this.view = 'list';
      this.say(t('No se guardó: el control necesita al menos un botón.'));
    }
    if (render) this.render();
  }

  private async learned(remoteId: string): Promise<void> {
    await this.run(async () => {
      await this.reload();
      this.selected = remoteId;
      this.draft = null;
      this.learn.remote = this.remote() ?? null;
      this.say('');
    });
  }

  // Saving --------------------------------------------------------------

  private async saveAbout(change: Partial<RfAbout>): Promise<void> {
    const remote = this.remote();
    if (!remote) return;
    await this.run(async () => {
      const name = (change.name ?? remote.name).trim();
      if (!name) return;
      await rf.saveRemote(
        this._hass!,
        {
          name,
          icon: change.icon ?? remote.icon,
          description: 'description' in change ? change.description : remote.description,
        },
        remote.id,
      );
      await this.reload();
      this.say(t('Cambios guardados.'));
    });
  }

  private async saveSettings(data: FormData): Promise<void> {
    const remote = this.remote()!;
    await this.run(async () => {
      await rf.saveRemote(
        this._hass!,
        {
          name: remote.name,
          transmitter: String(data.get('transmitter')),
          pulse_us: Number(data.get('pulse_us')),
          repeats: Number(data.get('repeats')),
          wait_us: Number(data.get('wait_us')),
        },
        remote.id,
      );
      await this.reload();
      this.say(t('Ajustes guardados. Probá un botón.'));
    });
  }

  private async deleteButton(buttonId: string): Promise<void> {
    const remote = this.remote()!;
    const button = remote.buttons.find(item => item.id === buttonId);
    const ok = await confirmDialog(this.root, {
      title: t('¿Eliminar «{name}»?', { name: rfText(button?.name, t('Botón')) }),
      message: t('Se olvida el código. Si lo necesitás, lo podés aprender de nuevo.'),
      confirm: t('Eliminar'),
    });
    if (!ok) return;
    await this.run(async () => {
      await rf.deleteButton(this._hass!, remote.id, buttonId);
      await this.reload();
      this.say(t('Botón eliminado.'));
    });
  }

  /** Reads the parts as they are on screen, with optional changes. */
  private partsOnScreen(): (Omit<RfPart, 'id'> & { id?: string })[] {
    return [...this.root.querySelectorAll<HTMLElement>('.part')].map(element => {
      const roles: Record<string, string> = {};
      element.querySelectorAll<HTMLSelectElement>('[data-role]').forEach(select => {
        if (select.value) roles[select.dataset.role!] = select.value;
      });
      const speeds = element.querySelector<HTMLSelectElement>('[name=part-speeds]')?.value;
      return {
        id: element.dataset.part!,
        name:
          rfEditedText(
            element.querySelector<HTMLInputElement>('[name=part-name]')!.value.trim(),
            this.remote()?.parts.find(part => part.id === element.dataset.part)?.name,
          ) || kindLabel(element.dataset.kind as PartKind),
        kind: element.dataset.kind as PartKind,
        speeds: speeds ? Number(speeds) : null,
        roles,
      };
    });
  }

  private async saveParts(parts = this.partsOnScreen()): Promise<void> {
    const remote = this.remote();
    if (!remote) return;
    await this.run(async () => {
      await rf.saveParts(this._hass!, remote.id, parts);
      await this.reload();
      this.say(t('Cambios guardados.'));
    });
  }

  private async addPart(kind: PartKind): Promise<void> {
    await this.saveParts([...this.partsOnScreen(), { name: kindLabel(kind), kind, speeds: null, roles: {} }]);
  }

  private async removePart(partId: string): Promise<void> {
    const parts = this.partsOnScreen();
    const part = parts.find(item => item.id === partId);
    const ok = await confirmDialog(this.root, {
      title: t('¿Quitar «{name}» de Home Assistant?', { name: rfText(part?.name, t('Dispositivo')) }),
      message: t('Se borra esa entidad. Los botones no se borran.'),
      confirm: t('Quitar'),
    });
    if (ok) await this.saveParts(parts.filter(item => item.id !== partId));
  }
}

if (!customElements.get('homemanager-rf')) customElements.define('homemanager-rf', HomeManagerRf);
