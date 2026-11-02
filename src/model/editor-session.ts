interface EditableSnapshot {
  catalog: { devices: { id: string }[] };
  stateSources: Record<string, unknown>;
}

/** Revert this device only; edits to other devices and reusable actions remain. */
export function restoreEditedDevice<T extends EditableSnapshot>(current: T, opened: T, id: string): T {
  const next = structuredClone(current);
  const original = opened.catalog.devices.find(device => device.id === id);
  const index = next.catalog.devices.findIndex(device => device.id === id);
  if (original && index >= 0) next.catalog.devices[index] = structuredClone(original);
  else if (original) next.catalog.devices.push(structuredClone(original));
  else if (index >= 0) next.catalog.devices.splice(index, 1);
  if (opened.stateSources[id]) next.stateSources[id] = structuredClone(opened.stateSources[id]);
  else delete next.stateSources[id];
  return next;
}

/** Keep the current zoom and centre the chosen point in the unobscured plan. */
export function cameraForEditedDevice(
  camera: { x: number; y: number; scale: number },
  box: { x: number; y: number; width: number; height: number },
  position: { x: number; y: number },
  viewport: { width: number; height: number; coveredBottom: number },
): { x: number; y: number; scale: number } {
  const visibleHeight = Math.max(0, viewport.height - viewport.coveredBottom);
  return {
    scale: camera.scale,
    x: viewport.width / 2 - (box.x + position.x * box.width) * camera.scale,
    y: visibleHeight / 2 - (box.y + position.y * box.height) * camera.scale,
  };
}
