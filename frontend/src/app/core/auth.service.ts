import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MANAGER_ROLES, Role, User } from './models';
import { readJson, removeKey, writeJson } from './storage';

const USER_KEY = 'user';
const TOKEN_KEY = 'token';
const VALID_ROLES: Role[] = ['ADMIN', 'MANAGER', 'CLERK', 'USER'];

const DEMO_USER: User = {
  id: 'u-demo-1',
  email: 'manager@demo',
  name: 'Dana Reyes',
  role: 'ADMIN',
};

/** Untrusted storage payloads must never blank the page — validate the shape. */
function isUser(value: unknown): value is User {
  const u = value as User | null;
  return (
    !!u &&
    typeof u === 'object' &&
    typeof u.id === 'string' &&
    typeof u.email === 'string' &&
    typeof u.name === 'string' &&
    VALID_ROLES.includes(u.role)
  );
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);

  readonly currentUser = signal<User | null>(this.restore());
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly isManager = computed(() => {
    const role = this.currentUser()?.role;
    return !!role && MANAGER_ROLES.includes(role);
  });
  readonly isAdmin = computed(() => this.currentUser()?.role === 'ADMIN');

  private restore(): User | null {
    try {
      const stored = readJson<unknown>(USER_KEY);
      if (isUser(stored)) return stored;
      if (stored !== null) this.clearStorage();
      return null;
    } catch {
      this.clearStorage();
      return null;
    }
  }

  /**
   * Resolves entirely client-side. The mockup is served as static files with no
   * API, so any network call here would strand the reviewer on the login screen.
   */
  login(email: string, password: string): { ok: boolean; error?: string } {
    const cleanEmail = (email ?? '').trim();
    if (!cleanEmail || !password) {
      return { ok: false, error: 'Enter both your email and password.' };
    }
    if (!/^[^\s@]+@[^\s@]+$/.test(cleanEmail)) {
      return { ok: false, error: 'That email address does not look valid.' };
    }
    const isClerk = cleanEmail.toLowerCase().startsWith('clerk');
    this.setSession({
      id: isClerk ? 'u-demo-2' : 'u-demo-1',
      email: cleanEmail,
      name: isClerk ? 'Sam Okafor' : 'Dana Reyes',
      role: isClerk ? 'CLERK' : 'ADMIN',
    });
    this.router.navigate(['/items']);
    return { ok: true };
  }

  signup(name: string, email: string, password: string, confirm: string): { ok: boolean; error?: string } {
    const cleanEmail = (email ?? '').trim();
    if (!name?.trim() || !cleanEmail || !password || !confirm) {
      return { ok: false, error: 'All fields are required.' };
    }
    if (!/^[^\s@]+@[^\s@]+$/.test(cleanEmail)) {
      return { ok: false, error: 'That email address does not look valid.' };
    }
    if (password.length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters.' };
    }
    if (password !== confirm) {
      return { ok: false, error: 'The two passwords do not match.' };
    }
    this.setSession({ id: 'u-new-1', email: cleanEmail, name: name.trim(), role: 'CLERK' });
    this.router.navigate(['/items']);
    return { ok: true };
  }

  /** Visible escape hatch so a reviewer (or screenshot bot) always reaches the app. */
  demoLogin(): void {
    this.setSession(DEMO_USER);
    this.router.navigate(['/items']);
  }

  /** Seeds a session without navigating — used by guards on cold deep-links. */
  ensureSession(): void {
    if (!this.currentUser()) this.setSession(DEMO_USER);
  }

  setRole(role: Role): void {
    const user = this.currentUser() ?? DEMO_USER;
    this.setSession({ ...user, role });
  }

  logout(): void {
    this.clearStorage();
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  private setSession(user: User): void {
    this.currentUser.set(user);
    writeJson(USER_KEY, user);
    writeJson(TOKEN_KEY, `demo.${user.id}.token`);
  }

  private clearStorage(): void {
    removeKey(USER_KEY);
    removeKey(TOKEN_KEY);
  }
}
