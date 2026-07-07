import {
  AfterContentInit,
  ContentChildren,
  Directive,
  Host,
  OnDestroy,
  Optional,
  QueryList,
} from '@angular/core';
import { GoogleMap, MapMarker, MapPolyline } from '@angular/google-maps';
import { Subscription } from 'rxjs';

@Directive({
  selector: 'google-map',
})
export class MapFitViewDirective implements AfterContentInit, OnDestroy {
  @ContentChildren(MapMarker, { descendants: true }) private markers?: QueryList<MapMarker>;
  @ContentChildren(MapPolyline, { descendants: true }) private polylines?: QueryList<MapPolyline>;

  private changesSubscription = new Subscription();
  private fitTimer?: number;
  private lastFitSignature = '';
  private retryCount = 0;

  private readonly maxZoom = 18;
  private readonly padding = 44;
  private readonly maxRetries = 24;

  constructor(@Optional() @Host() private readonly googleMap?: GoogleMap) {}

  ngAfterContentInit(): void {
    this.changesSubscription.add(this.markers?.changes.subscribe(() => this.scheduleFit(true)));
    this.changesSubscription.add(this.polylines?.changes.subscribe(() => this.scheduleFit(true)));
    this.scheduleFit(true);
  }

  ngOnDestroy(): void {
    this.changesSubscription.unsubscribe();

    if (this.fitTimer) {
      window.clearTimeout(this.fitTimer);
    }
  }

  private scheduleFit(resetRetries = false): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (resetRetries) {
      this.retryCount = 0;
    }

    if (this.fitTimer) {
      window.clearTimeout(this.fitTimer);
    }

    this.fitTimer = window.setTimeout(() => this.fitToVisibleGeometry(), 180);
  }

  private fitToVisibleGeometry(): void {
    const map = this.googleMap?.googleMap;

    if (!map || typeof google === 'undefined') {
      this.retryFit();
      return;
    }

    const points = this.collectVisiblePoints();

    if (!points.length) {
      this.retryFit();
      return;
    }

    const signature = this.createSignature(points);

    if (signature === this.lastFitSignature) {
      return;
    }

    this.lastFitSignature = signature;

    if (points.length === 1 || this.arePointsEffectivelySame(points)) {
      const target = points[0];
      map.panTo(target);
      map.setZoom(this.maxZoom);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    points.forEach((point) => bounds.extend(point));

    this.googleMap.fitBounds(bounds, this.padding);
    this.clampZoomAfterFit(map);
  }

  private retryFit(): void {
    if (this.retryCount >= this.maxRetries) {
      return;
    }

    this.retryCount += 1;
    this.scheduleFit(false);
  }

  private collectVisiblePoints(): google.maps.LatLngLiteral[] {
    return [
      ...this.collectMarkerPoints(),
      ...this.collectPolylinePoints(),
    ].filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  }

  private collectMarkerPoints(): google.maps.LatLngLiteral[] {
    return (this.markers?.toArray() || [])
      .filter((marker) => this.safeCall(() => marker.getVisible()) !== false)
      .map((marker) => this.toLiteral(this.safeCall(() => marker.getPosition())))
      .filter((point): point is google.maps.LatLngLiteral => !!point);
  }

  private collectPolylinePoints(): google.maps.LatLngLiteral[] {
    const points: google.maps.LatLngLiteral[] = [];

    (this.polylines?.toArray() || []).forEach((polyline) => {
      if (this.safeCall(() => polyline.getVisible()) === false) {
        return;
      }

      const path = this.safeCall(() => polyline.getPath());

      if (!path) {
        return;
      }

      path.getArray().forEach((point) => {
        const literal = this.toLiteral(point);
        if (literal) {
          points.push(literal);
        }
      });
    });

    return points;
  }

  private toLiteral(
    value: google.maps.LatLng | google.maps.LatLngLiteral | null | undefined,
  ): google.maps.LatLngLiteral | null {
    if (!value) {
      return null;
    }

    const lat = typeof value.lat === 'function' ? value.lat() : Number(value.lat);
    const lng = typeof value.lng === 'function' ? value.lng() : Number(value.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }

    return { lat, lng };
  }

  private arePointsEffectivelySame(points: google.maps.LatLngLiteral[]): boolean {
    const first = points[0];

    return points.every((point) =>
      Math.abs(point.lat - first.lat) < 0.00001 &&
      Math.abs(point.lng - first.lng) < 0.00001,
    );
  }

  private createSignature(points: google.maps.LatLngLiteral[]): string {
    return points
      .map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`)
      .sort()
      .join('|');
  }

  private clampZoomAfterFit(map: google.maps.Map): void {
    google.maps.event.addListenerOnce(map, 'idle', () => {
      const zoom = map.getZoom();

      if (typeof zoom === 'number' && zoom > this.maxZoom) {
        map.setZoom(this.maxZoom);
      }
    });
  }

  private safeCall<T>(callback: () => T): T | null {
    try {
      return callback();
    } catch (_) {
      return null;
    }
  }
}
