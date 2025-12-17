import { Component, Input, ViewChild } from '@angular/core';
import { GoogleMap, MapInfoWindow, MapPolyline, MapMarker } from '@angular/google-maps';
import { ActivatedRoute, Router } from '@angular/router';
import { RestApiService } from '../../../@core/utils/rest-api.service';

@Component({
  selector: 'ngx-edge-algorithm',
  templateUrl: './edge-algorithm.component.html',
  styleUrls: ['./edge-algorithm.component.scss']
})
export class EdgeAlgorithmComponent {
@Input() algoId!: number;
  algorithm: any;
  
  // These lists are populated directly from the API response
  nodes: any[] = [];
  edges: any[] = [];

  // Map Config
  @ViewChild(GoogleMap) map!: GoogleMap;
  @ViewChild(MapInfoWindow) infoWindow!: MapInfoWindow;
  
  center: google.maps.LatLngLiteral = { lat: 0, lng: 0 };
  zoom = 13;
  selectedItem: any = null;
  selectedType: 'node' | 'edge' | null = null;

  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }]
  };

  // Styles
  edgeOptions: google.maps.PolylineOptions = {
    strokeColor: '#ffaa00',
    strokeOpacity: 0.8,
    strokeWeight: 2,
    clickable: true
  };
  
  selectedEdgeOptions: google.maps.PolylineOptions = {
    strokeColor: '#3366ff',
    strokeOpacity: 1,
    strokeWeight: 4,
    zIndex: 100
  };

  nodeOptions: google.maps.MarkerOptions = {
    icon: { path: google.maps.SymbolPath.CIRCLE, scale: 3, fillColor: '#8f9bb3', fillOpacity: 1, strokeWeight: 0 },
  };

  constructor(
    private api: RestApiService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (!this.algoId) {
      this.route.paramMap.subscribe(params => {
        const id = params.get('id');
        if (id) {
          this.algoId = Number(id);
          this.loadData();
        }
      });
    } else {
      this.loadData();
    }
  }

  loadData() {
    this.api.get<any>(`edge_algorithms/${this.algoId}/`).subscribe(data => {
      this.algorithm = data;
      
      // 1. DIRECT ASSIGNMENT: No calculation here. 
      // The API 'edges' already contain the {lat, lng} path array.
      this.edges = data.edges || [];
      this.nodes = data.nodes || [];

      // 2. Set Map Center
      if (this.nodes.length > 0) {
        this.center = { 
          lat: Number(this.nodes[0].latitude), 
          lng: Number(this.nodes[0].longitude) 
        };
      }
      
      this.fitBounds();
    });
  }

  fitBounds() {
    if (this.nodes.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    this.nodes.forEach(n => {
      if(n.latitude && n.longitude) {
        bounds.extend({ lat: Number(n.latitude), lng: Number(n.longitude) });
      }
    });
    setTimeout(() => { if (this.map) this.map.fitBounds(bounds); }, 100);
  }

  selectEdge(edge: any, polyline: MapPolyline) {
    this.selectedItem = edge;
    this.selectedType = 'edge';
    
    // Open info window at the middle of the line
    const path = edge.path; // API provided this
    const midLat = (path[0].lat + path[1].lat) / 2;
    const midLng = (path[0].lng + path[1].lng) / 2;
    
    this.infoWindow.open({
      getAnchor: () => ({ getPosition: () => ({ lat: midLat, lng: midLng }) })
    } as any);
  }

  selectNode(node: any, marker: MapMarker) {
    this.selectedItem = node;
    this.selectedType = 'node';
    this.infoWindow.open(marker);
  }
}
