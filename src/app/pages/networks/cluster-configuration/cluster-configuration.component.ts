import { Component, Input, ViewChild } from '@angular/core';
import { GoogleMap, MapInfoWindow, MapMarker } from '@angular/google-maps';
import { ActivatedRoute, Router } from '@angular/router';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { getConvexHull, Point } from '../../../@core/utils/convex-hull';

@Component({
  selector: 'ngx-cluster-configuration',
  templateUrl: './cluster-configuration.component.html',
  styleUrls: ['./cluster-configuration.component.scss']
})
export class ClusterConfigurationComponent {
 @Input() configId!: number;
  configuration: any;
  moodSwitched = false;
  // MAP STATE
  private _map: GoogleMap | undefined;
  
  // Setter ensures we fit bounds exactly when the map is ready
  @ViewChild(GoogleMap) set map(mapInstance: GoogleMap) {
    this._map = mapInstance;
    if (this.configuration) {
      this.fitBounds();
    }
  }
  
  @ViewChild(MapInfoWindow) infoWindow!: MapInfoWindow;
  
  // Default Center (Backup) - Toronto
  center: google.maps.LatLngLiteral = { lat: 43.6532, lng: -79.3832 };
  zoom = 12;
  showBuildings = false; // Toggles based on zoom level
  
  selectedItem: any = null;

  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    mapTypeId: 'roadmap',
    styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }]
  };

  // VISUALIZATION STYLES
  // 1. High-Zoom: The precise Convex Hull Polygon
  polygonOptions: google.maps.PolygonOptions = {
    strokeColor: '#3366ff',
    strokeOpacity: 1.0,
    strokeWeight: 2,
    fillColor: '#3366ff',
    fillOpacity: 0.1,
    clickable: false
  };

  // 2. Low-Zoom: The General Radius Circle
  circleOptions: google.maps.CircleOptions = {
    strokeColor: '#3366ff',
    strokeOpacity: 0.6,
    strokeWeight: 1,
    fillColor: '#3366ff',
    fillOpacity: 0.1,
    clickable: true
  };

  // 3. Low-Zoom: The Center Marker (Black Dot)
  centerMarkerOptions: google.maps.MarkerOptions = {
    icon: { 
      path: google.maps.SymbolPath.CIRCLE, 
      scale: 6, 
      fillColor: '#000000', 
      fillOpacity: 1, 
      strokeColor: '#ffffff', 
      strokeWeight: 2 
    }
  };

  // 4. High-Zoom: The Building Marker (Red Dot)
  buildingMarkerOptions: google.maps.MarkerOptions = {
    icon: { 
      path: google.maps.SymbolPath.CIRCLE, 
      scale: 4, 
      fillColor: '#ff3d71', 
      fillOpacity: 1, 
      strokeColor: '#ffffff', 
      strokeWeight: 1 
    }
  };

  constructor(
    private api: RestApiService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (!this.configId) {
      this.route.paramMap.subscribe(params => {
        const id = params.get('id');
        if (id) {
          this.configId = Number(id);
          this.loadData();
        }
      });
    } else {
      this.loadData();
    }
  }

  loadData() {
    this.api.get<any>(`cluster_configurations/${this.configId}/`).subscribe(data => {
      
      if (data.clusters && data.clusters.length > 0) {
        
        // 1. Set Backup Center immediately to the first cluster
        // This ensures the map jumps to the right area even if fitBounds animates slowly
        const first = data.clusters[0];
        this.center = { 
          lat: Number(first.latitude), 
          lng: Number(first.longitude) 
        };

        // 2. Data Cleaning & Calculations
        data.clusters.forEach((c: any) => {
          // Convert strings to numbers
          c.latitude = Number(c.latitude);
          c.longitude = Number(c.longitude);

          // FIX: Handle Null Radius (Default to 50m per building, or min 100m)
          if (!c.effective_radius || c.effective_radius <= 0) {
            const estimated = (c.no_of_buildings || 1) * 50;
            c.effective_radius = Math.max(100, Math.min(estimated, 800));
          } else {
            c.effective_radius = Number(c.effective_radius);
          }

          // Handle Buildings
          if (c.buildings) {
            c.buildings.forEach((b: any) => {
              b.latitude = Number(b.latitude);
              b.longitude = Number(b.longitude);
            });
            
            // Calculate Hull if API didn't provide boundaryPath
            if ((!c.boundaryPath || c.boundaryPath.length === 0) && c.buildings.length >= 3) {
              const points: Point[] = c.buildings.map((b: any) => ({
                lat: b.latitude, 
                lng: b.longitude
              }));
              c.boundaryPath = getConvexHull(points);
            }
          }
        });
      }

      this.configuration = data;
      this.fitBounds();
    });
  }

  fitBounds() {
    if (!this._map || !this.configuration?.clusters) return;

    const bounds = new google.maps.LatLngBounds();
    let validPoints = 0;

    this.configuration.clusters.forEach((c: any) => {
      if (!isNaN(c.latitude) && !isNaN(c.longitude)) {
        bounds.extend({ lat: c.latitude, lng: c.longitude });
        validPoints++;
      }
    });

    if (validPoints > 0) {
      // Small timeout allows the map directive to fully init
      setTimeout(() => this._map!.fitBounds(bounds), 50);
    }
  }

  onZoomChanged() {
    if (this._map) {
      const zoom = this._map.getZoom();
      const isHighZoom = (zoom || 12) >= 14;
      if (this.moodSwitched) 
      {
        this.moodSwitched = false;
        return;
      }
      // Threshold: Zoom level 14 switches mode
      if (this.showBuildings !== isHighZoom) {
        this.showBuildings = isHighZoom;
        this.moodSwitched = isHighZoom;
      }
    }
  }

  // --- INTERACTION ---
  openInfo(marker: MapMarker, item: any, type: 'cluster' | 'building') {
    this.selectedItem = { ...item, _type: type };
    this.infoWindow.open(marker);
  }

  selectClusterFromList(c: any) {
    // Zoom in to the specific cluster
    this.center = { lat: c.latitude, lng: c.longitude };
    this.zoom = 15; // High enough to trigger building view
  }

  goBack() {
    this.router.navigate(['/pages/optimization']);
  } 
}
