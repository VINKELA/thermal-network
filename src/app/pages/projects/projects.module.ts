import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectComponent } from './project/project.component';
import { ProjectsComponent } from './projects/projects.component';
import { GoogleMapsModule } from '@angular/google-maps';
import { NbMenuModule, NbCardModule } from '@nebular/theme';
import { Ng2SmartTableModule } from 'ng2-smart-table';
import { ThemeModule } from '../../@theme/theme.module';
import { ReactiveFormsModule } from '@angular/forms';
import { NbAlertModule, NbButtonModule, NbIconModule, NbInputModule, NbSelectModule, NbSpinnerModule } from '@nebular/theme';
import { ProjectUsersComponent } from './project-users/project-users.component';



@NgModule({
  declarations: [
    ProjectComponent,
    ProjectsComponent,
    ProjectUsersComponent
  ],
  imports: [
      CommonModule,
    ReactiveFormsModule,
    ThemeModule,
        NbMenuModule,
        Ng2SmartTableModule,
        NbCardModule,
        NbAlertModule,
        NbButtonModule,
        NbIconModule,
        NbInputModule,
        NbSelectModule,
        NbSpinnerModule,
        CommonModule,
        GoogleMapsModule 
  ]
})
export class ProjectsModule { }
