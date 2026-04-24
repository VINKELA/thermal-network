import { Component, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { NbThemeService } from '@nebular/theme';
import { GoogleMap } from '@angular/google-maps';
import { EChartsOption } from 'echarts';

interface RouteDetail {
  id: number;
  route_type: 'supply' | 'return';
  polyline: string;
  distance_meters: number;
  duration_seconds: number;
  edge: number;
  translation: number;
  // UI Helpers
  uiColor?: string;
  decodedPath?: google.maps.LatLngLiteral[];
  velocity?: number; // km/h
}

@Component({
  selector: 'ngx-routes-compare',
  templateUrl: './routes-compare.component.html',
  styleUrls: ['./routes-compare.component.scss']
})

export class RoutesCompareComponent implements OnInit, AfterViewInit {

  @ViewChild(GoogleMap) map!: GoogleMap;

  // Data State
  routeList: RouteDetail[] = [];
  selectedIds: number[] = [];
  comparisonData: RouteDetail[] = [];

  // Visuals
  profileChartOption: EChartsOption = {};
  symmetryChartOption: EChartsOption = {};
  
  isLoadingList = false;
  isLoadingCompare = false;

  // Map Config - Default to Toronto to avoid "Ocean View"
  center: google.maps.LatLngLiteral = { lat: 43.6532, lng: -79.3832 };
  zoom = 12;
  
  mapOptions: google.maps.MapOptions = { 
    disableDefaultUI: true, 
    zoomControl: true,
    styles: [
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'off' }] }
    ] 
  };

  // Engineering Colors: Red = Hot (Supply), Blue = Cold (Return)
  colorMap: { [key: string]: string } = {
    'supply': '#ff3d71', 
    'return': '#3366ff'
  };

  constructor(private api: RestApiService, private theme: NbThemeService) {}

  ngOnInit() {
    this.fetchRouteList();
  }

  ngAfterViewInit() {
    // Optional: map ready check
  }

  // --- 1. FETCH LIST ---

  fetchRouteList() {
    this.isLoadingList = true;
    this.api.get<any>('routes/?limit=50').subscribe({
      next: (res) => {
        this.routeList = res.results || [];
        this.isLoadingList = false;
      },
      error: (err) => {
        console.error(err);
        this.isLoadingList = false;
      }
    });
  }

  toggleSelection(id: number) {
    if (this.selectedIds.includes(id)) {
      this.selectedIds = this.selectedIds.filter(x => x !== id);
    } else {
      if (this.selectedIds.length >= 4) this.selectedIds.shift(); // Max 4 items
      this.selectedIds.push(id);
    }
    
    // Trigger comparison if items are selected
    this.selectedIds.length > 0 ? this.fetchComparisonData() : (this.comparisonData = []);
  }

  // --- 2. DATA PROCESSING (The Critical Part) ---

  fetchComparisonData() {
    this.isLoadingCompare = true;
    
    // Simulate fetching full objects (or use API .post() if you have a bulk endpoint)
    // Here we filter locally for speed, assuming 'routeList' has the polyline data.
    const selectedRoutes = this.routeList.filter(r => this.selectedIds.includes(r.id));
    
    this.processRoutes(selectedRoutes);
    this.isLoadingCompare = false;
  }

  processRoutes(routes: RouteDetail[]) {
    // 1. CRITICAL: Check for Geometry Library
    if (typeof google === 'undefined' || !google.maps.geometry) {
      console.error("CRITICAL ERROR: 'google.maps.geometry' is missing. Add '&libraries=geometry' to your Maps API script in index.html");
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    let validPointsCount = 0;

    this.comparisonData = routes.map((r, index) => {
      // 2. Decode the Polyline string
      const decoded = google.maps.geometry.encoding.decodePath(r.polyline);
      
      // 3. CONVERT to pure Numbers to avoid map errors
      const pathLiteral = decoded.map(p => ({ 
        lat: Number(p.lat()), 
        lng: Number(p.lng()) 
      }));

      // 4. Extend Bounds
      if (pathLiteral.length > 0) {
        pathLiteral.forEach(p => bounds.extend(p));
        validPointsCount += pathLiteral.length;
      }

      // Calculate Velocity (km/h) for the chart
      const speedKmh = r.duration_seconds > 0 
        ? (r.distance_meters / r.duration_seconds) * 3.6 
        : 0;

      return {
        ...r,
        uiColor: this.colorMap[r.route_type] || '#888',
        decodedPath: pathLiteral,
        velocity: speedKmh
      };
    });

    // 5. Fit Bounds (Only if we have valid points)
    if (validPointsCount > 0) {
      setTimeout(() => {
        if (this.map) {
          this.map.fitBounds(bounds);
          // Optional: slight padding zoom out if needed
        }
      }, 300); // Small delay to allow ViewChild to init
    } else {
      console.warn("No valid points found in selected routes.");
    }

    this.generateCharts();
  }

  // --- 3. CHARTS ---

  generateCharts() {
    this.theme.getJsTheme().subscribe(config => {
      const echarts: any = config.variables.echarts;

      // Chart A: Length Delta (Supply vs Return Balance)
      this.profileChartOption = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '10%', bottom: '3%', top: '10%', containLabel: true },
        xAxis: { type: 'value', name: 'Meters', axisLabel: { color: echarts.textColor } },
        yAxis: { type: 'category', data: this.comparisonData.map(c => `R-${c.id}`), axisLabel: { color: echarts.textColor } },
        series: [{
          name: 'Length',
          type: 'bar',
          barWidth: '60%',
          data: this.comparisonData.map(c => ({
            value: c.distance_meters,
            itemStyle: { color: c.uiColor }
          })),
          label: { show: true, position: 'right', formatter: '{c} m' }
        }]
      };

      // Chart B: Friction/Speed Radar
      this.symmetryChartOption = {
        color: ['#00d68f'],
        tooltip: { trigger: 'item' },
        radar: {
          radius: '65%',
          indicator: this.comparisonData.map(c => ({ name: `R-${c.id}`, max: 80 })), // Assume 80km/h max
          splitArea: { areaStyle: { color: 'transparent' } }
        },
        series: [{
          type: 'radar',
          data: [{
            value: this.comparisonData.map(c => c.velocity?.toFixed(1)),
            name: 'Avg Speed (km/h)',
            areaStyle: { opacity: 0.2 },
            lineStyle: { width: 2 }
          }]
        }]
      };
    });
  }

  get isLoaded(): boolean { return typeof google !== 'undefined'; }
}