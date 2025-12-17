import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { GoogleMap, MapInfoWindow, MapMarker } from '@angular/google-maps';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';


@Component({
selector: 'app-clusters',
templateUrl: './cluster.component.html',
styleUrls: ['./cluster.component.scss']
})
export class ClusterComponent implements OnInit {
@Input() clusterId!: number;
  cluster: any | undefined;
  
  // We assume the API returns the list of buildings in the cluster object
  // based on our previous serializer work (buildings = SerializerMethodField)
  buildings: any[] = []; 

  // Map Access
  @ViewChild(GoogleMap) map!: GoogleMap;
  @ViewChild(MapInfoWindow) infoWindow!: MapInfoWindow;
  selectedBuilding: any | null = null;

  // Map Settings
  center: google.maps.LatLngLiteral = { lat: 0, lng: 0 };
  zoom = 15;
  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    mapTypeId: 'roadmap',
    styles: [
      { featureType: 'poi', stylers: [{ visibility: 'off' }] } // Cleaner look
    ]
  };

  // Visualization: The Cluster Boundary
  circleOptions: google.maps.CircleOptions = {
    strokeColor: '#3366ff',
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: '#3366ff',
    fillOpacity: 0.15, // Light blue tint
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
      // Handle the different ways buildings might be returned (nested objects vs list)
      this.buildings = data.buildings || [];

      if (this.cluster?.latitude && this.cluster?.longitude) {
        this.center = { 
          lat: Number(this.cluster.latitude), 
          lng: Number(this.cluster.longitude) 
        };
      }
    });
  }

  // UX: Navigate to specific building details
  goToBuilding(id: number) {
    this.router.navigate(['/pages/buildings', id]);
  }

  goBack() {
    // Return to the parent algorithm run or network
    this.router.navigate(['/pages/optimization']); 
  }

  openBuildingInfo(marker: MapMarker, b: any) {
    this.selectedBuilding = b;
    this.infoWindow.open(marker);
  }
}