import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AppAuthService } from '../@core/utils/app-auth.service';

@Component({
  selector: 'ngx-register',
  templateUrl: './register.component.html',
  styleUrls: ['./auth.component.scss'],
})
export class RegisterComponent {
  loading = false;
  error = '';

  form = this.fb.group({
    first_name: [''],
    last_name: [''],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor(
    private fb: FormBuilder,
    private auth: AppAuthService,
    private router: Router,
  ) {}

  submit(): void {
    if (this.form.invalid || this.loading) return;
    this.loading = true;
    this.error = '';
    this.auth.register(this.form.value as any)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: () => this.router.navigateByUrl('/pages'),
        error: err => this.error = err?.error?.error || 'Could not create this account.',
      });
  }
}
