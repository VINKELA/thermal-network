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

  // Map Access
  @ViewChild(GoogleMap) map!: GoogleMap;
  @ViewChild(MapInfoWindow) infoWindow!: MapInfoWindow;
  selectedNode: Node | null = null;

  // Map Config
  center: google.maps.LatLngLiteral = { lat: 0, lng: 0 };
  zoom = 13;
  
  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    fullscreenControl: true, // <--- Added per your request
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
    this.api.get<Network>(`networks/${this.networkId}/`).subscribe(net => {
      this.network = net;
      this.nodes = net.nodes || [];

      // 1. First, try to center on the Network's defined center (as a backup)
      if (net.latitude && net.longitude) {
        this.center = { lat: Number(net.latitude), lng: Number(net.longitude) };
      }

      // 2. CRITICAL FIX: Call fitBounds here!
      // This forces the map to calculate the view that shows all nodes.
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

    // Only adjust map if we found valid coordinates
    if (validPoints > 0) {
      // Use a timeout to ensure the Google Map component is fully rendered
      setTimeout(() => { 
        if (this.map) {
          this.map.fitBounds(bounds);
          
          // Optional: If you only have 1 node, prevent zooming in too close
          if (validPoints === 1) {
            this.zoom = 15; 
          }
        }
      }, 100);
    }
  }

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
      title: node.name
    };
  }

  openNodeInfo(marker: MapMarker, node: Node) {
    this.selectedNode = node;
    this.infoWindow.open(marker);
  }

  goBack() {
    this.router.navigate(['/pages/networks']);
  }
}