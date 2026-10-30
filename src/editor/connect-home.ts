import { escapeHTML as esc } from '../card/types.js';
import { t } from '../i18n/index.js';
import { CREATE_AREA, NO_AREA, type AreaProposal } from '../model/connect-home.js';

/** The assistant's page in plan settings. It reads no state of its own: the editor gives it everything. */
export interface ConnectPage {
  rooms: readonly { id: string; label: string; areaId?: string }[];
  areas: Readonly<Record<string, { name?: string }>>;
  /** Has the frontend told us about areas at all? */
  known: boolean;
  choices: Readonly<Record<string, string>>;
  proposals: readonly AreaProposal[];
  picked: ReadonlySet<string>;
  busy: boolean;
}

export function connectBody(page: ConnectPage): string {
  if (!page.known) return `<p class="note">${esc(t('Home Assistant no informó sus áreas en esta sesión.'))}</p>`;
  if (!page.rooms.length) return `<p class="note">${esc(t('Este plano todavía no tiene espacios.'))}</p>`;
  const names = Object.entries(page.areas)
    .map(([id, area]) => [id, area.name ?? id] as const)
    .sort((a, b) => a[1].localeCompare(b[1]));
  const rows = page.rooms
    .map(room => {
      const chosen = page.choices[room.id];
      const option = (value: string, text: string) =>
        `<option value="${esc(value)}"${chosen === value ? ' selected' : ''}>${esc(text)}</option>`;
      return `<label class="connect-row"><span>${esc(room.label)}</span><select data-connect-room="${esc(room.id)}" aria-label="${esc(t('Área de {room}', { room: room.label }))}">${option(CREATE_AREA, t('Crear área «{room}»', { room: room.label }))}${option(NO_AREA, t('Sin área'))}${names.map(([id, name]) => option(id, name)).join('')}</select></label>`;
    })
    .join('');
  const creating = page.rooms.filter(room => page.choices[room.id] === CREATE_AREA);
  const unchanged = page.rooms.every(room => (page.choices[room.id] || undefined) === room.areaId);
  const apply = creating.length
    ? creating.length === 1
      ? t('Crear un área y vincular')
      : t('Crear {count} áreas y vincular', { count: creating.length })
    : t('Vincular');
  const warning = creating.length
    ? `<p class="note pending">${esc(t('Se crean en Home Assistant al tocar el botón: {names}. Deshacer no las borra; se borran desde Home Assistant.', { names: creating.map(room => room.label).join(', ') }))}</p>`
    : '';
  const linked = page.rooms.some(room => room.areaId);
  const proposals = page.proposals.length
    ? `<h3>${esc(t('Dispositivos de esas áreas que no están en el plano'))}</h3>${page.proposals
        .map(
          proposal =>
            `<h4>${esc(proposal.label)}</h4>${proposal.devices
              .map(
                device =>
                  `<label class="connect-device"><input type="checkbox" data-connect-device="${esc(device.deviceId)}"${page.picked.has(device.deviceId) ? ' checked' : ''}><span>${esc(device.name)}</span></label>`,
              )
              .join('')}`,
        )
        .join(
          '',
        )}<p class="note">${esc(t('Quedan dentro de su espacio y después los movés adonde van. Guardá el plano para conservarlos.'))}</p><button type="button" data-command="connect-add"${page.busy ? ' disabled' : ''}>${esc(t('Agregar seleccionados'))}</button>`
    : linked
      ? `<p class="note">${esc(t('No hay dispositivos sin ubicar en las áreas vinculadas. Si un área es nueva, asignale sus dispositivos en Home Assistant y aparecen acá.'))}</p>`
      : '';
  return `<div class="connect"><p>${esc(t('Vinculá cada espacio con un área de Home Assistant. Así HomeManager te propone los dispositivos de cada lugar.'))}</p>${rows}${warning}<button type="button" class="primary" data-command="connect-apply"${page.busy || unchanged ? ' disabled' : ''}>${esc(apply)}</button>${proposals}</div>`;
}

export const connectStyles = `
.connect{display:grid;gap:10px}
.connect h3,.connect h4,.connect p{margin:0}
.connect h3{margin-top:6px}
.connect-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);align-items:center;gap:10px}
.connect-row select{min-height:40px;min-width:0}
.connect-device{display:flex;align-items:center;gap:8px;min-height:36px}
.connect>button{justify-self:start}
`;
