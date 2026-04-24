import { Component, OnInit, ViewChild } from '@angular/core';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { NbThemeService } from '@nebular/theme';
import { GoogleMap } from '@angular/google-maps';

@Component({
  selector: 'ngx-node-comparison',
  templateUrl: './node-comparison.component.html',
  styleUrls: ['./node-comparison.component.scss']
})
export class NodeComparisonComponent implements OnInit {

  @ViewChild(GoogleMap) map!: GoogleMap;

  // Data
  allNodes: any[] = [];
  selectedIds: number[] = [];
  comparisonData: any[] = [];

  // Charts
  typePieData: any[] = [];
  colorScheme: any = { domain: ['#3366ff', '#ffaa00', '#00d68f', '#ff3d71'] };

  // UI State
  isLoadingList = false;
  isLoadingCompare = false;
  searchText = '';
  searchTimeout: any;

  // Map Config
  mapOptions: google.maps.MapOptions = { 
    disableDefaultUI: true, 
    zoomControl: true,
    styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }]
  };
  center = { lat: 43.65, lng: -79.38 };

  constructor(private api: RestApiService, private theme: NbThemeService) {}

  ngOnInit() {
    this.fetchNodeList();
    this.theme.getJsTheme().subscribe(config => {
      const vars: any = config.variables;
      this.colorScheme = { 
        domain: [vars.primary, vars.warning, vars.success, vars.danger] 
      };
    });
  }

  // --- 1. LIST & SEARCH ---

  fetchNodeList() {
    this.isLoadingList = true;
    let params = '?limit=20'; // Fetch more for nodes as they are small
    if (this.searchText) params += `&search=${encodeURIComponent(this.searchText)}`;

    this.api.get<any>(`nodes/${params}`).subscribe({
      next: (data) => {
        this.allNodes = Array.isArray(data) ? data : (data.results || []);
        this.isLoadingList = false;
      },
      error: () => this.isLoadingList = false
    });
  }

  onSearchInput() {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.fetchNodeList(), 400);
  }

  toggleSelection(id: number) {
    if (this.selectedIds.includes(id)) {
      this.selectedIds = this.selectedIds.filter(x => x !== id);
    } else {
      if (this.selectedIds.length >= 5) return;
      this.selectedIds.push(id);
    }
    this.selectedIds.length > 0 ? this.fetchComparison() : this.resetData();
  }

  resetData() {
    this.comparisonData = [];
    this.typePieData = [];
  }

  // --- 2. DATA PROCESSING ---

  fetchComparison() {
    this.isLoadingCompare = true;
    this.api.post<any[]>({ ids: this.selectedIds }, 'nodes/compare/').subscribe({
      next: (data) => {
        this.comparisonData = data;
        this.generateCharts();
        this.fitMapBounds();
        this.isLoadingCompare = false;
      },
      error: (err) => { console.error(err); this.isLoadingCompare = false; }
    });
  }

  generateCharts() {
    // Count Types for Pie Chart
    const counts: any = {};
    this.comparisonData.forEach(node => {
      const type = node.node_type || 'Unknown';
      counts[type] = (counts[type] || 0) + 1;
    });

    this.typePieData = Object.keys(counts).map(key => ({
      name: key.charAt(0).toUpperCase() + key.slice(1), // Capitalize
      value: counts[key]
    }));
  }

  // --- 3. MAP HELPERS ---

  getMarkerOptions(node: any): google.maps.MarkerOptions {
    if (typeof google === 'undefined') return {};

    const type = node.node_type?.toLowerCase();
    
    // VISUAL CODING:
    // Consumer = Blue Circle
    // Producer = Orange Triangle (Backwards Arrow)
    // Storage = Green Arrow
    // Cluster = Red Circle
    
    let color = '#3366ff'; 
    let scale = 4;
    let path = google.maps.SymbolPath.CIRCLE;

    if (type === 'producer') {
      color = '#ffaa00'; 
      scale = 6;
      path = google.maps.SymbolPath.BACKWARD_CLOSED_ARROW; 
    } else if (type === 'storage') {
      color = '#00d68f'; 
      scale = 5;
      path = google.maps.SymbolPath.FORWARD_CLOSED_ARROW;
    } else if (type === 'cluster') {
      color = '#ff3d71'; 
      scale = 5;
    }

    return {
      icon: {
        path: path,
        scale: scale,
        fillColor: color,
        fillOpacity: 0.9,
        strokeWeight: 1,
        strokeColor: '#ffffff'
      },
      title: node.name || type
    };
  }

  fitMapBounds() {
    if (!this.comparisonData.length || typeof google === 'undefined') return;
    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;
    this.comparisonData.forEach(n => {
      if (n.latitude && n.longitude) {
        bounds.extend({ lat: Number(n.latitude), lng: Number(n.longitude) });
        hasPoints = true;
      }
    });
    if (hasPoints && this.map) setTimeout(() => this.map.fitBounds(bounds), 200);
  }

  // --- 4. TABLE HELPER ---
  getConnectedAsset(node: any): string {
    // Check if the related object exists (DetailSerializer returns object or ID)
    // Assuming backend returns ID or object. If object, access .name or .id
    if (node.building) return `Building: ${node.building}`; 
    if (node.boiler) return `Boiler: ${node.boiler}`;
    if (node.pv) return `PV: ${node.pv}`;
    if (node.thermal_storage) return `Storage: ${node.thermal_storage}`;
    return 'None';
  }

  get isApiLoaded(): boolean { return typeof google !== 'undefined'; }
}