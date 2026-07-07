import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ProjectOption {
  id: number;
  name: string;
}

@Injectable({
  providedIn: 'root',
})
export class ProjectContextService {
  private readonly storageKey = 'currentProjectId';
  private readonly selectedProjectSubject = new BehaviorSubject<number | null>(this.readStoredProjectId());

  selectedProject$ = this.selectedProjectSubject.asObservable();

  get selectedProjectId(): number | null {
    return this.selectedProjectSubject.value;
  }

  setProject(projectId: number | string | null): void {
    const normalized = projectId === null || projectId === 'all' || projectId === ''
      ? null
      : Number(projectId);

    if (!normalized || Number.isNaN(normalized)) {
      localStorage.removeItem(this.storageKey);
      this.selectedProjectSubject.next(null);
      return;
    }

    localStorage.setItem(this.storageKey, String(normalized));
    this.selectedProjectSubject.next(normalized);
  }

  appendProjectScope(pathOrUrl: string): string {
    const projectId = this.selectedProjectId;
    if (!projectId || !this.isProjectScopedPath(pathOrUrl) || this.hasScopeParam(pathOrUrl)) {
      return pathOrUrl;
    }

    const separator = pathOrUrl.includes('?') ? '&' : '?';
    return `${pathOrUrl}${separator}project_id=${projectId}`;
  }

  private readStoredProjectId(): number | null {
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) return null;

    const parsed = Number(stored);
    return parsed && !Number.isNaN(parsed) ? parsed : null;
  }

  private hasScopeParam(pathOrUrl: string): boolean {
    return /(^|[?&])(project_id|project|network__project)=/.test(pathOrUrl);
  }

  private isProjectScopedPath(pathOrUrl: string): boolean {
    const cleanPath = pathOrUrl
      .replace(/^https?:\/\/[^/]+\//, '')
      .replace(/^\//, '')
      .replace(/^api\//, '');

    return [
      'buildings/',
      'loadprofiles/',
      'load-profiles/',
      'networks/',
      'nodes/',
      'edges/',
      'routes/',
      'clusters/',
      'clusters2/',
      'cluster-algorithms/',
      'cluster_configurations/',
      'cluster-configurations/',
      'edge_algorithms/',
      'edge-connection-algorithms/',
      'edge_connection_algorithms/',
      'edge_translations/',
      'pipe-sizings/',
      'pipe_sizes/',
      'pipes/',
      'edge-pipe-sizings/',
      'network-design-constants/',
    ].some(prefix => cleanPath.startsWith(prefix));
  }
}
