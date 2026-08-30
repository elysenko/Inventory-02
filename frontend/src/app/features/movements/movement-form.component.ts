import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { ApiError } from '../../core/api';
import { ItemsService } from '../../core/items.service';
import { LocationsService } from '../../core/locations.service';
import { MovementPayload, MovementsService } from '../../core/movements.service';
import { Item, ItemStockLevel, Location, MovementType } from '../../core/models';

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
}

@Component({
  selector: 'app-movement-form',
  standalone: true,
  imports: [DecimalPipe, FormsModule, RouterLink],
  templateUrl: './movement-form.component.html',
  styleUrl: './movement-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovementFormComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly itemsApi = inject(ItemsService);
  private readonly locationsApi = inject(LocationsService);
  private readonly movementsApi = inject(MovementsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly items = signal<Item[]>([]);
  readonly locations = signal<Location[]>([]);

  /** On-hand per (item, location) for the selected item — the informational hint only. */
  readonly stockLevels = signal<ItemStockLevel[]>([]);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });

  readonly types: MovementType[] = ['IN', 'OUT', 'TRANSFER'];
  readonly type = computed<MovementType>(() => {
    const raw = this.params().get('type');
    return this.types.includes(raw as MovementType) ? (raw as MovementType) : 'IN';
  });

  readonly itemId = signal('');
  readonly fromLocId = signal('');
  readonly toLocId = signal('');
  readonly qty = signal<number | null>(null);
  readonly note = signal('');
  readonly submitted = signal(false);
  readonly serverError = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  /** Only the newest stock-level request may write to `stockLevels`. */
  private stockTicket = 0;

  constructor() {
    const preset = this.params().get('itemId');
    if (preset) this.itemId.set(preset);

    this.loadReference();
    // Availability is per item, so the balances are refetched whenever it changes.
    effect(() => this.loadStockLevels(this.itemId()));
  }

  readonly needsFrom = computed(() => this.type() === 'OUT' || this.type() === 'TRANSFER');
  readonly needsTo = computed(() => this.type() === 'IN' || this.type() === 'TRANSFER');

  readonly selectedItem = computed(() => this.items().find((i) => i.id === this.itemId()) ?? null);

  /** Stock on hand at the chosen source, or null when it cannot be determined. */
  readonly available = computed<number | null>(() => {
    if (!this.needsFrom() || !this.itemId() || !this.fromLocId()) return null;
    const rows = this.stockLevels();
    if (!rows.length) return null;
    const match = rows.find((s) => s.itemId === this.itemId() && s.locationId === this.fromLocId());
    return match?.qty ?? 0;
  });

  setType(type: MovementType): void {
    this.serverError.set(null);
    this.success.set(null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { type },
      queryParamsHandling: 'merge',
    });
  }

  submit(): void {
    if (this.busy()) return;

    this.submitted.set(true);
    this.success.set(null);
    this.serverError.set(null);

    const qty = Number(this.qty());
    if (!this.itemId() || !qty || qty <= 0) return;
    if (this.needsFrom() && !this.fromLocId()) return;
    if (this.needsTo() && !this.toLocId()) return;

    if (this.type() === 'TRANSFER' && this.fromLocId() === this.toLocId()) {
      this.serverError.set('Source and destination must be different locations.');
      return;
    }
    if (!Number.isInteger(qty)) {
      this.serverError.set('Quantity must be a whole number.');
      return;
    }

    // Availability is deliberately not pre-checked here: the API applies the debit
    // atomically, so its "insufficient stock" 400 is the only authoritative answer.
    const payload: MovementPayload = { type: this.type(), itemId: this.itemId(), qty };
    if (this.needsFrom()) payload.fromLocId = this.fromLocId();
    if (this.needsTo()) payload.toLocId = this.toLocId();
    const note = this.note().trim();
    if (note) payload.note = note;

    const item = this.selectedItem();
    this.busy.set(true);
    this.movementsApi
      .create(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.success.set(
            `Recorded ${this.type()} of ${qty} ${item?.unit ?? 'units'} for ${item?.name ?? 'the item'}.`,
          );
          this.qty.set(null);
          this.note.set('');
          this.submitted.set(false);
          // Balances have moved; refresh so the availability hint stays truthful.
          this.loadStockLevels(this.itemId());
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.serverError.set(messageOf(err));
        },
      });
  }

  private loadReference(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({ items: this.itemsApi.list(), locations: this.locationsApi.list() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ items, locations }) => {
          this.items.set(items);
          this.locations.set(locations);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.items.set([]);
          this.locations.set([]);
          this.error.set(messageOf(err));
          this.loading.set(false);
        },
      });
  }

  private loadStockLevels(itemId: string): void {
    const current = ++this.stockTicket;
    if (!itemId) {
      this.stockLevels.set([]);
      return;
    }
    this.itemsApi
      .stockLevels({ itemId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          if (current !== this.stockTicket) return;
          this.stockLevels.set(rows);
        },
        error: () => {
          // A missing hint must never block recording a movement.
          if (current !== this.stockTicket) return;
          this.stockLevels.set([]);
        },
      });
  }
}
