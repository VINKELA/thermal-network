import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { ActivatedRoute, Router } from '@angular/router';

import { GoogleMap } from '@angular/google-maps';
import { ClusterAlgorithm, Cluster } from '../../../@core/data/cluster-algorithm';

@Component({
  selector: 'ngx-cluster-analysis',
  templateUrl: './cluster-analysis.component.html',
  styleUrls: ['./cluster-analysis.component.scss']
})
export class ClusterAnalysisComponent implements OnInit {
  @Input() algorithmId = 1;
  result: ClusterAlgorithm | undefined;
  
  // State for interactivity
  selectedClusterId: number | null = null;

  // Map Config
  @ViewChild(GoogleMap) map!: GoogleMap;
  center: google.maps.LatLngLiteral = { lat: 0, lng: 0 };
  zoom = 13;
  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    mapTypeId: 'roadmap',
    styles: [ /* Optional: Light style to make colored circles pop */ ]
  };

  // Visualization Config
  circleOptions: google.maps.CircleOptions = {
    strokeColor: '#3366ff',
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: '#3366ff',
    fillOpacity: 0.15, // Low opacity to see buildings underneath
  };

  activeCircleOptions: google.maps.CircleOptions = {
    strokeColor: '#ff3d71', // Red for selected
    strokeOpacity: 1,
    strokeWeight: 3,
    fillColor: '#ff3d71',
    fillOpacity: 0.3,
  };

  constructor(
    private api: RestApiService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (!this.algorithmId) {
      this.route.paramMap.subscribe(params => {
        const id = params.get('id');
        if (id) {
          this.algorithmId = Number(id);
          this.loadData();
        }
      });
    } else {
      this.loadData();
    }
  }

  loadData() {
    // We fetch the Algorithm run, which we expect to include the generated Clusters
    this.api.get<ClusterAlgorithm>(`cluster_algorithms/${this.algorithmId}/`)
    .subscribe(data => {
      this.result = data;
      this.fitMapToBounds();
    });
  }

  fitMapToBounds() {
    if (!this.result?.clusters || this.result.clusters.length === 0) return;

    // Calculate bounds to show ALL clusters
    const bounds = new google.maps.LatLngBounds();
    this.result.clusters.forEach(c => {
      if (c.latitude && c.longitude) {
        bounds.extend({ lat: c.latitude, lng: c.longitude });
      }
    });

    // Slight timeout to let map initialize
    setTimeout(() => {
      if (this.map) this.map.fitBounds(bounds);
    }, 100);
  }

  selectCluster(cluster: Cluster) {
    this.selectedClusterId = cluster.id;
    
    // Pan to the selected cluster
    this.center = { lat: cluster?.latitude, lng: cluster.longitude };
    this.zoom = 15;
  }

  // Pretty print JSON parameters
  get formatParams(): string {
    if (!this.result?.parameters) return '';
    return JSON.stringify(this.result.parameters, null, 2); 
  }

  goBack() {
    this.router.navigate(['/pages/optimization']); // Or relevant parent route
  }
}