import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { RestApiService } from '../../../@core/utils/rest-api.service';

@Component({
  selector: 'ngx-buildings',
  templateUrl: './buildings.component.html',
  styleUrls: ['./buildings.component.scss']
})
export class BuildingsComponent implements OnInit, OnDestroy {
  // Data State
  buildings: any[] = [];
  api = 'buildings/';
  isLoading = false;

  // Map Settings (Default: Toronto)
  center: google.maps.LatLngLiteral = { lat: 43.6532, lng: -79.3832 };
  zoom = 12;
  mapOptions: google.maps.MapOptions = {
    disableDefaultUI: false,
    zoomControl: true,
    scrollwheel: true,
  };

  // RxJS Subjects for Search & Cleanup
  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    private apiService: RestApiService,
    private router: Router 
  ) {}

  ngOnInit(): void {
    // 1. Load initial data
    this.fetchBuildings();

    // 2. Setup the Search Listener (Debouncing)
    this.searchSubject.pipe(
      debounceTime(400),        // Wait 400ms after the last keystroke
      distinctUntilChanged(),   // Ignore if the query is the same as before
      takeUntil(this.destroy$)  // Cleanup when component is destroyed
    ).subscribe(searchTerm => {
      this.fetchBuildings(searchTerm);
    });
  }

  /**
   * Fetches data from API.
   * If query is provided, it appends ?search=query
   */
 fetchBuildings(searchQuery: string = ''): void {
  this.isLoading = true;
  
  // This now matches your Django setup
  const url = searchQuery 
    ? `${this.api}?search=${encodeURIComponent(searchQuery)}` 
    : this.api;

  this.apiService.get(url).subscribe((data: any) => {
    this.buildings = data['results'] ? data['results'] : data;
    this.setDynamicCenter();
    this.isLoading = false;
  });
}

  // Triggered by the HTML input
  onSearch(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchSubject.next(target.value);
  }

  // Calculates the average center of all displayed buildings
  setDynamicCenter(): void {
    if (!this.buildings || this.buildings.length === 0) return;

    const total = this.buildings.reduce(
      (acc, building) => {
        // Ensure values are numbers (API might return strings)
        acc.lat += typeof building.latitude === 'string' ? parseFloat(building.latitude) : building.latitude;
        acc.lng += typeof building.longitude === 'string' ? parseFloat(building.longitude) : building.longitude;
        return acc;
      },
      { lat: 0, lng: 0 }
    );

    this.center = {
      lat: total.lat / this.buildings.length,
      lng: total.lng / this.buildings.length,
    };

    // Dynamic Zoom: Closer if fewer results
    this.zoom = this.buildings.length < 5 ? 14 : 12;
  }

  openBuildingDetails(buildingId: number): void {
    this.router.navigate(['pages/buildings', buildingId]);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}