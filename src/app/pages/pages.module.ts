import { NgModule } from '@angular/core';
import { NbCardModule, NbMenuModule } from '@nebular/theme';

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
import { BuildingComponent } from './buildings/building/building.component';
import { BuildingsComponent } from './buildings/buildings/buildings.component';
import { CommonModule } from '@angular/common';
import { GoogleMapsModule } from '@angular/google-maps';
import { ProjectsModule } from './projects/projects.module';

@NgModule({
  imports: [
    PagesRoutingModule,
    ThemeModule,
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
    ProjectsModule
  ],
  declarations: [
    PagesComponent,
    CountriesComponent,
    ProvinceComponent,
    BuildingsComponent,
    BuildingComponent,

  ],
})
export class PagesModule {
}
