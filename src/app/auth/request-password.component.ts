import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { AppAuthService } from '../@core/utils/app-auth.service';

@Component({
  selector: 'ngx-request-password',
  templateUrl: './request-password.component.html',
  styleUrls: ['./auth.component.scss'],
})
export class RequestPasswordComponent {
  loading = false;
  message = '';
  error = '';

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  constructor(private fb: FormBuilder, private auth: AppAuthService) {}

  submit(): void {
    if (this.form.invalid || this.loading) return;
    this.loading = true;
    this.error = '';
    this.message = '';
    this.auth.requestPasswordReset(this.form.value.email || '')
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: res => this.message = res?.message || 'If that account exists, a reset link has been sent.',
        error: () => this.error = 'Could not start the reset flow.',
      });
  }
}
