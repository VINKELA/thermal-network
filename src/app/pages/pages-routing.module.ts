import { RouterModule, Routes } from '@angular/router';
import { NgModule } from '@angular/core';

import { PagesComponent } from './pages.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { ECommerceComponent } from './e-commerce/e-commerce.component';
import { NotFoundComponent } from './miscellaneous/not-found/not-found.component';
import { CountriesComponent } from './countries/countries.component';
import { ProvinceComponent } from './province/province.component';
import { CitiesComponent } from './cities/cities.component';
import { CityComponent } from './cities/city/city.component';
import { NetworksComponent } from './networks/networks/networks.component';
import { NetworkComponent } from './networks/network/network.component';
import { NetworkAlgorithmComponent } from './networks/network-algorithm/network-algorithm.component';
import { TranslationComponent } from './networks/translation/translation.component';
import { ProjectsComponent } from './projects/projects/projects.component';
import { EdgesComponent } from './networks/edges/edges.component';
import { RoutesComponent } from './networks/routes/routes.component';
import { NodesComponent } from './networks/nodes/nodes.component';
import { AlgorithmsComponent } from './networks/algorithms/algorithms.component';
import { BuildingsComponent } from './buildings/buildings/buildings.component';
import { TranslationsComponent } from './networks/translations/translations.component';
import { EdgeComponent } from './networks/edge/edge.component';
import { NodeComponent } from './networks/node/node.component';
import { ClustersComponent } from './networks/clusters/clusters.component';
import { ClusterComponent } from './networks/cluster/cluster.component';
import { PipesComponent } from './networks/pipes/pipes.component';
import { PipeComponent } from './networks/pipe/pipe.component';

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
      path: 'projects/:id',
      component: ECommerceComponent,
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
      component: ClusterComponent,
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
      path: 'algorithms',
      component: AlgorithmsComponent,
    },
    {
      path: 'translations',
      component: TranslationsComponent,
    },
    {
      path: 'routes',
      component: RoutesComponent,
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
      path: 'buildings',
      component: BuildingsComponent,
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
