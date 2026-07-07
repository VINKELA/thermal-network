import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AppAuthService } from '../@core/utils/app-auth.service';

@Component({
  selector: 'ngx-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./auth.component.scss'],
})
export class ResetPasswordComponent implements OnInit {
  loading = false;
  message = '';
  error = '';
  uid = '';
  token = '';

  form = this.fb.group({
    new_password: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor(
    private fb: FormBuilder,
    private auth: AppAuthService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.uid = this.route.snapshot.queryParamMap.get('uid') || '';
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!this.uid || !this.token) {
      this.error = 'This reset link is missing its token. Request a new password reset link.';
    }
  }

  submit(): void {
    if (this.form.invalid || this.loading || !this.uid || !this.token) return;
    this.loading = true;
    this.error = '';
    this.message = '';
    this.auth.resetPassword(this.uid, this.token, this.form.value.new_password || '')
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: () => {
          this.message = 'Password reset. You can sign in now.';
          setTimeout(() => this.router.navigateByUrl('/auth/login'), 900);
        },
        error: err => this.error = err?.error?.error || 'Could not reset this password.',
      });
  }
}
