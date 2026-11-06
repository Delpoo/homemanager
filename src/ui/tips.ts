/** Hover help (0.13): every control names itself in a small bubble when the pointer
 * rests on it, from its `title`. The bubble can be turned off in Appearance; the native
 * tooltip is held back meanwhile so the two never show together. Touch has no hover:
 * nothing changes there. The title comes back when the pointer leaves, so it stays the
 * element's description for everything else that reads it. */

const KEY = 'homemanager:tips';
export function tipsOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setTips(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* the default stays */
  }
  hide();
}

let bubble: HTMLDivElement | undefined;
let held: { element: Element; title: string } | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

const STYLE = `.hm-tip{position:fixed;z-index:2147483647;max-width:260px;padding:6px 10px;border-radius:8px;background:#1F2A24;color:#F4F5F0;font:500 12.5px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.2);opacity:0;transform:translateY(-2px);transition:opacity .12s,transform .12s}.hm-tip[data-shown]{opacity:1;transform:none}@media(prefers-color-scheme:dark){.hm-tip{background:#E8ECE6;color:#121714}}`;

function host(): Element {
  // In full screen only the full-screen element is drawn.
  return document.fullscreenElement ?? document.body;
}
function hide(): void {
  clearTimeout(timer);
  if (held) {
    if (!held.element.hasAttribute('title')) held.element.setAttribute('title', held.title);
    held = undefined;
  }
  if (bubble) {
    bubble.removeAttribute('data-shown');
    bubble.hidden = true;
  }
}
function show(element: Element, text: string): void {
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'hm-tip';
    bubble.setAttribute('role', 'tooltip');
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.append(style);
  }
  if (bubble.parentElement !== host()) host().append(bubble);
  bubble.textContent = text;
  bubble.hidden = false;
  const box = element.getBoundingClientRect();
  const tip = bubble.getBoundingClientRect();
  const below = box.bottom + 8 + tip.height < innerHeight;
  const left = Math.max(6, Math.min(innerWidth - tip.width - 6, box.left + box.width / 2 - tip.width / 2));
  bubble.style.left = `${left}px`;
  bubble.style.top = `${below ? box.bottom + 8 : Math.max(6, box.top - tip.height - 8)}px`;
  bubble.setAttribute('data-shown', '');
}

function over(event: PointerEvent): void {
  if (event.pointerType === 'touch') return;
  const element = event
    .composedPath()
    .find((node): node is Element => node instanceof Element && node.hasAttribute('title'));
  if (!element || element === held?.element) return;
  hide();
  const title = element.getAttribute('title') ?? '';
  if (!title.trim()) return;
  // The native tooltip waits on the title: hold it back while the pointer is here.
  held = { element, title };
  element.removeAttribute('title');
  if (!element.hasAttribute('aria-label') && !element.textContent?.trim()) element.setAttribute('aria-label', title);
  if (tipsOn()) timer = setTimeout(() => held?.element === element && show(element, title), 450);
}
function out(event: PointerEvent): void {
  if (!held) return;
  const to = event.relatedTarget as Node | null;
  if (to && (held.element.contains(to) || held.element.shadowRoot?.contains(to))) return;
  hide();
}

let installed = false;
/** Once per page; every card and panel shares it. */
export function installTips(): void {
  if (installed) return;
  installed = true;
  document.addEventListener('pointerover', over, true);
  document.addEventListener('pointerout', out, true);
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('scroll', hide, true);
  document.addEventListener('keydown', hide, true);
  // The switch in Appearance, wherever it is drawn.
  document.addEventListener(
    'change',
    event => {
      const target = event.composedPath()[0];
      if (target instanceof HTMLInputElement && target.hasAttribute('data-tips')) setTips(target.checked);
    },
    true,
  );
}
