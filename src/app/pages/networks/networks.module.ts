import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NetworksComponent } from './networks/networks.component';
import { NetworkComponent } from './network/network.component';
import { NbMenuModule, NbCardModule } from '@nebular/theme';
import { Ng2SmartTableModule } from 'ng2-smart-table';
import { ThemeModule } from '../../@theme/theme.module';
import { NetworkAlgorithmComponent } from './network-algorithm/network-algorithm.component';
import { BrowserModule } from '@angular/platform-browser';
import { GoogleMapsModule } from '@angular/google-maps';
import { RouteComponent } from './route/route.component';
import { TranslationComponent } from './translation/translation.component';
import { EdgeComponent } from './edge/edge.component';
import { AlgorithmsComponent } from './algorithms/algorithms.component';
import { AlgorithmComponent } from './algorithm/algorithm.component';
import { TranslationsComponent } from './translations/translations.component';
import { RoutesComponent } from './routes/routes.component';
import { EdgesComponent } from './edges/edges.component';
import { NodesComponent } from './nodes/nodes.component';
import { NodeComponent } from './node/node.component'; // Import the module
import { FormsModule } from '@angular/forms';



@NgModule({
  declarations: [
    NetworksComponent,
    NetworkComponent,
    NetworkAlgorithmComponent,
    RouteComponent,
    TranslationComponent,
    EdgeComponent,
    AlgorithmsComponent,
    AlgorithmComponent,
    TranslationsComponent,
    RoutesComponent,
    EdgesComponent,
    NodesComponent,
    NodeComponent
  ],
  imports: [
    CommonModule,
    ThemeModule,
        NbMenuModule,
        Ng2SmartTableModule,
        NbCardModule,
        CommonModule,
        GoogleMapsModule,
        FormsModule
  ]
})
export class NetworksModule { }
