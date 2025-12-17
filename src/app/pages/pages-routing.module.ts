import { RouterModule, Routes } from '@angular/router';
import { NgModule } from '@angular/core';

import { PagesComponent } from './pages.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { ECommerceComponent } from './e-commerce/e-commerce.component';
import { NotFoundComponent } from './miscellaneous/not-found/not-found.component';
import { NetworksComponent } from './networks/networks/networks.component';
import { NetworkComponent } from './networks/network/network.component';
import { ProjectsComponent } from './projects/projects/projects.component';
import { EdgesComponent } from './networks/edges/edges.component';
import { RoutesComponent } from './networks/routes/routes.component';
import { NodesComponent } from './networks/nodes/nodes.component';
import { AlgorithmsComponent } from './networks/algorithms/algorithms.component';
import { TranslationsComponent } from './networks/translations/translations.component';
import { NodeComponent } from './networks/node/node.component';
import { ClusterComponent } from './networks/cluster/cluster.component';
import { PipesComponent } from './networks/pipes/pipes.component';
import { PipeComponent } from './networks/pipe/pipe.component';
import { ClusterAlgorithmsComponent } from './networks/cluster-algorithms/cluster-algorithms.component';
import { ClusterAlgorithmComponent } from './networks/cluster-algorithm/cluster-algorithm.component';
import { BuildingsComponent } from './buildings/buildings/buildings.component';
import { ClustersComponent } from './networks/clusters/clusters.component';
import { Clusters2Component } from './networks/clusters2/clusters2.component';
import { Clusters3Component } from './networks/clusters3/clusters3.component';
import { Clusters4Component } from './networks/clusters4/clusters4.component';
import { TranslationComponent } from './networks/translation/translation.component';
import { ProjectComponent } from './projects/project/project.component';
import { BuildingComponent } from './buildings/building/building.component';
import { EdgeComponent } from './networks/edge/edge.component';
import { ClusterAnalysisComponent } from './networks/cluster-analysis/cluster-analysis.component';
import { ClusterConfigurationComponent } from './networks/cluster-configuration/cluster-configuration.component';
import { ClusterConfigurationsComponent } from './networks/cluster-configurations/cluster-configurations.component';
import { Cluster5Component } from './networks/cluster5/cluster5.component';
import { EdgeAlgorithmsComponent } from './networks/edge-algorithms/edge-algorithms.component';
import { EdgeAlgorithmComponent } from './networks/edge-algorithm/edge-algorithm.component';
import { EdgeConnectionAlgorithmComponent } from './networks/edge-connection-algorithm/edge-connection-algorithm.component';
import { EdgeConnectionAlgorithmsComponent } from './networks/edge-connection-algorithms/edge-connection-algorithms.component';
import { RouteComponent } from './networks/route/route.component';
import { LoadProfileComponent } from './networks/load-profile/load-profile.component';
import { DataUploadComponent } from './data-upload/data-upload.component';
import { MapImporterComponent } from './map-importer/map-importer.component';

const routes: Routes = [{
  path: '',
  component: PagesComponent,
  children: [ 
    {
      path: 'networks/:id',
      component: NetworkComponent,
    },
    {
      path: 'projects',
      component: ProjectsComponent,
    },
    {
      path: 'buildings',
      component: BuildingsComponent,
    },
       {
      path: 'buildings/:id',
      component: BuildingComponent,
    },
    {
      path: 'projects/:id',
      component: ProjectComponent,
    },
    {
      path: 'load-profiles',
      component: LoadProfileComponent,
    },
      {
      path: 'data-upload',
      component: MapImporterComponent,
    },
    {
      path: 'networks',
      component: NetworksComponent,
    },
    {
      path: 'clusters',
      component: ClustersComponent,
    },
    {
      path: 'clusters/:id',
      component: Cluster5Component,
    },
     {
      path: 'edge-algorithms',
      component: EdgeAlgorithmsComponent,
    },
     {
      path: 'edge_algorithms/:id',
      component: EdgeAlgorithmComponent,
    },
    {
      path: 'edge-connection-algorithms',
      component: EdgeConnectionAlgorithmsComponent,
    },
     {
      path: 'edge_connection_algorithms/:id',
      component: EdgeConnectionAlgorithmComponent,
    },
    {
      path: 'cluster-configurations/:id',
      component: ClusterConfigurationComponent,
    },
     {
      path: 'cluster-configurations',
      component: ClusterConfigurationsComponent,
    },
     {
      path: 'cluster-algorithm/:id',
      component: Clusters2Component,
    },
    {
      path: 'nodes',
      component: NodesComponent,
    },
     {
      path: 'nodes/:id',
      component: NodeComponent,
    },
    {
      path: 'edges',
      component: EdgesComponent,
    },
    {
      path: 'edges/:id',
      component: EdgeComponent,
    },
     {
      path: 'algorithms',
      component: AlgorithmsComponent,
    },
    {
      path: 'edge_translations',
      component: TranslationsComponent,
    },
    {
      path: 'edge_translations/:id',
      component: TranslationComponent,
    },
    {
      path: 'routes',
      component: RoutesComponent,
    },
     {
      path: 'routes/:id',
      component: RouteComponent,
    },
   
    {
      path: 'dashboard',
      component: ECommerceComponent,
    },
    {
      path: 'iot-dashboard',
      component: DashboardComponent,
    },
    
     {
      path: 'pipes',
      component: PipesComponent,
    },
    {
      path: 'pipes/:id',
      component: PipeComponent,
    },
    {
      path: 'layout',
      loadChildren: () => import('./layout/layout.module')
        .then(m => m.LayoutModule),
    },
    {
      path: 'forms',
      loadChildren: () => import('./forms/forms.module')
        .then(m => m.FormsModule),
    },
    {
      path: 'ui-features',
      loadChildren: () => import('./ui-features/ui-features.module')
        .then(m => m.UiFeaturesModule),
    },
    {
      path: 'modal-overlays',
      loadChildren: () => import('./modal-overlays/modal-overlays.module')
        .then(m => m.ModalOverlaysModule),
    },
    {
      path: 'extra-components',
      loadChildren: () => import('./extra-components/extra-components.module')
        .then(m => m.ExtraComponentsModule),
    },
    {
      path: 'maps',
      loadChildren: () => import('./maps/maps.module')
        .then(m => m.MapsModule),
    },
    {
      path: 'charts',
      loadChildren: () => import('./charts/charts.module')
        .then(m => m.ChartsModule),
    },
    {
      path: 'editors',
      loadChildren: () => import('./editors/editors.module')
        .then(m => m.EditorsModule),
    },
    {
      path: 'tables',
      loadChildren: () => import('./tables/tables.module')
        .then(m => m.TablesModule),
    },
    {
      path: 'miscellaneous',
      loadChildren: () => import('./miscellaneous/miscellaneous.module')
        .then(m => m.MiscellaneousModule),
    },
    {
      path: '',
      redirectTo: 'dashboard',
      pathMatch: 'full',
    },
    {
      path: '**',
      component: NotFoundComponent,
    },
  ],
}];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PagesRoutingModule {
}
