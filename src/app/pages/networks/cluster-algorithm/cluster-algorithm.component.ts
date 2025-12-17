import { Component, ViewChild } from '@angular/core';
import { GoogleMap } from '@angular/google-maps';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'ngx-cluster-algorithm',
  templateUrl: './cluster-algorithm.component.html',
  styleUrls: ['./cluster-algorithm.component.scss']
})
export class ClusterAlgorithmComponent {
@ViewChild(GoogleMap, { static: false }) map!: GoogleMap;


clusters  = [];
loading = false;
error: string | null = null;


center = { lat: 43.6532, lng: -79.3832 };
zoom = 12;
  algoId: number;


constructor(private clusterService: RestApiService, private route: ActivatedRoute) {}


ngOnInit(): void {
 this.route.paramMap.subscribe(params => {
     this.algoId = Number(params.get('id'));
     this.loadClusters();

    })
}


private loadClusters() {
this.loading = true;
this.error = null;
this.clusterService.get<any>("cluster_algorithms/").subscribe({
next: clusters => {
this.clusters = clusters.results;
this.loading = false;
this.fitMapToClusters();
},
error: err => {
console.error(err);
this.error = 'Could not load clusters';
this.loading = false;
}
});
}


private fitMapToClusters() {
if (!this.clusters.length) return;
const valid = this.clusters.filter(c => c.latitude != null && c.longitude != null);
if (!valid.length) return;
const bounds = new google.maps.LatLngBounds();
valid.forEach(c => bounds.extend(new google.maps.LatLng(c.latitude!, c.longitude!)));
if (this.map) this.map.fitBounds(bounds);
}


clusterCircleRadiusMeters(c) {
return (c.cluster_algorithm.parameters.radius_km ?? 0.5) * 1000;
}
formatKw(val?: number) {
  return val == null ? '-' : `${Math.round(val * 10) / 10} kW`;
}
onSelectCluster(c: any) {
  if (!this.map || c.latitude == null || c.longitude == null) return;
  const target = new google.maps.LatLng(c.latitude, c.longitude);
  this.center = { lat: c.latitude, lng: c.longitude };
  this.zoom = 15;
  }
}
