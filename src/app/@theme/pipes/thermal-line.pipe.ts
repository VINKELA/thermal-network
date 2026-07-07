import { Pipe, PipeTransform } from '@angular/core';

type ThermalLineLayer = 'main' | 'route' | 'edge' | 'pipe' | 'halo' | 'shadow' | 'selected' | 'comparison';

interface ThermalLineContext {
  color?: string;
  selected?: boolean;
  zoom?: number;
  index?: number;
  clickable?: boolean;
}

@Pipe({
  name: 'thermalLine',
  pure: false,
})
export class ThermalLinePipe implements PipeTransform {
  private readonly hiddenOptions: google.maps.PolylineOptions = { visible: false };
  private readonly optionsCache = new Map<string, google.maps.PolylineOptions>();

  transform(
    item: any,
    layer: ThermalLineLayer = 'main',
    context?: ThermalLineContext | string | number | boolean,
    index?: number,
  ): google.maps.PolylineOptions {
    if (!item) {
      return this.hiddenOptions;
    }

    const ctx = this.normalizeContext(context, index);
    const role = this.resolveRole(item, layer);
    const selected = layer === 'selected' || ctx.selected;
    const base = this.baseVisual(item, role, ctx);
    const cacheKey = this.cacheKey(item, layer, ctx, role, selected, base);
    const cached = this.optionsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const options = this.buildOptions(item, layer, role, selected, base, ctx);
    this.optionsCache.set(cacheKey, options);
    return options;
  }

  private buildOptions(
    item: any,
    layer: ThermalLineLayer,
    role: string,
    selected: boolean,
    base: { color: string; weight: number; opacity: number; zIndex: number },
    ctx: ThermalLineContext,
  ): google.maps.PolylineOptions {
    if (layer === 'halo' || layer === 'shadow') {
      return {
        strokeColor: '#111827',
        strokeOpacity: layer === 'shadow' ? 0.18 : (this.isShared(item) ? 0.3 : 0.24),
        strokeWeight: base.weight + (role === 'pipe' ? 4 : 5),
        clickable: false,
        geodesic: false,
        zIndex: Math.max(0, base.zIndex - 1),
      };
    }

    const color = selected && !ctx.color ? '#0891b2' : base.color;
    const weight = selected ? Math.max(base.weight + 2, 7) : base.weight;
    const isFallbackRoute = role === 'pipe' && !this.hasRouteGeometry(item);

    const options: google.maps.PolylineOptions = {
      strokeColor: color,
      strokeOpacity: isFallbackRoute ? Math.min(base.opacity, 0.72) : base.opacity,
      strokeWeight: weight,
      clickable: ctx.clickable ?? true,
      geodesic: false,
      zIndex: selected ? 1000 : base.zIndex,
    };

    if (this.isMobileEdge(item) || isFallbackRoute) {
      options.strokeOpacity = isFallbackRoute ? 0.18 : 0;
      options.icons = [{
        icon: {
          path: 'M 0,-1 0,1',
          strokeOpacity: isFallbackRoute ? 0.85 : 1,
          strokeColor: color,
          scale: isFallbackRoute ? 2 : 3,
        },
        offset: '0',
        repeat: isFallbackRoute ? '16px' : '20px',
      }];
    }

    return options;
  }

  private baseVisual(item: any, role: string, ctx: ThermalLineContext) {
    if (ctx.color) {
      return {
        color: ctx.color,
        weight: role === 'pipe' ? this.pipeWeight(item, ctx.zoom) : 4,
        opacity: 0.72,
        zIndex: 200 - (ctx.index || 0),
      };
    }

    if (role === 'pipe') {
      const diameter = Number(item?.diameter_m || 0.02);
      return {
        color: this.pipeColor(item),
        weight: this.pipeWeight(item, ctx.zoom),
        opacity: this.hasRouteGeometry(item) ? 0.92 : 0.7,
        zIndex: Math.floor(diameter * 10000),
      };
    }

    if (role === 'route') {
      const isSupply = this.routeType(item) === 'supply';
      const shared = this.isShared(item);
      return {
        color: shared ? '#7c3aed' : (isSupply ? '#dc2626' : '#2563eb'),
        weight: shared ? 6 : (isSupply ? 5 : 4),
        opacity: shared ? 0.98 : (isSupply ? 0.96 : 0.88),
        zIndex: shared ? 30 : (isSupply ? 22 : 21),
      };
    }

    return {
      color: this.isMobileEdge(item) ? '#f59e0b' : '#475569',
      weight: this.isMobileEdge(item) ? 3 : 4,
      opacity: this.isMobileEdge(item) ? 0.9 : 0.82,
      zIndex: this.isMobileEdge(item) ? 12 : 10,
    };
  }

  private resolveRole(item: any, layer: ThermalLineLayer): string {
    if (layer === 'pipe' || item?.diameter_m !== undefined || item?.velocity_m_s !== undefined || item?.is_shared_segment !== undefined) {
      return 'pipe';
    }
    if (layer === 'edge') {
      return 'edge';
    }
    if (layer === 'route' || layer === 'comparison' || item?.route_type || item?.polyline || item?.source_route_ids || item?.is_shared) {
      return 'route';
    }
    if (item?.route?.polyline || item?.segment_path) {
      return 'pipe';
    }
    return 'edge';
  }

  private normalizeContext(context: ThermalLineContext | string | number | boolean | undefined, index?: number): ThermalLineContext {
    if (typeof context === 'string') {
      return { color: context, index };
    }
    if (typeof context === 'number') {
      return { zoom: context, index };
    }
    if (typeof context === 'boolean') {
      return { selected: context, index };
    }
    return { ...(context || {}), index: index ?? context?.index };
  }

  private pipeColor(item: any): string {
    const velocity = Number(item?.velocity_m_s || 0);
    if (velocity > 2.5) return '#dc2626';
    if (velocity > 2.0) return '#f59e0b';
    if (velocity < 0.5) return '#2563eb';
    return '#059669';
  }

  private pipeWeight(item: any, zoom = 15): number {
    const minDiameter = 0.02;
    const maxDiameter = 1.0;
    const minPixels = 2;
    const maxPixels = 8;
    const diameter = Math.max(minDiameter, Math.min(Number(item?.diameter_m || minDiameter), maxDiameter));
    const normalized = Math.sqrt((diameter - minDiameter) / (maxDiameter - minDiameter));
    const baseWeight = minPixels + (normalized * (maxPixels - minPixels));
    const zoomFactor = Math.pow(1.18, (zoom || 15) - 15);
    return Math.max(2, Math.min(baseWeight * zoomFactor, 12));
  }

  private routeType(item: any): string {
    return item?.route_type || item?.route?.route_type || 'return';
  }

  private isShared(item: any): boolean {
    return Boolean(item?.is_shared || item?.is_shared_segment || Number(item?.overlap_count || 0) > 1);
  }

  private hasRouteGeometry(item: any): boolean {
    return Boolean(
      item?.polyline ||
      item?.route?.polyline ||
      item?.decodedPath?.length > 2 ||
      item?.segment_path?.length > 1 ||
      item?.path?.length > 2
    );
  }

  private isMobileEdge(item: any): boolean {
    const name = String(item?.name || item?.edge?.name || '').toLowerCase();
    return name.includes('truck') || item?.edge_type === 'mobile_route' || item?.edge?.edge_type === 'mobile_route';
  }

  private cacheKey(
    item: any,
    layer: ThermalLineLayer,
    ctx: ThermalLineContext,
    role: string,
    selected: boolean,
    base: { color: string; weight: number; opacity: number; zIndex: number },
  ): string {
    return [
      layer,
      role,
      selected,
      item?.id || item?.edge?.id || item?.route?.id || 'line',
      this.routeType(item),
      this.isShared(item),
      item?.overlap_count || item?.overlap_count === 0 ? item.overlap_count : '',
      item?.diameter_m || '',
      item?.velocity_m_s || '',
      ctx.color || '',
      ctx.zoom || '',
      ctx.index || 0,
      base.color,
      base.weight,
      base.opacity,
      base.zIndex,
    ].join('|');
  }
}
