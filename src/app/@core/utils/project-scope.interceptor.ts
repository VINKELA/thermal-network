import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { ProjectContextService } from './project-context.service';

@Injectable()
export class ProjectScopeInterceptor implements HttpInterceptor {
  constructor(private projectContext: ProjectContextService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (req.method !== 'GET') {
      return next.handle(req);
    }

    const scopedUrl = this.projectContext.appendProjectScope(req.url);
    if (scopedUrl === req.url) {
      return next.handle(req);
    }

    return next.handle(req.clone({ url: scopedUrl }));
  }
}
