import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { LocalDataSource } from 'ng2-smart-table';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { forkJoin, Subscription } from 'rxjs';
import { NbToastrService } from '@nebular/theme';
import { ProjectContextService } from '../../../@core/utils/project-context.service';

interface ProjectOption {
  id: number;
  name: string;
}

interface NetworkOption {
  id: number;
  name: string;
  route_count?: number;
  project_id?: number;
}

interface ClusterConfigurationOption {
  id: number;
  name?: string;
  cluster_type?: 'standard' | 'complementary';
  cluster_count?: number;
  total_buildings?: number;
  base_network?: number;
  base_network_name?: string;
  source_cluster_configuration?: number;
  source_cluster_configuration_name?: string;
}

@Component({
  selector: 'ngx-cluster-configurations',
  templateUrl: './cluster-configurations.component.html',
  styleUrls: ['./cluster-configurations.component.scss']
})
export class ClusterConfigurationsComponent implements OnInit, OnDestroy {
url: string =  'cluster_configurations/';
link: string = 'cluster-configurations';
settings = {
    add: {
      addButtonContent: '<i class="nb-plus"></i>',
      createButtonContent: '<i class="nb-checkmark"></i>',
      cancelButtonContent: '<i class="nb-close"></i>',
      confirmCreate: true, // Requires confirmation

    },
    edit: {
      editButtonContent: '<i class="nb-edit"></i>',
      saveButtonContent: '<i class="nb-checkmark"></i>',
      cancelButtonContent: '<i class="nb-close"></i>',
      confirmSave: true
    },
    delete: {
      deleteButtonContent: '<i class="nb-trash"></i>',
      confirmDelete: true,
    },
    columns: {
    
      name: {
       title: 'Name',
      type: 'html',
          valuePrepareFunction: (name: string, row: any) => {
        return `<a href="pages/${this.link}/${row.id}">${name}</a>`;
      }
      },
      cluster_type: {
        title: 'Kind',
        type: 'string',
        valuePrepareFunction: (value: string) => value === 'complementary' ? 'Complementary' : 'Standard',
      },
      base_network_name: {
        title: 'Base Network',
        type: 'string',
        valuePrepareFunction: (value: string) => value || '-',
      },
      description: {
        title: 'Description',
        type: 'string',
        
      }
      
    },
  };

  source: LocalDataSource = new LocalDataSource();
  projects: ProjectOption[] = [];
  networks: NetworkOption[] = [];
  standardConfigurations: ClusterConfigurationOption[] = [];
  complementaryConfigurations: ClusterConfigurationOption[] = [];
  selectedProjectId: number | null = null;
  complementaryForm = {
    networkId: null as number | null,
    sourceConfigurationId: null as number | null,
    maxRadiusKm: 0.5,
    name: '',
  };
  isLoading = false;
  isCreatingComplementary = false;
  errorMessage = '';
  private projectSub?: Subscription;

  constructor(
      @Inject(RestApiService) private api: RestApiService, 
      private http: HttpClient, // ServerDataSource needs raw HttpClient usually
      private router: Router,
      private route: ActivatedRoute,
      private toastr: NbToastrService,
      private projectContext: ProjectContextService,
    ) {
    }
  
    ngOnInit() {
      this.selectedProjectId = this.projectContext.selectedProjectId;
      this.loadProjects();
      this.projectSub = this.projectContext.selectedProject$.subscribe(projectId => {
        if (projectId !== this.selectedProjectId) {
          this.selectedProjectId = projectId;
          this.resetComplementaryForm();
          this.loadWorkspace();
          this.initTableSource();
        }
      });
    }

    ngOnDestroy(): void {
      this.projectSub?.unsubscribe();
    }

    initTableSource(): void {
      this.source = new LocalDataSource();
    }

    loadProjects(): void {
      this.http.get<any>(`${environment.appUrl}/projects/?limit=500`).subscribe({
        next: (response) => {
          this.projects = this.responseRows(response);
          if (!this.selectedProjectId && this.projects.length) {
            this.selectedProjectId = this.projects[0].id;
            this.projectContext.setProject(this.selectedProjectId);
          }
          this.initTableSource();
          this.loadWorkspace();
        },
        error: () => {
          this.errorMessage = 'Projects could not be loaded.';
          this.initTableSource();
        },
      });
    }

    onProjectChange(projectId: number): void {
      this.selectedProjectId = Number(projectId);
      this.projectContext.setProject(this.selectedProjectId);
      this.resetComplementaryForm();
      this.initTableSource();
      this.loadWorkspace();
    }

    loadWorkspace(): void {
      if (!this.selectedProjectId) {
        this.networks = [];
        this.standardConfigurations = [];
        this.complementaryConfigurations = [];
        this.source.load([]);
        return;
      }

      this.isLoading = true;
      this.errorMessage = '';
      forkJoin({
        networks: this.http.get<any>(`${environment.appUrl}/networks/?project_id=${this.selectedProjectId}&limit=500`),
        standard: this.http.get<any>(`${environment.appUrl}/cluster_configurations/?project_id=${this.selectedProjectId}&cluster_type=standard&limit=500`),
        complementary: this.http.get<any>(`${environment.appUrl}/cluster_configurations/?project_id=${this.selectedProjectId}&cluster_type=complementary&limit=500`),
      }).subscribe({
        next: ({ networks, standard, complementary }) => {
          this.networks = this.responseRows(networks);
          this.standardConfigurations = this.responseRows(standard);
          this.complementaryConfigurations = this.responseRows(complementary);
          this.source.load([...this.standardConfigurations, ...this.complementaryConfigurations]);
          this.ensureComplementaryDefaults();
          this.isLoading = false;
        },
        error: () => {
          this.errorMessage = 'Cluster configuration workspace could not be loaded.';
          this.isLoading = false;
        },
      });
    }

    createComplementaryConfiguration(): void {
      if (!this.complementaryForm.networkId || this.isCreatingComplementary) {
        this.toastr.warning('Select a base network.', 'Complementary Clusters');
        return;
      }

      this.isCreatingComplementary = true;
      this.errorMessage = '';
      const payload: any = {
        network_id: this.complementaryForm.networkId,
        max_radius_km: this.complementaryForm.maxRadiusKm,
        name: this.complementaryForm.name.trim(),
      };
      if (this.complementaryForm.sourceConfigurationId) {
        payload.source_cluster_configuration_id = this.complementaryForm.sourceConfigurationId;
      }

      this.api.post<any>(payload, 'cluster_configurations/create-complementary/').subscribe({
        next: (response) => {
          this.isCreatingComplementary = false;
          this.complementaryForm.name = '';
          this.toastr.success(response?.message || 'Complementary cluster configuration created.', 'Complementary Clusters');
          this.loadWorkspace();
          this.source.refresh();
        },
        error: (err) => {
          this.isCreatingComplementary = false;
          const message = err?.error?.error || err?.error?.detail || 'Complementary cluster creation failed.';
          this.errorMessage = message;
          this.toastr.danger(message, 'Complementary Clusters');
        },
      });
    }

    openConfiguration(config: ClusterConfigurationOption): void {
      if (config?.id) {
        this.router.navigate(['/pages/cluster-configurations', config.id]);
      }
    }

    trackById(_: number, item: { id: number }): number {
      return item.id;
    }

    private ensureComplementaryDefaults(): void {
      const networkExists = this.networks.some(network => Number(network.id) === Number(this.complementaryForm.networkId));
      if ((!this.complementaryForm.networkId || !networkExists) && this.networks.length) {
        this.complementaryForm.networkId = this.networks[0].id;
      }
      const configExists = this.standardConfigurations.some(config => Number(config.id) === Number(this.complementaryForm.sourceConfigurationId));
      if (!configExists) this.complementaryForm.sourceConfigurationId = null;
    }

    private resetComplementaryForm(): void {
      this.complementaryForm = {
        networkId: null,
        sourceConfigurationId: null,
        maxRadiusKm: 0.5,
        name: '',
      };
    }

    private responseRows(response: any): any[] {
      if (Array.isArray(response)) return response;
      if (Array.isArray(response?.results)) return response.results;
      return [];
    }

  onDeleteConfirm(event): void {
    if (window.confirm('Are you sure you want to delete?')) {
      console.log("Deleting Network with ID:", event.data.id);
      event.confirm.resolve();
      this.api.delete(`${event.data.id}/`, this.url)
    .subscribe((data: any) => 
      {
        console.log("Network deleted successfully:", data);
        this.source.remove(event.data);             
      })
    } else {
      event.confirm.reject();
    }
  }
onEditConfirm(event: any): void {
    if (window.confirm('Are you sure you want to update?')) {
      const data = {
          name: event.newData.name,
          longitude: event.newData.longitude,
          latitude: event.newData.latitude
      }
    this.api.update(event.data.id,data, this.url).subscribe({
      next: (res) => event.confirm.resolve(res),
      error: (err) => event.confirm.reject()
    });
  } else {
    event.confirm.reject();
  }
}
onCreateConfirm(event: any): void {
  // event.newData - contains the new record data
  if (window.confirm('Are you sure you want to create this item?')) {
    console.log("Creating new Network with data:", event.newData);
    this.api.post(event.newData, this.url).subscribe({
      next: (res) => event.confirm.resolve(res),
      error: (err) => event.confirm.reject()
    });
  } else {
    event.confirm.reject();
  }
}
goToComparison(): void {
    // Navigate to the edge comparison page
    window.location.href = '/pages/cluster-configurations/comparison';
  }
}
