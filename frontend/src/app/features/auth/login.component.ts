import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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

  readonly email = signal('manager@demo');
  readonly password = signal('Demo1234!');
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);

  submit(): void {
    this.submitted.set(true);
    const result = this.auth.login(this.email(), this.password());
    this.error.set(result.ok ? null : (result.error ?? 'Unable to sign in.'));
  }

  demo(): void { this.auth.demoLogin(); }
}
