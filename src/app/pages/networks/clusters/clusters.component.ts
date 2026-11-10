import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { GoogleMap } from '@angular/google-maps';
import { Router } from '@angular/router';
import { NbToastrService } from '@nebular/theme';
import { forkJoin, Subscription } from 'rxjs';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { ProjectContextService } from '../../../@core/utils/project-context.service';

type BalanceStatus = 'excess_heat' | 'heat_deficit' | 'balanced' | 'unknown';

interface ProjectOption {
  id: number;
  name: string;
}

interface ClusterConfigurationRow {
  id: number;
  name: string;
  description?: string;
  parameters?: any;
  cluster_count?: number;
  total_buildings?: number;
  algorithm?: string;
  project?: number;
  cluster_type?: 'standard' | 'complementary';
  base_network?: number;
  base_network_name?: string;
  source_cluster_configuration?: number;
  source_cluster_configuration_name?: string;
}

interface NetworkOption {
  id: number;
  name: string;
  route_count?: number;
  project_id?: number;
}

interface ClusterRow {
  id: number;
  name: string;
  type: string;
  no_of_buildings?: number;
  heating_demand?: number;
  cooling_demand?: number;
  total_source_capacity?: number;
  total_sink_capacity?: number;
  energy_balance_status: BalanceStatus;
  latitude?: number;
  longitude?: number;
  effective_radius?: number;
  cluster_configuration?: number;
  cluster_configuration_name?: string;
}

@Component({
  selector: 'ngx-clusters',
  templateUrl: './clusters.component.html',
  styleUrls: ['./clusters.component.scss'],
})
export class ClustersComponent implements OnInit, OnDestroy {
  @ViewChild(GoogleMap) map?: GoogleMap;

  projects: ProjectOption[] = [];
  configurations: ClusterConfigurationRow[] = [];
  clusters: ClusterRow[] = [];
  visibleClusters: ClusterRow[] = [];
  networks: NetworkOption[] = [];

  selectedProjectId: number | null = null;
  selectedConfigurationId: number | 'all' = 'all';

  createForm = {
    name: '',
    maxRadiusKm: 0.5,
  };
  complementaryForm = {
    networkId: null as number | null,
    sourceConfigurationId: null as number | null,
    maxRadiusKm: 0.5,
    name: '',
  };

  isLoadingProjects = false;
  isLoadingWorkspace = false;
  isCreating = false;
  isCreatingComplementary = false;
  isCreatingNetwork = false;
  errorMessage = '';

  center: google.maps.LatLngLiteral = { lat: 43.6532, lng: -79.3832 };
  zoom = 12;

  readonly mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    fullscreenControl: true,
    clickableIcons: false,
    mapTypeId: 'roadmap',
    styles: [
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'off' }] },
      { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    ],
  };

  private projectSub?: Subscription;

  constructor(
    private api: RestApiService,
    private projectContext: ProjectContextService,
    private router: Router,
    private toastr: NbToastrService,
  ) {}

  ngOnInit(): void {
    this.selectedProjectId = this.projectContext.selectedProjectId;
    this.loadProjects();
    this.projectSub = this.projectContext.selectedProject$.subscribe(projectId => {
      if (projectId !== this.selectedProjectId) {
        this.selectedProjectId = projectId;
        this.selectedConfigurationId = 'all';
        this.loadClusterWorkspace();
      }
    });
  }

  ngOnDestroy(): void {
    this.projectSub?.unsubscribe();
  }

  get selectedProjectName(): string {
    const project = this.projects.find(item => Number(item.id) === Number(this.selectedProjectId));
    return project?.name || 'current project';
  }

  get activeConfiguration(): ClusterConfigurationRow | null {
    if (this.selectedConfigurationId === 'all') return null;
    return this.configurations.find(item => Number(item.id) === Number(this.selectedConfigurationId)) || null;
  }

  get standardConfigurations(): ClusterConfigurationRow[] {
    return this.configurations.filter(config => (config.cluster_type || 'standard') === 'standard');
  }

  get complementaryConfigurations(): ClusterConfigurationRow[] {
    return this.configurations.filter(config => config.cluster_type === 'complementary');
  }

  get summary() {
    const clusters = this.visibleClusters;
    return {
      configurations: this.configurations.length,
      clusters: clusters.length,
      buildings: clusters.reduce((sum, cluster) => sum + Number(cluster.no_of_buildings || 0), 0),
      excess: clusters.filter(cluster => cluster.energy_balance_status === 'excess_heat').length,
      deficit: clusters.filter(cluster => cluster.energy_balance_status === 'heat_deficit').length,
      balanced: clusters.filter(cluster => cluster.energy_balance_status === 'balanced').length,
    };
  }

  loadProjects(): void {
    this.isLoadingProjects = true;
    this.api.get<any>('projects/?limit=500').subscribe({
      next: (res) => {
        this.projects = res?.results || res || [];
        if (!this.selectedProjectId && this.projects.length) {
          this.selectedProjectId = this.projects[0].id;
          this.projectContext.setProject(this.selectedProjectId);
        }
        this.isLoadingProjects = false;
        this.loadClusterWorkspace();
      },
      error: () => {
        this.errorMessage = 'Projects could not be loaded.';
        this.isLoadingProjects = false;
      },
    });
  }

  onProjectChange(projectId: number): void {
    this.selectedProjectId = Number(projectId);
    this.projectContext.setProject(this.selectedProjectId);
    this.selectedConfigurationId = 'all';
    this.loadClusterWorkspace();
  }

  loadClusterWorkspace(): void {
    if (!this.selectedProjectId) {
      this.configurations = [];
      this.clusters = [];
      this.visibleClusters = [];
      return;
    }

    this.isLoadingWorkspace = true;
    this.errorMessage = '';

    forkJoin({
      configurations: this.api.get<any>(`cluster_configurations/?project_id=${this.selectedProjectId}&limit=500`),
      clusters: this.api.get<any>(`clusters/?project_id=${this.selectedProjectId}&limit=1000`),
      networks: this.api.get<any>(`networks/?project_id=${this.selectedProjectId}&limit=500`),
    }).subscribe({
      next: ({ configurations, clusters, networks }) => {
        this.configurations = configurations?.results || configurations || [];
        this.clusters = (clusters?.results || clusters || []).map((cluster: ClusterRow) => this.normalizeCluster(cluster));
        this.networks = networks?.results || networks || [];

        const networkExists = this.networks.some(network => Number(network.id) === Number(this.complementaryForm.networkId));
        if ((!this.complementaryForm.networkId || !networkExists) && this.networks.length) {
          this.complementaryForm.networkId = this.networks[0].id;
        }
        const sourceExists = this.standardConfigurations.some(config => Number(config.id) === Number(this.complementaryForm.sourceConfigurationId));
        if (!sourceExists) this.complementaryForm.sourceConfigurationId = null;

        const selectedConfigExists = this.selectedConfigurationId !== 'all'
          && this.configurations.some(config => Number(config.id) === Number(this.selectedConfigurationId));

        if (this.configurations.length && (this.selectedConfigurationId === 'all' || !selectedConfigExists)) {
          this.selectedConfigurationId = this.configurations[0].id;
        } else if (!this.configurations.length) {
          this.selectedConfigurationId = 'all';
        }

        this.applyConfigurationFilter();
        this.isLoadingWorkspace = false;
      },
      error: () => {
        this.errorMessage = 'Clusters could not be loaded.';
        this.isLoadingWorkspace = false;
      },
    });
  }

  createComplementaryConfiguration(): void {
    if (!this.complementaryForm.networkId || this.isCreatingComplementary) {
      this.toastr.warning('Select a network.', 'Complementary Clusters');
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
      next: (result) => {
        this.isCreatingComplementary = false;
        this.complementaryForm.name = '';
        this.selectedConfigurationId = result?.config_id || this.selectedConfigurationId;
        this.toastr.success(result?.message || 'Complementary cluster configuration created.', 'Complementary Clusters');
        this.loadClusterWorkspace();
      },
      error: (err) => {
        this.isCreatingComplementary = false;
        const message = err?.error?.error || err?.error?.detail || 'Complementary cluster creation failed.';
        this.errorMessage = message;
        this.toastr.danger(message, 'Complementary Clusters');
      },
    });
  }

  createClusters(): void {
    if (!this.selectedProjectId || this.isCreating) return;

    const maxRadiusKm = Number(this.createForm.maxRadiusKm);
    if (!maxRadiusKm || maxRadiusKm <= 0) {
      this.toastr.warning('Enter a positive maximum radius.', 'Clusters');
      return;
    }

    this.isCreating = true;
    this.errorMessage = '';

    this.api.post<any>({
      project_id: this.selectedProjectId,
      max_radius_km: maxRadiusKm,
      name: this.createForm.name.trim(),
    }, 'project/cluster/').subscribe({
      next: (result) => {
        this.isCreating = false;
        this.createForm.name = '';
        this.selectedConfigurationId = result?.config_id || 'all';
        this.toastr.success(`${result?.clusters_created || 0} clusters created.`, 'Clusters');
        this.loadClusterWorkspace();
      },
      error: (err) => {
        this.isCreating = false;
        const message = err?.error?.message || err?.error?.detail || 'Cluster creation failed.';
        this.errorMessage = message;
        this.toastr.danger(message, 'Clusters');
      },
    });
  }

  onConfigurationChange(configId: number | 'all'): void {
    this.selectedConfigurationId = configId;
    this.applyConfigurationFilter();
  }

  openConfiguration(config: ClusterConfigurationRow): void {
    this.router.navigate(['/pages/cluster-configurations', config.id]);
  }

  openCluster(cluster: ClusterRow): void {
    this.router.navigate(['/pages/clusters', cluster.id]);
  }

  goToComparison(): void {
    this.router.navigate(['/pages/clusters/compare']);
  }

  createNetworkFromConfiguration(config: ClusterConfigurationRow): void {
    if (!config?.id || this.isCreatingNetwork) return;

    this.isCreatingNetwork = true;
    this.api.post<any>({
      source_type: 'configuration',
      source_id: config.id,
      network_name: `Macro Network: ${config.name || `Configuration ${config.id}`}`,
    }, 'network/create-from-cluster/').subscribe({
      next: (result) => {
        this.isCreatingNetwork = false;
        this.toastr.success(result?.message || 'Cluster-level network created.', 'Clusters');
        if (result?.network_id) {
          this.router.navigate(['/pages/networks', result.network_id]);
        }
      },
      error: (err) => {
        this.isCreatingNetwork = false;
        this.toastr.danger(err?.error?.message || 'Network creation failed.', 'Clusters');
      },
    });
  }

  statusLabel(status: BalanceStatus): string {
    const labels: Record<BalanceStatus, string> = {
      excess_heat: 'Excess heat',
      heat_deficit: 'Heat deficit',
      balanced: 'Balanced',
      unknown: 'Unknown',
    };
    return labels[status] || 'Unknown';
  }

  statusClass(status: BalanceStatus): string {
    return status || 'unknown';
  }

  getClusterMarkerOptions(cluster: ClusterRow): google.maps.MarkerOptions {
    const color = this.statusColor(cluster.energy_balance_status);
    return {
      title: cluster.name || `Cluster ${cluster.id}`,
      zIndex: 20,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: color,
        fillOpacity: 0.95,
        strokeColor: '#ffffff',
        strokeWeight: 3,
      },
      label: {
        text: String(cluster.no_of_buildings || 0),
        color: '#ffffff',
        fontWeight: '700',
        fontSize: '12px',
      },
    };
  }

  getClusterCircleOptions(cluster: ClusterRow): google.maps.CircleOptions {
    const color = this.statusColor(cluster.energy_balance_status);
    return {
      strokeColor: color,
      strokeOpacity: 0.7,
      strokeWeight: 2,
      fillColor: color,
      fillOpacity: 0.12,
      clickable: false,
    };
  }

  trackById(index: number, item: { id: number }): number {
    return item.id;
  }

  private normalizeCluster(cluster: ClusterRow): ClusterRow {
    return {
      ...cluster,
      latitude: cluster.latitude === null || cluster.latitude === undefined ? undefined : Number(cluster.latitude),
      longitude: cluster.longitude === null || cluster.longitude === undefined ? undefined : Number(cluster.longitude),
      effective_radius: Number(cluster.effective_radius || 100),
      no_of_buildings: Number(cluster.no_of_buildings || 0),
      heating_demand: Number(cluster.heating_demand || cluster.total_sink_capacity || 0),
      cooling_demand: Number(cluster.cooling_demand || cluster.total_source_capacity || 0),
      energy_balance_status: cluster.energy_balance_status || 'unknown',
    };
  }

  private applyConfigurationFilter(): void {
    this.visibleClusters = this.selectedConfigurationId === 'all'
      ? [...this.clusters]
      : this.clusters.filter(cluster => Number(cluster.cluster_configuration) === Number(this.selectedConfigurationId));

    setTimeout(() => this.fitMapToClusters(), 0);
  }

  private fitMapToClusters(): void {
    if (!this.map || !this.visibleClusters.length || typeof google === 'undefined') return;

    const bounds = new google.maps.LatLngBounds();
    let hasPoint = false;
    this.visibleClusters.forEach(cluster => {
      if (cluster.latitude !== undefined && cluster.longitude !== undefined) {
        bounds.extend({ lat: cluster.latitude, lng: cluster.longitude });
        hasPoint = true;
      }
    });

    if (hasPoint) {
      this.map.fitBounds(bounds, 72);
    }
  }

  private statusColor(status: BalanceStatus): string {
    if (status === 'excess_heat') return '#00a86b';
    if (status === 'heat_deficit') return '#d92947';
    if (status === 'balanced') return '#3366ff';
    return '#6b7280';
  }
}
