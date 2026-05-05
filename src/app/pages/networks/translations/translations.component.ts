import { Component, Inject } from '@angular/core';
import { LocalDataSource, ServerDataSource } from 'ng2-smart-table';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { Router, ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { NbToastrService } from '@nebular/theme';

@Component({
  selector: 'ngx-translations',
  templateUrl: './translations.component.html',
  styleUrls: ['./translations.component.scss']
})
export class TranslationsComponent {
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
        title: 'Travel Mode',
        type: 'string',
        editor: {
          type: 'list',
          config: {
            list: [
              { value: 'driving', title: 'Driving' },
              { value: 'walking', title: 'Walking' },
              { value: 'bicycling', title: 'Bicycling' },
              { value: 'transit', title: 'Transit' },
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

  constructor(
      @Inject(RestApiService) private api: RestApiService, 
      private http: HttpClient, // ServerDataSource needs raw HttpClient usually
      private router: Router,
      private route: ActivatedRoute,
      private toastr: NbToastrService
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

}
