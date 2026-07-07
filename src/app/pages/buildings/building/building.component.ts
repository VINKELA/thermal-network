import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { RestApiService } from '../../../@core/utils/rest-api.service';
import { Building, BuildingType, LoadType } from '../../../@core/data/building';
import { ProjectContextService } from '../../../@core/utils/project-context.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'ngx-building',
  templateUrl: './building.component.html',
  styleUrls: ['./building.component.scss']
})
export class BuildingComponent implements OnInit, OnDestroy {
  @Input() buildingId!: number;
  building: Building | undefined;
  isLoading = false;
  notFoundMessage = '';
  private destroy$ = new Subject<void>();

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
    private route: ActivatedRoute,
    private projectContext: ProjectContextService
  ) {}

  ngOnInit(): void {
    // Handle Input or Route Param
    if (!this.buildingId) {
      this.route.paramMap
        .pipe(takeUntil(this.destroy$))
        .subscribe(params => {
          const id = params.get('id');
          if (id) {
            this.buildingId = Number(id);
            this.loadBuilding();
          }
        });
    } else {
      this.loadBuilding();
    }

    this.projectContext.selectedProject$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.buildingId) {
          this.loadBuilding();
        }
      });
  }

  loadBuilding() {
    this.isLoading = true;
    this.notFoundMessage = '';

    this.api.get<Building>(`buildings/${this.buildingId}/`).pipe(
      takeUntil(this.destroy$)
    ).subscribe(data => {
      this.isLoading = false;
      if (!data || !(data as any).id) {
        this.building = undefined;
        this.notFoundMessage = 'Building not found.';
        return;
      }

      const selectedProjectId = this.projectContext.selectedProjectId;
      if (selectedProjectId && this.projectIdForBuilding(data) !== selectedProjectId) {
        this.building = undefined;
        this.notFoundMessage = 'This building is outside the selected project.';
        return;
      }

      this.building = data;
      
      // Center Map if coordinates exist
      // Note: Casting to any because TS interface might not have lat/long yet, but DB does
      const b = this.building as any; 
      if (b.latitude !== null && b.latitude !== undefined && b.longitude !== null && b.longitude !== undefined) {
        this.center = {
          lat: parseFloat(b.latitude),
          lng: parseFloat(b.longitude)
        };
      }
    }, () => {
      this.isLoading = false;
      this.building = undefined;
      this.notFoundMessage = 'Building not found or unavailable for the selected project.';
    });
  }

  get buildingType(): BuildingType {
    return this.building?.building_type && this.typeConfig[this.building.building_type]
      ? this.building.building_type
      : 'other';
  }

  get loadType(): LoadType {
    const rawLoadType = String(this.building?.load_type || '').toLowerCase();
    if (rawLoadType.includes('cooling')) return 'cooling_dominant';
    if (rawLoadType.includes('heating')) return 'heating_dominant';

    return this.building?.load_type && this.loadConfig[this.building.load_type]
      ? this.building.load_type
      : 'heating_dominant';
  }

  goBack() {
    // Navigate back to the main map/list view
    this.router.navigate(['/pages/buildings']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private projectIdForBuilding(building: Building): number | null {
    const project = (building as any).project;
    if (project && typeof project === 'object') {
      return Number(project.id || project.pk) || null;
    }

    return Number(project) || null;
  }
}
