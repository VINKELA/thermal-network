import { Component, OnInit, ViewChild, ElementRef, NgZone, AfterViewInit } from '@angular/core';
import { NbToastrService } from '@nebular/theme';
import { RestApiService } from '../../@core/utils/rest-api.service';
import { GoogleMap } from '@angular/google-maps';

const WASTE_HEAT_OPTIONS = [
  { value: null, label: 'None / Unknown' },
  { value: 'data_centre', label: 'Data Centre' },
  { value: 'grocery_store', label: 'Grocery Store' },
  { value: 'cold_storage', label: 'Cold Storage' },
  { value: 'ice_arena', label: 'Ice Arena' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'space_cooling', label: 'Large Building (Space Cooling)' },
  { value: 'wastewater', label: 'Wastewater Plant' },
];

@Component({
  selector: 'ngx-map-importer',
  templateUrl: './map-importer.component.html',
  styleUrls: ['./map-importer.component.scss']
})
export class MapImporterComponent implements OnInit, AfterViewInit {

  @ViewChild('search') searchElementRef: ElementRef;
  @ViewChild(GoogleMap) mapComponent: GoogleMap;

  // MAP OPTIONS
  center: google.maps.LatLngLiteral = { lat: 43.2557, lng: -79.8711 };
  zoom = 13;
  mapOptions: google.maps.MapOptions = {
    mapTypeId: 'hybrid',
    scrollwheel: true,
    disableDefaultUI: false,
    zoomControl: true,
  };

  // UI STATE
  isScanning = false;
  isSaving = false;
  isCalculating = false;
  isClickMode = false;
  
  // DATA STATE
  selectedYear: number = 2024;
  availableModels: any[] = [];
  selectedModel: string = ''; 
  projects: any[] = [];
  selectedProjectId: number | null = null;
  foundBuildings: any[] = []; 
  
  // OPTIONS
  sourceOptions = WASTE_HEAT_OPTIONS;

  // TOOLS
  drawingManager: google.maps.drawing.DrawingManager;
  currentRectangle: google.maps.Rectangle | null = null;

  constructor(
    private api: RestApiService,
    private toastr: NbToastrService,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    this.loadProjects();
    this.fetchModels();
  }

  ngAfterViewInit() {
    if (this.mapComponent && this.mapComponent.googleMap) {
      this.initializeTools(this.mapComponent.googleMap);
    } else {
      setTimeout(() => {
        if (this.mapComponent && this.mapComponent.googleMap) {
          this.initializeTools(this.mapComponent.googleMap);
        }
      }, 1000);
    }
  }

  async fetchModels() {
    try {
      const models = await this.api.get<any[]>('projects/list_models/').toPromise();
      this.availableModels = models || [];
      if (this.availableModels.length > 0) {
        this.selectedModel = this.availableModels[0].id;
      }
    } catch (err) {
      this.toastr.warning('Could not load model list. Using default.');
    }
  }

  loadProjects() {
    this.api.get<any>('projects/').subscribe(data => {
      this.projects = (data && data.results) ? data.results : (Array.isArray(data) ? data : []);
    });
  }

  // --- MAP & TOOLS ---

  initializeTools(map: google.maps.Map) {
    this.initAutocomplete(map);
    this.initDrawingManager(map);
  }

  initAutocomplete(map: google.maps.Map) {
    const autocomplete = new google.maps.places.Autocomplete(this.searchElementRef.nativeElement);
    autocomplete.bindTo('bounds', map);
    autocomplete.addListener('place_changed', () => {
      this.ngZone.run(() => {
        const place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) return;
        if (place.geometry.viewport) map.fitBounds(place.geometry.viewport);
        else {
          map.setCenter(place.geometry.location);
          map.setZoom(17);
        }
      });
    });
  }

  initDrawingManager(map: google.maps.Map) {
    this.drawingManager = new google.maps.drawing.DrawingManager({
      drawingMode: google.maps.drawing.OverlayType.RECTANGLE,
      drawingControl: true,
      drawingControlOptions: {
        position: google.maps.ControlPosition.TOP_RIGHT,
        drawingModes: [google.maps.drawing.OverlayType.RECTANGLE],
      },
      rectangleOptions: {
        fillColor: '#3366ff',
        fillOpacity: 0.2,
        strokeWeight: 2,
        clickable: false,
        editable: true,
        zIndex: 1,
      },
    });

    this.drawingManager.setMap(map);

    google.maps.event.addListener(this.drawingManager, 'rectanglecomplete', (rectangle: any) => {
      // Remove old box if exists
      if (this.currentRectangle) {
        this.currentRectangle.setMap(null);
      }
      this.currentRectangle = rectangle;
      
      // Run scan
      this.ngZone.run(() => {
        this.scanArea(rectangle.getBounds(), map);
      });
      
      // Reset tool to avoid drawing multiple boxes
      this.drawingManager.setDrawingMode(null); 
    });
  }

  toggleMode() {
    this.isClickMode = !this.isClickMode;
    if (this.isClickMode) {
      this.toastr.info('Click Mode: Click any house on the map.');
      if (this.drawingManager) this.drawingManager.setDrawingMode(null);
    } else {
      this.toastr.info('Scan Mode: Draw a box.');
      if (this.drawingManager) this.drawingManager.setDrawingMode(google.maps.drawing.OverlayType.RECTANGLE);
    }
  }

  // --- LOGIC: CLICK & SCAN ---

  onMapClick(event: google.maps.MapMouseEvent) {
    if (!this.isClickMode || !event.latLng) return;

    const geocoder = new google.maps.Geocoder();
    this.toastr.primary('Fetching address...', 'Loading');

    geocoder.geocode({ location: event.latLng }, (results, status) => {
      this.ngZone.run(() => {
        if (status === 'OK' && results && results[0]) {
          const result = results[0];
          
          const house: any = {
            name: result.formatted_address.split(',')[0],
            lat: result.geometry.location.lat(),
            lng: result.geometry.location.lng(),
            address: result.formatted_address,
            place_id: result.place_id,
            selected: true,
            google_types: result.types,
            type: 'commercial',
            // Detect Waste Heat Source
            wasteHeatSource: this.detectWasteSource(result.types, result.formatted_address)
          };

          this.foundBuildings.push(house);
          this.toastr.success(`Added: ${house.name}`);
        } else {
          this.toastr.warning('Could not find address.');
        }
      });
    });
  }

  scanArea(bounds: google.maps.LatLngBounds, map: google.maps.Map) {
    const service = new google.maps.places.PlacesService(map);
    const request: any = { bounds: bounds, type: 'establishment' };

    this.foundBuildings = []; 
    this.isScanning = true;
    this.toastr.info('Scanning area...');

    service.nearbySearch(request, (results, status, pagination) => {
      this.ngZone.run(() => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          
          const newBuildings = results.map(place => ({
            name: place.name,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            address: place.vicinity,
            place_id: place.place_id,
            selected: true,
            google_types: place.types,
            // Detect Waste Heat Source
            wasteHeatSource: this.detectWasteSource(place.types, place.name)
          }));

          this.foundBuildings = [...this.foundBuildings, ...newBuildings];

          if (pagination && pagination.hasNextPage) {
            pagination.nextPage(); 
          } else {
            this.toastr.success(`Found ${this.foundBuildings.length} buildings.`);
            this.isScanning = false;
          }
        } else {
          if (this.foundBuildings.length === 0) this.toastr.warning('No buildings found.');
          this.isScanning = false;
        }
      });
    });
  }

  detectWasteSource(googleTypes: string[], name: string): string | null {
    if (!googleTypes || googleTypes.length === 0) return null;
    
    const types = googleTypes.join(' ').toLowerCase();
    const nameLower = (name || '').toLowerCase();

    if (types.includes('supermarket') || types.includes('grocery')) return 'grocery_store';
    
    if (types.includes('stadium') || types.includes('ice_skating_rink') || 
        nameLower.includes('arena') || nameLower.includes('rink')) {
      return 'ice_arena';
    }

    if (types.includes('restaurant') || types.includes('meal_takeaway')) return 'restaurant';

    if (types.includes('shopping_mall') || types.includes('department_store') || types.includes('hospital')) {
      return 'space_cooling';
    }
    
    return null;
  }

  removeBuilding(index: number) { this.foundBuildings.splice(index, 1); }

  // --- API CALLS ---

  async saveBuildings() {
    if (!this.selectedProjectId) { this.toastr.danger('Select a project.'); return; }
    
    const buildingsToSave = this.foundBuildings.filter(b => b.selected);
    if (buildingsToSave.length === 0) return;

    this.isSaving = true;
    this.toastr.info(`Saving ${buildingsToSave.length} buildings...`);

    let savedCount = 0;
    const mapInstance = this.mapComponent.googleMap;

    for (const b of buildingsToSave) {
      let fsa = null;
      // Fetch FSA if possible
      if (b.place_id && mapInstance) {
        const details = await this.getPlaceDetails(b.place_id, mapInstance);
        if (details && details.address_components) {
          const postalCode = details.address_components.find(c => c.types.includes('postal_code'));
          if (postalCode) fsa = postalCode.short_name.substring(0, 3);
        }
      }

      const payload = {
        project: this.selectedProjectId,
        name: b.name ? b.name.substring(0, 100) : 'Unknown',
        latitude: parseFloat(b.lat.toFixed(6)),
        longitude: parseFloat(b.lng.toFixed(6)),
        building_type: 'commercial',
        fsa: fsa, 
        google_types: b.google_types,
        waste_heat_source_type: b.wasteHeatSource 
      };

      try {
        await this.api.post(payload, 'buildings/').toPromise();
        savedCount++;
      } catch (err) {
        console.error('Save failed', err);
      }
    }

    this.isSaving = false;
    this.toastr.success(`Saved ${savedCount} buildings.`);
    if (savedCount > 0) {
      this.foundBuildings = [];
      if (this.currentRectangle) this.currentRectangle.setMap(null);
    }
  }

  getPlaceDetails(placeId: string, map: google.maps.Map): Promise<any> {
    const service = new google.maps.places.PlacesService(map);
    return new Promise((resolve) => {
      service.getDetails({ placeId: placeId, fields: ['address_components', 'types'] }, 
        (place, status) => { resolve(status === google.maps.places.PlacesServiceStatus.OK ? place : null); }
      );
    });
  }

  // --- SIMULATION TABS ---

  async generateProfiles() {
    if (!this.selectedProjectId) return;
    this.isCalculating = true;
    try {
      await this.api.post(
        { model_type: this.selectedModel, year: this.selectedYear },
        `projects/${this.selectedProjectId}/generate_profiles/`
      ).toPromise();
      this.toastr.success(`Started Demand Simulation for ${this.selectedYear}`);
    } catch (err) {
      this.toastr.danger('Simulation failed to start');
    } finally {
      this.isCalculating = false;
    }
  }

  async generateWasteHeat() {
    if (!this.selectedProjectId) {
      this.toastr.danger('Please select a project first.');
      return;
    }
    this.isCalculating = true;
    try {
      await this.api.post(
        { year: this.selectedYear },
        `projects/${this.selectedProjectId}/generate_waste_heat/`
      ).toPromise();
      this.toastr.success(`Started Waste Heat Analysis for ${this.selectedYear}`);
    } catch (err) {
      this.toastr.danger('Analysis failed to start');
    } finally {
      this.isCalculating = false;
    }
  }
}