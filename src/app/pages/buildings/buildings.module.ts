import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BuildingsComponent } from './buildings/buildings.component';
import { BuildingComponent } from './building/building.component';



@NgModule({
  declarations: [
    BuildingsComponent,
    BuildingComponent
  ],
  imports: [
    CommonModule
  ]
})
export class BuildingsModule { }
