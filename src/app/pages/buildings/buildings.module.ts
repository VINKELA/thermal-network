import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BuildingsComponent } from './buildings/buildings.component';
import { BuildingComponent } from './building/building.component';
import { GoogleMapsModule } from '@angular/google-maps';



@NgModule({
  declarations: [
    BuildingsComponent,
    BuildingComponent
  ],
  imports: [
    CommonModule,
    GoogleMapsModule
  ]
})
export class BuildingsModule { }
