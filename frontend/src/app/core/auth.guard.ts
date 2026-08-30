import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Preview contract: a cold load of an authenticated route renders that route
 * rather than bouncing to /login, so every screen stays deep-linkable. Each
 * guard resolves to `true` after seeding — it never redirects, so no guard
 * can enter a redirect loop with the shell.
 */
export const authGuard: CanActivateFn = () => {
  inject(AuthService).ensureSession();
  return true;
};

/** Manager-only routes. Clerks are sent back to the catalog exactly once. */
export const managerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  auth.ensureSession();
  return auth.isManager() ? true : inject(Router).createUrlTree(['/items']);
};

/** Admin-only routes (/admin/settings). */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  auth.ensureSession();
  return auth.isAdmin() ? true : inject(Router).createUrlTree(['/items']);
};
