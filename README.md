# Web Mapping - NYC Community Food Centers Map

An interactive web map showcasing community food centers by NYC community district, built using Mapbox GL JS. This project was created as part of a web mapping class and features basic interactive components taught in class.

[See it live on Github Pages](https://meo357.github.io/class-4-assignment/)

### Features

- **Interactive Map**: Built with Mapbox GL JS displaying a globe projection centered on New York City
- **Color-Coded Markers**: Each community district is color-coded by NYC borough:
  - 🟢 Brooklyn (Green)
  - 🔵 Queens (Blue)
  - 🔴 The Bronx (Red)
  - 🟠 Staten Island (Orange)
  - 🟣 Manhattan (Purple)
- **Interactive Popups**: Click a community district to see a list of each Community Food Center and their respective locations, open days, and hours. Hover above each highlighted community food center to see its name and address.
- **Floating Legend**: Bottom-right legend shows each borough and their corresponding colors
- **Polished Header**: Eye-catching gradient header with project description and call-to-action
- **Sidebar**: Right sidebar lists the selected community district's corresponding community food centers and their information.

### Files

- `index.html` - Main HTML file
- `style.css` - Stylesheet with custom styling for the map, legend, and header
- `script.js` - Main JavaScript file containing the map configuration, geojson files, and interactive features
- `CFC_ACTIVE_points.geojson` - Geojson file containing community food center data and coordinates
- `Joined_Center_Building.geojson` - Geojson file containing PLUTO polygons for community food center buildings as well and cfc data
- `simplified-community-districts.geojson` - Geojson file containing NYC community district polygons

### Technologies Used

- [Mapbox GL JS v3.20.0](https://docs.mapbox.com/mapbox-gl-js/guides/)
- HTML5
- CSS3
- Vanilla JavaScript

### Getting Started

1. Clone this repository
2. Open `index.html` in a web browser
3. Explore the map and click community districts to find community food centers. 

### About

This map was crowdsourced during a web mapping class, with each student contributing their favorite pizza place. The result is a fun, interactive visualization of pizza preferences across different academic programs at NYU Wagner.