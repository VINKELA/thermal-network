import { Component, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { GoogleMap } from '@angular/google-maps';
import { ActivatedRoute } from '@angular/router';
import { map } from 'leaflet';
import { RestApiService } from '../../../@core/utils/rest-api.service';

@Component({
  selector: 'ngx-clusters3',
  templateUrl: './clusters3.component.html',
  styleUrls: ['./clusters3.component.scss']
})
export class Clusters3Component implements OnInit, AfterViewInit {
  @ViewChild(GoogleMap, { static: false }) map!: GoogleMap;

  clusters: any[] = [];
  loading = false;
  error: string | null = null;
  center = { lat: 43.6532, lng: -79.3832 };
  zoom = 12;
  clusterId: number;
  heatmap?: google.maps.visualization.HeatmapLayer;

  constructor(private api: RestApiService, private router: ActivatedRoute) {}

  ngOnInit(): void { this.loadClusters(); }
  ngAfterViewInit(): void {}

  private loadClusters() {
    this.loading = true;
    this.error = null;
    this.router.paramMap.subscribe(params => {
      this.clusterId = Number(params.get('id'));
      this.api.get<any>(`clusters/?cluster_algorithm=${this.clusterId}`).subscribe({
        next: clustersResp => {
          this.clusters = clustersResp.results || [];
          this.loading = false;
          this.createHeatmap();
          this.fitMapToClusters();
        },
        error: err => {
          console.error(err);
          this.error = 'Could not load clusters';
          this.loading = false;
        }
      });
    });
  }

  private createHeatmap() {
    if (!this.map || !this.clusters.length) return;
    const points = this.clusters
      .filter(c => c.latitude && c.longitude)
      .map(c => {
        const weight = (c.aggregate_peak_kw ?? c.no_of_buildings ?? 1);
        return { location: new google.maps.LatLng(c.latitude, c.longitude), weight };
      }) as google.maps.visualization.WeightedLocation[];

    if (this.heatmap) this.heatmap.setMap(null);
    this.heatmap = new google.maps.visualization.HeatmapLayer({ data: points, radius: 60, dissipating: true });
    this.heatmap.setMap(this.map.googleMap as google.maps.Map);
  }

  private fitMapToClusters() {
    if (!this.clusters.length) return;
    const valid = this.clusters.filter(c => c.latitude != null && c.longitude != null);
    if (!valid.length) return;
    const bounds = new google.maps.LatLngBounds();
    valid.forEach(c => bounds.extend(new google.maps.LatLng(c.latitude, c.longitude)));
    if (this.map) this.map.fitBounds(bounds);
  }

  onSelectCluster(c: any) {
    if (!this.map || c.latitude == null || c.longitude == null) return;
    this.center = { lat: c.latitude, lng: c.longitude };
    this.zoom = 15;
  }

  formatKw(val?: number) {
    return val == null ? '-' : `${Math.round(val * 10) / 10} kW`;
  }
}