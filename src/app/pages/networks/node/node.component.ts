import { Component, Input, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { Node, NodeType } from '../../../@core/data/node';

@Component({
  selector: 'ngx-node',
  templateUrl: './node.component.html',
  styleUrls: ['./node.component.scss']
})
export class NodeComponent implements OnInit {
  @Input() nodeId!: number;
  node: Node | undefined;

  // Map Config
  center: google.maps.LatLngLiteral = { lat: 0, lng: 0 };
  zoom = 18; // Very close zoom for specific equipment/node
  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    //mapTypeId: 'satellite' // Satellite is best for physical nodes/manholes/equipment
  };

  // UX: Theme & Icon Config
  typeConfig: Record<NodeType, { label: string; icon: string; class: string }> = {
    consumer: { label: 'Consumer', icon: 'home-outline', class: 'type-consumer' },     // Blue
    producer: { label: 'Producer', icon: 'flash-outline', class: 'type-producer' },   // Green
    storage:  { label: 'Storage',  icon: 'cube-outline', class: 'type-storage' }      // Purple
  };

  constructor(
    private api: RestApiService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    if (!this.nodeId) {
      this.route.paramMap.subscribe(params => {
        const id = params.get('id');
        if (id) {
          this.nodeId = Number(id);
          this.loadNode();
        }
      });
    } else {
      this.loadNode();
    }
  }

  loadNode() {
    this.api.get<Node>(`nodes/${this.nodeId}/`).subscribe(data => {
      this.node = data;
      
      if (this.node.latitude && this.node.longitude) {
        this.center = {
          lat: Number(this.node.latitude),
          lng: Number(this.node.longitude)
        };
      }
    });
  }

  // Helper: Detects which specific asset is attached to this node
  get activeAsset(): { type: string, name: string, id: number, route: string } | null {
    if (!this.node) return null;

    if (this.node.building) return { type: 'Building', name: this.node.building.name, id: this.node.building.id, route: '/pages/buildings' };
    if (this.node.pv) return { type: 'PV System', name: 'Solar Array', id: this.node.pv.id, route: '/pages/assets/pv' }; // Adjust route
    if (this.node.geothermal) return { type: 'Geothermal', name: 'Geo Loop', id: this.node.geothermal.id, route: '/pages/assets/geo' };
    if (this.node.boiler) return { type: 'Boiler', name: 'Boiler Unit', id: this.node.boiler.id, route: '/pages/assets/boiler' };
    if (this.node.thermal_storage) return { type: 'Thermal Storage', name: 'Tank', id: this.node.thermal_storage.id, route: '/pages/assets/storage' };
    
    return null;
  }

  goBack() {
    // Return to the parent Network page
    if (this.node) {
      this.router.navigate(['/pages/nodes']);
    }
  }

  goToAsset(route: string, id: number) {
    this.router.navigate([route, id]);
  }
}