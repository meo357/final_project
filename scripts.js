// Access token for the Mapbox API
mapboxgl.accessToken = 'pk.eyJ1IjoibWVvMzU3IiwiYSI6ImNtb2hpejkxMDAzamUyb29wdnFsMWU2dHUifQ._R2UlSaxpjRNccsoehAQcA'

// Initialize the Mapbox Map
const map = new mapboxgl.Map({
    container: 'map', // ID of the HTML element
    style: 'mapbox://styles/mapbox/standard', // Map style URL
    center: [-74.006, 40.7128], // Starting position [lng, lat] (NYC)
    zoom: 10 // Initial zoom level
})

// Global popup instance for center-specific information
const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false
});

// Variable to store center data after fetching
let centerData = null;
let districtSelected = false;

// UI Elements
const titleCard = document.getElementById('title-card');
const toggleBtn = document.getElementById('toggle-card');

// --- 1. Toggle Button Logic ---
if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        titleCard.classList.toggle('minimized');
    });
}

// 2. Fetch the center data GeoJSON to be used for filtering in the sidebar
fetch('./CFC_ACTIVE_points.geojson')
    .then(response => response.json())
    .then(data => {
        centerData = data;
        // Hide the loader once data is ready
        const loader = document.getElementById('loader-wrapper');
        if (loader) {
            loader.classList.add('loader-hidden');
        }
    })
    .catch(error => {
        console.error('Error loading data:', error);
    });

map.on('load', () => {
    // Add Community Districts source
    map.addSource('community-districts', {
        type: 'geojson',
        data: './simplified-community-districts.json'
    });

    // Layer: Fill the districts with colors based on the borough ID
    map.addLayer({
        id: 'community-districts-fill',
        type: 'fill',
        source: 'community-districts',
        paint: {
            'fill-color': [
                'match',
                ['slice', ['get', 'boro_cd'], 0, 1],
                '1', '#8c56e2', // Manhattan
                '2', '#863e3e', // Bronx
                '3', '#73e8c7', // Brooklyn
                '4', '#44aae1', // Queens
                '5', '#7d7e52', // Staten Island
                '#1e293b'       // Default color
            ],
            'fill-opacity': 0.3
        }
    });

    // Layer: White highlight border
    map.addLayer({
        id: 'community-districts-highlight',
        type: 'line',
        source: 'community-districts',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': 'white',
            'line-width': 8
        },
        filter: ['==', ['get', 'boro_cd'], '']
    });

    // Layer: Standard thin border
    map.addLayer({
        id: 'community-districts-border',
        type: 'line',
        source: 'community-districts',
        paint: {
            'line-color': '#074580',
            'line-width': 1,
            'line-opacity': 0.8
        }
    });

    // Add source for center point data
    map.addSource('centers-points', {
        type: 'geojson',
        data: 'CFC_ACTIVE_points.geojson'
    });

    // Layer: Small yellow dots
    map.addLayer({
        id: 'centers-layer',
        type: 'circle',
        source: 'centers-points',
        layout: { 'visibility': 'none' },
        paint: {
            'circle-radius': 6,
            'circle-color': 'yellow',
            'circle-stroke-width': 1,
            'circle-stroke-color': '#333',
            'circle-opacity': 0.95
        }
    });

    // --- HOVER POPUP FOR POINT CENTERS ---
    map.on('mouseenter', 'centers-layer', (e) => {
        if (!districtSelected) return;

        map.getCanvas().style.cursor = 'pointer';
        const props = e.features[0].properties;

        popup.setLngLat(e.lngLat)
            .setHTML(`
            <div style="text-align: center; font-family: sans-serif;">
                <h3 style="margin: 0 0 4px 0; font-size: 14px;">${props.Center || 'Unknown'}</h3>
                <p style="margin: 0; font-size: 12px; color: #666;">${props.Address || ''}</p>
                <p style="margin: 0; font-size: 12px; color: #666;">${props.Phone || ''}</p>
                <p style="margin: 0; font-size: 12px; color: #666;">${props.Days || ''}</p>
                <p style="margin: 0; font-size: 12px; color: #666;">${props.Hours || ''}</p>
            </div>
        `).addTo(map);
    });

    map.on('mouseleave', 'centers-layer', () => {
        if (!districtSelected) return;
        map.getCanvas().style.cursor = '';
        popup.remove();
    });
});

// --- DISTRICT CLICK INTERACTIVITY ---
map.on('click', 'community-districts-fill', (e) => {
    const clickedDistrict = e.features[0].properties.boro_cd;

    // MINIMIZE title card instead of hiding it
    if (titleCard) {
        titleCard.classList.add('minimized');
    }

    // Apply highlight filter
    map.setFilter('community-districts-highlight', ['==', ['get', 'boro_cd'], clickedDistrict]);

    // Fit map to district bounds
    const bounds = getGeometryBounds(e.features[0].geometry);
    if (bounds) {
        map.fitBounds(bounds, {
            padding: { top: 40, bottom: 40, left: 40, right: 420 },
            maxZoom: 12,
            duration: 1000,
            essential: true
        });
    }

    // Show sidebar
    const sidebar = document.getElementById('sidebar');
    const sidebarContent = document.getElementById('sidebar-content');
    sidebar.classList.remove('hidden');

    // Display centers for this district
    if (map.getLayer('centers-layer')) {
        map.setLayoutProperty('centers-layer', 'visibility', 'visible');
        map.setFilter('centers-layer', ['within', e.features[0].geometry]);
    }
    districtSelected = true;

    // Filter sidebar list
    if (centerData) {
        const districtPolygon = e.features[0].geometry;
        const filteredCenters = centerData.features.filter(feature => {
            return pointInPolygon(feature.geometry.coordinates, districtPolygon);
        });

        if (filteredCenters.length > 0) {
            let html = `<h2>CFC Centers in Community District ${clickedDistrict}</h2>`;
            filteredCenters.forEach(center => {
                const props = center.properties;
                html += `
                    <div class="center-entry" style="border-bottom: 2px solid #ccc; padding: 10px 0;">
                        <h3>${props.Center || 'Unknown Center'}</h3>
                        <p><strong>Address:</strong> ${props.Address || 'N/A'}</p>
                        <p><strong>Phone:</strong> ${props.Phone || 'N/A'}</p>
                        <p><strong>Days:</strong> ${props.Days || 'N/A'}</p>
                        <p><strong>Hours:</strong> ${props.Hours || 'N/A'}</p>
                    </div>
                `;
            });
            sidebarContent.innerHTML = html;
        } else {
            sidebarContent.innerHTML = `<h2>District ${clickedDistrict}</h2><p>No centers found.</p>`;
        }
    }
});

// --- SIDEBAR CLOSE LOGIC ---
const closeBtn = document.getElementById('close-sidebar');

if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        const sidebar = document.getElementById('sidebar');
        sidebar.classList.add('hidden');
        
        // RESTORE Title Card to expanded state
        if (titleCard) {
            titleCard.classList.remove('minimized');
        }
        
        // Reset map view
        map.flyTo({
            center: [-74.006, 40.7128],
            zoom: 10,
            essential: true
        });

        // Hide centers and clear highlight
        if (map.getLayer('centers-layer')) {
            map.setLayoutProperty('centers-layer', 'visibility', 'none');
            map.setFilter('centers-layer', ['==', ['get', 'Center'], '']);
            map.setPaintProperty('centers-layer', 'circle-radius', 6);
        }
        districtSelected = false;
        map.setFilter('community-districts-highlight', ['==', ['get', 'boro_cd'], '']);
    });
}

// Hover effects for the district fill layer
map.on('mouseenter', 'community-districts-fill', () => { map.getCanvas().style.cursor = 'pointer'; });

map.on('mousemove', 'community-districts-fill', (e) => {
    if (e.features.length > 0) {
        const hoveredDistrict = e.features[0].properties.boro_cd;
        if (!districtSelected) {
            map.setFilter('community-districts-highlight', ['==', ['get', 'boro_cd'], hoveredDistrict]);
            if (map.getLayer('centers-layer')) {
                map.setLayoutProperty('centers-layer', 'visibility', 'visible');
                map.setFilter('centers-layer', ['within', e.features[0].geometry]);
                map.setPaintProperty('centers-layer', 'circle-radius', 3.5);
            }
        }
    }
});

map.on('mouseleave', 'community-districts-fill', () => { 
    map.getCanvas().style.cursor = '';
    if (!districtSelected) {
        map.setFilter('community-districts-highlight', ['==', ['get', 'boro_cd'], '']);
        if (map.getLayer('centers-layer')) {
            map.setLayoutProperty('centers-layer', 'visibility', 'none');
            map.setFilter('centers-layer', ['==', ['get', 'Center'], '']);
            map.setPaintProperty('centers-layer', 'circle-radius', 6);
        }
    }
});

// Helper functions (pointInPolygon, getGeometryBounds, etc.)
function pointInPolygon(point, polygon) {
    if (!point || !polygon || !Array.isArray(point)) return false;
    if (polygon.type === 'Polygon') return pointInPolygonRing(point, polygon.coordinates[0]);
    if (polygon.type === 'MultiPolygon') return polygon.coordinates.some(poly => pointInPolygonRing(point, poly[0]));
    return false;
}

function pointInPolygonRing(point, ring) {
    const [x, y] = point;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function getGeometryBounds(geometry) {
    if (!geometry || !geometry.type) return null;
    let coords = [];
    if (geometry.type === 'Polygon') coords = geometry.coordinates.flat();
    else if (geometry.type === 'MultiPolygon') coords = geometry.coordinates.flat(2);
    else return null;
    const lons = coords.map(coord => coord[0]);
    const lats = coords.map(coord => coord[1]);
    return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
}