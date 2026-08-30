import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import { ApiError } from '../../core/api';
import { LowStockRow } from '../../core/models';
import { LowStockSort, ReportsService } from '../../core/reports.service';

type SortKey = 'shortfall' | 'sku' | 'qty';

const SORT_KEYS: SortKey[] = ['shortfall', 'sku', 'qty'];

/**
 * The URL keeps the labels the select has always used; the server speaks a
 * different vocabulary. `shortfall` has no server key at all — omitting the
 * param is what selects the server's default (shortfall desc).
 */
function toServerSort(key: SortKey): LowStockSort | undefined {
  if (key === 'sku') return 'sku';
  if (key === 'qty') return 'totalQty';
  return undefined;
}

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
  private readonly reports = inject(ReportsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly rows = signal<LowStockRow[]>([]);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  readonly sort = computed<SortKey>(() => normalizeSort(this.params().get('sort')));

  /**
   * The server already returns the requested order, so this stays a passthrough —
   * re-sorting client-side would only fight the response.
   */
  readonly sorted = computed(() => this.rows());

  readonly critical = computed(() => this.rows().filter((r) => r.totalQty === 0 || r.shortfall >= r.reorderAt / 2).length);
  readonly totalShortfall = computed(() => this.rows().reduce((s, r) => s + r.shortfall, 0));

  constructor() {
    this.route.queryParamMap
      .pipe(
        map((p) => normalizeSort(p.get('sort'))),
        distinctUntilChanged(),
        tap(() => {
          this.loading.set(true);
          this.error.set(null);
        }),
        switchMap((key) =>
          this.reports.lowStock(toServerSort(key)).pipe(
            map((rows) => ({ rows, error: null as string | null })),
            catchError((err: ApiError) => of({ rows: [] as LowStockRow[], error: err.message })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ rows, error }) => {
        this.rows.set(rows);
        this.error.set(error);
        this.loading.set(false);
      });
  }

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

/** An absent or unrecognised `?sort=` behaves as the default, matching the server. */
function normalizeSort(raw: string | null): SortKey {
  return SORT_KEYS.includes(raw as SortKey) ? (raw as SortKey) : 'shortfall';
}
