import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ApiError } from '../../core/api';
import { ItemsService } from '../../core/items.service';
import { MovementsService } from '../../core/movements.service';
import { Item, Movement, MovementType } from '../../core/models';

/** Kept as the requested page size — the server paginates, this only sets the window. */
const PAGE_SIZE = 8;

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
}

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
  private readonly movementsApi = inject(MovementsService);
  private readonly itemsApi = inject(ItemsService);
  private readonly destroyRef = inject(DestroyRef);

  /** Populates the item filter dropdown. */
  readonly items = signal<Item[]>([]);

  /** The current server page, exactly as returned — filtering and paging are its job. */
  readonly movements = signal<Movement[]>([]);
  readonly total = signal(0);
  private readonly serverPage = signal(1);
  private readonly serverPageSize = signal(PAGE_SIZE);
  private readonly pageCount = signal(1);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

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

  readonly pageRows = computed(() => this.movements());
  readonly totalPages = computed(() => Math.max(1, this.pageCount()));
  readonly rangeStart = computed(() =>
    this.total() ? (this.serverPage() - 1) * this.serverPageSize() + 1 : 0,
  );
  readonly rangeEnd = computed(() => Math.min(this.serverPage() * this.serverPageSize(), this.total()));

  /** Only the newest request may write to the table — earlier ones may land late. */
  private ticket = 0;

  constructor() {
    this.itemsApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // The filter dropdown is secondary; a failure there must not blank the log.
        next: (rows) => this.items.set(rows),
        error: () => this.items.set([]),
      });

    effect(() =>
      this.fetch({
        itemId: this.itemFilter(),
        type: this.typeFilter(),
        from: this.from(),
        to: this.to(),
        page: this.page(),
      }),
    );
  }

  setFilter(key: string, value: string): void {
    this.patch({ [key]: value || null, page: null });
  }
  goToPage(page: number): void {
    this.patch({ page: page <= 1 ? null : String(page) });
  }
  clearFilters(): void {
    this.patch({ itemId: null, type: null, from: null, to: null, page: null });
  }

  private fetch(query: {
    itemId: string; type: string; from: string; to: string; page: number;
  }): void {
    const current = ++this.ticket;
    this.loading.set(true);
    this.error.set(null);
    this.movementsApi
      .list({
        itemId: query.itemId || undefined,
        type: query.type || undefined,
        from: query.from || undefined,
        to: query.to || undefined,
        page: query.page,
        pageSize: PAGE_SIZE,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (current !== this.ticket) return;
          this.movements.set(result.rows);
          this.total.set(result.total);
          this.serverPage.set(result.page || query.page);
          this.serverPageSize.set(result.pageSize || PAGE_SIZE);
          this.pageCount.set(result.pageCount);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          if (current !== this.ticket) return;
          this.movements.set([]);
          this.total.set(0);
          this.pageCount.set(1);
          this.error.set(messageOf(err));
          this.loading.set(false);
        },
      });
  }

  private patch(params: Record<string, string | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge' });
  }
}
