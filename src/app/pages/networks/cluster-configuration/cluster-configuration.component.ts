import { Component, Input, OnInit, ViewChild, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { GoogleMap, MapInfoWindow, MapMarker } from '@angular/google-maps';
import { ActivatedRoute, Router } from '@angular/router';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { getConvexHull, Point } from '../../../@core/utils/convex-hull';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

// --- STYLE CONSTANTS ---
const STYLE_EXCESS = { strokeColor: '#00d68f', fillColor: '#00d68f' }; // Green (Source Heavy)
const STYLE_DEFICIT = { strokeColor: '#ff3d71', fillColor: '#ff3d71' }; // Red (Sink Heavy)
const STYLE_BALANCED = { strokeColor: '#3366ff', fillColor: '#3366ff' }; // Blue (Balanced/Default)

@Component({
  selector: 'ngx-cluster-configuration',
  templateUrl: './cluster-configuration.component.html',
  styleUrls: ['./cluster-configuration.component.scss']
})
export class ClusterConfigurationComponent implements OnInit, OnDestroy {
  @Input() configId!: number;
  configuration: any;
  
  @ViewChild(GoogleMap) map!: GoogleMap;
  @ViewChild(MapInfoWindow) infoWindow!: MapInfoWindow;

  center: google.maps.LatLngLiteral = { lat: 43.6532, lng: -79.3832 };
  zoom = 12;
  
  showBuildings = false; 
  selectedItem: any = null;
  
  // Toggle for visual representation (Enclosing Circle vs Standard Dot)
  useCircleRepresentation = false;

  private zoomSubject = new Subject<number>();
  private zoomSub!: Subscription;

  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    fullscreenControl: true,
    zoomControl: true,
    mapTypeId: 'roadmap',
    maxZoom: 20,
    minZoom: 3,
    styles: [
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'simplified' }] }
    ]
  };

  constructor(
    private api: RestApiService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Zoom Listener: Toggles 'showBuildings' based on zoom level
    this.zoomSub = this.zoomSubject.pipe(
      debounceTime(100),
      distinctUntilChanged()
    ).subscribe(z => {
      const shouldShow = z >= 14;
      if (this.showBuildings !== shouldShow) {
        this.showBuildings = shouldShow;
        this.cdr.detectChanges(); // Force update when zoom changes view mode
      }
    });

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

  ngOnDestroy() {
    this.zoomSub?.unsubscribe();
  }

  loadData() {
    this.api.get<any>(`cluster_configurations/${this.configId}/`).subscribe(data => {
      if (data.clusters && data.clusters.length > 0) {
        
        // Center map on the first cluster found
        const first = data.clusters[0];
        this.center = { lat: Number(first.latitude), lng: Number(first.longitude) };

        data.clusters.forEach((c: any) => {
          c.latitude = Number(c.latitude);
          c.longitude = Number(c.longitude);
          
          // Ensure radius exists for circles
          if (!c.effective_radius || c.effective_radius <= 0) {
            c.effective_radius = Math.max(100, Math.min((c.no_of_buildings || 1) * 40, 600));
          } else {
            c.effective_radius = Number(c.effective_radius);
          }

          if (c.buildings) {
            const points: Point[] = [];
            c.buildings.forEach((b: any) => {
              b.latitude = Number(b.latitude);
              b.longitude = Number(b.longitude);
              points.push({ lat: b.latitude, lng: b.longitude });
            });
            
            // Generate Convex Hull for Boundaries
            if (c.buildings.length >= 3) {
              c.boundaryPath = getConvexHull(points);
            } else if (c.buildings.length === 2) {
              c.polylinePath = points;
            }
          }

          // --- DYNAMIC STYLING FOR BOUNDARIES (Based on Balance Status) ---
          let style = STYLE_BALANCED; // Default Blue
          if (c.energy_balance_status === 'excess_heat') style = STYLE_EXCESS;   // Green
          else if (c.energy_balance_status === 'heat_deficit') style = STYLE_DEFICIT; // Red

          // Attach options to the cluster object for HTML to read
          c.dynamicPolygonOptions = {
            strokeColor: style.strokeColor, strokeOpacity: 0.8, strokeWeight: 2,
            fillColor: style.fillColor, fillOpacity: 0.15, clickable: false
          };

          c.dynamicPolylineOptions = {
            strokeColor: style.strokeColor, strokeOpacity: 0.8, strokeWeight: 2, clickable: false
          };
        });
      }
      this.configuration = data;
      setTimeout(() => this.fitBounds(), 100); 
    });
  }

  triggerVisualUpdate() {
    this.cdr.detectChanges();
    // Force array reference update to trigger *ngFor re-render if needed
    if (this.configuration && this.configuration.clusters) {
      this.configuration.clusters = [...this.configuration.clusters];
    }
  }

  fitBounds() {
    if (!this.map || !this.configuration?.clusters) return;
    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;
    this.configuration.clusters.forEach((c: any) => {
      if (c.latitude && c.longitude) {
        bounds.extend({ lat: c.latitude, lng: c.longitude });
        hasPoints = true;
      }
    });
    if (hasPoints) this.map.fitBounds(bounds);
  }

  onZoomChanged() {
    if (this.map) {
      const z = this.map.getZoom();
      if (z !== undefined) {
        this.zoom = z;
        this.zoomSubject.next(z);
      }
    }
  }
  
  // --- MARKER STYLES (BUILDINGS) ---
  /**
   * Returns Green for Sources and Red for Sinks.
   */
  getBuildingMarkerOptions(building: any): google.maps.MarkerOptions {
    const isResidential = building.building_type === 'RESIDENTIAL'; ;

    const color = isResidential ? '#ff3d71':'#00d68f' ; // Green : Red

    return {
      icon: { 
        path: google.maps.SymbolPath.CIRCLE, 
        scale: 5, // Visible dot size
        fillColor: color, 
        fillOpacity: 1, 
        strokeColor: '#ffffff', 
        strokeWeight: 1 
      },
      zIndex: 20, // Sit on top of polygons
      title: building.name || 'Building'
    };
  }

  // --- CLUSTER MARKER STYLES (OVERVIEW) ---
  getClusterMarkerOptions(c: any): google.maps.MarkerOptions {
    // Label Logic: Shows count
    const label: google.maps.MarkerLabel = {
      text: (c.buildings ? c.buildings.length : 0).toString(),
      color: '#ffffff',
      fontWeight: 'bold',
      fontSize: '13px'
    };

    // Determine Color based on Balance Status (Optional: Color the dot too!)
    let color = '#222b45'; // Default Dark Blue
    if (c.energy_balance_status === 'excess_heat') color = '#00d68f'; // Green
    else if (c.energy_balance_status === 'heat_deficit') color = '#ff3d71'; // Red
    else if (c.energy_balance_status === 'balanced') color = '#3366ff'; // Blue

    if (this.useCircleRepresentation) {
      // If using Enclosing Circle, hide the dot, just show label
      return {
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 }, 
        label: label,
        zIndex: 10
      };
    } else {
      // Standard Mode: Show colored dot with number
      return {
        icon: { 
          path: google.maps.SymbolPath.CIRCLE, scale: 12, 
          fillColor: color, fillOpacity: 1, 
          strokeColor: '#ffffff', strokeWeight: 2 
        },
        label: label,
        zIndex: 10
      };
    }
  }

  // --- CIRCLE STYLES (OVERVIEW TOGGLE) ---
  getDynamicCircleOptions(c: any): google.maps.CircleOptions {
    let color = '#3366ff';
    if (c.energy_balance_status === 'excess_heat') color = '#00d68f';
    if (c.energy_balance_status === 'heat_deficit') color = '#ff3d71';

    if (this.useCircleRepresentation) {
      // Solid Circle Mode
      return {
        strokeColor: color, strokeOpacity: 0.8, strokeWeight: 2,
        fillColor: color, fillOpacity: 0.35, clickable: true, zIndex: 1
      };
    } else {
      // Hidden/Ghost Mode (if unchecked)
      return {
        strokeColor: color, strokeOpacity: 0, strokeWeight: 0,
        fillColor: color, fillOpacity: 0, clickable: true, zIndex: 1
      };
    }
  }

  trackByClusterId(index: number, item: any): number { return item.id; }
  trackByBuildingId(index: number, item: any): number { return item.id; }

  openInfo(marker: MapMarker, item: any, type: 'cluster' | 'building') {
    this.selectedItem = { ...item, _type: type };
    this.infoWindow.open(marker);
  }

  selectClusterFromList(c: any) {
    this.center = { lat: c.latitude, lng: c.longitude };
    this.map.panTo(this.center);
    this.zoom = 16; // Auto-zoom to trigger detailed view
    this.showBuildings = true; 
  }

  goBack() {
    this.router.navigate(['/pages/optimization']);
  }
}