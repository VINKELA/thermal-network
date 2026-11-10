import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { GoogleMap, MapInfoWindow, MapMarker } from '@angular/google-maps';
import { NbToastrService } from '@nebular/theme';
import { Subscription, timer } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { BackgroundOperation, BackgroundOperationService } from '../../../@core/utils/background-operation.service';

@Component({
  selector: 'ngx-network-evolution',
  templateUrl: './network-evolution.component.html',
  styleUrls: ['./network-evolution.component.scss'],
})
export class NetworkEvolutionComponent implements OnInit, OnDestroy {
  @ViewChild(GoogleMap) map?: GoogleMap;
  @ViewChild(MapInfoWindow) infoWindow?: MapInfoWindow;

  networks: any[] = [];
  selectedNetworkId: number | null = null;
  maxDistanceM = 120;
  tagFilter = '';
  minHeatKw: number | null = null;
  outputName = '';

  preview: any = null;
  routes: any[] = [];
  candidates: any[] = [];
  selectedCandidate: any = null;
  isLoadingNetworks = false;
  isPreviewing = false;
  isCreating = false;
  errorMessage = '';
  creationTaskId = '';
  taskStatus = '';
  taskMessage = '';
  private taskPolling?: Subscription;
  activeOperations: BackgroundOperation[] = [];

  center: google.maps.LatLngLiteral = { lat: 43.6532, lng: -79.3832 };
  zoom = 12;
  mapOptions: google.maps.MapOptions = {
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    clickableIcons: false,
    styles: [
      { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'off' }] },
      { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      { featureType: 'administrative', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    ],
  };

  constructor(
    private http: HttpClient,
    private router: Router,
    private toastr: NbToastrService,
    private operations: BackgroundOperationService,
  ) {}

  ngOnInit(): void {
    this.loadNetworks();
    this.restoreActiveOperations();
  }

  ngOnDestroy(): void {
    this.stopTaskPolling();
  }

  get acceptedCandidates(): any[] {
    return this.candidates.filter(candidate => candidate.accepted);
  }

  get rejectedCandidates(): any[] {
    return this.candidates.filter(candidate => !candidate.accepted);
  }

  get selectedNetwork(): any {
    return this.networks.find(network => Number(network.id) === Number(this.selectedNetworkId));
  }

  loadNetworks(): void {
    this.isLoadingNetworks = true;
    this.http.get<any>(`${environment.appUrl}/networks/?limit=500`).subscribe({
      next: (res) => {
        const rows = res?.results || res || [];
        this.networks = rows.filter((network: any) => Number(network.route_count || 0) > 0);
        if (!this.selectedNetworkId && this.networks.length) {
          this.selectedNetworkId = this.networks[0].id;
        }
        this.isLoadingNetworks = false;
      },
      error: () => {
        this.errorMessage = 'Networks could not be loaded.';
        this.isLoadingNetworks = false;
      },
    });
  }

  previewExpansion(): void {
    if (!this.selectedNetworkId) return;
    this.isPreviewing = true;
    this.errorMessage = '';
    this.http.post<any>(
      `${environment.appUrl}/networks/${this.selectedNetworkId}/expansion-candidates/`,
      this.requestPayload(),
    ).subscribe({
      next: (preview) => {
        this.preview = preview;
        this.routes = (preview.routes || []).map((route: any) => ({
          ...route,
          lineOptions: this.routeLineOptions(route),
          haloOptions: this.routeHaloOptions(route),
        }));
        this.candidates = (preview.candidates || []).map((candidate: any) => ({
          ...candidate,
          servicePath: this.servicePath(candidate),
          markerOptions: this.candidateMarkerOptions(candidate),
          serviceOptions: this.serviceLineOptions(candidate),
          serviceHaloOptions: this.serviceHaloOptions(candidate),
        }));
        this.outputName = this.outputName || `${preview.source_network?.name || 'Network'} - route infill`;
        this.fitBounds();
        this.isPreviewing = false;
      },
      error: (err) => {
        this.errorMessage = err?.error?.error || 'Expansion preview failed.';
        this.preview = null;
        this.routes = [];
        this.candidates = [];
        this.isPreviewing = false;
      },
    });
  }

  createExpandedNetwork(): void {
    if (!this.selectedNetworkId || !this.acceptedCandidates.length) return;
    this.stopTaskPolling();
    this.isCreating = true;
    this.errorMessage = '';
    this.creationTaskId = '';
    this.taskStatus = 'QUEUED';
    this.taskMessage = 'Queuing network evolution...';
    this.http.post<any>(
      `${environment.appUrl}/networks/${this.selectedNetworkId}/expand-from-routes/`,
      this.requestPayload(),
    ).subscribe({
      next: (result) => {
        if (result?.task_id) {
          this.creationTaskId = result.task_id;
          this.taskStatus = result.status || 'PENDING';
          this.taskMessage = result.message || 'Network evolution is running in the background.';
          this.operations.track({
            taskId: result.task_id,
            type: 'network-evolution',
            label: this.outputName || `${this.selectedNetwork?.name || 'Network'} route infill`,
            status: this.taskStatus,
            message: this.taskMessage,
            sourceId: this.selectedNetworkId || undefined,
          });
          this.restoreActiveOperations();
          this.startTaskPolling();
          return;
        }

        this.isCreating = false;
        if (result?.network_id) {
          this.toastr.success('Expanded network created.', 'Network Evolution');
          this.router.navigate(['/pages/networks', result.network_id]);
        }
      },
      error: (err) => {
        this.errorMessage = err?.error?.error || 'Could not create the expanded network.';
        this.isCreating = false;
      },
    });
  }

  private startTaskPolling(): void {
    if (this.taskPolling) return;
    this.taskPolling = timer(0, 2500).subscribe(() => {
      this.activeOperations.forEach(operation => this.pollTask(operation.taskId));
    });
  }

  private pollTask(taskId: string): void {
    this.http.get<any>(`${environment.appUrl}/tasks/${taskId}/status/`).subscribe({
      next: (response) => this.handleTaskStatus(response),
      error: () => {
        this.operations.update(taskId, {
          status: 'PENDING',
          message: 'Could not refresh task status. Will retry shortly.',
        });
        this.restoreActiveOperations();
      },
    });
  }

  private handleTaskStatus(response: any): void {
    const state = response?.status || response?.state || 'PENDING';
    const taskId = response?.task_id || this.creationTaskId;
    this.taskStatus = state;
    this.taskMessage = response?.message || response?.meta?.message || this.defaultTaskMessage(state);
    if (taskId) {
      this.operations.update(taskId, {
        status: state,
        message: this.taskMessage,
      });
    }

    if (state === 'SUCCESS') {
      const result = response?.result || {};

      if (result.status === 'failed') {
        this.errorMessage = result.error || 'Network evolution failed.';
        this.toastr.danger(this.errorMessage, 'Network Evolution');
        if (taskId) this.operations.remove(taskId);
        this.restoreActiveOperations();
        return;
      }

      if (result.network_id) {
        this.toastr.success(result.message || 'Expanded network created.', 'Network Evolution');
        if (taskId) {
          this.operations.remove(taskId);
        }
        this.restoreActiveOperations();
        if (!this.creationTaskId || taskId === this.creationTaskId) {
          this.router.navigate(['/pages/networks', result.network_id]);
        }
        return;
      }

      this.errorMessage = 'Network evolution finished, but no output network was returned.';
      if (taskId) this.operations.remove(taskId);
      this.restoreActiveOperations();
      return;
    }

    if (state === 'FAILURE') {
      this.errorMessage = response?.error || 'Network evolution failed.';
      this.toastr.danger(this.errorMessage, 'Network Evolution');
      if (taskId) this.operations.remove(taskId);
      this.restoreActiveOperations();
    }
  }

  private defaultTaskMessage(state: string): string {
    if (state === 'PENDING') return 'Waiting for a Celery worker to pick up the job.';
    if (state === 'PROGRESS' || state === 'STARTED') return 'Creating routed service connections in the background.';
    return 'Network evolution is running.';
  }

  private stopTaskPolling(): void {
    this.taskPolling?.unsubscribe();
    this.taskPolling = undefined;
  }

  private restoreActiveOperations(): void {
    this.activeOperations = this.operations.active('network-evolution');
    this.isCreating = this.activeOperations.length > 0;
    if (this.activeOperations.length) {
      this.taskStatus = this.activeOperations[0].status;
      this.taskMessage = this.activeOperations[0].message || this.defaultTaskMessage(this.activeOperations[0].status);
      this.startTaskPolling();
    } else {
      this.stopTaskPolling();
      this.creationTaskId = '';
      this.taskStatus = '';
      this.taskMessage = '';
      this.isCreating = false;
    }
  }

  openCandidate(marker: MapMarker, candidate: any): void {
    this.selectedCandidate = candidate;
    this.infoWindow?.open(marker);
  }

  private requestPayload(): any {
    return {
      name: this.outputName,
      max_distance_m: this.maxDistanceM,
      tags: this.tagFilter ? [this.tagFilter] : [],
      min_heat_kw: this.minHeatKw,
      limit: 1000,
    };
  }

  scoreWeightLabel(key: string): string {
    return String(key || '').replace(/_/g, ' ');
  }

  private routeLineOptions(route: any): google.maps.PolylineOptions {
    const isSupply = route.route_type === 'supply';
    const isService = route.route_type === 'service';
    return {
      strokeColor: isSupply ? '#8a0037' : (isService ? '#0f766e' : '#f97316'),
      strokeOpacity: isSupply ? 0.94 : 0.76,
      strokeWeight: isSupply ? 6 : 4,
      clickable: false,
      zIndex: isSupply ? 7 : 5,
    };
  }

  private routeHaloOptions(route: any): google.maps.PolylineOptions {
    const isSupply = route.route_type === 'supply';
    return {
      strokeColor: '#111827',
      strokeOpacity: isSupply ? 0.18 : 0.12,
      strokeWeight: isSupply ? 12 : 8,
      clickable: false,
      zIndex: isSupply ? 6 : 4,
    };
  }

  private servicePath(candidate: any): google.maps.LatLngLiteral[] {
    const building = candidate.building || {};
    const snap = candidate.snap_point || {};
    const start = { lat: Number(building.latitude), lng: Number(building.longitude) };
    const end = { lat: Number(snap.lat), lng: Number(snap.lng) };
    return [start, end].filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  }

  private serviceLineOptions(candidate: any): google.maps.PolylineOptions {
    return {
      strokeColor: candidate.accepted ? '#16a34a' : '#94a3b8',
      strokeOpacity: candidate.accepted ? 0.9 : 0.34,
      strokeWeight: candidate.accepted ? 3.5 : 2,
      clickable: false,
      zIndex: candidate.accepted ? 12 : 2,
    };
  }

  private serviceHaloOptions(candidate: any): google.maps.PolylineOptions {
    return {
      strokeColor: '#111827',
      strokeOpacity: candidate.accepted ? 0.13 : 0,
      strokeWeight: 7,
      clickable: false,
      zIndex: 11,
    };
  }

  private candidateMarkerOptions(candidate: any): google.maps.MarkerOptions {
    const demand = Number(candidate.building?.heating_demand || 0);
    const accepted = candidate.accepted;
    const size = accepted ? 28 : 20;
    const icon: any = {
      url: this.markerSvg(accepted ? '#16a34a' : '#94a3b8', accepted ? '#052e16' : '#334155', demand),
    };
    if (typeof google !== 'undefined') {
      icon.scaledSize = new google.maps.Size(size, Math.round(size * 0.72));
      icon.anchor = new google.maps.Point(Math.round(size / 2), Math.round(size * 0.36));
    }
    return {
      title: `${candidate.building?.name || 'Building'} - ${Math.round(candidate.distance_to_route_m)} m from route`,
      icon,
      optimized: true,
      zIndex: accepted ? 40 : 20,
    };
  }

  private markerSvg(fill: string, stroke: string, demand: number): string {
    const opacity = demand > 0 ? 1 : 0.82;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="32" viewBox="0 0 48 32">
        <rect x="5" y="7" width="38" height="20" rx="2" fill="#111827" opacity="0.18"/>
        <rect x="4" y="5" width="38" height="20" rx="2" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="3"/>
        <path d="M10 11h26M10 17h18" stroke="#fff7ed" stroke-width="2.4" stroke-linecap="round" opacity="0.72"/>
      </svg>
    `;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
  }

  private fitBounds(): void {
    if (typeof google === 'undefined') return;
    const bounds = new google.maps.LatLngBounds();
    let hasPoint = false;
    this.routes.forEach(route => (route.path || []).forEach((point: any) => {
      if (Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))) {
        bounds.extend({ lat: Number(point.lat), lng: Number(point.lng) });
        hasPoint = true;
      }
    }));
    this.candidates.forEach(candidate => {
      const building = candidate.building || {};
      if (Number.isFinite(Number(building.latitude)) && Number.isFinite(Number(building.longitude))) {
        bounds.extend({ lat: Number(building.latitude), lng: Number(building.longitude) });
        hasPoint = true;
      }
    });
    if (!hasPoint) return;
    setTimeout(() => this.map?.fitBounds(bounds), 100);
  }
}
