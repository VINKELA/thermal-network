import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

const DEFAULT_API_URL = 'http://127.0.0.1:8000/api';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  is_staff?: boolean;
}

export interface AuthProject {
  id: number;
  name: string;
  role: 'owner' | 'editor' | 'viewer';
}

export interface AuthPayload {
  token: string;
  user: AuthUser;
  projects: AuthProject[];
}

export interface ProjectMembership {
  id: number;
  project: number;
  project_name: string;
  role: 'owner' | 'editor' | 'viewer';
  user: AuthUser;
  invited_by?: AuthUser;
  created_at: string;
  updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class AppAuthService {
  private readonly apiUrl = `${(environment as any).appUrl || DEFAULT_API_URL}/`;
  private readonly tokenKey = 'thermalNetworkToken';
  private readonly legacyTokenKey = 'jwt';
  private readonly currentUserSubject = new BehaviorSubject<AuthUser | null>(null);
  private readonly projectsSubject = new BehaviorSubject<AuthProject[]>([]);

  currentUser$ = this.currentUserSubject.asObservable();
  projects$ = this.projectsSubject.asObservable();

  constructor(private http: HttpClient) {
    if (this.token) {
      // Let dependency injection finish before a request constructs the auth interceptor.
      Promise.resolve().then(() => this.refreshMe().subscribe());
    }
  }

  get token(): string | null {
    return localStorage.getItem(this.tokenKey) || localStorage.getItem(this.legacyTokenKey);
  }

  get currentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  login(username: string, password: string): Observable<AuthPayload> {
    this.clearSession();
    return this.http.post<AuthPayload>(`${this.apiUrl}auth/login/`, { username, password })
      .pipe(tap(payload => this.storeSession(payload)));
  }

  register(data: {
    email: string;
    username?: string;
    first_name?: string;
    last_name?: string;
    password: string;
  }): Observable<AuthPayload> {
    return this.http.post<AuthPayload>(`${this.apiUrl}auth/register/`, data)
      .pipe(tap(payload => this.storeSession(payload)));
  }

  logout(): Observable<any> {
    return this.http.post(`${this.apiUrl}auth/logout/`, {}).pipe(
      tap(() => this.clearSession()),
      catchError(() => {
        this.clearSession();
        return of({ message: 'Logged out locally.' });
      }),
    );
  }

  refreshMe(): Observable<AuthPayload | null> {
    const tokenAtRequestStart = this.token;
    if (!tokenAtRequestStart) {
      return of(null);
    }

    return this.http.get<AuthPayload>(`${this.apiUrl}auth/me/`).pipe(
      tap(payload => {
        if (this.token === tokenAtRequestStart) {
          this.storeSession(payload);
        }
      }),
      catchError(() => {
        if (this.token === tokenAtRequestStart) {
          this.clearSession();
        }
        return of(null);
      }),
    );
  }

  requestPasswordReset(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}auth/password-reset/`, { email });
  }

  resetPassword(uid: string, token: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.apiUrl}auth/password-reset-confirm/`, {
      uid,
      token,
      new_password: newPassword,
    });
  }

  changePassword(oldPassword: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.apiUrl}auth/change-password/`, {
      old_password: oldPassword,
      new_password: newPassword,
    }).pipe(tap(() => this.clearSession()));
  }

  listProjectMembers(projectId: number): Observable<{ results: ProjectMembership[] }> {
    return this.http.get<{ results: ProjectMembership[] }>(
      `${this.apiUrl}project-memberships/?project_id=${projectId}&page_size=100`,
    );
  }

  inviteProjectUser(payload: {
    project_id: number;
    email: string;
    username?: string;
    first_name?: string;
    last_name?: string;
    role: 'owner' | 'editor' | 'viewer';
  }): Observable<ProjectMembership> {
    return this.http.post<ProjectMembership>(`${this.apiUrl}project-memberships/`, payload);
  }

  private storeSession(payload: AuthPayload): void {
    localStorage.setItem(this.tokenKey, payload.token);
    localStorage.setItem(this.legacyTokenKey, payload.token);
    this.currentUserSubject.next(payload.user);
    this.projectsSubject.next(payload.projects || []);
  }

  private clearSession(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.legacyTokenKey);
    this.currentUserSubject.next(null);
    this.projectsSubject.next([]);
  }
}
