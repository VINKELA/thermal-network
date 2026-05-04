import { Component, Inject, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { ServerDataSource } from 'ng2-smart-table';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'ngx-edge-algorithms',
  templateUrl: './edge-algorithms.component.html',
  styleUrls: ['./edge-algorithms.component.scss']
})
export class EdgeAlgorithmsComponent implements OnInit {
  url: string = 'edge_algorithms/';
  link: string = 'edge_algorithms';
  
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
          return `<a href="pages/${this.link}/${row.id}">${name || 'Unnamed Calculation'}</a>`;
        }
      },
      algorithm: {
        title: 'Algorithm',
        type: 'string',
        editor: {
          type: 'list',
          config: {
            // Predefined algorithm methods for network routing
            list: [
              { value: 'mst', title: 'Minimum Spanning Tree (MST)' },
              { value: 'steiner', title: 'Steiner Tree' },
              { value: 'dijkstra', title: 'Shortest Path (Dijkstra)' }
            ]
          }
        },
      },
      network: {
        title: 'Network',
        type: 'html',
        editor: {
          type: 'list',
          config: {
            list: [] // Populated dynamically in loadNetworks()
          }
        },
        valuePrepareFunction: (network: any, row: any) => {
          if (!row.network) return 'No Network';
          if (row.network.name) {
            return `<a href="pages/networks/${row.network.id}">${row.network.name}</a>`;
          }
          return `Network ID: ${row.network}`;
        }
      },
    },
  };

  source!: ServerDataSource;

  constructor(
    @Inject(RestApiService) private api: RestApiService,
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute
  ) { }

ngOnInit() {
    this.source = new ServerDataSource(this.http, {
      endPoint: environment.appUrl + '/' + this.url,
      pagerPageKey: 'page',
      sortFieldKey: 'ordering',
      pagerLimitKey: 'limit',
      dataKey: 'results',
      totalKey: 'count',
    });

    this.loadNetworksForDropdown();
    this.loadAlgorithmsForDropdown(); // Call the new method
  }

  loadAlgorithmsForDropdown() {
    // Call the new Django endpoint
    this.http.get<any[]>(`${environment.appUrl}/algorithms/choices/`).subscribe({
      next: (choices) => {
        // Clone settings to trigger Angular change detection
        const newSettings = Object.assign({}, this.settings);
        
        // Inject the fetched choices into the algorithm column editor
        newSettings.columns.algorithm.editor.config.list = choices;
        
        this.settings = newSettings;
      },
      error: (err) => console.error('Failed to load algorithm choices', err)
    });
  }

  loadNetworksForDropdown() {
    this.http.get<any>(`${environment.appUrl}/networks/`).subscribe({
      next: (res) => {
        const networks = res.results || res || [];
        const networkOptions = networks.map((n: any) => ({
          value: n.id,
          title: n.name
        }));

        // Clone settings to trigger Angular change detection
        const newSettings = Object.assign({}, this.settings);
        newSettings.columns.network.editor.config.list = networkOptions;
        this.settings = newSettings;
      },
      error: (err) => console.error('Failed to load networks for dropdown', err)
    });
  }

  onDeleteConfirm(event: any): void {
    if (window.confirm('Are you sure you want to delete this edge algorithm record?')) {
      this.api.delete(this.url, event.data.id).subscribe({
        next: () => {
          event.confirm.resolve();
          this.source.remove(event.data);
        },
        error: () => event.confirm.reject()
      });
    } else {
      event.confirm.reject();
    }
  }

  onEditConfirm(event: any): void {
    if (window.confirm('Are you sure you want to update this record?')) {
      const data = {
        name: event.newData.name,
        algorithm: event.newData.algorithm,
        network: event.newData.network
      };
      this.api.update(event.data.id, data, this.url).subscribe({
        next: (res) => {
          event.confirm.resolve(res);
          this.source.refresh();
        },
        error: () => event.confirm.reject()
      });
    } else {
      event.confirm.reject();
    }
  }

  onCreateConfirm(event: any): void {
    if (window.confirm('Are you sure you want to connect edges using this algorithm?')) {
      
      const networkId = event.newData.network;
      if (!networkId) {
        alert('Please select a network first.');
        event.confirm.reject();
        return;
      }

      // Construct the specific payload for the routing algorithm
      const payload = {
        method: event.newData.algorithm, // e.g., 'mst'
        algorithm_id: 1, // Defaulting to 1 as per your connection requirement
        name: event.newData.name
      };

      const connectUrl = `${environment.appUrl}/networks/${networkId}/connect_edges/`;

      this.http.post(connectUrl, payload).subscribe({
        next: (res) => {
          event.confirm.resolve(res);
          this.source.refresh();
        },
        error: (err) => {
          console.error('Edge connection failed:', err);
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