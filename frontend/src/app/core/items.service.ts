import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';
import { Item, ItemDetail, ItemStockLevel } from './models';

export interface ItemPayload {
  sku: string; name: string; description: string; unit: string; reorderAt: number;
}

/** Sort keys accepted by GET /api/items — mirrors ITEM_SORTS on the server. */
export type ItemSort = 'sku' | 'name' | 'totalQty' | 'reorderAt';

@Injectable({ providedIn: 'root' })
export class ItemsService {
  private readonly api = inject(ApiService);

  list(query?: { q?: string; sort?: ItemSort }): Observable<Item[]> {
    return this.api.get<Item[]>('/items', { q: query?.q, sort: query?.sort });
  }

  get(id: string): Observable<ItemDetail> {
    return this.api.get<ItemDetail>(`/items/${id}`);
  }

  create(payload: ItemPayload): Observable<ItemDetail> {
    return this.api.post<ItemDetail>('/items', payload);
  }

  update(id: string, payload: Partial<ItemPayload>): Observable<ItemDetail> {
    return this.api.patch<ItemDetail>(`/items/${id}`, payload);
  }

  remove(id: string): Observable<{ id: string; deleted: true }> {
    return this.api.delete<{ id: string; deleted: true }>(`/items/${id}`);
  }

  /** Per-location balances; used by the movement form to check availability. */
  stockLevels(query?: { itemId?: string; locationId?: string }): Observable<ItemStockLevel[]> {
    return this.api.get<ItemStockLevel[]>('/stock-levels', {
      itemId: query?.itemId,
      locationId: query?.locationId,
    });
  }
}
