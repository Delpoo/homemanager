import { HomeManagerCard } from './home-manager-card.js';
import '../editor/index.js';
// The sidebar panel registered by the HomeManager integration shares this bundle.
import '../app/index.js';
if (!customElements.get('homemanager-card')) customElements.define('homemanager-card', HomeManagerCard);
const target = window as unknown as {
  customCards?: { type: string; name: string; description: string; preview: boolean }[];
};
target.customCards ??= [];
if (!target.customCards.some(c => c.type === 'homemanager-card'))
  target.customCards.push({
    type: 'homemanager-card',
    name: 'HomeManager',
    description: 'Plano vectorial con editor visual y paneles nativos.',
    preview: false,
  });
export { HomeManagerCard };
