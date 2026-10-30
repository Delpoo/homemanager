import { t } from '../i18n/index.js';
import { reportForPlan, withPlanShapes } from '../editor/plan-review.js';
import { fetchLinkedPlan, markLinkedSeen, type LinkedPlanStatus } from '../integration/store.js';
import { hasProblems, newProblems } from '../model/plan-import.js';
import { uiIcon } from '../ui/components.js';
import { validateConfiguration } from './configuration.js';
import { sanitizeArchitecture } from './geometry.js';
import { clone, escapeHTML as e, type Configuration } from './types.js';
import type { HomeManagerCard } from './home-manager-card.js';

/**
 * Stage 4 of 0.10: the drawing lives in a file in Home Assistant's config folder. A new
 * version applies by itself when it changes nothing about spaces or devices, and can be
 * undone; anything else asks. Only an administrator's open panel looks, never while editing.
 */
const EVERY_MS = 60_000;
export interface LinkedNotice {
  kind: 'applied' | 'review' | 'invalid';
  /** What this notice is about: a closed one does not come back for the same file. */
  key: string;
  sha?: string;
  /** The file as it is, for the import review. */
  source?: string;
  /** The same drawing as the plan stores it. */
  content?: string;
  before?: Configuration;
  revision?: number;
}

function adopt(card: HomeManagerCard, next: Configuration): void {
  card.saved = clone(next);
  card.draft = clone(next);
  card.config!.configuration = clone(next);
  card.setupAdapter(next);
  card.render();
}

/** Saves outside edit mode. `saving` keeps our own revision event from reloading the card. */
async function write(card: HomeManagerCard, next: Configuration): Promise<void> {
  card.saving = true;
  try {
    await card.home!.save(next, { allowPending: true });
  } finally {
    card.saving = false;
  }
  adopt(card, next);
}

const invalidKey = (status: LinkedPlanStatus) => `${status.state}:${status.modified_at ?? status.bytes ?? ''}`;

function show(card: HomeManagerCard, notice: LinkedNotice | undefined): void {
  card.linkedNotice = notice;
  card.renderLinkedNote();
}

export async function checkLinkedPlan(this: HomeManagerCard, force = false): Promise<void> {
  const home = this.home;
  const hass = this._hass;
  if (!home || !hass || hass.user?.is_admin !== true || !home.revision || this.homeState !== 'ready') return;
  if (this.editing || this.saving || this.linkedBusy || document.hidden || !this.saved) return;
  if (!force && Date.now() - this.linkedAt < EVERY_MS) return;
  this.linkedAt = Date.now();
  this.linkedBusy = true;
  try {
    const status = await fetchLinkedPlan(hass, home.homeId);
    if (status.state !== 'ready') {
      const key = invalidKey(status);
      if (status.state === 'missing') {
        if (this.linkedNotice?.kind === 'review') show(this, undefined);
      } else if (this.linkedClosed !== key && this.linkedNotice?.key !== key) show(this, { kind: 'invalid', key });
      return;
    }
    if (status.sha256 === status.seen_sha256) {
      if (this.linkedNotice?.kind === 'review') show(this, undefined);
      return;
    }
    if (this.linkedNotice?.key === status.sha256 || this.linkedClosed === status.sha256) return;
    const { content: source } = await fetchLinkedPlan(hass, home.homeId, true);
    if (source === undefined || home !== this.home || this.editing || this.saving || !this.saved) return;
    let incoming: ReturnType<typeof sanitizeArchitecture>;
    try {
      incoming = sanitizeArchitecture(source);
    } catch {
      show(this, { kind: 'invalid', key: status.sha256! });
      return;
    }
    const before = this.saved;
    // The same drawing, as when the file was first put in place: nothing to do.
    if (incoming.content === before.architecture.content) {
      await markLinkedSeen(hass, home.homeId, status.sha256!);
      return;
    }
    const candidate = validateConfiguration(
      { ...clone(before), architecture: { format: 'svg', content: incoming.content } },
      { allowPending: true },
    );
    const conflict =
      JSON.stringify(sanitizeArchitecture(before.architecture.content).box) !== JSON.stringify(incoming.box) ||
      hasProblems(newProblems(reportForPlan(before), reportForPlan(candidate)));
    if (conflict) {
      show(this, { kind: 'review', key: status.sha256!, sha: status.sha256, source, content: incoming.content });
      return;
    }
    const revision = home.revision;
    await write(this, withPlanShapes(candidate));
    await markLinkedSeen(hass, home.homeId, status.sha256!);
    show(this, {
      kind: 'applied',
      key: status.sha256!,
      sha: status.sha256,
      before: clone(before),
      revision: revision + 1,
    });
  } catch {
    // An older integration, a lost connection or another editor's save: the next look starts over.
  } finally {
    this.linkedBusy = false;
  }
}

/** The file's version goes through the normal import review, in edit mode. */
export async function reviewLinkedPlan(this: HomeManagerCard): Promise<void> {
  const hass = this._hass;
  const home = this.home;
  if (!hass || !home) return;
  try {
    let notice = this.linkedNotice;
    if (notice?.kind !== 'review') {
      const status = await fetchLinkedPlan(hass, home.homeId, true);
      if (status.state !== 'ready' || status.content === undefined) return;
      notice = {
        kind: 'review',
        key: status.sha256!,
        sha: status.sha256,
        source: status.content,
        content: sanitizeArchitecture(status.content).content,
      };
      show(this, notice);
    }
    if (!this.editing) await this.toggleEdit();
    if (this.editing) this.editor?.importPlanSource(notice.source!);
  } catch (error) {
    this.status(error instanceof Error ? error.message : t('No se pudo leer el archivo del plano.'));
  }
}

/** Saving the file's drawing settles that version, however it was reviewed. */
export function linkedSaved(this: HomeManagerCard, saved: Configuration): void {
  const notice = this.linkedNotice;
  if (notice?.kind !== 'review' || saved.architecture.content !== notice.content || !this._hass || !this.home) return;
  void markLinkedSeen(this._hass, this.home.homeId, notice.sha!).catch(() => {});
  show(this, undefined);
}

export async function linkedCommand(this: HomeManagerCard, command: string): Promise<void> {
  const notice = this.linkedNotice;
  if (!notice) return;
  if (command === 'linked-review') return this.reviewLinkedPlan();
  if (command === 'linked-close') this.linkedClosed = notice.key;
  if (command === 'linked-ignore' && this._hass && this.home) {
    this.linkedClosed = notice.key;
    await markLinkedSeen(this._hass, this.home.homeId, notice.sha!).catch(() => {});
    this.status(t('Se ignoró esta versión del archivo. El plano sigue como estaba.'));
  }
  if (command === 'linked-undo') {
    if (notice.revision !== this.home?.revision || this.editing || !notice.before) {
      this.status(
        t('El plano cambió después de esa actualización. Las versiones anteriores están en Importar y exportar.'),
      );
    } else {
      try {
        await write(this, notice.before);
        this.status(t('Volvió el plano anterior. Esa versión del archivo no se aplica de nuevo.'));
      } catch (error) {
        this.status(error instanceof Error ? error.message : t('No se pudo guardar.'));
        return;
      }
    }
  }
  show(this, undefined);
}

export function renderLinkedNote(this: HomeManagerCard): void {
  const note = this.root.querySelector<HTMLElement>('.linked-note');
  if (!note) return;
  const notice = this.editing ? undefined : this.linkedNotice;
  note.hidden = !notice;
  if (!notice) {
    note.replaceChildren();
    return;
  }
  const button = (command: string, label: string, primary = false) =>
    `<button type="button" data-command="${command}"${primary ? ' class="primary"' : ''}>${e(label)}</button>`;
  const text = {
    applied: t('El plano se actualizó desde su archivo. Espacios y dispositivos no cambiaron.'),
    review: t('El archivo del plano cambió, y esta versión afecta espacios o dispositivos.'),
    invalid: t('El archivo del plano no se pudo usar. El plano sigue como estaba.'),
  }[notice.kind];
  const actions = {
    applied: button('linked-undo', t('Deshacer')) + button('linked-close', t('Cerrar')),
    review: button('linked-ignore', t('Ignorar esta versión')) + button('linked-review', t('Revisar'), true),
    invalid: button('linked-close', t('Cerrar')),
  }[notice.kind];
  note.innerHTML = `${uiIcon('mdi:floor-plan')}<span>${e(text)}</span><div>${actions}</div>`;
}

export const linkedPlanStyles = `
.linked-note{position:absolute;left:12px;top:12px;z-index:5;max-width:min(460px,calc(100% - 84px));display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;padding:10px 12px;background:var(--hm-surface);border:1px solid var(--hm-line);border-radius:14px;box-shadow:var(--hm-shadow);font-size:13px}
.linked-note[hidden],.zones-active .linked-note{display:none}
.linked-note span{flex:1 1 180px;min-width:0}
.linked-note>div{display:flex;gap:6px;margin-left:auto}
.linked-note button{min-height:36px;padding:0 12px;border-radius:18px;border:1px solid var(--hm-line);background:var(--hm-surface);color:var(--hm-ink);font:inherit;cursor:pointer}
.linked-note button.primary{background:var(--hm-brand);border-color:var(--hm-brand);color:var(--hm-on-accent,#fff)}
`;
