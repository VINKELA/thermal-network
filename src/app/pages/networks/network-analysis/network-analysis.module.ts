import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  NbButtonModule,
  NbCardModule,
  NbAlertModule,
  NbCheckboxModule,
  NbIconModule,
  NbInputModule,
  NbSelectModule,
  NbSpinnerModule,
} from '@nebular/theme';
import { NgxEchartsModule } from 'ngx-echarts';

import { ThemeModule } from '../../../@theme/theme.module';
import { NetworkAnalysisCompareComponent } from './network-analysis-compare.component';
import { NetworkAnalysisDashboardComponent } from './network-analysis-dashboard.component';
import { NetworkAnalysisService } from './network-analysis.service';

@NgModule({
  declarations: [NetworkAnalysisDashboardComponent, NetworkAnalysisCompareComponent],
  imports: [
    CommonModule,
    FormsModule,
    ThemeModule,
    NbAlertModule,
    NbButtonModule,
    NbCardModule,
    NbCheckboxModule,
    NbIconModule,
    NbInputModule,
    NbSelectModule,
    NbSpinnerModule,
    NgxEchartsModule,
  ],
  exports: [NetworkAnalysisDashboardComponent, NetworkAnalysisCompareComponent],
  providers: [NetworkAnalysisService],
})
export class NetworkAnalysisModule {}
