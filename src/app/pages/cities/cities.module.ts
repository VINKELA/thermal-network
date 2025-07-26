import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CitiesComponent } from './cities.component';
import { CityComponent } from './city/city.component';
import { Ng2SmartTableModule } from 'ng2-smart-table';
import { MiscellaneousModule } from '../miscellaneous/miscellaneous.module';
import { NbMenuModule, NbCardModule } from '@nebular/theme';
import { ThemeModule } from '../../@theme/theme.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { ECommerceModule } from '../e-commerce/e-commerce.module';



@NgModule({
  declarations: [
    CitiesComponent,
    CityComponent,
  ],
  imports: [
    ThemeModule,
    NbMenuModule,
    Ng2SmartTableModule,
    NbCardModule,
    CommonModule
  ]
})
export class CitiesModule { }
