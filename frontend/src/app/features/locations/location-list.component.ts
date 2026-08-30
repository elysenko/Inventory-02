import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
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

  readonly locations = signal<Location[]>([
    { id: 'l1', name: 'Zone A', zone: 'Receiving', itemCount: 4, totalQty: 312 },
    { id: 'l2', name: 'Zone B', zone: 'Main racking', itemCount: 7, totalQty: 688 },
    { id: 'l3', name: 'Zone C', zone: 'Dispatch', itemCount: 5, totalQty: 102 },
  ]);

  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });

  readonly modal = computed(() => this.params().get('modal'));
  readonly editId = computed(() => this.params().get('id'));
  readonly editing = computed<Location | null>(
    () => this.locations().find((l) => l.id === this.editId()) ?? null,
  );
  readonly deleteError = signal<string | null>(null);
  readonly formError = signal<string | null>(null);

  readonly totalUnits = computed(() => this.locations().reduce((s, l) => s + l.totalQty, 0));

  openCreate(): void { this.formError.set(null); this.patch({ modal: 'create', id: null }); }
  openEdit(loc: Location): void { this.formError.set(null); this.patch({ modal: 'edit', id: loc.id }); }
  closeModal(): void { this.formError.set(null); this.patch({ modal: null, id: null }); }

  save(draft: LocationDraft): void {
    if (this.modal() === 'edit') {
      const id = this.editId();
      this.locations.update((rows) => rows.map((l) => (l.id === id ? { ...l, ...draft } : l)));
    } else {
      if (this.locations().some((l) => l.name.toLowerCase() === draft.name.toLowerCase())) {
        this.formError.set(`A location named “${draft.name}” already exists.`);
        return;
      }
      this.locations.update((rows) => [
        ...rows,
        { id: `l${rows.length + 1}`, itemCount: 0, totalQty: 0, ...draft },
      ]);
    }
    this.closeModal();
  }

  /** Delete is restricted (409) while stock or movement history references the location. */
  remove(loc: Location): void {
    if (loc.totalQty > 0 || loc.itemCount > 0) {
      this.deleteError.set(
        `${loc.name} cannot be deleted — it still holds stock or is referenced by movement history. Move its stock elsewhere first.`,
      );
      return;
    }
    this.deleteError.set(null);
    this.locations.update((rows) => rows.filter((l) => l.id !== loc.id));
  }

  private patch(params: Record<string, string | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge' });
  }
}
