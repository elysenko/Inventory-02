import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { LowStockRow } from '../../core/models';

type SortKey = 'shortfall' | 'sku' | 'qty';

@Component({
  selector: 'app-low-stock',
  standalone: true,
  imports: [DecimalPipe, FormsModule, RouterLink],
  templateUrl: './low-stock.component.html',
  styleUrl: './low-stock.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LowStockComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly rows = signal<LowStockRow[]>([
    { id: 'i3', sku: 'SKU-003', name: 'Packing tape 48mm', unit: 'roll', reorderAt: 60, totalQty: 12, shortfall: 48 },
    { id: 'i6', sku: 'SKU-006', name: 'Safety gloves XL', unit: 'pair', reorderAt: 80, totalQty: 54, shortfall: 26 },
    { id: 'i1', sku: 'SKU-001', name: 'Steel bracket M8', unit: 'ea', reorderAt: 40, totalQty: 26, shortfall: 14 },
    { id: 'i8', sku: 'SKU-008', name: 'Forklift battery 48V', unit: 'ea', reorderAt: 4, totalQty: 3, shortfall: 1 },
    { id: 'i4', sku: 'SKU-004', name: 'Pallet wrap film', unit: 'roll', reorderAt: 25, totalQty: 25, shortfall: 0 },
  ]);

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  readonly sort = computed<SortKey>(() => (this.params().get('sort') as SortKey) ?? 'shortfall');

  readonly sorted = computed(() => {
    const key = this.sort();
    return [...this.rows()].sort((a, b) => {
      if (key === 'sku') return a.sku.localeCompare(b.sku);
      if (key === 'qty') return a.totalQty - b.totalQty;
      return b.shortfall - a.shortfall;
    });
  });

  readonly critical = computed(() => this.rows().filter((r) => r.totalQty === 0 || r.shortfall >= r.reorderAt / 2).length);
  readonly totalShortfall = computed(() => this.rows().reduce((s, r) => s + r.shortfall, 0));

  severity(row: LowStockRow): 'critical' | 'low' | 'at' {
    if (row.shortfall === 0) return 'at';
    return row.shortfall >= row.reorderAt / 2 ? 'critical' : 'low';
  }

  coverage(row: LowStockRow): number {
    return row.reorderAt > 0 ? Math.min(100, Math.round((row.totalQty / row.reorderAt) * 100)) : 100;
  }

  setSort(value: string): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { sort: value }, queryParamsHandling: 'merge' });
  }
}
