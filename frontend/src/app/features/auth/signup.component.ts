import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly name = signal('Sam Okafor');
  readonly email = signal('sam@warehouse.co');
  readonly password = signal('Demo1234!');
  readonly confirm = signal('Demo1234!');
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);
  readonly busy = signal(false);

  submit(): void {
    this.submitted.set(true);
    const name = this.name().trim();
    const email = this.email().trim();

    // Checked here as well as server-side: `confirm` never leaves the browser.
    if (!name || !email || !this.password() || !this.confirm()) {
      this.error.set('All fields are required.');
      return;
    }
    if (this.password().length < 8) {
      this.error.set('Password must be at least 8 characters.');
      return;
    }
    if (this.password() !== this.confirm()) {
      this.error.set('The two passwords do not match.');
      return;
    }
    this.run(this.auth.signup(name, email, this.password()));
  }

  demo(): void {
    this.submitted.set(true);
    this.run(this.auth.demoLogin());
  }

  private run(request: ReturnType<AuthService['signup']>): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.router.navigateByUrl('/items');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(err instanceof ApiError ? err.message : 'Unable to create the account.');
      },
    });
  }
}
