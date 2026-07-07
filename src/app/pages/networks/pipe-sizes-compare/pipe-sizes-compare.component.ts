import { Component, OnInit, ViewChild } from '@angular/core';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { NbThemeService } from '@nebular/theme';
import { GoogleMap } from '@angular/google-maps';
import { EChartsOption } from 'echarts';
import { forkJoin } from 'rxjs';

interface SizingRun {
  id: number;
  name: string;
  method: string;
  created_at: string;
  // Metrics
  total_length: number;
  total_cost: number;
  max_velocity: number;
  // Visualization
  boq: { [key: string]: number }; // DN -> Length map
  uiColor?: string;
  edges?: any[]; // For map visualization
}

@Component({
  selector: 'ngx-pipe-sizes-compare',
  templateUrl: './pipe-sizes-compare.component.html',
  styleUrls: ['./pipe-sizes-compare.component.scss']
})
export class PipeSizesCompareComponent {
@ViewChild(GoogleMap) map!: GoogleMap;

  // Data State
  summaryList: any[] = [];
  selectedIds: number[] = [];
  comparisonData: SizingRun[] = [];
  
  isLoadingList = false;
  isLoadingCompare = false;

  // Visuals
  boqChartOption: EChartsOption = {};
  costChartOption: EChartsOption = {};
  
  // Map Config
  mapOptions: google.maps.MapOptions = { 
    disableDefaultUI: false, 
    zoomControl: true,
    styles: [
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'off' }] }
    ] 
  };
  center = { lat: 43.65, lng: -79.38 };

  // Extended Palette for 6 items
  palette = ['#3366ff', '#00d68f', '#ffaa00', '#ff3d71', '#965dfe', '#0095ff'];

  constructor(private api: RestApiService, private theme: NbThemeService) {}

  ngOnInit() {
    this.fetchSummaryList();
  }

  // --- 1. SELECTION LOGIC ---

  fetchSummaryList() {
    this.isLoadingList = true;
    this.api.get<any>('pipe_sizings/?limit=50').subscribe({
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
      if (this.selectedIds.length >= 6) this.selectedIds.shift(); // Limit to 6
      this.selectedIds.push(id);
    }
    
    this.selectedIds.length > 0 ? this.fetchComparisonData() : (this.comparisonData = []);
  }

  // --- 2. AGGREGATION ENGINE ---

  fetchComparisonData() {
    this.isLoadingCompare = true;
    
    // NOTE: In a real production environment, you should have a backend endpoint 
    // like 'pipe_sizings/compare/' that returns aggregated stats.
    // For now, we use forkJoin to fetch details in parallel for specific insights.
    
    const requests = this.selectedIds.map(id => 
      this.api.get(`edge_pipe_sizings/?pipe_sizing=${id}&visualization=true&limit=2000`)
    );

    // Fetch Metadata + Details
    forkJoin(requests).subscribe({
      next: (responses: any[]) => {
        this.processComparisonResults(responses);
        this.isLoadingCompare = false;
      },
      error: (err) => {
        console.error(err);
        this.isLoadingCompare = false;
      }
    });
  }

  processComparisonResults(responses: any[]) {
    this.comparisonData = responses.map((res: any, index) => {
      // Handle array vs paginated response
      const edges = Array.isArray(res) ? res : res.results;
      const meta = this.summaryList.find(s => s.id === this.selectedIds[index]);

      // A. Calculate BOQ (Bill of Quantities)
      const boq = {};
      let totalLen = 0;
      let cost = 0;
      let maxVel = 0;

      edges.forEach(e => {
        const len = Number(e.length_m || e.route?.distance_meters || e.edge?.length || 0);
        const dn = `DN${Math.round(e.diameter_m * 1000)}`;
        
        boq[dn] = (boq[dn] || 0) + len;
        totalLen += len;
        // Simple cost estimation if not provided
        cost += len * (meta?.cost_per_meter || 150); 
        if (e.velocity_m_s > maxVel) maxVel = e.velocity_m_s;
      });

      return {
        id: meta.id,
        name: meta.name,
        method: meta.method,
        created_at: meta.created_at,
        total_length: totalLen,
        total_cost: cost,
        max_velocity: maxVel,
        boq: boq,
        edges: edges, // Store for map
        uiColor: this.palette[index % this.palette.length]
      };
    });

    this.generateCharts();
    this.fitMapBounds();
  }

  // --- 3. CHARTS ---

  generateCharts() {
    this.theme.getJsTheme().subscribe(config => {
      const echarts: any = config.variables.echarts;

      // CHART A: BOQ Fingerprint (Stacked Bar)
      // This shows the diameter distribution for each scenario.
      // Insight: "Scenario A is cheaper because it uses more DN40 and less DN80"
      
      // 1. Collect all unique diameters across all runs
      const allDNs = new Set<string>();
      this.comparisonData.forEach(c => Object.keys(c.boq).forEach(dn => allDNs.add(dn)));
      const sortedDNs = Array.from(allDNs).sort((a,b) => Number(a.substr(2)) - Number(b.substr(2)));

      this.boqChartOption = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { textStyle: { color: echarts.textColor } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { 
          type: 'category', 
          data: this.comparisonData.map(c => c.name),
          axisLabel: { color: echarts.textColor, interval: 0, rotate: 15 }
        },
        yAxis: { type: 'value', name: 'Length (m)', axisLabel: { color: echarts.textColor } },
        series: sortedDNs.map(dn => ({
          name: dn,
          type: 'bar',
          stack: 'total',
          emphasis: { focus: 'series' },
          data: this.comparisonData.map(c => (c.boq[dn] || 0).toFixed(0))
        }))
      };

      // CHART B: Cost vs Velocity
      this.costChartOption = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        legend: { data: ['Total Cost', 'Max Velocity'], textStyle: { color: echarts.textColor } },
        xAxis: { 
          type: 'category', 
          data: this.comparisonData.map(c => c.name),
          axisLabel: { color: echarts.textColor, interval: 0, rotate: 15 }
        },
        yAxis: [
          { type: 'value', name: 'Cost ($)', position: 'left', axisLabel: { color: echarts.textColor } },
          { type: 'value', name: 'Max Vel (m/s)', position: 'right', axisLabel: { color: echarts.textColor } }
        ],
        series: [
          {
            name: 'Total Cost',
            type: 'bar',
            data: this.comparisonData.map((c, i) => ({
              value: c.total_cost.toFixed(0),
              itemStyle: { color: c.uiColor }
            }))
          },
          {
            name: 'Max Velocity',
            type: 'line',
            yAxisIndex: 1,
            data: this.comparisonData.map(c => c.max_velocity.toFixed(2)),
            itemStyle: { color: '#ff3d71' }
          }
        ]
      };
    });
  }

  // --- 4. MAP HELPERS ---

  getPath(edge: any): google.maps.LatLngLiteral[] {
    if (edge.segment_path?.length > 1) {
      return edge.segment_path.map((point: any) => ({
        lat: Number(point.lat),
        lng: Number(point.lng),
      }));
    }
    if (edge.route?.polyline && typeof google !== 'undefined' && google.maps.geometry) {
       const decoded = google.maps.geometry.encoding.decodePath(edge.route.polyline);
       const routePath = decoded.map(p => ({ lat: p.lat(), lng: p.lng() }));
       const endpointPath = this.edgeEndpointPath(edge);
       return endpointPath.length === 2
         ? this.orientAndAnchorPath(routePath, endpointPath[0], endpointPath[1])
         : routePath;
    }
    return this.edgeEndpointPath(edge);
  }

  private edgeEndpointPath(edge: any): google.maps.LatLngLiteral[] {
    if (!edge.edge?.start_node || !edge.edge?.end_node) return [];
    return [
      { lat: Number(edge.edge.start_node.latitude), lng: Number(edge.edge.start_node.longitude) },
      { lat: Number(edge.edge.end_node.latitude), lng: Number(edge.edge.end_node.longitude) },
    ];
  }

  private orientAndAnchorPath(
    path: google.maps.LatLngLiteral[],
    start: google.maps.LatLngLiteral,
    end: google.maps.LatLngLiteral,
  ): google.maps.LatLngLiteral[] {
    if (!path?.length || !start || !end) return path || [];
    const forward = this.distanceMeters(path[0], start) + this.distanceMeters(path[path.length - 1], end);
    const reverse = this.distanceMeters(path[0], end) + this.distanceMeters(path[path.length - 1], start);
    const oriented = reverse < forward ? [...path].reverse() : [...path];
    const anchored = [...oriented];
    const snapToleranceM = 2;
    if (this.distanceMeters(anchored[0], start) > snapToleranceM) {
      anchored.unshift(start);
    }
    if (this.distanceMeters(anchored[anchored.length - 1], end) > snapToleranceM) {
      anchored.push(end);
    }
    return anchored;
  }

  private distanceMeters(a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral): number {
    const earthRadius = 6371000;
    const toRad = (value: number) => value * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  fitMapBounds() {
    if (!this.comparisonData.length || typeof google === 'undefined' || !this.map) return;
    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;

    // Use the first selected network to set bounds (usually they overlap)
    const refData = this.comparisonData[0];
    refData.edges?.forEach(e => {
       const path = this.getPath(e);
       if (path.length > 0) {
         bounds.extend(path[0]);
         bounds.extend(path[path.length-1]);
         hasPoints = true;
       }
    });

    if (hasPoints) setTimeout(() => this.map.fitBounds(bounds), 200);
  }

  get isApiLoaded(): boolean { return typeof google !== 'undefined'; }
}
