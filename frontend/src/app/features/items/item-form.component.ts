import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Item } from '../../core/models';

export interface ItemDraft { sku: string; name: string; description: string; unit: string; reorderAt: number; }

@Component({
  selector: 'app-item-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './item-form.component.html',
  styleUrl: './item-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemFormComponent {
  /** Reference data for the unit picker — not backend-owned entity data. */
  readonly units = ['ea', 'box', 'roll', 'pair', 'pallet', 'kg', 'm'];

  @Input() set item(value: Item | null) {
    this.sku.set(value?.sku ?? '');
    this.name.set(value?.name ?? '');
    this.description.set(value?.description ?? '');
    this.unit.set(value?.unit ?? 'ea');
    this.reorderAt.set(value?.reorderAt ?? 0);
  }
  @Input() mode: 'create' | 'edit' = 'create';
  /** Server-side failure surfaced inline, e.g. a duplicate SKU 409. */
  @Input() serverError: string | null = null;

  @Output() readonly save = new EventEmitter<ItemDraft>();
  @Output() readonly cancel = new EventEmitter<void>();

  readonly sku = signal('');
  readonly name = signal('');
  readonly description = signal('');
  readonly unit = signal('ea');
  readonly reorderAt = signal(0);
  readonly submitted = signal(false);

  submit(): void {
    this.submitted.set(true);
    if (!this.sku().trim() || !this.name().trim() || !this.unit()) return;
    this.save.emit({
      sku: this.sku().trim().toUpperCase(),
      name: this.name().trim(),
      description: this.description().trim(),
      unit: this.unit(),
      reorderAt: Number(this.reorderAt()) || 0,
    });
  }
}
