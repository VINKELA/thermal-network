import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, timeout } from 'rxjs/operators';
import { AppAuthService } from '../@core/utils/app-auth.service';

@Component({
  selector: 'ngx-login',
  templateUrl: './login.component.html',
  styleUrls: ['./auth.component.scss'],
})
export class LoginComponent implements OnInit {
  loading = false;
  error = '';

  form = this.fb.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  constructor(
    private fb: FormBuilder,
    private auth: AppAuthService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    if (!this.auth.token) return;
    this.auth.refreshMe().subscribe((payload) => {
      if (payload) {
        this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('returnUrl') || '/pages');
      }
    });
  }

  submit(): void {
    if (this.form.invalid || this.loading) return;
    this.loading = true;
    this.error = '';
    const { username, password } = this.form.value;
    this.auth.login(username || '', password || '')
      .pipe(
        timeout(20000),
        finalize(() => this.loading = false),
      )
      .subscribe({
        next: () => this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('returnUrl') || '/pages'),
        error: err => {
          if (err?.name === 'TimeoutError') {
            this.error = 'The login request timed out. Confirm the backend server is running on port 8000 and try again.';
            return;
          }
          const serverMessage = err?.error?.error || err?.error?.detail || err?.error?.message;
          const status = Number.isFinite(Number(err?.status)) ? ` (status ${err.status})` : '';
          const detail = serverMessage || err?.message || 'Could not sign in with those credentials.';
          this.error = `${detail}${status}`;
        },
      });
  }
}
