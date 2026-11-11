/** 0.13 Automations, as in the approved mockup: When → Do → Check → If it fails.
 *
 * They are ordinary Home Assistant automations (the owner's choice): they run with the
 * app closed and show in HA's own list too. HomeManager keeps what it needs to edit them
 * again inside the automation itself (`variables.homemanager`), and builds the steps HA
 * runs from it. Its id starts with `homemanager_`, so HomeManager only lists its own.
 *
 * Check uses a power reading per appliance: after sending, wait until it drops below (or
 * rises above) a limit; if not, send again, up to N times. A meter with no data stops the
 * resending and does not count as a failure. If it fails, a Home Assistant notification
 * is left with an id HomeManager reads back as an alert on that symbol and in Now; the
 * next run that goes well removes it. */

export const AUTOMATION_PREFIX = 'homemanager_';
/** Notification ids HomeManager reads as "this automation failed on this symbol". */
export const FAILURE_PREFIX = 'homemanager:fail:';
const NO_DATA = "['unavailable','unknown','none','']";

export type AutomationTrigger =
  | { kind: 'time'; at: string }
  | { kind: 'state'; entity: string; to: string }
  | { kind: 'above' | 'below'; entity: string; value: number };

export interface AutomationStep {
  /** The symbol it acts on: names the line and receives the failure alert. */
  deviceId?: string;
  /** A logical action of the plan… */
  actionId?: string;
  /** …or turning the symbol's own entity on or off. */
  entity?: string;
  service?: 'turn_on' | 'turn_off';
  /** The power reading Check watches for this step; none means it is not checked. */
  sensor?: string;
}
export interface AutomationCheck {
  compare: 'below' | 'above';
  watts: number;
  seconds: number;
  retries: number;
}
export interface Automation {
  id: string;
  name: string;
  icon: string;
  triggers: AutomationTrigger[];
  steps: AutomationStep[];
  check: AutomationCheck | null;
  fail: { message: string } | null;
}
interface ServiceAction {
  domain: string;
  service: string;
  target: { entity_id: string | string[] };
  data?: Record<string, unknown>;
}
export type HaAutomationConfig = Record<string, unknown> & {
  id: string;
  alias: string;
  variables?: { homemanager?: unknown };
};

export const DEFAULT_CHECK: AutomationCheck = { compare: 'below', watts: 30, seconds: 60, retries: 3 };

/** A fresh id: readable, and HA's own `homemanager_` prefix. */
export function newAutomationId(name: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const base =
    AUTOMATION_PREFIX +
    (name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'automation');
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
  return id;
}

export function emptyAutomation(id: string, name: string): Automation {
  return { id, name, icon: 'mdi:robot-outline', triggers: [], steps: [], check: null, fail: null };
}

const quote = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
/** The Jinja test "this power reading says it worked". */
export function checkPasses(sensor: string, check: AutomationCheck): string {
  const value = `states(${quote(sensor)})`;
  return check.compare === 'below'
    ? `${value} not in ${NO_DATA} and ${value}|float(0) < ${check.watts}`
    : `${value} not in ${NO_DATA} and ${value}|float(0) > ${check.watts}`;
}

function triggerConfig(trigger: AutomationTrigger): Record<string, unknown> {
  if (trigger.kind === 'time')
    return { trigger: 'time', at: /^\d\d:\d\d$/.test(trigger.at) ? `${trigger.at}:00` : trigger.at };
  if (trigger.kind === 'state') return { trigger: 'state', entity_id: trigger.entity, to: trigger.to };
  return { trigger: 'numeric_state', entity_id: trigger.entity, [trigger.kind]: trigger.value };
}

function stepCall(
  step: AutomationStep,
  actions: Readonly<Record<string, ServiceAction>>,
): Record<string, unknown> | null {
  if (step.actionId) {
    const action = actions[step.actionId];
    if (!action) return null;
    return {
      action: `${action.domain}.${action.service}`,
      target: structuredClone(action.target),
      ...(action.data && Object.keys(action.data).length ? { data: structuredClone(action.data) } : {}),
      continue_on_error: true,
    };
  }
  if (step.entity && step.service)
    return { action: `homeassistant.${step.service}`, target: { entity_id: step.entity }, continue_on_error: true };
  return null;
}

function failureId(automation: Automation, step: AutomationStep, index: number): string {
  return `${FAILURE_PREFIX}${automation.id}:${step.deviceId ?? `step${index}`}`;
}

/** What Home Assistant stores and runs. */
export function toHaConfig(
  automation: Automation,
  actions: Readonly<Record<string, ServiceAction>>,
): HaAutomationConfig {
  const sequence: Record<string, unknown>[] = [];
  automation.steps.forEach((step, index) => {
    const call = stepCall(step, actions);
    if (!call) return;
    const check = automation.check;
    if (!check || !step.sensor) {
      sequence.push(call);
      return;
    }
    const passes = checkPasses(step.sensor, check);
    const sensor = `states(${quote(step.sensor)})`;
    // Send, wait for the reading; send again while it did not work, the meter has data and tries remain.
    sequence.push({
      repeat: {
        sequence: [call, { wait_template: `{{ ${passes} }}`, timeout: { seconds: check.seconds } }],
        until: `{{ (${passes}) or ${sensor} in ${NO_DATA} or repeat.index > ${check.retries} }}`,
      },
    });
    const notification = failureId(automation, step, index);
    sequence.push({
      if: [{ condition: 'template', value_template: `{{ not (${passes}) and ${sensor} not in ${NO_DATA} }}` }],
      then: automation.fail
        ? [
            {
              action: 'persistent_notification.create',
              data: { title: automation.name, message: automation.fail.message, notification_id: notification },
            },
          ]
        : [],
      else: [{ action: 'persistent_notification.dismiss', data: { notification_id: notification } }],
    });
  });
  return {
    id: automation.id,
    alias: automation.name,
    description: 'HomeManager',
    mode: 'single',
    triggers: automation.triggers.map(triggerConfig),
    conditions: [],
    actions: sequence,
    variables: { homemanager: structuredClone(automation) as unknown },
  };
}

/** Reads back what HomeManager stored; anything else is not one of its own. */
export function fromHaConfig(config: unknown): Automation | null {
  if (!config || typeof config !== 'object') return null;
  const record = config as HaAutomationConfig;
  const stored = record.variables?.homemanager as Partial<Automation> | undefined;
  if (
    typeof record.id !== 'string' ||
    !record.id.startsWith(AUTOMATION_PREFIX) ||
    !stored ||
    typeof stored !== 'object'
  )
    return null;
  return {
    id: record.id,
    name: typeof record.alias === 'string' && record.alias ? record.alias : String(stored.name ?? record.id),
    icon: typeof stored.icon === 'string' ? stored.icon : 'mdi:robot-outline',
    triggers: Array.isArray(stored.triggers) ? stored.triggers : [],
    steps: Array.isArray(stored.steps) ? stored.steps : [],
    check: stored.check && typeof stored.check === 'object' ? { ...DEFAULT_CHECK, ...stored.check } : null,
    fail: stored.fail && typeof stored.fail === 'object' ? { message: String(stored.fail.message ?? '') } : null,
  };
}

/** Logical actions an automation sends: Home status must not call them unused. */
export function automationActionIds(automations: readonly Automation[]): Set<string> {
  return new Set(automations.flatMap(item => item.steps.flatMap(step => (step.actionId ? [step.actionId] : []))));
}

/** A failure left by an automation: which one, on which symbol. */
export interface AutomationFailure {
  notificationId: string;
  automationId: string;
  deviceId: string | null;
  title: string;
  message: string;
}
export function parseFailure(notification: {
  notification_id?: unknown;
  title?: unknown;
  message?: unknown;
}): AutomationFailure | null {
  const id = typeof notification.notification_id === 'string' ? notification.notification_id : '';
  if (!id.startsWith(FAILURE_PREFIX)) return null;
  const rest = id.slice(FAILURE_PREFIX.length);
  const split = rest.indexOf(':');
  if (split < 1) return null;
  const device = rest.slice(split + 1);
  return {
    notificationId: id,
    automationId: rest.slice(0, split),
    deviceId: device && !/^step\d+$/.test(device) ? device : null,
    title: typeof notification.title === 'string' ? notification.title : '',
    message: typeof notification.message === 'string' ? notification.message : '',
  };
}

/** The short chips under a name in the list: how it starts. */
export function triggerChips(
  automation: Automation,
  pinned: boolean,
  nameOf: (entity: string) => string,
): { icon: string; text: string }[] {
  const chips: { icon: string; text: string }[] = [];
  if (pinned) chips.push({ icon: 'mdi:gesture-tap', text: 'Botón en Ahora' });
  for (const trigger of automation.triggers) {
    if (trigger.kind === 'time') chips.push({ icon: 'mdi:clock-outline', text: trigger.at.slice(0, 5) });
    else if (trigger.kind === 'state')
      chips.push({ icon: 'mdi:toggle-switch-outline', text: `${nameOf(trigger.entity)} · ${trigger.to}` });
    else
      chips.push({
        icon: trigger.kind === 'above' ? 'mdi:greater-than' : 'mdi:less-than',
        text: `${nameOf(trigger.entity)} ${trigger.kind === 'above' ? '>' : '<'} ${trigger.value}`,
      });
  }
  return chips;
}
