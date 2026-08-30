import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Item, ItemStockLevel, Location, MovementType } from '../../core/models';

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

  readonly items = signal<Item[]>([
    { id: 'i1', sku: 'SKU-001', name: 'Steel bracket M8', description: '', unit: 'ea', reorderAt: 40, totalQty: 26 },
    { id: 'i2', sku: 'SKU-002', name: 'Hex bolt 12mm', description: '', unit: 'box', reorderAt: 20, totalQty: 84 },
    { id: 'i3', sku: 'SKU-003', name: 'Packing tape 48mm', description: '', unit: 'roll', reorderAt: 60, totalQty: 12 },
    { id: 'i5', sku: 'SKU-005', name: 'Corrugated box L', description: '', unit: 'ea', reorderAt: 200, totalQty: 640 },
    { id: 'i8', sku: 'SKU-008', name: 'Forklift battery 48V', description: '', unit: 'ea', reorderAt: 4, totalQty: 3 },
  ]);

  readonly locations = signal<Location[]>([
    { id: 'l1', name: 'Zone A', zone: 'Receiving', itemCount: 4, totalQty: 312 },
    { id: 'l2', name: 'Zone B', zone: 'Main racking', itemCount: 7, totalQty: 688 },
    { id: 'l3', name: 'Zone C', zone: 'Dispatch', itemCount: 5, totalQty: 102 },
  ]);

  /** On-hand per (item, location) — drives the inline insufficient-stock guard. */
  readonly stockLevels = signal<ItemStockLevel[]>([
    { id: 's1', itemId: 'i1', locationId: 'l1', locationName: 'Zone A', zone: 'Receiving', qty: 6 },
    { id: 's2', itemId: 'i1', locationId: 'l2', locationName: 'Zone B', zone: 'Main racking', qty: 14 },
    { id: 's3', itemId: 'i1', locationId: 'l3', locationName: 'Zone C', zone: 'Dispatch', qty: 6 },
    { id: 's4', itemId: 'i3', locationId: 'l2', locationName: 'Zone B', zone: 'Main racking', qty: 8 },
    { id: 's5', itemId: 'i3', locationId: 'l3', locationName: 'Zone C', zone: 'Dispatch', qty: 4 },
    { id: 's6', itemId: 'i5', locationId: 'l1', locationName: 'Zone A', zone: 'Receiving', qty: 240 },
    { id: 's7', itemId: 'i5', locationId: 'l2', locationName: 'Zone B', zone: 'Main racking', qty: 400 },
    { id: 's8', itemId: 'i8', locationId: 'l2', locationName: 'Zone B', zone: 'Main racking', qty: 3 },
  ]);

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

  constructor() {
    const preset = this.params().get('itemId');
    if (preset) this.itemId.set(preset);
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

    // Mirrors the API's atomic guard: a debit can never drive a balance negative.
    const onHand = this.available();
    if (onHand !== null && qty > onHand) {
      this.serverError.set(
        `insufficient stock — only ${onHand} ${this.selectedItem()?.unit ?? 'units'} on hand at the selected location.`,
      );
      return;
    }

    this.success.set(
      `Recorded ${this.type()} of ${qty} ${this.selectedItem()?.unit ?? 'units'} for ${this.selectedItem()?.name ?? 'the item'}.`,
    );
    this.qty.set(null);
    this.note.set('');
    this.submitted.set(false);
  }
}
