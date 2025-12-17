import { NgModule } from '@angular/core';
import { NbButtonModule, NbCardModule, NbIconModule, NbInputModule, NbListModule, NbMenuModule, NbSelectModule, NbSpinnerModule, NbTabsetModule } from '@nebular/theme';

import { ThemeModule } from '../@theme/theme.module';
import { PagesComponent } from './pages.component';
import { DashboardModule } from './dashboard/dashboard.module';
import { ECommerceModule } from './e-commerce/e-commerce.module';
import { PagesRoutingModule } from './pages-routing.module';
import { MiscellaneousModule } from './miscellaneous/miscellaneous.module';
import { CountriesComponent } from './countries/countries.component';
import { Ng2SmartTableModule } from 'ng2-smart-table';
import { ProvinceComponent } from './province/province.component';
import { CitiesModule } from './cities/cities.module';
import { NetworksModule } from './networks/networks.module';
import { CommonModule } from '@angular/common';
import { GoogleMapsModule } from '@angular/google-maps';
import { ProjectsModule } from './projects/projects.module';
import { BuildingsModule } from './buildings/buildings.module';
import { DataUploadComponent } from './data-upload/data-upload.component';
import { MapImporterComponent } from './map-importer/map-importer.component';
import { FormsModule } from '@angular/forms';
@NgModule({
  imports: [
    PagesRoutingModule,
    ThemeModule,
    FormsModule,
    NbMenuModule,
    DashboardModule,
    ECommerceModule,
    MiscellaneousModule,
    Ng2SmartTableModule,
    NbCardModule,
    CitiesModule,
    NetworksModule,
    ThemeModule,
    NbMenuModule,
    Ng2SmartTableModule,
    NbCardModule,
    CommonModule,
    GoogleMapsModule,
    ProjectsModule, 
    NetworksModule,
    BuildingsModule,
    NbTabsetModule,
    NbSelectModule,
    NbIconModule,
    NbSpinnerModule,
    NbListModule,
    NbButtonModule,
    NbInputModule
  ],
  declarations: [
    PagesComponent,
    CountriesComponent,
    ProvinceComponent,
    DataUploadComponent,
    MapImporterComponent

  ],
})
export class PagesModule {
}
