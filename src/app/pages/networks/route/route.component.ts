import { Component, Input, OnChanges, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { GoogleMap, MapInfoWindow } from '@angular/google-maps';
import { ActivatedRoute, Router } from '@angular/router';
import { RestApiService } from '../../../@core/utils/rest-api.service';


@Component({
  selector: 'ngx-route',
  templateUrl: './route.component.html',
  styleUrls: ['./route.component.scss']
})
export class RouteComponent implements OnInit{
   @Input() routeId!: number;
  routeData: any;
  
  // Visuals
  decodedPath: google.maps.LatLngLiteral[] = [];
  startNode: any;
  endNode: any;

  // Map Config
  @ViewChild(GoogleMap) map!: GoogleMap;
  @ViewChild(MapInfoWindow) infoWindow!: MapInfoWindow;
  
  center: google.maps.LatLngLiteral = { lat: 0, lng: 0 };
  zoom = 15;

  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    fullscreenControl: true, // <--- ADDED FULLSCREEN BUTTON
    fullscreenControlOptions: { position: google.maps.ControlPosition.TOP_RIGHT },
    styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }]
  };

  // Styles
  lineOptions: google.maps.PolylineOptions = {
    strokeOpacity: 0.8,
    strokeWeight: 5,
    clickable: true
  };

  nodeOptions: google.maps.MarkerOptions = {
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 4,
      fillColor: '#8f9bb3',
      fillOpacity: 1,
      strokeWeight: 0
    }
  };

  constructor(
    private api: RestApiService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (!this.routeId) {
      this.route.paramMap.subscribe(params => {
        const id = params.get('id');
        if (id) {
          this.routeId = Number(id);
          this.loadData();
        }
      });
    } else {
      this.loadData();
    }
  }

  loadData() {
    this.api.get<any>(`routes/${this.routeId}/`).subscribe(data => {
      this.routeData = data;
      
      // 1. Set Line Color based on Type
      const color = data.route_type === 'supply' ? '#ff3d71' : '#3366ff';
      this.lineOptions = { ...this.lineOptions, strokeColor: color };

      // 2. Extract Context Nodes (from Edge relation)
      if (data.edge) {
        this.startNode = data.edge.start_node;
        this.endNode = data.edge.end_node;
      }

      // 3. Decode Polyline
      if (data.polyline) {
        this.decodedPath = this.decodePolyline(data.polyline);
        
        // Center Map
        if (this.decodedPath.length > 0) {
          this.center = this.decodedPath[0];
          this.fitBounds();
        }
      }
    });
  }

  // --- CUSTOM DECODER ---
  decodePolyline(encoded: string): google.maps.LatLngLiteral[] {
    const poly: google.maps.LatLngLiteral[] = [];
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;

    while (index < len) {
      let b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lat += ((result & 1) ? ~(result >> 1) : (result >> 1));

      shift = 0; result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lng += ((result & 1) ? ~(result >> 1) : (result >> 1));

      poly.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return poly;
  }

  fitBounds() {
    if (this.decodedPath.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    this.decodedPath.forEach(p => bounds.extend(p));
    // Add nodes to bounds to ensure they aren't cut off
    if (this.startNode) bounds.extend({ lat: this.startNode.latitude, lng: this.startNode.longitude });
    if (this.endNode) bounds.extend({ lat: this.endNode.latitude, lng: this.endNode.longitude });

    setTimeout(() => { if (this.map) this.map.fitBounds(bounds); }, 100);
  }

  goBack() {
    // Navigate back to the parent translation page if possible
    if(this.routeData?.translation) {
      this.router.navigate(['/pages/edge-translations', this.routeData.translation]);
    } else {
      this.router.navigate(['/pages/networks']);
    }
  }
}
