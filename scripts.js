// --- 1. INITIALIZATION & SETUP ---

// Access token required to authenticate with the Mapbox API
mapboxgl.accessToken = 'pk.eyJ1IjoibWVvMzU3IiwiYSI6ImNtb2hpejkxMDAzamUyb29wdnFsMWU2dHUifQ._R2UlSaxpjRNccsoehAQcA'

// Restrict the map panning so users can't scroll infinitely away from NYC
const bounds = [
    [-74.488201, 40.473903], // Southwest boundary
    [-73.527870, 40.923268]  // Northeast boundary
];

// Initialize the main Mapbox instance
const map = new mapboxgl.Map({
    container: 'map', // Hooks into the <div id="map">
    style: 'mapbox://styles/mapbox/standard', // Mapbox Standard base style
    maxBounds: bounds, // Apply the boundary restrictions
    config: {
        basemap: {
            theme: "monochrome" // Use grayscale map to make data pop
        }
    },
    center: [-74.006, 40.7128], // Start directly over NYC
    zoom: 10 // Start zoomed out to see all 5 boroughs
});

// Create popup for individual point locations (shows address, hours, etc.)
const popup = new mapboxgl.Popup({
    closeButton: false, // Hide the default 'x'
    closeOnClick: false // Keep open until the user mouses away
});

// Create popup for district hover state (shows neighborhood name & center count)
const districtPopup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    className: 'district-tooltip', // Custom CSS class for styling
    offset: 15 // Float slightly above the cursor
});

// --- 2. GLOBAL STATE VARIABLES ---
// These variables hold data fetched from your files so the entire script can access them
let centerData = null; // Holds the point GeoJSON
let districtStats = null; // Holds the parsed CSV rows as an array of objects
let districtStatsMap = {}; // A dictionary/lookup map (Key: boro_cd -> Value: CSV Row Object)
let districtSelected = false; // Tracks if the map is currently locked onto a specific district
let districtsGeoJSON = null; // Holds the polygon GeoJSON for searching and bounds calculation

// DOM Elements
const titleCard = document.getElementById('title-card');
const toggleBtn = document.getElementById('toggle-card');

// --- 3. EVENT LISTENERS: HOVER LOGIC ---

// Triggers when the mouse moves over a polygon in the 'community-districts-fill' layer
map.on('mousemove', 'community-districts-fill', (e) => {
    if (e.features.length > 0) {
        const hoveredDistrict = e.features[0].properties.boro_cd;

        // Only show hover effects if the user hasn't already clicked into a specific district
        if (!districtSelected) {
            map.getCanvas().style.cursor = 'pointer'; // Change cursor to a hand

            // Highlight the currently hovered polygon using a Mapbox filter
            map.setFilter('community-districts-highlight', ['==', ['get', 'boro_cd'], hoveredDistrict]);

            // Retrieve the stats for this district to populate the tooltip
            const stats = districtStatsMap[hoveredDistrict];
            if (stats) {
                const displayName = getDistrictDisplayName(stats.GeogName);
                const count = stats.Count;

                // Update the tooltip HTML and position it at the mouse cursor (e.lngLat)
                districtPopup.setLngLat(e.lngLat)
                    .setHTML(`
                        <div class="tooltip-content">
                            <strong>${displayName}</strong>
                            <p>${count} Food Connection Centers</p>
                        </div>
                    `)
                    .addTo(map);
            }

            // Preview the yellow center dots for just this hovered district
            if (map.getLayer('centers-layer')) {
                map.setLayoutProperty('centers-layer', 'visibility', 'visible');
                // Only show dots that physically sit inside the hovered polygon geometry
                map.setFilter('centers-layer', ['within', e.features[0].geometry]);
                map.setPaintProperty('centers-layer', 'circle-radius', 3.5); // Make preview dots slightly smaller
            }
        }
    }
});

// Triggers when the mouse leaves a district polygon
map.on('mouseleave', 'community-districts-fill', () => {
    map.getCanvas().style.cursor = ''; // Revert cursor
    districtPopup.remove(); // Hide hover tooltip

    if (!districtSelected) {
        // Clear the white highlight border
        map.setFilter('community-districts-highlight', ['==', ['get', 'boro_cd'], '']);
        // Hide the yellow dots preview
        if (map.getLayer('centers-layer')) {
            map.setLayoutProperty('centers-layer', 'visibility', 'none');
            map.setFilter('centers-layer', ['==', ['get', 'Center'], '']);
        }
    }
});

// --- 4. UI INTERACTIVITY ---

// Title Card Collapse/Expand Button
if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        titleCard.classList.toggle('minimized'); // Toggles the CSS class that hides the inner text
    });
}

// --- 5. DATA FETCHING & PARSING ---

// Note: These fetches happen asynchronously while the map is loading

// Fetch point locations (Food Centers)
fetch('./CFC_ACTIVE_points.geojson')
    .then(response => response.json())
    .then(data => {
        centerData = data;
        // Check if both datasets are loaded to remove the loading screen
        const loader = document.getElementById('loader-wrapper');
        if (loader && districtStats) loader.classList.add('loader-hidden');
    })
    .catch(error => console.error('Error loading data:', error));

// Fetch demographic and statistical data (CSV)
fetch('./community_district_stats.csv')
    .then(response => response.text())
    .then(text => {
        districtStats = parseCsv(text); // Convert string to JS Objects

        // Build the fast-lookup dictionary using boro_cd as the Key
        districtStatsMap = {};
        districtStats.forEach(row => {
            if (row.boro_cd) districtStatsMap[row.boro_cd] = row;
        });

        const loader = document.getElementById('loader-wrapper');
        if (loader && centerData) loader.classList.add('loader-hidden');
    })
    .catch(error => console.error('Error loading stats CSV:', error));

/**
 * Custom CSV parser to handle strings that might contain commas within quotes (e.g. "$50,000")
 */
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

        // Iterate through each character to respect quotation marks
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                if (inQuotes && line[j + 1] === '"') {
                    current += '"';
                    j++; // Skip escaped quote
                } else {
                    inQuotes = !inQuotes; // Toggle quote state
                }
                continue;
            }

            // If we hit a comma AND we are not inside quotes, split the value
            if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
                continue;
            }
            current += char;
        }

        values.push(current); // Push final value of the row

        // Map values to their respective header columns
        const row = {};
        headers.forEach((header, index) => {
            row[header] = values[index] !== undefined ? values[index].trim() : '';
        });
        rows.push(row);
    }
    return rows;
}

// Utility: Cleans up the raw neighborhood name from the CSV (e.g., "MN01 Financial District (CD 1)" -> "Financial District")
function getDistrictDisplayName(geogName) {
    if (!geogName) return '';
    return geogName.replace(/^[A-Z]{2}\d{2}\s*/, '').replace(/\s*\([^)]*\)$/, '').trim();
}

// Utility: Safely formats raw numbers into comma-separated strings (e.g., 10000 -> "10,000")
function formatNumber(value) {
    if (value === undefined || value === null || value === '') return 'N/A';
    const parsed = Number(String(value).replace(/[^0-9.-]+/g, ''));
    return Number.isFinite(parsed) ? parsed.toLocaleString() : String(value);
}

// Utility: Safely formats raw numbers into currency (e.g., 50000 -> "$50,000")
function formatCurrency(value) {
    if (value === undefined || value === null || value === '') return 'N/A';
    const parsed = Number(String(value).replace(/[^0-9.-]+/g, ''));
    return Number.isFinite(parsed) ? '$' + parsed.toLocaleString() : String(value);
}

// --- 6. MAP LOAD EVENT: ADDING SOURCES & LAYERS ---

// Map layers dictate how data visually renders on the screen.
map.on('load', () => {
    // 1. Source: The geographical polygons for community districts
    map.addSource('community-districts', {
        type: 'geojson',
        data: './simplified-community-districts.json'
    });

    // Layer: The base fill colors for the boroughs
    map.addLayer({
        id: 'community-districts-fill',
        type: 'fill',
        source: 'community-districts',
        paint: {
            // Match expressions map a specific data value to a color
            // ['slice', ['get', 'boro_cd'], 0, 1] gets the FIRST digit of the district ID to determine the borough
            'fill-color': [
                'match',
                ['slice', ['get', 'boro_cd'], 0, 1],
                '1', '#8c56e2', // Manhattan
                '2', '#863e3e', // Bronx
                '3', '#73e8c7', // Brooklyn
                '4', '#44aae1', // Queens
                '5', '#7d7e52', // Staten Island
                '#1e293b'       // Default fallback
            ],
            'fill-opacity': 0.3
        }
    });

    // Layer: The thick white border that appears when hovering/clicking a district
    map.addLayer({
        id: 'community-districts-highlight',
        type: 'line',
        source: 'community-districts',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': 'white', 'line-width': 8 },
        filter: ['==', ['get', 'boro_cd'], ''] // Initially hidden (matches empty string)
    });

    // Layer: Thin border separating all districts permanently
    map.addLayer({
        id: 'community-districts-border',
        type: 'line',
        source: 'community-districts',
        paint: { 'line-color': '#074580', 'line-width': 1, 'line-opacity': 0.8 }
    });

    // 2. Source: Point data for Food Centers
    map.addSource('centers-points', {
        type: 'geojson',
        data: 'CFC_ACTIVE_points.geojson'
    });

    // Layer: The actual yellow dots representing centers
    map.addLayer({
        id: 'centers-layer',
        type: 'circle',
        source: 'centers-points',
        layout: { 'visibility': 'none' }, // Hidden until a district is hovered/clicked
        paint: {
            'circle-radius': 6,
            'circle-color': 'yellow',
            'circle-stroke-width': 1,
            'circle-stroke-color': '#333',
            'circle-opacity': 0.95
        }
    });

    // Layer: A copy of the point layer specifically used to highlight a single dot in red when a sidebar card is hovered
    map.addLayer({
        id: 'centers-layer-hovered',
        type: 'circle',
        source: 'centers-points',
        layout: { 'visibility': 'none' },
        paint: {
            'circle-radius': 6,
            'circle-color': 'yellow', // Could be changed to red if desired
            'circle-stroke-width': 2,
            'circle-stroke-color': '#333',
            'circle-opacity': 0.95
        }
    });

    // Point Layer Interaction: Show detailed popup when hovering a yellow dot
    map.on('mouseenter', 'centers-layer', (e) => {
        if (!districtSelected) return; // Prevent triggering if map isn't locked in

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

// --- 7. CORE LOGIC: DISTRICT SELECTION ---

/**
 * Handles all visual and logic updates when a district is selected.
 * Used by both map click events AND search bar selections.
 * @param {Object} feature - The GeoJSON feature of the selected district polygon
 */
function activateDistrict(feature) {
    const clickedDistrict = feature.properties.boro_cd;

    // Minimize the title card to get it out of the way
    if (titleCard) titleCard.classList.add('minimized');

    // Lock in the white highlight border for the chosen district
    map.setFilter('community-districts-highlight', ['==', ['get', 'boro_cd'], clickedDistrict]);

    // Calculate the physical edges of the polygon and tell the map to zoom to fit those edges
    const bounds = getGeometryBounds(feature.geometry);
    if (bounds) {
        map.fitBounds(bounds, {
            // Padding prevents the zoomed polygon from hiding behind the open sidebar UI
            padding: { top: 40, bottom: 40, left: 40, right: 420 },
            duration: 1000, // 1 second animation
            maxZoom: 14, // Allowed to zoom in closely (fixes fitBounds issue)
            essential: true
        });
    }

    // Slide open the sidebar
    const sidebar = document.getElementById('sidebar');
    const sidebarContent = document.getElementById('sidebar-content');
    sidebar.classList.remove('hidden');
    
    //Ensures sidebar scrolls to top when a new district is selected, so users don't get stuck if they were previously scrolled down on a different district
    sidebar.scrollTop = 0;

    // Ensure points are visible, but ONLY points physically inside the selected polygon
    if (map.getLayer('centers-layer')) {
        map.setLayoutProperty('centers-layer', 'visibility', 'visible');
        map.setFilter('centers-layer', ['within', feature.geometry]);
    }

    // Reset specific point hover states
    if (map.getLayer('centers-layer-hovered')) {
        map.setLayoutProperty('centers-layer-hovered', 'visibility', 'none');
        map.setFilter('centers-layer-hovered', ['==', ['get', 'Center'], '']);
    }
    districtSelected = true;

    // Build the Sidebar Content dynamically
    if (centerData) {
        const districtPolygon = feature.geometry;

        // Find all point coordinates that mathematically fall inside the polygon
        const filteredCenters = centerData.features.filter(f => {
            return pointInPolygon(f.geometry.coordinates, districtPolygon);
        });

        // Generate the HTML for the demographics (from the CSV data)
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

        // Header
        let html = `<h2 style="position: sticky; top: 0; text-align: center; background: white; padding: 15px; margin: -20px -15px -15px; border-bottom: 1px solid #ddd; z-index: 10;font-size: 1.2rem;">CFC Centers in<br>Community District ${clickedDistrict}</h2>`;
        html += statsHtml;

        // Generate the grid of specific location cards
        if (filteredCenters.length > 0) {
            html += `<p class="instruction-text">Click on a center to learn more</p>`;
            html += `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 15px;">`;

            filteredCenters.forEach(center => {
                const props = center.properties;
                // Add a data attribute so we can link the card back to the map point later
                html += `
                    <div class="center-entry" data-center-name="${props.Center || 'Unknown Center'}">
                        <h3>${props.Center || 'Unknown Center'}</h3>
                    </div>
                `;
            });
            html += `</div>`;
            sidebarContent.innerHTML = html;

            let selectedCard = null; // Tracks which card in the sidebar is active

            // Attach interactivity to the newly created sidebar cards
            document.querySelectorAll('.center-entry').forEach(card => {

                // Hovering the card highlights the corresponding dot on the map
                card.addEventListener('mouseenter', () => {
                    if (selectedCard === card) return; // Skip if already selected
                    const centerName = card.getAttribute('data-center-name');
                    map.setFilter('centers-layer-hovered', ['==', ['get', 'Center'], centerName]);
                    map.setLayoutProperty('centers-layer-hovered', 'visibility', 'visible');
                });

                // Leaving the card removes the map highlight
                card.addEventListener('mouseleave', () => {
                    if (selectedCard === card) return;
                    map.setLayoutProperty('centers-layer-hovered', 'visibility', 'none');
                    map.setFilter('centers-layer-hovered', ['==', ['get', 'Center'], '']);
                });

                // Clicking the card "locks" the map highlight and opens the map popup
                card.addEventListener('click', () => {
                    const centerName = card.getAttribute('data-center-name');
                    const centerFeature = filteredCenters.find(f => f.properties.Center === centerName);

                    // Toggle off if clicking the already selected card
                    if (selectedCard === card) {
                        selectedCard.classList.remove('selected');
                        selectedCard = null;
                        map.setLayoutProperty('centers-layer-hovered', 'visibility', 'none');
                        popup.remove();
                    } else {
                        // Switch active state to the new card
                        if (selectedCard) selectedCard.classList.remove('selected');
                        selectedCard = card;
                        card.classList.add('selected');

                        // Show highlight on map
                        map.setFilter('centers-layer-hovered', ['==', ['get', 'Center'], centerName]);
                        map.setLayoutProperty('centers-layer-hovered', 'visibility', 'visible');

                        // Move and populate the popup
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
                            `).addTo(map);
                        }
                    }
                });
            });
        } else {
            sidebarContent.innerHTML = `${html}<p style="margin-top: 15px; text-align: center;">There are no community food centers in this district.</p>`;
        }
    }
}

// Map Click: When user physically clicks the map, grab the polygon data and run activateDistrict
map.on('click', 'community-districts-fill', (e) => {
    activateDistrict(e.features[0]);
});

// --- 8. SEARCH BAR LOGIC ---

const searchInput = document.getElementById('district-search');
const searchResults = document.getElementById('search-results');

if (searchInput && searchResults) {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        searchResults.innerHTML = ''; // Clear old results

        // Don't search until the user types at least 2 characters
        if (query.length < 2 || !districtStats) {
            searchResults.classList.add('hidden');
            return;
        }

        // Find matches in the CSV demographic dataset
        const matches = districtStats.filter(stat => {
            if (!stat.boro_cd || !stat.GeogName) return false;

            const rawName = stat.GeogName.toLowerCase();
            const cleanName = getDistrictDisplayName(stat.GeogName).toLowerCase();
            const boroCd = String(stat.boro_cd);

            // Check if the query matches the ID, the clean name, or the raw name
            return rawName.includes(query) || cleanName.includes(query) || boroCd.includes(query);
        });

        // Build the dropdown list
        if (matches.length > 0) {
            matches.forEach(match => {
                const li = document.createElement('li');
                const cleanName = getDistrictDisplayName(match.GeogName);
                li.innerHTML = `<strong>${cleanName}</strong> (CD ${match.boro_cd})`;

                // When an item is selected from the list
                li.addEventListener('click', () => {
                    if (districtsGeoJSON) {
                        // Find the geographical polygon matching the selected ID
                        const feature = districtsGeoJSON.features.find(f => f.properties.boro_cd === match.boro_cd);
                        if (feature) {
                            activateDistrict(feature); // Trigger the map zoom & sidebar!
                        }
                    }
                    // Reset UI
                    searchInput.value = '';
                    searchResults.classList.add('hidden');
                });
                searchResults.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = "No matches found";
            li.className = "no-matches";
            searchResults.appendChild(li);
        }

        searchResults.classList.remove('hidden'); // Show dropdown
    });

    // UX: Close the dropdown if the user clicks anywhere else on the screen
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            searchResults.classList.add('hidden');
        }
    });
}

// --- 9. RESET / CLOSE LOGIC ---

const closeBtn = document.getElementById('close-sidebar');

if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        // Hide sidebar
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.add('hidden');

        // Restore Title Card to its open state
        if (titleCard) titleCard.classList.remove('minimized');

        // Pan map back to initial starting view of full NYC
        map.flyTo({
            center: [-74.006, 40.7128],
            zoom: 10,
            padding: { top: 0, bottom: 0, left: 0, right: 0 },
            pitch: 0,
            bearing: 0,
            essential: true
        });

        // Hide centers and clear all visual highlights
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
        districtSelected = false; // Unlock map interaction state
        map.setFilter('community-districts-highlight', ['==', ['get', 'boro_cd'], '']);
    });
}

// --- 10. MATH HELPERS (Geospatial logic) ---

/**
 * Mathematical algorithm to determine if a specific [Lng, Lat] point
 * falls physically inside the boundaries of a GeoJSON polygon array.
 * Used to filter points for the sidebar.
 */
function pointInPolygon(point, polygon) {
    if (!point || !polygon || !Array.isArray(point)) return false;
    if (polygon.type === 'Polygon') return pointInPolygonRing(point, polygon.coordinates[0]);
    if (polygon.type === 'MultiPolygon') return polygon.coordinates.some(poly => pointInPolygonRing(point, poly[0]));
    return false;
}

// Ray-casting algorithm checking edge intersection counts
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

/**
 * Calculates the bounding box (Southwest and Northeast corners) of a complex polygon.
 * Used by map.fitBounds() to zoom exactly to a district's edges.
 */
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

// --- 11. INITIAL PROMISE CHAIN ---
// Wait for everything to load, save the polygons for search, then hide the spinner
Promise.all([
    fetch('./simplified-community-districts.json').then(res => res.json()),
    fetch('CFC_ACTIVE_points.geojson').then(res => res.json()),
    fetch('community_district_stats.csv').then(res => res.text())
]).then(([districts, centers, csvData]) => {

    districtsGeoJSON = districts; // Save map boundaries for search bar lookups

    // Fade out the loading screen
    document.getElementById('loader-wrapper').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('loader-wrapper').style.display = 'none';
    }, 500);

}).catch(err => {
    console.error("Error loading data:", err);
    document.getElementById('loader-wrapper').style.display = 'none'; // Ensure user isn't stuck
});