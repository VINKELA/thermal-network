import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { Edge } from '../../../@core/data/edge';
import { GoogleMap } from '@angular/google-maps';

@Component({
  selector: 'ngx-edge',
  templateUrl: './edge.component.html',
  styleUrls: ['./edge.component.scss']
})
export class EdgeComponent implements OnInit {
  @Input() edgeId!: number;
  edge: Edge | undefined;
  
  // Map Access
  @ViewChild(GoogleMap) map!: GoogleMap;

  // Map Settings
  center: google.maps.LatLngLiteral = { lat: 0, lng: 0 };
  zoom = 16;
  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    mapTypeId: 'roadmap',
  };

  // Polyline (The Pipe) Visualization
  polylinePath: google.maps.LatLngLiteral[] = [];
  polylineOptions: google.maps.PolylineOptions = {
    strokeColor: '#3366ff', // Angular Blue
    strokeOpacity: 1.0,
    strokeWeight: 6,
  };

  constructor(
    private api: RestApiService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    if (!this.edgeId) {
      this.route.paramMap.subscribe(params => {
        const id = params.get('id');
        if (id) {
          this.edgeId = Number(id);
          this.loadEdge();
        }
      });
    } else {
      this.loadEdge();
    }
  }

  loadEdge() {
    this.api.get<Edge>(`edges/${this.edgeId}/`).subscribe(data => {
      this.edge = data;
      this.setupMapVisuals();
    });
  }

  setupMapVisuals() {
    if (!this.edge || !this.edge.start_node.latitude || !this.edge.end_node.latitude) return;

    const start = { 
      lat: Number(this.edge.start_node.latitude), 
      lng: Number(this.edge.start_node.longitude) 
    };
    const end = { 
      lat: Number(this.edge.end_node.latitude), 
      lng: Number(this.edge.end_node.longitude) 
    };

    // 1. Draw the line
    this.polylinePath = [start, end];

    // 2. Auto-fit map to show the whole pipe
    // We need a small timeout to allow the map component to initialize
    setTimeout(() => {
      if (this.map) {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(start);
        bounds.extend(end);
        this.map.fitBounds(bounds);
      }
    }, 100);
  }

  navigateToNode(nodeId: number) {
    this.router.navigate(['/pages/nodes', nodeId]);
  }

  goBack() {
    this.router.navigate(['/pages/edges']);
  }
}