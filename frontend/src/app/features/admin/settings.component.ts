import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ServiceSettings } from '../../core/models';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  readonly services = signal<ServiceSettings[]>([
    {
      service: 'postgresql',
      label: 'PostgreSQL',
      description: 'Primary datastore for items, locations, stock levels and the movement audit log.',
      configured: true,
      rows: [
        { key: 'POSTGRES_HOST', label: 'Host', value: 'db.internal', configured: true, secret: false },
        { key: 'POSTGRES_PORT', label: 'Port', value: '5432', configured: true, secret: false },
        { key: 'POSTGRES_DB', label: 'Database', value: 'stockroom', configured: true, secret: false },
        { key: 'POSTGRES_USER', label: 'User', value: 'stockroom_app', configured: true, secret: false },
        { key: 'POSTGRES_PASSWORD', label: 'Password', value: '••••••••••3f9a', configured: true, secret: true },
      ],
    },
    {
      service: 'minio',
      label: 'MinIO object storage',
      description: 'Provisioned but not yet consumed by any feature. Credentials are stored for future use.',
      configured: false,
      rows: [
        { key: 'MINIO_ENDPOINT', label: 'Endpoint', value: 'minio.internal:9000', configured: true, secret: false },
        { key: 'MINIO_BUCKET', label: 'Bucket', value: '', configured: false, secret: false },
        { key: 'MINIO_ACCESS_KEY', label: 'Access key', value: '', configured: false, secret: true },
        { key: 'MINIO_SECRET_KEY', label: 'Secret key', value: '', configured: false, secret: true },
      ],
    },
  ]);

  readonly drafts = signal<Record<string, string>>({});
  readonly savedService = signal<string | null>(null);

  readonly configuredCount = computed(() => this.services().filter((s) => s.configured).length);

  valueFor(key: string, current: string): string {
    const draft = this.drafts()[key];
    return draft !== undefined ? draft : current;
  }

  setValue(key: string, value: string): void {
    this.drafts.update((d) => ({ ...d, [key]: value }));
    this.savedService.set(null);
  }

  save(service: ServiceSettings): void {
    const drafts = this.drafts();
    this.services.update((rows) =>
      rows.map((s) => {
        if (s.service !== service.service) return s;
        const updated = s.rows.map((r) =>
          drafts[r.key] !== undefined
            ? { ...r, value: drafts[r.key], configured: drafts[r.key].trim().length > 0 }
            : r,
        );
        return { ...s, rows: updated, configured: updated.every((r) => r.configured) };
      }),
    );
    this.savedService.set(service.service);
  }
}
