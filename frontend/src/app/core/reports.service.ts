import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api';
import { LowStockRow } from './models';

/** Sort keys the server understands; anything else falls back to shortfall desc. */
export type LowStockSort = 'shortfall' | 'sku' | 'name' | 'totalQty';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly api = inject(ApiService);

  lowStock(sort?: LowStockSort): Observable<LowStockRow[]> {
    return this.api.get<LowStockRow[]>('/reports/low-stock', { sort });
  }
}
