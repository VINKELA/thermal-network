import { Component, Inject, Input, ViewChild } from '@angular/core';
import { LocalDataSource } from 'ng2-smart-table';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { GoogleMap, MapInfoWindow, MapPolyline } from '@angular/google-maps';
interface NetworkData {
  network: any;
  translation: any;
  routes: any[];
  nodes: any[];
  statistics: any;
}
@Component({
  selector: 'ngx-translation',
  templateUrl: './translation.component.html',
  styleUrls: ['./translation.component.scss']
})
export class TranslationComponent {
 @Input() translationId!: number;
  translation: any;
  
  // Visual Data Containers
  visualRoutes: any[] = []; 
  nodes: any[] = []; // New: Nodes container

  // Map Config
  @ViewChild(GoogleMap) map!: GoogleMap;
  @ViewChild(MapInfoWindow) infoWindow!: MapInfoWindow;
  
  center: google.maps.LatLngLiteral = { lat: 0, lng: 0 };
  zoom = 14;
  selectedRoute: any = null;

  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    fullscreenControl: true,
    zoomControl: true,
    styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }]
  };

  // --- STYLES ---
  // Route Styles
  supplyOptions: google.maps.PolylineOptions = { strokeColor: '#ff3d71', strokeOpacity: 0.8, strokeWeight: 3, clickable: true };
  returnOptions: google.maps.PolylineOptions = { strokeColor: '#3366ff', strokeOpacity: 0.8, strokeWeight: 3, clickable: true };
  selectedOptions: google.maps.PolylineOptions = { strokeColor: '#00d68f', strokeOpacity: 1, strokeWeight: 5, zIndex: 100 };

  // Node Style
  nodeOptions: google.maps.MarkerOptions = {
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 3,
      fillColor: '#8f9bb3', // Grey
      fillOpacity: 1,
      strokeWeight: 0
    },
    title: 'Node'
  };

  constructor(
    private api: RestApiService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (!this.translationId) {
      this.route.paramMap.subscribe(params => {
        const id = params.get('id');
        if (id) {
          this.translationId = Number(id);
          this.loadData();
        }
      });
    } else {
      this.loadData();
    }
  }

  loadData() {
    this.api.get<any>(`edge_translations/${this.translationId}/`).subscribe(data => {
      this.translation = data;
      this.nodes = data.nodes || []; // Load nodes
      
      // PROCESS ROUTES using Custom Decoder
      if (data.routes) {
        this.visualRoutes = data.routes.map((r: any) => {
          if (!r.polyline) return null;

          try {
            const path = this.decodePolyline(r.polyline);
            return { ...r, decodedPath: path };
          } catch (e) {
            console.error('Error decoding polyline for route', r.id, e);
            return null;
          }
        }).filter((r: any) => r !== null);
      }

      // Center Map on first route
      if (this.visualRoutes.length > 0 && this.visualRoutes[0].decodedPath.length > 0) {
        this.center = this.visualRoutes[0].decodedPath[0];
        this.fitBounds();
      } else if (this.nodes.length > 0) {
         // Fallback center if no routes but nodes exist
         this.center = { lat: this.nodes[0].latitude, lng: this.nodes[0].longitude };
      }
    });
  }

  // --- CUSTOM DECODER (No Geometry Lib needed) ---
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

  fitBounds() {
    if (this.visualRoutes.length === 0 && this.nodes.length === 0) return;
    
    const bounds = new google.maps.LatLngBounds();
    
    // Fit to nodes (safer than checking every point on route)
    this.nodes.forEach(n => {
        if(n.latitude && n.longitude) {
            bounds.extend({ lat: Number(n.latitude), lng: Number(n.longitude) });
        }
    });

    // Also extend for routes just in case
    if(this.nodes.length === 0) {
        this.visualRoutes.forEach(r => {
            if(r.decodedPath.length > 0) bounds.extend(r.decodedPath[0]);
        });
    }

    setTimeout(() => { if (this.map) this.map.fitBounds(bounds); }, 100);
  }

  selectRoute(route: any, polyline: MapPolyline) {
    this.selectedRoute = route;
    // Find midpoint for InfoWindow anchor
    const path = route.decodedPath;
    const midIndex = Math.floor(path.length / 2);
    
    this.infoWindow.open({
      getAnchor: () => ({ getPosition: () => path[midIndex] })
    } as any);
  }

  goBack() {
    this.router.navigate(['/pages/networks']);
  }
 
}
