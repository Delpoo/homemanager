import { t } from '../i18n/index.js';
import { TaskScreen } from '../ui/task-screen.js';
import { detectZones, roomsAt, sanitizeArchitecture, spaceAt, zoneShapes } from '../card/geometry.js';
import { planHealth, type PlanHealth } from '../model/plan-health.js';
import { escapeHTML as e, type Configuration } from '../card/types.js';
import { mergeRoom, planImportReport, type PlanImportReport } from '../model/plan-import.js';
import { ownsShape, roomContains, withZoneShapes, type RoomShape } from '../model/room-shapes.js';
import { startDraft } from '../model/zone-edit.js';

/** The import report plus the spaces drawn by hand whose zone the new plan redraws (D22). */
export type PlanReview = PlanImportReport & { drawn?: { roomId: string; label: string }[] };
const differs = (a: RoomShape, b: RoomShape) =>
  (['x', 'y', 'width', 'height'] as const).some(key => Math.abs(a[key] - b[key]) > 0.005);

/** Hit testing needs mounted SVG coordinate matrices; the model only receives IDs. */
function mounted<T>(configuration: Configuration, read: (plan: ReturnType<typeof sanitizeArchitecture>) => T): T {
  const plan = sanitizeArchitecture(configuration.architecture.content);
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${plan.box.width}px;height:${plan.box.height}px;opacity:0;pointer-events:none`;
  host.append(plan.svg);
  document.body.append(host);
  try {
    return read(plan);
  } finally {
    host.remove();
  }
}
/** Spaces with their own shape (D22) answer by it and are never left without a zone. */
export function reportForPlan(configuration: Configuration): PlanReview {
  return mounted(configuration, ({ svg, box }) => {
    const zones = detectZones(svg);
    const shaped = configuration.rooms.filter(
      room => room.shape && (ownsShape(room) || !zones.some(zone => zone.id === room.id)),
    );
    const zoneIds = zones.map(zone => zone.id).filter(id => !shaped.some(room => room.id === id));
    const zoneCopies = zoneShapes(
      svg,
      box,
      configuration.rooms.filter(ownsShape).map(room => room.id),
    );
    const drawn = configuration.rooms
      .filter(room => ownsShape(room) && zoneCopies[room.id] && differs(zoneCopies[room.id]!, room.shape!))
      .map(room => ({ roomId: room.id, label: room.label }));
    const report = planImportReport(
      configuration,
      Object.fromEntries(
        configuration.catalog.devices.map(device => [
          device.id,
          [
            ...roomsAt(svg, device.position, box, zoneIds),
            ...shaped.filter(room => roomContains(room, device.position)).map(room => room.id),
          ],
        ]),
      ),
      [...zones.filter(zone => zoneIds.includes(zone.id)), ...shaped.map(room => ({ id: room.id, label: room.label }))],
    );
    return { ...report, drawn };
  });
}
/** What is saved in this home and what is wrong with it, measured on the real drawing. */
export function healthOfPlan(configuration: Configuration, entities?: ReadonlySet<string>): PlanHealth {
  return mounted(configuration, ({ svg, box }) => {
    const title = [...svg.children].find(child => child.localName === 'title')?.textContent ?? null;
    return planHealth(configuration, {
      zones: detectZones(svg),
      drawnIn: Object.fromEntries(
        configuration.catalog.devices.map(device => [
          device.id,
          spaceAt(svg, device.position, box, configuration.rooms),
        ]),
      ),
      title,
      ...(entities ? { entities } : {}),
    });
  });
}
/** Each space's rectangles right now: its own, else its zone's. */
export function spaceRects(configuration: Configuration): Record<string, RoomShape[]> {
  return mounted(configuration, ({ svg, box }) => {
    const ids = configuration.rooms.map(room => room.id);
    const draft = startDraft(configuration.rooms, zoneShapes(svg, box, ids));
    return Object.fromEntries(draft.zones.map(zone => [zone.id, zone.rects]));
  });
}
/** After an import, every space that follows the SVG keeps a copy of its zone (D22). */
export function withPlanShapes(configuration: Configuration): Configuration {
  return mounted(configuration, ({ svg, box }) => ({
    ...configuration,
    rooms: withZoneShapes(
      configuration.rooms,
      zoneShapes(
        svg,
        box,
        configuration.rooms.map(room => room.id),
      ),
    ),
  }));
}
export function hasPlanChanges(report: PlanImportReport): boolean {
  return Object.values(report).some(items => items.length > 0);
}

/** One review, one callback and therefore one undo step. Nothing is persisted here. */
export function openPlanReview(
  root: ShadowRoot,
  candidate: Configuration,
  report: PlanReview,
  apply: (next: Configuration, planOnly: boolean) => void,
  before?: Configuration,
): void {
  const dialog = new TaskScreen();
  dialog.className = 'plan-review';
  const name = (id: string | null) =>
    candidate.rooms.find(room => room.id === id)?.label ??
    report.newZones.find(zone => zone.id === id)?.label ??
    id ??
    t('Sin espacio');
  const label = (id: string) => candidate.catalog.devices.find(device => device.id === id)?.display.label ?? id;
  const targets = [
    ...candidate.rooms.filter(room => !report.orphans.some(orphan => orphan.roomId === room.id)),
    ...report.newZones,
  ];
  // Devices an orphan still holds once the checked moves are applied. A space
  // emptied by individual moves is removed by default instead of kept without a zone.
  const remaining = (orphan: PlanImportReport['orphans'][number], moved: (id: string) => boolean) =>
    orphan.devices.filter(id => !moved(id));
  const movedByDefault = (id: string) => report.moves.some(move => move.deviceId === id);
  const defaultAction = (orphan: PlanImportReport['orphans'][number], left: number) =>
    orphan.suggestion ? `merge:${orphan.suggestion}` : left ? 'keep' : 'remove';
  const positions = candidate.catalog.devices.filter(device => {
    const previous = before?.catalog.devices.find(item => item.id === device.id);
    return previous && JSON.stringify(previous.position) !== JSON.stringify(device.position);
  });
  // The drawing does not decide which spaces a home has (D23). A zone is offered ticked only
  // in a home with no spaces yet, or when a device would end up in it.
  const wanted = (id: string) =>
    !candidate.rooms.length ||
    report.moves.some(move => move.to === id) ||
    report.orphans.some(orphan => orphan.suggestion === id);
  dialog.innerHTML = `<style>.plan-review{width:660px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto;padding:20px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);color:var(--hm-ink)}.plan-review[open]{display:flex;flex-direction:column}.review-content{overflow:auto;min-height:0;flex:1}.plan-review h2{margin-top:0}.plan-review h3{margin:18px 0 8px}.plan-review label{display:flex;gap:8px;align-items:center;margin:10px 0}.plan-review label select{flex:1}.plan-review input[type=checkbox]{flex:none;width:20px}.plan-review .review-row{border-bottom:1px solid var(--hm-line);padding:8px 0}.plan-review .actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:18px}.plan-review .review-error{color:var(--hm-alert)}@media(max-width:650px){.plan-review .review-row label{display:block}.plan-review .actions button{flex:1 1 100%}}</style><h2 id="plan-review-title">${e(t('Revisar cambios'))}</h2><p>${e(t('Revisá los cambios antes de aplicarlos al borrador. Guardar los persiste; Deshacer devuelve todo.'))}</p>
  <div class="review-content">${positions.length ? `<h3>${e(t('Cambios de posición'))}</h3><ul>${positions.map(device => `<li>${e(device.display.label)}: ${e(JSON.stringify(before!.catalog.devices.find(item => item.id === device.id)!.position))} → ${e(JSON.stringify(device.position))}</li>`).join('')}</ul>` : ''}
  ${report.moves.length ? `<h3>${e(t('Dispositivos que cambian de espacio'))}</h3>${report.moves.map(move => `<label><input type="checkbox" data-move="${e(move.deviceId)}" checked><span>${e(label(move.deviceId))}: ${e(name(move.from))} → ${e(name(move.to))}</span></label>`).join('')}` : ''}
  ${
    report.orphans.length
      ? `<h3>${e(t('Espacios sin zona'))}</h3>${report.orphans
          .map(orphan => {
            const left = remaining(orphan, movedByDefault).length;
            const chosen = defaultAction(orphan, left);
            const option = (value: string, text: string, disabled = false) =>
              `<option value="${e(value)}"${chosen === value ? ' selected' : ''}${disabled ? ' disabled' : ''}>${e(text)}</option>`;
            return `<div class="review-row"><strong>${e(orphan.label)}</strong><p>${orphan.devices.map(id => e(label(id))).join(', ') || e(t('Sin dispositivos'))}</p><label>${e(t('Resolver espacio'))}<select data-orphan="${e(orphan.roomId)}" aria-label="${e(t('Resolver {room}', { room: orphan.label }))}">${targets
              .filter(room => room.id !== orphan.roomId)
              .map(room => option(`merge:${room.id}`, t('Fusionar en {room}', { room: room.label })))
              .join(
                '',
              )}${option('keep', t('Conservar sin zona'))}${option('remove', t('Quitar'), left > 0)}</select></label></div>`;
          })
          .join('')}`
      : ''
  }
  ${report.newZones.length ? `<h3>${e(t('Zonas nuevas'))}</h3>${report.newZones.map(zone => `<label><input type="checkbox" data-zone="${e(zone.id)}"${wanted(zone.id) ? ' checked' : ''}><span>${e(t('Agregar como espacio'))}: ${e(zone.label)}</span></label>`).join('')}` : ''}
  ${report.drawn?.length ? `<h3>${e(t('Espacios dibujados a mano'))}</h3><p>${e(t('El plano nuevo trae otra zona para estos espacios. Se conservan como los dibujaste, salvo que elijas la zona.'))}</p>${report.drawn.map(item => `<label><input type="checkbox" data-drawn="${e(item.roomId)}"><span>${e(t('Usar la zona del plano: {room}', { room: item.label }))}</span></label>`).join('')}` : ''}
  ${report.ambiguous.length ? `<h3>${e(t('Dispositivos ambiguos: conservan su espacio'))}</h3><ul>${report.ambiguous.map(item => `<li>${e(label(item.deviceId))}: ${item.zones.map(id => e(name(id))).join(', ')}</li>`).join('')}</ul>` : ''}
  ${report.outside.length ? `<h3>${e(t('Fuera de zona: conservan su espacio'))}</h3><ul>${report.outside.map(item => `<li>${e(label(item.deviceId))}</li>`).join('')}</ul>` : ''}
  </div><p class="review-error" role="alert"></p><div class="actions"><button type="button" data-review="cancel">${e(t('Cancelar'))}</button><button type="button" data-review="plan">${e(t('Importar sólo el plano'))}</button><button type="button" data-review="apply">${e(t('Aplicar'))}</button></div>`;
  dialog.setAttribute('aria-labelledby', 'plan-review-title');
  const previous = root.activeElement as HTMLElement | null;
  dialog.addEventListener(
    'close',
    () => {
      dialog.remove();
      previous?.focus();
    },
    { once: true },
  );
  dialog.querySelector('[data-review=cancel]')!.addEventListener('click', () => void dialog.back());
  dialog.querySelector('[data-review=plan]')!.addEventListener('click', () => {
    dialog.close();
    apply(structuredClone(candidate), true);
  });
  // Unchecking an individual move visibly cancels its room-wide default merge.
  // Every toggle recomputes which orphans are left empty, so Quitar is offered
  // exactly when nothing would be unassigned, and chosen unless the user picked.
  const touched = new Set<string>();
  const moved = (id: string) => !!dialog.querySelector<HTMLInputElement>(`[data-move="${CSS.escape(id)}"]`)?.checked;
  dialog.addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.orphan) {
      touched.add(input.dataset.orphan);
      return;
    }
    if (!input.dataset.move) return;
    const move = report.moves.find(item => item.deviceId === input.dataset.move);
    for (const orphan of report.orphans) {
      const select = dialog.querySelector<HTMLSelectElement>(`[data-orphan="${CSS.escape(orphan.roomId)}"]`)!;
      const left = remaining(orphan, moved).length;
      select.querySelector<HTMLOptionElement>('option[value=remove]')!.disabled = left > 0;
      if (!input.checked && orphan.roomId === move?.from && select.value.startsWith('merge:')) select.value = 'keep';
      else if (!touched.has(orphan.roomId) && !select.value.startsWith('merge:'))
        select.value = left ? 'keep' : 'remove';
      if (select.value === 'remove' && left) select.value = 'keep';
    }
  });
  dialog.querySelector('[data-review=apply]')!.addEventListener('click', () => {
    try {
      let next = structuredClone(candidate);
      // A drawn space takes the new zone only when chosen: its shape goes and the zone is copied.
      for (const item of report.drawn ?? [])
        if (dialog.querySelector<HTMLInputElement>(`[data-drawn="${CSS.escape(item.roomId)}"]`)!.checked) {
          const room = next.rooms.find(entry => entry.id === item.roomId);
          if (room) {
            delete room.shape;
            delete room.rects;
            delete room.shapeSource;
          }
        }
      for (const zone of report.newZones)
        if (dialog.querySelector<HTMLInputElement>(`[data-zone="${CSS.escape(zone.id)}"]`)!.checked)
          next.rooms.push({ id: zone.id, label: zone.label });
      for (const move of report.moves)
        if (dialog.querySelector<HTMLInputElement>(`[data-move="${CSS.escape(move.deviceId)}"]`)!.checked) {
          if (!next.rooms.some(room => room.id === move.to))
            throw new Error(t('Agregá el espacio de destino o desmarcá su cambio.'));
          next.catalog.devices.find(device => device.id === move.deviceId)!.roomId = move.to;
        }
      for (const orphan of report.orphans) {
        const action = dialog.querySelector<HTMLSelectElement>(`[data-orphan="${CSS.escape(orphan.roomId)}"]`)!.value;
        if (action === 'remove') {
          if (next.catalog.devices.some(device => device.roomId === orphan.roomId))
            throw new Error(t('Elegí fusionar los dispositivos o dejarlos sin espacio.'));
          next = mergeRoom(next, orphan.roomId, null);
        } else if (action.startsWith('merge:')) {
          const target = action.slice(6);
          if (!next.rooms.some(room => room.id === target))
            throw new Error(t('Agregá el espacio de destino o elegí Conservar sin zona.'));
          next = mergeRoom(next, orphan.roomId, target);
        }
      }
      dialog.close();
      apply(next, false);
    } catch (error) {
      dialog.querySelector('.review-error')!.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  root.append(dialog);
  dialog.show(root);
}
