# Home Assistant session adapter

Generic HomeManager code lives in `src/ha/`; household configuration belongs in a separate private instance repository. This module contains no plan, device inventory, entity bindings, credentials, radio captures or deployment configuration. It neither opens a connection nor installs a backend.

The implementation follows [contract V1](contract.md) and the three committed JSON Schemas. Browser Mod is excluded from HomeManager. Native panels invoke logical actions through this adapter. Existing popups, scripts and radio logic in HA are outside this module and remain untouched.

## Frontend API

Import from `src/ha/index.ts` (a TypeScript bundler may resolve `index.js` to this source). It reexports the shared `Configuration`, `Hass`, `RuntimeState`, `ActionResult`, `Availability` and script-signature types. Implementations are ES modules with adjacent declarations; there is no runtime npm dependency.

```ts
const adapter = new HomeAssistantAdapter({ configuration });
const unsubscribe = adapter.subscribe(runtime => consumeRuntime(runtime));

// Inside the card's hass setter:
adapter.setHass(hass);

const availability = adapter.getActionAvailability(actionId);
if (availability.available) await adapter.executeAction(actionId, deviceId);
// A primary control can use await adapter.executePrimary(deviceId).

adapter.configure(nextConfiguration); // validates data; executes no action
unsubscribe();
adapter.dispose();
```

`consumeRuntime` is the frontend's callback, not a provided renderer. Runtime is exactly `{schemaVersion:1,states:{[deviceId]:{value,confidence,observedAt,sourceEntityId,command}}}`. The card overlays these states by ID and retains its separate editing draft. It must not call `setConfig` for every state update or merge runtime into durable configuration. `subscribe` emits immediately and returns cleanup. Observer exceptions are isolated from service outcomes.

`setHass` consumes HA's existing session object; ordinary replacements of that object do not invalidate an in-flight request if the connection/user are unchanged. Disconnect, reconnect, account change, `configure` and `dispose` invalidate old responses and clear pending command evidence. Connection listeners and expiry timers are removed when no longer needed. HA sends subsequent state through its normal card setter; there is no polling or separate REST client.

`executeAction` returns `{ok:true,status:'sent'}` when HA accepts a service request, or `{ok:false,reason}`. Reason codes are bounded safe identifiers; raw service errors are not copied to runtime or persisted configuration. A double click or another action on the same device cannot start a concurrent command. An explicit `deviceId` must actually bind that action, either as primary action or via its native panel.

## Configuration validation and pending bindings

`assertConfiguration` validates the durable envelope, strict catalog V1, types, normalized coordinates, unknown-only persisted state, action definitions, panel/control rules, source IDs and bounds. It rejects duplicate IDs, accessors, hidden fields, unsafe keys, cycles, sparse arrays and nonfinite numbers. The whole input is limited to 8 MiB; inline SVG is separately limited to 1 MiB UTF-8.

`inspectConfiguration` returns structured errors and pending references. Missing action/panel/control references may be retained as explicitly disabled pending items, as the editor contract requires. `assertConfiguration(value,{allowPending:false})` rejects them for a strict completed-configuration review. JSON Schema alone cannot enforce these cross references.

**SVG sanitization is a separate frontend boundary.** This module checks the architecture envelope and byte limit, not XML safety or region geometry. The card/editor must parse and sanitize the SVG both on import and before rendering, with the allowed profile described in contract V1. Never render data merely because `assertConfiguration` accepted its envelope. Persisted states must always be `unknown/unknown`; imported prior readings never become physical truth.

## Allowed HA actions

`assertActionDefinition` is a pure static guard. Only the domain/service pairs in the configuration schema are accepted: `light`, `fan`, `cover`, `climate`, `switch`, `button`, and `script.turn_on`. Destinations are explicit `target.entity_id` strings or unique lists of 1–20 entities with the matching domain. Broad targets, areas, devices, targets inside `data`, arbitrary services and raw transport data are rejected.

Data uses a deliberately bounded supported subset of each service: typed fields, at most 8192 UTF-8 bytes, nesting depth 10, strings up to 1024 characters, and bounded arrays/maps. Unknown service fields and executable template/code patterns fail closed. Data is never evaluated, interpolated or fetched from a URL. Adding another service or data field requires code and tests; the UI cannot widen the allowlist through an event payload.

`getActionAvailability` also checks the current session's service registry, entity existence/availability, capability flags and supported values/ranges for the requested operation. It returns `{available:false,reason}` when a control is unresolved or unsupported. `executeService` repeats these checks immediately before calling:

```ts
await hass.callService(action.domain, action.service, action.data ?? {}, action.target);
```

The current HA session remains the authority for actual execution permissions. An enabled frontend control does not prove permission; HA rejection stays an error and preserves configuration/drafts. The adapter does not send credentials or claim that frontend validation is an access-control boundary.

## Script signatures and RF panels

`discoverScriptSignatures(hass)` reads the current per-script service declarations in `hass.services.script`. The generic `turn_on.variables` schema is insufficient. Supported selectors are bounded scalar text, boolean, number and finite single-select options. An unsupported selector, ambiguous field or unsafe data definition leaves that script disabled.

Discovered signature objects carry module-private provenance linked to the actual registry declaration and its field fingerprint. Keep their identity: do not clone, serialize, import or persist them. A hand-written `{verified:true}` is not accepted as proof. Replaced or changed registry declarations invalidate old signatures. By default the adapter discovers current signatures when checking/executing; an optional `scriptSignatures` map must contain objects returned by this discovery helper and must be refreshed after a registry change.

This verification concerns the declared parameter structure. It does not verify physical RF behavior, default script effects or independent feedback. The user must still select the intended HA script and review its existing behavior. Native `rf-fan` panel controls can only reference explicit `script.turn_on` actions; radio bytes, protocol timings and transmitter selection remain inside the user's existing HA logic. No existing script is rewritten by choosing or executing a binding.

## Runtime evidence and TTL

Default TTL is 30 seconds; `commandTtlSeconds` accepts integers 1–300. Each command captures `issuedAt`, `expiresAt` and `baselineLastUpdated` before calling HA. A service acknowledgement yields `sent`; failure yields `error`. Both are transient API evidence and never prove emission, reception or physical execution. Once expired without fresh measured feedback, the display becomes `unknown`; a stale reading cannot revive confirmation.

A value only becomes `confirmed` when all of these hold:

- A configured source has `feedback:'measured'` and its entity is also in the runtime option `verifiedFeedbackEntities`, supplied after independent verification of that source. Configuration text alone is insufficient.
- The entity does not have `assumed_state:true`, the scalar value is valid, and its timestamp is a real, nonfuture HA `last_updated` value.
- After a command, that timestamp is later than `issuedAt` and differs from the captured baseline.

This confirms the reading, not causal responsibility for a command. Defaults are conservative: a simple bound entity or an unverified measured declaration is estimated; a transmitter source never confirms a receiver. Missing/unknown/unavailable data, invalid timestamps or disconnect produce unknown. No toggle state is inferred from an RF button. Long/empty/structured readings do not escape the shared runtime schema.

`verifiedFeedbackEntities` belongs to the current verified integration context, not the public source or an invented fixture list. A deployment may supply it after checking its actual integrations. Without it, HomeManager can still display valid HA readings as estimates. The editor must not equate selecting the word measured with verifying independence.

## Persistence decision

No Python custom integration is included. The approved product scope uses one active administrator editor and an authenticated Lovelace storage dashboard; native HA APIs already provide the needed shared durable document. The frontend owns its editor/storage adapter and uses `config-changed` plus explicit dashboard save where possible.

For direct storage writes, the frontend must read the current dashboard, uniquely identify the target card, check observed changes before writing, preserve unrelated cards, await HA acceptance and verify readback before showing success. It must retain drafts on error/conflict and never fall back silently to browser storage. YAML dashboards are read-only for this flow. HA's whole-dashboard save has no atomic cross-client CAS: double reads reduce detectable conflicts but leave a race. Single-editor operation and that residual risk must be visible. Reconsider a backend only if transactional concurrent writers or delegated nonadministrator writes become explicit requirements.

Keep the SVG and configuration inside the authenticated dashboard document. Do not publish household data under static frontend assets. This storage choice does not isolate data from other HA users who can read the dashboard.

## Validation and integration status

All tests in `tests/ha/` use synthetic entities, scripts, geometry and service registries. Run locked dependencies with `npm ci --ignore-scripts`, then `npm run check`, `node --test tests/ha/*.test.mjs`, and `npm run build`. The build in this branch still produces foundation artifacts; the frontend branch owns the final card bundle. Shared types and runtime snapshots are checked against the committed schemas.

There has been no installation or test against a real Home Assistant instance or radio device. The integrator must verify session permissions, real entity/service availability, parameter selectors, feedback independence, expiration/reconnect behavior and explicit dashboard saves before release. This PR introduces no deployment automation or release.

Technical sources reviewed for this implementation: [hass object and callService](https://contributors.home-assistant.io/frontend/reference/hass-object/), [HA Core 2026.10.4 Lovelace storage implementation](https://github.com/home-assistant/core/blob/2026.10.4/homeassistant/components/lovelace/dashboard.py), [fan feature constants](https://github.com/home-assistant/core/blob/2026.10.4/homeassistant/components/fan/__init__.py), [cover features](https://github.com/home-assistant/core/blob/2026.10.4/homeassistant/components/cover/__init__.py), [climate features](https://github.com/home-assistant/core/blob/2026.10.4/homeassistant/components/climate/const.py), and [light features](https://github.com/home-assistant/core/blob/2026.10.4/homeassistant/components/light/const.py). Recheck compatibility with the installed HA version during integration.
