import { t } from '../i18n/index.js';
import { TaskScreen } from '../ui/task-screen.js';
import {
  deviceCatalog,
  searchDevices,
  usefulEntity,
  bindingIssues,
  pickerReadings,
  type CatalogDevice,
  type DeviceSelection,
} from '../model/device-catalog.js';
import { personName, readingName } from '../model/names.js';
import type { ModelDevice } from '../model/types.js';
import type { Hass } from '../card/types.js';
import {
  uiPane,
  uiButton,
  uiSearch,
  uiTabs,
  uiGroup,
  uiRow,
  uiFold,
  uiNotice,
  uiEmpty,
  useComponents,
} from '../ui/components.js';

/** Two steps from mockup §7. All decisions and names come from pure models. */
export class DevicePicker extends HTMLElement {
  private readonly page = new TaskScreen();
  private readonly selections = new Map<string, DeviceSelection>();
  private root = this.attachShadow({ mode: 'open' });
  private _hass?: Hass;
  private plan: ModelDevice[] = [];
  private selected?: CatalogDevice;
  private query = '';
  private unplaced = false;
  private primary = '';
  private additional: string[] = [];
  private advanced = false;
  private pending?: DeviceSelection;
  private preferredArea?: string;
  private finish?: (selection: DeviceSelection | null) => void;
  private catalogFingerprint = '';
  constructor() {
    super();
    useComponents(this.root);
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(
      ':host{position:absolute;inset:0;display:block;width:100%;height:100%;z-index:15}.task-body{padding:0;display:flex;min-height:0}.k-pane{display:flex;width:100%;height:100%;max-width:none;max-height:none;border:0;border-radius:0;box-shadow:none;flex-direction:column}.pane-head{flex-wrap:wrap;flex-shrink:0}.pane-head h2{display:none}.pane-body{flex:1;min-height:0}.pane-foot{flex-shrink:0;flex-wrap:wrap}.k-row{min-width:0}.k-row .txt{min-width:0;overflow-wrap:anywhere}.k-row .val{max-width:35%;overflow-wrap:anywhere}.k-btn{max-width:100%;white-space:normal}',
    );
    this.root.adoptedStyleSheets = [...this.root.adoptedStyleSheets, sheet];
    this.page.onBack = () => this.goBack();
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('change', this.change);
    this.root.addEventListener('input', this.input);
    this.root.addEventListener('keydown', event => {
      if ((event as KeyboardEvent).key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.goBack();
      }
    });
  }
  set hass(hass: Hass | undefined) {
    this._hass = hass;
    if (typeof hass?.themes?.darkMode === 'boolean') this.dataset.theme = hass.themes.darkMode ? 'dark' : 'light';
    if (this.page.open && !this.advanced) {
      const catalog = deviceCatalog(hass, this.plan);
      if (JSON.stringify(catalog) !== this.catalogFingerprint) {
        let changed = false;
        if (this.selected) {
          this.selected = catalog.find(device => device.deviceId === this.selected!.deviceId);
          if (!this.selected?.readings.some(reading => reading.entityId === this.primary)) {
            this.selected = undefined;
            changed = true;
          }
          const valid = this.additional.filter(id => this.selected?.readings.some(reading => reading.entityId === id));
          changed ||= valid.length !== this.additional.length;
          this.additional = valid;
        }
        this.render();
        if (changed)
          this.root
            .querySelector('.pane-body')
            ?.insertAdjacentHTML(
              'beforeend',
              uiNotice(t('El dispositivo cambió. Volvé a elegir sus lecturas.'), 'alert'),
            );
      }
    }
  }
  open(
    hass: Hass | undefined,
    plan: ModelDevice[],
    binding: DeviceSelection | undefined,
    preferredArea: string | undefined,
    finish: (selection: DeviceSelection | null) => void,
  ): void {
    this.hass = hass;
    this.plan = plan;
    this.pending = binding;
    this.preferredArea = preferredArea;
    this.finish = finish;
    const inferred =
      binding?.deviceId ?? (binding?.entityId ? hass?.entities?.[binding.entityId]?.device_id : undefined);
    this.selected = inferred ? deviceCatalog(hass, plan).find(device => device.deviceId === inferred) : undefined;
    if (this.selected) this.choose(this.selected);
    else this.render();
  }
  private choose(device: CatalogDevice): void {
    this.pending = this.selections.get(device.deviceId) ?? this.pending;
    this.selected = device;
    this.advanced = false;
    this.primary = device.readings.some(reading => reading.entityId === this.pending?.entityId)
      ? this.pending!.entityId
      : device.primaryEntityId;
    this.additional =
      (this.pending?.deviceId === device.deviceId ? this.pending?.readings : [])?.filter(
        id => id !== this.primary && device.readings.some(reading => reading.entityId === id),
      ) ?? [];
    this.render();
  }
  private close(selection: DeviceSelection | null): void {
    this.page.close();
    this.finish?.(selection);
    this.remove();
  }
  private goBack(): void {
    if (this.selected) {
      this.selections.set(this.selected.deviceId, {
        deviceId: this.selected.deviceId,
        entityId: this.primary,
        readings: [...this.additional],
      });
      this.selected = undefined;
    } else if (this.advanced) this.advanced = false;
    else {
      this.close(null);
      return;
    }
    this.render();
  }
  private render(): void {
    const active = this.root.activeElement as HTMLInputElement | null;
    const focus = active?.name;
    const cursor = focus === 'search' ? active?.selectionStart : null;
    const focusValue = active?.value;
    const foldedOpen = this.root.querySelector<HTMLDetailsElement>('details')?.open;
    const scroll = this.root.querySelector('.pane-body')?.scrollTop ?? 0;
    const catalog = deviceCatalog(this._hass, this.plan);
    this.catalogFingerprint = JSON.stringify(catalog);
    let body = '',
      footer = '',
      title = t('Vincular dispositivo');
    if (this.advanced) {
      title = t('Buscar cualquier entidad');
      const matches = Object.keys(this._hass?.states ?? {})
        .filter(id =>
          `${id} ${this._hass?.states[id]?.attributes?.friendly_name ?? ''}`
            .toLowerCase()
            .includes(this.query.toLowerCase()),
        )
        .slice(0, 200);
      body =
        uiSearch(t('Buscar por nombre o entidad'), this.query) +
        uiGroup(
          t('Todas las entidades'),
          matches
            .map(id =>
              uiRow({
                name: personName(this._hass?.states[id]?.attributes?.friendly_name, readingName(id, this._hass)),
                detail: id,
                action: 'entity',
                key: id,
              }),
            )
            .join(''),
        );
      footer =
        uiButton(t('Cancelar'), 'cancel') +
        (/^[a-z][a-z0-9_]*\.[a-z0-9_]+$/.test(this.query)
          ? uiButton(t('Usar esta entidad'), 'entity-query', 'primary')
          : '');
    } else if (!this.selected) {
      const devices = searchDevices(catalog, this.query, this.unplaced, this.preferredArea);
      const groups = new Map<string, CatalogDevice[]>();
      for (const device of devices) groups.set(device.area, [...(groups.get(device.area) ?? []), device]);
      body =
        uiSearch(t('Buscar dispositivo o espacio'), this.query) +
        uiTabs(
          [
            { id: 'all', label: t('Todos · {count}', { count: catalog.length }) },
            {
              id: 'unplaced',
              label: t('Sin ubicar · {count}', { count: catalog.filter(device => !device.inPlan).length }),
            },
          ],
          this.unplaced ? 'unplaced' : 'all',
        );
      body += devices.length
        ? [...groups]
            .map(([area, items]) =>
              uiGroup(
                area,
                items
                  .map(device =>
                    uiRow({
                      name: device.name,
                      detail: t('{count} lecturas', { count: device.readings.length }),
                      icon: device.icon,
                      status: device.inPlan ? t('En el plano') : undefined,
                      action: 'device',
                      key: device.deviceId,
                    }),
                  )
                  .join(''),
              ),
            )
            .join('')
        : uiEmpty(t('No hay dispositivos que coincidan.'));
      footer = uiButton(t('Buscar cualquier entidad'), 'advanced', 'ghost') + uiButton(t('Cancelar'), 'cancel');
    } else {
      const device = this.selected;
      title = device.name;
      const suggestions = pickerReadings(device);
      const choices = [...suggestions.primary];
      if (!choices.some(reading => reading.entityId === this.primary))
        choices.push(device.readings.find(reading => reading.entityId === this.primary)!);
      const primaryRow = (reading: CatalogDevice['readings'][number]) =>
        uiRow({
          name: reading.name,
          value: reading.value,
          detail: reading.entityId === device.primaryEntityId ? t('Sugerida') : undefined,
          key: reading.entityId,
          choice: { type: 'radio', name: 'primary', checked: this.primary === reading.entityId },
        });
      body = uiGroup(t('Lectura principal · se ve en el símbolo'), choices.map(primaryRow).join(''));
      const extras = suggestions.additional.filter(reading => reading.entityId !== this.primary);
      const choiceRow = (reading: CatalogDevice['readings'][number]) =>
        uiRow({
          name: reading.name,
          value: reading.value,
          key: reading.entityId,
          choice: {
            type: 'checkbox',
            name: 'additional',
            checked: this.additional.includes(reading.entityId),
            disabled: this.additional.length >= 3 && !this.additional.includes(reading.entityId),
          },
        });
      const shown = extras.filter((reading, index) => index < 4 || this.additional.includes(reading.entityId));
      body += uiGroup(t('Lecturas adicionales · hasta 3'), shown.map(choiceRow).join(''));
      const rest = extras.filter(reading => !shown.includes(reading));
      // Folded readings can become either the principal or an additional one.
      const others = device.readings.filter(reading => !choices.includes(reading));
      if (rest.length || others.length)
        body += uiFold(
          t('Otras lecturas ({count})', { count: others.length }),
          uiGroup(t('Lectura principal'), others.map(primaryRow).join('')) +
            uiGroup(t('Lecturas adicionales · hasta 3'), rest.map(choiceRow).join('')),
        );
      if (device.excluded)
        body += uiNotice(
          t('Diagnóstico, configuración, ocultas y desactivadas ({count}) no se muestran.', { count: device.excluded }),
        );
      footer = uiButton(t('Cancelar'), 'cancel') + uiButton(t('Vincular'), 'confirm', 'primary');
    }
    this.page.innerHTML = uiPane(title, body, footer, {
      step: this.advanced ? undefined : this.selected ? 2 : 1,
      back: !!this.selected || this.advanced,
      advanced: this.advanced,
    });
    this.page.show(this.root, title);
    const back = this.root.querySelector<HTMLButtonElement>('[data-action=back]');
    if (back) back.setAttribute('aria-label', t('Volver'));
    if (focus === 'search') {
      const input = this.root.querySelector<HTMLInputElement>('[name=search]');
      input?.focus();
      if (cursor !== null && cursor !== undefined) input?.setSelectionRange(cursor, cursor);
    } else if (focus && focusValue)
      this.root
        .querySelector<HTMLInputElement>(`input[name="${CSS.escape(focus)}"][value="${CSS.escape(focusValue)}"]`)
        ?.focus();
    const folded = this.root.querySelector<HTMLDetailsElement>('details');
    if (folded && foldedOpen) folded.open = true;
    this.root.querySelector('.pane-body')!.scrollTop = scroll;
  }
  private input = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    if (input.name === 'search') {
      this.query = input.value;
      this.render();
    }
  };
  private change = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    if (input.name === 'primary') {
      this.primary = input.value;
      this.additional = this.additional.filter(id => id !== this.primary);
      this.render();
    }
    if (input.name === 'additional') {
      this.additional = input.checked
        ? [...this.additional, input.value].slice(0, 3)
        : this.additional.filter(id => id !== input.value);
      const open = this.root.querySelector<HTMLDetailsElement>('details')?.open;
      this.render();
      if (open) {
        const fold = this.root.querySelector<HTMLDetailsElement>('details');
        if (fold) fold.open = true;
      }
    }
  };
  private onClick = (event: Event): void => {
    const button = (event.target as Element).closest<HTMLElement>('[data-action],[data-tab]');
    if (!button) return;
    const action = button.dataset.action;
    if (button.dataset.tab) {
      this.unplaced = button.dataset.tab === 'unplaced';
      this.render();
    } else if (action === 'device') {
      const device = deviceCatalog(this._hass, this.plan).find(device => device.deviceId === button.dataset.key);
      if (device) this.choose(device);
    } else if (action === 'advanced') {
      this.advanced = true;
      this.query = '';
      this.render();
    } else if (action === 'back') {
      this.goBack();
    } else if (action === 'cancel') this.close(null);
    else if (action === 'entity' && button.dataset.key) this.close({ entityId: button.dataset.key, readings: [] });
    else if (action === 'entity-query') this.close({ entityId: this.query, readings: [] });
    else if (action === 'confirm' && this.selected) {
      const selection = { deviceId: this.selected.deviceId, entityId: this.primary, readings: this.additional };
      if (bindingIssues(selection, this._hass).length || !usefulEntity(this.primary, this._hass)) {
        this.root
          .querySelector('.pane-body')
          ?.insertAdjacentHTML(
            'beforeend',
            uiNotice(t('El dispositivo cambió. Volvé a elegir sus lecturas.'), 'alert'),
          );
        return;
      }
      this.close(selection);
    }
  };
}
if (!customElements.get('homemanager-device-picker')) customElements.define('homemanager-device-picker', DevicePicker);

export function openDevicePicker(
  root: ShadowRoot,
  hass: Hass | undefined,
  plan: ModelDevice[],
  binding: DeviceSelection | undefined,
  preferredArea: string | undefined,
  finish: (selection: DeviceSelection | null) => void,
): void {
  const picker = new DevicePicker();
  root.append(picker);
  picker.open(hass, plan, binding, preferredArea, finish);
}
