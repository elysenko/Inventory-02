import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from './core/auth.service';
import { Role } from './core/models';

interface NavItem { label: string; short: string; path: string; icon: string; managerOnly?: boolean; adminOnly?: boolean; }

const NAV: NavItem[] = [
  { label: 'Item catalog', short: 'Items', path: '/items', icon: '▦' },
  { label: 'Record movement', short: 'Move', path: '/movements/new', icon: '⇄' },
  { label: 'Movement log', short: 'Log', path: '/movements', icon: '☰', managerOnly: true },
  { label: 'Low stock', short: 'Low', path: '/reports/low-stock', icon: '⚠', managerOnly: true },
  { label: 'Locations', short: 'Zones', path: '/locations', icon: '⌗', managerOnly: true },
  { label: 'Admin settings', short: 'Admin', path: '/admin/settings', icon: '⚙', adminOnly: true },
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly url = signal(this.router.url);
  readonly moreOpen = signal(false);
  readonly accountOpen = signal(false);

  /** Login and signup render the brand but not the app chrome. */
  readonly isAuthRoute = computed(() => /^\/(login|signup)/.test(this.url()));

  readonly nav = computed<NavItem[]>(() => {
    const manager = this.auth.isManager();
    const admin = this.auth.isAdmin();
    return NAV.filter((n) => (!n.managerOnly || manager) && (!n.adminOnly || admin));
  });

  /** Bottom bar shows four tabs plus a "More" sheet for the remainder. */
  readonly primaryNav = computed(() => this.nav().slice(0, 4));
  readonly overflowNav = computed(() => this.nav().slice(4));

  readonly initials = computed(() => {
    const name = this.auth.currentUser()?.name ?? 'Guest';
    return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  });

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.url.set(e.urlAfterRedirects);
        this.moreOpen.set(false);
        this.accountOpen.set(false);
      });
  }

  toggleMore(): void { this.moreOpen.update((v) => !v); }
  toggleAccount(): void { this.accountOpen.update((v) => !v); }

  switchRole(role: Role): void {
    this.auth.setRole(role);
    this.accountOpen.set(false);
    this.moreOpen.set(false);
    this.router.navigate(['/items']);
  }

  logout(): void {
    this.accountOpen.set(false);
    this.moreOpen.set(false);
    this.auth.logout();
  }
}
