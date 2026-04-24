import { Component, OnInit, ViewChild } from '@angular/core';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { NbThemeService } from '@nebular/theme';
import { GoogleMap } from '@angular/google-maps';

@Component({
  selector: 'ngx-network-comparison',
  templateUrl: './network-comparison.component.html',
  styleUrls: ['./network-comparison.component.scss']
})
export class NetworkComparisonComponent implements OnInit {

  @ViewChild(GoogleMap) map!: GoogleMap;

  // Data
  allNetworks: any[] = [];
  selectedIds: number[] = [];
  comparisonData: any[] = [];

  // Charts
  nodeTypeChartOption: any = {};
  summaryPieData: any[] = [];
  
  // Initialize with 3 colors: Consumer(Primary), Producer(Warning), Cluster(Info)
  typeColorScheme: any = { domain: ['#3366ff', '#ffaa00', '#0095ff'] };

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
  
  // Distinct colors for different NETWORKS
  networkColors = ['#3366ff', '#00d68f', '#ffaa00', '#ff3d71', '#884dff'];

  constructor(private api: RestApiService, private theme: NbThemeService) {}

  ngOnInit() {
    this.fetchNetworkList();
    
    this.theme.getJsTheme().subscribe(config => {
      const vars: any = config.variables;
      // Define colors for TYPES: Consumer, Producer, Cluster
      this.typeColorScheme = { 
        domain: [vars.primary, vars.warning, vars.info] 
      };
    });
  }

  // --- 1. SELECTION LOGIC ---

  fetchNetworkList() {
    this.isLoadingList = true;
    let params = '?limit=15';
    if (this.searchText) params += `&search=${encodeURIComponent(this.searchText)}`;

    this.api.get<any>(`networks/${params}`).subscribe({
      next: (data) => {
        this.allNetworks = Array.isArray(data) ? data : (data.results || []);
        this.isLoadingList = false;
      },
      error: () => this.isLoadingList = false
    });
  }

  onSearchInput() {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.fetchNetworkList(), 400);
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
    this.summaryPieData = [];
    this.nodeTypeChartOption = {};
  }

  // --- 2. DATA PROCESSING ---

  fetchComparison() {
    this.isLoadingCompare = true;
    this.api.post( { ids: this.selectedIds }, 'networks/compare/').subscribe({
      next: (data: any[]) => {
        this.comparisonData = data.map((net: any, index: number) => {
          const nodes = net.nodes || [];
          
          // Count specific node types (case-insensitive)
          const consumers = nodes.filter((n: any) => n.node_type?.toLowerCase() === 'consumer').length;
          const producers = nodes.filter((n: any) => n.node_type?.toLowerCase() === 'producer').length;
          const clusters  = nodes.filter((n: any) => n.node_type?.toLowerCase() === 'cluster').length;
          
          return {
            ...net,
            uiColor: this.networkColors[index % this.networkColors.length],
            stats: { consumers, producers, clusters }
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

  generateCharts() {
    this.theme.getJsTheme().subscribe(config => {
      const colors: any = config.variables;
      const echarts: any = config.variables.echarts;

      // --- Chart 1: Stacked Bar (Composition) ---
      const networkNames = this.comparisonData.map(d => d.name);
      const consumerData = this.comparisonData.map(d => d.stats.consumers);
      const producerData = this.comparisonData.map(d => d.stats.producers);
      const clusterData  = this.comparisonData.map(d => d.stats.clusters);

      this.nodeTypeChartOption = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { 
          data: ['Consumers', 'Producers', 'Clusters'], 
          textStyle: { color: echarts.textColor } 
        },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'value', axisLabel: { color: echarts.textColor }, splitLine: { lineStyle: { color: echarts.splitLineColor } } },
        yAxis: { type: 'category', data: networkNames, axisLabel: { color: echarts.textColor, width: 90, overflow: 'truncate' } },
        series: [
          { name: 'Consumers', type: 'bar', stack: 'total', data: consumerData, itemStyle: { color: colors.primary } },
          { name: 'Producers', type: 'bar', stack: 'total', data: producerData, itemStyle: { color: colors.warning } },
          { name: 'Clusters',  type: 'bar', stack: 'total', data: clusterData,  itemStyle: { color: colors.info } }
        ]
      };

      // --- Chart 2: Pie Summary (Total Mix) ---
      const totalConsumers = consumerData.reduce((a, b) => a + b, 0);
      const totalProducers = producerData.reduce((a, b) => a + b, 0);
      const totalClusters  = clusterData.reduce((a, b) => a + b, 0);
      
      // Explicitly define data array for NgxCharts
      this.summaryPieData = [
        { name: 'Consumers', value: totalConsumers },
        { name: 'Producers', value: totalProducers },
        { name: 'Clusters',  value: totalClusters }
      ];
    });
  }

  // --- 3. MAP VISUALIZATION ---
  
  getMarkerOptions(networkColor: string, node: any): google.maps.MarkerOptions {
    if (typeof google === 'undefined') return {};

    const type = node.node_type?.toLowerCase();
    
    // Default (Consumer)
    let scale = 3.5;
    let opacity = 0.6;
    let zIndex = 1;
    let path = google.maps.SymbolPath.CIRCLE; // Default Circle

    if (type === 'producer') {
      scale = 7;
      opacity = 1.0;
      zIndex = 100;
      path = google.maps.SymbolPath.CIRCLE; 
    } else if (type === 'cluster') {
      scale = 5;
      opacity = 0.9;
      zIndex = 50;
      // Use backward slash path or square to differentiate clusters
      path = google.maps.SymbolPath.BACKWARD_CLOSED_ARROW; 
    }

    const title = node.connected_asset_name || node.name || type;

    return {
      icon: {
        path: path,
        scale: scale, 
        fillColor: networkColor,
        fillOpacity: opacity,
        strokeWeight: 1,
        strokeColor: '#ffffff'
      },
      zIndex: zIndex,
      title: title
    };
  }

  fitMapBounds() {
    if (!this.comparisonData.length || typeof google === 'undefined') return;
    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;

    this.comparisonData.forEach(net => {
      if (net.nodes) {
        net.nodes.forEach((n: any) => {
          bounds.extend({ lat: Number(n.latitude), lng: Number(n.longitude) });
          hasPoints = true;
        });
      }
    });

    if (hasPoints && this.map) {
      setTimeout(() => this.map.fitBounds(bounds), 200);
    }
  }

  get isApiLoaded(): boolean {
    return typeof google !== 'undefined';
  }
}