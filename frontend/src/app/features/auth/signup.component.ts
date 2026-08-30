import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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

  readonly name = signal('Sam Okafor');
  readonly email = signal('sam@warehouse.co');
  readonly password = signal('Demo1234!');
  readonly confirm = signal('Demo1234!');
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);

  submit(): void {
    this.submitted.set(true);
    const result = this.auth.signup(this.name(), this.email(), this.password(), this.confirm());
    this.error.set(result.ok ? null : (result.error ?? 'Unable to create the account.'));
  }

  demo(): void { this.auth.demoLogin(); }
}
