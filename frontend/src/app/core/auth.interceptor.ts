import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { API_BASE } from './api';
import { AuthService } from './auth.service';
import { readJson } from './storage';

/**
 * Attaches the bearer token to API calls and turns a rejected token into a trip
 * to /login.
 *
 * The token is read straight from storage rather than from AuthService because
 * AuthService depends on HttpClient — resolving it eagerly here would close a
 * circular DI loop during bootstrap. AuthService is instead pulled lazily from a
 * captured Injector, and only on the 401 path.
 *
 * The Injector is captured in the interceptor's synchronous body: `inject()` is
 * only legal in an injection context, and the catchError callback runs after the
 * response arrives, long outside it.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);

  const isApiCall = req.url.startsWith(API_BASE) || req.url.startsWith('/api');
  const token = isApiCall ? readJson<string>('token') : null;

  const authed = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authed).pipe(
    catchError((error: unknown) => {
      // Only a rejected *session* should bounce the user. A 401 from the login
      // form itself is just wrong credentials and must stay on the page.
      // /auth/me is the bootstrap session probe: AuthService.refresh() already
      // handles its 401 by clearing the session, and the guards redirect from
      // there. Navigating here too would race the router's own initialisation.
      const isAuthEndpoint =
        req.url.includes('/auth/login') ||
        req.url.includes('/auth/signup') ||
        req.url.includes('/auth/me');

      if (error instanceof HttpErrorResponse && error.status === 401 && isApiCall && !isAuthEndpoint) {
        const auth = injector.get(AuthService);
        const router = injector.get(Router);
        const returnUrl = router.url;
        auth.clearSession();
        router.navigate(['/login'], {
          queryParams:
            returnUrl && !returnUrl.startsWith('/login') ? { returnUrl } : {},
        });
      }
      return throwError(() => error);
    }),
  );
};
