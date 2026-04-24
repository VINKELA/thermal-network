import { Component, OnInit, ViewChild } from '@angular/core';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { NbThemeService } from '@nebular/theme';
import { GoogleMap } from '@angular/google-maps';

@Component({
  selector: 'ngx-cluster-comparison',
  templateUrl: './cluster-comparison.component.html',
  styleUrls: ['./cluster-comparison.component.scss']
})
export class ClusterComparisonComponent implements OnInit {

  @ViewChild(GoogleMap) map!: GoogleMap;

  // Data
  allClusters: any[] = [];
  selectedIds: number[] = [];
  comparisonData: any[] = [];

  // Visuals
  demandChartOption: any = {};
  buildingCountChartOption: any = {};
  
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
  
  // Distinct colors for different CLUSTERS
  clusterColors = ['#3366ff', '#00d68f', '#ffaa00', '#ff3d71', '#884dff'];

  constructor(private api: RestApiService, private theme: NbThemeService) {}

  ngOnInit() {
    this.fetchClusterList();
  }

  // --- 1. LIST & SEARCH ---

  fetchClusterList() {
    this.isLoadingList = true;
    let params = '?limit=15';
    if (this.searchText) params += `&search=${encodeURIComponent(this.searchText)}`;

    this.api.get<any>(`clusters/${params}`).subscribe({
      next: (data) => {
        this.allClusters = Array.isArray(data) ? data : (data.results || []);
        this.isLoadingList = false;
      },
      error: () => this.isLoadingList = false
    });
  }

  onSearchInput() {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.fetchClusterList(), 400);
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
    this.demandChartOption = {};
    this.buildingCountChartOption = {};
  }

  // --- 2. DATA PROCESSING ---

  fetchComparison() {
    this.isLoadingCompare = true;
    this.api.post({ ids: this.selectedIds }, 'clusters/compare/').subscribe({
      next: (data: any) => {
        this.comparisonData = (data as any[]).map((cluster: any, index: number) => ({
          ...cluster,
          uiColor: this.clusterColors[index % this.clusterColors.length]
        }));

        this.generateCharts();
        this.fitMapBounds();
        this.isLoadingCompare = false;
      },
      error: (err) => { console.error(err); this.isLoadingCompare = false; }
    });
  }

  generateCharts() {
    this.theme.getJsTheme().subscribe(config => {
      const colors: any = config.variables;
      const echarts: any = config.variables.echarts;
      const names = this.comparisonData.map(c => c.name);

      // --- Chart 1: Heating vs Cooling Demand (Grouped Bar) ---
      this.demandChartOption = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { data: ['Heating', 'Cooling'], textStyle: { color: echarts.textColor } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: names, axisLabel: { color: echarts.textColor, width: 90, overflow: 'truncate' } },
        yAxis: { type: 'value', name: 'kWh/yr', axisLabel: { color: echarts.textColor }, splitLine: { lineStyle: { color: echarts.splitLineColor } } },
        series: [
          {
            name: 'Heating', type: 'bar', 
            data: this.comparisonData.map(c => c.heating_demand || 0),
            itemStyle: { color: colors.danger }
          },
          {
            name: 'Cooling', type: 'bar', 
            data: this.comparisonData.map(c => c.cooling_demand || 0),
            itemStyle: { color: colors.info }
          }
        ]
      };

      // --- Chart 2: Building Count (Simple Bar) ---
      this.buildingCountChartOption = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'value', show: false },
        yAxis: { type: 'category', data: names, axisLabel: { color: echarts.textColor, width: 80, overflow: 'truncate' } },
        series: [{
          name: 'Buildings', type: 'bar',
          data: this.comparisonData.map(c => c.no_of_buildings),
          itemStyle: { color: colors.primary },
          label: { show: true, position: 'right', color: echarts.textColor }
        }]
      };
    });
  }

  // --- 3. MAP VISUALIZATION ---

  getMarkerOptions(clusterColor: string, isCenter: boolean): google.maps.MarkerOptions {
    if (typeof google === 'undefined') return {};

    // Center = Star, Buildings = Small Circles
    return {
      icon: {
        path: isCenter ? google.maps.SymbolPath.FORWARD_CLOSED_ARROW : google.maps.SymbolPath.CIRCLE,
        scale: isCenter ? 6 : 3,
        fillColor: clusterColor,
        fillOpacity: isCenter ? 1.0 : 0.7,
        strokeWeight: 1,
        strokeColor: '#ffffff'
      },
      zIndex: isCenter ? 100 : 1,
      title: isCenter ? 'Cluster Center' : 'Building'
    };
  }

  fitMapBounds() {
    if (!this.comparisonData.length || typeof google === 'undefined') return;
    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;

    this.comparisonData.forEach(c => {
      // Add Center
      if (c.latitude && c.longitude) {
        bounds.extend({ lat: c.latitude, lng: c.longitude });
        hasPoints = true;
      }
      // Add Buildings
      if (c.buildings) {
        c.buildings.forEach((b: any) => {
          bounds.extend({ lat: b.latitude, lng: b.longitude });
          hasPoints = true;
        });
      }
    });

    if (hasPoints && this.map) {
      setTimeout(() => this.map.fitBounds(bounds), 200);
    }
  }

  get isApiLoaded(): boolean { return typeof google !== 'undefined'; }
}