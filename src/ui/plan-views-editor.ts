import { t } from '../i18n/index.js';
import { clone, escapeHTML as e, type Configuration, type Hass } from '../card/types.js';
import type { PlanView, PlanImage } from '../model/plan-views.js';
import { alignedBox } from '../model/plan-views.js';
import { fileImage, putImage, readImage, imageUrl, type ImageData } from '../integration/images.js';
import { sanitizeArchitecture } from '../card/geometry.js';
import { confirmDialog } from './confirm-dialog.js';
export class PlanViewsEditor extends HTMLElement {
  private root = this.attachShadow({ mode: 'open' });
  private config!: Configuration;
  private hass?: Hass;
  private scope = 'images';
  private change!: (c: Configuration) => void;
  private edit?: PlanView;
  private message = '';
  private busy = false;
  private mode: 'light' | 'dark' = 'light';
  private urls: Record<string, string> = {};
  configure(config: Configuration, hass: Hass | undefined, scope: string, onChange: (c: Configuration) => void) {
    this.config = config;
    this.hass = hass;
    this.scope = scope;
    this.change = onChange;
    this.render();
  }
  private base(): PlanImage['box'] {
    const b = sanitizeArchitecture(this.config.architecture.content).box;
    return [b.x, b.y, b.width, b.height];
  }
  private commit(views: PlanView[]) {
    this.change({ ...clone(this.config), planViews: views });
    this.render();
  }
  private async action(command: string, id?: string) {
    const views = clone(this.config.planViews ?? []);
    const index = views.findIndex(v => v.id === id);
    if (command === 'new') {
      this.edit = { id: 'view-' + crypto.randomUUID().slice(0, 8), name: t('Nueva alternativa') };
      this.message = '';
    }
    if (command === 'edit') {
      this.edit = clone(views[index]);
      this.message = '';
    }
    if (command === 'cancel') this.edit = undefined;
    if (command === 'duplicate') {
      const view = clone(views[index]);
      view.id = 'view-' + crypto.randomUUID().slice(0, 8);
      view.name += ' ' + t('Copia');
      this.commit([...views, view]);
    }
    if (command === 'up' && index > 0) {
      [views[index - 1], views[index]] = [views[index], views[index - 1]];
      this.commit(views);
    }
    if (command === 'down' && index >= 0 && index < views.length - 1) {
      [views[index + 1], views[index]] = [views[index], views[index + 1]];
      this.commit(views);
    }
    if (
      command === 'remove' &&
      (await confirmDialog(this.root, {
        title: t('¿Quitar esta alternativa?'),
        message: t('El plano original y los símbolos se conservan.'),
        confirm: t('Quitar'),
      }))
    ) {
      this.commit(views.filter(v => v.id !== id));
    }
    if (command === 'align' && this.edit?.[this.mode]) this.edit[this.mode]!.box = this.base();
    if (command === 'save' && this.edit) {
      if (!this.edit.name.trim() || (!this.edit.light && !this.edit.dark))
        throw Error(t('Elegí un nombre y al menos una imagen.'));
      if ([this.edit.light, this.edit.dark].some(i => i && !alignedBox(i.box, this.base())))
        throw Error(t('Revisá el encuadre y alineá la imagen antes de guardar.'));
      const next = clone(this.edit);
      this.edit = undefined;
      this.commit(
        [...views.filter(v => v.id !== next.id), next].sort((a, b) => {
          const ai = views.findIndex(v => v.id === a.id),
            bi = views.findIndex(v => v.id === b.id);
          return (ai < 0 ? views.length : ai) - (bi < 0 ? views.length : bi);
        }),
      );
    }
    if (command === 'export') {
      const images: Record<string, ImageData> = {};
      for (const v of views)
        for (const image of [v.light, v.dark])
          if (image) images[image.scope + ':' + image.sha256] = await readImage(this.hass, image);
      const blob = new Blob([JSON.stringify({ configuration: this.config, images }, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = 'homemanager-with-images.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.message = t('La copia incluye la configuración y todas las imágenes de alternativas.');
    }
    this.render();
  }
  private async upload(file: File) {
    if (!this.edit) return;
    const pending = this.edit;
    const mode = this.mode;
    const { data, box } = await fileImage(file);
    const saved = await putImage(this.hass, this.scope, data);
    if (this.edit !== pending) return;
    this.edit[mode] = { ...saved, scope: this.scope, box };
    this.urls[saved.sha256] = imageUrl(data);
    this.message = alignedBox(box, this.base())
      ? ''
      : t('El encuadre es distinto. Compará la vista previa y elegí Alinear al plano.');
  }
  private async import(file: File) {
    if (file.size > 64 * 1024 * 1024) throw Error(t('La copia supera el límite de almacenamiento.'));
    const bundle = JSON.parse(await file.text());
    if (!bundle || !bundle.configuration || !bundle.images) throw Error(t('La copia debe incluir las imágenes.'));
    const { validateConfiguration } = await import('../card/configuration.js');
    const config = validateConfiguration(bundle.configuration, { allowPending: true });
    if (
      !(await confirmDialog(this.root, {
        title: t('¿Importar la copia con imágenes?'),
        message: t(
          'Primero se descarga una copia actual con imágenes. Después se reemplaza el borrador; podés descartar los cambios antes de guardar el hogar.',
        ),
        confirm: t('Importar'),
      }))
    )
      return;
    await this.action('export');
    for (const view of config.planViews ?? [])
      for (const image of [view.light, view.dark])
        if (image) {
          const data = bundle.images[image.scope + ':' + image.sha256];
          if (!data) throw Error(t('La copia debe incluir las imágenes.'));
          const saved = await putImage(this.hass, this.scope, data);
          if (saved.sha256 !== image.sha256 || saved.format !== image.format)
            throw Error(t('La imagen no coincide con su referencia.'));
          image.scope = this.scope;
        }
    this.edit = undefined;
    this.change(config);
  }
  private render() {
    if (!this.config) return;
    const views = this.config.planViews ?? [];
    const edit = this.edit;
    const image = edit?.[this.mode];
    const button = (cmd: string, label: string, id = '') =>
      `<button type="button" data-action="${cmd}" data-id="${e(id)}"${this.busy ? ' disabled' : ''}>${e(t(label))}</button>`;
    const background = edit?.[this.mode === 'light' ? 'lightBackground' : 'darkBackground'] ?? 'transparent';
    const swatches = ['#ffffff', '#f4f5f0', '#e8ece6', '#1b221e', '#121714', '#000000'];
    const fileButton = (attribute: string, label: string, accept: string) =>
      `<label class="file-button">${e(label)}<input type="file" ${attribute} accept="${accept}"${this.busy ? ' disabled' : ''}></label>`;
    // Mockup 6 (#72): a card per alternative, light and dark side by side, a dashed card to add one.
    this.root.innerHTML = `<style>:host{display:block;min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere}*{box-sizing:border-box}button,input,select{font:inherit;min-height:44px;border:1px solid var(--hm-line);border-radius:10px;padding:8px;background:var(--hm-surface);color:var(--hm-ink);max-width:100%;cursor:pointer}label{display:grid;gap:6px;margin:8px 0}small{display:block;color:var(--hm-muted)}[role=status]{margin:8px 0}
.view-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin:12px 0}.view-card{display:grid;gap:8px;padding:12px;border:1px solid var(--hm-line);border-radius:14px;background:var(--hm-surface)}.view-card header{display:flex;align-items:center;gap:8px}.view-card header b{flex:1}
.thumbs{display:grid;grid-template-columns:1fr 1fr;gap:8px}.thumb{display:grid;gap:4px;font-size:12px;color:var(--hm-muted);text-align:center}.thumb img,.thumb .missing{width:100%;aspect-ratio:4/3;object-fit:contain;border:1px solid var(--hm-line);border-radius:8px;background:var(--hm-bg)}.thumb .missing{display:grid;place-items:center;font-size:12px;color:var(--hm-warn);border-style:dashed}
.card-menu{position:relative}.card-menu>summary{list-style:none;min-width:44px;min-height:44px;display:grid;place-items:center;border-radius:10px;cursor:pointer}.card-menu>summary::-webkit-details-marker{display:none}.card-menu[open]>div{position:absolute;right:0;top:46px;z-index:2;display:grid;gap:4px;padding:6px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);box-shadow:var(--hm-shadow);min-width:160px}
.add-card{display:grid;place-items:center;min-height:160px;border:2px dashed var(--hm-line);border-radius:14px;background:transparent;color:var(--hm-accent);font-weight:600}
.tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.file-button{display:inline-grid;place-items:center;min-height:44px;margin:0;padding:8px 14px;border:1px solid var(--hm-line);border-radius:10px;background:var(--hm-surface);cursor:pointer}.file-button input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.file-button:focus-within{outline:3px solid var(--hm-accent)}
.editor-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:16px}@media(max-width:720px){.editor-layout{grid-template-columns:1fr}}
fieldset{min-width:0;width:100%;margin:0;border:1px solid var(--hm-line);border-radius:12px;padding:12px}.segmented{display:flex;gap:4px}.segmented button[aria-pressed=true]{background:var(--hm-accent);color:var(--hm-on-accent);border-color:var(--hm-accent)}.swatches{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.swatches button{width:36px;min-width:36px;height:36px;min-height:36px;padding:0;border-radius:50%}.swatches button[aria-pressed=true]{outline:3px solid var(--hm-accent);outline-offset:2px}.swatches input[type=color]{width:52px;padding:2px}
.preview{position:relative;width:100%;border:1px solid var(--hm-line);border-radius:10px;overflow:hidden}.preview img{width:100%;height:100%;object-fit:fill}.dot{position:absolute;width:8px;height:8px;border-radius:50%;background:var(--hm-brand);transform:translate(-50%,-50%)}</style>
<p>${e(t('El plano original conserva símbolos, zonas e historial. Las alternativas cambian sólo la imagen.'))}</p><small>${e(t('Para elegir cuál se ve, usá el botón de alternativas en el plano. Recomendado: SVG; también PNG y JPG.'))}</small>
<div class="view-cards">${views
      .map(
        v =>
          `<article class="view-card"><header><b>${e(v.name)}</b><details class="card-menu"><summary aria-label="${e(t('Más acciones de {name}', { name: v.name }))}">⋯</summary><div>${button('up', 'Subir', v.id)}${button('down', 'Bajar', v.id)}${button('duplicate', 'Duplicar', v.id)}${button('remove', 'Quitar', v.id)}</div></details></header><div class="thumbs">${(
            ['light', 'dark'] as const
          )
            .map(mode =>
              v[mode]
                ? `<span class="thumb"><img data-thumb="${e(v.id)}:${mode}" alt="${e(t(mode === 'light' ? 'Claro' : 'Oscuro'))}">${e(t(mode === 'light' ? 'Claro' : 'Oscuro'))}</span>`
                : `<span class="thumb"><span class="missing">${e(t('Falta'))}</span>${e(t(mode === 'light' ? 'Claro' : 'Oscuro'))}</span>`,
            )
            .join('')}</div>${button('edit', 'Cambiar imágenes', v.id)}</article>`,
      )
      .join(
        '',
      )}<button type="button" class="add-card" data-action="new" data-id=""${this.busy ? ' disabled' : ''}>${e(t('+ Agregar alternativa'))}</button></div>
<div class="tools">${button('export', 'Exportar copia con imágenes')}${fileButton('data-import', t('Importar copia con imágenes'), 'application/json')}</div>
${
  edit
    ? `<fieldset><legend>${e(t('Editar alternativa'))}</legend><div class="editor-layout"><div><label>${e(t('Nombre'))}<input data-name maxlength="240" value="${e(edit.name)}"></label><div class="segmented" role="group" aria-label="${e(t('Imagen por modo'))}"><button type="button" data-mode-choice="light" aria-pressed="${this.mode === 'light'}">${e(t('Claro'))}</button><button type="button" data-mode-choice="dark" aria-pressed="${this.mode === 'dark'}">${e(t('Oscuro'))}</button></div><div class="tools">${fileButton('data-image', image ? t('Cambiar imagen') : t('Elegir imagen'), '.svg,.png,.jpg,.jpeg')}${image ? button('align', 'Alinear al plano') : ''}</div><p>${e(t('Color del fondo'))}</p><div class="swatches">${swatches
        .map(
          color =>
            `<button type="button" data-swatch="${color}" aria-label="${e(color)}" aria-pressed="${background.toLowerCase() === color}" style="background:${color}"></button>`,
        )
        .join(
          '',
        )}<label class="file-button" style="padding:4px 8px">${e(t('Otro color'))}<input type="color" data-background-color value="${/^#[0-9a-fA-F]{6}$/.test(background) ? background : '#ffffff'}" style="position:static;width:40px;height:28px;opacity:1;pointer-events:auto;padding:0;min-height:28px"></label></div><label class="check" style="display:flex;align-items:center;gap:8px"><input type="checkbox" data-background-clear style="width:20px;min-height:20px"${background === 'transparent' ? ' checked' : ''}><span>${e(t('Fondo transparente'))}</span></label></div><div>${image ? `<div class="preview" style="aspect-ratio:${this.base()[2]}/${this.base()[3]};background:${e(background)}"><img alt="${e(t('Vista previa'))}" data-preview>${this.config.catalog.devices.map(d => `<i class="dot" style="left:${d.position.x * 100}%;top:${d.position.y * 100}%"></i>`).join('')}</div><small>${e(t('Si el encuadre no coincide, Alinear al plano ajusta la imagen al original. Comprobá sus paredes con los símbolos.'))}</small>` : `<p class="note">${e(t('Elegí una imagen para verla acá con los símbolos.'))}</p>`}</div></div><div class="tools">${button('save', 'Guardar alternativa')}${button('cancel', 'Cancelar')}</div></fieldset>`
    : ''
}<p role="status">${e(this.message)}</p>`;

    this.root.querySelector<HTMLInputElement>('[data-name]')?.addEventListener('input', ev => {
      if (this.edit) this.edit.name = (ev.target as HTMLInputElement).value;
    });
    for (const choice of this.root.querySelectorAll<HTMLButtonElement>('[data-mode-choice]'))
      choice.onclick = () => {
        this.mode = choice.dataset.modeChoice as 'light' | 'dark';
        this.render();
      };
    // The background is chosen, never typed (#72).
    const setBackground = (value: string) => {
      if (!this.edit || !/^(#[0-9a-fA-F]{6}|transparent)$/.test(value)) return;
      this.edit[this.mode === 'light' ? 'lightBackground' : 'darkBackground'] = value;
      this.render();
    };
    for (const swatch of this.root.querySelectorAll<HTMLButtonElement>('[data-swatch]'))
      swatch.onclick = () => setBackground(swatch.dataset.swatch!);
    this.root
      .querySelector<HTMLInputElement>('[data-background-color]')
      ?.addEventListener('change', ev => setBackground((ev.target as HTMLInputElement).value));
    this.root.querySelector<HTMLInputElement>('[data-background-clear]')?.addEventListener('change', ev => {
      setBackground((ev.target as HTMLInputElement).checked ? 'transparent' : '#ffffff');
    });
    const run = async (fn: () => Promise<unknown>) => {
      if (this.busy) return;
      this.busy = true;
      try {
        await fn();
      } catch (error) {
        this.message = error instanceof Error ? error.message : t('No se pudo guardar.');
      } finally {
        this.busy = false;
        this.render();
      }
    };
    this.root
      .querySelectorAll<HTMLButtonElement>('button[data-action]')
      .forEach(b => (b.onclick = () => void run(() => this.action(b.dataset.action!, b.dataset.id))));
    this.root.querySelector<HTMLInputElement>('[data-image]')?.addEventListener('change', ev => {
      const f = (ev.target as HTMLInputElement).files?.[0];
      if (f) void run(() => this.upload(f));
    });
    this.root.querySelector<HTMLInputElement>('[data-import]')?.addEventListener('change', ev => {
      const f = (ev.target as HTMLInputElement).files?.[0];
      if (f) void run(() => this.import(f));
    });
    for (const view of views)
      for (const mode of ['light', 'dark'] as const) {
        const image = view[mode],
          thumb = this.root.querySelector<HTMLImageElement>(`[data-thumb="${CSS.escape(view.id + ':' + mode)}"]`);
        if (image && thumb)
          void readImage(this.hass, image)
            .then(data => {
              if (thumb.isConnected) thumb.src = imageUrl(data);
            })
            .catch(() => {
              thumb.alt = t('No disponible');
            });
      }
    const preview = this.root.querySelector<HTMLImageElement>('[data-preview]');
    if (image && preview) {
      if (this.urls[image.sha256]) preview.src = this.urls[image.sha256];
      else
        void readImage(this.hass, image)
          .then(data => {
            this.urls[image.sha256] = imageUrl(data);
            if (preview.isConnected) preview.src = this.urls[image.sha256];
          })
          .catch(() => {
            preview.alt = t('No se pudo cargar la imagen. Se conserva el plano original.');
          });
    }
  }
}
if (!customElements.get('homemanager-plan-views-editor'))
  customElements.define('homemanager-plan-views-editor', PlanViewsEditor);
