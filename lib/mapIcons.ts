import L from 'leaflet';

// Google Maps-style colour palette
export const PIN_RED    = '#EA4335';
export const PIN_BLUE   = '#4285F4';
export const PIN_GREEN  = '#34A853';
export const PIN_GRAY   = '#9AA0A6';
export const PIN_INDIGO = '#4f46e5';

// Tile layers
export const STREET_TILE    = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
export const SATELLITE_TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const SATELLITE_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

// Google Maps-style teardrop pin using an inline SVG so no external assets are needed
export function createGooglePin(
  color  = PIN_RED,
  dot    = 'white',
  scale  = 1,
): L.DivIcon {
  const w = Math.round(27 * scale);
  const h = Math.round(43 * scale);
  return L.divIcon({
    className: '',
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 27 43" width="${w}" height="${h}"
              style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.45));display:block;">
      <path d="M13.5 0C6.042 0 0 6.042 0 13.5 0 23.625 13.5 43 13.5 43S27 23.625 27 13.5C27 6.042 20.958 0 13.5 0z"
            fill="${color}"/>
      <circle cx="13.5" cy="13.5" r="5.5" fill="${dot}" opacity="0.92"/>
    </svg>`,
    iconSize:     [w, h],
    iconAnchor:   [w / 2, h],
    popupAnchor:  [0, -h - 2],
  });
}

// Compact dot marker (for secondary/background billboards)
export function createDotPin(color = PIN_GRAY, size = 14): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};
                border:2.5px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,0.35);"></div>`,
    iconSize:    [size, size],
    iconAnchor:  [size / 2, size / 2],
    popupAnchor: [0, -(size / 2) - 4],
  });
}

// Google Maps-style info-window HTML
export function googlePopup(title: string, subtitle: string, detail?: string): string {
  return `<div style="font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;min-width:190px;max-width:260px;">
    <div style="padding:10px 14px 8px;border-bottom:1px solid #e8eaed;">
      <div style="font-weight:600;font-size:13px;color:#202124;line-height:1.35;margin-bottom:2px;">${title}</div>
      <div style="font-size:11px;color:#70757a;">${subtitle}</div>
    </div>
    ${detail ? `<div style="padding:8px 14px 10px;font-size:11px;color:#5f6368;line-height:1.5;">${detail}</div>` : ''}
  </div>`;
}
