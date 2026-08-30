import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';
import { Movement, MovementPage, MovementType } from './models';

export interface MovementPayload {
  type: MovementType;
  itemId: string;
  fromLocId?: string;
  toLocId?: string;
  qty: number;
  note?: string;
}

export interface MovementQuery {
  itemId?: string; type?: string; from?: string; to?: string;
  page?: number; pageSize?: number;
}

@Injectable({ providedIn: 'root' })
export class MovementsService {
  private readonly api = inject(ApiService);

  /** Manager-only audit log; the server paginates and filters. */
  list(query: MovementQuery = {}): Observable<MovementPage> {
    return this.api.get<MovementPage>('/movements', {
      itemId: query.itemId,
      type: query.type,
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** Applies the balance change and writes the audit row in one transaction. */
  create(payload: MovementPayload): Observable<Movement> {
    return this.api.post<Movement>('/movements', payload);
  }
}
