import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GoogleMap, MapInfoWindow, MapMarker } from '@angular/google-maps';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { Network } from '../../../@core/data/network';
import { Node, NodeType } from '../../../@core/data/node';

@Component({
  selector: 'ngx-network',
  templateUrl: './network.component.html',
  styleUrls: ['./network.component.scss']
})
export class NetworkComponent implements OnInit {
  networkId!: number;
  network: Network | undefined;
  nodes: any[] = [];
  edges: any[] = []; // <--- NEW: Store edges here

  // Map Access
  @ViewChild(GoogleMap) map!: GoogleMap;
  @ViewChild(MapInfoWindow) infoWindow!: MapInfoWindow;
  
  selectedNode: Node | null = null;
  selectedEdge: any | null = null; // <--- NEW: To show edge info

  // Map Config
  center: google.maps.LatLngLiteral = { lat: 0, lng: 0 };
  zoom = 13;
  
  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    fullscreenControl: true,
    fullscreenControlOptions: { position: google.maps.ControlPosition.TOP_RIGHT },
    mapTypeId: 'roadmap',
    styles: [ { featureType: 'poi', stylers: [{ visibility: 'off' }] } ]
  };

  constructor(
    private api: RestApiService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.networkId = Number(id);
        this.loadData();
      } else {
        console.error('No Network ID provided in URL');
        this.goBack();
      }
    });
  }

  loadData() {
    this.api.get<any>(`networks/${this.networkId}/`).subscribe(net => {
      this.network = net;
      this.nodes = net.nodes || [];
      this.edges = net.edges || []; // <--- NEW: Load edges

      // 1. Center logic
      if (net.latitude && net.longitude) {
        this.center = { lat: Number(net.latitude), lng: Number(net.longitude) };
      }

      // 2. Fit Bounds (Include nodes)
      if (this.nodes.length > 0) {
        this.fitBounds();
      }
    });
  }

  fitBounds() {
    if (this.nodes.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    let validPoints = 0;

    this.nodes.forEach(n => {
      if (n.latitude && n.longitude) {
        bounds.extend({ lat: Number(n.latitude), lng: Number(n.longitude) });
        validPoints++;
      }
    });

    if (validPoints > 0) {
      setTimeout(() => { 
        if (this.map) {
          this.map.fitBounds(bounds);
          if (validPoints === 1) this.zoom = 15; 
        }
      }, 100);
    }
  }

  // --- NODE MARKERS ---
  getMarkerOptions(node: Node): google.maps.MarkerOptions {
    const type = node.node_type as NodeType;
    let color = '#777';
    let path = google.maps.SymbolPath.CIRCLE;
    let scale = 6;

    switch (type) {
      case 'producer':
        color = '#ef4444'; // Red
        scale = 9;
        path = google.maps.SymbolPath.BACKWARD_CLOSED_ARROW; 
        break;
      case 'consumer':
        color = '#3b82f6'; // Blue
        path = google.maps.SymbolPath.CIRCLE; 
        break;
      case 'storage':
        color = '#8b5cf6'; // Purple
        scale = 8;
        path = google.maps.SymbolPath.FORWARD_CLOSED_ARROW; 
        break;
      case 'cluster':
        color = '#10b981'; // Green
        scale = 10;
        path = google.maps.SymbolPath.FORWARD_OPEN_ARROW; 
        break;
    }

    return {
      icon: {
        path: path,
        fillColor: color,
        fillOpacity: 0.9,
        strokeWeight: 1,
        strokeColor: '#ffffff',
        scale: scale,
      },
      title: node.name,
      zIndex: 10 // Nodes on top of lines
    };
  }

  // --- EDGE POLYLINES (NEW) ---
  
  getEdgePath(edge: any): google.maps.LatLngLiteral[] {
    if (!edge.start_node || !edge.end_node) return [];
    return [
      { lat: Number(edge.start_node.latitude), lng: Number(edge.start_node.longitude) },
      { lat: Number(edge.end_node.latitude), lng: Number(edge.end_node.longitude) }
    ];
  }

  getEdgeOptions(edge: any): google.maps.PolylineOptions {
    // Determine type based on naming convention or edge_type field
    // Logic: 'Pipe' = Solid, 'Truck/Mobile' = Dashed
    const isMobile = (edge.name && edge.name.includes('Truck')) || edge.edge_type === 'mobile_route';
    
    // Default Pipe Style (Dark Grey/Blue)
    const baseOptions: google.maps.PolylineOptions = {
      strokeColor: 'red', 
      strokeOpacity: 0.8,
      strokeWeight: 4,
      geodesic: true,
      clickable: true,
      zIndex: 1 // Lines below nodes
    };

    if (isMobile) {
      // Mobile Route Style (Orange Dashed)
      return {
        ...baseOptions,
        strokeColor: '#f39c12',
        strokeOpacity: 0, // Hide base line, use icons for dashes
        icons: [{
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3, strokeColor: '#f39c12' },
          offset: '0',
          repeat: '20px'
        }]
      };
    }

    return baseOptions;
  }

  openNodeInfo(marker: MapMarker, node: Node) {
    this.selectedNode = node;
    this.selectedEdge = null; // Clear edge info
    this.infoWindow.open(marker);
  }

  openEdgeInfo(edge: any, polyline: any) {
    // You can't easily attach InfoWindow to a Polyline directly in Angular GMaps
    // Simplest way: set selectedEdge and use a fixed position or center of line
    // For now, we will just log it or show it in a side panel if you had one.
    // Alternatively, calculate midpoint:
    const midLat = (Number(edge.start_node.latitude) + Number(edge.end_node.latitude)) / 2;
    const midLng = (Number(edge.start_node.longitude) + Number(edge.end_node.longitude)) / 2;
    
    this.selectedEdge = edge;
    this.selectedNode = null;
    
    // Hack: open info window at midpoint
    this.infoWindow.position = { lat: midLat, lng: midLng };
    this.infoWindow.open();
  }

  goBack() {
    this.router.navigate(['/pages/networks']);
  }
}