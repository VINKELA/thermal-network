import { Component, OnDestroy, OnInit } from '@angular/core';
import { NbMediaBreakpointsService, NbMenuService, NbSidebarService, NbThemeService } from '@nebular/theme';

import { LayoutService } from '../../../@core/utils';
import { filter, map, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { ProjectContextService } from '../../../@core/utils/project-context.service';
import { AppAuthService } from '../../../@core/utils/app-auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'ngx-header',
  styleUrls: ['./header.component.scss'],
  templateUrl: './header.component.html',
})
export class HeaderComponent implements OnInit, OnDestroy {

  private destroy$: Subject<void> = new Subject<void>();
  userPictureOnly: boolean = false;
  user: any;

  themes = [
    {
      value: 'default',
      name: 'Light',
    },
    {
      value: 'dark',
      name: 'Dark',
    },
    {
      value: 'cosmic',
      name: 'Cosmic',
    },
    {
      value: 'corporate',
      name: 'Corporate',
    },
  ];

  currentTheme = 'default';
  projects: any[] = [];
  selectedProjectId: number | null = null;

  userMenu = [
    { title: 'Change password', icon: 'lock-outline' },
    { title: 'Log out', icon: 'log-out-outline' },
  ];

  constructor(private sidebarService: NbSidebarService,
              private menuService: NbMenuService,
              private themeService: NbThemeService,
              private layoutService: LayoutService,
              private breakpointService: NbMediaBreakpointsService,
              private api: RestApiService,
              private projectContext: ProjectContextService,
              private auth: AppAuthService,
              private router: Router) {
  }

  ngOnInit() {
    this.currentTheme = this.themeService.currentTheme;
    this.selectedProjectId = this.projectContext.selectedProjectId;
    this.loadProjects();

    this.auth.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe((user: any) => {
        this.user = {
          name: user?.display_name || user?.email || 'User',
          picture: '',
        };
      });

    this.menuService.onItemClick()
      .pipe(
        filter(({ tag }) => tag === 'user-menu'),
        takeUntil(this.destroy$),
      )
      .subscribe(({ item }) => {
        if (item.title === 'Change password') {
          this.router.navigateByUrl('/auth/change-password');
        }
        if (item.title === 'Log out') {
          this.auth.logout().subscribe(() => this.router.navigateByUrl('/'));
        }
      });

    const { xl } = this.breakpointService.getBreakpointsMap();
    this.themeService.onMediaQueryChange()
      .pipe(
        map(([, currentBreakpoint]) => currentBreakpoint.width < xl),
        takeUntil(this.destroy$),
      )
      .subscribe((isLessThanXl: boolean) => this.userPictureOnly = isLessThanXl);

    this.themeService.onThemeChange()
      .pipe(
        map(({ name }) => name),
        takeUntil(this.destroy$),
      )
      .subscribe(themeName => this.currentTheme = themeName);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  changeTheme(themeName: string) {
    this.themeService.changeTheme(themeName);
  }

  changeProject(projectId: number | null) {
    const previousProjectId = this.projectContext.selectedProjectId;
    this.selectedProjectId = projectId;
    this.projectContext.setProject(projectId);
    if (previousProjectId !== this.projectContext.selectedProjectId) {
      setTimeout(() => window.location.reload(), 0);
    }
  }

  private loadProjects() {
    this.api.get<any>('projects/').pipe(takeUntil(this.destroy$)).subscribe((res: any) => {
      this.projects = res?.results || res || [];
    });
  }

  toggleSidebar(): boolean {
    this.sidebarService.toggle(true, 'menu-sidebar');
    this.layoutService.changeLayoutSize();

    return false;
  }

  navigateHome() {
    this.menuService.navigateHome();
    return false;
  }
}
