import { Component, OnInit, ViewChild } from '@angular/core';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { NbThemeService } from '@nebular/theme';
import { GoogleMap } from '@angular/google-maps';
import { EChartsOption } from 'echarts';

// API Interfaces
interface RouteSegment {
  id: number;
  route_type: string;
  polyline: string; // Encoded Google Polyline
  distance_meters: number;
  duration_seconds: number;
}

interface TranslationDetail {
  id: number;
  name: string;
  translation: 'walking' | 'bicycling' | 'driving';
  total_edge_length: number;
  routes: RouteSegment[];
  // UI Helpers
  uiColor?: string;
  decodedPaths?: google.maps.LatLngLiteral[][]; // Cache for map rendering
  totalDuration?: number; // Sum of all segments
}

@Component({
  selector: 'ngx-edge-translation-compare',
  templateUrl: './edge-translation-compare.component.html',
  styleUrls: ['./edge-translation-compare.component.scss']
})
export class EdgeTranslationCompareComponent implements OnInit {

  @ViewChild(GoogleMap) map!: GoogleMap;

  // Data State
  summaryList: any[] = [];
  selectedIds: number[] = [];
  comparisonData: TranslationDetail[] = [];
  
  // Visuals
  efficiencyChartOption: EChartsOption = {};
  timeChartOption: EChartsOption = {};
  
  isLoadingList = false;
  isLoadingCompare = false;

  // Map Options
  mapOptions: google.maps.MapOptions = { 
    disableDefaultUI: false, 
    zoomControl: true,
    styles: [
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'off' }] }
    ] 
  };
  center = { lat: 43.65, lng: -79.38 };

  // Palette: distinct colors for routing layers
  palette = ['#3366ff', '#00d68f', '#ffaa00', '#ff3d71', '#965dfe'];

  constructor(private api: RestApiService, private theme: NbThemeService) {}

  ngOnInit() {
    this.fetchSummaryList();
  }

  // --- 1. SELECTION LOGIC ---

  fetchSummaryList() {
    this.isLoadingList = true;
    this.api.get<any>('edge_translations/?limit=50').subscribe({
      next: (res) => {
        this.summaryList = res.results || [];
        this.isLoadingList = false;
      },
      error: () => this.isLoadingList = false
    });
  }

  toggleSelection(id: number) {
    if (this.selectedIds.includes(id)) {
      this.selectedIds = this.selectedIds.filter(x => x !== id);
    } else {
      if (this.selectedIds.length >= 4) this.selectedIds.shift(); // Limit to 3 for map clarity
      this.selectedIds.push(id);
    }
    
    this.selectedIds.length > 0 ? this.fetchComparisonData() : (this.comparisonData = []);
  }

  // --- 2. DATA PROCESSING & DECODING ---

  fetchComparisonData() {
    this.isLoadingCompare = true;
    this.api.post({ ids: this.selectedIds }, 'edge_translations/compare/').subscribe({
      next: (data: TranslationDetail[]) => {
        
        this.comparisonData = data.map((item, index) => {
          // A. Calculate Aggregates
          const totalDuration = item.routes.reduce((acc, r) => acc + r.duration_seconds, 0);
          
          // B. Decode Polylines for Map
          // Note: Requires Google Maps Geometry library to be loaded
          const paths: google.maps.LatLngLiteral[][] = [];
          if (typeof google !== 'undefined' && google.maps.geometry) {
            item.routes.forEach(route => {
              const decoded = google.maps.geometry.encoding.decodePath(route.polyline);
              // Convert to literal object for Angular component
              paths.push(decoded.map(latLng => ({ lat: latLng.lat(), lng: latLng.lng() })));
            });
          }

          return {
            ...item,
            uiColor: this.palette[index % this.palette.length],
            totalDuration: totalDuration,
            decodedPaths: paths
          };
        });

        this.generateCharts();
        this.fitMapBounds();
        this.isLoadingCompare = false;
      },
      error: (err) => {
        console.error(err);
        this.isLoadingCompare = false;
      }
    });
  }

  // --- 3. CHARTS ---

  generateCharts() {
    this.theme.getJsTheme().subscribe(config => {
      const echarts: any = config.variables.echarts;

      // Chart A: Distance vs Duration (Efficiency)
      // Insight: "Walking" is shorter distance (sidewalks) but higher duration.
      // "Driving" is longer distance (one-ways/roads) but lower duration.
      this.efficiencyChartOption = {
        color: this.comparisonData.map(c => c.uiColor),
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { textStyle: { color: echarts.textColor } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'value', name: 'Distance (km)', axisLabel: { color: echarts.textColor } },
        yAxis: { type: 'category', data: ['Metrics'], axisLabel: { show: false } },
        series: this.comparisonData.map(c => ({
            name: c.name,
            type: 'bar',
            data: [(c.total_edge_length / 1000).toFixed(2)],
            label: { show: true, position: 'right', formatter: '{c} km' }
        }))
      };

      // Chart B: Travel Time Comparison
      this.timeChartOption = {
        color: this.comparisonData.map(c => c.uiColor),
        tooltip: { trigger: 'item', formatter: '{b}: {c} mins' },
        xAxis: { 
            type: 'category', 
            data: this.comparisonData.map(c => c.name),
            axisLabel: { color: echarts.textColor, interval: 0, rotate: 15 } 
        },
        yAxis: { type: 'value', name: 'Time (minutes)' },
        series: [{
            type: 'bar',
            data: this.comparisonData.map(c => ({
                value: (c.totalDuration! / 60).toFixed(1),
                itemStyle: { color: c.uiColor }
            }))
        }]
      };
    });
  }

  // --- 4. MAP HELPERS ---

  fitMapBounds() {
    if (!this.comparisonData.length || typeof google === 'undefined') return;
    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;

    // Extend bounds by checking the start/end of decoded paths
    this.comparisonData.forEach(c => {
      c.decodedPaths?.forEach(path => {
        if(path.length > 0) {
            bounds.extend(path[0]); // Start
            bounds.extend(path[path.length - 1]); // End
            hasPoints = true;
        }
      });
    });

    if (hasPoints && this.map) setTimeout(() => this.map.fitBounds(bounds), 200);
  }

  get isApiLoaded(): boolean { return typeof google !== 'undefined'; }
}