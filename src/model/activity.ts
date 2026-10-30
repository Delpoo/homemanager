import { finiteNumber, type ModelEntity } from './types.js';

/** The log is local to one application. No timers, DOM, HA services or global store. */
export type CommandStatus = 'sent' | 'on_air' | 'confirmed' | 'error';
export type ActivityTone = 'neutral' | 'ok' | 'alert' | 'warning';
export const COMMAND_TEXT: Record<CommandStatus, string> = {
  sent: 'Enviado',
  on_air: 'en el aire',
  confirmed: 'confirmado',
  error: 'No se pudo enviar',
};
export interface ConfirmationEvidence {
  feedback: 'measured' | 'optimistic' | 'transmitter';
  verified: boolean;
  observedAt: string;
  baselineLastUpdated?: string | null;
}
interface ActivityBase {
  at: number;
  deviceId?: string;
  deviceLabel?: string;
  actionLabel?: string;
}
export type ActivityEvent = ActivityBase &
  (
    | {
        type: 'command';
        commandId: string;
        status: CommandStatus;
        issuedAt?: number;
        evidence?: ConfirmationEvidence;
        detail?: string;
      }
    | { type: 'expired'; commandId: string }
    | { type: 'alert' | 'resolved'; alertId: string; message: string; level?: 'critical' | 'warning'; detail?: string }
    | { type: 'state'; entityId: string; value: string; message?: string }
    | { type: 'saved'; id: string }
  );
export interface ActivityEntry {
  id: string;
  type: 'command' | 'alert' | 'resolved' | 'state' | 'saved';
  at: number;
  updatedAt: number;
  deviceId?: string;
  deviceLabel?: string;
  actionLabel?: string;
  status?: CommandStatus;
  issuedAt?: number;
  expired?: boolean;
  /** A source key, translated by the view. Never contains a Unicode status icon. */
  message: string;
  detail?: string;
  value?: string;
  tone: ActivityTone;
}
const LIMIT = 50;

/** A meter changes all the time, and that is not news: only a change such as open or closed earns a row. */
export function isStateEvent(entity: ModelEntity): boolean {
  const attributes = entity.attributes ?? {};
  if (attributes.unit_of_measurement !== undefined || attributes.state_class !== undefined) return false;
  if (attributes.device_class === 'timestamp' || /^\d{4}-\d{2}-\d{2}/.test(entity.state)) return false;
  if (['unknown', 'unavailable'].includes(entity.state)) return false;
  return finiteNumber(entity.state) === null;
}
const eventId = (event: ActivityEvent): string => {
  const device = event.deviceId ?? '';
  if (event.type === 'command' || event.type === 'expired') return `command:${device}:${event.commandId}`;
  if (event.type === 'alert' || event.type === 'resolved') return `${event.type}:${event.alertId}`;
  if (event.type === 'state') return `state:${device}:${event.entityId}:${event.at}`;
  return event.type === 'saved' ? `saved:${event.id}` : '';
};

/** A confirmation must be independently measured and newer than the command and its baseline. */
function confirms(event: Extract<ActivityEvent, { type: 'command' }>, previous?: ActivityEntry): boolean {
  const evidence = event.evidence;
  const observed = Date.parse(evidence?.observedAt ?? '');
  const baseline = evidence?.baselineLastUpdated ? Date.parse(evidence.baselineLastUpdated) : null;
  const issued = previous?.issuedAt ?? event.issuedAt;
  return (
    evidence?.feedback === 'measured' &&
    evidence.verified === true &&
    issued !== undefined &&
    Number.isFinite(issued) &&
    Number.isFinite(observed) &&
    observed > issued &&
    observed <= event.at &&
    (baseline === null || (Number.isFinite(baseline) && observed > baseline))
  );
}

/** Immutable reducer: one command keeps its identity, original timestamp and history position. */
export function reduceActivity(entries: readonly ActivityEntry[], event: ActivityEvent): ActivityEntry[] {
  if (!Number.isFinite(event.at)) return entries.slice();
  const id = eventId(event);
  const index = entries.findIndex(entry => entry.id === id);
  const previous = entries[index];
  if (previous && event.at < previous.updatedAt) return entries.slice();
  if (event.type === 'expired') {
    if (!previous || previous.status === 'confirmed' || previous.status === 'error' || previous.expired)
      return entries.slice();
    return entries.map((entry, position) =>
      position === index ? { ...entry, expired: true, updatedAt: event.at } : entry,
    );
  }
  let entry: ActivityEntry;
  const base = {
    id,
    at: previous?.at ?? event.at,
    updatedAt: event.at,
    ...(event.deviceId ? { deviceId: event.deviceId } : previous?.deviceId ? { deviceId: previous.deviceId } : {}),
    ...(event.deviceLabel
      ? { deviceLabel: event.deviceLabel }
      : previous?.deviceLabel
        ? { deviceLabel: previous.deviceLabel }
        : {}),
    ...(event.actionLabel
      ? { actionLabel: event.actionLabel }
      : previous?.actionLabel
        ? { actionLabel: previous.actionLabel }
        : {}),
  };
  if (event.type === 'command') {
    if (previous?.status === 'confirmed' || previous?.status === 'error' || previous?.expired) return entries.slice();
    if (event.status === 'confirmed' && (!previous || !confirms(event, previous))) return entries.slice();
    // An RF echo without a known command cannot invent a send, and late accepted-service events cannot demote it.
    if (event.status === 'on_air' && !previous) return entries.slice();
    if (event.status === 'sent' && previous?.status === 'on_air') return entries.slice();
    if (previous?.status === event.status && (!event.detail || event.detail === previous.detail))
      return entries.slice();
    entry = {
      ...base,
      type: 'command',
      status: event.status,
      issuedAt: previous?.issuedAt ?? event.issuedAt ?? event.at,
      message: COMMAND_TEXT[event.status],
      tone: event.status === 'confirmed' ? 'ok' : event.status === 'error' ? 'alert' : 'neutral',
      ...(event.detail ? { detail: event.detail } : previous?.detail ? { detail: previous.detail } : {}),
    };
  } else if (event.type === 'alert' || event.type === 'resolved') {
    entry = {
      ...base,
      type: event.type,
      message: event.message,
      ...(event.detail ? { detail: event.detail } : {}),
      tone: event.type === 'resolved' ? 'ok' : event.level === 'warning' ? 'warning' : 'alert',
    };
  } else if (event.type === 'state') {
    // Observation is separate from command confirmation; a state event has no status field.
    entry = {
      ...base,
      type: 'state',
      message: event.message ?? 'Estado actualizado',
      value: event.value,
      tone: 'neutral',
    };
  } else entry = { ...base, type: 'saved', message: 'Plano guardado', tone: 'neutral' };
  return (index < 0 ? [...entries, entry] : entries.map((old, position) => (position === index ? entry : old))).slice(
    -LIMIT,
  );
}

export function latestActivity(entries: readonly ActivityEntry[]): ActivityEntry | null {
  return entries.reduce<ActivityEntry | null>(
    (latest, entry) => (!latest || entry.updatedAt >= latest.updatedAt ? entry : latest),
    null,
  );
}
export function activityIsRecent(entry: ActivityEntry, now: number): boolean {
  return now >= entry.updatedAt && now - entry.updatedAt < 6000;
}

/** A small observable wrapper around the reducer. Consumers own subscription lifetimes. */
export class ActivityLog {
  private records: ActivityEntry[] = [];
  private observers = new Set<(entries: readonly ActivityEntry[]) => void>();
  get entries(): ActivityEntry[] {
    return this.records.map(entry => ({ ...entry }));
  }
  get latest(): ActivityEntry | null {
    const latest = latestActivity(this.records);
    return latest ? { ...latest } : null;
  }
  record(event: ActivityEvent): void {
    const next = reduceActivity(this.records, event);
    if (next.length === this.records.length && next.every((entry, index) => entry === this.records[index])) return;
    this.records = next;
    for (const observer of this.observers) {
      try {
        observer(this.entries);
      } catch {
        /* A view failure never changes an accepted command. */
      }
    }
  }
  subscribe(observer: (entries: readonly ActivityEntry[]) => void): () => void {
    this.observers.add(observer);
    observer(this.entries);
    return () => {
      this.observers.delete(observer);
    };
  }
  clear(): void {
    this.records = [];
    for (const observer of this.observers) {
      try {
        observer(this.entries);
      } catch {
        /* Observer errors cannot retain stale records. */
      }
    }
  }
}
