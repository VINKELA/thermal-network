import { Component, Inject, OnInit } from '@angular/core';
import { LocalDataSource, ServerDataSource } from 'ng2-smart-table';
import { NetworkApiService } from '../../../@core/data-services/networks/network-api.service';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { RestApiService } from '../../../@core/utils/rest-api.service';

@Component({
  selector: 'ngx-networks',
  templateUrl: './networks.component.html',
  styleUrls: ['./networks.component.scss']
})
export class NetworksComponent implements OnInit {
  url: string = 'networks/';
  link: string = 'networks';

  settings: any = {
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
        const projects = res.results || res || [];
        const projectOptions = projects.map((p: any) => ({
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
