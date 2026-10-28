import type { AdapterOptions, Configuration, Hass, RuntimeState, ActionResult, Availability } from './types.ts';
export class HomeAssistantAdapter {
  constructor(options: AdapterOptions);
  readonly configuration: Configuration;
  readonly lastObserverError: string | null;
  configure(configuration: Configuration): void;
  setHass(hass: Hass | null | undefined): void;
  subscribe(callback: (snapshot: RuntimeState) => void): () => void;
  getSnapshot(): RuntimeState;
  getActionAvailability(actionId: string): Availability;
  executeAction(actionId: string, deviceId?: string): Promise<ActionResult>;
  executePrimary(deviceId: string): Promise<ActionResult>;
  getEntityCommandAvailability(
    deviceId: string,
    command: { service: string; data?: Record<string, unknown> },
  ): Availability;
  executeEntityCommand(
    deviceId: string,
    command: { service: string; data?: Record<string, unknown> },
  ): Promise<ActionResult>;
  dispose(): void;
}
