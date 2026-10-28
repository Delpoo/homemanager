import { assertConfiguration } from './validation.mjs';
import { getActionAvailability as actionAvailability, executeService, discoverScriptSignatures } from './actions.mjs';

const own = (value, key) => Object.hasOwn(value, key);
const clone = value => structuredClone(value);
const ENTITY_ID = /^[a-z][a-z0-9_]*\.[a-z0-9_]+$/;
const REASON = /^[a-z0-9_-]{1,80}$/;
const UNKNOWN = Object.freeze({ value: 'unknown', confidence: 'unknown', observedAt: null, sourceEntityId: null, command: null });

/** Preserve the original HA timestamp for baseline comparison, but accept only
 * complete timestamps with real calendar dates. Invalid values are not evidence.
 */
function timestamp(value) {
  if (typeof value !== 'string' || value.length > 40) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = +yearText, month = +monthText, day = +dayText;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || +hourText > 23 || +minuteText > 59 || +secondText > 59) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? { value, milliseconds } : null;
}

function reading(value) {
  if (!['string', 'boolean', 'number'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) return null;
  const text = String(value);
  return text.trim() && text.length <= 240 && !['unknown', 'unavailable'].includes(text) ? text : null;
}

function feedbackSet(values) {
  if (values === undefined) return new Set();
  if (values === null || typeof values === 'string' || typeof values[Symbol.iterator] !== 'function') throw new TypeError('verifiedFeedbackEntities must be an iterable of entity IDs');
  const result = new Set();
  for (const value of values) {
    if (typeof value !== 'string' || !ENTITY_ID.test(value) || value.length > 240 || value.endsWith('.all')) throw new TypeError('Invalid verified feedback entity');
    result.add(value);
  }
  return result;
}

/** An adapter for the current authenticated HA session. It has no independent
 * connection, credentials, renderer, persistence, or execution outside HA.
 */
export class HomeAssistantAdapter {
  constructor({ configuration, verifiedFeedbackEntities, scriptSignatures, now = () => Date.now() }) {
    if (typeof now !== 'function') throw new TypeError('now must be a function');
    this._now = now;
    this._feedback = feedbackSet(verifiedFeedbackEntities);
    // Discovered signatures carry module-private registry proof and must retain identity.
    this._scriptSignatures = scriptSignatures;
    this._hass = null;
    this._online = false;
    this._epoch = 0;
    this._sequence = 0;
    this._commands = new Map();
    this._inFlight = new Map();
    this._listeners = new Set();
    this._connectionListeners = [];
    this._expiryTimer = null;
    this._disposed = false;
    this.lastObserverError = null;
    this._configuration = assertConfiguration(configuration, { allowPending: true });
  }

  get configuration() { return clone(this._configuration); }

  _live() { if (this._disposed) throw new Error('adapter-disposed'); }

  _time() {
    const value = this._now();
    if (!Number.isFinite(value) || Math.abs(value) > 8_639_999_999_000_000) throw new Error('invalid-clock');
    return Math.floor(value);
  }

  _clearRuntime() {
    ++this._epoch;
    this._commands.clear();
    this._inFlight.clear();
    if (this._expiryTimer !== null) clearTimeout(this._expiryTimer);
    this._expiryTimer = null;
  }

  _detachConnection() {
    for (const [connection, event, callback] of this._connectionListeners) connection.removeEventListener?.(event, callback);
    this._connectionListeners = [];
  }

  _attachConnection(connection) {
    this._detachConnection();
    if (!connection?.addEventListener) return;
    // On ready, wait for the next hass setter carrying the rebuilt state cache.
    const reset = () => {
      if (this._disposed) return;
      this._online = false;
      this._clearRuntime();
      this._publish();
    };
    for (const event of ['disconnected', 'ready']) {
      connection.addEventListener(event, reset);
      this._connectionListeners.push([connection, event, reset]);
    }
  }

  configure(configuration) {
    this._live();
    const validated = assertConfiguration(configuration, { allowPending: true });
    this._clearRuntime();
    this._configuration = validated;
    this._publish();
  }

  setHass(hass) {
    this._live();
    const next = hass ?? null;
    const online = !!next && next.connected !== false && typeof next.callService === 'function';
    const connectionChanged = next?.connection !== this._hass?.connection;
    const userChanged = next?.user?.id !== this._hass?.user?.id;
    if (connectionChanged || userChanged || online !== this._online) this._clearRuntime();
    if (connectionChanged) this._attachConnection(next?.connection);
    this._hass = next;
    this._online = online;
    this._publish();
  }

  _source(device) {
    if (own(this._configuration.stateSources, device.id)) return this._configuration.stateSources[device.id];
    return device.bindings.entityId ? { entityId: device.bindings.entityId, attribute: null, feedback: 'optimistic' } : null;
  }

  _resolve(device, now) {
    const source = this._source(device);
    const empty = { ...UNKNOWN, sourceEntityId: source?.entityId ?? null };
    if (!this._online) return empty;
    const entity = source && own(this._hass.states ?? {}, source.entityId) ? this._hass.states[source.entityId] : null;
    const entityValue = entity ? reading(entity.state) : null;
    const raw = entityValue !== null ? (source.attribute === null ? entity.state : (own(entity.attributes ?? {}, source.attribute) ? entity.attributes[source.attribute] : undefined)) : undefined;
    const value = reading(raw);
    const observed = entity && timestamp(entity.last_updated);
    const usable = value !== null && observed && observed.milliseconds <= now;
    const measured = source?.feedback === 'measured' && this._feedback.has(source.entityId) && entity?.attributes?.assumed_state !== true;
    const command = this._commands.get(device.id);
    const fresh = usable && measured && (!command || (observed.milliseconds > command.issuedAtMs && observed.value !== command.baselineLastUpdated));
    if (command && !fresh) {
      if (now < command.expiresAtMs) return { ...empty, confidence: command.status, command: this._publicCommand(command) };
      // Retain the in-memory baseline tombstone until reconnect/configure. Without
      // it, an old reading could incorrectly revive confirmation after expiry.
      return empty;
    }
    if (!usable || source.feedback === 'transmitter') return empty;
    return { value, confidence: measured ? 'confirmed' : 'estimated', observedAt: observed.value, sourceEntityId: source.entityId, command: null };
  }

  _publicCommand(command) {
    return {
      id: command.id, actionId: command.actionId,
      issuedAt: new Date(command.issuedAtMs).toISOString(), expiresAt: new Date(command.expiresAtMs).toISOString(),
      baselineLastUpdated: command.baselineLastUpdated, status: command.status,
    };
  }

  getSnapshot() {
    const now = this._time();
    const states = Object.create(null);
    for (const device of this._configuration.catalog.devices) states[device.id] = this._resolve(device, now);
    return { schemaVersion: 1, states };
  }

  _notify(callback, snapshot) {
    try { callback(clone(snapshot)); } catch (error) {
      // Rendering cannot convert accepted services into reported transport errors.
      this.lastObserverError = error instanceof Error ? error.message : String(error);
    }
  }

  subscribe(callback) {
    this._live();
    if (typeof callback !== 'function') throw new TypeError('A callback is required');
    this._listeners.add(callback);
    this._notify(callback, this.getSnapshot());
    return () => this._listeners.delete(callback);
  }

  _publish() {
    const snapshot = this.getSnapshot();
    for (const callback of this._listeners) this._notify(callback, snapshot);
  }

  _verification() {
    return { scriptSignatures: this._scriptSignatures ?? discoverScriptSignatures(this._hass) };
  }

  getActionAvailability(actionId) {
    if (this._disposed) return { available: false, reason: 'adapter-disposed' };
    if (typeof actionId !== 'string' || !own(this._configuration.actions, actionId)) return { available: false, reason: 'unbound-action' };
    if (!this._online) return { available: false, reason: 'ha-unavailable' };
    if (this._inFlight.has(actionId)) return { available: false, reason: 'action-in-flight' };
    return actionAvailability(this._configuration.actions[actionId], this._hass, this._verification());
  }

  _matches(device, actionId) {
    if (device.bindings.primaryAction === actionId) return true;
    const panelId = device.bindings.advancedPopupId;
    const panel = panelId && own(this._configuration.panels, panelId) ? this._configuration.panels[panelId] : null;
    return !!panel?.controls.some(control => control.actionId === actionId);
  }

  _context() { return { epoch: this._epoch, connection: this._hass?.connection, userId: this._hass?.user?.id }; }
  _contextValid(context) { return !this._disposed && this._online && context.epoch === this._epoch && context.connection === this._hass?.connection && context.userId === this._hass?.user?.id; }

  _scheduleExpiry() {
    if (this._expiryTimer !== null) clearTimeout(this._expiryTimer);
    this._expiryTimer = null;
    const now = this._time();
    const future = [...this._commands.values()].map(command => command.expiresAtMs).filter(expiry => expiry > now);
    if (!future.length) return;
    this._expiryTimer = setTimeout(() => {
      this._expiryTimer = null;
      if (!this._disposed) { this._publish(); this._scheduleExpiry(); }
    }, Math.min(...future) - now + 1);
    this._expiryTimer.unref?.();
  }

  async executePrimary(deviceId) {
    if (this._disposed) return { ok: false, reason: 'adapter-disposed' };
    const device = this._configuration.catalog.devices.find(device => device.id === deviceId);
    if (!device) return { ok: false, reason: 'unknown-device' };
    return device.bindings.primaryAction ? this.executeAction(device.bindings.primaryAction, deviceId) : { ok: false, reason: 'unbound-action' };
  }

  async executeAction(actionId, deviceId) {
    const availability = this.getActionAvailability(actionId);
    if (!availability.available) return { ok: false, reason: availability.reason ?? 'action-unavailable' };
    let affected = this._configuration.catalog.devices.filter(device => this._matches(device, actionId));
    if (deviceId !== undefined) {
      const device = this._configuration.catalog.devices.find(device => device.id === deviceId);
      if (!device) return { ok: false, reason: 'unknown-device' };
      if (!this._matches(device, actionId)) return { ok: false, reason: 'action-not-bound-to-device' };
      affected = [device];
    }
    const busy = new Set([...this._inFlight.values()].flatMap(item => item.deviceIds));
    if (affected.some(device => busy.has(device.id))) return { ok: false, reason: 'device-busy' };
    const context = this._context();
    const issuedAtMs = this._time();
    const expiresAtMs = issuedAtMs + (this._configuration.commandTtlSeconds ?? 30) * 1000;
    const commands = affected.map(device => {
      const source = this._source(device);
      const baseline = source ? timestamp(this._hass.states?.[source.entityId]?.last_updated) : null;
      return [device.id, { id: `command-${++this._sequence}`, actionId, issuedAtMs, expiresAtMs, baselineLastUpdated: baseline?.value ?? null }];
    });
    const pending = { context, deviceIds: affected.map(device => device.id) };
    this._inFlight.set(actionId, pending);
    try {
      await executeService(this._configuration.actions[actionId], this._hass, this._verification());
      if (!this._contextValid(context)) return { ok: false, reason: 'stale-context' };
      for (const [id, command] of commands) this._commands.set(id, { ...command, status: 'sent' });
      this._scheduleExpiry();
      this._publish();
      return { ok: true, status: 'sent' };
    } catch (error) {
      if (!this._contextValid(context)) return { ok: false, reason: 'stale-context' };
      for (const [id, command] of commands) this._commands.set(id, { ...command, status: 'error' });
      this._scheduleExpiry();
      this._publish();
      return { ok: false, reason: typeof error?.code === 'string' && REASON.test(error.code) ? error.code : 'service-error' };
    } finally {
      if (this._inFlight.get(actionId) === pending) this._inFlight.delete(actionId);
    }
  }

  dispose() {
    if (this._disposed) return;
    this._clearRuntime();
    this._detachConnection();
    this._listeners.clear();
    this._hass = null;
    this._online = false;
    this._disposed = true;
  }
}
