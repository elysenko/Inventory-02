import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ApiError } from '../../core/api';
import { LocationsService } from '../../core/locations.service';
import { Location } from '../../core/models';
import { LocationDraft, LocationFormComponent } from './location-form.component';

@Component({
  selector: 'app-location-list',
  standalone: true,
  imports: [DecimalPipe, LocationFormComponent],
  templateUrl: './location-list.component.html',
  styleUrl: './location-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationListComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly locationsService = inject(LocationsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly locations = signal<Location[]>([]);

  /** `loading` covers the initial/refetch GET; `busy` covers in-flight mutations. */
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });

  readonly modal = computed(() => this.params().get('modal'));
  readonly editId = computed(() => this.params().get('id'));
  readonly editing = computed<Location | null>(
    () => this.locations().find((l) => l.id === this.editId()) ?? null,
  );
  readonly deleteError = signal<string | null>(null);
  readonly formError = signal<string | null>(null);

  readonly totalUnits = computed(() => this.locations().reduce((s, l) => s + l.totalQty, 0));

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.locationsService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.locations.set(rows);
          this.error.set(null);
          this.loading.set(false);
        },
        error: (err: ApiError) => {
          this.error.set(err.message);
          this.loading.set(false);
        },
      });
  }

  openCreate(): void { this.formError.set(null); this.patch({ modal: 'create', id: null }); }
  openEdit(loc: Location): void { this.formError.set(null); this.patch({ modal: 'edit', id: loc.id }); }
  closeModal(): void { this.formError.set(null); this.patch({ modal: null, id: null }); }

  /**
   * Duplicate names are the server's call — a 409 comes back carrying the
   * canonical message, which is rendered as-is rather than re-worded here.
   */
  save(draft: LocationDraft): void {
    if (this.busy()) return;
    const id = this.editId();
    const request = this.modal() === 'edit' && id
      ? this.locationsService.update(id, draft)
      : this.locationsService.create(draft);

    this.busy.set(true);
    this.formError.set(null);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busy.set(false);
        this.load();
        this.closeModal();
      },
      error: (err: ApiError) => {
        this.busy.set(false);
        this.formError.set(err.message);
      },
    });
  }

  /** Delete is restricted (409) while stock or movement history references the location. */
  remove(loc: Location): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.deleteError.set(null);
    this.locationsService
      .remove(loc.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.load();
        },
        error: (err: ApiError) => {
          this.busy.set(false);
          this.deleteError.set(err.message);
        },
      });
  }

  private patch(params: Record<string, string | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge' });
  }
}
