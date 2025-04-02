// Replace with your Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoiYm9zdG9uc2FtNjE3IiwiYSI6ImNtODNlbnBoNzFvaTcyd3FienphaXRma2oifQ.S8oVyPkHgza9vrUBu0nwjQ';

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/light-v11',
    center: [-71.0627, 42.3522], // Center on US
    zoom: 15,
    cursor: 'grab' // Set default cursor to grab
});

// Add your JavaScript functionality here
// For example:

// Map on load event
map.on('load', function() {
    console.log('Map loaded successfully');
    document.getElementById('status-info').textContent = 'Ready to load data';
});
