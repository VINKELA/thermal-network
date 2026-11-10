import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { AppAuthService } from './app-auth.service';
import { environment } from '../../../environments/environment';

const DEFAULT_API_URL = 'http://127.0.0.1:8000/api';

@Injectable()
export class AuthTokenInterceptor implements HttpInterceptor {
  constructor(private auth: AppAuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.auth.token;
    const apiUrl = (environment as any).appUrl || DEFAULT_API_URL;
    const isApiRequest = req.url.startsWith(apiUrl) || req.url.includes('/api/');
    const isAuthEndpoint = /\/api\/auth\/(login|register|password-reset|password-reset-confirm)\//.test(req.url);
    if (!token || !isApiRequest || isAuthEndpoint || req.headers.has('Authorization')) {
      return next.handle(req);
    }

    return next.handle(req.clone({
      setHeaders: {
        Authorization: `Token ${token}`,
      },
    }));
  }
}
