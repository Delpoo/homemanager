import { evaluateVisualRules, visualRuleCleared, type VisualResult } from '../model/visual-rules.js';
import { ActivityLog, isStateEvent } from '../model/activity.js';
import { formattedValue } from '../model/symbol-spec.js';
import { alertCleared, alertsOf, observeAlertRules, type AlertContext, type DeviceAlert } from '../model/alerts.js';
import { airStamp, onAir } from '../integration/rf.js';
import type { Configuration, Hass, RuntimeState } from '../card/types.js';
import type { AutomationFailure } from '../model/automations.js';

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
  private unresolved = new Map<string, DeviceAlert>();
  private observations: AlertContext = {};
  private visualObservations: AlertContext = {};
  private visualResults: VisualResult[] = [];
  get ruleResults(): VisualResult[] {
    return this.online ? [...this.visualResults, ...this.failureResults()] : [];
  }
  /** 0.13: an automation that failed leaves an alert on its symbol and in Now. */
  private failures: AutomationFailure[] = [];
  setFailures(failures: AutomationFailure[]): void {
    this.failures = failures;
  }
  private failureResults(): VisualResult[] {
    const devices = this.configuration?.catalog.devices ?? [];
    return this.failures.map(failure => {
      const device = devices.find(item => item.id === failure.deviceId);
      const name = failure.title || failure.automationId;
      return {
        rule: {
          id: failure.notificationId,
          name,
          enabled: true,
          sources: [],
          symbols: device ? [device.id] : [],
          level: 'alert' as const,
          badge: true,
          highlight: true,
          bar: true,
          now: true,
        },
        alert: {
          id: failure.notificationId,
          deviceId: device?.id ?? '',
          roomId: device?.roomId ?? null,
          entityId: '',
          rule: 'problem' as const,
          level: 'critical' as const,
          message: failure.message || name,
        },
        value: failure.message,
      };
    });
  }
  private online = false;
  constructor(readonly log: ActivityLog) {}
  get alerts(): DeviceAlert[] {
    return this.online ? [...this.active.values()].map(alert => ({ ...alert })) : [];
  }
  get alertContext(): AlertContext {
    return this.observations;
  }
  configure(configuration: Configuration): void {
    this.configuration = configuration;
    this.generation++;
    this.tracked.clear();
    this.previous.clear();
    this.active.clear();
    this.unresolved.clear();
    this.observations = {};
    this.visualObservations = {};
    this.visualResults = [];
    this.online = false;
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
    this.online = !!hass && hass.connection?.connected !== false;
    this.observations = observeAlertRules(this.configuration?.catalog.devices ?? [], hass, now, this.observations);
    if (!this.configuration || !hass || !this.online) {
      this.visualObservations = {};
      this.visualResults = [];
      return;
    }
    const previousVisual = this.visualResults;
    const visual = evaluateVisualRules(
      this.configuration.rules ?? [],
      this.configuration.catalog.devices,
      hass,
      now,
      this.visualObservations,
    );
    this.visualObservations = visual.context;
    this.visualResults = visual.results;
    for (const result of visual.results)
      if (
        result.rule.level === 'indicator' &&
        result.rule.bar !== false &&
        !previousVisual.some(old => old.rule.id === result.rule.id)
      )
        this.log.record({
          type: 'state',
          at: now,
          entityId: result.alert.entityId,
          deviceId: result.alert.deviceId,
          message: result.rule.name,
          value: result.value,
        });
    const alerts = [
      ...this.configuration.catalog.devices.flatMap(device =>
        alertsOf(device, hass, now, this.observations, this.configuration?.baseRules),
      ),
      ...visual.results
        .filter(result => result.rule.level !== 'indicator' && result.rule.bar !== false)
        .map(result => result.alert),
    ];
    const next = new Map(alerts.map(alert => [alert.id, alert]));
    const alertChanged = new Set<string>();
    for (const alert of alerts)
      if (!this.active.has(alert.id) || this.active.get(alert.id)?.level !== alert.level) {
        alertChanged.add(alert.deviceId);
        const device = this.configuration.catalog.devices.find(item => item.id === alert.deviceId);
        this.log.record({
          type: 'alert',
          alertId: alert.id,
          at: now,
          deviceId: alert.deviceId,
          deviceLabel: device?.display.label,
          message: alert.message,
          level: alert.level,
          detail: alert.readingLabel,
        });
      }
    for (const alert of this.unresolved.values())
      if (
        !next.has(alert.id) &&
        (alert.id.startsWith('visual:')
          ? (this.configuration.rules ?? []).some(
              rule => 'visual:' + rule.id === alert.id && visualRuleCleared(rule, hass),
            )
          : this.configuration.catalog.devices.some(
              device =>
                device.id === alert.deviceId && alertCleared(alert, device, hass, this.configuration?.baseRules),
            ))
      ) {
        alertChanged.add(alert.deviceId);
        this.log.record({
          type: 'resolved',
          alertId: alert.id,
          at: now,
          deviceId: alert.deviceId,
          message: 'Alerta resuelta',
          detail: alert.readingLabel,
        });
        this.unresolved.delete(alert.id);
      }
    for (const alert of alerts) this.unresolved.set(alert.id, alert);
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
        if (
          previous !== undefined &&
          previous !== entity.state &&
          !command &&
          !alertChanged.has(device.id) &&
          isStateEvent(entity)
        )
          this.log.record({
            type: 'state',
            entityId,
            deviceId: device.id,
            deviceLabel: device.display.label,
            at: now,
            value: formattedValue(entity, hass),
          });
        this.previous.set(device.id, entity.state);
      }
    }
    // The visible log is bounded; finished command tracking is bounded too.
    while (this.tracked.size > 100) this.tracked.delete(this.tracked.keys().next().value!);
  }
}
