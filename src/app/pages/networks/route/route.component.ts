import { Component, Input, OnChanges, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { GoogleMap, MapInfoWindow } from '@angular/google-maps';
import { ActivatedRoute, Router } from '@angular/router';
import { RestApiService } from '../../../@core/utils/rest-api.service';


@Component({
  selector: 'ngx-route',
  templateUrl: './route.component.html',
  styleUrls: ['./route.component.scss']
})
export class RouteComponent implements OnInit{
   @Input() routeId!: number;
  routeData: any;
  
  // Visuals
  decodedPath: google.maps.LatLngLiteral[] = [];
  serviceDrops: any[] = [];
  startNode: any;
  endNode: any;
  private readonly endpointSnapToleranceMeters = 3;

  // Map Config
  @ViewChild(GoogleMap) map!: GoogleMap;
  @ViewChild(MapInfoWindow) infoWindow!: MapInfoWindow;
  
  center: google.maps.LatLngLiteral = { lat: 0, lng: 0 };
  zoom = 15;

  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    fullscreenControl: true, // <--- ADDED FULLSCREEN BUTTON
    fullscreenControlOptions: { position: google.maps.ControlPosition.TOP_RIGHT },
    styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }]
  };

  // Styles
  lineOptions: google.maps.PolylineOptions = {
    strokeOpacity: 0.8,
    strokeWeight: 5,
    clickable: true
  };

  nodeOptions: google.maps.MarkerOptions = {
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 4,
      fillColor: '#8f9bb3',
      fillOpacity: 1,
      strokeWeight: 0
    }
  };

  constructor(
    private api: RestApiService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (!this.routeId) {
      this.route.paramMap.subscribe(params => {
        const id = params.get('id');
        if (id) {
          this.routeId = Number(id);
          this.loadData();
        }
      });
    } else {
      this.loadData();
    }
  }

  loadData() {
    this.api.get<any>(`routes/${this.routeId}/`).subscribe(data => {
      this.routeData = data;
      
      // 1. Set Line Color based on Type
      const color = data.route_type === 'supply' ? '#ff3d71' : '#3366ff';
      this.lineOptions = { ...this.lineOptions, strokeColor: color };

      // 2. Extract Context Nodes (from Edge relation)
      if (data.edge) {
        this.startNode = data.edge.start_node;
        this.endNode = data.edge.end_node;
      }

      // 3. Decode Polyline
      if (data.polyline) {
        this.decodedPath = this.getDisplayRoutePath(data);
        this.serviceDrops = this.buildServiceDrops();
        
        // Center Map
        if (this.decodedPath.length > 0) {
          this.center = this.decodedPath[0];
          this.fitBounds();
        }
      }
    });
  }

  // --- CUSTOM DECODER ---
  decodePolyline(encoded: string): google.maps.LatLngLiteral[] {
    const poly: google.maps.LatLngLiteral[] = [];
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;

    while (index < len) {
      let b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lat += ((result & 1) ? ~(result >> 1) : (result >> 1));

      shift = 0; result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lng += ((result & 1) ? ~(result >> 1) : (result >> 1));

      poly.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return poly;
  }

  fitBounds() {
    if (this.decodedPath.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    this.decodedPath.forEach(p => bounds.extend(p));
    this.serviceDrops.forEach(drop => drop.path.forEach(p => bounds.extend(p)));
    // Add nodes to bounds to ensure they aren't cut off
    if (this.startNode) bounds.extend({ lat: this.startNode.latitude, lng: this.startNode.longitude });
    if (this.endNode) bounds.extend({ lat: this.endNode.latitude, lng: this.endNode.longitude });

    setTimeout(() => { if (this.map) this.map.fitBounds(bounds); }, 100);
  }

  private getDisplayRoutePath(route: any): google.maps.LatLngLiteral[] {
    const decodedPath = route.polyline ? this.decodePolyline(route.polyline) : [];
    const endpointPath = this.getRouteEndpointPath();
    if (decodedPath.length > 1 && endpointPath.length === 2) {
      return this.orientPathToEndpoints(decodedPath, endpointPath[0], endpointPath[1]);
    }

    return decodedPath.length > 0 ? decodedPath : endpointPath;
  }

  private buildServiceDrops(): any[] {
    return [this.startNode, this.endNode]
      .map(node => this.buildServiceDropForNode(node))
      .filter((drop): drop is any => Boolean(drop));
  }

  private buildServiceDropForNode(node: any): any | null {
    if (!node || !this.decodedPath.length) return null;

    const nodePoint = { lat: Number(node.latitude), lng: Number(node.longitude) };
    if (!this.isValidCoordinate(nodePoint.lat, nodePoint.lng)) return null;

    const snap = this.findClosestPointOnPath(nodePoint, this.decodedPath);
    if (!snap || snap.distance <= this.endpointSnapToleranceMeters) return null;

    const isProducer = node.node_type === 'producer';
    return {
      path: [nodePoint, snap.point],
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

  private getRouteEndpointPath(): google.maps.LatLngLiteral[] {
    if (!this.startNode || !this.endNode) return [];
    return [
      { lat: Number(this.startNode.latitude), lng: Number(this.startNode.longitude) },
      { lat: Number(this.endNode.latitude), lng: Number(this.endNode.longitude) },
    ].filter(point => this.isValidCoordinate(point.lat, point.lng));
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

  goBack() {
    // Navigate back to the parent translation page if possible
    if(this.routeData?.translation) {
      this.router.navigate(['/pages/edge-translations', this.routeData.translation]);
    } else {
      this.router.navigate(['/pages/networks']);
    }
  }
}
