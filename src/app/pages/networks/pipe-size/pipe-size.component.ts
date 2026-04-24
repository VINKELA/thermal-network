import { Component, OnInit, ViewChild } from '@angular/core';
import { GoogleMap, MapInfoWindow, MapMarker, MapPolyline } from '@angular/google-maps';
import { ActivatedRoute, Router } from '@angular/router';
import { RestApiService } from '../../../@core/utils/rest-api.service';

@Component({
  selector: 'ngx-pipe-size',
  templateUrl: './pipe-size.component.html',
  styleUrls: ['./pipe-size.component.scss']
})
export class PipeSizeComponent implements OnInit {
  @ViewChild(GoogleMap) map!: GoogleMap;
  @ViewChild(MapInfoWindow) infoWindow!: MapInfoWindow;

  algorithm: any = null;
  edges: any[] = [];
  nodes: any[] = [];

  center: google.maps.LatLngLiteral = { lat: 43.6532, lng: -79.3832 };
  zoom = 15;
  currentZoom = 15;

  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: false,
    styles: [
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'off' }] }
    ]
  };

  selectedItem: any = null;
  selectedType: 'node' | 'edge' | null = null;

  constructor(
    private api: RestApiService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.loadData(Number(id));
  }

  // --- GOLDEN RATIO COLOR GENERATOR ---
  generateDistinctColor(index: number): string {
    const goldenRatioConjugate = 0.618033988749895;
    const hue = Math.floor(((index * goldenRatioConjugate) % 1) * 360);
    const lightness = 45 + (index % 3) * 10; 
    const saturation = 75 + (index % 2) * 15;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  loadData(id: number) {
    this.api.get(`pipe_sizings/${id}/`).subscribe(meta => {
      this.api.get(`edge_pipe_sizings/?pipe_sizing=${id}&visualization=true`).subscribe((rawEdges: unknown) => {
        const edges = rawEdges as any[];

        this.edges = edges.map((e, index) => {
          const edgeColor = this.generateDistinctColor(index);
          return {
            ...e,
            displayColor: edgeColor,
            path: this.resolvePath(e),
            options: this.getEdgeOptions(e, this.currentZoom, edgeColor)
          };
        });

        this.extractNodes();
        this.calculateStats(meta);
        setTimeout(() => this.fitBounds(), 500);
      });
    });
  }
// --- NEW PROPERTIES FOR UI CONTROL ---
  isTableExpanded: boolean = false;

  // ... (Keep all existing methods like loadData, getEdgeOptions, etc.)

  // --- NEW: TABLE CONTROLS ---
  toggleTableSize() {
    this.isTableExpanded = !this.isTableExpanded;
    // Trigger map resize event so Google Maps fills the remaining space correctly
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 300);
  }

  copyTableToClipboard() {
    // Build a Tab-Separated string for perfect Excel pasting
    const headers = ['Segment Name', 'Comm. Size (DN)', 'Exact Dia. (mm)', 'Peak Demand (kW)', 'Mass Flow (kg/s)', 'Velocity (m/s)', 'Pressure Drop (kPa)', 'Length (m)'];
    let tsvData = headers.join('\t') + '\n';

    this.edges.forEach(e => {
      const row = [
        e.edge?.name || 'Unnamed',
        `DN${Math.round(e.diameter_m * 1000)}`,
        (e.diameter_m * 1000).toFixed(2), // Converted m to mm for readability
        (e.peak_load_kw || 0).toFixed(1),
        (e.mass_flow_kg_s || 0).toFixed(2),
        (e.velocity_m_s || 0).toFixed(2),
        ((e.pressure_drop_pa || 0) / 1000).toFixed(2),
        (e.edge?.length || 0).toFixed(0)
      ];
      tsvData += row.join('\t') + '\n';
    });

    navigator.clipboard.writeText(tsvData).then(() => {
      // Optional: Add your toast notification service here
      alert('Data copied to clipboard! Ready to paste into Excel.');
    }).catch(err => {
      console.error('Failed to copy data: ', err);
    });
  }
  private calculateDynamicWeight(diameter_m: number, zoomLevel: number): number {
    const minDiameter = 0.02, maxDiameter = 1.0;
    const minPixels = 3, maxPixels = 16;
    const clampedDiameter = Math.max(minDiameter, Math.min(diameter_m, maxDiameter));
    const normalized = Math.sqrt((clampedDiameter - minDiameter) / (maxDiameter - minDiameter));
    const baseWeight = minPixels + (normalized * (maxPixels - minPixels));
    const zoomFactor = Math.pow(1.4, zoomLevel - 15); 
    return Math.max(2, Math.min(baseWeight * zoomFactor, 35));
  }

  getEdgeOptions(edge: any, zoomLevel: number, color: string): google.maps.PolylineOptions {
    const diameter = edge.diameter_m || 0.02;
    const calculatedWeight = this.calculateDynamicWeight(diameter, zoomLevel);

    return {
      strokeColor: color,
      strokeOpacity: 0.9,
      strokeWeight: calculatedWeight,
      clickable: true,
      geodesic: true,
      zIndex: Math.floor(100 - calculatedWeight) 
    };
  }

  onMapZoom() {
    if (!this.map) return;
    const newZoom = this.map.getZoom();
    if (newZoom && newZoom !== this.currentZoom) {
      this.currentZoom = newZoom;
      this.edges = this.edges.map(edge => ({
        ...edge,
        options: this.getEdgeOptions(edge, this.currentZoom, edge.displayColor)
      }));
    }
  }

  resolvePath(item: any): google.maps.LatLngLiteral[] {
    if (item.route?.polyline && typeof google !== 'undefined' && google.maps.geometry) {
      const decoded = google.maps.geometry.encoding.decodePath(item.route.polyline);
      return decoded.map(p => ({ lat: p.lat(), lng: p.lng() }));
    }
    if (item.edge?.start_node && item.edge?.end_node) {
      return [
        { lat: Number(item.edge.start_node.latitude), lng: Number(item.edge.start_node.longitude) },
        { lat: Number(item.edge.end_node.latitude), lng: Number(item.edge.end_node.longitude) }
      ];
    }
    return [];
  }

  extractNodes() {
    const nodeMap = new Map();
    this.edges.forEach(e => {
      if (e.edge?.start_node) nodeMap.set(e.edge.start_node.id, e.edge.start_node);
      if (e.edge?.end_node) nodeMap.set(e.edge.end_node.id, e.edge.end_node);
    });
    this.nodes = Array.from(nodeMap.values());
  }

  calculateStats(meta: any) {
    const totalLen = this.edges.reduce((sum, e) => sum + (e.edge?.length || 0), 0);
    this.algorithm = {
      name: meta.name || 'Pipe Sizing Run',
      description: meta.method + ' methodology',
      created_at: meta.created_at,
      total_length: totalLen,
      parameters: { method: meta.method, total_edges: this.edges.length }
    };
  }

  // INTERACTION LOGIC
  selectEdge(edge: any, polyline: MapPolyline | null) {
    this.selectedItem = edge;
    this.selectedType = 'edge';

    const path = edge.path;
    if (!path || path.length === 0) return;
    
    // Pan map to the midpoint of the selected pipe
    const midPoint = path[Math.floor(path.length / 2)];
    if (this.map) this.map.panTo(midPoint);

    // Open the popup dashboard exactly at the midpoint
    if (this.infoWindow && this.infoWindow.infoWindow) {
      this.infoWindow.infoWindow.setPosition(midPoint);
      this.infoWindow.infoWindow.open(this.map.googleMap);
    }
  }

  selectNode(node: any, marker: MapMarker) {
    this.selectedItem = node;
    this.selectedType = 'node';
    this.infoWindow.open(marker);
  }

  fitBounds() {
    if (!this.map || !this.nodes.length || typeof google === 'undefined') return;
    const bounds = new google.maps.LatLngBounds();
    this.nodes.forEach(n => bounds.extend({ lat: n.latitude, lng: n.longitude }));
    this.map.fitBounds(bounds);
  }
  
  goBack() {
    this.router.navigate(['..'], { relativeTo: this.route });
  }

  getVelocityStatus(velocity: number): string {
    if (velocity > 2.5) return 'text-danger';
    if (velocity > 2.0) return 'text-warn';
    if (velocity < 0.5) return 'text-low';
    return 'text-good';
  }
}