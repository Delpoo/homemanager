import { t } from '../i18n/index.js';
import { detectZones, roomsAt, sanitizeArchitecture } from '../card/geometry.js';
import { escapeHTML as e, type Configuration } from '../card/types.js';
import { mergeRoom, planImportReport, type PlanImportReport } from '../model/plan-import.js';

/** Hit testing needs mounted SVG coordinate matrices; the model only receives IDs. */
export function reportForPlan(configuration: Configuration): PlanImportReport {
  const { svg, box } = sanitizeArchitecture(configuration.architecture.content),
    zones = detectZones(svg);
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${box.width}px;height:${box.height}px;opacity:0;pointer-events:none`;
  host.append(svg);
  document.body.append(host);
  try {
    return planImportReport(
      configuration,
      Object.fromEntries(
        configuration.catalog.devices.map(device => [
          device.id,
          roomsAt(
            svg,
            device.position,
            box,
            zones.map(zone => zone.id),
          ),
        ]),
      ),
      zones,
    );
  } finally {
    host.remove();
  }
}
export function hasPlanChanges(report: PlanImportReport): boolean {
  return Object.values(report).some(items => items.length > 0);
}

/** One review, one callback and therefore one undo step. Nothing is persisted here. */
export function openPlanReview(
  root: ShadowRoot,
  candidate: Configuration,
  report: PlanImportReport,
  apply: (next: Configuration, planOnly: boolean) => void,
  before?: Configuration,
): void {
  const dialog = document.createElement('dialog');
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
  const positions = candidate.catalog.devices.filter(device => {
    const previous = before?.catalog.devices.find(item => item.id === device.id);
    return previous && JSON.stringify(previous.position) !== JSON.stringify(device.position);
  });
  dialog.innerHTML = `<style>.plan-review{width:660px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto;padding:20px;border:1px solid var(--hm-line);border-radius:12px;background:var(--hm-surface);color:var(--hm-ink)}.plan-review[open]{display:flex;flex-direction:column}.review-content{overflow:auto;min-height:0;flex:1}.plan-review h2{margin-top:0}.plan-review h3{margin:18px 0 8px}.plan-review label{display:flex;gap:8px;align-items:center;margin:10px 0}.plan-review label select{flex:1}.plan-review input[type=checkbox]{flex:none;width:20px}.plan-review .review-row{border-bottom:1px solid var(--hm-line);padding:8px 0}.plan-review .actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:18px}.plan-review .review-error{color:var(--hm-alert)}@media(max-width:650px){.plan-review .review-row label{display:block}.plan-review .actions button{flex:1 1 100%}}</style><h2 id="plan-review-title">${e(t('Revisar cambios'))}</h2><p>${e(t('Revisá los cambios antes de aplicarlos al borrador. Guardar los persiste; Deshacer devuelve todo.'))}</p>
  <div class="review-content">${positions.length ? `<h3>${e(t('Cambios de posición'))}</h3><ul>${positions.map(device => `<li>${e(device.display.label)}: ${e(JSON.stringify(before!.catalog.devices.find(item => item.id === device.id)!.position))} → ${e(JSON.stringify(device.position))}</li>`).join('')}</ul>` : ''}
  ${report.moves.length ? `<h3>${e(t('Dispositivos que cambian de espacio'))}</h3>${report.moves.map(move => `<label><input type="checkbox" data-move="${e(move.deviceId)}" checked><span>${e(label(move.deviceId))}: ${e(name(move.from))} → ${e(name(move.to))}</span></label>`).join('')}` : ''}
  ${
    report.orphans.length
      ? `<h3>${e(t('Espacios sin zona'))}</h3>${report.orphans
          .map(
            orphan =>
              `<div class="review-row"><strong>${e(orphan.label)}</strong><p>${orphan.devices.map(id => e(label(id))).join(', ') || e(t('Sin dispositivos'))}</p><label>${e(t('Resolver espacio'))}<select data-orphan="${e(orphan.roomId)}" aria-label="${e(t('Resolver {room}', { room: orphan.label }))}">${targets
                .filter(room => room.id !== orphan.roomId)
                .map(
                  room =>
                    `<option value="merge:${e(room.id)}"${orphan.suggestion === room.id ? ' selected' : ''}>${e(t('Fusionar en {room}', { room: room.label }))}</option>`,
                )
                .join(
                  '',
                )}<option value="keep"${!orphan.suggestion && orphan.devices.length ? ' selected' : ''}>${e(t('Conservar sin zona'))}</option>${!orphan.devices.length ? `<option value="remove" selected>${e(t('Quitar'))}</option>` : ''}</select></label></div>`,
          )
          .join('')}`
      : ''
  }
  ${report.newZones.length ? `<h3>${e(t('Zonas nuevas'))}</h3>${report.newZones.map(zone => `<label><input type="checkbox" data-zone="${e(zone.id)}" checked><span>${e(t('Agregar como espacio'))}: ${e(zone.label)}</span></label>`).join('')}` : ''}
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
  dialog.querySelector('[data-review=cancel]')!.addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-review=plan]')!.addEventListener('click', () => {
    dialog.close();
    apply(structuredClone(candidate), true);
  });
  // Unchecking an individual move visibly cancels its room-wide default merge.
  dialog.addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.move && !input.checked) {
      const move = report.moves.find(item => item.deviceId === input.dataset.move);
      const select = dialog.querySelector<HTMLSelectElement>(`[data-orphan="${CSS.escape(move?.from ?? '')}"]`);
      if (select) select.value = 'keep';
    }
  });
  dialog.querySelector('[data-review=apply]')!.addEventListener('click', () => {
    try {
      let next = structuredClone(candidate);
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
        if (action === 'remove') next = mergeRoom(next, orphan.roomId, null);
        else if (action.startsWith('merge:')) {
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
  dialog.showModal();
}
