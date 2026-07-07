import { Pipe, PipeTransform } from '@angular/core';

interface MarkerRole {
  key: string;
  label: string;
}

interface MarkerVisual {
  fill: string;
  badge: string;
  icon: string;
  iconPath: string;
  size: number;
  zIndex: number;
}

@Pipe({
  name: 'thermalMarker',
  pure: false,
})
export class ThermalMarkerPipe implements PipeTransform {
  private readonly hiddenOptions: google.maps.MarkerOptions = { visible: false };
  private readonly optionsCache = new Map<string, google.maps.MarkerOptions>();

  transform(building: any): google.maps.MarkerOptions {
    if (typeof google === 'undefined') {
      return this.hiddenOptions;
    }

    const name = String(building?.name || building?.connected_asset_name || '').toLowerCase();
    const rawType = [
      building?.node_type ||
      '',
      building?.building_type || '',
      building?.type || '',
      building?.asset_type || '',
      building?.waste_heat_source_type || '',
      building?.wasteHeatSource || '',
    ].join(' ').toLowerCase();
    const searchStr = `${rawType} ${name}`;
    const role = this.resolveRole(rawType, searchStr);
    const visual = this.visualForRole(role, searchStr);
    const displayName = building?.name || building?.connected_asset_name || role.label;
    const cacheKey = [
      role.key,
      displayName,
      visual.fill,
      visual.badge,
      visual.icon,
      visual.iconPath,
      visual.size,
    ].join('|');

    const cachedOptions = this.optionsCache.get(cacheKey);
    if (cachedOptions) {
      return cachedOptions;
    }

    const options: google.maps.MarkerOptions = {
      title: `${displayName} - ${role.label}`,
      zIndex: visual.zIndex,
      cursor: 'pointer',
      optimized: true,
      opacity: this.opacityForRole(role.key),
      icon: {
        url: this.createIconUrl(visual),
        scaledSize: new google.maps.Size(visual.size, Math.round(visual.size * 1.32)),
        anchor: new google.maps.Point(Math.round(visual.size / 2), Math.round(visual.size * 1.28)),
        labelOrigin: new google.maps.Point(Math.round(visual.size / 2), Math.round(visual.size * 1.4)),
      },
    };

    this.optionsCache.set(cacheKey, options);

    return options;
  }

  private resolveRole(rawType: string, searchStr: string): MarkerRole {
    if (this.matches(searchStr, ['data centre', 'data center', 'datacenter', 'server', 'computing'])) {
      return { key: 'datacenter', label: 'Data center' };
    }
    if (this.matches(rawType, ['producer', 'source', 'plant']) || this.matches(searchStr, ['producer'])) {
      return { key: 'producer', label: 'Producer' };
    }
    if (this.matches(rawType, ['consumer', 'demand'])) {
      return { key: 'consumer', label: 'Consumer' };
    }
    if (this.matches(searchStr, ['cluster'])) {
      return { key: 'cluster', label: 'Cluster' };
    }
    if (this.matches(searchStr, ['storage', 'tank', 'battery'])) {
      return { key: 'storage', label: 'Storage' };
    }
    if (this.matches(searchStr, ['network', 'junction', 'node'])) {
      return { key: 'network', label: 'Network node' };
    }
    if (this.matches(searchStr, ['arena', 'ice', 'cold', 'cooling'])) {
      return { key: 'cooling', label: 'Cooling source' };
    }
    if (this.matches(searchStr, ['grocery', 'supermarket', 'food', 'market'])) {
      return { key: 'grocery', label: 'Grocery heat source' };
    }
    if (this.matches(searchStr, ['water', 'treatment', 'sewage', 'wastewater'])) {
      return { key: 'water', label: 'Water heat source' };
    }
    if (this.matches(searchStr, ['boiler', 'factory', 'industrial', 'solar', 'geothermal', 'heat pump'])) {
      return { key: 'producer', label: 'Producer' };
    }
    if (this.matches(searchStr, ['building', 'bld', 'residential', 'detached', 'apartment', 'house', 'semi', 'condo'])) {
      return { key: 'consumer', label: 'Consumer' };
    }

    return { key: 'consumer', label: 'Consumer' };
  }

  private visualForRole(role: MarkerRole, searchStr: string): MarkerVisual {
    const paths = this.iconPaths();

    if (role.key === 'datacenter') {
      return {
        fill: '#7e22ce',
        badge: '#f0abfc',
        icon: '#3b0764',
        iconPath: paths.SERVER,
        size: 38,
        zIndex: 42,
      };
    }

    if (role.key === 'cluster') {
      return {
        fill: '#4f46e5',
        badge: '#c7d2fe',
        icon: '#1e1b4b',
        iconPath: paths.CLUSTER,
        size: 30,
        zIndex: 32,
      };
    }

    if (role.key === 'storage') {
      return {
        fill: '#b45309',
        badge: '#fde68a',
        icon: '#451a03',
        iconPath: paths.STORAGE,
        size: 30,
        zIndex: 30,
      };
    }

    if (role.key === 'network') {
      if (this.matches(searchStr, ['tap', 'junction'])) {
        return {
          fill: '#475569',
          badge: '#e2e8f0',
          icon: '#0f172a',
          iconPath: paths.NETWORK,
          size: 18,
          zIndex: 18,
        };
      }
      return {
        fill: '#334155',
        badge: '#cbd5e1',
        icon: '#020617',
        iconPath: paths.NETWORK,
        size: 28,
        zIndex: 28,
      };
    }

    if (role.key === 'cooling') {
      return {
        fill: '#0284c7',
        badge: '#bae6fd',
        icon: '#082f49',
        iconPath: paths.SNOW,
        size: 34,
        zIndex: 38,
      };
    }

    if (role.key === 'grocery') {
      return {
        fill: '#16a34a',
        badge: '#bbf7d0',
        icon: '#052e16',
        iconPath: paths.CART,
        size: 34,
        zIndex: 38,
      };
    }

    if (role.key === 'water') {
      return {
        fill: '#0e7490',
        badge: '#a5f3fc',
        icon: '#083344',
        iconPath: paths.WATER,
        size: 34,
        zIndex: 38,
      };
    }

    if (role.key === 'producer') {
      if (this.matches(searchStr, ['boiler', 'heat pump'])) {
        return this.producerVisual(paths.BOILER, '#c2410c', '#fed7aa', '#431407');
      }
      if (this.matches(searchStr, ['solar'])) {
        return this.producerVisual(paths.SOLAR, '#ca8a04', '#fef08a', '#422006');
      }
      if (this.matches(searchStr, ['geothermal'])) {
        return this.producerVisual(paths.GEOTHERMAL, '#15803d', '#bbf7d0', '#052e16');
      }

      return this.producerVisual(paths.FACTORY, '#dc2626', '#fecaca', '#450a0a');
    }

    return {
      fill: '#0f766e',
      badge: '#ccfbf1',
      icon: '#042f2e',
      iconPath: paths.HOME,
      size: 26,
      zIndex: 24,
    };
  }

  private producerVisual(iconPath: string, fill: string, badge: string, icon: string): MarkerVisual {
    return {
      fill,
      badge,
      icon,
      iconPath,
      size: 34,
      zIndex: 40,
    };
  }

  private opacityForRole(roleKey: string): number {
    return roleKey === 'consumer' ? 0.88 : 0.94;
  }

  private createIconUrl(visual: MarkerVisual): string {
    const height = Math.round(visual.size * 1.32);
    const pinPath = 'M18 1.5C9.4 1.5 2.5 8.2 2.5 16.6c0 10.7 15.5 29.9 15.5 29.9s15.5-19.2 15.5-29.9C33.5 8.2 26.6 1.5 18 1.5z';
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${visual.size}" height="${height}" viewBox="0 0 36 48">
        <path d="${pinPath}" fill="${visual.fill}" stroke="#111827" stroke-width="2.8" />
        <circle cx="18" cy="17" r="10.7" fill="${visual.badge}" stroke="#111827" stroke-width="1.7" />
        <g transform="translate(7.2 6.4) scale(0.9)">
          <path d="${visual.iconPath}" fill="${visual.icon}" />
        </g>
      </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
  }

  private iconPaths(): { [key: string]: string } {
    return {
      HOME: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
      SERVER: 'M4 4h16v5H4V4zm2 2v1h2V6H6zm-2 5h16v5H4v-5zm2 2v1h2v-1H6zm-2 5h16v2H4v-2z',
      FACTORY: 'M3 21V9l6 4V9l6 4V9l6 4v8H3zm2-2h14v-4.9l-6-4v4l-6-4v4L5 12.8V19z',
      SNOW: 'M22 11h-4.17l2.24-2.24-1.41-1.41L15 11h-2V9l3.66-3.66-1.41-1.41-2.24 2.24V2h-2v4.17L8.76 3.93 7.34 5.34 11 9v2H9L5.34 7.34 3.93 8.76 6.17 11H2v2h4.17l-2.24 2.24 1.41 1.41L9 13h2v2l-3.66 3.66 1.41 1.41 2.24-2.24V22h2v-4.17l2.24 2.24 1.41-1.41L15 15v-2h2l3.66 3.66 1.41-1.41-2.24-2.24H22z',
      CART: 'M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.6-1.35 2.45c-.16.28-.25.61-.25.95 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
      WATER: 'M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8z',
      CLUSTER: 'M4 10h4v4H4v-4zm0 6h4v4H4v-4zm0-12h4v4H4V4zm6 0h4v4h-4V4zm0 6h4v4h-4v-4zm0 6h4v4h-4v-4zm6-12h4v4h-4V4zm0 6h4v4h-4v-4zm0 6h4v4h-4v-4z',
      STORAGE: 'M6 4c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2v16h-2v-2h-3v2h-2v-2H8v2H6V4zm2 2v3h8V6H8zm0 5v5h8v-5H8z',
      BOILER: 'M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67z',
      SOLAR: 'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1z',
      GEOTHERMAL: 'M2 6l10 14 10-14H2z',
      NETWORK: 'M17 16l-4-4V8.82C14.16 8.4 15 7.3 15 6c0-1.66-1.34-3-3-3S9 4.34 9 6c0 1.3.84 2.4 2 2.82V12l-4 4H3v5h5v-3.05l4-4.2 4 4.2V21h5v-5h-4z',
    };
  }

  private matches(value: string, keywords: string[]): boolean {
    return keywords.some(keyword => value.includes(keyword));
  }
}
