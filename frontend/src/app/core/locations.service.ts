import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';
import { Location } from './models';

export interface LocationPayload { name: string; zone: string; }

@Injectable({ providedIn: 'root' })
export class LocationsService {
  private readonly api = inject(ApiService);

  list(): Observable<Location[]> {
    return this.api.get<Location[]>('/locations');
  }

  get(id: string): Observable<Location> {
    return this.api.get<Location>(`/locations/${id}`);
  }

  create(payload: LocationPayload): Observable<Location> {
    return this.api.post<Location>('/locations', payload);
  }

  update(id: string, payload: Partial<LocationPayload>): Observable<Location> {
    return this.api.patch<Location>(`/locations/${id}`, payload);
  }

  remove(id: string): Observable<{ id: string; deleted: true }> {
    return this.api.delete<{ id: string; deleted: true }>(`/locations/${id}`);
  }
}
