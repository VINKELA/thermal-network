import { Component, Inject, OnInit } from '@angular/core';
import { LocalDataSource, ServerDataSource } from 'ng2-smart-table';
import { NetworkApiService } from '../../../@core/data-services/networks/network-api.service';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'ngx-networks',
  templateUrl: './networks.component.html',
  styleUrls: ['./networks.component.scss']
})
export class NetworksComponent implements OnInit {
  url: string = 'networks/';
  link: string = 'networks';
  projects: any[] = [];
  buildings: any[] = [];
  selectedBuildingIds = new Set<number>();
  isLoadingBuildings = false;
  isCreatingNetwork = false;
  isTaggingBuildings = false;
  buildingSearch = '';
  bulkTag = 'all';
  bulkFsa = 'all';
  bulkType = 'all';
  tagToApply = '';
  createForm = {
    project: null as number | null,
    name: '',
    description: '',
    network_type: 'district_heating',
    latitude: null as number | null,
    longitude: null as number | null,
    selectionMode: 'all' as 'all' | 'specific',
    include_boilers: true,
    include_heat_exchangers: true,
  };
  networkTypes = [
    { value: 'district_heating', label: 'District Heating' },
    { value: 'district_cooling', label: 'District Cooling' },
    { value: 'combined', label: 'Combined Heating and Cooling' },
  ];
  buildingTypes = [
    { value: 'residential', label: 'Residential' },
    { value: 'commercial', label: 'Commercial' },
    { value: 'industrial', label: 'Industrial' },
    { value: 'public', label: 'Public' },
    { value: 'other', label: 'Other' },
  ];

  settings: any = {
    actions: {
      add: false,
      edit: true,
      delete: true,
    },
    add: {
      addButtonContent: '<i class="nb-plus"></i>',
      createButtonContent: '<i class="nb-checkmark"></i>',
      cancelButtonContent: '<i class="nb-close"></i>',
      confirmCreate: true, 
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
          return `<a href="pages/networks/${row.id}">${name || 'Unnamed Network'}</a>`;
        }
      },
      network_type: {
        title: 'Type',
        type: 'string',
      },
      derivation_stage: {
        title: 'Stage',
        type: 'string',
        editable: false,
        addable: false,
      },
      derivation_method: {
        title: 'Method',
        type: 'string',
        editable: false,
        addable: false,
      },
      parent_network_name: {
        title: 'Parent Network',
        type: 'html',
        editable: false,
        addable: false,
        valuePrepareFunction: (_: any, row: any) => {
          if (!row.parent_network) return 'Root';
          return `<a href="pages/networks/${row.parent_network}">${row.parent_network_name || 'Network ' + row.parent_network}</a>`;
        }
      },
      project: {
        title: 'Project',
        type: 'html',
        editor: {
          type: 'list',
          config: {
            list: [] // Populated dynamically in ngOnInit
          }
        },
        valuePrepareFunction: (project: any, row: any) => {
          if (!row.project) return 'No Project';
          if (row.project.name) {
            return `<a href="pages/projects/${row.project.id}">${row.project.name}</a>`;
          }
          return `Project ID: ${row.project}`;
        }
      },
    },
  };

  source!: ServerDataSource;

  constructor(
      @Inject(RestApiService) private api: NetworkApiService, 
      private http: HttpClient, 
      private router: Router,
      private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.source = new ServerDataSource(this.http, {
      endPoint: environment.appUrl + '/' + this.url, 
      pagerPageKey: 'page', 
      sortFieldKey: 'ordering', 
      pagerLimitKey: 'limit', 
      dataKey: 'results', 
      totalKey: 'count',
    });

    this.loadProjectsForDropdown();
  }

  loadProjectsForDropdown() {
    this.http.get<any>(`${environment.appUrl}/projects/`).subscribe({
      next: (res) => {
        this.projects = res.results || res || [];
        const projectOptions = this.projects.map((p: any) => ({
          value: p.id,
          title: p.name
        }));

        // Deep clone the settings object to trigger Angular change detection
        const newSettings = Object.assign({}, this.settings);
        newSettings.columns.project.editor.config.list = projectOptions;
        this.settings = newSettings;
      },
      error: (err) => console.error('Failed to load projects for dropdown', err)
    });
  }

  get selectedProjectName(): string {
    const project = this.projects.find(item => Number(item.id) === Number(this.createForm.project));
    return project?.name || 'selected project';
  }

  get availableTags(): string[] {
    return this.uniqueValues('tag');
  }

  get availableFsas(): string[] {
    return this.uniqueValues('fsa');
  }

  get filteredBuildings(): any[] {
    const query = this.buildingSearch.trim().toLowerCase();
    return this.buildings.filter(building => {
      const matchesSearch = !query ||
        String(building.name || '').toLowerCase().includes(query) ||
        String(building.fsa || '').toLowerCase().includes(query) ||
        String(building.tag || '').toLowerCase().includes(query);
      const matchesTag = this.bulkTag === 'all' || (this.bulkTag === '__untagged__' ? !building.tag : building.tag === this.bulkTag);
      const matchesFsa = this.bulkFsa === 'all' || building.fsa === this.bulkFsa;
      const matchesType = this.bulkType === 'all' || building.building_type === this.bulkType;
      return matchesSearch && matchesTag && matchesFsa && matchesType;
    });
  }

  get selectedBuildingCount(): number {
    return this.createForm.selectionMode === 'all'
      ? this.buildings.length
      : this.selectedBuildingIds.size;
  }

  get canCreateNetwork(): boolean {
    return Boolean(
      this.createForm.project &&
      this.createForm.name.trim() &&
      (this.createForm.selectionMode === 'all' ? this.buildings.length > 0 : this.selectedBuildingIds.size > 0)
    );
  }

  onCreateProjectChange(projectId: number): void {
    this.createForm.project = Number(projectId);
    this.selectedBuildingIds = new Set<number>();
    this.bulkTag = 'all';
    this.bulkFsa = 'all';
    this.bulkType = 'all';
    this.buildingSearch = '';
    this.loadBuildingsForProject(this.createForm.project);
  }

  loadBuildingsForProject(projectId: number | null): void {
    if (!projectId) {
      this.buildings = [];
      return;
    }

    this.isLoadingBuildings = true;
    this.http.get<any>(`${environment.appUrl}/buildings/?project_id=${projectId}&limit=10000`).subscribe({
      next: (res) => {
        this.buildings = res.results || res || [];
        this.isLoadingBuildings = false;
      },
      error: (err) => {
        console.error('Failed to load project buildings', err);
        this.buildings = [];
        this.isLoadingBuildings = false;
      },
    });
  }

  toggleBuilding(buildingId: number, checked: boolean): void {
    const nextSelection = new Set(this.selectedBuildingIds);
    if (checked) {
      nextSelection.add(Number(buildingId));
    } else {
      nextSelection.delete(Number(buildingId));
    }
    this.selectedBuildingIds = nextSelection;
  }

  isBuildingSelected(buildingId: number): boolean {
    return this.selectedBuildingIds.has(Number(buildingId));
  }

  selectFilteredBuildings(): void {
    const nextSelection = new Set(this.selectedBuildingIds);
    this.filteredBuildings.forEach(building => nextSelection.add(Number(building.id)));
    this.selectedBuildingIds = nextSelection;
    this.createForm.selectionMode = 'specific';
  }

  clearBuildingSelection(): void {
    this.selectedBuildingIds = new Set<number>();
  }

  applyTagToSelectedBuildings(): void {
    const ids = Array.from(this.selectedBuildingIds);
    const tag = this.tagToApply.trim() || null;
    if (!ids.length) {
      alert('Select buildings first, then apply a tag.');
      return;
    }

    this.isTaggingBuildings = true;
    const updates = ids.map(id => this.http.patch(`${environment.appUrl}/buildings/${id}/`, { tag }));
    forkJoin(updates).subscribe({
      next: () => {
        this.isTaggingBuildings = false;
        this.tagToApply = '';
        this.loadBuildingsForProject(this.createForm.project);
      },
      error: (err) => {
        console.error('Failed to tag selected buildings', err);
        this.isTaggingBuildings = false;
        alert('Could not update building tags. Check the console for details.');
      },
    });
  }

  createNetworkFromSelection(): void {
    if (!this.canCreateNetwork || !this.createForm.project) return;

    this.isCreatingNetwork = true;
    const payload = {
      name: this.createForm.name.trim(),
      description: this.createForm.description,
      network_type: this.createForm.network_type,
      longitude: this.createForm.longitude,
      latitude: this.createForm.latitude,
      building_selection: this.createForm.selectionMode,
      building_ids: this.createForm.selectionMode === 'specific'
        ? Array.from(this.selectedBuildingIds)
        : [],
      include_boilers: this.createForm.include_boilers,
      include_heat_exchangers: this.createForm.include_heat_exchangers,
    };

    this.http.post(`${environment.appUrl}/projects/${this.createForm.project}/create-network/`, payload).subscribe({
      next: (res: any) => {
        this.isCreatingNetwork = false;
        this.resetCreateForm(false);
        this.source.refresh();
        if (res?.network_id) {
          this.router.navigate(['/pages/networks', res.network_id]);
        }
      },
      error: (err) => {
        console.error('Failed to create network from selection', err);
        this.isCreatingNetwork = false;
        alert(err?.error?.error || 'Failed to create network. Check the console for details.');
      },
    });
  }

  resetCreateForm(clearProject = true): void {
    const project = clearProject ? null : this.createForm.project;
    this.createForm = {
      project,
      name: '',
      description: '',
      network_type: 'district_heating',
      latitude: null,
      longitude: null,
      selectionMode: 'all',
      include_boilers: true,
      include_heat_exchangers: true,
    };
    this.selectedBuildingIds = new Set<number>();
    this.tagToApply = '';
  }

  private uniqueValues(field: string): string[] {
    return Array.from(new Set(
      this.buildings
        .map(building => String(building[field] || '').trim())
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b));
  }

  onDeleteConfirm(event: any): void {
    if (window.confirm('Are you sure you want to delete?')) {
      this.api.delete(event.data.id).subscribe({
        next: () => {
          event.confirm.resolve();
          this.source.remove(event.data);
        },
        error: (err) => {
          console.error('Delete failed', err);
          event.confirm.reject();
        }
      });
    } else {
      event.confirm.reject();
    }
  }

  onEditConfirm(event: any): void {
    if (window.confirm('Are you sure you want to update?')) {
      const data = {
          name: event.newData.name,
          network_type: event.newData.network_type,
          longitude: event.newData.longitude,
          latitude: event.newData.latitude,
          project: event.newData.project 
      };

      this.api.update(event.data.id, data).subscribe({
        next: (res) => {
          event.confirm.resolve(res);
          this.source.refresh(); // Fetch the fully serialized object to update the UI
        },
        error: (err) => {
          console.error('Update failed', err);
          event.confirm.reject();
        }
      });
    } else {
      event.confirm.reject();
    }
  }

  onCreateConfirm(event: any): void {
    if (window.confirm('Are you sure you want to create this network?')) {
      
      const projectId = event.newData.project;

      if (!projectId) {
        alert('You must select a Project to create a Network.');
        event.confirm.reject();
        return;
      }

      const payload = {
        name: event.newData.name,
        network_type: event.newData.network_type,
        longitude: event.newData.longitude,
        latitude: event.newData.latitude
      };

      const createUrl = `${environment.appUrl}/projects/${projectId}/create-network/`;

      this.http.post(createUrl, payload).subscribe({
        next: (res) => {
          event.confirm.resolve(res);
          this.source.refresh(); 
        },
        error: (err) => {
          console.error('Failed to create network via custom endpoint:', err);
          alert('Failed to create network. Check the console for details.');
          event.confirm.reject();
        }
      });
    } else {
      event.confirm.reject();
    }
  }

  goToComparison() {
    this.router.navigate(['compare'], { relativeTo: this.route });
  }
}
