import { Injectable } from '@angular/core';
import { RestApiService } from '../../services/rest-api.service';
import { Observable } from 'rxjs';
import { IdentifierDto, LoginDto } from '../../dtos/auth/login.dto';
import { ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto, TokenDto } from '../../dtos/auth/strapi.dto';
import { JwtDto } from "../../dtos/auth/JwtDto";
import { ResponseDataDto } from '../../dtos/shared/response-data.dto';

@Injectable({
  providedIn: 'root'
})
export class StrapiAuthService {
  token: string;

  constructor( private api:RestApiService) {
    this.token= localStorage.getItem("jwt") as string;
  }
  login(loginData: IdentifierDto): Observable<JwtDto>
  {
    const url = 'api/auth/local'
    return this.api.post<JwtDto>(loginData, url);
  }
  resetPassword(email: string): Observable<ForgotPasswordDto>
  {
    let url = `api/auth/forgot-password`
    let model = {
      "email": email
    }
     return this.api.post<ForgotPasswordDto>(model, url);
  }
  updatePassword(passwordUpdate: ResetPasswordDto): Observable<JwtDto>
  {
    let url = `api/auth/reset-password`
     return this.api.post<JwtDto>(passwordUpdate, url);
  }
  changePassword(passwordUpdate: ChangePasswordDto): Observable<JwtDto>
  {
    let url = `api/auth/change-password`
     return this.api.post<JwtDto>(passwordUpdate, url, this.token);
  }
}
