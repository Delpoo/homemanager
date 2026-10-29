import { ActivityLog } from '../model/activity.js';
import { alertsOf, type DeviceAlert } from '../model/alerts.js';
import { airStamp, onAir } from '../integration/rf.js';
import type { Configuration, Hass, RuntimeState } from '../card/types.js';

interface Tracked {
  token: string;
  deviceId: string;
  actionId: string;
  label: string;
  issued: number;
  expires: number;
  baseline: string | null;
  air: Map<string, string | null>;
  raw?: string;
  accepted: boolean;
  done: boolean;
}
/** Session orchestration. Only the model decides whether evidence can confirm. */
export class RuntimeFeed {
  private configuration?: Configuration;
  private sequence = 0;
  private generation = 0;
  private tracked = new Map<string, Tracked>();
  private previous = new Map<string, string>();
  private active = new Map<string, DeviceAlert>();
  constructor(readonly log: ActivityLog) {}
  get alerts(): DeviceAlert[] {
    return [...this.active.values()].map(alert => ({ ...alert }));
  }
  configure(configuration: Configuration): void {
    this.configuration = configuration;
    this.generation++;
    this.tracked.clear();
    this.previous.clear();
    this.active.clear();
  }
  prepareCommand(
    deviceId: string,
    actionId: string,
    hass: Hass | undefined,
    now: number,
    label = actionId,
    entityId?: string,
  ): string {
    const device = this.configuration?.catalog.devices.find(item => item.id === deviceId);
    const target = entityId ?? this.configuration?.actions[actionId]?.target.entity_id ?? device?.bindings.entityId;
    const targets = target ? [target].flat() : [];
    const source = this.configuration?.stateSources[deviceId];
    const token = `${this.generation}/${++this.sequence}`;
    this.tracked.set(token, {
      token,
      deviceId,
      actionId,
      label,
      issued: now,
      expires: now + (this.configuration?.commandTtlSeconds ?? 30) * 1000,
      baseline: source ? (hass?.states[source.entityId]?.last_updated ?? null) : null,
      air: new Map(targets.map(id => [id, airStamp(hass?.states[id])])),
      accepted: false,
      done: false,
    });
    return token;
  }
  noteCommandResult(token: string, result: { ok: boolean; reason?: string }, now: number): void {
    const command = this.tracked.get(token);
    if (!command) return;
    command.accepted = result.ok;
    this.record(command, result.ok ? 'sent' : 'error', now, result.reason);
    if (!result.ok) command.done = true;
  }
  private record(command: Tracked, status: 'sent' | 'on_air' | 'error', at: number, detail?: string): void {
    const device = this.configuration?.catalog.devices.find(item => item.id === command.deviceId);
    this.log.record({
      type: 'command',
      commandId: command.token,
      status,
      at,
      issuedAt: command.issued,
      deviceId: command.deviceId,
      deviceLabel: device?.display.label,
      actionLabel: command.label,
      ...(detail ? { detail } : {}),
    });
  }
  update(hass: Hass | undefined, runtime: RuntimeState, verified: ReadonlySet<string>, now: number): void {
    if (!this.configuration || !hass) return;
    const alerts = this.configuration.catalog.devices.flatMap(device => alertsOf(device, hass, now));
    const next = new Map(alerts.map(alert => [alert.id, alert]));
    for (const alert of alerts)
      if (!this.active.has(alert.id)) {
        const device = this.configuration.catalog.devices.find(item => item.id === alert.deviceId);
        this.log.record({
          type: 'alert',
          alertId: alert.id,
          at: now,
          deviceId: alert.deviceId,
          deviceLabel: device?.display.label,
          message: alert.message,
          level: alert.level,
        });
      }
    for (const alert of this.active.values())
      if (!next.has(alert.id))
        this.log.record({
          type: 'resolved',
          alertId: alert.id,
          at: now,
          deviceId: alert.deviceId,
          message: 'Alerta resuelta',
        });
    this.active = next;
    for (const device of this.configuration.catalog.devices) {
      const state = runtime.states[device.id],
        raw = state?.command;
      let command: Tracked | undefined;
      if (raw) {
        command =
          [...this.tracked.values()].find(item => item.deviceId === device.id && item.raw === raw.id) ??
          [...this.tracked.values()].reverse().find(item => item.deviceId === device.id && !item.raw && !item.done);
        if (!command) {
          const token = this.prepareCommand(device.id, raw.actionId, hass, Date.parse(raw.issuedAt));
          command = this.tracked.get(token)!;
        }
        command.raw = raw.id;
        command.accepted = raw.status === 'sent';
        command.issued = Date.parse(raw.issuedAt);
        command.expires = Date.parse(raw.expiresAt);
        command.baseline = raw.baselineLastUpdated;
        this.record(command, raw.status, now);
        if (raw.status === 'error') command.done = true;
      }
      command ??= [...this.tracked.values()]
        .reverse()
        .find(item => item.deviceId === device.id && !item.done && item.accepted);
      if (command && !command.done && command.accepted) {
        if (now >= command.expires) {
          this.log.record({ type: 'expired', commandId: command.token, deviceId: device.id, at: now });
          command.done = true;
        } else {
          for (const [id, baseline] of command.air)
            if (onAir(hass.states[id], baseline) === 'heard') this.record(command, 'on_air', now);
          const source = this.configuration.stateSources[device.id];
          if (
            state?.confidence === 'confirmed' &&
            state.observedAt &&
            source?.feedback === 'measured' &&
            verified.has(source.entityId)
          ) {
            this.log.record({
              type: 'command',
              commandId: command.token,
              status: 'confirmed',
              at: now,
              deviceId: device.id,
              evidence: {
                feedback: 'measured',
                verified: true,
                observedAt: state.observedAt,
                baselineLastUpdated: command.baseline,
              },
            });
            if (
              this.log.entries.some(
                entry => entry.id === `command:${device.id}:${command.token}` && entry.status === 'confirmed',
              )
            )
              command.done = true;
          }
        }
      }
      const entityId = device.bindings.entityId,
        entity = entityId ? hass.states[entityId] : undefined;
      if (entityId && entity) {
        const previous = this.previous.get(device.id);
        if (previous !== undefined && previous !== entity.state && !command)
          this.log.record({
            type: 'state',
            entityId,
            deviceId: device.id,
            deviceLabel: device.display.label,
            at: now,
            value: entity.state,
          });
        this.previous.set(device.id, entity.state);
      }
    }
    // The visible log is bounded; finished command tracking is bounded too.
    while (this.tracked.size > 100) this.tracked.delete(this.tracked.keys().next().value!);
  }
}
