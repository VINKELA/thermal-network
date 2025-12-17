import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GoogleMap, MapInfoWindow, MapMarker } from '@angular/google-maps';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { getConvexHull, Point } from '../../../@core/utils/convex-hull';
import { getDistanceMeters } from '../../../@core/utils/geo-utils';
type BoundaryType = 'hull' | 'circle' | 'none';
@Component({
  selector: 'ngx-cluster5',
  templateUrl: './cluster5.component.html',
  styleUrls: ['./cluster5.component.scss']
})
export class Cluster5Component {
@Input() clusterId!: number;
  cluster: any;
  buildings: any[] = [];
  
  // VISUALIZATION STATE
  boundaryType: BoundaryType = 'circle'; // Default safely to circle
  boundaryPath: Point[] = [];
  
  // UI STATE
  isHullAvailable = false; // Controls button state

  // MAP STATE
  @ViewChild(GoogleMap) map!: GoogleMap;
  @ViewChild(MapInfoWindow) infoWindow!: MapInfoWindow;
  selectedBuilding: any = null;

  center: google.maps.LatLngLiteral = { lat: 0, lng: 0 };
  zoom = 15;

  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    mapTypeId: 'roadmap',
    styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }]
  };

  // STYLES
  hullOptions: google.maps.PolygonOptions = {
    strokeColor: '#3366ff',
    strokeOpacity: 1.0,
    strokeWeight: 2,
    fillColor: '#3366ff',
    fillOpacity: 0.15,
  };

  circleOptions: google.maps.CircleOptions = {
    strokeColor: '#00d68f', 
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: '#00d68f',
    fillOpacity: 0.1,
  };

  constructor(
    private api: RestApiService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (!this.clusterId) {
      this.route.paramMap.subscribe(params => {
        const id = params.get('id');
        if (id) {
          this.clusterId = Number(id);
          this.loadData();
        }
      });
    } else {
      this.loadData();
    }
  }

  loadData() {
    this.api.get<any>(`clusters/${this.clusterId}/`).subscribe(data => {
      this.cluster = data;
      this.buildings = data.buildings || [];

      // 1. Coordinate Cleaning for Center
      if (this.cluster.latitude) {
        this.center = { 
          lat: Number(this.cluster.latitude), 
          lng: Number(this.cluster.longitude) 
        };
      }

      // 2. Process Buildings & Calculate Boundaries
      if (this.buildings.length > 0) {
        const points: Point[] = [];
        let maxDistance = 0;
        
        this.buildings.forEach(b => {
          // Clean Building Coords
          b.latitude = Number(b.latitude);
          b.longitude = Number(b.longitude);
          points.push({ lat: b.latitude, lng: b.longitude });

          // FIX: Calculate distance from center to find the furthest building
          const dist = getDistanceMeters(
            this.center.lat, this.center.lng, 
            b.latitude, b.longitude
          );
          if (dist > maxDistance) {
            maxDistance = dist;
          }
        });

        // FIX: Radius = Max Distance + 10% Buffer (padding)
        // Set minimum of 50m to ensure visibility
        this.cluster.effective_radius = Math.max(50, maxDistance * 1.1);

        // FIX: Hull Availability Logic
        if (points.length >= 3) {
          this.boundaryPath = getConvexHull(points);
          this.isHullAvailable = true;
          // Optional: Switch to hull automatically if valid
          this.boundaryType = 'hull'; 
        } else {
          this.isHullAvailable = false;
          this.boundaryType = 'circle'; // Force circle if hull is impossible
        }
      } else {
        // Fallback if no buildings
        this.cluster.effective_radius = 100;
        this.isHullAvailable = false;
      }
    });
  }

  setBoundary(type: BoundaryType) {
    // Prevent selecting hull if disabled
    if (type === 'hull' && !this.isHullAvailable) return;
    this.boundaryType = type;
  }

  goToBuilding(id: number) {
    this.router.navigate(['/pages/buildings', id]);
  }

  openInfo(marker: MapMarker, b: any) {
    this.selectedBuilding = b;
    this.infoWindow.open(marker);
  }

  goBack() {
    this.router.navigate(['/pages/optimization']);
  }
}
