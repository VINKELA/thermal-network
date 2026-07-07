import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BuildingsComponent } from './buildings/buildings.component';
import { BuildingComponent } from './building/building.component';
import { GoogleMapsModule } from '@angular/google-maps';
import { ThemeModule } from '../../@theme/theme.module';
import { NbButtonModule, NbCardModule, NbIconModule, NbSelectModule } from '@nebular/theme';



@NgModule({
  declarations: [
    BuildingsComponent,
    BuildingComponent
  ],
  imports: [
    CommonModule,
    GoogleMapsModule,
    ThemeModule,
    NbButtonModule,
    NbCardModule,
    NbIconModule,
    NbSelectModule,
  ]
})
export class BuildingsModule { }
