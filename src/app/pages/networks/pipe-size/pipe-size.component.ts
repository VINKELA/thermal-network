import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { GoogleMap, MapInfoWindow, MapMarker, MapPolyline } from '@angular/google-maps';
import { ActivatedRoute, Router } from '@angular/router';
import { RestApiService } from '../../../@core/utils/rest-api.service';

type PipeLegendProperty = 'diameter' | 'velocity' | 'pressure_drop' | 'peak_load' | 'length';
type HydraulicAnalysisMode = 'flow' | 'diameter' | 'temperature' | 'combined';

interface PipeLegendOption {
  key: PipeLegendProperty;
  label: string;
  unit: string;
}

interface PipeLegendBin {
  label: string;
  range: string;
  min: number;
  max: number;
  color: string;
  count: number;
}

interface HydraulicAnalysisRow {
  label: string;
  peak_load_kw: number;
  served_load_kw: number;
  mass_flow_kg_s: number;
  diameter_mm: number;
  velocity_m_s: number;
  pressure_drop_kpa: number;
  pressure_drop_pa_per_m: number;
  head_loss_m: number;
  pumping_power_kw: number;
  delta_t_c: number;
  required_supply_temperature_c: number;
  configured_supply_temperature_c: number;
  velocity_status?: string;
  pressure_drop_status?: string;
  supply_temperature_status?: string;
}

interface HydraulicAnalysis {
  id: number;
  segment_name: string;
  length_m: number;
  is_shared_segment: boolean;
  overlap_count: number;
  constants: any;
  baseline: HydraulicAnalysisRow & { nominal_dn?: number };
  variations: Record<HydraulicAnalysisMode, HydraulicAnalysisRow[]>;
}

@Component({
  selector: 'ngx-pipe-size',
  templateUrl: './pipe-size.component.html',
  styleUrls: ['./pipe-size.component.scss']
})
export class PipeSizeComponent implements OnInit, OnDestroy {
  @ViewChild(GoogleMap) map!: GoogleMap;
  @ViewChild(MapInfoWindow) infoWindow!: MapInfoWindow;
  @ViewChild('mapPanel') mapPanel?: ElementRef<HTMLDivElement>;

  algorithm: any = null;
  edges: any[] = [];
  nodes: any[] = [];
  selectedLegendProperty: PipeLegendProperty = 'diameter';
  legendProperties: PipeLegendOption[] = [
    { key: 'diameter', label: 'Diameter', unit: 'DN' },
    { key: 'velocity', label: 'Velocity', unit: 'm/s' },
    { key: 'pressure_drop', label: 'Pressure drop', unit: 'kPa' },
    { key: 'peak_load', label: 'Peak demand', unit: 'kW' },
    { key: 'length', label: 'Length', unit: 'm' },
  ];
  legendBins: PipeLegendBin[] = [];
  private readonly legendPalette = ['#2563eb', '#0891b2', '#059669', '#f59e0b', '#dc2626'];
  private readonly onFullscreenChange = () => {
    this.isMapFullscreen = document.fullscreenElement === this.mapPanel?.nativeElement;
    this.resizeMapSoon();
  };

  center: google.maps.LatLngLiteral = { lat: 43.6532, lng: -79.3832 };
  zoom = 15;
  currentZoom = 15;

  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: false,
    fullscreenControl: false,
    styles: [
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'off' }] }
    ]
  };

  selectedItem: any = null;
  selectedType: 'node' | 'edge' | null = null;
  selectedAnalysis: HydraulicAnalysis | null = null;
  isLoadingAnalysis = false;
  analysisError = '';
  analysisMode: HydraulicAnalysisMode = 'flow';
  analysisChartOption: any = null;
  analysisModes: { key: HydraulicAnalysisMode; label: string }[] = [
    { key: 'flow', label: 'Flow' },
    { key: 'diameter', label: 'Diameter' },
    { key: 'temperature', label: 'Delta T' },
    { key: 'combined', label: 'Combined' },
  ];

  constructor(
    private api: RestApiService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.loadData(Number(id));
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
  }

  ngOnDestroy() {
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
  }

  get selectedLegendOption(): PipeLegendOption {
    return this.legendProperties.find(property => property.key === this.selectedLegendProperty) || this.legendProperties[0];
  }

  get currentAnalysisRows(): HydraulicAnalysisRow[] {
    if (!this.selectedAnalysis) return [];
    return this.selectedAnalysis.variations?.[this.analysisMode] || [];
  }

  get baselineAnalysis(): HydraulicAnalysisRow | null {
    return this.selectedAnalysis?.baseline || null;
  }

  loadData(id: number) {
    this.api.get(`pipe_sizings/${id}/`).subscribe(meta => {
      this.api.get(`edge_pipe_sizings/?pipe_sizing=${id}&visualization=true`).subscribe((rawEdges: unknown) => {
        const edges = rawEdges as any[];

        this.edges = edges.map((e) => {
          const path = this.resolvePath(e);
          const edgeColor = '#64748b';
          return {
            ...e,
            displayColor: edgeColor,
            path,
            options: this.getEdgeOptions(e, this.currentZoom, edgeColor, path),
            shadowOptions: this.getEdgeShadowOptions(e, this.currentZoom, path),
          };
        });

        this.updateLegendState();
        this.extractNodes();
        this.calculateStats(meta);
        setTimeout(() => {
          this.fitBounds();
        }, 500);
      });
    });
  }
// --- NEW PROPERTIES FOR UI CONTROL ---
  isTableExpanded: boolean = false;
  isTableCollapsed: boolean = false;
  isMapFullscreen: boolean = false;

  // ... (Keep all existing methods like loadData, getEdgeOptions, etc.)

  // --- NEW: TABLE CONTROLS ---
  toggleTableSize() {
    if (this.isTableCollapsed) {
      this.isTableCollapsed = false;
    }
    this.isTableExpanded = !this.isTableExpanded;
    this.resizeMapSoon();
  }

  toggleTableCollapse() {
    this.isTableCollapsed = !this.isTableCollapsed;
    if (this.isTableCollapsed) {
      this.isTableExpanded = false;
    }
    this.resizeMapSoon();
  }

  private resizeMapSoon() {
    setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
  }

  toggleMapFullscreen(event?: Event) {
    event?.stopPropagation();
    const panel = this.mapPanel?.nativeElement;
    if (!panel) return;

    if (document.fullscreenElement === panel) {
      document.exitFullscreen?.().catch(() => undefined);
      return;
    }

    panel.requestFullscreen?.().catch(() => undefined);
  }

  copyTableToClipboard() {
    // Build a Tab-Separated string for perfect Excel pasting
    const headers = ['Segment Name', 'Basis', 'Comm. Size (DN)', 'Exact Dia. (mm)', 'Peak Demand (kW)', 'Mass Flow (kg/s)', 'Velocity (m/s)', 'Pressure Drop (kPa)', 'Length (m)'];
    let tsvData = headers.join('\t') + '\n';

    this.edges.forEach(e => {
      const row = [
        e.edge?.name || 'Unnamed',
        this.segmentBasis(e),
        `DN${Math.round(e.diameter_m * 1000)}`,
        (e.diameter_m * 1000).toFixed(2), // Converted m to mm for readability
        (e.peak_load_kw || 0).toFixed(1),
        (e.mass_flow_kg_s || 0).toFixed(2),
        (e.velocity_m_s || 0).toFixed(2),
        ((e.pressure_drop_pa || 0) / 1000).toFixed(2),
        this.segmentLength(e).toFixed(0)
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

  loadSectionAnalysis(edge: any): void {
    if (!edge?.id) return;
    if (this.selectedAnalysis?.id === edge.id) {
      this.buildAnalysisChart();
      return;
    }

    this.isLoadingAnalysis = true;
    this.analysisError = '';
    this.selectedAnalysis = null;
    this.analysisChartOption = null;

    this.api.get(`edge_pipe_sizings/${edge.id}/hydraulics/`).subscribe((response: any) => {
      this.isLoadingAnalysis = false;
      if (!response?.baseline) {
        this.analysisError = response?.detail || 'Hydraulic analysis was not available for this pipe section.';
        return;
      }
      this.selectedAnalysis = response as HydraulicAnalysis;
      this.analysisMode = this.analysisMode || 'flow';
      this.buildAnalysisChart();
    });
  }

  setAnalysisMode(mode: HydraulicAnalysisMode): void {
    this.analysisMode = mode;
    this.buildAnalysisChart();
  }

  buildAnalysisChart(): void {
    if (!this.selectedAnalysis) {
      this.analysisChartOption = null;
      return;
    }

    const rows = this.currentAnalysisRows;
    const baseline = this.selectedAnalysis.baseline;
    const metrics = [
      { key: 'mass_flow_kg_s', name: 'Mass flow', color: '#2563eb' },
      { key: 'diameter_mm', name: 'Diameter', color: '#0891b2' },
      { key: 'velocity_m_s', name: 'Velocity', color: '#059669' },
      { key: 'head_loss_m', name: 'Head loss', color: '#d97706' },
      { key: 'pumping_power_kw', name: 'Pump power', color: '#dc2626' },
      { key: 'required_supply_temperature_c', name: 'Supply temp', color: '#7c3aed' },
    ];

    this.analysisChartOption = {
      animationDuration: 250,
      color: metrics.map(metric => metric.color),
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: number) => `${Number(value || 0).toFixed(0)}%`,
      },
      legend: {
        type: 'scroll',
        top: 0,
        textStyle: { color: '#475569', fontWeight: 700 },
      },
      grid: { left: 52, right: 24, top: 54, bottom: 44 },
      xAxis: {
        type: 'category',
        data: rows.map(row => row.label),
        axisLabel: { color: '#475569', fontWeight: 700, rotate: rows.length > 7 ? 30 : 0 },
        axisTick: { alignWithLabel: true },
      },
      yAxis: {
        type: 'value',
        name: '% vs design',
        nameTextStyle: { color: '#475569', fontWeight: 800 },
        axisLabel: { color: '#475569', formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#e2e8f0' } },
      },
      series: metrics.map(metric => ({
        name: metric.name,
        type: 'line',
        smooth: true,
        symbolSize: 8,
        lineStyle: { width: 3 },
        data: rows.map(row => this.relativeToBaseline(row, baseline, metric.key as keyof HydraulicAnalysisRow)),
      })),
    };
  }

  relativeToBaseline(row: HydraulicAnalysisRow, baseline: HydraulicAnalysisRow, key: keyof HydraulicAnalysisRow): number | null {
    const value = Number(row?.[key] || 0);
    const base = Number(baseline?.[key] || 0);
    if (Math.abs(base) < 1e-9) return Math.abs(value) < 1e-9 ? 0 : null;
    return Number((((value - base) / base) * 100).toFixed(1));
  }

  formatHydraulicNumber(value: number | null | undefined, digits = 2): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '-';
    return numeric.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  statusLabel(status?: string): string {
    if (status === 'high') return 'High';
    if (status === 'low') return 'Low';
    if (status === 'shortfall') return 'Shortfall';
    if (status === 'met') return 'Met';
    return 'Target';
  }

  statusClass(status?: string): string {
    if (status === 'high' || status === 'shortfall') return 'status-high';
    if (status === 'low') return 'status-low';
    return 'status-target';
  }

  private calculateDynamicWeight(diameter_m: number, zoomLevel: number): number {
    const minDiameter = 0.02, maxDiameter = 1.0;
    const minPixels = 2, maxPixels = 8;
    const clampedDiameter = Math.max(minDiameter, Math.min(diameter_m, maxDiameter));
    const normalized = Math.sqrt((clampedDiameter - minDiameter) / (maxDiameter - minDiameter));
    const baseWeight = minPixels + (normalized * (maxPixels - minPixels));
    const zoomFactor = Math.pow(1.18, zoomLevel - 15);
    return Math.max(2, Math.min(baseWeight * zoomFactor, 12));
  }

  getEdgeOptions(edge: any, zoomLevel: number, color: string, path: google.maps.LatLngLiteral[] = []): google.maps.PolylineOptions {
    const diameter = edge.diameter_m || 0.02;
    const calculatedWeight = this.calculateDynamicWeight(diameter, zoomLevel);
    const isFallbackPath = !this.hasPhysicalPath(edge) && (!edge.route?.polyline || path.length <= 2);

    return {
      strokeColor: color,
      strokeOpacity: isFallbackPath ? 0.7 : 0.92,
      strokeWeight: calculatedWeight,
      clickable: true,
      geodesic: false,
      zIndex: Math.floor((diameter || 0.02) * 10000),
      icons: isFallbackPath ? [{
        icon: {
          path: 'M 0,-1 0,1',
          strokeOpacity: 0.8,
          scale: 2,
        },
        offset: '0',
        repeat: '16px',
      }] : undefined,
    };
  }

  onMapZoom() {
    if (!this.map) return;
    const newZoom = this.map.getZoom();
    if (newZoom && newZoom !== this.currentZoom) {
      this.currentZoom = newZoom;
      this.edges = this.edges.map(edge => ({
        ...edge,
        options: this.getEdgeOptions(edge, this.currentZoom, edge.displayColor, edge.path),
        shadowOptions: this.getEdgeShadowOptions(edge, this.currentZoom, edge.path),
      }));
    }
  }

  onLegendPropertyChange(property: PipeLegendProperty | string): void {
    this.selectedLegendProperty = property as PipeLegendProperty;
    this.updateLegendState();
  }

  updateLegendState(): void {
    const selectedId = this.selectedType === 'edge' ? this.selectedItem?.id : null;
    const bins = this.buildLegendBins(this.selectedLegendProperty);

    this.edges = this.edges.map(edge => {
      const color = this.colorForLegendValue(this.legendValue(edge, this.selectedLegendProperty), bins);
      return {
        ...edge,
        displayColor: color,
        options: this.getEdgeOptions(edge, this.currentZoom, color, edge.path),
        shadowOptions: this.getEdgeShadowOptions(edge, this.currentZoom, edge.path),
      };
    });

    this.legendBins = bins.map(bin => ({
      ...bin,
      count: this.edges.filter(edge => this.binContains(bin, this.legendValue(edge, this.selectedLegendProperty), bins)).length,
    }));

    if (selectedId) {
      this.selectedItem = this.edges.find(edge => edge.id === selectedId) || this.selectedItem;
    }
  }

  getEdgeShadowOptions(edge: any, zoomLevel: number, path: google.maps.LatLngLiteral[] = []): google.maps.PolylineOptions {
    const diameter = edge.diameter_m || 0.02;
    const isFallbackPath = !this.hasPhysicalPath(edge) && (!edge.route?.polyline || path.length <= 2);
    const weight = this.calculateDynamicWeight(diameter, zoomLevel);

    return {
      strokeColor: '#111827',
      strokeOpacity: isFallbackPath ? 0.16 : 0.22,
      strokeWeight: weight + 4,
      clickable: false,
      geodesic: false,
      zIndex: Math.max(0, Math.floor((diameter || 0.02) * 10000) - 1),
    };
  }

  resolvePath(item: any): google.maps.LatLngLiteral[] {
    if (item.segment_path?.length > 1) {
      return item.segment_path.map((point: any) => ({
        lat: Number(point.lat),
        lng: Number(point.lng),
      }));
    }

    const fallbackPath = this.edgeEndpointPath(item);
    if (item.route?.polyline && typeof google !== 'undefined' && google.maps.geometry) {
      const decoded = google.maps.geometry.encoding.decodePath(item.route.polyline);
      const routePath = decoded.map(p => ({ lat: p.lat(), lng: p.lng() }));
      if (this.isPlausibleRoutePath(item, routePath, fallbackPath)) {
        return this.orientAndAnchorPath(routePath, fallbackPath[0], fallbackPath[1]);
      }
    }
    return fallbackPath;
  }

  edgeEndpointPath(item: any): google.maps.LatLngLiteral[] {
    if (!item.edge?.start_node || !item.edge?.end_node) return [];
    return [
      { lat: Number(item.edge.start_node.latitude), lng: Number(item.edge.start_node.longitude) },
      { lat: Number(item.edge.end_node.latitude), lng: Number(item.edge.end_node.longitude) },
    ];
  }

  isPlausibleRoutePath(item: any, path: google.maps.LatLngLiteral[], fallbackPath: google.maps.LatLngLiteral[]): boolean {
    if (!path || path.length < 2 || fallbackPath.length < 2) return false;

    const routeLength = Number(item.route?.distance_meters || 0);
    const directLength = this.distanceMeters(fallbackPath[0], fallbackPath[1]);
    if (!routeLength || !directLength) return false;

    const maxLength = this.maxPlausibleRouteLength(directLength);
    return routeLength >= directLength * 0.4 && routeLength <= maxLength;
  }

  maxPlausibleRouteLength(directLength: number): number {
    if (directLength < 25) return 300;
    if (directLength < 100) return 600;
    if (directLength < 500) return Math.max(1200, directLength * 6);
    return Math.max(2500, directLength * 4);
  }

  distanceMeters(a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral): number {
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

  getPipeColor(edge: any): string {
    const velocity = Number(edge.velocity_m_s || 0);
    if (velocity > 2.5) return '#dc2626';
    if (velocity > 2.0) return '#f59e0b';
    if (velocity < 0.5) return '#2563eb';
    return '#059669';
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
    const totalLen = this.edges.reduce((sum, e) => sum + this.segmentLength(e), 0);
    this.algorithm = {
      name: meta.name || 'Pipe Sizing Run',
      description: meta.method + ' methodology',
      created_at: meta.created_at,
      total_length: totalLen,
      parameters: { method: meta.method, total_edges: this.edges.length }
    };
  }

  buildLegendBins(property: PipeLegendProperty): PipeLegendBin[] {
    if (property === 'diameter') {
      return this.countBins([
        { label: 'Small', range: 'DN20-DN32', min: 20, max: 32, color: '#2563eb', count: 0 },
        { label: 'Service', range: 'DN40-DN65', min: 40, max: 65, color: '#0891b2', count: 0 },
        { label: 'Distribution', range: 'DN80-DN125', min: 80, max: 125, color: '#059669', count: 0 },
        { label: 'Main', range: 'DN150-DN250', min: 150, max: 250, color: '#f59e0b', count: 0 },
        { label: 'Trunk', range: 'DN300+', min: 300, max: Number.POSITIVE_INFINITY, color: '#dc2626', count: 0 },
      ], property);
    }

    if (property === 'velocity') {
      return this.countBins([
        { label: 'Low', range: '< 0.50 m/s', min: Number.NEGATIVE_INFINITY, max: 0.5, color: '#2563eb', count: 0 },
        { label: 'Target', range: '0.50-2.00 m/s', min: 0.5, max: 2.0, color: '#059669', count: 0 },
        { label: 'Near max', range: '2.00-2.50 m/s', min: 2.0, max: 2.5, color: '#f59e0b', count: 0 },
        { label: 'High', range: '> 2.50 m/s', min: 2.5, max: Number.POSITIVE_INFINITY, color: '#dc2626', count: 0 },
      ], property);
    }

    return this.buildQuantileBins(property);
  }

  buildQuantileBins(property: PipeLegendProperty): PipeLegendBin[] {
    const values = this.edges
      .map(edge => this.legendValue(edge, property))
      .filter(value => Number.isFinite(value))
      .sort((a, b) => a - b);

    if (!values.length) return [];

    const min = values[0];
    const max = values[values.length - 1];
    if (min === max) {
      return [{
        label: 'All sections',
        range: this.formatLegendRange(property, min, max),
        min,
        max,
        color: this.legendPalette[2],
        count: values.length,
      }];
    }

    const bucketCount = Math.min(5, values.length);
    const boundaries = Array.from({ length: bucketCount + 1 }, (_, index) => {
      const position = (index / bucketCount) * (values.length - 1);
      const lower = Math.floor(position);
      const upper = Math.ceil(position);
      const ratio = position - lower;
      return values[lower] + ((values[upper] - values[lower]) * ratio);
    });

    const bins: PipeLegendBin[] = [];
    for (let index = 0; index < bucketCount; index++) {
      const binMin = index === 0 ? min : boundaries[index];
      const binMax = index === bucketCount - 1 ? max : boundaries[index + 1];
      if (binMax <= binMin) continue;

      bins.push({
        label: this.quantileLabel(index, bucketCount),
        range: this.formatLegendRange(property, binMin, binMax),
        min: binMin,
        max: binMax,
        color: this.legendPalette[Math.min(index, this.legendPalette.length - 1)],
        count: 0,
      });
    }

    return this.countBins(bins, property);
  }

  countBins(bins: PipeLegendBin[], property: PipeLegendProperty): PipeLegendBin[] {
    return bins.map(bin => ({
      ...bin,
      count: this.edges.filter(edge => this.binContains(bin, this.legendValue(edge, property), bins)).length,
    })).filter(bin => bin.count > 0);
  }

  colorForLegendValue(value: number, bins: PipeLegendBin[]): string {
    const bin = bins.find(candidate => this.binContains(candidate, value, bins));
    return bin?.color || '#64748b';
  }

  binContains(bin: PipeLegendBin, value: number, bins: PipeLegendBin[]): boolean {
    const index = bins.indexOf(bin);
    const isLast = index === bins.length - 1;
    const nextBin = bins[index + 1];
    const hasGapToNext = nextBin ? nextBin.min > bin.max : false;
    const minOk = value >= bin.min;
    const maxOk = isLast || hasGapToNext ? value <= bin.max : value < bin.max;
    return minOk && maxOk;
  }

  legendValue(edge: any, property: PipeLegendProperty): number {
    if (property === 'diameter') return Math.round(Number(edge?.diameter_m || 0) * 1000);
    if (property === 'velocity') return Number(edge?.velocity_m_s || 0);
    if (property === 'pressure_drop') return Number(edge?.pressure_drop_pa || 0) / 1000;
    if (property === 'peak_load') return Number(edge?.peak_load_kw || 0);
    return this.segmentLength(edge);
  }

  selectedLegendValue(edge: any): string {
    return this.formatLegendValue(this.selectedLegendProperty, this.legendValue(edge, this.selectedLegendProperty));
  }

  formatLegendValue(property: PipeLegendProperty, value: number): string {
    if (property === 'diameter') return `DN${Math.round(value)}`;
    if (property === 'velocity') return `${value.toFixed(2)} m/s`;
    if (property === 'pressure_drop') return `${value.toFixed(value >= 10 ? 1 : 2)} kPa`;
    if (property === 'peak_load') return `${value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 0 : 1 })} kW`;
    return `${value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 0 : 1 })} m`;
  }

  formatLegendRange(property: PipeLegendProperty, min: number, max: number): string {
    if (!Number.isFinite(min)) return `< ${this.formatLegendValue(property, max)}`;
    if (!Number.isFinite(max)) return `> ${this.formatLegendValue(property, min)}`;
    return `${this.formatLegendValue(property, min)} - ${this.formatLegendValue(property, max)}`;
  }

  quantileLabel(index: number, count: number): string {
    if (count === 1) return 'All sections';
    if (index === 0) return 'Lowest';
    if (index === count - 1) return 'Highest';
    return `Range ${index + 1}`;
  }

  // INTERACTION LOGIC
  selectEdge(edge: any, polyline: MapPolyline | null) {
    if (!edge?.id) return;
    const pipeSizingId = this.route.snapshot.paramMap.get('id');
    this.router.navigate(['/pages/pipe-sections', edge.id], {
      queryParams: pipeSizingId ? { pipe_sizing: pipeSizingId } : {},
    });
  }

  selectNode(node: any, marker: MapMarker) {
    this.selectedItem = node;
    this.selectedType = 'node';
    this.selectedAnalysis = null;
    this.analysisChartOption = null;
    this.analysisError = '';
    this.infoWindow.open(marker);
  }

  fitBounds() {
    if (!this.map || typeof google === 'undefined') return;
    const bounds = new google.maps.LatLngBounds();
    this.edges.forEach(edge => {
      (edge.path || []).forEach((point: google.maps.LatLngLiteral) => bounds.extend(point));
    });
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

  segmentLength(edge: any): number {
    return Number(edge.length_m || edge.route?.distance_meters || edge.edge?.length || 0);
  }

  segmentBasis(edge: any): string {
    if (edge.is_shared_segment) return `Shared x${edge.overlap_count || 2}`;
    if (edge.segment_path?.length > 1) return 'Physical route';
    if (edge.route?.polyline) return 'Route';
    return 'Connection';
  }

  hasPhysicalPath(edge: any): boolean {
    return Array.isArray(edge.segment_path) && edge.segment_path.length > 1;
  }
}
