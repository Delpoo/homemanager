import { resolveAction, type ResolvedGesture } from '../model/gestures.js';
import { t } from '../i18n/index.js';
import { escapeHTML as e, type Device } from './types.js';
import type { HomeManagerCard } from './home-manager-card.js';
import type { TaskScreen } from '../ui/task-screen.js';

/** A phone or tablet: it may use its own app link (#97). */
function mobile(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/** Gestures that leave the plan (#97). Each runs only from a person's own tap or hold. */
export function runOutside(
  card: HomeManagerCard,
  device: Device,
  choice: ResolvedGesture,
  anchor: HTMLElement,
): boolean {
  switch (choice.action) {
    case 'more-info':
      card.dispatchEvent(
        new CustomEvent('hass-more-info', {
          detail: { entityId: device.bindings.entityId },
          bubbles: true,
          composed: true,
        }),
      );
      return true;
    case 'navigate':
      history.pushState(null, '', choice.path);
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
      return true;
    case 'url': {
      const url = mobile() && choice.mobileUrl ? choice.mobileUrl : choice.url;
      // An app that is not installed leaves the page where it was: then use the fallback.
      let left = false;
      const away = () => (left = true);
      document.addEventListener('visibilitychange', away, { once: true });
      window.addEventListener('blur', away, { once: true });
      if (/^https:/i.test(url)) {
        const opened = window.open(url, '_blank', 'noopener,noreferrer');
        if (opened === null && !choice.fallback) left = true;
      } else window.location.href = url;
      setTimeout(() => {
        document.removeEventListener('visibilitychange', away);
        window.removeEventListener('blur', away);
        if (left || !choice.fallback || /^https:/i.test(url)) return;
        card.status(t('No se pudo abrir la app. Se abre la alternativa.'));
        const fallback = resolveAction(
          { action: choice.fallback, ...(choice.fallbackPath ? { path: choice.fallbackPath } : {}) },
          device,
        );
        if (!runOutside(card, device, fallback, anchor))
          card.showDetails(device.id, anchor, fallback.action === 'panel');
      }, 1500);
      return true;
    }
    case 'choose': {
      card.dialog(
        device.display.label,
        `<div class="choices">${choice.options
          .map(
            (option, index) =>
              `<button type="button" data-choice="${index}">${option.icon ? `<ha-icon icon="${e(option.icon)}" aria-hidden="true"></ha-icon> ` : ''}${e(option.label)}</button>`,
          )
          .join('')}</div>`,
        [],
        { side: true },
      );
      const page = [...card.root.querySelectorAll<TaskScreen>('homemanager-task-screen')].at(-1);
      page?.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(button =>
        button.addEventListener('click', () => {
          page.close();
          const picked = resolveAction(choice.options[Number(button.dataset.choice)].do, device);
          if (picked.action === 'control') card.runGesture(device.id, 'tap', anchor, picked);
          else if (!runOutside(card, device, picked, anchor) && picked.action !== 'none')
            card.runGesture(device.id, 'tap', anchor, picked);
        }),
      );
      return true;
    }
    default:
      return false;
  }
}
