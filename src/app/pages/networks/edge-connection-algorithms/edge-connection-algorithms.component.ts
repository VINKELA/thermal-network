import { Component, Inject } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { LocalDataSource, ServerDataSource } from 'ng2-smart-table';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { title } from 'process';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'ngx-edge-connection-algorithms',
  templateUrl: './edge-connection-algorithms.component.html',
  styleUrls: ['./edge-connection-algorithms.component.scss']
})
export class EdgeConnectionAlgorithmsComponent {
url: string =  'edge_connection_algorithms/';
link: string = 'edge_connection_algorithms';
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
      algorithm: {
        title: 'Connection Algorithm',
        type: 'string',
        editor: {
          type: 'list',
          config: {
            list: [
              { value: 'mst', title: 'Minimum Spanning Tree (MST)' },
              { value: 'shortest_path_tree', title: 'Source-Rooted Shortest Path Tree' },
              { value: 'steiner_tree', title: 'Approximate Steiner Tree' },
              { value: 'redundant_mst', title: 'Reliability-Augmented MST' },
            ],
          },
        },
      },
      edge_algorithm: {
        title: 'Source Edge Generation',
        type: 'html',
        editor: {
          type: 'list',
          config: {
            list: [],
          },
        },
        valuePrepareFunction: (_: any, row: any) => {
          if (row.edge_algorithm_name) return row.edge_algorithm_name;
          if (row.edge_algorithm) return `Edge Algorithm ${row.edge_algorithm}`;
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
      calculated_total_length:{
        title: "Length",
        type: "number"
      }
      
    },
  };

  source: LocalDataSource = new LocalDataSource();

  constructor(
      @Inject(RestApiService) private api: RestApiService, 
      private http: HttpClient, // ServerDataSource needs raw HttpClient usually
      private router: Router,
      private route: ActivatedRoute
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

      this.loadEdgeAlgorithmsForDropdown();
    }

  loadEdgeAlgorithmsForDropdown() {
    this.http.get<any>(`${environment.appUrl}/edge_algorithms/`).subscribe({
      next: (res) => {
        const algorithms = res.results || res || [];
        const options = algorithms.map((alg: any) => ({
          value: alg.id,
          title: `${alg.name} (${alg.network?.name || 'Network ' + alg.network?.id})`,
        }));

        const newSettings: any = Object.assign({}, this.settings);
        newSettings.columns.edge_algorithm.editor.config.list = options;
        this.settings = newSettings;
      },
      error: (err) => console.error('Failed to load edge algorithms for dropdown', err),
    });
  }

  onDeleteConfirm(event): void {
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
  if (window.confirm('Create a new derived network using this connection algorithm?')) {
    const edgeAlgorithmId = event.newData.edge_algorithm;
    if (!edgeAlgorithmId) {
      alert('Please select a source edge generation first.');
      event.confirm.reject();
      return;
    }

    const payload = {
      name: event.newData.name,
      algorithm: event.newData.algorithm || 'mst',
      edge_algorithm: edgeAlgorithmId,
    };

    this.http.post(`${environment.appUrl}/${this.url}`, payload).subscribe({
      next: (res) => {
        event.confirm.resolve(res);
        this.source.refresh();
      },
      error: (err) => {
        console.error('Connection derivation failed:', err);
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
