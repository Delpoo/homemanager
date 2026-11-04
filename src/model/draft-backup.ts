/** What the copy needs from a plan; the full Configuration lives in the card layer. */
interface Plan {
  architecture: { format: string; content: string };
  catalog: unknown;
}

/** A recovery copy of an unsaved draft, kept only in this browser (#89).
 * It never replaces the save in Home Assistant and is never shared: it exists so
 * that leaving the page, reloading or closing the tab does not lose the edits. */
export interface DraftBackup<Configuration extends Plan = Plan> {
  version: 1;
  /** When the copy was written (ms since epoch). */
  savedAt: number;
  /** Fingerprint of the saved plan the edits started from. */
  base: string;
  /** True when the drawing was not edited and is left out to save space. */
  sameArchitecture?: true;
  draft: Configuration;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const PREFIX = 'homemanager:draft:';

/** One copy per home (or card) and per Home Assistant user. */
export function backupKey(scope: { homeId?: string; cardId?: string; dashboard?: string; userId?: string }): string {
  const where = scope.homeId ? `home:${scope.homeId}` : `card:${scope.dashboard ?? ''}:${scope.cardId ?? ''}`;
  return `${PREFIX}${where}:${scope.userId ?? 'anon'}`;
}

/** Short, stable fingerprint of a saved plan (FNV-1a over its JSON). */
export function planFingerprint(configuration: Plan | undefined): string {
  const text = JSON.stringify(configuration ?? null);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

/** The storage, or undefined when the browser does not allow it (private mode, blocked). */
export function browserStorage(): StorageLike | undefined {
  try {
    const storage = globalThis.localStorage;
    return storage ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeBackup<Configuration extends Plan>(
  storage: StorageLike | undefined,
  key: string,
  draft: Configuration,
  saved: Configuration | undefined,
  now = Date.now(),
): boolean {
  if (!storage) return false;
  const sameArchitecture = !!saved && draft.architecture.content === saved.architecture.content;
  const backup: DraftBackup<Configuration> = {
    version: 1,
    savedAt: now,
    base: planFingerprint(saved),
    ...(sameArchitecture ? { sameArchitecture: true as const } : {}),
    draft: sameArchitecture ? { ...draft, architecture: { ...draft.architecture, content: '' } } : draft,
  };
  try {
    storage.setItem(key, JSON.stringify(backup));
    return true;
  } catch {
    // Full or blocked: editing goes on exactly as without a copy.
    return false;
  }
}

/** The copy, ready to apply over `saved`; undefined when missing, unreadable or from another format. */
export function readBackup<Configuration extends Plan>(
  storage: StorageLike | undefined,
  key: string,
  saved: Configuration | undefined,
): (DraftBackup<Configuration> & { stale: boolean }) | undefined {
  if (!storage) return undefined;
  let backup: DraftBackup<Configuration>;
  try {
    const text = storage.getItem(key);
    if (!text) return undefined;
    backup = JSON.parse(text) as DraftBackup<Configuration>;
  } catch {
    return undefined;
  }
  if (
    !backup ||
    backup.version !== 1 ||
    typeof backup.savedAt !== 'number' ||
    typeof backup.base !== 'string' ||
    !backup.draft?.architecture ||
    !backup.draft.catalog
  )
    return undefined;
  const stale = backup.base !== planFingerprint(saved);
  // A drawing left out was not edited: the current one stands in for it.
  if (backup.sameArchitecture) {
    if (!saved) return undefined;
    backup = {
      ...backup,
      draft: { ...backup.draft, architecture: { ...backup.draft.architecture, content: saved.architecture.content } },
    };
  }
  return { ...backup, stale };
}

export function clearBackup(storage: StorageLike | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Nothing to do: the copy expires with the browser data.
  }
}
