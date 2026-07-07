import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { finalize, takeUntil } from 'rxjs/operators';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { ProjectContextService } from '../../../@core/utils/project-context.service';
import { AppAuthService, ProjectMembership } from '../../../@core/utils/app-auth.service';

@Component({
  selector: 'ngx-project-users',
  templateUrl: './project-users.component.html',
  styleUrls: ['./project-users.component.scss'],
})
export class ProjectUsersComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  projects: any[] = [];
  members: ProjectMembership[] = [];
  selectedProjectId: number | null = null;
  loading = false;
  saving = false;
  message = '';
  error = '';
  roles = [
    { value: 'viewer', label: 'Viewer' },
    { value: 'editor', label: 'Editor' },
    { value: 'owner', label: 'Owner' },
  ];

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    first_name: [''],
    last_name: [''],
    role: ['viewer', Validators.required],
  });

  constructor(
    private fb: FormBuilder,
    private api: RestApiService,
    private projectContext: ProjectContextService,
    private auth: AppAuthService,
  ) {}

  ngOnInit(): void {
    this.selectedProjectId = this.projectContext.selectedProjectId;
    this.loadProjects();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectProject(projectId: number): void {
    this.selectedProjectId = projectId;
    this.projectContext.setProject(projectId);
    this.loadMembers();
  }

  submit(): void {
    if (!this.selectedProjectId || this.form.invalid || this.saving) return;
    this.saving = true;
    this.error = '';
    this.message = '';
    this.auth.inviteProjectUser({
      project_id: this.selectedProjectId,
      email: this.form.value.email || '',
      first_name: this.form.value.first_name || '',
      last_name: this.form.value.last_name || '',
      role: this.form.value.role as any,
    })
      .pipe(finalize(() => this.saving = false))
      .subscribe({
        next: () => {
          this.message = 'Project access saved. New users receive a password setup email in the development console.';
          this.form.reset({ role: 'viewer' });
          this.loadMembers();
        },
        error: err => this.error = err?.error?.detail || err?.error?.error || 'Could not save project access.',
      });
  }

  private loadProjects(): void {
    this.loading = true;
    this.api.get<any>('projects/?page_size=100')
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => this.loading = false),
      )
      .subscribe((res: any) => {
        this.projects = res?.results || res || [];
        if (!this.selectedProjectId && this.projects.length) {
          this.selectedProjectId = this.projects[0].id;
          this.projectContext.setProject(this.selectedProjectId);
        }
        if (this.selectedProjectId) {
          this.loadMembers();
        }
      });
  }

  private loadMembers(): void {
    if (!this.selectedProjectId) return;
    this.auth.listProjectMembers(this.selectedProjectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => this.members = res?.results || [],
        error: () => this.error = 'Could not load project members.',
      });
  }
}
