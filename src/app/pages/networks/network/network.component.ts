import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GoogleMap, MapInfoWindow, MapMarker } from '@angular/google-maps';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { Network } from '../../../@core/data/network';
import { Node, NodeType } from '../../../@core/data/node';

@Component({
  selector: 'ngx-network',
  templateUrl: './network.component.html',
  styleUrls: ['./network.component.scss']
})
export class NetworkComponent implements OnInit {
  networkId!: number;
  network: Network | undefined;
  nodes: any[] = [];
  edges: any[] = [];
  routes: any[] = [];
  visualRoutes: any[] = [];
  visualServiceDrops: any[] = [];
  hasRoutes = false;

  // Map Access
  @ViewChild(GoogleMap) map!: GoogleMap;
  @ViewChild(MapInfoWindow) infoWindow!: MapInfoWindow;
  
  selectedNode: Node | null = null;
  selectedEdge: any | null = null;
  selectedRoute: any | null = null;
  private readonly endpointSnapToleranceMeters = 3;

  // Map Config
  center: google.maps.LatLngLiteral = { lat: 0, lng: 0 };
  zoom = 13;
  
  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    fullscreenControl: true,
    fullscreenControlOptions: { position: google.maps.ControlPosition.TOP_RIGHT },
    mapTypeId: 'roadmap',
    styles: [ { featureType: 'poi', stylers: [{ visibility: 'off' }] } ]
  };

  constructor(
    private api: RestApiService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.networkId = Number(id);
        this.loadData();
      } else {
        console.error('No Network ID provided in URL');
        this.goBack();
      }
    });
  }

  loadData() {
    this.api.get<any>(`networks/${this.networkId}/`).subscribe(net => {
      this.network = net;
      this.nodes = net.nodes || [];
      this.edges = net.edges || [];
      this.routes = net.routes || [];
      this.visualRoutes = this.routes
        .map(route => ({
          ...route,
          decodedPath: this.getDisplayRoutePath(route),
        }))
        .filter(route => route.decodedPath.length > 0);
      this.visualServiceDrops = this.buildServiceDrops(this.nodes, this.visualRoutes);
      this.hasRoutes = this.visualRoutes.length > 0;

      // 1. Center logic
      if (net.latitude && net.longitude) {
        this.center = { lat: Number(net.latitude), lng: Number(net.longitude) };
      }

      // 2. Fit Bounds (Include nodes)
      if (this.nodes.length > 0) {
        this.fitBounds();
      }
    });
  }

  fitBounds() {
    if (this.nodes.length === 0 && this.visualRoutes.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    let validPoints = 0;

    this.nodes.forEach(n => {
      if (n.latitude && n.longitude) {
        bounds.extend({ lat: Number(n.latitude), lng: Number(n.longitude) });
        validPoints++;
      }
    });

    this.visualRoutes.forEach(route => {
      route.decodedPath.forEach(point => {
        bounds.extend(point);
        validPoints++;
      });
    });

    this.visualServiceDrops.forEach(drop => {
      drop.path.forEach(point => {
        bounds.extend(point);
        validPoints++;
      });
    });

    if (validPoints > 0) {
      setTimeout(() => { 
        if (this.map) {
          this.map.fitBounds(bounds);
          if (validPoints === 1) this.zoom = 15; 
        }
      }, 100);
    }
  }

  // --- NODE MARKERS ---
  getMarkerOptions(node: Node): google.maps.MarkerOptions {
    const type = node.node_type as NodeType;
    let color = '#777';
    let path = google.maps.SymbolPath.CIRCLE;
    let scale = 6;

    switch (type) {
      case 'producer':
        color = '#ef4444'; // Red
        scale = 9;
        path = google.maps.SymbolPath.BACKWARD_CLOSED_ARROW; 
        break;
      case 'consumer':
        color = '#3b82f6'; // Blue
        path = google.maps.SymbolPath.CIRCLE; 
        break;
      case 'storage':
        color = '#8b5cf6'; // Purple
        scale = 8;
        path = google.maps.SymbolPath.FORWARD_CLOSED_ARROW; 
        break;
      case 'cluster':
        color = '#10b981'; // Green
        scale = 10;
        path = google.maps.SymbolPath.FORWARD_OPEN_ARROW; 
        break;
    }

    return {
      icon: {
        path: path,
        fillColor: color,
        fillOpacity: 0.9,
        strokeWeight: 1,
        strokeColor: '#ffffff',
        scale: scale,
      },
      title: node.name,
      zIndex: 10 // Nodes on top of lines
    };
  }

  // --- EDGE POLYLINES (NEW) ---
  
  getEdgePath(edge: any): google.maps.LatLngLiteral[] {
    if (!edge.start_node || !edge.end_node) return [];
    return [
      { lat: Number(edge.start_node.latitude), lng: Number(edge.start_node.longitude) },
      { lat: Number(edge.end_node.latitude), lng: Number(edge.end_node.longitude) }
    ];
  }

  getEdgeOptions(edge: any): google.maps.PolylineOptions {
    // Determine type based on naming convention or edge_type field
    // Logic: 'Pipe' = Solid, 'Truck/Mobile' = Dashed
    const isMobile = (edge.name && edge.name.includes('Truck')) || edge.edge_type === 'mobile_route';
    
    // Default Pipe Style (Dark Grey/Blue)
    const baseOptions: google.maps.PolylineOptions = {
      strokeColor: 'red', 
      strokeOpacity: 0.8,
      strokeWeight: 4,
      geodesic: true,
      clickable: true,
      zIndex: 1 // Lines below nodes
    };

    if (isMobile) {
      // Mobile Route Style (Orange Dashed)
      return {
        ...baseOptions,
        strokeColor: '#f39c12',
        strokeOpacity: 0, // Hide base line, use icons for dashes
        icons: [{
          icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3, strokeColor: '#f39c12' },
          offset: '0',
          repeat: '20px'
        }]
      };
    }

    return baseOptions;
  }

  getRouteOptions(route: any): google.maps.PolylineOptions {
    const isSupply = route.route_type === 'supply';
    return {
      strokeColor: isSupply ? '#dc2626' : '#2563eb',
      strokeOpacity: isSupply ? 0.96 : 0.88,
      strokeWeight: isSupply ? 5 : 4,
      clickable: true,
      zIndex: isSupply ? 12 : 11,
    };
  }

  getRouteHaloOptions(route: any): google.maps.PolylineOptions {
    const isSupply = route.route_type === 'supply';
    return {
      strokeColor: '#111827',
      strokeOpacity: 0.24,
      strokeWeight: isSupply ? 9 : 8,
      clickable: false,
      zIndex: isSupply ? 10 : 9,
    };
  }

  decodePolyline(encoded: string): google.maps.LatLngLiteral[] {
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

    return points;
  }

  private getDisplayRoutePath(route: any): google.maps.LatLngLiteral[] {
    if (Array.isArray(route.path) && route.path.length > 1) {
      return route.path
        .map((point: any) => ({ lat: Number(point.lat), lng: Number(point.lng) }))
        .filter((point: google.maps.LatLngLiteral) => this.isValidCoordinate(point.lat, point.lng));
    }

    const endpointPath = this.getRouteEndpointPath(route);
    const decodedPath = route.polyline ? this.decodePolyline(route.polyline) : [];
    if (this.isSyntheticOffsetRoute(route, decodedPath)) {
      return endpointPath;
    }
    if (decodedPath.length > 1) {
      return endpointPath.length === 2
        ? this.orientPathToEndpoints(decodedPath, endpointPath[0], endpointPath[1])
        : decodedPath;
    }
    return endpointPath;
  }

  private isSyntheticOffsetRoute(route: any, decodedPath: google.maps.LatLngLiteral[]): boolean {
    return Number(route.duration_seconds || 0) === 0 &&
      decodedPath.length > 2 &&
      this.getRouteEndpointPath(route).length === 2;
  }

  private getRouteEndpointPath(route: any): google.maps.LatLngLiteral[] {
    const startNode = route.edge?.start_node;
    const endNode = route.edge?.end_node;
    if (!startNode || !endNode) return [];
    return [
      { lat: Number(startNode.latitude), lng: Number(startNode.longitude) },
      { lat: Number(endNode.latitude), lng: Number(endNode.longitude) },
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

  private orientPathToEndpoints(
    path: google.maps.LatLngLiteral[],
    start: google.maps.LatLngLiteral,
    end: google.maps.LatLngLiteral,
  ): google.maps.LatLngLiteral[] {
    if (path.length < 2) return [...path];

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

  private isValidCoordinate(lat: any, lng: any): boolean {
    return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  }

  private buildServiceDrops(nodes: any[], routes: any[]): any[] {
    return nodes
      .map(node => this.buildServiceDropForNode(node, routes))
      .filter((drop): drop is any => Boolean(drop));
  }

  private buildServiceDropForNode(node: any, routes: any[]): any | null {
    const nodePoint = { lat: Number(node.latitude), lng: Number(node.longitude) };
    if (!this.isValidCoordinate(nodePoint.lat, nodePoint.lng)) return null;

    const connectedRoutes = routes.filter(route => this.routeTouchesNode(route, node.id));
    let bestSnap: { point: google.maps.LatLngLiteral; distance: number } | null = null;

    connectedRoutes.forEach(route => {
      const snap = this.findClosestPointOnPath(nodePoint, route.decodedPath || []);
      if (snap && (!bestSnap || snap.distance < bestSnap.distance)) {
        bestSnap = snap;
      }
    });

    if (!bestSnap || bestSnap.distance <= this.endpointSnapToleranceMeters) return null;

    const isProducer = node.node_type === 'producer';
    return {
      nodeId: node.id,
      path: [nodePoint, bestSnap.point],
      haloOptions: {
        strokeColor: '#111827',
        strokeOpacity: isProducer ? 0.18 : 0.12,
        strokeWeight: isProducer ? 8 : 6,
        clickable: false,
        zIndex: isProducer ? 14 : 13,
      },
      lineOptions: {
        strokeColor: isProducer ? '#dc2626' : '#2563eb',
        strokeOpacity: isProducer ? 0.95 : 0.82,
        strokeWeight: isProducer ? 4 : 3,
        clickable: false,
        zIndex: isProducer ? 16 : 15,
      },
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
    if (path.length === 1) return { point: path[0], distance: this.distanceMeters(point, path[0]) };

    let best: { point: google.maps.LatLngLiteral; distance: number } | null = null;
    for (let index = 0; index < path.length - 1; index++) {
      const snap = this.projectPointOnSegment(point, path[index], path[index + 1]);
      if (!best || snap.distance < best.distance) {
        best = { point: snap.point, distance: snap.distance };
      }
    }

    return best;
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

  openNodeInfo(marker: MapMarker, node: Node) {
    this.selectedNode = node;
    this.selectedEdge = null;
    this.selectedRoute = null;
    this.infoWindow.open(marker);
  }

  openEdgeInfo(edge: any, polyline: any) {
    // You can't easily attach InfoWindow to a Polyline directly in Angular GMaps
    // Simplest way: set selectedEdge and use a fixed position or center of line
    // For now, we will just log it or show it in a side panel if you had one.
    // Alternatively, calculate midpoint:
    const midLat = (Number(edge.start_node.latitude) + Number(edge.end_node.latitude)) / 2;
    const midLng = (Number(edge.start_node.longitude) + Number(edge.end_node.longitude)) / 2;
    
    this.selectedEdge = edge;
    this.selectedRoute = null;
    this.selectedNode = null;
    
    // Hack: open info window at midpoint
    this.infoWindow.position = { lat: midLat, lng: midLng };
    this.infoWindow.open();
  }

  openRouteInfo(route: any) {
    const path = route.decodedPath || [];
    if (path.length === 0) return;

    const midpoint = path[Math.floor(path.length / 2)];
    this.selectedRoute = route;
    this.selectedEdge = null;
    this.selectedNode = null;
    this.infoWindow.position = midpoint;
    this.infoWindow.open();
  }

  goBack() {
    this.router.navigate(['/pages/networks']);
  }
}
