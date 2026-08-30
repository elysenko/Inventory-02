import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Item, Movement, MovementType } from '../../core/models';

const PAGE_SIZE = 8;

@Component({
  selector: 'app-movement-log',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink],
  templateUrl: './movement-log.component.html',
  styleUrl: './movement-log.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovementLogComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly items = signal<Item[]>([
    { id: 'i1', sku: 'SKU-001', name: 'Steel bracket M8', description: '', unit: 'ea', reorderAt: 40, totalQty: 26 },
    { id: 'i3', sku: 'SKU-003', name: 'Packing tape 48mm', description: '', unit: 'roll', reorderAt: 60, totalQty: 12 },
    { id: 'i5', sku: 'SKU-005', name: 'Corrugated box L', description: '', unit: 'ea', reorderAt: 200, totalQty: 640 },
    { id: 'i6', sku: 'SKU-006', name: 'Safety gloves XL', description: '', unit: 'pair', reorderAt: 80, totalQty: 54 },
  ]);

  readonly movements = signal<Movement[]>([
    { id: 'm1', type: 'OUT', itemId: 'i1', itemSku: 'SKU-001', itemName: 'Steel bracket M8', fromLocName: 'Zone C', toLocName: null, qty: 12, note: 'Order #4471', userName: 'Sam Okafor', createdAt: '2026-08-29T14:12:00Z' },
    { id: 'm2', type: 'IN', itemId: 'i5', itemSku: 'SKU-005', itemName: 'Corrugated box L', fromLocName: null, toLocName: 'Zone A', qty: 240, note: 'PO-2310 receipt', userName: 'Dana Reyes', createdAt: '2026-08-29T11:02:00Z' },
    { id: 'm3', type: 'TRANSFER', itemId: 'i1', itemSku: 'SKU-001', itemName: 'Steel bracket M8', fromLocName: 'Zone B', toLocName: 'Zone C', qty: 10, note: 'Pick face top-up', userName: 'Dana Reyes', createdAt: '2026-08-28T09:40:00Z' },
    { id: 'm4', type: 'OUT', itemId: 'i3', itemSku: 'SKU-003', itemName: 'Packing tape 48mm', fromLocName: 'Zone C', toLocName: null, qty: 18, note: 'Packing bench restock', userName: 'Sam Okafor', createdAt: '2026-08-28T08:15:00Z' },
    { id: 'm5', type: 'IN', itemId: 'i6', itemSku: 'SKU-006', itemName: 'Safety gloves XL', fromLocName: null, toLocName: 'Zone B', qty: 40, note: 'PO-2298 receipt', userName: 'Dana Reyes', createdAt: '2026-08-27T16:30:00Z' },
    { id: 'm6', type: 'TRANSFER', itemId: 'i5', itemSku: 'SKU-005', itemName: 'Corrugated box L', fromLocName: 'Zone A', toLocName: 'Zone B', qty: 120, note: '', userName: 'Sam Okafor', createdAt: '2026-08-27T10:05:00Z' },
    { id: 'm7', type: 'OUT', itemId: 'i6', itemSku: 'SKU-006', itemName: 'Safety gloves XL', fromLocName: 'Zone B', toLocName: null, qty: 26, note: 'Issued to floor team', userName: 'Sam Okafor', createdAt: '2026-08-26T13:44:00Z' },
    { id: 'm8', type: 'IN', itemId: 'i1', itemSku: 'SKU-001', itemName: 'Steel bracket M8', fromLocName: null, toLocName: 'Zone A', qty: 20, note: 'PO-2291 receipt', userName: 'Sam Okafor', createdAt: '2026-08-26T08:05:00Z' },
    { id: 'm9', type: 'OUT', itemId: 'i5', itemSku: 'SKU-005', itemName: 'Corrugated box L', fromLocName: 'Zone B', toLocName: null, qty: 80, note: 'Order #4468', userName: 'Dana Reyes', createdAt: '2026-08-25T15:20:00Z' },
    { id: 'm10', type: 'IN', itemId: 'i3', itemSku: 'SKU-003', itemName: 'Packing tape 48mm', fromLocName: null, toLocName: 'Zone B', qty: 30, note: 'PO-2287 receipt', userName: 'Dana Reyes', createdAt: '2026-08-25T09:12:00Z' },
    { id: 'm11', type: 'TRANSFER', itemId: 'i6', itemSku: 'SKU-006', itemName: 'Safety gloves XL', fromLocName: 'Zone B', toLocName: 'Zone C', qty: 12, note: 'Dispatch kit', userName: 'Sam Okafor', createdAt: '2026-08-24T11:50:00Z' },
    { id: 'm12', type: 'OUT', itemId: 'i1', itemSku: 'SKU-001', itemName: 'Steel bracket M8', fromLocName: 'Zone B', toLocName: null, qty: 15, note: 'Order #4460', userName: 'Sam Okafor', createdAt: '2026-08-24T08:30:00Z' },
  ]);

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });

  readonly types: MovementType[] = ['IN', 'OUT', 'TRANSFER'];
  readonly itemFilter = computed(() => this.params().get('itemId') ?? '');
  readonly typeFilter = computed(() => this.params().get('type') ?? '');
  readonly from = computed(() => this.params().get('from') ?? '');
  readonly to = computed(() => this.params().get('to') ?? '');
  readonly page = computed(() => Math.max(1, Number(this.params().get('page')) || 1));

  readonly hasFilters = computed(
    () => !!(this.itemFilter() || this.typeFilter() || this.from() || this.to()),
  );

  readonly filtered = computed(() => {
    const itemId = this.itemFilter();
    const type = this.typeFilter();
    const from = this.from() ? new Date(this.from()).getTime() : null;
    const to = this.to() ? new Date(this.to()).getTime() + 86_399_000 : null;

    return this.movements()
      .filter((m) => (!itemId || m.itemId === itemId) && (!type || m.type === type))
      .filter((m) => {
        const at = new Date(m.createdAt).getTime();
        return (from === null || at >= from) && (to === null || at <= to);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));
  readonly pageRows = computed(() => {
    const start = (Math.min(this.page(), this.totalPages()) - 1) * PAGE_SIZE;
    return this.filtered().slice(start, start + PAGE_SIZE);
  });
  readonly rangeStart = computed(() => (this.filtered().length ? (this.page() - 1) * PAGE_SIZE + 1 : 0));
  readonly rangeEnd = computed(() => Math.min(this.page() * PAGE_SIZE, this.filtered().length));

  setFilter(key: string, value: string): void {
    this.patch({ [key]: value || null, page: null });
  }
  goToPage(page: number): void {
    this.patch({ page: page <= 1 ? null : String(page) });
  }
  clearFilters(): void {
    this.patch({ itemId: null, type: null, from: null, to: null, page: null });
  }

  private patch(params: Record<string, string | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge' });
  }
}
