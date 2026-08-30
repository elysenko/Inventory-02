import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth.service';
import { Item } from '../../core/models';
import { ItemDraft, ItemFormComponent } from './item-form.component';

type SortKey = 'sku' | 'name' | 'qty' | 'reorder';

@Component({
  selector: 'app-item-list',
  standalone: true,
  imports: [DecimalPipe, FormsModule, RouterLink, ItemFormComponent],
  templateUrl: './item-list.component.html',
  styleUrl: './item-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemListComponent {
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly items = signal<Item[]>([
    { id: 'i1', sku: 'SKU-001', name: 'Steel bracket M8', description: 'Galvanised L-bracket, 80mm', unit: 'ea', reorderAt: 40, totalQty: 26 },
    { id: 'i2', sku: 'SKU-002', name: 'Hex bolt 12mm', description: 'Zinc-plated, box of 100', unit: 'box', reorderAt: 20, totalQty: 84 },
    { id: 'i3', sku: 'SKU-003', name: 'Packing tape 48mm', description: 'Clear polypropylene, 66m', unit: 'roll', reorderAt: 60, totalQty: 12 },
    { id: 'i4', sku: 'SKU-004', name: 'Pallet wrap film', description: '500mm stretch film, 300m', unit: 'roll', reorderAt: 25, totalQty: 25 },
    { id: 'i5', sku: 'SKU-005', name: 'Corrugated box L', description: '600 x 400 x 400mm double wall', unit: 'ea', reorderAt: 200, totalQty: 640 },
    { id: 'i6', sku: 'SKU-006', name: 'Safety gloves XL', description: 'Cut-resistant level 5', unit: 'pair', reorderAt: 80, totalQty: 54 },
    { id: 'i7', sku: 'SKU-007', name: 'Thermal label 4x6', description: 'Direct thermal, 500 per roll', unit: 'box', reorderAt: 30, totalQty: 118 },
    { id: 'i8', sku: 'SKU-008', name: 'Forklift battery 48V', description: 'Traction battery, refurbished', unit: 'ea', reorderAt: 4, totalQty: 3 },
  ]);

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });

  readonly query = computed(() => this.params().get('q') ?? '');
  readonly sort = computed<SortKey>(() => (this.params().get('sort') as SortKey) ?? 'sku');
  readonly modal = computed(() => this.params().get('modal'));
  readonly formError = signal<string | null>(null);

  readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    const rows = this.items().filter(
      (i) => !q || i.sku.toLowerCase().includes(q) || i.name.toLowerCase().includes(q),
    );
    const key = this.sort();
    return [...rows].sort((a, b) => {
      if (key === 'qty') return b.totalQty - a.totalQty;
      if (key === 'reorder') return a.reorderAt - b.reorderAt;
      if (key === 'name') return a.name.localeCompare(b.name);
      return a.sku.localeCompare(b.sku);
    });
  });

  readonly lowCount = computed(() => this.items().filter((i) => i.totalQty <= i.reorderAt).length);
  readonly totalUnits = computed(() => this.items().reduce((sum, i) => sum + i.totalQty, 0));

  isLow(item: Item): boolean { return item.totalQty <= item.reorderAt; }

  setQuery(value: string): void { this.patch({ q: value || null }); }
  setSort(value: string): void { this.patch({ sort: value }); }
  openCreate(): void { this.formError.set(null); this.patch({ modal: 'create' }); }
  closeModal(): void { this.formError.set(null); this.patch({ modal: null }); }

  create(draft: ItemDraft): void {
    if (this.items().some((i) => i.sku === draft.sku)) {
      this.formError.set(`SKU ${draft.sku} already exists. Every SKU must be unique.`);
      return;
    }
    this.items.update((rows) => [...rows, { id: `i${rows.length + 1}`, totalQty: 0, ...draft }]);
    this.closeModal();
  }

  private patch(params: Record<string, string | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge' });
  }
}
