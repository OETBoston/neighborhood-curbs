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

// Map on load event
map.on('load', function() {
    console.log('Map loaded successfully');
    document.getElementById('status-info').textContent = 'Ready to load data';

    // Automatically load data when map is ready
    loadAndRenderAllData();
});


// Define your environment
const isLocalDevelopment = true; // Change to false before publishing to GitHub

// Define your data paths
const localPointDataPath = './data/regulations_categorized.geojson';
const localLineSegmentDataPath = './data/updated_labeled_curbs.geojson';
const publishedPointDataPath = 'https://raw.githubusercontent.com/OETBoston/neighborhood-curbs/refs/heads/main/data/regulations_categorized.geojson';
const publishedLineSegmentDataPath = 'https://raw.githubusercontent.com/OETBoston/neighborhood-curbs/refs/heads/main/data/updated_labeled_curbs.geojson';

// Initialize all regulation types as active
window.activeRegulationTypes = new Set([
  '2 Hour Parking',
  'No Stopping',
  'Other',
  'ParkBoston/Metered',
  'Resident Parking',
  'Street Cleaning',
  'Tow Zone',
  'Tow Zone: Street Cleaning/Snow Emergency',
  'nan'
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
    // OR return a default/empty value
    // return [];
  }
}

// Your function to load line segment data
async function loadLineSegmentData() {
  // Choose the right path based on environment
  const lineSegmentDataPath = isLocalDevelopment ? localLineSegmentDataPath : publishedLineSegmentDataPath;
  
  try {
    const response = await fetch(lineSegmentDataPath);
    if (!response.ok) {
      throw new Error(`Failed to load line segment data: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error loading line segment data:', error);
    // Either rethrow the error
    throw error;
    // OR return a default/empty value
    // return [];
  }
}

// Function to map regulation types to colors (if not already defined in sign properties)
        function getColorForRegulationType(regulationType) {
            // Create a mapping of regulation types to your professional colors
            const regulationColorMap = {
                '2 Hour Parking': '#e15759',
                'No Stopping': '#f28e2c',
                'Other': '#4e79a7',
                'ParkBoston/Metered': '#af7aa1',
                'Resident Parking': '#76b7b2',
                'Street Cleaning': '#ff9da7',
                'Tow Zone': '#9c755f',
                'Tow Zone: Street Cleaning/Snow Emergency': '#e7ba52',
                'nan': '#bab0ab'
                // Add more mappings as needed
            };

            return regulationColorMap[regulationType] || '#4e79a7'; // Return the color or default
        }

        // Fix for the cleanControlCharacters function
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
          
          return cleanedData; // Fixed: return the cleaned data
        }



        // Sequence in your render function
                async function renderPointsOnMap(map, pointData = null, options = {}) {
                  if (!pointData) {
                    try {
                      // Step 1-2: Fetch data and wait for it
                      const rawData = await loadPointData();
                      
                      // Step 3: Clean data (synchronous operation)
                      pointData = cleanPointData(rawData);
                    } catch (error) {
                      console.error('Failed to load or clean point data:', error);
                      return [];
                    }
                  }
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
              document.getElementById('status-info').textContent = 'Error loading point data';
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
                  'No Stopping', '#f28e2c',
                  'ParkBoston/Metered', '#af7aa1',
                  'Resident Parking', '#76b7b2',
                  'Street Cleaning', '#ff9da7',
                  'Tow Zone', '#9c755f',
                  'Tow Zone: Street Cleaning/Snow Emergency', '#e7ba52',
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
            document.getElementById('status-info').textContent = 'Point data loaded successfully';
         }

              // NEW CODE: Update the legend after points are rendered
                updateLegend();
        }

        
              // When a click event occurs on a feature in the lines layer, open a popup
              map.on('click', renderOptions.layerId, (e) => {
                if (e.features.length === 0) return;
                
                const feature = e.features[0];
                const coordinates = e.lngLat;
                const properties = feature.properties;
                
                // Format popup content
                let popupContent = `<h3>${properties.regulation_type || 'Regulation'}</h3>`;
                if (properties.mutcd_description) {
                  popupContent += `<p>${properties.mutcd_description}</p>`;
                }
                if (properties.description) {
                  popupContent += `<p>${properties.description}</p>`;
                }
                
                popup
                  .setLngLat(coordinates)
                  .setHTML(popupContent)
                  .addTo(map);
              });

              // Change the cursor to a pointer when hovering over the lines layer
              map.on('mouseenter', renderOptions.layerId, () => {
                map.getCanvas().style.cursor = 'pointer';
              });
              
              // Change it back to grab when it leaves
              map.on('mouseleave', renderOptions.layerId, () => {
                map.getCanvas().style.cursor = 'grab';
              });


            document.getElementById('status-info').textContent = 'Line data loaded successfully';

        // Implementation for rendering line segments
                async function renderLineSegmentsOnMap(map, lineData = null, options = {}) {
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
                    } catch (error) {
                      console.error('Failed to load or clean line segment data:', error);
                      document.getElementById('status-info').textContent = 'Error loading line data';
                      return;
                    }
                  }
                  
                  // Add the data source if it doesn't exist
                  if (!map.getSource(renderOptions.sourceId)) {
                    map.addSource(renderOptions.sourceId, {
                      type: 'geojson',
                      data: lineData
                    });
                  } else {
                    // Update the data if the source already exists
                    map.getSource(renderOptions.sourceId).setData(lineData);
                  }
                  
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
                          'No Stopping', '#f28e2c',
                          'ParkBoston/Metered', '#af7aa1',
                          'Resident Parking', '#76b7b2',
                          'Street Cleaning', '#ff9da7',
                          'Tow Zone', '#9c755f',
                          'Tow Zone: Street Cleaning/Snow Emergency', '#e7ba52',
                          // Default color
                          '#4e79a7'
                        ],
                        'line-opacity': renderOptions.lineOpacity
                      }
                    });
                    
                    // If popups are enabled, add click event
                    if (renderOptions.popupEnabled) {
                      // Create a popup but don't add it to the map yet
                      const popup = new mapboxgl.Popup({
                        closeButton: true,
                        closeOnClick: true
                      });
                  }
              }
          }

        // Function to load and render all data
        async function loadAndRenderAllData() {
          document.getElementById('status-info').textContent = 'Loading data...';
          
          try {
            // Load points
            await renderPointsOnMap(map);
            
            // Load lines
            await renderLineSegmentsOnMap(map);
            
            document.getElementById('status-info').textContent = 'All data loaded successfully';
          } catch (error) {
            console.error('Error loading map data:', error);
            document.getElementById('status-info').textContent = 'Error loading data';
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
        
        // Update the status info
        document.getElementById('status-info').textContent = 'Filter applied: ' + 
            window.activeRegulationTypes.size + ' regulation types shown';
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
                    'No Stopping': '#f28e2c',
                    'Other': '#4e79a7',
                    'ParkBoston/Metered': '#af7aa1',
                    'Resident Parking': '#76b7b2',
                    'Street Cleaning': '#ff9da7',
                    'Tow Zone': '#9c755f',
                    'Tow Zone: Street Cleaning/Snow Emergency': '#e7ba52',
                    'nan': '#bab0ab'
                };
            
                // Add "Select All/None" buttons
                const buttonContainer = document.createElement('div');
                buttonContainer.className = 'legend-buttons';
                
                const selectAllButton = document.createElement('button');
                selectAllButton.textContent = 'Select All';
                selectAllButton.className = 'legend-button';
                selectAllButton.addEventListener('click', function() {
                    // Select all checkboxes
                    const checkboxes = legendContainer.querySelectorAll('input[type="checkbox"]');
                    checkboxes.forEach(cb => {
                        cb.checked = true;
                        window.activeRegulationTypes.add(cb.getAttribute('data-regulation'));
                    });
                    applyRegulationTypeFilter();
                });
                
                const selectNoneButton = document.createElement('button');
                selectNoneButton.textContent = 'Select None';
                selectNoneButton.className = 'legend-button';
                selectNoneButton.addEventListener('click', function() {
                    // Unselect all checkboxes
                    const checkboxes = legendContainer.querySelectorAll('input[type="checkbox"]');
                    checkboxes.forEach(cb => {
                        cb.checked = false;
                        window.activeRegulationTypes.delete(cb.getAttribute('data-regulation'));
                    });
                    applyRegulationTypeFilter();
                });
                
                buttonContainer.appendChild(selectAllButton);
                buttonContainer.appendChild(selectNoneButton);
                legendContainer.appendChild(buttonContainer);
                
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