import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth.service';
import { ItemDetail, Movement } from '../../core/models';
import { ItemDraft, ItemFormComponent } from './item-form.component';

@Component({
  selector: 'app-item-detail',
  standalone: true,
  imports: [DecimalPipe, RouterLink, ItemFormComponent],
  templateUrl: './item-detail.component.html',
  styleUrl: './item-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemDetailComponent {
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly items = signal<ItemDetail[]>([
    {
      id: 'i1', sku: 'SKU-001', name: 'Steel bracket M8', description: 'Galvanised L-bracket, 80mm', unit: 'ea', reorderAt: 40, totalQty: 26,
      stockLevels: [
        { id: 's1', locationId: 'l1', locationName: 'Zone A', zone: 'Receiving', qty: 6 },
        { id: 's2', locationId: 'l2', locationName: 'Zone B', zone: 'Main racking', qty: 14 },
        { id: 's3', locationId: 'l3', locationName: 'Zone C', zone: 'Dispatch', qty: 6 },
      ],
    },
    {
      id: 'i3', sku: 'SKU-003', name: 'Packing tape 48mm', description: 'Clear polypropylene, 66m', unit: 'roll', reorderAt: 60, totalQty: 12,
      stockLevels: [
        { id: 's4', locationId: 'l2', locationName: 'Zone B', zone: 'Main racking', qty: 8 },
        { id: 's5', locationId: 'l3', locationName: 'Zone C', zone: 'Dispatch', qty: 4 },
      ],
    },
    {
      id: 'i5', sku: 'SKU-005', name: 'Corrugated box L', description: '600 x 400 x 400mm double wall', unit: 'ea', reorderAt: 200, totalQty: 640,
      stockLevels: [
        { id: 's6', locationId: 'l1', locationName: 'Zone A', zone: 'Receiving', qty: 240 },
        { id: 's7', locationId: 'l2', locationName: 'Zone B', zone: 'Main racking', qty: 400 },
      ],
    },
  ]);

  readonly recent = signal<Movement[]>([
    { id: 'm1', type: 'OUT', itemId: 'i1', itemSku: 'SKU-001', itemName: 'Steel bracket M8', fromLocName: 'Zone C', toLocName: null, qty: 12, note: 'Order #4471', userName: 'Sam Okafor', createdAt: '2026-08-29T14:12:00Z' },
    { id: 'm2', type: 'TRANSFER', itemId: 'i1', itemSku: 'SKU-001', itemName: 'Steel bracket M8', fromLocName: 'Zone B', toLocName: 'Zone C', qty: 10, note: 'Pick face top-up', userName: 'Dana Reyes', createdAt: '2026-08-28T09:40:00Z' },
    { id: 'm3', type: 'IN', itemId: 'i1', itemSku: 'SKU-001', itemName: 'Steel bracket M8', fromLocName: null, toLocName: 'Zone A', qty: 20, note: 'PO-2291 receipt', userName: 'Sam Okafor', createdAt: '2026-08-26T08:05:00Z' },
  ]);

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

  readonly itemId = computed(() => this.params().get('id') ?? '');
  readonly panel = computed(() => this.queryParams().get('panel') ?? 'locations');
  readonly modal = computed(() => this.queryParams().get('modal'));
  readonly deleteError = signal<string | null>(null);

  /** Deep-linking an unseeded id must still render a screen, so fall back to the first item. */
  readonly item = computed<ItemDetail | null>(() => {
    const rows = this.items();
    if (!rows.length) return null;
    return rows.find((i) => i.id === this.itemId()) ?? rows[0];
  });

  readonly levels = computed(() => this.item()?.stockLevels ?? []);
  readonly levelSum = computed(() => this.levels().reduce((sum, l) => sum + l.qty, 0));
  readonly movements = computed(() => {
    const id = this.item()?.id;
    return this.recent().filter((m) => !id || m.itemId === id);
  });
  readonly isLow = computed(() => {
    const it = this.item();
    return !!it && it.totalQty <= it.reorderAt;
  });
  readonly shortfall = computed(() => {
    const it = this.item();
    return it ? Math.max(0, it.reorderAt - it.totalQty) : 0;
  });

  share(qty: number): number {
    const total = this.levelSum();
    return total > 0 ? Math.round((qty / total) * 100) : 0;
  }

  setPanel(panel: string): void { this.patch({ panel }); }
  openEdit(): void { this.deleteError.set(null); this.patch({ modal: 'edit' }); }
  closeModal(): void { this.patch({ modal: null }); }

  saveEdit(draft: ItemDraft): void {
    const id = this.item()?.id;
    this.items.update((rows) => rows.map((r) => (r.id === id ? { ...r, ...draft } : r)));
    this.closeModal();
  }

  /** Delete is restricted while stock or movement history exists (409). */
  remove(): void {
    if (this.levelSum() > 0 || this.movements().length) {
      this.deleteError.set(
        'This item cannot be deleted — it still holds stock or has movement history. Zero out its balances first to keep the audit log intact.',
      );
      return;
    }
    this.items.update((rows) => rows.filter((r) => r.id !== this.item()?.id));
    this.router.navigate(['/items']);
  }

  private patch(params: Record<string, string | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge' });
  }
}
