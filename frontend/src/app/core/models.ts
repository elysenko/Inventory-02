export type Role = 'ADMIN' | 'MANAGER' | 'CLERK' | 'USER';
export type MovementType = 'IN' | 'OUT' | 'TRANSFER';

export interface User { id: string; email: string; name: string; role: Role; }

export interface Item {
  id: string; sku: string; name: string; description: string;
  unit: string; reorderAt: number; totalQty: number;
}

export interface StockLevel { id: string; locationId: string; locationName: string; zone: string; qty: number; }

export interface ItemDetail extends Item { stockLevels: StockLevel[]; }

/** A stock level carrying its owning item — the shape the movement form reads. */
export interface ItemStockLevel extends StockLevel { itemId: string; }

export interface Location { id: string; name: string; zone: string; itemCount: number; totalQty: number; }

export interface Movement {
  id: string; type: MovementType; itemId: string; itemSku: string; itemName: string;
  fromLocName: string | null; toLocName: string | null;
  qty: number; note: string; userName: string; createdAt: string;
}

export interface LowStockRow {
  id: string; sku: string; name: string; unit: string;
  reorderAt: number; totalQty: number; shortfall: number;
}

export interface SettingRow { key: string; label: string; value: string; configured: boolean; secret: boolean; }
export interface ServiceSettings { service: string; label: string; description: string; configured: boolean; rows: SettingRow[]; }

export const MANAGER_ROLES: Role[] = ['ADMIN', 'MANAGER'];
