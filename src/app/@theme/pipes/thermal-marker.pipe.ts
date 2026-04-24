import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'thermalMarker',
  pure: false // Critical: Keeps checking until Google Maps API loads
})
export class ThermalMarkerPipe implements PipeTransform {

  transform(building: any): google.maps.MarkerOptions {
    // 1. SAFETY: If API isn't loaded, return invisible marker
    if (typeof google === 'undefined') {
      return { visible: false };
    }

    // 2. DATA EXTRACTION: Handle Django vs Frontend naming
    const name = String(building.name || '').toLowerCase();
    
    // Check 'building_type' (Django) first, then fallback to 'type'
    const type = String( building.node_type || building.building_type).toLowerCase();

    // Create a combined search string for smarter matching
    // e.g. type="commercial", name="Hamilton Ice Arena"
    const searchStr = `${type} ${name}`;

    // 3. DEFINE VECTOR PATHS (The robust rendering fix)
    const PATHS = {
      HOME: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
      SNOW: 'M22 11h-4.17l2.24-2.24-1.41-1.41L15 11h-2V9l3.66-3.66-1.41-1.41-2.24 2.24V2h-2v4.17L8.76 3.93 7.34 5.34 11 9v2H9L5.34 7.34 3.93 8.76 6.17 11H2v2h4.17l-2.24 2.24 1.41 1.41L9 13h2v2l-3.66 3.66 1.41 1.41 2.24-2.24V22h2v-4.17l2.24 2.24 1.41-1.41L15 15v-2h2l3.66 3.66 1.41-1.41-2.24-2.24H22z',
      CART: 'M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z',
      SERVER: 'M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z',
      WATER: 'M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8z',
      CLUSTER: 'M4 10h4v4H4v-4zm0 6h4v4H4v-4zm0-12h4v4H4V4zm6 0h4v4h-4V4zm0 6h4v4h-4v-4zm0 6h4v4h-4v-4zm6-12h4v4h-4V4zm0 6h4v4h-4v-4zm0 6h4v4h-4v-4z',
      FACTORY: 'M22 22H2V10l7-7 9 5.4L22 10v12zM12 9.5c1.38 0 2.5-1.12 2.5-2.5s-1.12-2.5-2.5-2.5S9.5 5.62 9.5 7 10.62 9.5 12 9.5z',
      STORAGE: 'M16 20h-2v-2h-4v2H8v-2H6v2H4v-2c-1.1 0-2-.9-2-2V7c0-1.1.9-2 2-2v-1c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2v1c1.1 0 2 .9 2 2v11c0 1.1-.9 2-2 2v2z',
      BOILER: 'M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67z',
      SOLAR: 'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.93c.39.39.39 1.02 0 1.41-.39.39-1.02.39-1.41 0-.39-.39-.39-1.02 0-1.41.39-.39 1.02-.39 1.41 0zm12.37 12.37c-.39-.39-.39-1.02 0-1.41.39-.39 1.02-.39 1.41 0 .39.39.39 1.02 0 1.41-.39.39-1.02.39-1.41 0zm1.41-10.96c.39-.39 1.02-.39 1.41 0 .39.39.39 1.02 0 1.41-.39.39-1.02.39-1.41 0-.39-.39-.39-1.02 0-1.41zM7.05 18.36c.39-.39 1.02-.39 1.41 0 .39.39.39 1.02 0 1.41-.39.39-1.02.39-1.41 0-.39-.39-.39-1.02 0-1.41z',
      GEOTHERMAL: 'M2 6l10 14 10-14H2z', // Simple Downward Earth Arrow
      NETWORK: 'M17 16l-4-4V8.82C14.16 8.4 15 7.3 15 6c0-1.66-1.34-3-3-3S9 4.34 9 6c0 1.3.84 2.4 2 2.82V12l-4 4H3v5h5v-3.05l4-4.2 4 4.2V21h5v-5h-4z'
    };

    // 4. DETERMINE ICON & COLOR
    let pathData = PATHS.FACTORY;
    let color = '#e21620'; // Grey Default

    // Logic: Checks both Type and Name for keywords
    if (['residential', 'detached', 'apartment', 'house', 'semi', 'condo', 'consumer', 'bld'].some(x => searchStr.includes(x))) {
      color = '#1f0ccc'; // Blue
      pathData = PATHS.HOME;
    } 
    else if (['arena', 'ice', 'cold', 'cooling'].some(x => searchStr.includes(x))) {
      color = '#D32F2F'; // Red
      pathData = PATHS.SNOW;
    }
    else if (['cluster'].some(x => searchStr.includes(x))) {
      color = '#2918c2'; // Black
      pathData = PATHS.CLUSTER;
    }
    else if (['network'].some(x => searchStr.includes(x))) {
      color = '#000000'; // Black
      pathData = PATHS.NETWORK;
    }

    else if (['grocery', 'supermarket', 'food', 'market'].some(x => searchStr.includes(x))) {
      color = '#D32F2F'; 
      pathData = PATHS.CART;
    }
    else if (['data', 'server', 'computing', 'Proposed Data Center'].some(x => searchStr.includes(x))) {
      color = '#D32F2F'; 
      pathData = PATHS.SERVER;
    }
    else if (['water', 'treatment', 'sewage'].some(x => searchStr.includes(x))) {
      color = '#D32F2F'; 
      pathData = PATHS.WATER;
    }
    else{
      color = '#1f0ccc'; // Blue
      pathData = PATHS.HOME;

    }

    // 5. RETURN GOOGLE MARKER OPTIONS
    return {
      title: building.name, // Tooltip
      icon: {
        path: pathData,        // <--- Vector Path (Cannot fail)
        fillColor: color,
        fillOpacity: 1,
        strokeWeight: 1.5,
        strokeColor: '#FFFFFF',
        rotation: 0,
        scale: 1.8,            // Scale up (24px * 1.8)
        anchor: new google.maps.Point(12, 12)
      }
    };
  }
}
