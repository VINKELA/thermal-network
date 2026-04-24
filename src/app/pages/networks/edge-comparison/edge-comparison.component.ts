import { Component, OnInit, ViewChild } from '@angular/core';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { NbThemeService } from '@nebular/theme';
import { GoogleMap } from '@angular/google-maps';

// --- Interfaces matching your Django Serializers ---

export interface NodeMap {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  node_type?: string;
}

export interface Edge {
  id: number;
  name: string;
  length: number;
  is_default: boolean;
  start_node: NodeMap;
  end_node: NodeMap;
  network: number;
  // Add other fields from '__all__' if needed for display
  created_at?: string;
  updated_at?: string;
  uiColor?: string; // Frontend only property for coloring
}

@Component({
  selector: 'ngx-edge-comparison',
  templateUrl: './edge-comparison.component.html',
  styleUrls: ['./edge-comparison.component.scss']
})
export class EdgeComparisonComponent implements OnInit {

  @ViewChild(GoogleMap) map!: GoogleMap;

  // Data
  edgeList: Partial<Edge>[] = []; // Lightweight list for the sidebar
  selectedIds: number[] = [];
  comparisonData: Edge[] = []; // Full detailed data for the view

  // Visuals
  lengthChartOption: any = {};
  
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

  // Palette for up to 6 items
  colorPalette = ['#3366ff', '#00d68f', '#ffaa00', '#ff3d71', '#884dff', '#0095ff'];

  constructor(private api: RestApiService, private theme: NbThemeService) {}

  ngOnInit() {
    this.fetchEdgeList();
  }

  // --- 1. SEARCH & LIST (GET) ---

  fetchEdgeList() {
    this.isLoadingList = true;
    
    // Updated to limit to 10 and use search param
    let params = '?limit=10';
    if (this.searchText) {
      params += `&search=${encodeURIComponent(this.searchText)}`;
    }

    this.api.get<any>(`edges/${params}`).subscribe({
      next: (data) => {
        // Handle Django pagination 'results' or direct array
        this.edgeList = Array.isArray(data) ? data : (data.results || []);
        this.isLoadingList = false;
      },
      error: (err) => {
        console.error('Error fetching edge list', err);
        this.isLoadingList = false;
      }
    });
  }

  onSearchInput() {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    // 400ms debounce
    this.searchTimeout = setTimeout(() => this.fetchEdgeList(), 400);
  }

  toggleSelection(id: number) {
    if (this.selectedIds.includes(id)) {
      this.selectedIds = this.selectedIds.filter(x => x !== id);
    } else {
      if (this.selectedIds.length >= 6) return; // Max 6 items
      this.selectedIds.push(id);
    }

    // Trigger Comparison Fetch if we have selections, otherwise reset
    this.selectedIds.length > 0 ? this.fetchComparisonData() : this.resetData();
  }

  resetData() {
    this.comparisonData = [];
    this.lengthChartOption = {};
  }

  // --- 2. COMPARE (POST) ---

  fetchComparisonData() {
    this.isLoadingCompare = true;

    // Call the specific compare endpoint with selected IDs
    this.api.post({ ids: this.selectedIds }, 'edges/compare/').subscribe({
      next: (data: any) => {
        const results = Array.isArray(data) ? data : (data.results || []);

        // Map colors to the returned data based on their index
        this.comparisonData = results.map((edge: Edge, index: number) => ({
          ...edge,
          uiColor: this.colorPalette[index % this.colorPalette.length]
        }));

        this.generateCharts();
        this.fitMapBounds();
        this.isLoadingCompare = false;
      },
      error: (err) => {
        console.error('Error fetching comparison', err);
        this.isLoadingCompare = false;
      }
    });
  }

  // --- 3. CHARTS ---

  generateCharts() {
    this.theme.getJsTheme().subscribe(config => {
      const echarts: any = config.variables.echarts;
      const names = this.comparisonData.map(c => `ID: ${c.id}`);

      this.lengthChartOption = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { 
          type: 'category', 
          data: names, 
          axisLabel: { color: echarts.textColor, interval: 0, rotate: 30 } 
        },
        yAxis: { 
          type: 'value', 
          name: 'Length (m)', 
          axisLabel: { color: echarts.textColor },
          splitLine: { lineStyle: { color: echarts.splitLineColor } }
        },
        series: [{
          name: 'Length',
          type: 'bar',
          data: this.comparisonData.map((c) => ({
            value: c.length,
            itemStyle: { color: c.uiColor }
          }))
        }]
      };
    });
  }

  // --- 4. MAP VISUALIZATION ---

  getPolylineOptions(color: string): google.maps.PolylineOptions {
    return {
      strokeColor: color,
      strokeOpacity: 1.0,
      strokeWeight: 6,
      zIndex: 10
    };
  }

  fitMapBounds() {
    if (!this.comparisonData.length || typeof google === 'undefined') return;
    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;

    this.comparisonData.forEach(edge => {
      // Access nested start_node/end_node from Serializer
      if(edge.start_node?.latitude) {
        bounds.extend({ lat: edge.start_node.latitude, lng: edge.start_node.longitude });
        hasPoints = true;
      }
      if(edge.end_node?.latitude) {
        bounds.extend({ lat: edge.end_node.latitude, lng: edge.end_node.longitude });
        hasPoints = true;
      }
    });

    if (hasPoints && this.map) {
      setTimeout(() => this.map.fitBounds(bounds), 200);
    }
  }

  // --- 5. DIFF HELPER ---
  
  hasVariation(key: keyof Edge | string): boolean {
    if (this.comparisonData.length < 2) return false;
    
    // Helper to access nested properties safely (e.g. 'start_node.id')
    const getValue = (obj: any, path: string) => path.split('.').reduce((o, i) => o ? o[i] : null, obj);

    const firstVal = JSON.stringify(getValue(this.comparisonData[0], key as string));
    return this.comparisonData.some(edge => 
      JSON.stringify(getValue(edge, key as string)) !== firstVal
    );
  }

  //get isApiLoaded(): boolean { return typeof google !== 'undefined'; }
  // Add this getter to your component class
// Add this check to ensure the map doesn't try to render before the script exists
get isApiLoaded(): boolean {
  return (typeof google === 'object' && typeof google.maps === 'object');
}

}