import { Component, Inject } from '@angular/core';
import { ProvinceService } from '../../@core/data-services/provinces/province.service';
import { LocalDataSource } from 'ng2-smart-table';

@Component({
  selector: 'ngx-province',
  templateUrl: './province.component.html',
  styleUrls: ['./province.component.scss']
})
export class ProvinceComponent {
settings = {
    add: {
      addButtonContent: '<i class="nb-plus"></i>',
      createButtonContent: '<i class="nb-checkmark"></i>',
      cancelButtonContent: '<i class="nb-close"></i>',
    },
    edit: {
      editButtonContent: '<i class="nb-edit"></i>',
      saveButtonContent: '<i class="nb-checkmark"></i>',
      cancelButtonContent: '<i class="nb-close"></i>',
    },
    delete: {
      deleteButtonContent: '<i class="nb-trash"></i>',
      confirmDelete: true,
    },
    columns: {
      id: {
        title: 'ID',
        type: 'number',
      },
      name: {
        title: 'Name',
        type: 'string',
      },
      code: {
        title: 'Code',
        type: 'string',
      },
      countryName: {
        title: 'Country',
        type: 'string',
      
      }
    },
  };

  source: LocalDataSource = new LocalDataSource();

  constructor(@Inject(ProvinceService) private service: ProvinceService) {
    this.service.get()
    .subscribe((data: any) => 
      {
        const flattened = data.results.map(item => ({
        ...item,
        countryName: item.country?.name || ''
      }));            
      this.source.load(flattened);
      })
  }

  onDeleteConfirm(event): void {
    if (window.confirm('Are you sure you want to delete?')) {
      event.confirm.resolve();
    } else {
      event.confirm.reject();
    }
  }
}
