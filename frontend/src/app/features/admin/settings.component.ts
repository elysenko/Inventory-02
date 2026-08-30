import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiError } from '../../core/api';
import { ServiceSettings } from '../../core/models';
import { SettingsService } from '../../core/settings.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  private readonly settingsService = inject(SettingsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly services = signal<ServiceSettings[]>([]);

  /** `loading` covers the initial GET; `busy` guards a double-submit of the PATCH. */
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  readonly drafts = signal<Record<string, string>>({});
  readonly savedService = signal<string | null>(null);

  readonly configuredCount = computed(() => this.services().filter((s) => s.configured).length);

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.settingsService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (services) => {
          this.services.set(services);
          this.error.set(null);
          this.loading.set(false);
        },
        error: (err: ApiError) => {
          this.error.set(err.message);
          this.loading.set(false);
        },
      });
  }

  valueFor(key: string, current: string): string {
    const draft = this.drafts()[key];
    return draft !== undefined ? draft : current;
  }

  setValue(key: string, value: string): void {
    this.drafts.update((d) => ({ ...d, [key]: value }));
    this.savedService.set(null);
  }

  /**
   * Only keys the user actually typed into are sent: secrets come back from the
   * server masked, so echoing an untouched row would persist the mask as the value.
   * An empty string is a deliberate payload — it clears the DB override.
   */
  save(service: ServiceSettings): void {
    if (this.busy()) return;

    const drafts = this.drafts();
    const edited = service.rows.map((r) => r.key).filter((key) => drafts[key] !== undefined);

    if (!edited.length) {
      this.savedService.set(service.service);
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    this.settingsService
      .save(edited.map((key) => ({ key, value: drafts[key] })))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (services) => {
          this.services.set(services);
          // The response is now the source of truth for these rows; stale drafts
          // would otherwise keep shadowing (and re-submitting) the saved values.
          this.drafts.update((d) => {
            const next = { ...d };
            for (const key of edited) delete next[key];
            return next;
          });
          this.savedService.set(service.service);
          this.busy.set(false);
        },
        error: (err: ApiError) => {
          this.error.set(err.message);
          this.busy.set(false);
        },
      });
  }
}
