import { Component, Input } from '@angular/core';
import { Observable } from 'rxjs';
import { Project, ProjectStatus } from '../../../@core/data/project';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'ngx-project',
  templateUrl: './project.component.html',
  styleUrls: ['./project.component.scss']
})
export class ProjectComponent {
@Input() projectId!: number;
  project$: Observable<Project> | undefined;


  // UX: Map status to labels and color classes
  statusConfig: Record<ProjectStatus, { label: string; class: string }> = {
    planned: { label: 'Planned', class: 'badge-gray' },
    in_progress: { label: 'In Progress', class: 'badge-blue' },
    completed: { label: 'Completed', class: 'badge-green' },
    cancelled: { label: 'Cancelled', class: 'badge-red' }
  };

  constructor(private api: RestApiService, private router: ActivatedRoute) {}

  ngOnInit(): void {
//get id from route if not provided as input
  
      this.loadProject();
    
  }

  loadProject() {

this.router.paramMap.subscribe(params => {
       this.projectId = Number(params.get('id'));
    // Assuming api.get returns an Observable
    this.project$ = this.api.get<Project>(`projects/${this.projectId}/`);

});
  }

  // Helper to format location string gracefully
  getLocationString(p: Project): string {
    const parts = [p.city?.name, p.province?.name, p.country?.name];
    return parts.filter(Boolean).join(', ');
  }
}
