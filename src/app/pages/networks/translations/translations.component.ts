import { Component, Inject, OnDestroy } from '@angular/core';
import { LocalDataSource, ServerDataSource } from 'ng2-smart-table';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { NbToastrService } from '@nebular/theme';
import { Subscription, timer } from 'rxjs';
import { BackgroundOperation, BackgroundOperationService } from '../../../@core/utils/background-operation.service';

@Component({
  selector: 'ngx-translations',
  templateUrl: './translations.component.html',
  styleUrls: ['./translations.component.scss']
})
export class TranslationsComponent implements OnDestroy {
url: string =  'edge_translations/';
link: string = 'edge_translations';
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
      translation: {
        title: 'Routing Strategy',
        type: 'string',
        editor: {
          type: 'list',
          config: {
            list: [
              { value: 'driving', title: 'Road shortest path' },
              { value: 'walking', title: 'Pedestrian corridor' },
              { value: 'bicycling', title: 'Cycling corridor' },
              { value: 'direct', title: 'Direct geodesic baseline' },
            ],
          },
        },
      },
      edge_connection_algorithm: {
        title: 'Source Connection',
        type: 'html',
        editor: {
          type: 'list',
          config: {
            list: [],
          },
        },
        valuePrepareFunction: (_: any, row: any) => {
          if (row.edge_connection_algorithm_name) return row.edge_connection_algorithm_name;
          if (row.edge_connection_algorithm) return `Connection ${row.edge_connection_algorithm}`;
          return 'Select source';
        },
      },
      network: {
        title: 'Output Network',
        type: 'html',
        addable: false,
        editable: false,
        valuePrepareFunction: (network: any) => {
          if (!network) return '';
          if (network.name) return `<a href="pages/networks/${network.id}">${network.name}</a>`;
          return `Network ID: ${network}`;
        },
      },
      source_network: {
        title: 'Parent Network',
        type: 'html',
        addable: false,
        editable: false,
        valuePrepareFunction: (network: any) => {
          if (!network) return '';
          if (network.name) return `<a href="pages/networks/${network.id}">${network.name}</a>`;
          return `Network ID: ${network}`;
        },
      },
      total_edge_length: {
        title: 'Route Length',
        type: 'number',
        
      },
      
    },
  };

  source: LocalDataSource = new LocalDataSource();
  activeOperations: BackgroundOperation[] = [];
  private taskPolling?: Subscription;

  constructor(
      @Inject(RestApiService) private api: RestApiService, 
      private http: HttpClient, // ServerDataSource needs raw HttpClient usually
      private router: Router,
      private route: ActivatedRoute,
      private toastr: NbToastrService,
      private operations: BackgroundOperationService
    ) {
    }
  
    ngOnInit() {
      // 2. Initialize the ServerDataSource with configuration
      this.source = new ServerDataSource(this.http, {
        endPoint: environment.appUrl + '/' + this.url, // Full URL required here
        
        // Map the "page" query parameter
        pagerPageKey: 'page', 
        
        // If you want sorting/filtering to trigger server calls:
        sortFieldKey: 'ordering', 
        pagerLimitKey: 'limit', // Only if your API supports dynamic page size
  
        // 3. Map the response: 'results' is your data array, 'count' is total
        dataKey: 'results', 
        totalKey: 'count',
      });

      this.loadConnectionAlgorithmsForDropdown();
      this.restoreActiveOperations();
    }

    ngOnDestroy(): void {
      this.stopTaskPolling();
    }

  loadConnectionAlgorithmsForDropdown() {
    this.http.get<any>(`${environment.appUrl}/edge_connection_algorithms/`).subscribe({
      next: (res: any) => {
        const connections = res.results || res || [];
        const options = connections.map((conn: any) => ({
          value: conn.id,
          title: `${conn.name} (${conn.network?.name || 'Network ' + conn.network?.id})`,
        }));

        const newSettings: any = Object.assign({}, this.settings);
        newSettings.columns.edge_connection_algorithm.editor.config.list = options;
        this.settings = newSettings;
      },
      error: (err) => console.error('Failed to load connection algorithms for route tracing dropdown', err),
    });
  }
  onDeleteConfirm(event: { data: { id: string; }; confirm: { resolve: () => void; reject: () => void; }; }): void {
    if (window.confirm('Are you sure you want to delete?')) {
      console.log("Deleting Network with ID:", event.data.id);
      event.confirm.resolve();
      this.api.delete(this.url, event.data.id)
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
  if (window.confirm('Create a new derived network with traced routes?')) {
    const connectionId = event.newData.edge_connection_algorithm;
    if (!connectionId) {
      alert('Please select a source connection algorithm.');
      event.confirm.reject();
      return;
    }

    const payload = {
      name: event.newData.name,
      translation: event.newData.translation || 'driving',
      edge_connection_algorithm_id: connectionId,
    };

    this.api.post(payload, this.url).subscribe({
      next: (res: any) => {
        if (res?.task_id) {
          event.confirm.reject();
          this.operations.track({
            taskId: res.task_id,
            type: 'route-tracing',
            label: event.newData.name || `Route tracing ${connectionId}`,
            status: res.status || 'PENDING',
            message: res.message || 'Route tracing is running in Celery.',
            sourceId: Number(connectionId),
          });
          this.restoreActiveOperations();
          this.toastr.info(res.message || 'Route tracing queued in the background.', 'Route Tracing Queued');
          return;
        }

        event.confirm.resolve(res);
        this.toastr.success(
          res?.message || 'Route tracing completed and a new network was created.',
          'Route Tracing Created'
        );
        this.source.refresh();
      },
      error: (err) => {
        console.error('Route tracing failed:', err);
        this.toastr.danger(
          err?.error?.message || 'Route tracing failed.',
          'Route Tracing Failed'
        );
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

private restoreActiveOperations(): void {
  this.activeOperations = this.operations.active('route-tracing');
  if (this.activeOperations.length) {
    this.startTaskPolling();
  } else {
    this.stopTaskPolling();
  }
}

private startTaskPolling(): void {
  if (this.taskPolling) return;
  this.taskPolling = timer(0, 2500).subscribe(() => {
    this.activeOperations.forEach(operation => this.pollTask(operation.taskId));
  });
}

private stopTaskPolling(): void {
  this.taskPolling?.unsubscribe();
  this.taskPolling = undefined;
}

private pollTask(taskId: string): void {
  this.http.get<any>(`${environment.appUrl}/tasks/${taskId}/status/`).subscribe({
    next: (response) => this.handleTaskStatus(response),
    error: () => {
      this.operations.update(taskId, {
        status: 'PENDING',
        message: 'Could not refresh task status. Will retry shortly.',
      });
      this.restoreActiveOperations();
    },
  });
}

private handleTaskStatus(response: any): void {
  const taskId = response?.task_id;
  const state = response?.status || response?.state || 'PENDING';
  const message = response?.message || response?.meta?.message || this.defaultTaskMessage(state);
  if (taskId) {
    this.operations.update(taskId, { status: state, message });
  }

  if (state === 'SUCCESS') {
    const result = response?.result || {};
    if (result.status === 'failed') {
      this.toastr.danger(result.error || 'Route tracing failed.', 'Route Tracing Failed');
    } else {
      this.toastr.success(result.message || 'Route tracing completed.', 'Route Tracing Created');
      this.source.refresh();
    }
    if (taskId) this.operations.remove(taskId);
    this.restoreActiveOperations();
    return;
  }

  if (state === 'FAILURE') {
    this.toastr.danger(response?.error || 'Route tracing failed.', 'Route Tracing Failed');
    if (taskId) this.operations.remove(taskId);
    this.restoreActiveOperations();
  }
}

private defaultTaskMessage(state: string): string {
  if (state === 'PENDING') return 'Waiting for a Celery worker to pick up the route tracing job.';
  if (state === 'PROGRESS' || state === 'STARTED') return 'Tracing routes in the background.';
  return 'Route tracing is running.';
}

}
