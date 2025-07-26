import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { LoginDto } from '../../dtos/auth/login.dto';
import { TokenDto } from '../../dtos/auth/strapi.dto';
import { ResponseDataDto } from '../../dtos/shared/response-data.dto';
import { RestApiService } from '../../services/rest-api.service';
import { UpdatePassword } from '../../dtos/update-password';

@Injectable({
  providedIn: 'root'
})
export class AuthService
{
  constructor( private api:RestApiService) {
  }
  login(loginData: LoginDto): Observable<ResponseDataDto<TokenDto>>
  {
    let url = 'api/Auth/login'
     return this.api.post<ResponseDataDto<TokenDto>>(loginData, url);
  }
  resetPassword(email: string): Observable<ResponseDataDto<string>>
  {
    let url = `api/Auth/resetPassword?email=${email}`
     return this.api.post<ResponseDataDto<string>>({}, url);
  }
  updatePassword(passwordUpdate: UpdatePassword): Observable<ResponseDataDto<string>>
  {
    let url = `api/Auth/updatePassword`
     return this.api.post<ResponseDataDto<string>>(passwordUpdate, url);
  }

}
