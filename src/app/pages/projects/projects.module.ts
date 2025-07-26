import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectComponent } from './project/project.component';
import { ProjectsComponent } from './projects/projects.component';
import { GoogleMapsModule } from '@angular/google-maps';
import { NbMenuModule, NbCardModule } from '@nebular/theme';
import { Ng2SmartTableModule } from 'ng2-smart-table';
import { ThemeModule } from '../../@theme/theme.module';



@NgModule({
  declarations: [
    ProjectComponent,
    ProjectsComponent
  ],
  imports: [
      CommonModule,
    ThemeModule,
        NbMenuModule,
        Ng2SmartTableModule,
        NbCardModule,
        CommonModule,
        GoogleMapsModule 
  ]
})
export class ProjectsModule { }
