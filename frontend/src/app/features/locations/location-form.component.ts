import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Location } from '../../core/models';

export interface LocationDraft { name: string; zone: string; }

@Component({
  selector: 'app-location-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './location-form.component.html',
  styleUrl: './location-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationFormComponent {
  @Input() set location(value: Location | null) {
    this.name.set(value?.name ?? '');
    this.zone.set(value?.zone ?? '');
  }
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() serverError: string | null = null;

  @Output() readonly save = new EventEmitter<LocationDraft>();
  @Output() readonly cancel = new EventEmitter<void>();

  readonly name = signal('');
  readonly zone = signal('');
  readonly submitted = signal(false);

  submit(): void {
    this.submitted.set(true);
    if (!this.name().trim() || !this.zone().trim()) return;
    this.save.emit({ name: this.name().trim(), zone: this.zone().trim() });
  }
}
