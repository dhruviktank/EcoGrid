import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function FieldMap({ site, sites = [] }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);
  const [mapType, setMapType] = useState('satellite'); // 'satellite' | 'street'
  const [isLoaded, setIsLoaded] = useState(false);

  const lat = site?.latitude || 27.539;
  const lon = site?.longitude || 71.915;

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Clean up previous instance if any
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    try {
      const map = L.map(mapContainerRef.current, {
        center: [lat, lon],
        zoom: 11,
        zoomControl: false,
        attributionControl: false
      });

      // Tile layers
      const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 18 }
      );

      const streetLayer = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        { maxZoom: 19 }
      );

      if (mapType === 'satellite') {
        satelliteLayer.addTo(map);
      } else {
        streetLayer.addTo(map);
      }

      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;

      // Custom pulsing emerald pin marker for the active plant
      const primaryIcon = L.divIcon({
        className: 'custom-field-pin',
        html: `
          <div class="relative flex items-center justify-center">
            <div class="absolute w-8 h-8 bg-emerald-500/30 rounded-full animate-ping"></div>
            <div class="relative w-7 h-7 bg-emerald-600 text-white rounded-full shadow-lg border-2 border-white flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
            </div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28]
      });

      const marker = L.marker([lat, lon], { icon: primaryIcon }).addTo(layerGroup);
      marker.bindPopup(`
        <div style="font-family: sans-serif; font-size: 11px; padding: 2px;">
          <strong style="font-size: 12px; color: #0f172a; display: block; margin-bottom: 2px;">${site?.name || 'Renewable Asset'}</strong>
          <span style="color: #059669; font-weight: 600;">${site?.capacity_mw || 0} MW ${site?.type?.toUpperCase() || ''}</span>
          <div style="color: #64748b; font-size: 10px; margin-top: 2px;">${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E</div>
        </div>
      `).openPopup();

      // Plot other nearby fleet sites if available in the same region
      sites.forEach(otherSite => {
        if (otherSite.id === site?.id || !otherSite.latitude || !otherSite.longitude) return;
        const otherIcon = L.divIcon({
          className: 'other-site-pin',
          html: `
            <div class="w-4 h-4 bg-cyan-600 text-white rounded-full shadow border border-white flex items-center justify-center opacity-85 hover:opacity-100 hover:scale-125 transition-all">
              <span style="font-size: 8px; font-weight: bold;">●</span>
            </div>
          `,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        const otherMarker = L.marker([otherSite.latitude, otherSite.longitude], { icon: otherIcon }).addTo(layerGroup);
        otherMarker.bindTooltip(`${otherSite.name} (${otherSite.capacity_mw} MW)`, { direction: 'top', offset: [0, -8] });
      });

      mapInstanceRef.current = map;
      setIsLoaded(true);
      setTimeout(() => {
        try {
          map.invalidateSize();
        } catch (_) {}
      }, 250);
    } catch (err) {
      console.warn('Leaflet map initialization fallback:', err);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [site?.id, lat, lon, mapType]);

  const handleZoomIn = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomIn();
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomOut();
  };

  const handleResetView = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lon], 11);
    }
  };

  return (
    <div className="relative w-full h-full min-h-[190px] rounded-xl overflow-hidden shadow-inner bg-slate-900 border border-slate-200/80 isolate">
      
      {/* Leaflet DOM Node */}
      <div 
        ref={mapContainerRef} 
        className="w-full h-full min-h-[190px] z-10" 
      />

      {/* Top Map Controls Pill */}
      <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5 bg-slate-900/85 backdrop-blur-md p-1 rounded-lg border border-slate-700 shadow-md text-xs">
        <button
          onClick={() => setMapType(mapType === 'satellite' ? 'street' : 'satellite')}
          title="Toggle Satellite / Street View"
          className="px-2 py-0.5 rounded text-[11px] font-semibold text-white hover:bg-slate-800 transition-colors flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-xs">
            {mapType === 'satellite' ? 'satellite_alt' : 'map'}
          </span>
          <span className="capitalize">{mapType}</span>
        </button>

        <div className="w-[1px] h-3.5 bg-slate-700" />

        <button
          onClick={handleZoomIn}
          title="Zoom in"
          className="w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-bold"
        >
          +
        </button>

        <button
          onClick={handleZoomOut}
          title="Zoom out"
          className="w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-bold"
        >
          -
        </button>

        <button
          onClick={handleResetView}
          title="Center on plant"
          className="w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-emerald-400 hover:bg-slate-800"
        >
          <span className="material-symbols-outlined text-[13px]">my_location</span>
        </button>
      </div>

      {/* Bottom Floating Plant Location Coordinates Chip */}
      <div className="absolute bottom-2.5 left-2.5 z-20 bg-slate-900/90 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-700/80 shadow text-white flex items-center gap-1.5 text-[11px] font-mono">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="font-semibold text-slate-200">{site?.name || 'Field Asset'}</span>
        <span className="text-slate-400 text-[10px]">({lat.toFixed(3)}°N, {lon.toFixed(3)}°E)</span>
      </div>

    </div>
  );
}
