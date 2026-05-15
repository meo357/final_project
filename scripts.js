// Access token for the Mapbox API
mapboxgl.accessToken = 'pk.eyJ1IjoibWVvMzU3IiwiYSI6ImNtb2hpejkxMDAzamUyb29wdnFsMWU2dHUifQ._R2UlSaxpjRNccsoehAQcA'

const bounds = [
    [-74.488201, 40.473903], // Southwest coordinates
    [-73.527870, 40.923268]  // Northeast coordinates
];

// Initialize the Mapbox Map
const map = new mapboxgl.Map({
    container: 'map', // ID of the HTML element
    style: 'mapbox://styles/mapbox/standard', // Map style URL
    maxBounds: bounds,
    config: {
        basemap: {
            theme: "monochrome"
        }
    },
    center: [-74.006, 40.7128], // Starting position [lng, lat] (NYC)
    zoom: 10 // Initial zoom level
})

// 1. THIS IS FOR THE INDIVIDUAL CENTERS (STAYS AS IS)
const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false
});

// 2. THIS IS FOR THE DISTRICT HOVER PREVIEW (NEW NAME)
const districtPopup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    className: 'district-tooltip',
    offset: 15
});

// 3. YOUR DATA VARIABLES
let centerData = null;
let districtStats = null;
let districtStatsMap = {};
let districtSelected = false;

// 4. UI Elements
const titleCard = document.getElementById('title-card');
const toggleBtn = document.getElementById('toggle-card');

// --- UPDATED HOVER LOGIC ---
map.on('mousemove', 'community-districts-fill', (e) => {
    if (e.features.length > 0) {
        const hoveredDistrict = e.features[0].properties.boro_cd;

        if (!districtSelected) {
            map.getCanvas().style.cursor = 'pointer';
            map.setFilter('community-districts-highlight', ['==', ['get', 'boro_cd'], hoveredDistrict]);

            // Show the preview tooltip
            const stats = districtStatsMap[hoveredDistrict];
            if (stats) {
                const displayName = getDistrictDisplayName(stats.GeogName);
                const count = stats.Count;

                districtPopup.setLngLat(e.lngLat)
                    .setHTML(`
                        <div class="tooltip-content">
                            <strong>${displayName}</strong>
                            <p>${count} Food Connection Centers</p>
                        </div>
                    `)
                    .addTo(map);
            }

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
    districtPopup.remove(); // Hide tooltip when leaving district

    if (!districtSelected) {
        map.setFilter('community-districts-highlight', ['==', ['get', 'boro_cd'], '']);
        if (map.getLayer('centers-layer')) {
            map.setLayoutProperty('centers-layer', 'visibility', 'none');
            map.setFilter('centers-layer', ['==', ['get', 'Center'], '']);
        }
    }
});

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
        // Hide the loader once data is ready if CSV is also loaded
        const loader = document.getElementById('loader-wrapper');
        if (loader && districtStats) {
            loader.classList.add('loader-hidden');
        }
    })
    .catch(error => {
        console.error('Error loading data:', error);
    });

// 2b. Fetch the district stats CSV
fetch('./community_district_stats.csv')
    .then(response => response.text())
    .then(text => {
        districtStats = parseCsv(text);
        districtStatsMap = {};
        districtStats.forEach(row => {
            if (row.boro_cd) {
                districtStatsMap[row.boro_cd] = row;
            }
        });
        const loader = document.getElementById('loader-wrapper');
        if (loader && centerData) {
            loader.classList.add('loader-hidden');
        }
    })
    .catch(error => {
        console.error('Error loading stats CSV:', error);
    });

function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    if (!lines.length) return [];

    const headers = lines[0].split(',').map(header => header.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const values = [];
        let current = '';
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                if (inQuotes && line[j + 1] === '"') {
                    current += '"';
                    j++;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }

            if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
                continue;
            }

            current += char;
        }

        values.push(current);

        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] !== undefined ? values[index].trim() : '';
        });

        rows.push(row);
    }

    return rows;
}

function getDistrictDisplayName(geogName) {
    if (!geogName) return '';
    // Remove leading code like MN01 and remove trailing parenthetical text
    const cleaned = geogName.replace(/^[A-Z]{2}\d{2}\s*/, '').replace(/\s*\([^)]*\)$/, '').trim();
    return cleaned;
}

function formatNumber(value) {
    if (value === undefined || value === null || value === '') return 'N/A';
    const parsed = Number(String(value).replace(/[^0-9.-]+/g, ''));
    return Number.isFinite(parsed) ? parsed.toLocaleString() : String(value);
}

function formatCurrency(value) {
    if (value === undefined || value === null || value === '') return 'N/A';
    const parsed = Number(String(value).replace(/[^0-9.-]+/g, ''));
    return Number.isFinite(parsed) ? '$' + parsed.toLocaleString() : String(value);
}

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

    // Layer: Red highlight for hovered points
    map.addLayer({
        id: 'centers-layer-hovered',
        type: 'circle',
        source: 'centers-points',
        layout: { 'visibility': 'none' },
        paint: {
            'circle-radius': 6,
            'circle-color': 'yellow',
            'circle-stroke-width': 2,
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
            maxZoom: 10,
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
    if (map.getLayer('centers-layer-hovered')) {
        map.setLayoutProperty('centers-layer-hovered', 'visibility', 'none');
        map.setFilter('centers-layer-hovered', ['==', ['get', 'Center'], '']);
    }
    districtSelected = true;

    // Filter sidebar list
    if (centerData) {
        const districtPolygon = e.features[0].geometry;
        const filteredCenters = centerData.features.filter(feature => {
            return pointInPolygon(feature.geometry.coordinates, districtPolygon);
        });

        const stats = districtStatsMap[clickedDistrict];
        let statsHtml = '';
        if (stats) {
            statsHtml = `
                <div class="sidebar-stats">
                    <div class="stats-row">
                        <strong>Neighborhood:</strong>
                        <span>${getDistrictDisplayName(stats.GeogName)}</span>
                    </div>
                    <div class="stats-row">
                        <strong>Centers in District:</strong>
                        <span>${formatNumber(stats.Count)}</span>
                    </div>
                    <div class="stats-row">
                        <strong>Population:</strong>
                        <span>${formatNumber(stats.Population)}</span>
                    </div>
                    <div class="stats-row">
                        <strong>Median Household Income:</strong>
                        <span>${formatCurrency(stats['Median Household income'])}</span>
                    </div>
                    <div class="stats-row">
                        <strong>Households on SNAP:</strong>
                        <span>${formatNumber(stats.SNAP)}</span>
                    </div>
                    <div class="stats-row">
                        <strong>Population Below Poverty Level:</strong>
                        <span>${formatNumber(stats['Below Poverty level'])}</span>
                    </div>
                </div>
            `;
        }

        
        let html = `<h2 style="position: sticky; top: 0; text-align: center; background: white; padding: 15px; margin: -20px -15px -15px; border-bottom: 1px solid #ddd; z-index: 10;font-size: 1.2rem;">CFC Centers in<br>Community District ${clickedDistrict}</h2>`;
        html += statsHtml;

        
        
        if (filteredCenters.length > 0) {
            html += `<p class="instruction-text">Click on a center to learn more</p>`;
            html += `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 15px;">`;
            filteredCenters.forEach(center => {
                const props = center.properties;
                html += `
                    <div class="center-entry" data-center-name="${props.Center || 'Unknown Center'}">
                        <h3>${props.Center || 'Unknown Center'}</h3>
                    </div>
                `;
            });
            html += `</div>`;
            sidebarContent.innerHTML = html;

            let selectedCard = null;

            // Add hover and click listeners to cards
            document.querySelectorAll('.center-entry').forEach(card => {
                card.addEventListener('mouseenter', () => {
                    // Only trigger hover effects if this specific card isn't the one already selected
                    if (selectedCard === card) return;

                    const centerName = card.getAttribute('data-center-name');
                    map.setFilter('centers-layer-hovered', ['==', ['get', 'Center'], centerName]);
                    map.setLayoutProperty('centers-layer-hovered', 'visibility', 'visible');
                });

                card.addEventListener('mouseleave', () => {
                    // Only reset map if this card isn't the one currently selected
                    if (selectedCard === card) return;

                    map.setLayoutProperty('centers-layer-hovered', 'visibility', 'none');
                    map.setFilter('centers-layer-hovered', ['==', ['get', 'Center'], '']);
                });

                card.addEventListener('click', () => {
                    const centerName = card.getAttribute('data-center-name');
                    const centerFeature = filteredCenters.find(f => f.properties.Center === centerName);

                    if (selectedCard === card) {
                        // DESELECT: User clicked the same card again
                        selectedCard.classList.remove('selected');
                        selectedCard = null;
                        map.setLayoutProperty('centers-layer-hovered', 'visibility', 'none');
                        popup.remove();
                    } else {
                        // SELECT NEW: Clear old selection class and set new one
                        if (selectedCard) {
                            selectedCard.classList.remove('selected');
                        }
                        selectedCard = card;
                        card.classList.add('selected');

                        // Map highlights and Popup logic
                        map.setFilter('centers-layer-hovered', ['==', ['get', 'Center'], centerName]);
                        map.setLayoutProperty('centers-layer-hovered', 'visibility', 'visible');

                        if (centerFeature) {
                            const props = centerFeature.properties;
                            popup.setLngLat(centerFeature.geometry.coordinates)
                                .setHTML(`
                        <div style="text-align: center; font-family: sans-serif;">
                            <h3 style="margin: 0 0 4px 0; font-size: 14px;">${props.Center || 'Unknown'}</h3>
                            <p style="margin: 0; font-size: 12px; color: #666;">${props.Address || ''}</p>
                            <p style="margin: 0; font-size: 12px; color: #666;">${props.Phone || ''}</p>
                            <p style="margin: 0; font-size: 12px; color: #666;">${props.Days || ''}</p>
                            <p style="margin: 0; font-size: 12px; color: #666;">${props.Hours || ''}</p>
                        </div>
                    `)
                                .addTo(map);
                        }
                    }
                });
            });
            /* --- TO HERE --- */


        }
    }
         else {
    sidebarContent.innerHTML = `${html}<p style="margin-top: 15px;">There are no community food centers in this district.</p>`;
};
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
            center: [-74.006, 40.7128], // Exact initial longitude and latitude
            zoom: 10,                   // Exact initial zoom level
            padding: { top: 0, bottom: 0, left: 0, right: 0 },
            pitch: 0,                   // Reset pitch to flat view
            bearing: 0,                 // Reset rotation to North
            essential: true
        });

        // Hide centers and clear highlight
        if (map.getLayer('centers-layer')) {
            map.setLayoutProperty('centers-layer', 'visibility', 'none');
            map.setFilter('centers-layer', ['==', ['get', 'Center'], '']);
            map.setPaintProperty('centers-layer', 'circle-radius', 6);
        }
        if (map.getLayer('centers-layer-hovered')) {
            map.setLayoutProperty('centers-layer-hovered', 'visibility', 'none');
            map.setFilter('centers-layer-hovered', ['==', ['get', 'Center'], '']);
        }
        popup.remove();
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
            if (map.getLayer('centers-layer-hovered')) {
                map.setLayoutProperty('centers-layer-hovered', 'visibility', 'none');
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
        if (map.getLayer('centers-layer-hovered')) {
            map.setLayoutProperty('centers-layer-hovered', 'visibility', 'none');
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

Promise.all([
    fetch('./simplified-community-districts.json').then(res => res.json()),
    fetch('CFC_ACTIVE_points.geojson').then(res => res.json()),
    fetch('community_district_stats.csv').then(res => res.text())
]).then(([districts, centers, csvData]) => {

    // ... (your data processing logic here) ...

    // CRITICAL: This line must be reached to hide the spinner!
    document.getElementById('loader-wrapper').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('loader-wrapper').style.display = 'none';
    }, 500);

}).catch(err => {
    console.error("Error loading data:", err);
    // If there is an error, hide the loader anyway so the user isn't stuck
    document.getElementById('loader-wrapper').style.display = 'none';
});