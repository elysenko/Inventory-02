import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly email = signal('manager@demo');
  readonly password = signal('Demo1234!');
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);
  readonly busy = signal(false);

  submit(): void {
    this.submitted.set(true);
    const email = this.email().trim();
    if (!email || !this.password()) {
      this.error.set('Enter both your email and password.');
      return;
    }
    this.run(this.auth.login(email, this.password()));
  }

  demo(): void {
    this.submitted.set(true);
    this.run(this.auth.demoLogin());
  }

  private run(request: ReturnType<AuthService['login']>): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        // Guards park the requested URL here so a deep link survives sign-in.
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        this.router.navigateByUrl(returnUrl && !returnUrl.startsWith('/login') ? returnUrl : '/items');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(err instanceof ApiError ? err.message : 'Unable to sign in.');
      },
    });
  }
}
