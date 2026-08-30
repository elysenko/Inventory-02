import { ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { AuthService } from './core/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(withInterceptors([authInterceptor])),
    /**
     * Reconcile the cached session with the server before the first route
     * activates, so guards decide against a verified token rather than a stale
     * one. Never rejects — an unreachable API resolves to a signed-out app, not
     * a bootstrap failure that would leave the page blank.
     */
    provideAppInitializer(async () => {
      try {
        await firstValueFrom(inject(AuthService).refresh());
      } catch {
        /* offline or API down — start signed out */
      }
    }),
  ],
};
