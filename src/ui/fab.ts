import { iconButton } from './icon-button.js';
/** Floating action button; include fabStyles and iconButtonStyles in the host. */
export const fab = (command: string, label: string) =>
  `<div class="hm-fab">${iconButton(command, label, 'plus')}</div>`;
export const fabStyles = `.hm-fab{position:absolute;bottom:18px;left:18px;z-index:4}.hm-fab .hm-icon-button{width:56px;height:56px;background:var(--hm-accent);color:var(--hm-on-accent);border:0;box-shadow:var(--hm-shadow)}`;
