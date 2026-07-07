import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import {
  NbAlertModule,
  NbButtonModule,
  NbCardModule,
  NbIconModule,
  NbInputModule,
  NbSpinnerModule,
} from '@nebular/theme';
import { AuthShellComponent } from './auth-shell.component';
import { LoginComponent } from './login.component';
import { RegisterComponent } from './register.component';
import { RequestPasswordComponent } from './request-password.component';
import { ResetPasswordComponent } from './reset-password.component';
import { ChangePasswordComponent } from './change-password.component';
import { AuthGuard } from '../@core/utils/auth.guard';

const routes: Routes = [
  {
    path: '',
    component: AuthShellComponent,
    children: [
      { path: '', redirectTo: 'login', pathMatch: 'full' },
      { path: 'login', component: LoginComponent },
      { path: 'register', component: RegisterComponent },
      { path: 'request-password', component: RequestPasswordComponent },
      { path: 'reset-password', component: ResetPasswordComponent },
      { path: 'change-password', component: ChangePasswordComponent, canActivate: [AuthGuard] },
    ],
  },
];

@NgModule({
  declarations: [
    AuthShellComponent,
    LoginComponent,
    RegisterComponent,
    RequestPasswordComponent,
    ResetPasswordComponent,
    ChangePasswordComponent,
  ],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule.forChild(routes),
    NbAlertModule,
    NbButtonModule,
    NbCardModule,
    NbIconModule,
    NbInputModule,
    NbSpinnerModule,
  ],
})
export class AuthModule {}
