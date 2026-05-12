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

// 1. Fetch the center data GeoJSON to be used for filtering in the sidebar
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
        // Optionally hide loader or show error message here
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
                // Extracts the first digit of the boro_cd to determine the borough
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

    // Layer: White highlight border for the currently selected district
    map.addLayer({
        id: 'community-districts-highlight',
        type: 'line',
        source: 'community-districts',
        layout: {
            'line-cap': 'round',
            'line-join': 'round'
        },
        paint: {
            'line-color': 'white',
            'line-width': 8
        },
        // Filter out all districts by default
        filter: ['==', ['get', 'boro_cd'], '']
    });

    // Layer: Standard thin border for all districts
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

    // Add source for center point data only
    map.addSource('centers-points', {
        type: 'geojson',
        data: 'CFC_ACTIVE_points.geojson'
    });

    // Layer: Small yellow dots representing centers at higher zoom levels
    map.addLayer({
        id: 'centers-layer',
        type: 'circle',
        source: 'centers-points',
        layout: {
            'visibility': 'none'
        },
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
        map.getCanvas().style.cursor = 'pointer';

        const coordinates = e.lngLat;
        const props = e.features[0].properties;

        const centerName = props.Center || 'Unknown Center';
        const fullAddress = props.Address || 'Address not available';
        const fullDays = props.Days;
        const phonenumber = props.Phone;
        const fullHours = props.Hours;

        popup.setLngLat(coordinates)
            .setHTML(`
            <div style="text-align: center; font-family: sans-serif;">
                <h3 style="margin: 0 0 4px 0; font-size: 14px;">${centerName}</h3>
                <p style="margin: 0; font-size: 12px; font-weight: normal; color: #666;">${fullAddress}</p>
                <p style="margin: 0; font-size: 12px; font-weight: normal; color: #666;">${phonenumber}</p>
                                <p style="margin: 0; font-size: 12px; font-weight: normal; color: #666;">${fullDays}</p>
                <p style="margin: 0; font-size: 12px; font-weight: normal; color: #666;">${fullHours}</p>
            </div>
        `)
            .addTo(map);
    });

    map.on('mouseleave', 'centers-layer', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
    });
});

// --- DISTRICT CLICK INTERACTIVITY ---
map.on('click', 'community-districts-fill', (e) => {
    const clickedDistrict = e.features[0].properties.boro_cd;

    // Apply filter to the highlight layer to show the selected district
    map.setFilter('community-districts-highlight', ['==', ['get', 'boro_cd'], clickedDistrict]);

    // Fit the map to the clicked district polygon bounds
    const bounds = getGeometryBounds(e.features[0].geometry);
    if (bounds) {
        map.fitBounds(bounds, {
            padding: {
                top: 40,
                bottom: 40,
                left: 40,
                right: 420
            },
            maxZoom: 12,
            duration: 1000,
            essential: true
        });
    } else {
        map.flyTo({
            center: e.lngLat,
            zoom: 12,
            essential: true
        });
    }

    // Switch UI view: Hide title card, show sidebar
    document.getElementById('title-card').classList.add('hidden');
    const sidebar = document.getElementById('sidebar');
    const sidebarContent = document.getElementById('sidebar-content');
    sidebar.classList.remove('hidden');

    // Show the point layer and display only points inside the selected district
    if (map.getLayer('centers-layer')) {
        map.setLayoutProperty('centers-layer', 'visibility', 'visible');
        map.setFilter('centers-layer', ['within', e.features[0].geometry]);
    }

    // Filter the centerData to show only the point centers in the clicked district polygon
    if (centerData) {
        const districtPolygon = e.features[0].geometry;
        const filteredCenters = centerData.features.filter(feature => {
            return pointInPolygon(feature.geometry.coordinates, districtPolygon);
        });

        if (filteredCenters.length > 0) {
            let html = `<h2>Community Food Connection Centers in Community District ${clickedDistrict}</h2>`;

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
            sidebarContent.innerHTML = `<h2>District ${clickedDistrict}</h2><p>No centers found in this district.</p>`;
        }
    }
});


// --- SIDEBAR CLOSE LOGIC ---
const closeBtn = document.getElementById('close-sidebar');

if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
        // Prevents the map click event from firing when the close button is clicked
        e.stopPropagation();

        const sidebar = document.getElementById('sidebar');
        sidebar.classList.add('hidden');
        
        // Return UI to original state
        document.getElementById('title-card').classList.remove('hidden');
        
        // Reset map view
        map.flyTo({
            center: [-74.006, 40.7128],
            zoom: 10,
            essential: true
        });

        // Hide the point layer again and reset its filter
        if (map.getLayer('centers-layer')) {
            map.setLayoutProperty('centers-layer', 'visibility', 'none');
            map.setFilter('centers-layer', ['==', ['get', 'Center'], '']);
        }

        // Clear the district highlight
        map.setFilter('community-districts-highlight', ['==', ['get', 'boro_cd'], '']);
    });
}

// Global cursor changes and hover highlight for district fill layer
map.on('mouseenter', 'community-districts-fill', () => { map.getCanvas().style.cursor = 'pointer'; });

// Hover highlighting with white outline using mousemove
map.on('mousemove', 'community-districts-fill', (e) => {
    if (e.features.length > 0) {
        const hoveredDistrict = e.features[0].properties.boro_cd;
        // Only apply hover highlight if no district is currently selected (sidebar is hidden)
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('hidden')) {
            map.setFilter('community-districts-highlight', ['==', ['get', 'boro_cd'], hoveredDistrict]);
        }
    }
});

map.on('mouseleave', 'community-districts-fill', () => { 
    map.getCanvas().style.cursor = '';
    // Only clear highlight if no district is selected (sidebar is hidden)
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('hidden')) {
        map.setFilter('community-districts-highlight', ['==', ['get', 'boro_cd'], '']);
    }
});

// Helper functions to test whether a point is inside the clicked district polygon
function pointInPolygon(point, polygon) {
    if (!point || !polygon || !Array.isArray(point)) return false;
    if (polygon.type === 'Polygon') {
        return pointInPolygonRing(point, polygon.coordinates[0]);
    }
    if (polygon.type === 'MultiPolygon') {
        return polygon.coordinates.some(poly => pointInPolygonRing(point, poly[0]));
    }
    return false;
}

function pointInPolygonRing(point, ring) {
    const [x, y] = point;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function getGeometryBounds(geometry) {
    if (!geometry || !geometry.type) return null;

    let coords = [];
    if (geometry.type === 'Polygon') {
        coords = geometry.coordinates.flat();
    } else if (geometry.type === 'MultiPolygon') {
        coords = geometry.coordinates.flat(2);
    } else {
        return null;
    }

    const lons = coords.map(coord => coord[0]);
    const lats = coords.map(coord => coord[1]);

    return [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)]
    ];
}