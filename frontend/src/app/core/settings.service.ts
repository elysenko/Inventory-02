import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';
import { ServiceSettings } from './models';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly api = inject(ApiService);

  list(): Observable<ServiceSettings[]> {
    return this.api.get<ServiceSettings[]>('/admin/settings');
  }

  /** Empty string clears the DB override and falls back to the env value. */
  save(settings: { key: string; value: string }[]): Observable<ServiceSettings[]> {
    return this.api.patch<ServiceSettings[]>('/admin/settings', { settings });
  }
}
