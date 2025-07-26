import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';


@Component({
  selector: 'ngx-route',
  templateUrl: './route.component.html',
  styleUrls: ['./route.component.scss']
})
export class RouteComponent implements OnInit, OnChanges{
    @Input() routes= [];
  @Input() height: string = '600px';
  @Input() width: string = '100%';
  @Input() showRoads: boolean = true;
  @Input() showMarkers: boolean = true;
  @Input() showRouteInfo: boolean = true;
  
  map: google.maps.Map | undefined;
  directionsRenderers: google.maps.DirectionsRenderer[] = [];
  markers: google.maps.Marker[] = [];
  infoWindows: google.maps.InfoWindow[] = [];

  ngOnInit(): void {
    this.initMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['routes'] && !changes['routes'].firstChange) {
      this.clearMap();
      this.plotRoutes();
    }
  }

  initMap(): void {
    const defaultCenter = this.routes.length > 0 
      ? { lat: this.routes[0].edge.start_node.latitude, lng: this.routes[0].edge.start_node.longitude }
      : { lat: 0, lng: 0 };

    this.map = new google.maps.Map(document.getElementById('map') as HTMLElement, {
      center: defaultCenter,
      zoom: 14,
      mapTypeId: google.maps.MapTypeId.ROADMAP,
      styles: this.getMapStyle(),
      streetViewControl: false,
      fullscreenControl: true,
    });

    this.plotRoutes();
  }

  plotRoutes(): void {
    if (!this.map || this.routes.length === 0) return;

    this.routes.forEach(route => {
      // Create DirectionsRenderer for each route
      const directionsRenderer = new google.maps.DirectionsRenderer({
        map: this.map,
        suppressMarkers: !this.showMarkers,
        preserveViewport: false,
        polylineOptions: {
          strokeColor: this.getRouteColor(route),
          strokeOpacity: 0.8,
          strokeWeight: 5,
          zIndex: 1
        },
        directions: this.createDirectionsResult(route)
      });

      this.directionsRenderers.push(directionsRenderer);

      // Add custom markers if enabled
      if (this.showMarkers) {
        this.addCustomMarker(route.edge.start_node, 'Start', 'green');
        this.addCustomMarker(route.edge.end_node, 'End', 'red');
      }

      // Fit map to show all routes
      this.fitMapToBounds();
    });
  }

  createDirectionsResult(route): google.maps.DirectionsResult {
    return {
      routes: [{
        legs: [{
          steps: [],
          distance: { text: '', value: route.distance_meters },
          duration: { text: '', value: route.duration_seconds },
          start_address: '',
          end_address: '',
          start_location: new google.maps.LatLng(
            route.edge.start_node.latitude,
            route.edge.start_node.longitude
          ),
          end_location: new google.maps.LatLng(
            route.edge.end_node.latitude,
            route.edge.end_node.longitude
          ),
          arrival_time: undefined,
          departure_time: undefined,
          duration_in_traffic: undefined,
          via_waypoints: []
        }],
        overview_path: google.maps.geometry.encoding.decodePath(route.polyline),
        overview_polyline: route.polyline,
        bounds: this.createRouteBounds(route),
        copyrights: '',
        warnings: [],
        waypoint_order: [],
        fare: undefined
      }],
      geocoded_waypoints: []
    };
  }

  addCustomMarker(node: any, title: string, color: string): void {
    if (!this.map) return;

    const marker = new google.maps.Marker({
      position: { lat: node.latitude, lng: node.longitude },
      map: this.map,
      title: `${title}: ${node.name || node.node_type}`,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 1,
        scale: 8
      }
    });

    if (this.showRouteInfo) {
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div class="map-info-window">
            <h3>${node.name || title + ' Node'}</h3>
            <p><strong>Type:</strong> ${node.node_type}</p>
            <p><strong>Coordinates:</strong> ${node.latitude.toFixed(6)}, ${node.longitude.toFixed(6)}</p>
            ${node.name ? `<p><strong>Description:</strong> ${node.name}</p>` : ''}
          </div>
        `
      });

      marker.addListener('click', () => {
        this.infoWindows.forEach(iw => iw.close());
        infoWindow.open(this.map, marker);
      });

      this.infoWindows.push(infoWindow);
    }

    this.markers.push(marker);
  }

  createRouteBounds(route): google.maps.LatLngBounds {
    const bounds = new google.maps.LatLngBounds();
    const path = google.maps.geometry.encoding.decodePath(route.polyline);
    
    path.forEach(point => bounds.extend(point));
    bounds.extend(new google.maps.LatLng(route.edge.start_node.latitude, route.edge.start_node.longitude));
    bounds.extend(new google.maps.LatLng(route.edge.end_node.latitude, route.edge.end_node.longitude));
    
    return bounds;
  }

  fitMapToBounds(): void {
    if (!this.map || this.routes.length === 0) return;

    const bounds = new google.maps.LatLngBounds();
    
    this.routes.forEach(route => {
      const path = google.maps.geometry.encoding.decodePath(route.polyline);
      path.forEach(point => bounds.extend(point));
      
      bounds.extend(new google.maps.LatLng(
        route.edge.start_node.latitude,
        route.edge.start_node.longitude
      ));
      
      bounds.extend(new google.maps.LatLng(
        route.edge.end_node.latitude,
        route.edge.end_node.longitude
      ));
    });

    this.map.fitBounds(bounds);
  }

  getRouteColor(route): string {
    // Different colors based on route type
    switch(route.translation.translation) {
      case 'driving': return '#4285F4'; // Google blue
      case 'walking': return '#0F9D58'; // Google green
      case 'bicycling': return '#F4B400'; // Google yellow
      default: return '#DB4437'; // Google red
    }
  }

  getMapStyle(): google.maps.MapTypeStyle[] {
    return [
      {
        featureType: "road",
        elementType: "geometry",
        stylers: [
          { visibility: this.showRoads ? "on" : "off" },
          { color: "#ffffff" } // White roads for better contrast
        ]
      },
      {
        featureType: "road",
        elementType: "labels",
        stylers: [
          { visibility: this.showRoads ? "on" : "off" }
        ]
      },
      {
        featureType: "road.highway",
        elementType: "geometry",
        stylers: [
          { color: "#f5a623" } // Orange highways
        ]
      },
      {
        featureType: "landscape",
        elementType: "geometry",
        stylers: [
          { color: "#f5f5f5" } // Light gray background
        ]
      }
    ];
  }

  clearMap(): void {
    this.directionsRenderers.forEach(renderer => renderer.setMap(null));
    this.markers.forEach(marker => marker.setMap(null));
    this.infoWindows.forEach(infoWindow => infoWindow.close());
    
    this.directionsRenderers = [];
    this.markers = [];
    this.infoWindows = [];
  }
}
