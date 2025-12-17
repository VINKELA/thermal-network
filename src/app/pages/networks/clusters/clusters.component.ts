import { Component, Inject, ViewChild } from '@angular/core';
import { LocalDataSource } from 'ng2-smart-table';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { GoogleMap } from '@angular/google-maps';
import { ActivatedRoute } from '@angular/router';


@Component({
  selector: 'ngx-clusters',
  templateUrl: './clusters.component.html',
  styleUrls: ['./clusters.component.scss']
})
export class ClustersComponent {
url: string =  'clusters/';
link: string = 'clusters';
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
      node_type: {
        title: 'Type',
        type: 'string',
        
      },
      
    },
  };

  source: LocalDataSource = new LocalDataSource();

  constructor(@Inject(RestApiService) private api: RestApiService) {
    this.api.get(this.url)
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
}}
