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
    this.root.innerHTML = `<style>:host{display:block;margin-top:16px;min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere}*{box-sizing:border-box}button,input,select{font:inherit;min-height:44px;border:1px solid var(--hm-line);border-radius:10px;padding:8px;background:var(--hm-surface);color:var(--hm-ink);max-width:100%}label{display:grid;gap:6px;margin:8px 0}.row,.tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.row{border:1px solid var(--hm-line);border-radius:12px;padding:10px;margin:8px 0}.row b{flex:1}.row img{width:64px;height:44px;object-fit:contain;border:1px solid var(--hm-line);border-radius:6px}.preview{position:relative;max-width:420px;width:100%;border:1px solid var(--hm-line);overflow:hidden}.preview img{width:100%;height:100%;object-fit:fill}.dot{position:absolute;width:8px;height:8px;border-radius:50%;background:var(--hm-brand);transform:translate(-50%,-50%)}small{display:block;color:var(--hm-muted)}[role=status]{margin:8px 0}fieldset{min-width:0;width:100%;margin:0;border:1px solid var(--hm-line);border-radius:12px;padding:12px}</style><h4>${e(t('Alternativas del plano'))}</h4><p>${e(t('El plano original conserva símbolos, zonas e historial. Las alternativas cambian sólo la imagen.'))}</p><small>${e(t('Las imágenes se guardan en Home Assistant y sus copias de seguridad. Para trasladarlas, usá la copia con imágenes. La exportación habitual de configuración sólo contiene referencias.'))}</small>${views.map(v => `<div class="row"><b>${e(v.name)}</b>${(['light', 'dark'] as const).map(mode => (v[mode] ? `<img data-thumb="${e(v.id)}:${mode}" alt="${e(t(mode === 'light' ? 'Claro' : 'Oscuro'))}">` : '')).join('')}${button('edit', 'Editar', v.id)}${button('duplicate', 'Duplicar', v.id)}${button('up', 'Subir', v.id)}${button('down', 'Bajar', v.id)}${button('remove', 'Quitar', v.id)}</div>`).join('')}<div class="tools">${button('new', 'Agregar alternativa')}${button('export', 'Exportar copia con imágenes')}<label>${e(t('Importar copia con imágenes'))}<input type="file" data-import accept="application/json"></label></div>${edit ? `<fieldset><legend>${e(t('Editar alternativa'))}</legend><label>${e(t('Nombre'))}<input data-name maxlength="240" value="${e(edit.name)}"></label><label>${e(t('Imagen por modo'))}<select data-mode><option value="light"${this.mode === 'light' ? ' selected' : ''}>${e(t('Claro'))}</option><option value="dark"${this.mode === 'dark' ? ' selected' : ''}>${e(t('Oscuro'))}</option></select></label><label>${e(t('Cargar o reemplazar imagen'))}<input type="file" data-image accept=".svg,.png,.jpg,.jpeg"${this.busy ? ' disabled' : ''}></label><label>${e(t('Color del fondo'))}<input data-background value="${e(edit[this.mode === 'light' ? 'lightBackground' : 'darkBackground'] ?? 'transparent')}" placeholder="#ffffff"></label><small>${e(t('Usá un color hexadecimal o transparent. La imagen debe traer su transparencia.'))}</small>${image ? `<div class="preview" style="aspect-ratio:${this.base()[2]}/${this.base()[3]};background:${e(edit[this.mode === 'light' ? 'lightBackground' : 'darkBackground'] ?? 'transparent')}"><img alt="${e(t('Vista previa'))}" data-preview>${this.config.catalog.devices.map(d => `<i class="dot" style="left:${d.position.x * 100}%;top:${d.position.y * 100}%"></i>`).join('')}</div>${button('align', 'Alinear al plano')}<small>${e(t('Alinear ajusta la imagen al encuadre original. Comprobá sus paredes con los símbolos antes de guardar.'))}</small>` : ''}<div class="tools">${button('save', 'Guardar alternativa')}${button('cancel', 'Cancelar')}</div></fieldset>` : ''}<p role="status">${e(this.message)}</p>`;
    this.root.querySelector<HTMLInputElement>('[data-name]')?.addEventListener('input', ev => {
      if (this.edit) this.edit.name = (ev.target as HTMLInputElement).value;
    });
    this.root.querySelector<HTMLSelectElement>('[data-mode]')?.addEventListener('change', ev => {
      this.mode = (ev.target as HTMLSelectElement).value as 'light' | 'dark';
      this.render();
    });
    this.root.querySelector<HTMLInputElement>('[data-background]')?.addEventListener('change', ev => {
      const value = (ev.target as HTMLInputElement).value;
      if (this.edit && /^(#[0-9a-fA-F]{6}|transparent)$/.test(value)) {
        this.edit[this.mode === 'light' ? 'lightBackground' : 'darkBackground'] = value;
        this.render();
      } else {
        this.message = t('Usá un color hexadecimal o transparent. La imagen debe traer su transparencia.');
        this.render();
      }
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
