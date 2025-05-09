// Fixed version of your map JavaScript code

// Replace with your Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoiYm9zdG9uc2FtNjE3IiwiYSI6ImNtODNlbnBoNzFvaTcyd3FienphaXRma2oifQ.S8oVyPkHgza9vrUBu0nwjQ';

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map',
    hash: true,
    style: 'mapbox://styles/mapbox/light-v11',
    center: [-71.061147, 42.349867], // Center on Boston
    zoom: 16,
    attributionControl: false,
    cursor: 'grab' // Set default cursor to grab
});

map.addControl(
  new MapboxGeocoder({
    accessToken: mapboxgl.accessToken,
    mapboxgl: mapboxgl,
    bbox: [-71.190336,42.240688,-70.985076,42.393463],
    proximity: {
      longitude: -71.080463,
      latitude: 42.330631
    },
    placeholder: 'Search by address'
  }), 'top-left'
);

map.addControl(new mapboxgl.AttributionControl({
  customAttribution: "Office of Emerging Technology"
}));

// Define your environment
const isLocalDevelopment = true; // Change to false before publishing to GitHub

// Define your data paths
const localPointDataPath = './data/regulations_categorized.geojson';
const localLineSegmentDataPath = './data/updated_labeled_curbs.geojson';
const publishedPointDataPath = 'https://raw.githubusercontent.com/OETBoston/neighborhood-curbs/refs/heads/main/data/regulations_categorized.geojson';
const publishedLineSegmentDataPath = 'https://raw.githubusercontent.com/OETBoston/neighborhood-curbs/refs/heads/main/data/updated_labeled_curbs.geojson';

let activeMutcdDescription = null;
let mutcdDescriptions = new Set(); // Will hold unique descriptions

// Initialize all regulation types as active
window.activeRegulationTypes = new Set([
  '2 Hour Parking',
  'No Stopping ',
  'Metered Parking',
  'Resident Parking',
  'Street Cleaning',
  'Tow Zone',
  'Street Cleaning/Snow Emergency'
]);

// Your function to load point data
async function loadPointData() {
  // Choose the right path based on environment
  const pointDataPath = isLocalDevelopment ? localPointDataPath : publishedPointDataPath;
  
  try {
    const response = await fetch(pointDataPath);
    if (!response.ok) {
      throw new Error(`Failed to load point data: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error loading point data:', error);
    // Either rethrow the error
    throw error;
  }
}

function populateMutcdDropdown(pointData) {
  // Clear the set first
  mutcdDescriptions.clear();
  
  // Extract unique MUTCD descriptions from point data
  pointData.features.forEach(feature => {
    if (feature.properties && feature.properties.mutcd_description) {
      // Add non-empty descriptions to the set
      const description = feature.properties.mutcd_description.trim();
      if (description) {
        mutcdDescriptions.add(description);
      }
    }
  });
  
  // Get the dropdown element
  const dropdown = document.getElementById('mutcd-filter');
  if (!dropdown) return;
  
  // Clear existing options (except the first "Show All" option)
  while (dropdown.options.length > 1) {
    dropdown.remove(1);
  }
  
  // Add sorted descriptions to dropdown
  [...mutcdDescriptions].sort().forEach(description => {
    const option = document.createElement('option');
    option.value = description;
    option.textContent = description;
    dropdown.appendChild(option);
  });
  
  // Add change event listener
  dropdown.addEventListener('change', function() {
    activeMutcdDescription = this.value;
    applyFilters();
  });
}

async function loadLineSegmentData() {
  // Choose the right path based on environment
  const lineSegmentDataPath = isLocalDevelopment ? localLineSegmentDataPath : publishedLineSegmentDataPath;
  
  try {
    const response = await fetch(lineSegmentDataPath);
    if (!response.ok) {
      throw new Error(`Failed to load line segment data: ${response.status}`);
    }
    const data = await response.json();
    
    // Add logging here
    console.log('Line segment data loaded:');
    console.log('Total features:', data.features ? data.features.length : 'No features array');
    console.log('Sample feature:', data.features && data.features.length > 0 ? data.features[0] : 'No features');
    
    return data;
  } catch (error) {
    console.error('Error loading line segment data:', error);
    // Either rethrow the error
    throw error;
  }
}

// Function to map regulation types to colors
function getColorForRegulationType(regulationType) {
    // Create a mapping of regulation types to your professional colors
    const regulationColorMap = {
        '2 Hour Parking': '#e15759',
        'No Stopping ': '#76b7b2',
        'Metered Parking': '#af7aa1',
        'Resident Parking': '#f28e2c',
        'Street Cleaning': '#ff9da7',
        'Tow Zone': '#9c755f',
        'Street Cleaning/Snow Emergency': '#e7ba52'
    };

    return regulationColorMap[regulationType] || '#4e79a7'; // Return the color or default
}

// Clean control characters from GeoJSON data
function cleanControlCharacters(geojsonData) {
  // Make a deep copy to avoid modifying the original
  const cleanedData = JSON.parse(JSON.stringify(geojsonData));
  
  // Process each feature
  cleanedData.features.forEach(feature => {
    if (feature.properties) {
      // Clean regulation_type if it exists
      if (feature.properties.regulation_type) {
        feature.properties.regulation_type = 
          feature.properties.regulation_type.replace(/[\u0000-\u001F]/g, '');
      }
      
      // Clean mutcd_description if it exists
      if (feature.properties.mutcd_description) {
        feature.properties.mutcd_description = 
          feature.properties.mutcd_description.replace(/[\u0000-\u001F]/g, '');
      }
    }
  });
  
  return cleanedData;
}


// Complete implementation of renderPointsOnMap
async function renderPointsOnMap(map, pointData = null, options = {}) {
  // Default options
  const defaultOptions = {
    sourceId: 'points-source',
    layerId: 'points-layer',
    markerRadius: 5,
    markerOpacity: 0.8,
    popupEnabled: true
  };
  
  // Merge default options with provided options
  const renderOptions = { ...defaultOptions, ...options };
  
  if (!pointData) {
    try {
      // Step 1-2: Fetch data and wait for it
      const rawData = await loadPointData();
      
      // Step 3: Clean data
      pointData = cleanControlCharacters(rawData);
    } catch (error) {
      console.error('Failed to load or clean point data:', error);
      return;
    }
  }
  
  // Step 4: Add the data source if it doesn't exist
  if (!map.getSource(renderOptions.sourceId)) {
    map.addSource(renderOptions.sourceId, {
      type: 'geojson',
      data: pointData
    });
  } else {
    // Update the data if the source already exists
    map.getSource(renderOptions.sourceId).setData(pointData);
  }

  // After data is loaded and before returning
  if (pointData && pointData.features) {
    populateMutcdDropdown(pointData);
  }
  
  // Step 5: Add the layer if it doesn't exist
  if (!map.getLayer(renderOptions.layerId)) {
    map.addLayer({
      id: renderOptions.layerId,
      type: 'circle',
      source: renderOptions.sourceId,
      paint: {
        'circle-radius': renderOptions.markerRadius,
        'circle-color': [
          'match',
          ['get', 'regulation_type'],
          '2 Hour Parking', '#e15759',
          'No Stopping ', '#76b7b2',
          'Metered Parking', '#af7aa1',
          'Resident Parking', '#f28e2c',
          'Street Cleaning', '#ff9da7',
          'Tow Zone', '#9c755f',
          'Street Cleaning/Snow Emergency', '#e7ba52',
          // Default color
          '#4e79a7'
        ],
        'circle-opacity': renderOptions.markerOpacity,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff'
      }
    });
    
    // If popups are enabled, add click event
    if (renderOptions.popupEnabled) {
      // Create a popup but don't add it to the map yet
      const popup = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: true
      });
      
      // When a click event occurs on a feature in the points layer, open a popup
      map.on('click', renderOptions.layerId, (e) => {
        if (e.features.length === 0) return;
        
        const feature = e.features[0];
        const coordinates = feature.geometry.coordinates.slice();
        const properties = feature.properties;
        
        // Format popup content
        let popupContent = `<h3>${properties.regulation_type || 'Regulation'}</h3>`;
        if (properties.mutcd_description) {
          popupContent += `<p>${properties.mutcd_description}</p>`;
        }
        if (properties.description) {
          popupContent += `<p>${properties.description}</p>`;
        }
        if (properties.directionof_sign_arrow_field) {
          popupContent += `<p><strong>Direction:</strong> ${properties.directionof_sign_arrow_field}</p>`;
        }
        if (properties.special_sign_description_field) {
          popupContent += `<p><strong>Description:</strong> ${properties.special_sign_description_field}</p>`;
        }
        if (properties.cartegraph_id) {
          popupContent += `<p><strong>ID:</strong> ${properties.cartegraph_id}</p>`;
        }
        // Add image thumbnail if available
        if (properties.attachment_public_url) {
          popupContent += `<p><strong>Image:</strong><br>
            <a href="${properties.attachment_public_url}" target="_blank">
              <img src="${properties.attachment_public_url}" 
                style="max-width: 100%; max-height: 150px; margin-top: 5px; border: 1px solid #ccc;"
                alt="Sign photo">
            </a>
          </p>`;
        }
        popupContent += `</div>`;

        
        // Ensure that if the map is zoomed out such that multiple
        // copies of the feature are visible, the popup appears
        // over the copy being pointed to
        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
          coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }
        
        popup
          .setLngLat(coordinates)
          .setHTML(popupContent)
          .addTo(map);
      });
      
      // Change the cursor to a pointer when hovering over the points layer
      map.on('mouseenter', renderOptions.layerId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      
      // Change it back to grab when it leaves
      map.on('mouseleave', renderOptions.layerId, () => {
        map.getCanvas().style.cursor = 'grab';
      });
    }
  }
  
  // Update the legend after points are rendered
  updateLegend();
}


async function renderLineSegmentsOnMap(map, lineData = null, options = {}) {
  console.log('Starting to render line segments');
  
  // Default options
  const defaultOptions = {
    sourceId: 'lines-source',
    layerId: 'lines-layer',
    lineWidth: 3,
    lineOpacity: 0.8,
    popupEnabled: true
  };
  
  // Merge default options with provided options
  const renderOptions = { ...defaultOptions, ...options };
  
  if (!lineData) {
    try {
      // Fetch data and wait for it
      const rawData = await loadLineSegmentData();
      
      // Clean data if needed
      lineData = cleanControlCharacters(rawData);
      console.log('Line data after cleaning:', lineData.features.length);
    } catch (error) {
      console.error('Failed to load or clean line segment data:', error);
      return;
    }
  }
  
  // Log before adding the source
  console.log('About to add/update source with line data');
  
  // Add the data source if it doesn't exist
  if (!map.getSource(renderOptions.sourceId)) {
    map.addSource(renderOptions.sourceId, {
      type: 'geojson',
      data: lineData
    });
    console.log('Created new source for line data');
  } else {
    // Update the data if the source already exists
    map.getSource(renderOptions.sourceId).setData(lineData);
    console.log('Updated existing source with new line data');
  }
  
  // Log before adding the layer
  console.log('About to add/check layer for line data');
  
  // Add the layer if it doesn't exist
  if (!map.getLayer(renderOptions.layerId)) {
    map.addLayer({
      id: renderOptions.layerId,
      type: 'line',
      source: renderOptions.sourceId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-width': renderOptions.lineWidth,
        'line-color': [
          'match',
          ['get', 'regulation_type'],
          '2 Hour Parking', '#e15759',
          'No Stopping ', '#76b7b2',
          'Metered Parking', '#af7aa1',
          'Resident Parking', '#f28e2c',
          'Street Cleaning', '#ff9da7',
          'Tow Zone', '#9c755f',
          'Street Cleaning/Snow Emergency', '#e7ba52',
          // Default color
          '#4e79a7'
        ],
        'line-opacity': renderOptions.lineOpacity
      }
    });
    console.log('Created new layer for line data');
  } else {
    console.log('Line layer already exists');
  }

  // all above it new 
// If popups are enabled, add click event
  if (renderOptions.popupEnabled) {
    // Track current popup
    let currentPopup = null;
    
    // Add click event to show popup
    map.on('click', renderOptions.layerId, (e) => {
      // Get the clicked feature
      const feature = e.features[0];
      if (!feature) return;
      
      const properties = feature.properties;
      
      // Close any existing popup
      if (currentPopup) {
        currentPopup.remove();
      }
      
      // Create a new popup
      const popup = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: '300px'
      });
      
      // Store reference to the popup
      currentPopup = popup;
      
      // Build popup content
      let content = `<div style="font-family: sans-serif;">`;
      content += `<h3 style="margin-top: 0;">Line Segment</h3>`;
      
      // Add ID if available
      if (feature.id) {
        content += `<p><strong>ID:</strong> ${feature.id}</p>`;
      }
      
      // Add any available properties
      for (const [key, value] of Object.entries(properties)) {
        // Skip the color property we added
        if (key === 'segmentColor') continue;
        
        // Skip array or object values to keep the popup clean
        if (typeof value === 'object') continue;
        
        content += `<p><strong>${key}:</strong> ${value}</p>`;
      }
      
      content += `</div>`;
      
      // Set popup content and position
      popup.setLngLat(e.lngLat)
        .setHTML(content)
        .addTo(map);
    });
    
    // Change the cursor to a pointer when hovering over the lines
    map.on('mouseenter', renderOptions.layerId, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    
    // Change it back to grab when it leaves
    map.on('mouseleave', renderOptions.layerId, () => {
      map.getCanvas().style.cursor = 'grab';
    });
  }
  
  console.log('Line segments rendering complete');
}


  

// Function to load and render all data
async function loadAndRenderAllData() {
  try {
    // Load points
    await renderPointsOnMap(map);
    
    // Load lines
    await renderLineSegmentsOnMap(map);
    
    // Apply filters
    applyRegulationTypeFilter();
    
  } catch (error) {
    console.error('Error loading map data:', error);
  }
}

// New function to apply all filters
function applyFilters() {
  // Get layer IDs
  const pointsLayerId = 'points-layer';
  const linesLayerId = 'lines-layer';
  
  // Safety check - make sure the map and layers exist
  if (!map) return;
  
  // If MUTCD description is selected
  if (activeMutcdDescription) {
    // Filter points by MUTCD description
    const mutcdFilter = ['==', ['get', 'mutcd_description'], activeMutcdDescription];
    
    // Apply filter to points
    if (map.getLayer(pointsLayerId)) {
      map.setFilter(pointsLayerId, mutcdFilter);
    }
    
    // Hide lines layer completely
    if (map.getLayer(linesLayerId)) {
      map.setLayoutProperty(linesLayerId, 'visibility', 'none');
    }
  } else {
    // No MUTCD filter - apply regulation type filters
    if (map.getLayer(pointsLayerId)) {
      const pointsFilter = ['in', ['get', 'regulation_type'], ['literal', [...window.activeRegulationTypes]]];
      map.setFilter(pointsLayerId, pointsFilter);
    }
    
    // Show and filter lines layer
    if (map.getLayer(linesLayerId)) {
      map.setLayoutProperty(linesLayerId, 'visibility', 'visible');
      const linesFilter = ['in', ['get', 'regulation_type'], ['literal', [...window.activeRegulationTypes]]];
      map.setFilter(linesLayerId, linesFilter);
    }
  }
}


// Function to apply filter based on selected regulation types
function applyRegulationTypeFilter() {
  // Safety check - make sure the map and layers exist
  if (!map) return;
  
  // Check both layers (points and lines)
  const pointsLayerId = 'points-layer';
  const linesLayerId = 'lines-layer';
  
  // For points layer
  if (map.getLayer(pointsLayerId)) {
    // Create a filter expression for Mapbox
    // This shows only features whose regulation_type is in the activeRegulationTypes set
    const pointsFilter = ['in', ['get', 'regulation_type'], ['literal', [...window.activeRegulationTypes]]];
    
    // Apply the filter
    map.setFilter(pointsLayerId, pointsFilter);
  }
  
  // For lines layer
  if (map.getLayer(linesLayerId)) {
    // Create a filter expression for Mapbox
    const linesFilter = ['in', ['get', 'regulation_type'], ['literal', [...window.activeRegulationTypes]]];
    
    // Apply the filter
    map.setFilter(linesLayerId, linesFilter);
  }
  applyFilters();
}

// Update the legend with regulation types and colors with toggle functionality
function updateLegend() {
  const legendContainer = document.getElementById('legend-items');
  if (!legendContainer) return; // Safety check
  
  legendContainer.innerHTML = '';
  
  // Show the legend section
  const legendSection = document.getElementById('legend');
  if (legendSection) {
    legendSection.style.display = 'block';
  }
  
  // Use the regulation color map we already defined
  const regulationColorMap = {
    '2 Hour Parking': '#e15759',
    'Metered Parking': '#af7aa1',
    'No Stopping ': '#76b7b2',
    'Resident Parking': '#f28e2c',
    'Street Cleaning': '#ff9da7',
    'Tow Zone': '#9c755f',
    'Street Cleaning/Snow Emergency': '#e7ba52'
  };

  // Sort regulation types alphabetically
  const sortedRegulationTypes = Object.keys(regulationColorMap).sort();
  
  // Add each regulation type to the legend with a checkbox
  sortedRegulationTypes.forEach(regType => {
    const color = regulationColorMap[regType];
    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';
    
    // Create checkbox for toggling this regulation type
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = window.activeRegulationTypes.has(regType);
    checkbox.style.marginRight = '5px';
    checkbox.setAttribute('data-regulation', regType);
    checkbox.addEventListener('change', function() {
      if (this.checked) {
        window.activeRegulationTypes.add(regType);
      } else {
        window.activeRegulationTypes.delete(regType);
      }
      
      // Apply the filter to show/hide regulation types
      applyRegulationTypeFilter();
    });
    
    const colorSwatch = document.createElement('span');
    colorSwatch.className = 'legend-color';
    colorSwatch.style.backgroundColor = color;
    colorSwatch.style.display = 'inline-block';
    colorSwatch.style.width = '15px';
    colorSwatch.style.height = '15px';
    colorSwatch.style.marginRight = '5px';
    
    const regTypeLabel = document.createElement('span');
    regTypeLabel.textContent = regType;
    
    legendItem.appendChild(checkbox);
    legendItem.appendChild(colorSwatch);
    legendItem.appendChild(regTypeLabel);
    legendContainer.appendChild(legendItem);
  });
}

// Map on load event handler - main entry point
map.on('load', function() {
  console.log('Map loaded successfully');

  // Automatically load data when map is ready
  loadAndRenderAllData();
});

document.addEventListener('DOMContentLoaded', function() {
  const controlPanel = document.getElementById('control-panel');
  const miniHeader = document.getElementById('mini-header');
  const legend = document.getElementById('legend');
  const expandIcon = document.querySelector('.expand-icon');

  // Show the legend on load
  if (legend) {
    legend.style.display = 'block';
  }

  // Function to update the expand icon
function updateExpandIcon() {
  expandIcon.textContent = controlPanel.classList.contains('collapsed') ? '▲' : '▼'; // Solid triangles
  // or
  // expandIcon.textContent = controlPanel.classList.contains('collapsed') ? '▴' : '▾'; // Smaller triangles
  // or
  // expandIcon.textContent = controlPanel.classList.contains('collapsed') ? '↑' : '↓'; // Standard arrows
}

  // Function to toggle the panel
  function togglePanel() {
    controlPanel.classList.toggle('collapsed');
    updateExpandIcon();
  }

  // Initially set to open, if it's a mobile size, close it first, then open it.
    if (window.innerWidth <= 768) {
        controlPanel.classList.add('collapsed'); // Close it first.
    }
    controlPanel.classList.remove('collapsed'); //Then Open
    updateExpandIcon();

  // Add click listener to the mini header to toggle panel
  if (miniHeader) {
    miniHeader.addEventListener('click', togglePanel);
  }

  // Handle window resize to ensure the panel is open on larger screens,
  // or closed and then reopened on smaller screens, maintaining the initial state.
  window.addEventListener('resize', function() {
    if (window.innerWidth <= 768) {
        controlPanel.classList.add('collapsed'); //Ensure it's collapsed
    }
      controlPanel.classList.remove('collapsed'); // Ensure it's opened
    updateExpandIcon();
  });
});
