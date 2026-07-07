import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { GoogleMap, MapInfoWindow, MapMarker } from '@angular/google-maps';
import { RestApiService } from '../../../@core/utils/rest-api.service';

interface DemandMapNode {
  id: number;
  name: string;
  node_type: string;
  role: 'producer' | 'consumer' | 'junction';
  latitude: number;
  longitude: number;
  building?: number;
  building_type?: string;
  waste_heat_source_type?: string;
  annual_heat_mwh: number;
  peak_heat_kw: number;
  annual_waste_heat_mwh: number;
  peak_waste_heat_kw: number;
  demand_basis: string;
  position: google.maps.LatLngLiteral;
  markerOptions?: google.maps.MarkerOptions;
}

interface DemandLegend {
  unit: string;
  min_annual_heat_mwh: number;
  max_annual_heat_mwh: number;
}

type ProducerMarkerKind = 'data-center' | 'wastewater' | 'generic';

@Component({
  selector: 'ngx-network-demand-map',
  templateUrl: './network-demand-map.component.html',
  styleUrls: ['./network-demand-map.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NetworkDemandMapComponent implements OnInit, OnDestroy {
  @ViewChild(GoogleMap) map!: GoogleMap;
  @ViewChild(MapInfoWindow) infoWindow!: MapInfoWindow;
  @ViewChild('mapFrame') mapFrame?: ElementRef<HTMLDivElement>;

  networks: any[] = [];
  selectedNetworkId: number | null = null;
  network: any = null;
  nodes: DemandMapNode[] = [];
  markerNodesForRender: DemandMapNode[] = [];
  consumerNodesForRender: DemandMapNode[] = [];
  producerNodesForRender: DemandMapNode[] = [];
  displayRoutes: any[] = [];
  displayServiceDrops: any[] = [];
  displayEdges: any[] = [];
  legend: DemandLegend = {
    unit: 'MWh/year/building',
    min_annual_heat_mwh: 0,
    max_annual_heat_mwh: 0,
  };
  totals: any = null;
  selectedNode: DemandMapNode | null = null;
  isLoading = false;
  isExporting = false;
  isMapFullscreen = false;
  showRouteNodes = true;
  errorMessage = '';

  center: google.maps.LatLngLiteral = { lat: 43.6532, lng: -79.3832 };
  zoom = 12;

  readonly demandStops = ['#ffb000', '#f97316', '#dc2626', '#7f0038'];
  readonly demandGradient = `linear-gradient(to top, ${this.demandStops.join(', ')})`;
  private readonly endpointSnapToleranceMeters = 3;
  private readonly markerDemandBuckets = 12;
  private readonly consumerIconCache = new Map<string, string>();
  private producerIconCache = new Map<ProducerMarkerKind, string>();
  private nativePolylines: google.maps.Polyline[] = [];

  readonly mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    fullscreenControl: false,
    mapTypeControl: false,
    streetViewControl: false,
    clickableIcons: false,
    gestureHandling: 'greedy',
    styles: [
      { elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
      { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
      { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'off' }] },
      { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#faf9f5' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ece7df' }] },
      { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#ddd6cc' }] },
      { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#c9c2b8' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cfd8dc' }] },
    ],
  };

  private readonly onFullscreenChange = () => {
    this.isMapFullscreen = document.fullscreenElement === this.mapFrame?.nativeElement;
    this.cdr.markForCheck();
    setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
  };

  constructor(
    private api: RestApiService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    this.loadNetworks();
  }

  ngOnDestroy(): void {
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.clearNativePolylines();
  }

  get consumerNodes(): DemandMapNode[] {
    return this.consumerNodesForRender;
  }

  get producerNodes(): DemandMapNode[] {
    return this.producerNodesForRender;
  }

  get markerNodes(): DemandMapNode[] {
    return this.markerNodesForRender;
  }

  get buildingCount(): number {
    const totalCount = Number(this.totals?.consumer_count || 0) + Number(this.totals?.producer_count || 0);
    if (totalCount > 0) {
      return totalCount;
    }
    return this.markerNodesForRender.length;
  }

  get producerLegendLabel(): string {
    return this.resolveProducerLabel(this.producerNodesForRender, [
      this.network?.name,
      this.network?.project_name,
      this.network?.network_type,
    ]);
  }

  get producerLegendMarkerClass(): string {
    return `producer-dot-${this.producerMarkerKind(this.producerNodesForRender, [
      this.network?.name,
      this.network?.project_name,
      this.network?.network_type,
    ])}`;
  }

  get producerLegendIconStyle(): { [key: string]: string } {
    const kind = this.producerMarkerKind(this.producerNodesForRender, [
      this.network?.name,
      this.network?.project_name,
      this.network?.network_type,
    ]);
    return {
      'background-image': `url("${this.producerIconUrl(kind)}")`,
    };
  }

  get visibleMarkerNodes(): DemandMapNode[] {
    return this.showRouteNodes
      ? this.markerNodesForRender
      : this.producerNodesForRender;
  }

  loadNetworks(): void {
    this.api.get<any>('networks/?limit=500&ordering=-created_at,-id').subscribe({
      next: (res) => {
        this.networks = Array.isArray(res) ? res : (res?.results || []);
        const requestedNetworkId = Number(this.route.snapshot.queryParamMap.get('network'));
        const initialNetwork = this.networks.find(network => network.id === requestedNetworkId) || this.networks[0];

        if (initialNetwork) {
          this.selectedNetworkId = initialNetwork.id;
          this.loadDemandMap();
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.errorMessage = 'Networks could not be loaded.';
        this.cdr.markForCheck();
      },
    });
  }

  onNetworkChange(networkId: number): void {
    this.selectedNetworkId = Number(networkId);
    this.loadDemandMap();
  }

  onRouteNodeVisibilityChange(showNodes: boolean): void {
    this.showRouteNodes = Boolean(showNodes);
    if (!this.showRouteNodes) {
      this.infoWindow?.close();
      this.selectedNode = null;
    }
    setTimeout(() => this.fitBounds(), 50);
    this.cdr.markForCheck();
  }

  onMapInitialized(): void {
    this.renderNativePolylines();
    setTimeout(() => this.fitBounds(), 100);
  }

  loadDemandMap(): void {
    if (!this.selectedNetworkId) return;

    this.isLoading = true;
    this.errorMessage = '';
    this.clearNativePolylines();
    this.cdr.markForCheck();

    this.api.get<any>(`networks/${this.selectedNetworkId}/demand-map/`).subscribe({
      next: (data) => {
        this.network = data.network;
        this.legend = data.legend || this.legend;
        this.totals = data.totals || null;
        this.nodes = (data.nodes || [])
          .filter((node: DemandMapNode) => this.isValidCoordinate(node.latitude, node.longitude))
          .map((node: DemandMapNode) => ({
            ...node,
            latitude: Number(node.latitude),
            longitude: Number(node.longitude),
            position: { lat: Number(node.latitude), lng: Number(node.longitude) },
            annual_heat_mwh: Number(node.annual_heat_mwh || 0),
            peak_heat_kw: Number(node.peak_heat_kw || 0),
            annual_waste_heat_mwh: Number(node.annual_waste_heat_mwh || 0),
            peak_waste_heat_kw: Number(node.peak_waste_heat_kw || 0),
            markerOptions: this.buildMarkerOptions(node),
          }));
        const physicalSegmentRows = data.physical_segments || [];
        const rawRouteRows = data.routes || [];
        const physicalSegments = this.prepareRoutes(physicalSegmentRows, physicalSegmentRows.length === 1 || Number(data.raw_route_count || 0) === 1);
        const rawRoutes = physicalSegments.length ? [] : this.prepareRoutes(rawRouteRows, rawRouteRows.length === 1);
        const routeSource = physicalSegments.length ? physicalSegments : rawRoutes;
        this.displayRoutes = this.dedupeVisualRoutes(routeSource);
        this.updateRenderNodeSets();
        this.displayServiceDrops = this.buildServiceDrops(this.markerNodes, this.displayRoutes);
        this.displayEdges = (data.edges || [])
          .map((edge: any) => ({
            ...edge,
            path: this.getEdgePath(edge),
            options: this.buildEdgeOptions(),
          }))
          .filter((edge: any) => edge.path.length === 2);

        this.renderNativePolylines();
        this.updateCenter();
        setTimeout(() => this.fitBounds(), 250);
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.isLoading = false;
        this.errorMessage = 'Demand map could not be loaded.';
        this.cdr.markForCheck();
      },
    });
  }

  openNodeInfo(marker: MapMarker, node: DemandMapNode): void {
    this.selectedNode = node;
    this.infoWindow.open(marker);
  }

  toggleMapFullscreen(event?: Event): void {
    event?.stopPropagation();
    const frame = this.mapFrame?.nativeElement;
    if (!frame) return;

    if (document.fullscreenElement === frame) {
      document.exitFullscreen?.().catch(() => undefined);
      return;
    }

    frame.requestFullscreen?.().catch(() => undefined);
  }

  exportDemandDiagram(format: 'png' | 'svg'): void {
    if (!this.nodes.length || this.isExporting) return;

    this.isExporting = true;
    this.errorMessage = '';
    this.cdr.markForCheck();

    const svg = this.buildExportSvg();
    const filename = `${this.slugify(this.network?.project_name || 'network')}-heat-load-map`;

    if (format === 'svg') {
      this.downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${filename}.svg`);
      this.isExporting = false;
      this.cdr.markForCheck();
      return;
    }

    this.downloadSvgAsPng(svg, `${filename}.png`);
  }

  markerPosition(node: DemandMapNode): google.maps.LatLngLiteral {
    return node.position || { lat: node.latitude, lng: node.longitude };
  }

  trackByNodeId(_: number, node: DemandMapNode): number {
    return node.id;
  }

  trackByRouteId(index: number, route: any): any {
    return route.id || route.representative_route_id || route.representative_edge_id || index;
  }

  trackByDropId(index: number, drop: any): any {
    return drop.nodeId || index;
  }

  trackByEdgeId(index: number, edge: any): any {
    return edge.id || index;
  }

  private prepareRoutes(routes: any[], forcePrimary = false): any[] {
    return routes
      .map((route: any) => {
        const prepared = {
          ...route,
          is_primary: forcePrimary || route.is_primary,
          route_type: forcePrimary ? 'supply' : route.route_type,
          decodedPath: this.getRoutePath(route),
        };
        return {
          ...prepared,
          haloOptions: this.buildRouteHaloOptions(prepared),
          lineOptions: this.buildRouteOptions(prepared),
        };
      })
      .filter((route: any) => route.decodedPath.length > 1);
  }

  private updateRenderNodeSets(): void {
    this.markerNodesForRender = this.nodes.filter(node => node.role !== 'junction');
    this.consumerNodesForRender = this.nodes.filter(node => node.role === 'consumer');
    this.producerNodesForRender = this.nodes.filter(node => node.role === 'producer');
  }

  private dedupeVisualRoutes(routes: any[]): any[] {
    const seen = new Set<string>();
    return routes.filter(route => {
      const key = this.routePathSignature(route);
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private routePathSignature(route: any): string {
    const path = route.decodedPath || [];
    if (!path.length) return '';
    return [
      route.route_type || 'route',
      ...path.map((point: google.maps.LatLngLiteral) =>
        `${Number(point.lat).toFixed(5)},${Number(point.lng).toFixed(5)}`),
    ].join('|');
  }

  private isPrimaryRoute(route: any): boolean {
    if (route?.is_primary) return true;
    if (route?.route_type === 'supply') return true;
    if (route?.has_initial_trunk_segment) return true;
    if (route?.has_confirmed_trunk_segment) return true;
    if (Array.isArray(route?.source_route_types) && route.source_route_types.includes('supply')) return true;
    return false;
  }

  private buildRouteHaloOptions(route: any): google.maps.PolylineOptions {
    const isSupply = this.isPrimaryRoute(route);
    return {
      strokeColor: '#111827',
      strokeOpacity: isSupply ? 0.18 : 0.12,
      strokeWeight: isSupply ? 11 : 7,
      clickable: false,
      zIndex: isSupply ? 4 : 2,
    };
  }

  private buildRouteOptions(route: any): google.maps.PolylineOptions {
    const isSupply = this.isPrimaryRoute(route);
    return {
      strokeColor: isSupply ? '#8a0037' : '#f97316',
      strokeOpacity: isSupply ? 0.92 : 0.64,
      strokeWeight: isSupply ? 6 : 3.5,
      clickable: false,
      zIndex: isSupply ? 6 : 3,
    };
  }

  private buildEdgeOptions(): google.maps.PolylineOptions {
    return {
      strokeColor: '#475569',
      strokeOpacity: 0.45,
      strokeWeight: 2.5,
      clickable: false,
      zIndex: 1,
    };
  }

  private renderNativePolylines(): void {
    const map = this.map?.googleMap;
    if (!map || typeof google === 'undefined') return;

    this.clearNativePolylines();

    if (this.displayRoutes.length) {
      const showSecondaryHalos = this.displayRoutes.length <= 1200;
      this.displayRoutes.forEach(route => {
        const isPrimary = this.isPrimaryRoute(route);
        if (isPrimary || showSecondaryHalos) {
          this.addNativePolyline(route.decodedPath, route.haloOptions, map);
        }
        this.addNativePolyline(route.decodedPath, route.lineOptions, map);
      });

      const showDropHalos = this.displayServiceDrops.length <= 900;
      this.displayServiceDrops.forEach(drop => {
        if (drop.role === 'producer' || showDropHalos) {
          this.addNativePolyline(drop.path, drop.haloOptions, map);
        }
        this.addNativePolyline(drop.path, drop.lineOptions, map);
      });
      return;
    }

    this.displayEdges.forEach(edge => {
      this.addNativePolyline(edge.path, edge.options, map);
    });
  }

  private addNativePolyline(
    path: google.maps.LatLngLiteral[],
    options: google.maps.PolylineOptions,
    map: google.maps.Map,
  ): void {
    if (!path || path.length < 2) return;
    this.nativePolylines.push(new google.maps.Polyline({
      ...options,
      path,
      map,
    }));
  }

  private clearNativePolylines(): void {
    this.nativePolylines.forEach(polyline => polyline.setMap(null));
    this.nativePolylines = [];
  }

  private buildServiceDropHaloOptions(drop: any): google.maps.PolylineOptions {
    const isProducer = drop.role === 'producer';
    return {
      strokeColor: '#111827',
      strokeOpacity: isProducer ? 0.16 : 0.11,
      strokeWeight: isProducer ? 8 : 6,
      clickable: false,
      zIndex: isProducer ? 7 : 5,
    };
  }

  private buildServiceDropOptions(drop: any): google.maps.PolylineOptions {
    const isProducer = drop.role === 'producer';
    return {
      strokeColor: isProducer ? '#8a0037' : '#f97316',
      strokeOpacity: isProducer ? 0.9 : 0.72,
      strokeWeight: isProducer ? 4.5 : 3,
      clickable: false,
      zIndex: isProducer ? 8 : 6,
    };
  }

  formatEnergy(valueMwh: number): string {
    const value = Number(valueMwh || 0);
    if (!Number.isFinite(value)) return '0 MWh';
    if (Math.abs(value) >= 1000) return `${this.formatNumber(value / 1000, 1)} GWh`;
    return `${this.formatNumber(value, value >= 100 ? 0 : 1)} MWh`;
  }

  formatPower(valueKw: number): string {
    const value = Number(valueKw || 0);
    if (!Number.isFinite(value)) return '0 kW';
    if (Math.abs(value) >= 1000) return `${this.formatNumber(value / 1000, 1)} MW`;
    return `${this.formatNumber(value, value >= 100 ? 0 : 1)} kW`;
  }

  private buildMarkerOptions(node: DemandMapNode): google.maps.MarkerOptions {
    if (node.role === 'producer') {
      return this.buildProducerMarker(node);
    }

    if (node.role === 'junction') {
      return { visible: false, clickable: false };
    }

    return this.buildConsumerMarker(node);
  }

  private buildConsumerMarker(node: DemandMapNode): google.maps.MarkerOptions {
    const demand = Number(node.annual_heat_mwh || 0);
    const bucket = this.demandBucket(demand);
    const normalized = bucket / Math.max(1, this.markerDemandBuckets - 1);
    const color = this.colorForDemandRatio(normalized);
    const width = Math.round(8 + Math.max(normalized, 0.1) * 13);
    const height = Math.round(6 + Math.max(normalized, 0.1) * 9);
    const icon: any = {
      url: this.consumerIconUrl(color),
    };

    if (typeof google !== 'undefined') {
      icon.scaledSize = new google.maps.Size(width, height);
      icon.anchor = new google.maps.Point(Math.round(width / 2), Math.round(height / 2));
    }

    return {
      title: `${node.name} - building`,
      icon,
      optimized: true,
      cursor: 'pointer',
      zIndex: 20 + Math.round(normalized * 30),
    };
  }

  private buildProducerMarker(node: DemandMapNode): google.maps.MarkerOptions {
    const width = 106;
    const height = 142;
    const anchorY = Math.round(width * 124 / 96);
    const kind = this.producerMarkerKind([node], [
      this.network?.name,
      this.network?.project_name,
      this.network?.network_type,
    ]);
    const icon: any = {
      url: this.producerIconUrl(kind),
    };

    if (typeof google !== 'undefined') {
      icon.scaledSize = new google.maps.Size(width, height);
      icon.anchor = new google.maps.Point(Math.round(width / 2), anchorY);
    }

    return {
      title: `${node.name} - ${this.resolveProducerLabel([node], [
        this.network?.name,
        this.network?.project_name,
        this.network?.network_type,
      ]).toLowerCase()}`,
      icon,
      optimized: true,
      cursor: 'pointer',
      zIndex: 300,
    };
  }

  private consumerIconUrl(color: string): string {
    const cached = this.consumerIconCache.get(color);
    if (cached) return cached;

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="32" viewBox="0 0 48 32">
        <rect x="4" y="5" width="40" height="22" rx="2" fill="#3f1230" opacity="0.22"/>
        <rect x="3" y="4" width="40" height="22" rx="2" fill="${color}" stroke="#3f1230" stroke-width="2.6"/>
        <path d="M7 8h32" stroke="#fff7ed" stroke-width="2" stroke-linecap="round" opacity="0.36"/>
        <path d="M7 23h32" stroke="#3f1230" stroke-width="1.6" stroke-linecap="round" opacity="0.28"/>
      </svg>
    `;
    const url = this.svgToUrl(svg);
    this.consumerIconCache.set(color, url);
    return url;
  }

  private producerIconUrl(kind: ProducerMarkerKind): string {
    const cached = this.producerIconCache.get(kind);
    if (cached) return cached;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="128" viewBox="0 0 96 128">${this.producerMarkerSvgBody(kind)}</svg>`;
    const url = this.svgToUrl(svg);
    this.producerIconCache.set(kind, url);
    return url;
  }

  private svgToUrl(svg: string): string {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
  }

  private producerMarkerSvgBody(kind: ProducerMarkerKind): string {
    const pinFill = kind === 'wastewater' ? '#0b78ff' : (kind === 'data-center' ? '#42d638' : '#0f766e');
    const pinHighlight = kind === 'wastewater' ? '#4fa0ff' : (kind === 'data-center' ? '#7eed5d' : '#2dd4bf');
    return `
      <path d="M48 124 C42 111 13 78 13 46 C13 22 29 7 48 7 C67 7 83 22 83 46 C83 78 54 111 48 124 Z" fill="#050505"/>
      <path d="M48 116 C42 104 21 76 21 47 C21 27 33 16 48 16 C63 16 75 27 75 47 C75 76 54 104 48 116 Z" fill="${pinFill}"/>
      <path d="M27 37 C33 22 50 18 64 26 C51 19 33 25 27 43 Z" fill="${pinHighlight}" opacity="0.65"/>
      <circle cx="48" cy="47" r="31" fill="#ffffff" stroke="#111827" stroke-width="4"/>
      <circle cx="48" cy="47" r="25" fill="${kind === 'data-center' ? '#fde5be' : '#ffffff'}" stroke="${kind === 'data-center' ? '#c68b4d' : '#c7cdd1'}" stroke-width="3"/>
      ${kind === 'wastewater' ? this.wastewaterProducerGlyph() : this.dataCenterProducerGlyph()}
    `;
  }

  private dataCenterProducerGlyph(): string {
    return `
      <rect x="36" y="35" width="24" height="24" rx="2" fill="#f6c98e" stroke="#7c4a18" stroke-width="2"/>
      <rect x="41" y="40" width="14" height="14" fill="none" stroke="#7c4a18" stroke-width="2"/>
      <path d="M32 39 H36 M32 45 H36 M32 51 H36 M32 57 H36 M60 39 H64 M60 45 H64 M60 51 H64 M60 57 H64 M40 31 V35 M46 31 V35 M52 31 V35 M58 31 V35 M40 59 V64 M46 59 V64 M52 59 V64 M58 59 V64" stroke="#7c4a18" stroke-width="2" stroke-linecap="round"/>
    `;
  }

  private wastewaterProducerGlyph(): string {
    return `
      <path d="M48 41 C44.5 48 42.5 53 42.5 58 C42.5 62.5 45 65 48 65 C51 65 53.5 62.5 53.5 58 C53.5 53 51.5 48 48 41 Z" fill="#050505"/>
      <path d="M32 55 A20 20 0 0 1 43 34" fill="none" stroke="#050505" stroke-width="3.7" stroke-linecap="round"/>
      <path d="M40 31 L46 33 L41 39" fill="none" stroke="#050505" stroke-width="3.7" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M61 39 C68 47 66 57 58 62" fill="none" stroke="#050505" stroke-width="3" stroke-linecap="round"/>
      <path d="M63 58 L58 64 L57 56" fill="none" stroke="#050505" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  }

  private colorForDemand(valueMwh: number): string {
    const ratio = this.normalizeDemand(valueMwh);
    return this.colorForDemandRatio(ratio);
  }

  private colorForDemandRatio(ratio: number): string {
    const scaled = ratio * (this.demandStops.length - 1);
    const lowerIndex = Math.floor(scaled);
    const upperIndex = Math.min(lowerIndex + 1, this.demandStops.length - 1);
    const localRatio = scaled - lowerIndex;
    return this.interpolateHex(this.demandStops[lowerIndex], this.demandStops[upperIndex], localRatio);
  }

  private demandBucket(valueMwh: number): number {
    const ratio = this.normalizeDemand(valueMwh);
    return Math.max(0, Math.min(
      this.markerDemandBuckets - 1,
      Math.round(ratio * (this.markerDemandBuckets - 1)),
    ));
  }

  private normalizeDemand(valueMwh: number): number {
    const min = Number(this.legend.min_annual_heat_mwh || 0);
    const max = Number(this.legend.max_annual_heat_mwh || 0);
    const value = Number(valueMwh || 0);

    if (!max || max <= min) return value > 0 ? 1 : 0;

    const logMin = Math.log1p(Math.max(min, 0));
    const logMax = Math.log1p(max);
    const logValue = Math.log1p(Math.max(value, 0));
    return Math.max(0, Math.min(1, (logValue - logMin) / (logMax - logMin)));
  }

  private interpolateHex(start: string, end: string, ratio: number): string {
    const startRgb = this.hexToRgb(start);
    const endRgb = this.hexToRgb(end);
    const mix = startRgb.map((startValue, index) =>
      Math.round(startValue + (endRgb[index] - startValue) * ratio));
    return `#${mix.map(value => value.toString(16).padStart(2, '0')).join('')}`;
  }

  private hexToRgb(hex: string): number[] {
    const clean = hex.replace('#', '');
    return [
      parseInt(clean.substring(0, 2), 16),
      parseInt(clean.substring(2, 4), 16),
      parseInt(clean.substring(4, 6), 16),
    ];
  }

  private getRoutePath(route: any): google.maps.LatLngLiteral[] {
    if (Array.isArray(route.path) && route.path.length > 1) {
      return route.path
        .map((point: any) => ({ lat: Number(point.lat), lng: Number(point.lng) }))
        .filter((point: google.maps.LatLngLiteral) => this.isValidCoordinate(point.lat, point.lng));
    }

    const endpointPath = this.getEdgeEndpointPath(route.edge);
    const decodedPath = route.polyline ? this.decodePolyline(route.polyline) : [];
    if (decodedPath.length > 1) {
      return endpointPath.length === 2
        ? this.orientPathToEndpoints(decodedPath, endpointPath[0], endpointPath[1])
        : decodedPath;
    }

    return endpointPath;
  }

  private getEdgePath(edge: any): google.maps.LatLngLiteral[] {
    return this.getEdgeEndpointPath(edge);
  }

  private getEdgeEndpointPath(edge: any): google.maps.LatLngLiteral[] {
    if (!edge?.start_node || !edge?.end_node) return [];
    return [
      { lat: Number(edge.start_node.latitude), lng: Number(edge.start_node.longitude) },
      { lat: Number(edge.end_node.latitude), lng: Number(edge.end_node.longitude) },
    ].filter(point => this.isValidCoordinate(point.lat, point.lng));
  }

  private projectPointOnSegment(
    point: google.maps.LatLngLiteral,
    start: google.maps.LatLngLiteral,
    end: google.maps.LatLngLiteral,
  ): { point: google.maps.LatLngLiteral; t: number; distance: number } {
    const metersPerDegreeLat = 111320;
    const metersPerDegreeLng = metersPerDegreeLat * Math.cos(point.lat * Math.PI / 180);
    const startX = (start.lng - point.lng) * metersPerDegreeLng;
    const startY = (start.lat - point.lat) * metersPerDegreeLat;
    const endX = (end.lng - point.lng) * metersPerDegreeLng;
    const endY = (end.lat - point.lat) * metersPerDegreeLat;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    const t = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / lengthSquared));
    const projectedPoint = {
      lat: start.lat + (end.lat - start.lat) * t,
      lng: start.lng + (end.lng - start.lng) * t,
    };

    return {
      point: projectedPoint,
      t,
      distance: this.distanceMeters(point, projectedPoint),
    };
  }

  private buildServiceDrops(nodes: DemandMapNode[], routes: any[]): any[] {
    const routesByNode = this.indexRoutesByNode(routes);
    return nodes
      .map(node => this.buildServiceDropForNode(node, routesByNode.get(Number(node.id)) || []))
      .filter((drop): drop is any => Boolean(drop));
  }

  private indexRoutesByNode(routes: any[]): Map<number, any[]> {
    const byNode = new Map<number, any[]>();
    const add = (nodeId: any, route: any) => {
      const id = Number(nodeId);
      if (!Number.isFinite(id)) return;
      const entries = byNode.get(id) || [];
      entries.push(route);
      byNode.set(id, entries);
    };

    routes.forEach(route => {
      (route.source_node_ids || []).forEach((id: any) => add(id, route));
      add(route.edge?.start_node?.id, route);
      add(route.edge?.end_node?.id, route);
    });

    return byNode;
  }

  private buildServiceDropForNode(node: DemandMapNode, connectedRoutes: any[]): any | null {
    const nodePoint = this.markerPosition(node);
    let bestSnap: { point: google.maps.LatLngLiteral; distance: number } | null = null;

    connectedRoutes.forEach(route => {
      const snap = this.findClosestPointOnPath(nodePoint, route.decodedPath || []);
      if (snap && (!bestSnap || snap.distance < bestSnap.distance)) {
        bestSnap = snap;
      }
    });

    if (!bestSnap || bestSnap.distance <= this.endpointSnapToleranceMeters) return null;

    const drop = {
      nodeId: node.id,
      role: node.role,
      path: [nodePoint, bestSnap.point],
    };

    return {
      ...drop,
      haloOptions: this.buildServiceDropHaloOptions(drop),
      lineOptions: this.buildServiceDropOptions(drop),
    };
  }

  private routeTouchesNode(route: any, nodeId: number): boolean {
    if (Array.isArray(route.source_node_ids) && route.source_node_ids.map(Number).includes(Number(nodeId))) {
      return true;
    }

    const startId = Number(route.edge?.start_node?.id);
    const endId = Number(route.edge?.end_node?.id);
    return startId === Number(nodeId) || endId === Number(nodeId);
  }

  private findClosestPointOnPath(
    point: google.maps.LatLngLiteral,
    path: google.maps.LatLngLiteral[],
  ): { point: google.maps.LatLngLiteral; distance: number } | null {
    if (path.length === 0) return null;
    if (path.length === 1) {
      return { point: path[0], distance: this.distanceMeters(point, path[0]) };
    }

    let best: { point: google.maps.LatLngLiteral; distance: number } | null = null;
    for (let index = 0; index < path.length - 1; index++) {
      const snap = this.projectPointOnSegment(point, path[index], path[index + 1]);
      if (!best || snap.distance < best.distance) {
        best = { point: snap.point, distance: snap.distance };
      }
    }

    return best;
  }

  private buildExportSvg(): string {
    const width = 3840;
    const height = 2160;
    const mapFrame = { x: 110, y: 110, width: 2720, height: 1940 };
    const legendFrame = { x: 2920, y: 360, width: 790, height: 1230 };
    const points = this.collectExportPoints();
    const project = this.createExportProjector(points, mapFrame);
    const routes = this.displayRoutes.length ? this.displayRoutes : this.displayEdges;
    const routeHalos = routes.map(item => this.exportPathElement(
      item.decodedPath || item.path || [],
      project,
      '#111827',
      this.isSupplyRoute(item) ? 24 : 16,
      this.isSupplyRoute(item) ? 0.18 : 0.12,
    )).join('');
    const routeLines = routes.map(item => this.exportPathElement(
      item.decodedPath || item.path || [],
      project,
      this.isSupplyRoute(item) ? '#8a0037' : '#f97316',
      this.isSupplyRoute(item) ? 14 : 9,
      this.isSupplyRoute(item) ? 0.95 : 0.78,
    )).join('');
    const dropHalos = this.displayServiceDrops.map(drop => this.exportPathElement(
      drop.path || [],
      project,
      '#111827',
      drop.role === 'producer' ? 16 : 12,
      drop.role === 'producer' ? 0.16 : 0.12,
    )).join('');
    const dropLines = this.displayServiceDrops.map(drop => this.exportPathElement(
      drop.path || [],
      project,
      drop.role === 'producer' ? '#8a0037' : '#f97316',
      drop.role === 'producer' ? 10 : 7,
      drop.role === 'producer' ? 0.94 : 0.76,
    )).join('');
    const consumerMarkers = this.showRouteNodes
      ? this.consumerNodes.map(node => this.exportConsumerMarker(node, project)).join('')
      : '';
    const producerMarkers = this.producerNodes.map(node => this.exportProducerMarker(node, project)).join('');
    const legend = this.exportLegend(legendFrame);

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#0f172a" flood-opacity="0.16"/>
    </filter>
    <linearGradient id="exportDemandGradient" x1="0" x2="0" y1="1" y2="0">
      ${this.demandStops.map((color, index) =>
        `<stop offset="${(index / (this.demandStops.length - 1)) * 100}%" stop-color="${color}"/>`).join('')}
    </linearGradient>
    <clipPath id="mapClip">
      <rect x="${mapFrame.x}" y="${mapFrame.y}" width="${mapFrame.width}" height="${mapFrame.height}" rx="18"/>
    </clipPath>
  </defs>
  <rect width="3840" height="2160" fill="#fbfaf7"/>
  <rect x="${mapFrame.x}" y="${mapFrame.y}" width="${mapFrame.width}" height="${mapFrame.height}" rx="18" fill="#faf9f5" stroke="#e5ded4" stroke-width="3"/>
  <g clip-path="url(#mapClip)">
    <rect x="${mapFrame.x}" y="${mapFrame.y}" width="${mapFrame.width}" height="${mapFrame.height}" fill="#faf9f5"/>
    <path d="${this.exportGridPath(mapFrame, 150)}" stroke="#ebe4da" stroke-width="2" opacity="0.55"/>
    ${routeHalos}
    ${routeLines}
    ${dropHalos}
    ${dropLines}
    ${consumerMarkers}
    ${producerMarkers}
  </g>
  ${legend}
</svg>`;
  }

  private exportPathElement(
    points: google.maps.LatLngLiteral[],
    project: (point: google.maps.LatLngLiteral) => { x: number; y: number },
    color: string,
    strokeWidth: number,
    opacity: number,
  ): string {
    const pathData = this.exportPathData(points, project);
    if (!pathData) return '';

    return `<path d="${pathData}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
  }

  private exportConsumerMarker(
    node: DemandMapNode,
    project: (point: google.maps.LatLngLiteral) => { x: number; y: number },
  ): string {
    const point = project(this.markerPosition(node));
    const normalized = this.normalizeDemand(node.annual_heat_mwh);
    const width = 26 + Math.max(normalized, 0.1) * 48;
    const height = 18 + Math.max(normalized, 0.1) * 32;
    const x = point.x - width / 2;
    const y = point.y - height / 2;
    const color = this.colorForDemand(node.annual_heat_mwh);

    return `
      <g>
        <rect x="${this.svgNumber(x + 5)}" y="${this.svgNumber(y + 6)}" width="${this.svgNumber(width)}" height="${this.svgNumber(height)}" rx="4" fill="#3f1230" opacity="0.16"/>
        <rect x="${this.svgNumber(x)}" y="${this.svgNumber(y)}" width="${this.svgNumber(width)}" height="${this.svgNumber(height)}" rx="4" fill="${color}" stroke="#3f1230" stroke-width="4"/>
        <path d="M ${this.svgNumber(x + 7)} ${this.svgNumber(y + 8)} H ${this.svgNumber(x + width - 7)}" stroke="#fff7ed" stroke-width="3" stroke-linecap="round" opacity="0.34"/>
      </g>`;
  }

  private exportProducerMarker(
    node: DemandMapNode,
    project: (point: google.maps.LatLngLiteral) => { x: number; y: number },
  ): string {
    const point = project(this.markerPosition(node));
    const kind = this.producerMarkerKind([node], [
      this.network?.name,
      this.network?.project_name,
      this.network?.network_type,
    ]);
    const scale = 2.2;
    const x = point.x - 48 * scale;
    const y = point.y - 124 * scale;

    return `
      <g transform="translate(${this.svgNumber(x)} ${this.svgNumber(y)}) scale(${scale})" filter="url(#softShadow)">
        ${this.producerMarkerSvgBody(kind)}
      </g>`;
  }

  private exportLegend(frame: { x: number; y: number; width: number; height: number }): string {
    const buildingCount = this.escapeSvg(this.formatNumber(this.buildingCount, 0));
    const producerLabel = this.escapeSvg(this.producerLegendLabel);
    const producerKind = this.producerMarkerKind(this.producerNodesForRender, [
      this.network?.name,
      this.network?.project_name,
      this.network?.network_type,
    ]);
    const routeY = 525;
    const secondaryRouteY = routeY + 82;

    return `
      <g transform="translate(${frame.x} ${frame.y})" filter="url(#softShadow)">
        <rect width="${frame.width}" height="${frame.height}" rx="26" fill="#ffffff" opacity="0.96" stroke="#cbd5e1" stroke-width="4"/>
        <text x="70" y="104" font-family="Arial, sans-serif" font-size="68" font-weight="900" fill="#111827">Routes</text>
        <line x1="70" y1="150" x2="${frame.width - 70}" y2="150" stroke="#e2e8f0" stroke-width="3"/>
        <g transform="translate(66 156) scale(0.72)">
          ${this.producerMarkerSvgBody(producerKind)}
        </g>
        <text x="178" y="236" font-family="Arial, sans-serif" font-size="47" font-weight="900" fill="#111827">${producerLabel}</text>
        <rect x="70" y="315" width="610" height="125" rx="16" fill="#f8fafc" stroke="#e2e8f0" stroke-width="3"/>
        <text x="104" y="365" font-family="Arial, sans-serif" font-size="36" font-weight="900" fill="#64748b">BUILDINGS</text>
        <text x="104" y="422" font-family="Arial, sans-serif" font-size="64" font-weight="900" fill="#111827">${buildingCount}</text>
        <line x1="70" y1="475" x2="${frame.width - 70}" y2="475" stroke="#e2e8f0" stroke-width="3"/>
        <path d="M 78 ${routeY} H 160" stroke="#8a0037" stroke-width="16" stroke-linecap="round"/>
        <text x="198" y="${routeY + 14}" font-family="Arial, sans-serif" font-size="46" font-weight="900" fill="#111827">Primary route</text>
        <path d="M 78 ${secondaryRouteY} H 160" stroke="#f97316" stroke-width="12" stroke-linecap="round"/>
        <text x="198" y="${secondaryRouteY + 14}" font-family="Arial, sans-serif" font-size="46" font-weight="900" fill="#111827">Secondary routes</text>
      </g>`;
  }

  private producerMarkerKind(nodes: DemandMapNode[], context: any[] = []): ProducerMarkerKind {
    const text = this.producerDescriptorText(nodes, context);

    if (/(waste[-_\s]*water|wastewater|sewage|treatment|wwtp)/i.test(text)) {
      return 'wastewater';
    }
    if (/(data[\s_-]*cent(er|re)|datacenter)/i.test(text)) {
      return 'data-center';
    }
    return 'generic';
  }

  private resolveProducerLabel(nodes: DemandMapNode[], context: any[] = []): string {
    const text = this.producerDescriptorText(nodes, context);

    if (/(waste[-_\s]*water|wastewater|sewage|treatment|wwtp)/i.test(text)) {
      return 'Wastewater / producer';
    }
    if (/(data[\s_-]*cent(er|re)|datacenter)/i.test(text)) {
      return 'Data center / producer';
    }
    if (/boiler/i.test(text)) {
      return 'Boiler / producer';
    }
    if (/(waste\s*heat|waste_heat)/i.test(text)) {
      return 'Waste heat producer';
    }
    return 'Heat producer';
  }

  private producerDescriptorText(nodes: DemandMapNode[], context: any[] = []): string {
    const nodeParts = nodes.map(node => [
      node.name,
      node.node_type,
      node.building_type,
      node.waste_heat_source_type,
    ].filter(Boolean).join(' '));

    return [
      ...context,
      ...nodeParts,
    ].filter(Boolean).join(' ').toLowerCase();
  }

  private collectExportPoints(): google.maps.LatLngLiteral[] {
    const routePoints = this.displayRoutes.reduce((allPoints: google.maps.LatLngLiteral[], route: any) =>
      allPoints.concat(route.decodedPath || []), []);
    const dropPoints = this.displayServiceDrops.reduce((allPoints: google.maps.LatLngLiteral[], drop: any) =>
      allPoints.concat(drop.path || []), []);
    const edgePoints = this.displayEdges.reduce((allPoints: google.maps.LatLngLiteral[], edge: any) =>
      allPoints.concat(edge.path || []), []);

    return [
      ...this.visibleMarkerNodes.map(node => this.markerPosition(node)),
      ...routePoints,
      ...dropPoints,
      ...edgePoints,
    ].filter(point => this.isValidCoordinate(point.lat, point.lng));
  }

  private createExportProjector(
    points: google.maps.LatLngLiteral[],
    frame: { x: number; y: number; width: number; height: number },
  ): (point: google.maps.LatLngLiteral) => { x: number; y: number } {
    const projectedPoints = (points.length ? points : [this.center]).map(point => this.webMercator(point));
    const minX = Math.min(...projectedPoints.map(point => point.x));
    const maxX = Math.max(...projectedPoints.map(point => point.x));
    const minY = Math.min(...projectedPoints.map(point => point.y));
    const maxY = Math.max(...projectedPoints.map(point => point.y));
    const spanX = Math.max(maxX - minX, 1e-9);
    const spanY = Math.max(maxY - minY, 1e-9);
    const scale = Math.min(frame.width / spanX, frame.height / spanY) * 0.92;
    const offsetX = frame.x + (frame.width - spanX * scale) / 2;
    const offsetY = frame.y + (frame.height - spanY * scale) / 2;

    return (point: google.maps.LatLngLiteral) => {
      const projected = this.webMercator(point);
      return {
        x: offsetX + (projected.x - minX) * scale,
        y: offsetY + (projected.y - minY) * scale,
      };
    };
  }

  private webMercator(point: google.maps.LatLngLiteral): { x: number; y: number } {
    const lat = Math.max(-85, Math.min(85, point.lat));
    const sin = Math.sin(lat * Math.PI / 180);
    return {
      x: (point.lng + 180) / 360,
      y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
    };
  }

  private exportPathData(
    points: google.maps.LatLngLiteral[],
    project: (point: google.maps.LatLngLiteral) => { x: number; y: number },
  ): string {
    const projectedPoints = points
      .filter(point => this.isValidCoordinate(point.lat, point.lng))
      .map(point => project(point));

    if (projectedPoints.length < 2) return '';

    return projectedPoints
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${this.svgNumber(point.x)} ${this.svgNumber(point.y)}`)
      .join(' ');
  }

  private exportGridPath(
    frame: { x: number; y: number; width: number; height: number },
    spacing: number,
  ): string {
    const commands: string[] = [];
    for (let x = frame.x; x <= frame.x + frame.width; x += spacing) {
      commands.push(`M ${x} ${frame.y} V ${frame.y + frame.height}`);
    }
    for (let y = frame.y; y <= frame.y + frame.height; y += spacing) {
      commands.push(`M ${frame.x} ${y} H ${frame.x + frame.width}`);
    }
    return commands.join(' ');
  }

  private isSupplyRoute(item: any): boolean {
    return this.isPrimaryRoute(item);
  }

  private orientPathToEndpoints(
    path: google.maps.LatLngLiteral[],
    start: google.maps.LatLngLiteral,
    end: google.maps.LatLngLiteral,
  ): google.maps.LatLngLiteral[] {
    if (path.length < 2 || !start || !end) return [...path];

    const first = path[0];
    const last = path[path.length - 1];
    const forwardDistance = this.distanceMeters(start, first) + this.distanceMeters(end, last);
    const reverseDistance = this.distanceMeters(start, last) + this.distanceMeters(end, first);

    const oriented = reverseDistance < forwardDistance ? [...path].reverse() : [...path];
    return this.anchorPathToEndpoints(oriented, start, end);
  }

  private anchorPathToEndpoints(
    path: google.maps.LatLngLiteral[],
    start: google.maps.LatLngLiteral,
    end: google.maps.LatLngLiteral,
  ): google.maps.LatLngLiteral[] {
    if (path.length < 2) return [...path];
    const anchored = [...path];
    if (this.distanceMeters(start, anchored[0]) > this.endpointSnapToleranceMeters) {
      anchored.unshift(start);
    } else {
      anchored[0] = start;
    }
    if (this.distanceMeters(end, anchored[anchored.length - 1]) > this.endpointSnapToleranceMeters) {
      anchored.push(end);
    } else {
      anchored[anchored.length - 1] = end;
    }
    return anchored;
  }

  private distanceMeters(a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral): number {
    const radiusMeters = 6371000;
    const toRadians = (degrees: number) => degrees * Math.PI / 180;
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);
    const deltaLat = toRadians(b.lat - a.lat);
    const deltaLng = toRadians(b.lng - a.lng);
    const sinLat = Math.sin(deltaLat / 2);
    const sinLng = Math.sin(deltaLng / 2);
    const value = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

    return 2 * radiusMeters * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  private decodePolyline(encoded: string): google.maps.LatLngLiteral[] {
    const points: google.maps.LatLngLiteral[] = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
      const latResult = this.decodePolylineValue(encoded, index);
      lat += latResult.value;
      index = latResult.nextIndex;

      const lngResult = this.decodePolylineValue(encoded, index);
      lng += lngResult.value;
      index = lngResult.nextIndex;

      points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }

    return points.filter(point => this.isValidCoordinate(point.lat, point.lng));
  }

  private decodePolylineValue(encoded: string, startIndex: number): { value: number; nextIndex: number } {
    let result = 0;
    let shift = 0;
    let index = startIndex;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);

    const value = (result & 1) ? ~(result >> 1) : (result >> 1);
    return { value, nextIndex: index };
  }

  private updateCenter(): void {
    const points = this.mapBoundsPoints();
    if (!points.length) return;

    this.center = {
      lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
      lng: points.reduce((sum, point) => sum + point.lng, 0) / points.length,
    };
  }

  private fitBounds(): void {
    if (!this.map || typeof google === 'undefined') return;
    const points = this.mapBoundsPoints();

    if (!points.length) return;

    const bounds = new google.maps.LatLngBounds();
    points.forEach(point => bounds.extend(point));
    this.map.fitBounds(bounds, 56);
  }

  private mapBoundsPoints(): google.maps.LatLngLiteral[] {
    return [
      ...this.visibleMarkerNodes.map(node => this.markerPosition(node)),
      ...this.displayRoutes.reduce((allPoints: google.maps.LatLngLiteral[], route: any) => {
        return allPoints.concat(route.decodedPath || []);
      }, []),
      ...this.displayServiceDrops.reduce((allPoints: google.maps.LatLngLiteral[], drop: any) => {
        return allPoints.concat(drop.path || []);
      }, []),
    ].filter(point => this.isValidCoordinate(point.lat, point.lng));
  }

  private isValidCoordinate(lat: any, lng: any): boolean {
    return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  }

  private formatNumber(value: number, maximumFractionDigits: number): string {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits,
    }).format(value);
  }

  private downloadSvgAsPng(svg: string, filename: string): void {
    const width = 3840;
    const height = 2160;
    const image = new Image();
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');

      if (!context) {
        this.errorMessage = 'Export image could not be created.';
        this.isExporting = false;
        URL.revokeObjectURL(url);
        this.cdr.markForCheck();
        return;
      }

      context.fillStyle = '#fbfaf7';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) {
          this.downloadBlob(pngBlob, filename);
        } else {
          this.errorMessage = 'Export image could not be created.';
        }

        this.isExporting = false;
        URL.revokeObjectURL(url);
        this.cdr.markForCheck();
      }, 'image/png');
    };

    image.onerror = () => {
      this.errorMessage = 'Export image could not be created.';
      this.isExporting = false;
      URL.revokeObjectURL(url);
      this.cdr.markForCheck();
    };

    image.src = url;
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private slugify(value: string): string {
    return String(value || 'network')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'network';
  }

  private escapeSvg(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private svgNumber(value: number): string {
    return Number(value).toFixed(1);
  }
}
