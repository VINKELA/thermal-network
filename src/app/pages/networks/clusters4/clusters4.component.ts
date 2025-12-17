import { Component, OnInit, ViewChild } from '@angular/core';
import { GoogleMap } from '@angular/google-maps';
import { ActivatedRoute } from '@angular/router';
import { of, forkJoin } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { RestApiService } from '../../../@core/utils/rest-api.service';

@Component({
  selector: 'ngx-clusters4',
  templateUrl: './clusters4.component.html',
  styleUrls: ['./clusters4.component.scss']
})
export class Clusters4Component implements OnInit {
  @ViewChild(GoogleMap, { static: false }) map!: GoogleMap;

  clusters: any[] = [];
  loading = false;
  error: string | null = null;
  center = { lat: 43.6532, lng: -79.3832 };
  zoom = 12;
  clusterId: number;
  activeClusterId: number | null = null;
  heatmap?: google.maps.visualization.HeatmapLayer;

  constructor(private api: RestApiService, private router: ActivatedRoute) {}

  ngOnInit(): void { this.load(); }

  private load() {
    this.loading = true;
    this.router.paramMap.subscribe(params => {
      this.clusterId = Number(params.get('id'));
      this.api.get<any>(`clusters/?cluster_algorithm=${this.clusterId}`).subscribe({
        next: clustersResp => {
          const items = clustersResp.results || [];
          const calls = items.map((c: any) =>
            this.fetchBuildingsForCluster(c.id).pipe(catchError(() => of([])))
          );
          forkJoin(calls).subscribe({
            next: (blds: any[]) => {
              this.clusters = items.map((c: any, i: number) => {
                const bld = (blds[i] || []).map((b: any) => ({ lat: b.lat ?? b.latitude, lng: b.lng ?? b.longitude }));
                return { ...c, buildings: bld, hull: this.buildHull(bld) };
              });
              this.loading = false;
              this.createHeatmap();
              this.fitMapToClusters();
            },
            error: e => {
              console.error(e);
              this.loading = false;
              this.error = 'Could not load cluster buildings';
              this.clusters = items.map((c: any) => ({ ...c, buildings: [], hull: [] }));
              this.createHeatmap();
              this.fitMapToClusters();
            }
          });
        },
        error: err => {
          console.error(err);
          this.error = 'Could not load clusters';
          this.loading = false;
        }
      });
    });
  }

  private fetchBuildingsForCluster(clusterId: number) {
    return this.api.get<any>(`clusters2/${clusterId}/buildings/`).pipe(
      catchError(() => this.api.get<any>(`buildings/?cluster=${clusterId}`))
    );
  }

  private createHeatmap() {
    if (!this.map || !this.clusters.length) return;
    const points = this.clusters
      .filter(c => c.latitude && c.longitude)
      .map(c => ({ location: new google.maps.LatLng(c.latitude, c.longitude), weight: (c.aggregate_peak_kw ?? c.no_of_buildings ?? 1) })) as google.maps.visualization.WeightedLocation[];

    if (this.heatmap) this.heatmap.setMap(null);
    this.heatmap = new google.maps.visualization.HeatmapLayer({ data: points, radius: 60 });
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

  setActive(c: any) {
    this.activeClusterId = c.id;
    if (!this.map || !c.latitude || !c.longitude) return;
    this.center = { lat: c.latitude, lng: c.longitude };
    this.zoom = 15;
  }

  // convex hull
  private buildHull(points: {lat:number,lng:number}[]) {
    if (!points || points.length <= 2) return points.slice();
    const pts = points.map(p => ({ x: p.lng, y: p.lat, orig: p }));
    pts.sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
    const cross = (o:any, a:any, b:any) => (a.x - o.x)*(b.y - o.y) - (a.y - o.y)*(b.x - o.x);
    const lower:any[] = [];
    for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop(); lower.push(p); }
    const upper:any[] = [];
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop(); upper.push(p); }
    upper.pop(); lower.pop(); return lower.concat(upper).map((p:any) => ({ lat: p.y, lng: p.x }));
  }

  formatKw(val?: number) {
    return val == null ? '-' : `${Math.round(val * 10) / 10} kW`;
  }
}