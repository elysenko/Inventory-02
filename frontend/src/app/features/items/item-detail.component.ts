import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ApiError } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { ItemsService } from '../../core/items.service';
import { MovementsService } from '../../core/movements.service';
import { ItemDetail, Movement } from '../../core/models';
import { ItemDraft, ItemFormComponent } from './item-form.component';

/** How many audit rows the "Recent movements" panel shows. */
const RECENT_LIMIT = 10;

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
}

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
  private readonly itemsApi = inject(ItemsService);
  private readonly movementsApi = inject(MovementsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly item = signal<ItemDetail | null>(null);
  readonly recent = signal<Movement[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });

  readonly itemId = computed(() => this.params().get('id') ?? '');
  readonly panel = computed(() => this.queryParams().get('panel') ?? 'locations');
  readonly modal = computed(() => this.queryParams().get('modal'));
  readonly deleteError = signal<string | null>(null);
  /** Inline failure for the edit modal, e.g. a duplicate SKU 409. */
  readonly formError = signal<string | null>(null);

  readonly levels = computed(() => this.item()?.stockLevels ?? []);
  readonly levelSum = computed(() => this.levels().reduce((sum, l) => sum + l.qty, 0));
  readonly movements = computed(() => this.recent());
  readonly isLow = computed(() => {
    const it = this.item();
    return !!it && it.totalQty <= it.reorderAt;
  });
  readonly shortfall = computed(() => {
    const it = this.item();
    return it ? Math.max(0, it.reorderAt - it.totalQty) : 0;
  });

  /** Newest-request wins: navigating between items must not race. */
  private itemTicket = 0;
  private movementTicket = 0;

  constructor() {
    effect(() => {
      const id = this.itemId();
      const canReadLog = this.auth.isManager();
      this.fetchItem(id);
      this.fetchMovements(id, canReadLog);
    });
  }

  share(qty: number): number {
    const total = this.levelSum();
    return total > 0 ? Math.round((qty / total) * 100) : 0;
  }

  setPanel(panel: string): void { this.patch({ panel }); }
  openEdit(): void { this.deleteError.set(null); this.formError.set(null); this.patch({ modal: 'edit' }); }
  closeModal(): void { this.formError.set(null); this.patch({ modal: null }); }

  saveEdit(draft: ItemDraft): void {
    const id = this.item()?.id;
    if (!id || this.busy()) return;
    this.busy.set(true);
    this.formError.set(null);
    this.itemsApi
      .update(id, draft)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.busy.set(false);
          this.item.set(updated);
          this.closeModal();
          // Re-read so per-location totals reflect anything the server recomputed.
          this.fetchItem(id);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.formError.set(messageOf(err));
        },
      });
  }

  /** Delete is refused by the server (409) while stock or history exists. */
  remove(): void {
    const id = this.item()?.id;
    if (!id || this.busy()) return;
    this.busy.set(true);
    this.deleteError.set(null);
    this.itemsApi
      .remove(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.router.navigate(['/items']);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.deleteError.set(messageOf(err));
        },
      });
  }

  private fetchItem(id: string): void {
    const current = ++this.itemTicket;
    if (!id) {
      this.item.set(null);
      this.loading.set(false);
      this.error.set(null);
      return;
    }
    // Navigating to another item must not leave the previous one on screen;
    // re-reading the same item keeps it visible so the page doesn't flicker.
    if (this.item()?.id !== id) this.item.set(null);
    this.loading.set(true);
    this.error.set(null);
    this.itemsApi
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          if (current !== this.itemTicket) return;
          this.item.set(detail);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          if (current !== this.itemTicket) return;
          this.item.set(null);
          this.loading.set(false);
          // A 404 is a real answer: let the "Item not found" empty state show.
          this.error.set(err instanceof ApiError && err.isNotFound ? null : messageOf(err));
        },
      });
  }

  /** The audit log is manager-only; a clerk simply sees the empty state. */
  private fetchMovements(id: string, canReadLog: boolean): void {
    const current = ++this.movementTicket;
    if (!id || !canReadLog) {
      this.recent.set([]);
      return;
    }
    this.movementsApi
      .list({ itemId: id, pageSize: RECENT_LIMIT })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          if (current !== this.movementTicket) return;
          this.recent.set(page.rows);
        },
        error: () => {
          if (current !== this.movementTicket) return;
          this.recent.set([]);
        },
      });
  }

  private patch(params: Record<string, string | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge' });
  }
}
