import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ApiError } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { ItemSort, ItemsService } from '../../core/items.service';
import { Item } from '../../core/models';
import { ItemDraft, ItemFormComponent } from './item-form.component';

type SortKey = 'sku' | 'name' | 'qty' | 'reorder';

/**
 * The `?sort=` value is part of the visible URL contract, so the local keys stay
 * as they are and are translated to the column names the API accepts.
 */
const SORT_PARAMS: Record<SortKey, ItemSort> = {
  sku: 'sku',
  name: 'name',
  qty: 'totalQty',
  reorder: 'reorderAt',
};

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
}

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
  private readonly itemsApi = inject(ItemsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly items = signal<Item[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });

  readonly query = computed(() => this.params().get('q') ?? '');
  readonly sort = computed<SortKey>(() => {
    const raw = this.params().get('sort') as SortKey | null;
    return raw && raw in SORT_PARAMS ? raw : 'sku';
  });
  readonly modal = computed(() => this.params().get('modal'));
  readonly formError = signal<string | null>(null);

  /** Filtering and sorting are done by the API; the rows arrive ready to render. */
  readonly visible = computed(() => this.items());

  readonly lowCount = computed(() => this.items().filter((i) => i.totalQty <= i.reorderAt).length);
  readonly totalUnits = computed(() => this.items().reduce((sum, i) => sum + i.totalQty, 0));

  /** Only the newest request may write to `items` — earlier ones may land late. */
  private ticket = 0;

  constructor() {
    effect(() => this.fetch(this.query(), this.sort()));
  }

  isLow(item: Item): boolean { return item.totalQty <= item.reorderAt; }

  setQuery(value: string): void { this.patch({ q: value || null }); }
  setSort(value: string): void { this.patch({ sort: value }); }
  openCreate(): void { this.formError.set(null); this.patch({ modal: 'create' }); }
  closeModal(): void { this.formError.set(null); this.patch({ modal: null }); }

  create(draft: ItemDraft): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.formError.set(null);
    this.itemsApi
      .create(draft)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.closeModal();
          this.refresh();
        },
        error: (err: unknown) => {
          this.busy.set(false);
          // The duplicate-SKU 409 is the server's call to make; show its wording.
          this.formError.set(messageOf(err));
        },
      });
  }

  refresh(): void { this.fetch(this.query(), this.sort()); }

  private fetch(q: string, sort: SortKey): void {
    const current = ++this.ticket;
    this.loading.set(true);
    this.error.set(null);
    this.itemsApi
      .list({ q: q.trim() || undefined, sort: SORT_PARAMS[sort] })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          if (current !== this.ticket) return;
          this.items.set(rows);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          if (current !== this.ticket) return;
          this.items.set([]);
          this.error.set(messageOf(err));
          this.loading.set(false);
        },
      });
  }

  private patch(params: Record<string, string | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge' });
  }
}
