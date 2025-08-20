import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MapInfoWindow, MapMarker } from '@angular/google-maps';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { tryCatch } from 'rxjs/internal-compatibility';

interface ApiResponse {
  status: string;
  message: string;
  data: {
    cluster: {
      id: number;
      name: string;
    };
    networks: Network[];
  };
}

interface Network {
  id: number;
  name: string;
  nodes: Node[];
  routes: Route[];
}

interface Node {
  id: number;
  latitude: number;
  longitude: number;
  network: number;
  name: string;
  node_type: string;
  building: any;
  pv: any;
  geothermal: any;
  boiler: any;
  thermal_storage: any;
}

interface Route {
  id: number;
  edge: number;
  translation: number;
  sub_route: any;
  polyline: string;
  distance_meters: number;
  duration_seconds: number;
}

interface MapNode extends google.maps.MarkerOptions {
  id: number;
  networkId: number;
  name: string;
  node_type: string;
  infoContent: string;
}

@Component({
  selector: 'ngx-cluster',
  templateUrl: './cluster.component.html',
  styleUrls: ['./cluster.component.scss']
})
export class ClusterComponent {
private destroy$ = new Subject<void>();
  

  clusterId: number | null = null;
  clusterName: string = '';
  loading = true;
  error: string | null = null;

  // Google Maps options
  center: google.maps.LatLngLiteral = { lat: 43.2613, lng: -79.9192 };
  zoom = 15;
  mapOptions: google.maps.MapOptions = {
    mapTypeId: 'hybrid',
    zoomControl: true,
    scrollwheel: true,
    disableDoubleClickZoom: true,
    maxZoom: 20,
    minZoom: 8,
  };

  // Map elements
  markers: MapNode[] = [];
  polylines: google.maps.PolylineOptions[] = [];
  selectedNode: Node | null = null;

  constructor(
    private route: ActivatedRoute,
    private api: RestApiService
  ) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.clusterId = 1;
      if (this.clusterId) {
        this.loadClusterData(this.clusterId);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadClusterData(clusterId: number): void {
    this.loading = true;
    this.error = null;
    
    // In a real app, replace with your actual API endpoint
    this.api.get<ApiResponse>(`clusters/${clusterId}/get_cluster_networks/`)
      .subscribe({
        next: (response) => {
          this.clusterName = response.data.cluster.name;
          this.processNetworkData(response.data.networks);
          this.loading = false;
        },
        error: (err) => {
          this.error = 'Failed to load cluster data';
          this.loading = false;
          console.error(err);
        }
      });
  }

  processNetworkData(networks: Network[]): void {
    this.markers = [];
    this.polylines = [];

    // Process nodes
    networks.forEach(network => {
      network.nodes.forEach(node => {
        const marker: MapNode = {
          position: { lat: node.latitude, lng: node.longitude },
          id: node.id,
          networkId: network.id,
          name: node.name,
          node_type: node.node_type,
          infoContent: this.getInfoContent(node),
          icon: this.getMarkerIcon(node.node_type),
          title: node.name
         
        };
        this.markers.push(marker);
      });
      // Process routes
      network.routes.forEach(route => {
        if (route.polyline) {
              const path = this.decodePolyline(route.polyline);
            this.polylines.push({
            path: path,
            strokeColor: this.getRouteColor(route),
            strokeOpacity: 0.8,
            strokeWeight: 3,
            geodesic: true
          });
         
        
        }
      });
    });

    // Set map center to first node if available
    if (this.markers.length > 0) {
      //this.center = this.markers[0].position;
    }
  }

  getMarkerIcon(nodeType: string): string {
    const baseUrl = 'https://maps.google.com/mapfiles/ms/icons/';
    switch(nodeType) {
      case 'producer':
        return baseUrl + 'red-dot.png';
      case 'consumer':
        return baseUrl + 'blue-dot.png';
      default:
        return baseUrl + 'green-dot.png';
    }
  }

  getRouteColor(route: any): string {
    // Simple hash function to generate consistent colors for networks
    const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];
    return route.route_type == 'supply'? '#FF0000': '#0000FF';
  }

  getInfoContent(node: Node): string {
    return `
      <div class="map-info-window">
        <h3>${node.name}</h3>
        <p><strong>Type:</strong> ${node.node_type}</p>
        <p><strong>Location:</strong> ${node.latitude.toFixed(6)}, ${node.longitude.toFixed(6)}</p>
        ${node?.building ? `<p><strong>Building:</strong> ${node?.building}</p>` : ''}
      </div>
    `;
  }

  openInfoWindow(marker: MapMarker, node: MapNode): void {
    this.selectedNode = node as unknown as Node;
  }
  decodePolyline(encoded: string): google.maps.LatLngLiteral[] {
     const poly: google.maps.LatLngLiteral[] = [];
     let index = 0;
     const len = encoded.length;
     let lat = 0;
     let lng = 0;
 
     while (index < len) {
       let b;
       let shift = 0;
       let result = 0;
       do {
         b = encoded.charCodeAt(index++) - 63;
         result |= (b & 0x1f) << shift;
         shift += 5;
       } while (b >= 0x20);
       const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
       lat += dlat;
 
       shift = 0;
       result = 0;
       do {
         b = encoded.charCodeAt(index++) - 63;
         result |= (b & 0x1f) << shift;
         shift += 5;
       } while (b >= 0x20);
       const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
       lng += dlng;
 
       poly.push({ lat: lat / 1e5, lng: lng / 1e5 });
     }
 
     return poly;
   }
 
}

