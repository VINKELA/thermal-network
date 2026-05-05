import { Component, Inject, OnInit } from '@angular/core';
import { ServerDataSource } from 'ng2-smart-table'; 
import { HttpClient } from '@angular/common/http';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { env } from 'process';
import { environment } from '../../../../environments/environment';
import { Router, ActivatedRoute } from '@angular/router';

@Component({
  selector: 'ngx-pipe-sizes',
  templateUrl: './pipe-sizes.component.html',
  styleUrls: ['./pipe-sizes.component.scss']
})
export class PipeSizesComponent implements OnInit {
  
  component: string = 'pipe_sizings';
  url: string = 'pipe_sizings/';
  
  // Use ServerDataSource instead of LocalDataSource
  source: ServerDataSource;

  settings = {
    // 1. Important: Disable client-side pagination since server handles it
    pager: {
      display: true,
      perPage: 10, // Must match your Django pagination size
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
          return `<a href="pages/pipe-sizes/${row.id}">${name}</a>`;
        }
      },
      method: {
        title: 'Method',
        type: 'string',
        editor: {
          type: 'list',
          config: {
            list: [
              { value: 'peak_sizing', title: 'Peak Sizing' },
              { value: 'diversity', title: 'Diversity' },
              { value: 'pressure_optimized', title: 'Pressure Optimized' },
              { value: 'lifecycle_cost', title: 'Lifecycle Cost' },
              { value: 'return_temp_opt', title: 'Return Temperature Optimized' },
            ],
          },
        },
      },
      edge_connection_algorithm_id: {
        title: 'Source Connection',
        type: 'string',
        editor: {
          type: 'list',
          config: {
            list: [],
          },
        },
        valuePrepareFunction: () => 'Derived from connection',
      },
      network_name: {
        title: 'Output Network',
        type: 'string',
        editable: false,
        addable: false,
      },
      source_network_name: {
        title: 'Parent Network',
        type: 'string',
        editable: false,
        addable: false,
      },
    },
  };

  constructor(
    @Inject(RestApiService) private api: RestApiService, 
    private http: HttpClient // ServerDataSource needs raw HttpClient usually
    , private router: Router, private route: ActivatedRoute
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
  }

  loadConnectionAlgorithmsForDropdown() {
    this.http.get<any>(`${environment.appUrl}/edge_connection_algorithms/`).subscribe({
      next: (res) => {
        const connections = res.results || res || [];
        const options = connections.map((conn: any) => ({
          value: conn.id,
          title: `${conn.name} (${conn.network?.name || 'Network ' + conn.network?.id})`,
        }));

        const newSettings: any = Object.assign({}, this.settings);
        newSettings.columns.edge_connection_algorithm_id.editor.config.list = options;
        this.settings = newSettings;
      },
      error: (err) => console.error('Failed to load connection algorithms for sizing dropdown', err),
    });
  }

  onDeleteConfirm(event): void {
    if (window.confirm('Are you sure you want to delete?')) {
      console.log(`Deleting ${this.component} with ID:`, event.data.id);
      
      this.api.delete(this.url, event.data.id).subscribe((data: any) => {
          console.log(`${this.component} deleted successfully:`, data);
          event.confirm.resolve();
          this.source.refresh(); // Reload data from server to fix pagination counts
        },
        (err) => event.confirm.reject()
      );
    } else {
      event.confirm.reject();
    }
  }

  onEditConfirm(event: any): void {
    if (window.confirm('Are you sure you want to update?')) {
      // Only send changed data or specific fields
      const data = {
          name: event.newData.name,
          description: event.newData.description // Ensure mapping is correct
      };

      this.api.update(event.data.id, data, this.url).subscribe({
        next: (res) => {
          event.confirm.resolve(res);
          this.source.refresh();
        },
        error: (err) => event.confirm.reject()
      });
    } else {
      event.confirm.reject();
    }
  }

  onCreateConfirm(event: any): void {
    if (window.confirm('Create a new derived network with pipe sizing results?')) {
      const connectionId = event.newData.edge_connection_algorithm_id;
      if (!connectionId) {
        alert('Please select a source connection algorithm.');
        event.confirm.reject();
        return;
      }

      const payload = {
        edge_connection_algorithm_id: connectionId,
        name_prefix: event.newData.name || 'Pipe Sizing',
        method: event.newData.method || 'peak_sizing',
      };

      this.http.post(`${environment.appUrl}/${this.url}`, payload).subscribe({
        next: (res) => {
          event.confirm.resolve(res);
          this.source.refresh(); // Refresh to see new item at correct page location
        },
        error: (err) => event.confirm.reject()
      });
    } else {
      event.confirm.reject();
    }
  }
  goToComparison() {
    // Navigate relative to the current route
    this.router.navigate(['compare'], { relativeTo: this.route });
  }
}
