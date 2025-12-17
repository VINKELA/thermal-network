import { Component, Input, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { Building, BuildingType, LoadType } from '../../../@core/data/building';

@Component({
  selector: 'ngx-building',
  templateUrl: './building.component.html',
  styleUrls: ['./building.component.scss']
})
export class BuildingComponent implements OnInit {
  @Input() buildingId!: number;
  building: Building | undefined;

  // Map Settings
  center: google.maps.LatLngLiteral = { lat: 0, lng: 0 };
  zoom = 16; // High zoom for single building
  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    //mapTypeId: 'satellite', // Satellite view often looks better for single buildings
  };

  // UX Config: Building Types
  typeConfig: Record<BuildingType, { label: string; icon: string }> = {
    residential: { label: 'Residential', icon: 'home-outline' },
    commercial:  { label: 'Commercial',  icon: 'briefcase-outline' },
    industrial:  { label: 'Industrial',  icon: 'settings-2-outline' },
    public:      { label: 'Public',      icon: 'people-outline' },
    other:       { label: 'Other',       icon: 'question-mark-circle-outline' }
  };

  // UX Config: Load Types (Themes)
  loadConfig: Record<LoadType, { label: string; themeClass: string; icon: string }> = {
    heating_dominant: { label: 'Heating Dominant', themeClass: 'theme-heat', icon: 'fire' },
    cooling_dominant: { label: 'Cooling Dominant', themeClass: 'theme-cool', icon: 'snowflake' }
  };

  constructor(
    private api: RestApiService, 
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    // Handle Input or Route Param
    if (!this.buildingId) {
      this.route.paramMap.subscribe(params => {
        const id = params.get('id');
        if (id) {
          this.buildingId = Number(id);
          this.loadBuilding();
        }
      });
    } else {
      this.loadBuilding();
    }
  }

  loadBuilding() {
    this.api.get<Building>(`buildings/${this.buildingId}/`).subscribe(data => {
      this.building = data;
      
      // Center Map if coordinates exist
      // Note: Casting to any because TS interface might not have lat/long yet, but DB does
      const b = this.building as any; 
      if (b.latitude && b.longitude) {
        this.center = {
          lat: parseFloat(b.latitude),
          lng: parseFloat(b.longitude)
        };
      }
    });
  }

  goBack() {
    // Navigate back to the main map/list view
    this.router.navigate(['/pages/buildings']);
  }
}