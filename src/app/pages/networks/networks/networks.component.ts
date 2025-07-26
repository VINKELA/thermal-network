import { Component, Inject } from '@angular/core';
import { LocalDataSource } from 'ng2-smart-table';
import { NetworkApiService } from '../../../@core/data-services/networks/network-api.service';

@Component({
  selector: 'ngx-networks',
  templateUrl: './networks.component.html',
  styleUrls: ['./networks.component.scss']
})
export class NetworksComponent {
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
        return `<a href="pages/networks/${row.id}">${name}</a>`;
      }
      },
      description: {
        title: 'Description',
        type: 'string',
        
      },
      project: {
        title: 'Project',
        type: 'html',
        valuePrepareFunction: (project: any, row: any) => {
          return `<a href="pages/projects/${row.project.id}">${project.name}</a>`;
        }
      },
      
    },
  };

  source: LocalDataSource = new LocalDataSource();

  constructor(@Inject(NetworkApiService) private api: NetworkApiService) {
    this.api.get()
    .subscribe((data: any) => 
      {
        const flattened = data.results.map(item => ({
        ...item,
      }));            
      this.source.load(flattened);
      })
  }

  onDeleteConfirm(event): void {
    if (window.confirm('Are you sure you want to delete?')) {
      console.log("Deleting Network with ID:", event.data.id);
      event.confirm.resolve();
      this.api.delete(event.data.id)
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
    this.api.update(event.data.id,data ).subscribe({
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
    this.api.create(event.newData).subscribe({
      next: (res) => event.confirm.resolve(res),
      error: (err) => event.confirm.reject()
    });
  } else {
    event.confirm.reject();
  }
}
}
