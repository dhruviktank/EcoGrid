import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import DataProvenanceBadge from './DataProvenanceBadge';

// Regional bounding presets for quick-jump navigation
const REGION_PRESETS = [
  { id: 'all', label: '🌍 World View', bounds: [[-50, -140], [70, 140]], center: [35, 10], zoom: 2 },
  { id: 'uk', label: '🇬🇧 UK & North Sea (4)', center: [54.5, 0.5], zoom: 6 },
  { id: 'india', label: '🇮🇳 India (2)', center: [18.5, 75.0], zoom: 5 },
  { id: 'usa', label: '🇺🇸 North America (1)', center: [33.82, -115.39], zoom: 7 },
  { id: 'china', label: '🇨🇳 East Asia (1)', center: [40.0, 96.0], zoom: 6 }
];

export default function GridSelectorModal({
  isOpen,
  onClose,
  sites = [],
  selectedSiteId,
  onSelectSite
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [techFilter, setTechFilter] = useState('ALL'); // 'ALL' | 'WIND' | 'SOLAR' | 'HYBRID'
  const [activeRegion, setActiveRegion] = useState('all');
  const [sortBy, setSortBy] = useState('capacity_desc'); // 'capacity_desc' | 'capacity_asc' | 'name_asc'
  const [mapLayer, setMapLayer] = useState('dark'); // 'dark' | 'satellite' | 'streets'
  const [hoveredSiteId, setHoveredSiteId] = useState(null);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef({});
  const layerGroupRef = useRef(null);
  const searchInputRef = useRef(null);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Escape key handler to close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filtered and sorted sites
  const filteredSites = useMemo(() => {
    return sites
      .filter((site) => {
        // Tech filter
        if (techFilter === 'WIND' && site.type !== 'wind') return false;
        if (techFilter === 'SOLAR' && site.type !== 'solar') return false;
        if (techFilter === 'HYBRID' && site.type !== 'hybrid') return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const nameMatch = site.name?.toLowerCase().includes(q);
          const regionMatch = site.region?.toLowerCase().includes(q);
          const countryMatch = site.country?.toLowerCase().includes(q);
          const typeMatch = site.type?.toLowerCase().includes(q);
          const capMatch = `${site.capacity_mw}mw`.toLowerCase().includes(q) || `${site.capacity_mw}`.includes(q);
          return nameMatch || regionMatch || countryMatch || typeMatch || capMatch;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'capacity_desc') return (b.capacity_mw || 0) - (a.capacity_mw || 0);
        if (sortBy === 'capacity_asc') return (a.capacity_mw || 0) - (b.capacity_mw || 0);
        if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
        return 0;
      });
  }, [sites, techFilter, searchQuery, sortBy]);

  // Currently selected site object
  const currentSelectedSite = useMemo(() => {
    return sites.find((s) => s.id === selectedSiteId || s.site_id === selectedSiteId) || sites[0];
  }, [sites, selectedSiteId]);

  // Technology counts
  const techCounts = useMemo(() => {
    const counts = { ALL: sites.length, WIND: 0, SOLAR: 0, HYBRID: 0 };
    sites.forEach((s) => {
      if (s.type === 'wind') counts.WIND++;
      else if (s.type === 'solar') counts.SOLAR++;
      else if (s.type === 'hybrid') counts.HYBRID++;
    });
    return counts;
  }, [sites]);

  // Action: Select site and focus map
  const handleSelectSite = useCallback((siteId) => {
    onSelectSite(siteId);
    const target = sites.find((s) => s.id === siteId || s.site_id === siteId);
    if (target && mapInstanceRef.current && target.latitude && target.longitude) {
      mapInstanceRef.current.flyTo([target.latitude, target.longitude], 8, {
        duration: 1.0,
        easeLinearity: 0.25
      });
    }
  }, [onSelectSite, sites]);

  // Render Map Nodes onto layerGroup
  const drawNodes = useCallback((targetLayerGroup) => {
    const lg = targetLayerGroup || layerGroupRef.current;
    if (!lg) return;

    lg.clearLayers();
    markersRef.current = {};

    const activeId = selectedSiteId;

    // Helper for marker colors & icons
    const getNodeStyle = (site, isSelected, isHovered) => {
      let bgGrad = 'from-cyan-500 to-blue-600';
      let ringColor = 'rgba(6, 182, 212, 0.4)';
      let glowColor = '#06b6d4';
      let iconSymbol = 'air';

      if (site.type === 'solar') {
        bgGrad = 'from-amber-400 to-orange-500';
        ringColor = 'rgba(245, 158, 11, 0.4)';
        glowColor = '#f59e0b';
        iconSymbol = 'wb_sunny';
      } else if (site.type === 'hybrid') {
        bgGrad = 'from-purple-500 to-indigo-600';
        ringColor = 'rgba(139, 92, 246, 0.4)';
        glowColor = '#8b5cf6';
        iconSymbol = 'bolt';
      }

      const size = isSelected ? 34 : isHovered ? 30 : 24;
      const isPulsing = isSelected;

      return {
        bgGrad,
        ringColor,
        glowColor,
        iconSymbol,
        size,
        isPulsing
      };
    };

    // Plot markers for all sites in the system
    sites.forEach((site) => {
      if (!site.latitude || !site.longitude) return;

      const isSelected = site.id === activeId || site.site_id === activeId;
      const isHovered = site.id === hoveredSiteId || site.site_id === hoveredSiteId;
      const isFilteredOut = !filteredSites.some((fs) => fs.id === site.id);

      const style = getNodeStyle(site, isSelected, isHovered);

      const iconHtml = `
        <div class="relative flex items-center justify-center cursor-pointer group transition-transform duration-200 ${isFilteredOut ? 'opacity-30 scale-75' : 'opacity-100 hover:scale-125'}">
          ${style.isPulsing ? `
            <div class="absolute -inset-2 bg-emerald-400/40 rounded-full animate-ping"></div>
            <div class="absolute -inset-1 bg-emerald-500/30 rounded-full animate-pulse"></div>
          ` : isHovered ? `
            <div class="absolute -inset-1.5 rounded-full animate-pulse" style="background-color: ${style.ringColor}"></div>
          ` : ''}
          <div class="relative flex items-center justify-center rounded-full shadow-lg border-2 ${
            isSelected ? 'border-emerald-400 ring-2 ring-emerald-500/50 bg-gradient-to-br from-emerald-500 to-teal-700' : 'border-white bg-gradient-to-br ' + style.bgGrad
          }" style="width: ${style.size}px; height: ${style.size}px;">
            <span class="material-symbols-outlined text-white" style="font-size: ${isSelected ? '18px' : '13px'};">
              ${isSelected ? 'check_circle' : style.iconSymbol}
            </span>
          </div>
          ${isSelected ? `
            <div class="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap uppercase tracking-wider">
              ACTIVE
            </div>
          ` : ''}
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'grid-node-marker',
        html: iconHtml,
        iconSize: [style.size, style.size],
        iconAnchor: [style.size / 2, style.size / 2]
      });

      const marker = L.marker([site.latitude, site.longitude], {
        icon: customIcon,
        zIndexOffset: isSelected ? 1000 : isHovered ? 500 : 100
      }).addTo(lg);

      // Tooltip
      marker.bindTooltip(`
        <div style="font-family: 'Inter', system-ui, sans-serif; padding: 2px 4px;">
          <div style="font-weight: 700; font-size: 12px; color: #0f172a; margin-bottom: 2px;">
            ${site.name}
          </div>
          <div style="display: flex; align-items: center; gap: 6px; font-size: 11px;">
            <span style="font-weight: 700; color: ${site.type === 'solar' ? '#d97706' : site.type === 'hybrid' ? '#7c3aed' : '#0284c7'};">
              ${site.capacity_mw} MW ${site.type?.toUpperCase()}
            </span>
            <span style="color: #64748b;">·</span>
            <span style="color: #64748b;">${site.region}</span>
          </div>
          <div style="color: #059669; font-weight: 600; font-size: 10px; margin-top: 3px;">
            👆 Click node to select grid
          </div>
        </div>
      `, {
        direction: 'top',
        offset: [0, -style.size / 2 - 4],
        className: 'custom-grid-tooltip'
      });

      // Marker click selects grid
      marker.on('click', () => {
        handleSelectSite(site.id);
      });

      markersRef.current[site.id] = marker;
    });
  }, [sites, filteredSites, selectedSiteId, hoveredSiteId, handleSelectSite]);

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!isOpen) {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (_) {}
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
        markersRef.current = {};
      }
      return;
    }

    if (!mapContainerRef.current) return;

    const container = mapContainerRef.current;
    if (container._leaflet_id) {
      delete container._leaflet_id;
    }

    // Clean up previous instance if lingering
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch (_) {}
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
      markersRef.current = {};
    }

    // Determine initial center
    const initialCenter = currentSelectedSite?.latitude && currentSelectedSite?.longitude
      ? [currentSelectedSite.latitude, currentSelectedSite.longitude]
      : [50.0, 5.0];
    const initialZoom = currentSelectedSite?.latitude ? 5 : 3;

    const map = L.map(container, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: false,
      attributionControl: false
    });

    // Tile layer (100% free, zero watermark, no API key required)
    const getTileUrl = (type) => {
      if (type === 'satellite') {
        return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      }
      if (type === 'streets') {
        return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
      }
      return 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
    };

    const tileLayer = L.tileLayer(getTileUrl(mapLayer), { maxZoom: 19 });
    tileLayer.addTo(map);
    map._tileLayer = tileLayer;

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;
    mapInstanceRef.current = map;

    // Immediately render all grid nodes on map initialization!
    drawNodes(layerGroup);

    // Invalidate size once modal animation finishes
    const timer1 = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch (_) {}
    }, 150);

    const timer2 = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch (_) {}
    }, 350);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (_) {}
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
        markersRef.current = {};
      }
      if (container && container._leaflet_id) {
        delete container._leaflet_id;
      }
    };
  }, [isOpen]);

  // Update tile layer if changed while modal is open
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !isOpen) return;

    if (map._tileLayer) {
      map.removeLayer(map._tileLayer);
    }
    const tileUrl = mapLayer === 'satellite'
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : mapLayer === 'streets'
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
      : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
    const newTileLayer = L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);
    map._tileLayer = newTileLayer;
  }, [mapLayer, isOpen]);

  // Update Map Nodes whenever filters, sites, selection, or open state changes
  useEffect(() => {
    if (isOpen && mapInstanceRef.current && layerGroupRef.current) {
      drawNodes();
    }
  }, [drawNodes, isOpen]);

  // Jump to region preset
  const handleRegionJump = (preset) => {
    setActiveRegion(preset.id);
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    if (preset.bounds) {
      map.fitBounds(preset.bounds, { padding: [30, 30], duration: 1.0 });
    } else if (preset.center) {
      map.flyTo(preset.center, preset.zoom, { duration: 1.0 });
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div 
      className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 md:p-6 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-7xl h-[86vh] max-h-[760px] min-h-[480px] my-auto bg-white rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden text-slate-900 relative shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* =========================================================================
            1. TOP HEADER & ASSET STATS BAR
           ========================================================================= */}
        <div className="px-5 py-3.5 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-600 to-blue-700 text-white flex items-center justify-center shadow-md shadow-cyan-600/20">
              <span className="material-symbols-outlined text-2xl">public</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Grid Interconnection & Asset Selector
                </h2>
                <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                  {sites.length} Connected Grids
                </span>
                <DataProvenanceBadge type="real-specs" compact={true} align="left" />
              </div>
              <p className="text-xs text-slate-500">
                Interactive World Map with physical SCADA nodes + Multi-way instant search
              </p>
            </div>
          </div>

          {/* Active Site Preview & Close Button */}
          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-slate-200 text-xs shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-slate-400 font-medium">Active:</span>
              <span className="font-semibold text-slate-800 truncate max-w-[180px]">
                {currentSelectedSite?.name}
              </span>
              <span className="text-emerald-700 font-bold ml-1">
                {currentSelectedSite?.capacity_mw} MW
              </span>
            </div>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-200/80 hover:bg-slate-300 text-slate-700 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer"
              title="Close (Escape)"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>

        {/* =========================================================================
            2. MULTI-WAY FILTER & SEARCH CONTROLS BAR
           ========================================================================= */}
        <div className="px-5 py-2.5 bg-white border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          
          {/* Instant Search Bar */}
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
              search
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 35 grids by name, region, country, MW (e.g. Beatrice, Scotland)..."
              className="w-full pl-9 pr-8 py-2 bg-slate-100 hover:bg-slate-100/80 focus:bg-white text-xs text-slate-900 placeholder:text-slate-400 rounded-xl border border-slate-200 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>

          {/* Technology Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs shrink-0">
            <button
              onClick={() => setTechFilter('ALL')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                techFilter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({techCounts.ALL})
            </button>
            <button
              onClick={() => setTechFilter('WIND')}
              className={`px-3 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                techFilter === 'WIND'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-cyan-700'
              }`}
            >
              <span className="material-symbols-outlined text-sm">air</span>
              Wind ({techCounts.WIND})
            </button>
            <button
              onClick={() => setTechFilter('SOLAR')}
              className={`px-3 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                techFilter === 'SOLAR'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'text-slate-600 hover:text-amber-700'
              }`}
            >
              <span className="material-symbols-outlined text-sm">wb_sunny</span>
              Solar ({techCounts.SOLAR})
            </button>
            <button
              onClick={() => setTechFilter('HYBRID')}
              className={`px-3 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                techFilter === 'HYBRID'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-purple-700'
              }`}
            >
              <span className="material-symbols-outlined text-sm">bolt</span>
              Hybrid ({techCounts.HYBRID})
            </button>
          </div>

          {/* Regional Quick-Jump Pills */}
          <div className="hidden xl:flex items-center gap-1 text-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase mr-1">Regions:</span>
            {REGION_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleRegionJump(preset)}
                className={`px-2.5 py-1 rounded-lg font-medium text-xs transition-colors cursor-pointer ${
                  activeRegion === preset.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase hidden sm:inline">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="py-1 px-2.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
            >
              <option value="capacity_desc">Capacity (High to Low)</option>
              <option value="capacity_asc">Capacity (Low to High)</option>
              <option value="name_asc">Name (A to Z)</option>
            </select>
          </div>
        </div>

        {/* =========================================================================
            3. MAIN BODY: SPLIT VIEW (CARD EXPLORER LIST + INTERACTIVE WORLD MAP)
           ========================================================================= */}
        <div className="flex-1 flex min-h-0 relative">
          
          {/* -------------------------------------------------------------
              LEFT PANEL: MULTI-WAY SCROLLABLE LIST OF ASSETS ("OLD WAY" UPGRADED)
             ------------------------------------------------------------- */}
          <div className="w-full md:w-96 lg:w-[420px] flex flex-col border-r border-slate-200 bg-slate-50/50 shrink-0">
            {/* List Header stats */}
            <div className="px-4 py-2 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">
                Showing <strong className="text-cyan-700">{filteredSites.length}</strong> of {sites.length} grid facilities
              </span>
              <span className="text-slate-400 text-[11px]">
                Click card or node to switch
              </span>
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1.5">
              {filteredSites.length === 0 ? (
                <div className="py-12 px-4 text-center">
                  <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">search_off</span>
                  <div className="text-sm font-semibold text-slate-700">No matching grid assets found</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Try adjusting your search terms or technology filters.
                  </div>
                  <button
                    onClick={() => { setSearchQuery(''); setTechFilter('ALL'); }}
                    className="mt-3 px-3 py-1.5 bg-cyan-600 text-white rounded-lg text-xs font-semibold hover:bg-cyan-700 cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                filteredSites.map((site) => {
                  const isSelected = site.id === selectedSiteId || site.site_id === selectedSiteId;
                  const isHovered = site.id === hoveredSiteId;
                  const isWind = site.type === 'wind';
                  const isSolar = site.type === 'solar';

                  return (
                    <div
                      key={site.id}
                      onClick={() => handleSelectSite(site.id)}
                      onMouseEnter={() => setHoveredSiteId(site.id)}
                      onMouseLeave={() => setHoveredSiteId(null)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                        isSelected
                          ? 'bg-emerald-50/90 border-emerald-300 ring-2 ring-emerald-500/20 shadow-sm'
                          : isHovered
                          ? 'bg-white border-cyan-300 shadow-md translate-x-0.5'
                          : 'bg-white hover:bg-slate-50 border-slate-200/80 shadow-xs'
                      }`}
                    >
                      {/* Left: Icon & Details */}
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                            isSelected
                              ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                              : isWind
                              ? 'bg-cyan-50 text-cyan-600 border-cyan-200'
                              : isSolar
                              ? 'bg-amber-50 text-amber-600 border-amber-200'
                              : 'bg-purple-50 text-purple-600 border-purple-200'
                          }`}
                        >
                          <span className="material-symbols-outlined text-lg">
                            {isWind ? 'air' : isSolar ? 'wb_sunny' : 'bolt'}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className={`text-xs font-bold truncate ${isSelected ? 'text-emerald-950 font-extrabold' : 'text-slate-900'}`}>
                              {site.name}
                            </h4>
                            {isSelected && (
                              <span className="bg-emerald-600 text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded shrink-0">
                                ACTIVE
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            {site.region} {site.country ? `· ${site.country}` : ''}
                          </div>

                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              {site.type.toUpperCase()}
                            </span>
                            {site.latitude && site.longitude && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                {site.latitude.toFixed(2)}°, {site.longitude.toFixed(2)}°
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Capacity Badge & Selection Indicator */}
                      <div className="text-right shrink-0 flex flex-col items-end justify-between self-stretch">
                        <div className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                          isSelected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'
                        }`}>
                          {site.capacity_mw} MW
                        </div>

                        {isSelected ? (
                          <div className="flex items-center gap-1 text-emerald-600 text-xs font-bold mt-2">
                            <span className="material-symbols-outlined text-base">check_circle</span>
                            <span>Selected</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 hover:text-cyan-600 mt-2 font-medium">
                            Switch Grid →
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* -------------------------------------------------------------
              RIGHT PANEL: INTERACTIVE WORLD MAP WITH NODES
             ------------------------------------------------------------- */}
          <div className="flex-1 relative flex flex-col bg-slate-900">
            {/* Map Container */}
            <div ref={mapContainerRef} className="w-full h-full" />

            {/* Map Controls Floating Overlay (Top-Right) */}
            <div className="absolute top-4 right-4 z-[400] flex flex-col gap-2 bg-white/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-200/80 shadow-lg">
              <button
                onClick={() => handleRegionJump(REGION_PRESETS[0])}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
                title="Fit All World Assets"
              >
                <span className="material-symbols-outlined text-lg">public</span>
              </button>
              <button
                onClick={() => mapInstanceRef.current?.zoomIn()}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
                title="Zoom In"
              >
                <span className="material-symbols-outlined text-lg">add</span>
              </button>
              <button
                onClick={() => mapInstanceRef.current?.zoomOut()}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <span className="material-symbols-outlined text-lg">remove</span>
              </button>
              <hr className="border-slate-200" />
              <button
                onClick={() => setMapLayer(mapLayer === 'dark' ? 'satellite' : mapLayer === 'satellite' ? 'streets' : 'dark')}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors cursor-pointer"
                title={`Current: ${mapLayer}. Click to toggle layer`}
              >
                <span className="material-symbols-outlined text-lg">
                  {mapLayer === 'satellite' ? 'satellite_alt' : mapLayer === 'streets' ? 'map' : 'dark_mode'}
                </span>
              </button>
            </div>

            {/* Map Legend Overlay (Bottom-Left) */}
            <div className="absolute bottom-4 left-4 z-[400] bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-200 shadow-lg text-[11px] font-medium text-slate-700 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900 uppercase text-[10px] tracking-wider">Nodes:</span>
                <DataProvenanceBadge type="real-gis" compact={true} align="left" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 shadow-sm" />
                <span>Wind ({techCounts.WIND})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm" />
                <span>Solar ({techCounts.SOLAR})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-sm" />
                <span>Hybrid ({techCounts.HYBRID})</span>
              </div>
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 text-emerald-700 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <span>Active Grid</span>
              </div>
            </div>

            {/* Quick Helper Floating Badge (Bottom-Right) */}
            <div className="hidden sm:flex absolute bottom-4 right-4 z-[400] bg-slate-950/80 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-md items-center gap-1.5">
              <span className="material-symbols-outlined text-cyan-400 text-sm">touch_app</span>
              <span>Click any node on map to switch active grid telemetry</span>
            </div>
          </div>
        </div>

        {/* =========================================================================
            4. BOTTOM STATUS BAR & SELECTION CONFIRMATION
           ========================================================================= */}
        <div className="px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span className="text-slate-400">Current Grid:</span>
            <span className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <span className={`material-symbols-outlined text-base ${
                currentSelectedSite?.type === 'wind' ? 'text-cyan-600' : currentSelectedSite?.type === 'solar' ? 'text-amber-500' : 'text-purple-600'
              }`}>
                {currentSelectedSite?.type === 'wind' ? 'air' : currentSelectedSite?.type === 'solar' ? 'wb_sunny' : 'bolt'}
              </span>
              {currentSelectedSite?.name}
            </span>
            <span className="text-slate-400">·</span>
            <span className="font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
              {currentSelectedSite?.capacity_mw} MW Nameplate
            </span>
            <span className="hidden sm:inline text-slate-500">
              ({currentSelectedSite?.region})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs shadow-md shadow-cyan-600/25 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">check</span>
              Confirm & View Grid Telemetry
            </button>
          </div>
        </div>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
