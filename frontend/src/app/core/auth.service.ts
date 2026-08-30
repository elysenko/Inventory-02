import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { ApiService } from './api';
import { AuthResponse, MANAGER_ROLES, Role, User } from './models';
import { readJson, removeKey, writeJson } from './storage';

const USER_KEY = 'user';
const TOKEN_KEY = 'token';
const VALID_ROLES: Role[] = ['ADMIN', 'MANAGER', 'CLERK', 'USER'];

/** Seeded demo accounts — backs the "Skip login" and "Preview as" affordances. */
const DEMO_PASSWORD = 'Demo1234!';
const DEMO_ACCOUNTS: Record<'manager' | 'clerk', string> = {
  manager: 'manager@demo',
  clerk: 'clerk@demo',
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
  private readonly api = inject(ApiService);

  readonly currentUser = signal<User | null>(this.restore());
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly isManager = computed(() => {
    const role = this.currentUser()?.role;
    return !!role && MANAGER_ROLES.includes(role);
  });
  readonly isAdmin = computed(() => this.currentUser()?.role === 'ADMIN');

  /**
   * Restored synchronously from storage so a reload paints the authenticated
   * shell immediately instead of flashing the login screen while /auth/me is
   * in flight. `refresh()` reconciles it with the server a tick later.
   */
  private restore(): User | null {
    try {
      const stored = readJson<unknown>(USER_KEY);
      if (isUser(stored) && this.token) return stored;
      if (stored !== null) this.clearStorage();
      return null;
    } catch {
      this.clearStorage();
      return null;
    }
  }

  get token(): string | null {
    return readJson<string>(TOKEN_KEY);
  }

  /**
   * Confirms the cached session against the server. A token that expired while
   * the tab was closed is rejected here rather than on the first data call, so
   * the user lands on /login instead of on an empty screen full of errors.
   */
  refresh(): Observable<User | null> {
    if (!this.token) return of(null);
    return this.api.get<User>('/auth/me').pipe(
      tap((user) => {
        this.currentUser.set(user);
        writeJson(USER_KEY, user);
      }),
      catchError(() => {
        this.clearSession();
        return of(null);
      }),
    );
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.api
      .post<AuthResponse>('/auth/login', { email: (email ?? '').trim(), password })
      .pipe(tap((res) => this.setSession(res)));
  }

  signup(name: string, email: string, password: string): Observable<AuthResponse> {
    return this.api
      .post<AuthResponse>('/auth/signup', { name: (name ?? '').trim(), email: (email ?? '').trim(), password })
      .pipe(tap((res) => this.setSession(res)));
  }

  /** Visible escape hatch so a reviewer always reaches the app — a real login. */
  demoLogin(): Observable<AuthResponse> {
    return this.login(DEMO_ACCOUNTS.manager, DEMO_PASSWORD);
  }

  /**
   * "Preview as" re-authenticates as the seeded account for that role rather than
   * rewriting the cached role. The role is carried by the JWT, so a client-side
   * override would leave the UI showing manager nav while the API returned 403.
   */
  previewAs(role: Role): Observable<AuthResponse> {
    const email = MANAGER_ROLES.includes(role) ? DEMO_ACCOUNTS.manager : DEMO_ACCOUNTS.clerk;
    return this.login(email, DEMO_PASSWORD);
  }

  logout(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  /** Drops the session without navigating — used by the 401 interceptor. */
  clearSession(): void {
    this.clearStorage();
    this.currentUser.set(null);
  }

  private setSession(res: AuthResponse): void {
    this.currentUser.set(res.user);
    writeJson(USER_KEY, res.user);
    writeJson(TOKEN_KEY, res.token);
  }

  private clearStorage(): void {
    removeKey(USER_KEY);
    removeKey(TOKEN_KEY);
  }
}
