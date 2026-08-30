import { Routes } from '@angular/router';
import { adminGuard, authGuard, managerGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'items' },
  {
    path: 'login',
    data: { flow: 'auth.login' },
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    data: { flow: 'auth.signup' },
    loadComponent: () => import('./features/auth/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'items',
    canActivate: [authGuard],
    data: { flow: 'items.list' },
    loadComponent: () => import('./features/items/item-list.component').then((m) => m.ItemListComponent),
  },
  {
    path: 'items/:id',
    canActivate: [authGuard],
    data: { flow: 'items.detail' },
    loadComponent: () => import('./features/items/item-detail.component').then((m) => m.ItemDetailComponent),
  },
  {
    path: 'locations',
    canActivate: [managerGuard],
    data: { flow: 'locations.list' },
    loadComponent: () => import('./features/locations/location-list.component').then((m) => m.LocationListComponent),
  },
  {
    path: 'movements/new',
    canActivate: [authGuard],
    data: { flow: 'movements.create' },
    loadComponent: () => import('./features/movements/movement-form.component').then((m) => m.MovementFormComponent),
  },
  {
    path: 'movements',
    canActivate: [managerGuard],
    data: { flow: 'movements.log' },
    loadComponent: () => import('./features/movements/movement-log.component').then((m) => m.MovementLogComponent),
  },
  {
    path: 'reports/low-stock',
    canActivate: [managerGuard],
    data: { flow: 'reports.lowStock' },
    loadComponent: () => import('./features/reports/low-stock.component').then((m) => m.LowStockComponent),
  },
  {
    path: 'admin/settings',
    canActivate: [adminGuard],
    data: { flow: 'admin.settings' },
    loadComponent: () => import('./features/admin/settings.component').then((m) => m.SettingsComponent),
  },
  { path: '**', redirectTo: 'items' },
];
