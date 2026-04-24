import { Component, Inject } from '@angular/core';
import { LocalDataSource, ServerDataSource } from 'ng2-smart-table';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'ngx-cluster-configurations',
  templateUrl: './cluster-configurations.component.html',
  styleUrls: ['./cluster-configurations.component.scss']
})
export class ClusterConfigurationsComponent {
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
      description: {
        title: 'Type',
        type: 'string',
        
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
