import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NetworksComponent } from './networks/networks.component';
import { NetworkComponent } from './network/network.component';
import { NbMenuModule, NbCardModule, NbButtonModule, NbFormFieldModule, NbIconModule, NbInputModule, NbListModule, NbSelectModule, NbSpinnerModule } from '@nebular/theme';
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
import { ClusterComponent } from './cluster/cluster.component';
import { ClustersComponent } from './clusters/clusters.component';
import { PipesComponent } from './pipes/pipes.component';
import { PipeComponent } from './pipe/pipe.component';
import { ClusterAlgorithmsComponent } from './cluster-algorithms/cluster-algorithms.component';
import { ClusterAlgorithmComponent } from './cluster-algorithm/cluster-algorithm.component';
import { Clusters2Component } from './clusters2/clusters2.component';
import { Clusters3Component } from './clusters3/clusters3.component';
import { Clusters4Component } from './clusters4/clusters4.component';
import { RouteTraceComponent } from './route-trace/route-trace.component';
import { ClusterAnalysisComponent } from './cluster-analysis/cluster-analysis.component';
import { ClusterConfigurationsComponent } from './cluster-configurations/cluster-configurations.component';
import { ClusterConfigurationComponent } from './cluster-configuration/cluster-configuration.component';
import { Cluster5Component } from './cluster5/cluster5.component';
import { EdgeAlgorithmComponent } from './edge-algorithm/edge-algorithm.component';
import { EdgeAlgorithmsComponent } from './edge-algorithms/edge-algorithms.component';
import { EdgeConnectionAlgorithmsComponent } from './edge-connection-algorithms/edge-connection-algorithms.component';
import { EdgeConnectionAlgorithmComponent } from './edge-connection-algorithm/edge-connection-algorithm.component';
import { NgxEchartsModule } from 'ngx-echarts';
import { LoadProfileComponent } from './load-profile/load-profile.component';



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
    NodeComponent,
    ClusterComponent,
    ClustersComponent,
    PipesComponent,
    PipeComponent,
    ClusterAlgorithmsComponent,
    ClusterAlgorithmComponent,
    Clusters2Component,
    Clusters3Component,
    Clusters4Component,
    RouteTraceComponent,
    ClusterAnalysisComponent,
    ClusterConfigurationsComponent,
    ClusterConfigurationComponent,
    Cluster5Component,
    EdgeAlgorithmComponent,
    EdgeAlgorithmsComponent,
    EdgeConnectionAlgorithmsComponent,
    EdgeConnectionAlgorithmComponent,
    LoadProfileComponent
  ],
  imports: [
    CommonModule,
    ThemeModule,
        NbMenuModule,
        Ng2SmartTableModule,
        NbCardModule,
        CommonModule,
        GoogleMapsModule,
        FormsModule,
        NbCardModule,
    NbSelectModule,
    NbInputModule,
    NbListModule,
    NbIconModule,
    NbButtonModule,
    NbSpinnerModule,
    NbFormFieldModule,
    
    // ADD ECHARTS MODULE:
    NgxEchartsModule,
  ]
})
export class NetworksModule { }
