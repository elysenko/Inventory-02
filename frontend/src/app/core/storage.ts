/**
 * Mockups and deployments are served many-per-origin under /<mockup_id>/ and browser
 * storage is origin-scoped, not path-scoped. Every key is therefore namespaced with the
 * deployment's own path segment so two previews on one host can never collide.
 *
 * The segment is taken from <base href> (which the build sets to /<mockup_id>/) rather
 * than from location.pathname, because pathname's first segment is the *route* name when
 * the app is served at the origin root — that would silently change the namespace on
 * every navigation and drop the session.
 */
function resolveNamespace(): string {
  try {
    const base = document.querySelector('base')?.getAttribute('href') ?? '/';
    // '/mock-abc123/' -> 'mock-abc123'; '/' (root deployment) -> 'app'.
    return base.split('/').filter(Boolean)[0] ?? 'app';
  } catch {
    return 'app';
  }
}

const NS = resolveNamespace();

export const nsKey = (key: string): string => `${NS}:${key}`;

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(nsKey(key));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(nsKey(key), JSON.stringify(value));
  } catch {
    /* storage unavailable — the mockup still works from in-memory signals */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(nsKey(key));
  } catch {
    /* no-op */
  }
}
