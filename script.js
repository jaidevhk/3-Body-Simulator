// Constants
const G = 10; // Adjusted gravitational constant for better visualization
const SCALE_FACTOR = 5; // Scale factor for visualization
const TIME_STEP = 0.05; // Simulation time step
const PREDICTION_STEPS = 3000; // Increased from 2000 to 3000 steps for more future data
const FUTURE_VISUALIZATION_TIME = 2; // How far into the future to visualize (in seconds)
const CAMERA_FOLLOW_DISTANCE = 6; // Distance from which object cameras follow their targets
const PARTICLE_COUNT = 150; // Number of particles in explosion
const PARTICLE_LIFETIME = 2; // Particle lifetime in seconds
const PARTICLE_SPEED = 5; // Particle explosion speed
const GRAPH_MAX_POINTS = 500; // Maximum number of points to display on the graph
const GRAPH_PADDING = 0.1; // Padding around the graph edges (10%)
const GRAPH_TIME_WIDTH = 50; // How many time units to display on the x-axis by default
const HISTORY_BUFFER_SIZE = 20000; // Number of past positions to store (increased for larger time range)
const MAX_LOG_ENTRIES = 9; // Maximum number of historical log entries (plus current attempt = 10 total)
const MAX_GRAPH_ATTEMPTS = 10; // Maximum number of attempts to show on the graph
const MAX_POINTS_PER_BODY = 5000; // Maximum trajectory points per body (to prevent memory issues)
const GRAPH_UPDATE_INTERVAL = 5; // Update graph every N frames to improve performance
const MAX_SEED = 1000000; // Maximum value for random seeds
const MAX_LONGEST_RUNS = 10; // Maximum number of longest runs to track
const DEFAULT_CAMERA_ZOOM = 20; // Default zoom level for object cameras
const MIN_CAMERA_ZOOM = 5; // Minimum camera zoom level
const MAX_CAMERA_ZOOM = 50; // Maximum camera zoom level
const DEFAULT_MAIN_CAMERA_DISTANCE = 10; // Default distance for main camera
const MIN_MAIN_CAMERA_DISTANCE = 5; // Minimum distance for main camera
const MAX_MAIN_CAMERA_DISTANCE = 30; // Maximum distance for main camera

// Orbit detection constants
const ORBIT_HISTORY_SIZE = 250; // Increased from 150 for more historical data
const ORBIT_CHECK_INTERVAL = 2; // Decreased from 3 to sample more frequently
const ORBIT_DISTANCE_VARIANCE_THRESHOLD = 0.5; // Decreased from 0.7 to require more stability
const ORBIT_MIN_SAMPLES = 50; // Increased from 30 to require more data points
const ORBIT_ANGULAR_VARIANCE_THRESHOLD = 0.5; // Decreased from 0.7 to require more stability
const FLASH_INTERVAL = 500;
const ORBIT_LONG_TERM_WEIGHT = 0.3; // Reduced from 0.6 to emphasize short-term patterns
const ORBIT_PERIOD_BINS = [20, 40, 80]; // Smaller bins for shorter durations (was [50, 100, 200])
const ORBIT_FUTURE_WEIGHT = 0.3; // Reduced from 0.4 to prioritize actual rather than predicted behavior

// Seed-based random number generator
class SeededRandom {
    constructor(seed) {
        this.initialSeed = seed % MAX_SEED;
        this.seed = this.initialSeed; // Start with the initial seed value
        this.originalSeed = this.seed; // Keep original seed for reference
    }
    
    // Reset the generator to its initial state
    reset() {
        this.seed = this.initialSeed;
    }
    
    // Simple LCG (Linear Congruential Generator)
    next() {
        // Parameters for a better LCG from Numerical Recipes
        const a = 1664525;
        const c = 1013904223;
        const m = 4294967296; // 2^32
        
        this.seed = (a * this.seed + c) % m;
        return this.seed / m; // Return a number between 0 and 1
    }
    
    // Get a random number between min and max
    range(min, max) {
        return min + this.next() * (max - min);
    }
    
    // Get a random position in 3D space
    randomPosition(range) {
        return new THREE.Vector3(
            this.range(-range, range),
            this.range(-range, range),
            this.range(-range, range)
        );
    }
    
    // Get a random velocity
    randomVelocity(scale) {
        return new THREE.Vector3(
            this.range(-scale, scale),
            this.range(-scale, scale),
            this.range(-scale, scale)
        );
    }
    
    // Get original seed
    getSeed() {
        return this.originalSeed;
    }
}

// Current simulation seed
let currentSeed = Math.floor(Math.random() * MAX_SEED);
let rng = new SeededRandom(currentSeed);

// Add performance tracking variables
let frameCount = 0;
let lastGraphUpdateTime = 0;

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Main view
const mainCamera = new THREE.PerspectiveCamera(75, window.innerWidth / 2 / (window.innerHeight / 2), 0.1, 1000);
const mainRenderer = new THREE.WebGLRenderer({ antialias: true });
mainRenderer.setSize(window.innerWidth / 2, window.innerHeight / 2);
document.getElementById('main-canvas').appendChild(mainRenderer.domElement);

// Graph setup
const graphScene = new THREE.Scene();
graphScene.background = new THREE.Color(0x111122);
const graphCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
graphCamera.position.z = 5;
const graphRenderer = new THREE.WebGLRenderer({ antialias: true });
graphRenderer.setSize(window.innerWidth / 2, window.innerHeight / 2);
document.getElementById('graph-canvas').appendChild(graphRenderer.domElement);

// Create grid for the graph
const graphGrid = new THREE.GridHelper(2, 10, 0x333333, 0x222222);
graphGrid.rotation.x = Math.PI / 2; // Make grid horizontal
graphScene.add(graphGrid);

// Graph variables
let graphLines = []; // Current attempt graph lines
let historicalGraphLines = []; // Array of arrays for past attempts
let trajectoryPoints = [[], [], []]; // Store position history for each body in current attempt
let historicalTrajectoryPoints = []; // Array of arrays for past attempts
let graphMinY = -1;
let graphMaxY = 1;
let graphMinX = 0;  // Track min X value
let graphMaxX = 50; // Track max X value
let graphZoomLevel = 1;
let graphPanOffset = { x: 0, y: 0 };
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let lastPanOffset = { x: 0, y: 0 };
let graphAutoZoom = true; // Default to auto-zoom
let graphLocked = true; // Default to locked (following latest plots)
let uniformScale = true; // Always use uniform scaling

// Target values for smooth graph transitions
let targetGraphMinY = -1;
let targetGraphMaxY = 1;
let targetGraphMinX = 0;
let targetGraphMaxX = 10;
let targetGraphZoomLevel = 1;
let targetGraphPanOffset = { x: 0, y: 0 };
let graphTransitionSpeed = 0.01; // Very slow transition speed (0.01 = 1% per frame)

// Graph navigation
const graphDomElement = graphRenderer.domElement;

// Object cameras setup
const objectCameras = [];
const objectRenderers = [];

// Setup each object camera and renderer
for (let i = 0; i < 3; i++) {
    const camera = new THREE.PerspectiveCamera(60, (window.innerWidth / 2) / (window.innerHeight / 3), 0.1, 1000);
    objectCameras.push(camera);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth / 2, window.innerHeight / 3);
    renderer.setClearColor(0x111122);
    document.getElementById(`camera${i+1}`).appendChild(renderer.domElement);
    objectRenderers.push(renderer);
}

// Camera position
mainCamera.position.z = 30;

// Camera rotation variables
let mainCameraRotationAngle = 0;
const CAMERA_ROTATION_SPEED = 0.002; // Rotation speed - very slow
let cameraRotationEnabled = true; // Default to enabled

// Controls
const controls = new THREE.OrbitControls(mainCamera, mainRenderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040);
scene.add(ambientLight);
const pointLight = new THREE.PointLight(0xffffff, 1);
pointLight.position.set(10, 10, 10);
scene.add(pointLight);

// Bodies
let bodies = [];
let predictionLines = [];
let futurePositions = [];
let futureVisuals = [];
let particles = []; // For explosion effects
let activeExplosions = []; // Track active explosions
let simulationTime = 0; // Track total simulation time
let positionHistory = [[], [], []]; // Store past positions for each body
let timeOffset = 1000; // Time offset for visualization (set to maximum by default)
let timeVisuals = []; // Visual elements for time offset visualization
let attemptStartTime = Date.now(); // Track when the current attempt started
let logEntries = []; // Regular log entries
let longestRuns = []; // Entries for longest runs
let activeLogTab = 'recent'; // 'recent' or 'longest'
let cameraZoom = DEFAULT_CAMERA_ZOOM; // Camera zoom level
let mainCameraDistance = DEFAULT_MAIN_CAMERA_DISTANCE; // User-controlled main camera distance
let userHasControlledCamera = false; // Flag to track if user has manually controlled the camera
let previousTrackedPair = [0, 1]; // Keep track of which pair was previously being tracked

// Orbit detection variables
let orbitHistory = []; // Store relative positions between bodies
let harmonyValues = [0, 0, 0]; // Harmony values for each pair (0-1, 0-2, 1-2)
let orbitingPairs = []; // Tracks which pairs are orbiting
let lastFlashTime = 0; // Last time the border flashed
let flashingBorders = [false, false, false]; // Tracks which camera borders are flashing

// Flags
let showPrediction = true; // Always show prediction lines
let showFuture = false; // This feature will be disabled

// Grid helper
const gridHelper = new THREE.GridHelper(10000, 100);
scene.add(gridHelper);

// Create graph lines
function createGraphLines() {
    // Clear existing current lines
    for (let i = 0; i < graphLines.length; i++) {
        if (graphLines[i]) {
            graphScene.remove(graphLines[i]);
        }
    }
    graphLines.length = 0;
    
    // Create a new line for each body
    const colors = [0xff0000, 0x00ff00, 0x0000ff];
    
    for (let i = 0; i < 3; i++) {
        // Each "line" will be a group of line segments
        const lineGroup = new THREE.Group();
        graphScene.add(lineGroup);
        graphLines.push(lineGroup);
        
        // Clear trajectory points for new attempt
        trajectoryPoints[i] = [];
    }
    
    // Add axis lines
    const axisColor = 0x444444;
    // X-axis (time)
    const xAxisMaterial = new THREE.LineBasicMaterial({ color: axisColor });
    const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1, -0.9, 0),
        new THREE.Vector3(1, -0.9, 0)
    ]);
    const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial);
    graphScene.add(xAxis);
    
    // Y-axis (position)
    const yAxisMaterial = new THREE.LineBasicMaterial({ color: axisColor });
    const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.9, -1, 0),
        new THREE.Vector3(-0.9, 1, 0)
    ]);
    const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial);
    graphScene.add(yAxis);
}

// Save current graph data as historical
function saveCurrentGraphAsHistorical() {
    // Only save if there's actual data
    if (trajectoryPoints.some(points => points.length > 0)) {
        // Create a deep copy of trajectory points for this attempt
        // Use downsampling to reduce data size for historical storage
        const attemptData = trajectoryPoints.map(bodyPoints => {
            // Sample points to reduce storage and improve performance
            const sampledPoints = downsamplePoints(bodyPoints, 1000);
            
            // Create deep copy of sampled points
            return sampledPoints.map(point => 
                point ? new THREE.Vector3(point.x, point.y, point.z) : null
            );
        });
        
        // Store the data for this attempt
        historicalTrajectoryPoints.push(attemptData);
        
        // Create dimmed versions of the lines and add to historical collection
        const attemptLines = [];
        const colors = [0xff0000, 0x00ff00, 0x0000ff];
        
        for (let i = 0; i < 3; i++) {
            const lineGroup = new THREE.Group();
            graphScene.add(lineGroup);
            
            // For each body's line, create segments with dimmer color
            const segments = createLineSegmentsFromPoints(attemptData[i], colors[i], 0.3);
            segments.forEach(segment => lineGroup.add(segment));
            
            attemptLines.push(lineGroup);
        }
        
        // Add to historical collection
        historicalGraphLines.push(attemptLines);
        
        // Keep only MAX_GRAPH_ATTEMPTS of historical data
        while (historicalTrajectoryPoints.length > MAX_GRAPH_ATTEMPTS) {
            const oldestAttemptLines = historicalGraphLines.shift();
            oldestAttemptLines.forEach(lineGroup => {
                graphScene.remove(lineGroup);
            });
            historicalTrajectoryPoints.shift();
        }
    }
}

// Helper function to create line segments from points
function createLineSegmentsFromPoints(points, color, opacity = 1.0) {
    if (points.length < 2) return [];
    
    const segments = [];
    let currentSegment = [];
    
    // Determine appropriate sampling rate based on number of points
    // This helps reduce the number of points rendered for better performance
    const samplingRate = Math.ceil(points.length / 100);
    
    for (let j = 0; j < points.length; j += samplingRate) {
        // Use sampling to reduce the number of points when there are too many
        let point = points[j];
        
        if (point === null) {
            // End of a segment
            if (currentSegment.length > 1) {
                // Create line for this segment
                const material = new THREE.LineBasicMaterial({ 
                    color: color,
                    opacity: opacity,
                    transparent: opacity < 1.0
                });
                const geometry = new THREE.BufferGeometry().setFromPoints(currentSegment);
                segments.push(new THREE.Line(geometry, material));
            }
            currentSegment = [];
            
            // Skip to next non-null point
            while (j < points.length && points[j] === null) j++;
            if (j >= points.length) break;
            
            point = points[j];
        }
        
        if (!point) continue;
        
        // Calculate the data bounds for uniform scaling
        const xRange = graphMaxX - graphMinX;
        const yRange = graphMaxY - graphMinY;
        
        // Use the larger range to ensure uniform scaling
        const maxRange = Math.max(xRange, yRange);
        
        // Normalize coordinates into a uniform square space
        const normalizedX = -1 + 2 * ((point.x - graphMinX) / maxRange);
        const normalizedY = -1 + 2 * ((point.y - graphMinY) / maxRange);
        
        // Center the view in the available space
        const aspectAdjustment = { 
            x: xRange < yRange ? (yRange - xRange) / yRange : 0,
            y: yRange < xRange ? (xRange - yRange) / xRange : 0
        };
        
        // Apply zoom and pan
        const zoomedX = normalizedX * graphZoomLevel + graphPanOffset.x + aspectAdjustment.x;
        const zoomedY = normalizedY * graphZoomLevel + graphPanOffset.y + aspectAdjustment.y;
        
        // Only add points that are within or near the visible range
        // This optimization prevents rendering thousands of points outside view
        if (zoomedX > -2 && zoomedX < 2 && zoomedY > -2 && zoomedY < 2) {
            currentSegment.push(new THREE.Vector3(zoomedX, zoomedY, 0));
        } else if (currentSegment.length > 0) {
            // If we've accumulated points but now we're out of range,
            // add a final point for a clean edge and end the segment
            currentSegment.push(new THREE.Vector3(zoomedX, zoomedY, 0));
            
            // Create a line for this segment
            if (currentSegment.length > 1) {
                const material = new THREE.LineBasicMaterial({ 
                    color: color,
                    opacity: opacity,
                    transparent: opacity < 1.0
                });
                const geometry = new THREE.BufferGeometry().setFromPoints(currentSegment);
                segments.push(new THREE.Line(geometry, material));
            }
            currentSegment = [];
        }
    }
    
    // Add the last segment if it has points
    if (currentSegment.length > 1) {
        const material = new THREE.LineBasicMaterial({ 
            color: color,
            opacity: opacity,
            transparent: opacity < 1.0
        });
        const geometry = new THREE.BufferGeometry().setFromPoints(currentSegment);
        segments.push(new THREE.Line(geometry, material));
    }
    
    return segments;
}

// Scale a point to the current graph view (with zoom and pan)
function scalePointToGraphView(point) {
    // This function is no longer used as scaling is now done in createLineSegmentsFromPoints
    // Keeping it for backward compatibility
    const scaledY = -0.9 + 1.8 * (point.y - graphMinY) / (graphMaxY - graphMinY);
    // Apply zoom and pan
    const zoomedX = point.x * graphZoomLevel + graphPanOffset.x;
    const zoomedY = scaledY * graphZoomLevel + graphPanOffset.y;
    return new THREE.Vector3(zoomedX, zoomedY, 0);
}

// Update graph with new position data
function updateGraph() {
    // Track min/max values for this update
    let currentMinY = Infinity;
    let currentMaxY = -Infinity;
    
    // Add current positions to trajectory history
    for (let i = 0; i < bodies.length; i++) {
        // Use the magnitude of position as Y value
        const positionMagnitude = bodies[i].position.length();
        
        // Track min/max for auto-scaling
        currentMinY = Math.min(currentMinY, positionMagnitude);
        currentMaxY = Math.max(currentMaxY, positionMagnitude);
        
        // Create data point (x = simulationTime, y = position magnitude)
        // Store raw time instead of normalizing it
        const point = new THREE.Vector3(simulationTime, positionMagnitude, 0);
        
        // Check if we need to break the line (for any discontinuities in tracking)
        if (trajectoryPoints[i].length > 0) {
            const lastPoint = trajectoryPoints[i][trajectoryPoints[i].length - 1];
            const timeDiff = simulationTime - lastPoint.x;
            
            // If there's a big gap in the time (e.g., after a reset), insert a break
            if (lastPoint && timeDiff > TIME_STEP * 10) {
                trajectoryPoints[i].push(null);
            }
        }
        
        trajectoryPoints[i].push(point);
        
        // Limit the number of points to prevent performance issues
        if (trajectoryPoints[i].length > MAX_POINTS_PER_BODY) {
            // Downsample points to maintain the general shape while reducing count
            trajectoryPoints[i] = downsamplePoints(trajectoryPoints[i], MAX_POINTS_PER_BODY / 2);
        }
    }
    
    // Only update graph visualization every GRAPH_UPDATE_INTERVAL frames
    // to improve performance
    frameCount++;
    
    // Skip updates if we haven't had a new frame in a while
    const currentTime = Date.now();
    if (frameCount % GRAPH_UPDATE_INTERVAL !== 0 && 
        currentTime - lastGraphUpdateTime < 100) {
        return; // Skip this update
    }
    
    lastGraphUpdateTime = currentTime;
    
    // Update graph scale with some smoothing if auto-zoom is enabled
    if (graphAutoZoom) {
        // If we have target values set by zoomToObjectsInGraph, interpolate toward them
        if (targetGraphMinY !== undefined) {
            // Apply very smooth interpolation
            graphMinY += (targetGraphMinY - graphMinY) * graphTransitionSpeed;
            graphMaxY += (targetGraphMaxY - graphMaxY) * graphTransitionSpeed;
            graphMinX += (targetGraphMinX - graphMinX) * graphTransitionSpeed;
            graphMaxX += (targetGraphMaxX - graphMaxX) * graphTransitionSpeed;
            graphZoomLevel += (targetGraphZoomLevel - graphZoomLevel) * graphTransitionSpeed;
            graphPanOffset.x += (targetGraphPanOffset.x - graphPanOffset.x) * graphTransitionSpeed;
            graphPanOffset.y += (targetGraphPanOffset.y - graphPanOffset.y) * graphTransitionSpeed;
        } else {
            // Original auto-zoom behavior for when no harmony target is set
            const smoothingFactor = 0.05;
            if (currentMinY < Infinity && currentMaxY > -Infinity) {
                // Add padding for better visualization
                const range = Math.max(currentMaxY - currentMinY, 1); // Ensure minimum range
                const paddedMin = currentMinY - range * GRAPH_PADDING;
                const paddedMax = currentMaxY + range * GRAPH_PADDING;
                
                // Smoothly update the min/max values
                graphMinY = graphMinY * (1 - smoothingFactor) + paddedMin * smoothingFactor;
                graphMaxY = graphMaxY * (1 - smoothingFactor) + paddedMax * smoothingFactor;
                
                // Update X range based on simulation time
                graphMinX = 0;
                graphMaxX = Math.max(50, simulationTime * 1.1); // Ensure we always see ahead a bit
            }
        }
    }
    
    // If graph is locked to follow latest plots, reset the pan offset
    if (graphLocked) {
        // This keeps the view centered on the latest data
        followLatestPlots();
    }
    
    // Update line geometries with current trajectory points
    for (let i = 0; i < graphLines.length; i++) {
        graphScene.remove(graphLines[i]);
        
        const segments = createLineSegmentsFromPoints(trajectoryPoints[i], bodies[i].color);
        
        const lineGroup = new THREE.Group();
        segments.forEach(segment => lineGroup.add(segment));
        
        graphScene.add(lineGroup);
        graphLines[i] = lineGroup;
    }
    
    // Re-render historical lines with current scale
    // Only update historical lines when view parameters change to improve performance
    if (isDragging || frameCount % (GRAPH_UPDATE_INTERVAL * 5) === 0) {
        updateHistoricalLines();
    }
    
    // Update graph axis labels with current scale
    updateGraphLabels();
}

// Update historical lines based on current graph scale
function updateHistoricalLines() {
    // Remove all existing historical line groups
    historicalGraphLines.forEach(attemptLines => {
        attemptLines.forEach(lineGroup => {
            graphScene.remove(lineGroup);
        });
    });
    
    // Recreate historical lines with current scale
    historicalGraphLines = [];
    
    historicalTrajectoryPoints.forEach((attemptData, attemptIndex) => {
        const attemptLines = [];
        const colors = [0xff0000, 0x00ff00, 0x0000ff];
        
        for (let i = 0; i < 3; i++) {
            const lineGroup = new THREE.Group();
            graphScene.add(lineGroup);
            
            // For each body's line, create segments with dimmer color
            // Opacity decreases with age of attempt (older attempts are more faded)
            const opacity = 0.1 + 0.2 * (attemptIndex / historicalTrajectoryPoints.length);
            
            // Use more aggressive sampling for historical data
            const samplingFactor = 4; // Sample 1/4th of points for historical data
            const sampledPoints = [];
            
            // Manual sampling to improve performance
            for (let j = 0; j < attemptData[i].length; j += samplingFactor) {
                sampledPoints.push(attemptData[i][j]);
            }
            
            const segments = createLineSegmentsFromPoints(sampledPoints, colors[i], opacity);
            segments.forEach(segment => lineGroup.add(segment));
            
            attemptLines.push(lineGroup);
        }
        
        // Add to historical collection
        historicalGraphLines.push(attemptLines);
    });
}

// Function to update graph labels with current scale values
function updateGraphLabels() {
    const yAxisLabel = document.getElementById('y-axis-label');
    if (yAxisLabel) {
        // Round values for display
        const minY = Math.round(graphMinY * 10) / 10;
        const maxY = Math.round(graphMaxY * 10) / 10;
        yAxisLabel.innerHTML = `Position (${minY}—${maxY})`;
    }
    
    const xAxisLabel = document.getElementById('x-axis-label');
    if (xAxisLabel) {
        // Round values for display
        const minX = Math.round(graphMinX * 10) / 10;
        const maxX = Math.round(graphMaxX * 10) / 10;
        xAxisLabel.innerHTML = `Time (${minX}—${maxX})`;
    }
}

// Setup graph navigation event listeners
function setupGraphNavigation() {
    graphDomElement.addEventListener('mousedown', onGraphMouseDown);
    window.addEventListener('mousemove', onGraphMouseMove);
    window.addEventListener('mouseup', onGraphMouseUp);
    graphDomElement.addEventListener('wheel', onGraphWheel);
    
    // Add button to toggle auto-zoom
    const controlsDiv = document.getElementById('controls');
    if (controlsDiv) {
        const autoZoomBtn = document.createElement('button');
        autoZoomBtn.id = 'toggle-auto-zoom';
        autoZoomBtn.textContent = 'Auto Zoom: On';
        autoZoomBtn.addEventListener('click', () => {
            graphAutoZoom = !graphAutoZoom;
            autoZoomBtn.textContent = `Auto Zoom: ${graphAutoZoom ? 'On' : 'Off'}`;
            
            // If turning auto-zoom back on, reset zoom and pan
            if (graphAutoZoom) {
                resetGraphView();
            }
        });
        
        // Add Lock Graph View button next to Auto Zoom
        const lockBtn = document.createElement('button');
        lockBtn.id = 'graph-lock-button';
        lockBtn.textContent = 'Lock Graph View: On';
        lockBtn.title = 'Lock view to follow latest data points';
        lockBtn.addEventListener('click', () => {
            graphLocked = !graphLocked;
            lockBtn.textContent = `Lock Graph View: ${graphLocked ? 'On' : 'Off'}`;
            
            // If locking the view, reset to follow latest data
            if (graphLocked) {
                followLatestPlots();
            }
        });
        
        // Insert auto-zoom and lock buttons to the first row
        const controlsRow = document.querySelector('.controls-row');
        if (controlsRow) {
            controlsRow.appendChild(autoZoomBtn);
            controlsRow.appendChild(lockBtn);
        } else {
            controlsDiv.appendChild(autoZoomBtn);
            controlsDiv.appendChild(lockBtn);
        }
    }
    
    // Set up the seed input and run button that are already in the HTML
    const seedInput = document.getElementById('seed-input');
    const runSeedBtn = document.getElementById('run-seed');
    
    if (seedInput && runSeedBtn) {
        // Set the initial seed value
        seedInput.value = currentSeed.toString();
        
        // Add event listener to the run seed button
        runSeedBtn.addEventListener('click', () => {
            const seedValue = seedInput.value;
            if (seedValue && !isNaN(seedValue)) {
                runWithSeed(seedValue);
            }
        });
    }
}

// Follow latest plots function
function followLatestPlots() {
    if (!graphLocked) return;
    
    // Reset pan offset to center on current time
    graphPanOffset.x = 0;
    
    // When in harmony zoom mode, we want to keep the vertical offset set by zoomToObjectsInGraph
    // So we only reset the x (time) axis pan but preserve the y axis pan
    
    // Ensure the graph view stays focused on the latest data
    if (targetGraphMinX !== undefined && targetGraphMaxX !== undefined) {
        // Ensure the view window stays clamped to the latest data
        targetGraphMinX = Math.max(0, simulationTime - Math.max(20, simulationTime * 0.3));
        targetGraphMaxX = simulationTime + 10; // Add a bit of future space
    }
    
    // Update historical lines without calling updateGraph to avoid recursion
    updateHistoricalLines();
}

function onGraphMouseDown(event) {
    const rect = graphDomElement.getBoundingClientRect();
    // Only handle if click is inside the graph canvas
    if (event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom) {
        // Disable auto-zoom when user starts dragging
        if (graphAutoZoom) {
            graphAutoZoom = false;
            const autoZoomBtn = document.getElementById('toggle-auto-zoom');
            if (autoZoomBtn) {
                autoZoomBtn.textContent = 'Auto Zoom: Off';
            }
        }
        
        // Disable graph lock when user starts dragging
        if (graphLocked) {
            graphLocked = false;
            const lockBtn = document.getElementById('graph-lock-button');
            if (lockBtn) {
                lockBtn.textContent = 'Lock Graph View: Off';
            }
        }
        
        isDragging = true;
        dragStart.x = event.clientX;
        dragStart.y = event.clientY;
        lastPanOffset.x = graphPanOffset.x;
        lastPanOffset.y = graphPanOffset.y;
        
        // Change cursor to indicate dragging
        graphDomElement.style.cursor = 'grabbing';
    }
}

function onGraphMouseMove(event) {
    if (!isDragging) return;
    
    const rect = graphDomElement.getBoundingClientRect();
    const width = rect.right - rect.left;
    const height = rect.bottom - rect.top;
    
    // Calculate how much to pan based on mouse movement
    const dx = (event.clientX - dragStart.x) / width * 4; // Adjust sensitivity as needed
    const dy = (event.clientY - dragStart.y) / height * 4;
    
    // Update pan offset
    graphPanOffset.x = lastPanOffset.x + dx;
    graphPanOffset.y = lastPanOffset.y - dy; // Invert Y for intuitive dragging
    
    // Update graphs with new pan offset
    updateHistoricalLines();
    updateGraph();
}

function onGraphMouseUp() {
    isDragging = false;
    // Reset cursor
    graphDomElement.style.cursor = 'auto';
}

function onGraphWheel(event) {
    // Prevent default scrolling
    event.preventDefault();
    
    // Disable auto-zoom when user manually zooms
    if (graphAutoZoom) {
        graphAutoZoom = false;
        const autoZoomBtn = document.getElementById('toggle-auto-zoom');
        if (autoZoomBtn) {
            autoZoomBtn.textContent = 'Auto Zoom: Off';
        }
    }
    
    // Determine zoom direction
    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
    
    // Get cursor position relative to canvas for zoom centering
    const rect = graphDomElement.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / (rect.right - rect.left)) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / (rect.bottom - rect.top)) * 2 + 1;
    
    // Update zoom level
    graphZoomLevel *= zoomFactor;
    
    // Adjust pan to zoom toward cursor position
    graphPanOffset.x = mouseX + (graphPanOffset.x - mouseX) * zoomFactor;
    graphPanOffset.y = mouseY + (graphPanOffset.y - mouseY) * zoomFactor;
    
    // Update graph with new zoom level
    updateHistoricalLines();
    updateGraph();
}

// Reset graph view to default
function resetGraphView() {
    graphZoomLevel = 1;
    graphPanOffset = { x: 0, y: 0 };
    updateHistoricalLines();
    updateGraph();
}

// Create time visuals for past/future visualization
function createTimeVisuals() {
    // Remove existing time visuals
    timeVisuals.forEach(visual => scene.remove(visual));
    timeVisuals = [];
    
    // Create a visual for each body
    for (let i = 0; i < bodies.length; i++) {
        const geometry = new THREE.SphereGeometry(0.8, 24, 24);
        const material = new THREE.MeshPhongMaterial({
            color: bodies[i].color,
            transparent: true,
            opacity: 0.6,
            wireframe: false
        });
        
        const visual = new THREE.Mesh(geometry, material);
        visual.visible = false; // Initially hidden
        scene.add(visual);
        timeVisuals.push(visual);
    }
}

// Initialize slider
function initializeSlider() {
    const slider = document.getElementById('time-slider');
    const valueDisplay = document.getElementById('time-value');
    
    if (!slider || !valueDisplay) return; // Exit if elements don't exist
    
    // Initialize time value display with current slider value
    valueDisplay.textContent = timeOffset.toFixed(1);
    
    slider.addEventListener('input', function() {
        timeOffset = parseFloat(this.value);
        valueDisplay.textContent = timeOffset.toFixed(1);
        
        // Enable/disable prediction toggle based on slider
        const togglePrediction = document.getElementById('toggle-prediction');
        if (togglePrediction) {
            togglePrediction.disabled = (timeOffset !== 0);
        }
        
        // Enable/disable future visualization based on slider
        const toggleFuture = document.getElementById('toggle-future');
        if (timeOffset !== 0) {
            // When slider is not at zero, disable the future visualization toggle
            if (toggleFuture) {
                toggleFuture.disabled = true;
            }
            showFuture = false;
            
            // Update time visuals
            updateTimeVisuals();
        } else {
            // Zero resets to normal
            if (toggleFuture) {
                toggleFuture.disabled = false;
            }
            if (togglePrediction) {
                togglePrediction.disabled = false;
            }
            
            hideTimeVisuals();
        }
    });
    
    // Initialize camera zoom slider if it exists
    const zoomSlider = document.getElementById('camera-zoom-slider');
    const zoomValueDisplay = document.getElementById('zoom-value');
    
    if (zoomSlider && zoomValueDisplay) {
        // Initialize zoom value display with current zoom
        zoomValueDisplay.textContent = cameraZoom.toFixed(1);
        
        zoomSlider.addEventListener('input', function() {
            cameraZoom = parseFloat(this.value);
            zoomValueDisplay.textContent = cameraZoom.toFixed(1);
            
            // Force camera update with new zoom level
            updateObjectCameras(true);
        });
    }
}

// Update prediction lines based on time offset
function updatePredictionLinesWithOffset() {
    // Ensure prediction lines are visible regardless of showPrediction setting
    for (let i = 0; i < predictionLines.length; i++) {
        predictionLines[i].visible = true;
        
        // Ensure the material is properly set for maximum visibility
        predictionLines[i].material.depthTest = false;
        predictionLines[i].material.transparent = true;
        predictionLines[i].material.opacity = 0.9;
        predictionLines[i].material.needsUpdate = true;
        predictionLines[i].renderOrder = 9999;
        predictionLines[i].frustumCulled = false;
    }
    
    if (timeOffset === 0) {
        // Reset to normal prediction display
        if (showPrediction) {
            // Reset to normal prediction lines
            for (let i = 0; i < predictionLines.length; i++) {
                if (futurePositions[i] && futurePositions[i].length > 0) {
                    const linePoints = [bodies[i].position.clone()]; // Start with current position
                    linePoints.push(...futurePositions[i]);
                    
                    const geometry = predictionLines[i].geometry;
                    geometry.setFromPoints(linePoints);
                    geometry.attributes.position.needsUpdate = true;
                }
            }
        } else {
            // Hide prediction lines if showPrediction is false
            for (let i = 0; i < predictionLines.length; i++) {
                predictionLines[i].visible = false;
            }
        }
        return;
    }
    
    if (timeOffset > 0) {
        // For positive time offset (future), show a portion of the prediction
        const startStep = 0;
        // Make sure we don't exceed available prediction steps
        const endStep = Math.min(Math.floor(timeOffset / TIME_STEP), PREDICTION_STEPS - 1);
        
        for (let i = 0; i < predictionLines.length; i++) {
            if (futurePositions[i] && futurePositions[i].length > 0) {
                const linePoints = [bodies[i].position.clone()];
                
                // Add points up to the specified time offset
                for (let step = startStep; step <= endStep && step < futurePositions[i].length; step++) {
                    linePoints.push(futurePositions[i][step].clone());
                }
                
                // Update the line geometry
                const geometry = predictionLines[i].geometry;
                geometry.setFromPoints(linePoints);
                geometry.attributes.position.needsUpdate = true;
            }
        }
    } else {
        // For negative time offset (past), show prediction from the past position
        const pastStep = Math.floor(Math.abs(timeOffset) / TIME_STEP);
        
        for (let i = 0; i < predictionLines.length; i++) {
            const history = positionHistory[i];
            
            // Only proceed if we have enough history
            if (history.length > pastStep) {
                const pastIndex = Math.max(0, Math.min(history.length - 1 - pastStep, history.length - 1));
                const pastPosition = history[pastIndex];
                
                // Create line from past position to current position
                const linePoints = [pastPosition.clone()];
                
                // Add current position
                linePoints.push(bodies[i].position.clone());
                
                // Add future points
                if (futurePositions[i] && futurePositions[i].length > 0) {
                    for (let step = 0; step < futurePositions[i].length; step++) {
                        linePoints.push(futurePositions[i][step].clone());
                    }
                }
                
                // Update the line geometry
                const geometry = predictionLines[i].geometry;
                geometry.setFromPoints(linePoints);
                geometry.attributes.position.needsUpdate = true;
            }
        }
    }
}

// Update time visuals based on current timeOffset
function updateTimeVisuals() {
    if (timeOffset === 0) {
        hideTimeVisuals();
        return;
    }
    
    // Show time visuals
    for (let i = 0; i < timeVisuals.length; i++) {
        timeVisuals[i].visible = true;
    }
    
    if (timeOffset > 0) {
        // Show future positions
        const futureSteps = Math.floor(timeOffset / TIME_STEP);
        
        for (let i = 0; i < bodies.length; i++) {
            if (futurePositions[i] && futurePositions[i][futureSteps]) {
                timeVisuals[i].position.copy(futurePositions[i][futureSteps]);
            }
        }
    } else {
        // Show past positions
        const pastSteps = Math.floor(Math.abs(timeOffset) / TIME_STEP);
        
        for (let i = 0; i < bodies.length; i++) {
            const history = positionHistory[i];
            if (history.length > pastSteps) {
                const index = history.length - 1 - pastSteps;
                timeVisuals[i].position.copy(history[index]);
            } else {
                // If we don't have enough history, hide the visual
                timeVisuals[i].visible = false;
            }
        }
    }
}

// Hide time visuals
function hideTimeVisuals() {
    timeVisuals.forEach(visual => {
        visual.visible = false;
    });
}

// Update position history
function updatePositionHistory() {
    for (let i = 0; i < bodies.length; i++) {
        // Record current position
        positionHistory[i].push(bodies[i].position.clone());
        
        // Keep history within limit
        while (positionHistory[i].length > HISTORY_BUFFER_SIZE) {
            positionHistory[i].shift();
        }
    }
}

// Generate random positions and velocities
function generateRandomBodies() {
    const colors = [0xff0000, 0x00ff00, 0x0000ff];
    const masses = [1, 1, 1];  // Equal masses for simplicity
    
    bodies = [];
    
    for (let i = 0; i < 3; i++) {
        // Random position within a reasonable range using the seeded RNG
        const position = rng.randomPosition(10);
        
        // Random velocity using the seeded RNG
        const velocity = rng.randomVelocity(1);
        
        const geometry = new THREE.SphereGeometry(1, 32, 32);
        const material = new THREE.MeshPhongMaterial({ color: colors[i] });
        const mesh = new THREE.Mesh(geometry, material);
        
        mesh.position.copy(position);
        scene.add(mesh);
        
        bodies.push({
            position,
            velocity,
            acceleration: new THREE.Vector3(0, 0, 0),
            mass: masses[i],
            mesh,
            color: colors[i]
        });
    }
    
    // Create prediction lines
    createPredictionLines();
    
    // Create future visualization objects
    createFutureVisuals();
    
    // Create time visuals
    createTimeVisuals();
    
    // Initialize cameras at good positions
    updateObjectCameras(true);
    
    // Create graph lines
    createGraphLines();
    
    // Reset simulation time
    simulationTime = 0;
    
    // Reset position history
    positionHistory = [[], [], []];
}

// Update object camera positions
function updateObjectCameras(forceUpdate = false) {
    for (let i = 0; i < Math.min(bodies.length, objectCameras.length); i++) {
        const body = bodies[i];
        const camera = objectCameras[i];
        
        // Use a combination of velocity direction and global orientation for camera placement
        let cameraOffset;
        
        if (body.velocity.length() > 0.1 || forceUpdate) {
            // If body has significant velocity, position behind movement direction
            const velNorm = body.velocity.clone().normalize();
            // Apply camera zoom level to the follow distance
            const zoomedDistance = cameraZoom / 10; // Scale zoom to reasonable values
            cameraOffset = new THREE.Vector3(
                -velNorm.x * zoomedDistance,
                2, // Always keep some height
                -velNorm.z * zoomedDistance
            );
        } else {
            // Default camera position with zoom applied
            const zoomedDistance = cameraZoom / 10;
            cameraOffset = new THREE.Vector3(0, 2, zoomedDistance);
        }
        
        // Position camera behind the object based on its movement direction
        camera.position.copy(body.position).add(cameraOffset);
        
        // Instead of looking at the object itself, look in the opposite direction
        // of where the object is traveling (ahead of the object's path)
        if (body.velocity.length() > 0.1) {
            // Get normalized velocity vector
            const velNorm = body.velocity.clone().normalize();
            
            // Calculate a look target point that's in the opposite direction of travel
            // (but still from the object's position)
            const lookTarget = body.position.clone().add(velNorm.multiplyScalar(10));
            
            // Make the camera look at this point
            camera.lookAt(lookTarget);
        } else {
            // If object isn't moving much, just look ahead from current position
            const lookAhead = new THREE.Vector3(
                body.position.x, 
                body.position.y, 
                body.position.z - 10 // Look forward by default
            );
            camera.lookAt(lookAhead);
        }
    }
}

// Add small reference spheres for the other bodies in each camera view
function createReferenceMarkers() {
    // To be called after bodies are created
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        
        // Create smaller reference markers for this body in the other cameras
        for (let j = 0; j < bodies.length; j++) {
            if (i !== j) {
                const markerGeometry = new THREE.SphereGeometry(0.2, 16, 16);
                const markerMaterial = new THREE.MeshBasicMaterial({ 
                    color: body.color,
                    wireframe: true
                });
                const marker = new THREE.Mesh(markerGeometry, markerMaterial);
                
                // Position at the same place as the main body
                marker.position.copy(body.position);
                
                // Store reference to update it later
                body.markers = body.markers || [];
                body.markers.push({
                    mesh: marker,
                    forBody: j
                });
                
                scene.add(marker);
            }
        }
    }
}

function createPredictionLines() {
    // Remove existing prediction lines
    predictionLines.forEach(line => {
        scene.remove(line);
        if (line.geometry) line.geometry.dispose();
        if (line.material) line.material.dispose();
    });
    predictionLines = [];
    
    // Clear future positions
    futurePositions = [];
    
    // Create new prediction lines with enhanced visibility
    for (let i = 0; i < bodies.length; i++) {
        const material = new THREE.LineBasicMaterial({
            color: new THREE.Color(bodies[i].mesh.material.color),
            opacity: 0.9, // Increased opacity for better visibility
            transparent: true,
            linewidth: 3, // Thicker lines for better visibility
            depthTest: false, // Disable depth testing to ensure lines are always visible
            depthWrite: false, // Don't write to depth buffer
            blending: THREE.AdditiveBlending // Use additive blending for glow effect
        });
        
        const geometry = new THREE.BufferGeometry();
        const points = Array(PREDICTION_STEPS + 1).fill().map(() => new THREE.Vector3());
        geometry.setFromPoints(points);
        
        const line = new THREE.Line(geometry, material);
        line.renderOrder = 9999; // Extremely high render order to draw on top of everything
        line.frustumCulled = false; // Disable frustum culling so lines are always rendered
        scene.add(line);
        predictionLines.push(line);
    }
}

function createFutureVisuals() {
    // Remove existing future visualizations
    futureVisuals.forEach(body => scene.remove(body));
    futureVisuals = [];
    
    // Create new future visualization objects (transparent versions of bodies)
    for (let i = 0; i < bodies.length; i++) {
        const geometry = new THREE.SphereGeometry(1, 16, 16);
        const material = new THREE.MeshPhongMaterial({
            color: bodies[i].mesh.material.color,
            transparent: true,
            opacity: 0.3
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.visible = false; // Initially hidden
        scene.add(mesh);
        futureVisuals.push(mesh);
    }
    
    // Create reference markers for each body
    createReferenceMarkers();
}

// Update reference markers
function updateReferenceMarkers() {
    bodies.forEach(body => {
        if (body.markers) {
            body.markers.forEach(marker => {
                marker.mesh.position.copy(body.position);
            });
        }
    });
}

// Physics calculations
function calculateAcceleration(bodyIndex) {
    const acceleration = new THREE.Vector3(0, 0, 0);
    const body = bodies[bodyIndex];
    
    for (let i = 0; i < bodies.length; i++) {
        if (i !== bodyIndex) {
            const otherBody = bodies[i];
            const direction = new THREE.Vector3().subVectors(otherBody.position, body.position);
            const distance = direction.length();
            
            // Prevent division by zero or very small values
            if (distance > 0.1) {
                const forceMagnitude = (G * body.mass * otherBody.mass) / (distance * distance);
                direction.normalize().multiplyScalar(forceMagnitude / body.mass);
                acceleration.add(direction);
            }
        }
    }
    
    return acceleration;
}

function updatePhysics() {
    // Calculate accelerations first
    bodies.forEach((body, index) => {
        body.acceleration = calculateAcceleration(index);
    });
    
    // Update velocities and positions
    bodies.forEach(body => {
        body.velocity.add(body.acceleration.clone().multiplyScalar(TIME_STEP));
        body.position.add(body.velocity.clone().multiplyScalar(TIME_STEP));
        body.mesh.position.copy(body.position);
    });
    
    // Update reference markers
    updateReferenceMarkers();
    
    // Update position history
    updatePositionHistory();
}

// Collision prediction
function predictCollisions() {
    // Make copies of bodies for prediction
    const bodiesCopy = bodies.map(body => ({
        position: body.position.clone(),
        velocity: body.velocity.clone(),
        acceleration: body.acceleration.clone(),
        mass: body.mass
    }));
    
    // Store predicted positions for visualization
    const predictedPositions = bodies.map(() => []);
    
    // Flag to track predicted collisions
    let predictedCollisions = [];
    
    // Predict future positions
    for (let step = 0; step < PREDICTION_STEPS; step++) {
        // Calculate accelerations
        bodiesCopy.forEach((body, index) => {
            body.acceleration.set(0, 0, 0);
            
            for (let i = 0; i < bodiesCopy.length; i++) {
                if (i !== index) {
                    const otherBody = bodiesCopy[i];
                    const direction = new THREE.Vector3().subVectors(otherBody.position, body.position);
                    const distance = direction.length();
                    
                    if (distance > 0.1) {
                        const forceMagnitude = (G * body.mass * otherBody.mass) / (distance * distance);
                        direction.normalize().multiplyScalar(forceMagnitude / body.mass);
                        body.acceleration.add(direction);
                    }
                }
            }
        });
        
        // Update velocities and positions
        bodiesCopy.forEach((body, index) => {
            body.velocity.add(body.acceleration.clone().multiplyScalar(TIME_STEP));
            body.position.add(body.velocity.clone().multiplyScalar(TIME_STEP));
            
            // Store position for visualization
            predictedPositions[index].push(body.position.clone());
        });
        
        // Check for collisions
        for (let i = 0; i < bodiesCopy.length; i++) {
            for (let j = i + 1; j < bodiesCopy.length; j++) {
                const distance = bodiesCopy[i].position.distanceTo(bodiesCopy[j].position);
                
                // Consider a collision if distance is less than the sum of radii (both 1 in our case)
                if (distance < 2) {
                    const timeToCollision = step * TIME_STEP;
                    document.getElementById('prediction-info').textContent = 
                        `Predicted collision between Body ${i+1} and Body ${j+1} in ${timeToCollision.toFixed(2)} seconds`;
                    
                    // Record which pair will collide and when
                    predictedCollisions.push({
                        bodyA: i,
                        bodyB: j,
                        timeToCollision: timeToCollision,
                        pairIndex: getPairIndex(i, j)
                    });
                    
                    // Store the prediction but continue the simulation to get full trajectories
                }
            }
        }
    }
    
    // Update prediction lines if no collisions were found
    if (showPrediction) {
        for (let i = 0; i < predictionLines.length; i++) {
            const positions = predictedPositions[i];
            const linePoints = [bodies[i].position.clone()]; // Start with current position
            linePoints.push(...positions);
            
            const geometry = predictionLines[i].geometry;
            geometry.setFromPoints(linePoints);
            geometry.attributes.position.needsUpdate = true;
        }
    }
    
    // Save future positions for visualization
    futurePositions = predictedPositions;
    
    // Update UI based on whether collisions were predicted
    if (predictedCollisions.length === 0) {
        document.getElementById('prediction-info').textContent = 'No collisions predicted in the near future';
    }
    
    // Return the predicted collisions for use in harmony calculations
    return predictedCollisions;
}

// Update future visualization
function updateFutureVisualization() {
    if (showFuture && futurePositions.length > 0) {
        const futureStep = Math.floor(FUTURE_VISUALIZATION_TIME / TIME_STEP);
        const clampedStep = Math.min(futureStep, PREDICTION_STEPS - 1);
        
        for (let i = 0; i < bodies.length; i++) {
            if (futurePositions[i] && futurePositions[i][clampedStep]) {
                futureVisuals[i].position.copy(futurePositions[i][clampedStep]);
                futureVisuals[i].visible = true;
            }
        }
    } else {
        futureVisuals.forEach(obj => {
            obj.visible = false;
        });
    }
}

// Particle explosion effect
function createExplosion(position, color) {
    const particleGroup = new THREE.Group();
    scene.add(particleGroup);
    
    // Create particles
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Random direction vector
        const direction = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
        ).normalize();
        
        // Random speed within range
        const speed = PARTICLE_SPEED * (0.5 + Math.random() * 0.5);
        
        // Random size
        const size = 0.05 + Math.random() * 0.15;
        
        // Create particle
        const geometry = new THREE.SphereGeometry(size, 8, 8);
        const material = new THREE.MeshBasicMaterial({ 
            color: color,
            transparent: true,
            opacity: 0.8
        });
        
        const particle = new THREE.Mesh(geometry, material);
        particle.position.copy(position);
        
        // Store particle properties
        particle.userData = {
            velocity: direction.multiplyScalar(speed),
            lifetime: PARTICLE_LIFETIME * (0.7 + Math.random() * 0.3), // Slightly randomize lifetime
            age: 0
        };
        
        particleGroup.add(particle);
    }
    
    // Store explosion data
    activeExplosions.push({
        group: particleGroup,
        startTime: Date.now() / 1000, // Current time in seconds
        duration: PARTICLE_LIFETIME,
        position: position.clone(),
        color: color
    });
}

// Update explosions
function updateExplosions() {
    // Process each active explosion
    for (let i = activeExplosions.length - 1; i >= 0; i--) {
        const explosion = activeExplosions[i];
        const currentTime = Date.now() / 1000;
        const elapsed = currentTime - explosion.startTime;
        
        // Check if explosion has ended
        if (elapsed > explosion.duration) {
            // Remove particles
            scene.remove(explosion.group);
            activeExplosions.splice(i, 1);
            continue;
        }
        
        // Update particles in this explosion
        const group = explosion.group;
        const percentComplete = elapsed / explosion.duration;
        
        for (let j = 0; j < group.children.length; j++) {
            const particle = group.children[j];
            const data = particle.userData;
            
            // Update position based on velocity
            particle.position.add(data.velocity.clone().multiplyScalar(TIME_STEP));
            
            // Add a bit of gravity/drag
            data.velocity.y -= 0.05 * TIME_STEP;
            data.velocity.multiplyScalar(0.99); // Slow down over time
            
            // Fade out
            particle.material.opacity = 0.8 * (1 - percentComplete);
            
            // Slightly shrink particles
            if (particle.scale.x > 0.1) {
                const shrinkFactor = 0.99;
                particle.scale.multiplyScalar(shrinkFactor);
            }
        }
    }
}

// Add a log entry for the current attempt
function addLogEntry(reason) {
    const duration = ((Date.now() - attemptStartTime) / 1000).toFixed(2);
    
    // Create log entry object
    const entry = {
        timestamp: new Date().toLocaleTimeString(),
        duration: parseFloat(duration),
        reason: reason,
        seed: currentSeed,
        isCurrentAttempt: false
    };
    
    // Add to beginning of array (newest first)
    logEntries.unshift(entry);
    
    // Keep only the most recent MAX_LOG_ENTRIES (plus current attempt)
    if (logEntries.length > MAX_LOG_ENTRIES) {
        logEntries.pop();
    }
    
    // Check if this run should be added to longest runs
    if (entry.duration > 0) {
        // Make a copy for longest runs
        const longRunEntry = {...entry};
        
        // Add to longest runs array
        longestRuns.push(longRunEntry);
        
        // Sort by duration (descending)
        longestRuns.sort((a, b) => b.duration - a.duration);
        
        // Keep only the MAX_LONGEST_RUNS
        if (longestRuns.length > MAX_LONGEST_RUNS) {
            longestRuns.pop();
        }
        
        // Save longest runs to local storage for persistence
        try {
            localStorage.setItem('longestRuns', JSON.stringify(longestRuns));
        } catch (e) {
            console.warn('Failed to save longest runs to local storage:', e);
        }
    }
    
    // Update the log display
    updateLogDisplay();
}

// Initialize the log tabs
function initializeLogTabs() {
    const logContainer = document.getElementById('log-container');
    if (!logContainer) return;
    
    // Check if tabs already exist
    if (document.getElementById('log-tabs')) return;
    
    // Load longest runs from local storage if available
    try {
        const savedRuns = localStorage.getItem('longestRuns');
        if (savedRuns) {
            longestRuns = JSON.parse(savedRuns);
        }
    } catch (e) {
        console.warn('Failed to load longest runs from local storage:', e);
    }
    
    // Create tab navigation
    const tabsContainer = document.createElement('div');
    tabsContainer.id = 'log-tabs';
    tabsContainer.className = 'log-tabs';
    tabsContainer.style.display = 'flex';
    tabsContainer.style.borderBottom = '1px solid #444';
    tabsContainer.style.marginBottom = '10px';
    
    // Create Recent tab
    const recentTab = document.createElement('div');
    recentTab.className = 'log-tab active';
    recentTab.textContent = 'Recent';
    recentTab.style.padding = '8px 15px';
    recentTab.style.cursor = 'pointer';
    recentTab.style.borderBottom = '2px solid #4CAF50';
    recentTab.addEventListener('click', () => {
        setActiveTab('recent');
    });
    
    // Create Longest tab
    const longestTab = document.createElement('div');
    longestTab.className = 'log-tab';
    longestTab.textContent = 'Longest Runs';
    longestTab.style.padding = '8px 15px';
    longestTab.style.cursor = 'pointer';
    longestTab.addEventListener('click', () => {
        setActiveTab('longest');
    });
    
    // Add tabs to container
    tabsContainer.appendChild(recentTab);
    tabsContainer.appendChild(longestTab);
    
    // Create entries container
    const entriesContainer = document.createElement('div');
    entriesContainer.id = 'log-entries';
    
    // Insert tabs before the title
    const logTitle = document.getElementById('log-title');
    if (logTitle) {
        logContainer.insertBefore(tabsContainer, logTitle);
        
        // Update title text
        logTitle.textContent = 'Simulation Attempts';
    } else {
        logContainer.prepend(tabsContainer);
    }
}

// Set active tab
function setActiveTab(tabName) {
    activeLogTab = tabName;
    
    // Update tab styling
    const tabs = document.querySelectorAll('.log-tab');
    tabs.forEach(tab => {
        tab.classList.remove('active');
        tab.style.borderBottom = 'none';
    });
    
    // Set active tab style
    const activeTab = [...tabs].find(tab => 
        tab.textContent === (tabName === 'recent' ? 'Recent' : 'Longest Runs')
    );
    
    if (activeTab) {
        activeTab.classList.add('active');
        activeTab.style.borderBottom = '2px solid #4CAF50';
    }
    
    // Update log display
    updateLogDisplay();
}

// Update the log display in the DOM
function updateLogDisplay() {
    const logContainer = document.getElementById('log-entries');
    if (!logContainer) return;
    
    // Clear existing entries
    logContainer.innerHTML = '';
    
    // Create the current attempt entry at the top (only show in Recent tab)
    if (activeLogTab === 'recent') {
        const currentDuration = ((Date.now() - attemptStartTime) / 1000).toFixed(2);
        const currentElement = document.createElement('div');
        currentElement.className = 'log-entry current-attempt';
        currentElement.innerHTML = `
            <div><span class="time">Current Attempt</span></div>
            <div>Seed: <span class="seed">${currentSeed}</span></div>
            <div>Duration: <span class="time" id="current-duration">${currentDuration}s</span></div>
            <div>Status: <span class="status">Running...</span></div>
        `;
        logContainer.appendChild(currentElement);
        
        // Add a separator
        const separator = document.createElement('div');
        separator.className = 'log-separator';
        separator.innerHTML = '<hr>';
        logContainer.appendChild(separator);
        
        // Add recent entries
        logEntries.forEach((entry, index) => {
            const entryElement = document.createElement('div');
            entryElement.className = 'log-entry';
            entryElement.innerHTML = `
                <div><span class="time">${entry.timestamp}</span></div>
                <div>Seed: <span class="seed">${entry.seed !== undefined ? entry.seed : 'N/A'}</span></div>
                <div>Duration: <span class="time">${entry.duration.toFixed(2)}s</span></div>
                <div>Reason: <span class="reason">${entry.reason}</span></div>
            `;
            logContainer.appendChild(entryElement);
        });
    } else {
        // Show longest runs tab
        if (longestRuns.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'log-empty';
            emptyMessage.textContent = 'No completed runs yet';
            emptyMessage.style.padding = '20px';
            emptyMessage.style.textAlign = 'center';
            emptyMessage.style.color = '#999';
            logContainer.appendChild(emptyMessage);
        } else {
            // Add longest run entries
            longestRuns.forEach((entry, index) => {
                const entryElement = document.createElement('div');
                entryElement.className = 'log-entry longest-run';
                entryElement.style.backgroundColor = 'rgba(70, 90, 120, 0.5)';
                entryElement.style.marginBottom = '8px';
                
                // Add a special indicator for the top 3
                let rankText = '';
                if (index < 3) {
                    const rankEmojis = ['🥇', '🥈', '🥉'];
                    rankText = `<span style="font-size: 18px; margin-right: 5px;">${rankEmojis[index]}</span>`;
                }
                
                entryElement.innerHTML = `
                    <div>${rankText}<span class="rank">#${index + 1}</span> <span class="time">${entry.timestamp}</span></div>
                    <div>Seed: <span class="seed" style="font-weight: bold;">${entry.seed !== undefined ? entry.seed : 'N/A'}</span></div>
                    <div>Duration: <span class="time" style="color: #ffcc00; font-weight: bold; font-size: 16px;">${entry.duration.toFixed(2)}s</span></div>
                    <div>Reason: <span class="reason">${entry.reason}</span></div>
                    <button class="run-seed-btn" data-seed="${entry.seed}">Run This Seed</button>
                `;
                logContainer.appendChild(entryElement);
                
                // Add event listener to the run seed button
                const runSeedBtn = entryElement.querySelector('.run-seed-btn');
                runSeedBtn.style.marginTop = '5px';
                runSeedBtn.style.padding = '5px 10px';
                runSeedBtn.style.background = '#4CAF50';
                runSeedBtn.style.border = 'none';
                runSeedBtn.style.color = 'white';
                runSeedBtn.style.borderRadius = '4px';
                runSeedBtn.style.cursor = 'pointer';
                
                runSeedBtn.addEventListener('click', (e) => {
                    const seed = e.target.getAttribute('data-seed');
                    if (seed) runWithSeed(seed);
                });
            });
        }
    }
}

// Update the current attempt timer
function updateCurrentAttemptTimer() {
    const currentDuration = document.getElementById('current-duration');
    if (currentDuration) {
        const duration = ((Date.now() - attemptStartTime) / 1000).toFixed(2);
        currentDuration.textContent = `${duration}s`;
    }
}

// Check for actual collisions (not predictions)
function checkCollisions() {
    for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
            const distance = bodies[i].position.distanceTo(bodies[j].position);
            
            // Consider a collision if distance is less than the sum of radii (both 1 in our case)
            if (distance < 2) {
                // Calculate collision point (midpoint between the two bodies)
                const collisionPoint = new THREE.Vector3().addVectors(
                    bodies[i].position, 
                    bodies[j].position
                ).multiplyScalar(0.5);
                
                // Average color for explosion
                const color1 = new THREE.Color(bodies[i].color);
                const color2 = new THREE.Color(bodies[j].color);
                const mixedColor = new THREE.Color(
                    (color1.r + color2.r) / 2,
                    (color1.g + color2.g) / 2,
                    (color1.b + color2.b) / 2
                );
                
                // Create explosion at collision point
                createExplosion(collisionPoint, mixedColor);
                
                // Save current graph data before resetting
                if (trajectoryPoints.some(points => points.length > 0)) {
                    saveCurrentGraphAsHistorical();
                }
                
                // Add log entry for the collision
                const collisionReason = `Collision between Body ${i+1} and Body ${j+1}`;
                addLogEntry(collisionReason);
                
                // Reset simulation (optional - you can also handle the collision differently)
                resetSimulation();
                
                // Display collision message
                document.getElementById('prediction-info').textContent = 
                    `Collision occurred between Body ${i+1} and Body ${j+1}!`;
                
                return true;
            }
        }
    }
    
    return false;
}

// Initialize orbit history array
function initializeOrbitHistory() {
    // Reset orbit history
    orbitHistory = [];
    
    // For each pair of bodies, create an array to store their relative data
    // Pairs: 0-1, 0-2, 1-2
    for (let i = 0; i < 3; i++) {
        orbitHistory[i] = [];
    }
    
    // Reset harmony values
    harmonyValues = [0, 0, 0];
    
    // Reset orbiting pairs
    orbitingPairs = [];
    
    // Reset flashing borders
    flashingBorders = [false, false, false];
}

// Get pair index for two bodies
function getPairIndex(bodyA, bodyB) {
    if ((bodyA === 0 && bodyB === 1) || (bodyA === 1 && bodyB === 0)) return 0;
    if ((bodyA === 0 && bodyB === 2) || (bodyA === 2 && bodyB === 0)) return 1;
    if ((bodyA === 1 && bodyB === 2) || (bodyA === 2 && bodyB === 1)) return 2;
    return -1; // Invalid pair
}

// Update orbit history for all pairs
function updateOrbitHistory() {
    // Only update every ORBIT_CHECK_INTERVAL frames
    if (frameCount % ORBIT_CHECK_INTERVAL !== 0) return;
    
    // Process each pair of bodies
    for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
            const pairIndex = getPairIndex(i, j);
            const bodyA = bodies[i];
            const bodyB = bodies[j];
            
            // Calculate relative position
            const relativePos = bodyA.position.clone().sub(bodyB.position);
            const distance = relativePos.length();
            
            // Calculate relative velocity
            const relativeVel = bodyA.velocity.clone().sub(bodyB.velocity);
            
            // Calculate angular momentum (cross product of r and v)
            const angularMomentum = new THREE.Vector3().crossVectors(relativePos, relativeVel).length();
            
            // Calculate orbital energy
            const orbitalEnergy = 0.5 * relativeVel.lengthSq() - G * bodyA.mass * bodyB.mass / distance;
            
            // Store orbital data
            const orbitalData = {
                distance: distance,
                angularMomentum: angularMomentum,
                orbitalEnergy: orbitalEnergy,
                time: simulationTime
            };
            
            // Add to history
            orbitHistory[pairIndex].push(orbitalData);
            
            // Limit history size
            while (orbitHistory[pairIndex].length > ORBIT_HISTORY_SIZE) {
                orbitHistory[pairIndex].shift();
            }
        }
    }
    
    // Check for stable orbits and update harmony values
    updateHarmonyValues();
}

// Calculate variance of an array of values
function calculateVariance(values) {
    if (values.length === 0) return 0;
    
    // Calculate mean
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    
    // Calculate variance
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    
    // Return coefficient of variation (normalized variance)
    return Math.sqrt(variance) / mean;
}

// Update harmony values based on orbital stability
function updateHarmonyValues() {
    // Get predicted collisions information
    const predictedCollisions = predictCollisions();
    const collisionPairs = predictedCollisions.map(collision => collision.pairIndex);
    
    // Only proceed if we have enough samples
    for (let pairIndex = 0; pairIndex < 3; pairIndex++) {
        const history = orbitHistory[pairIndex];
        
        // Skip if not enough history but use a very small minimum
        if (history.length < 5) {
            harmonyValues[pairIndex] = 0;
            continue;
        }
        
        // Extract the two body indices from the pair index
        let body1, body2;
        if (pairIndex === 0) {
            body1 = 0; body2 = 1; // Red-Green
        } else if (pairIndex === 1) {
            body1 = 0; body2 = 2; // Red-Blue
        } else {
            body1 = 1; body2 = 2; // Green-Blue
        }
        
        // If this pair is predicted to collide, set harmony to 0 immediately and continue
        if (collisionPairs.includes(pairIndex)) {
            // Find the collision object for this pair
            const collision = predictedCollisions.find(c => c.pairIndex === pairIndex);
            
            // Immediately set harmony to zero
            harmonyValues[pairIndex] = 0;
            
            // If this pair was considered orbiting, remove it
            if (orbitingPairs.includes(pairIndex)) {
                orbitingPairs = orbitingPairs.filter(p => p !== pairIndex);
                console.log(`Bodies in pair ${pairIndex} lost harmony due to predicted collision in ${collision.timeToCollision.toFixed(2)}s`);
                
                // Update flashing borders
                updateFlashingBorders();
            }
            
            continue;
        }
        
        // Historical harmony calculation
        let historicalHarmony = 0;
        const windowSize = Math.min(history.length, ORBIT_MIN_SAMPLES);
        historicalHarmony = analyzeOrbitStability(history, windowSize, true);
        
        // Analyze future positions to detect potential harmony
        let futureHarmony = 0;
        if (futurePositions && futurePositions.length >= 2) {
            // Create a synthetic history from future positions
            const syntheticHistory = [];
            
            // Sample the future at regular intervals
            const sampleCount = Math.min(50, Math.floor(futurePositions[0].length / 1.5)); // Increased from 30 to 50 samples
            const sampleInterval = Math.floor(futurePositions[0].length / sampleCount);
            
            for (let i = 0; i < sampleCount; i++) {
                const stepIndex = i * sampleInterval;
                if (futurePositions[body1][stepIndex] && futurePositions[body2][stepIndex]) {
                    // Calculate distance
                    const relativePos = futurePositions[body1][stepIndex].clone()
                        .sub(futurePositions[body2][stepIndex]);
                    const distance = relativePos.length();
                    
                    // Estimate velocity from adjacent points
                    let body1Vel, body2Vel;
                    if (i < sampleCount - 1) {
                        const nextIndex = (i + 1) * sampleInterval;
                        body1Vel = futurePositions[body1][nextIndex].clone()
                            .sub(futurePositions[body1][stepIndex])
                            .multiplyScalar(1 / (sampleInterval * TIME_STEP));
                        body2Vel = futurePositions[body2][nextIndex].clone()
                            .sub(futurePositions[body2][stepIndex])
                            .multiplyScalar(1 / (sampleInterval * TIME_STEP));
                    } else {
                        const prevIndex = (i - 1) * sampleInterval;
                        body1Vel = futurePositions[body1][stepIndex].clone()
                            .sub(futurePositions[body1][prevIndex])
                            .multiplyScalar(1 / (sampleInterval * TIME_STEP));
                        body2Vel = futurePositions[body2][stepIndex].clone()
                            .sub(futurePositions[body2][prevIndex])
                            .multiplyScalar(1 / (sampleInterval * TIME_STEP));
                    }
                    
                    // Calculate relative velocity
                    const relativeVel = body1Vel.clone().sub(body2Vel);
                    
                    // Calculate angular momentum
                    const angularMomentum = new THREE.Vector3()
                        .crossVectors(relativePos, relativeVel).length();
                    
                    // Calculate orbital energy (approximation)
                    const orbitalEnergy = 0.5 * relativeVel.lengthSq() - 
                        G * bodies[body1].mass * bodies[body2].mass / distance;
                    
                    // Store orbital data
                    syntheticHistory.push({
                        distance: distance,
                        angularMomentum: angularMomentum,
                        orbitalEnergy: orbitalEnergy,
                        time: simulationTime + stepIndex * TIME_STEP
                    });
                }
            }
            
            // Analyze the future for harmony if we have enough points
            if (syntheticHistory.length >= 20) { // Increased minimum points from 10 to 20
                futureHarmony = analyzeOrbitStability(syntheticHistory, syntheticHistory.length, true);
            }
        }
        
        // Combine historical and future harmony with appropriate weighting
        const combinedHarmony = historicalHarmony * (1 - ORBIT_FUTURE_WEIGHT) + 
                                futureHarmony * ORBIT_FUTURE_WEIGHT;
        
        // Store previous harmony value to detect increases
        const previousHarmony = harmonyValues[pairIndex];
        
        // More responsive update with less smoothing
        harmonyValues[pairIndex] = harmonyValues[pairIndex] * 0.7 + combinedHarmony * 0.3;
        
        // Detect if harmony is increasing significantly
        if (harmonyValues[pairIndex] > previousHarmony + 0.02) {
            // Zoom in on these objects in the graph view
            zoomToObjectsInGraph(pairIndex, harmonyValues[pairIndex]);
        }
        
        // Increased threshold for marking as orbiting
        if (harmonyValues[pairIndex] > 0.65 && !orbitingPairs.includes(pairIndex)) {
            // Only mark as orbiting if no collision is predicted for this pair
            if (!collisionPairs.includes(pairIndex)) {
                orbitingPairs.push(pairIndex);
                console.log(`Bodies in pair ${pairIndex} are now orbiting with harmony ${harmonyValues[pairIndex].toFixed(2)}`);
                
                // Start flashing the corresponding camera borders
                updateFlashingBorders();
            }
        } 
        // Hysteresis: only drop orbiting status when harmony drops significantly below threshold
        // or when a collision is predicted
        else if ((harmonyValues[pairIndex] < 0.4 || collisionPairs.includes(pairIndex)) && 
                 orbitingPairs.includes(pairIndex)) {
            // If harmony drops too low or collision predicted, remove from orbiting pairs
            orbitingPairs = orbitingPairs.filter(p => p !== pairIndex);
            
            if (collisionPairs.includes(pairIndex)) {
                const collision = predictedCollisions.find(c => c.pairIndex === pairIndex);
                console.log(`Bodies in pair ${pairIndex} are no longer orbiting due to predicted collision in ${collision.timeToCollision.toFixed(2)}s`);
            } else {
                console.log(`Bodies in pair ${pairIndex} are no longer orbiting due to low harmony`);
            }
            
            // Update flashing borders
            updateFlashingBorders();
        }
    }
    
    // Display harmony values
    updateHarmonyDisplay();
}

// Analyze orbital stability for a given subset of history
function analyzeOrbitStability(history, windowSize, isEnhanced = false) {
    // Get the most recent windowSize items
    const recentHistory = history.slice(-windowSize);
    
    // Extract data arrays
    const distances = recentHistory.map(data => data.distance);
    const angularMomenta = recentHistory.map(data => data.angularMomentum);
    const orbitalEnergies = recentHistory.map(data => data.orbitalEnergy);
    
    // Calculate variances
    const distanceVariance = calculateVariance(distances);
    const angularVariance = calculateVariance(angularMomenta);
    const energyVariance = calculateVariance(orbitalEnergies);
    
    // For enhanced mode, check for patterns in the data
    let patternScore = 0;
    if (isEnhanced && distances.length > 10) {
        // Check for periodicity in distance values
        const periodicityScore = detectPeriodicity(distances);
        patternScore = periodicityScore;
    }
    
    // Normalized variances relative to their thresholds
    const normDistVariance = distanceVariance / ORBIT_DISTANCE_VARIANCE_THRESHOLD;
    const normAngVariance = angularVariance / ORBIT_ANGULAR_VARIANCE_THRESHOLD;
    const normEnVariance = energyVariance / 0.5; // Using 0.5 as a reasonable threshold
    
    // Combined variance score (weighted)
    const combinedVariance = (normDistVariance * 0.5) + (normAngVariance * 0.3) + (normEnVariance * 0.2);
    
    // Calculate stability factor with stricter scoring
    if (combinedVariance < 1.0) { // Reduced from 1.5 for stricter threshold
        // Calculate harmony as the inverse of the combined variances, normalized to 0-1
        let harmonyScore = Math.max(0, 1 - (combinedVariance / 1.0));
        
        // Enhance score with pattern detection result, but with less weight
        if (isEnhanced) {
            harmonyScore = harmonyScore * 0.9 + patternScore * 0.1; // Reduced pattern influence from 0.2 to 0.1
        }
        
        // Apply a power curve that's less generous with mid-range values
        return Math.pow(harmonyScore, 0.9); // Increased exponent from 0.7 to 0.9 for less boosting
    }
    
    return 0;
}

// Helper function to detect periodicity in a time series
function detectPeriodicity(values) {
    if (values.length < 15) return 0; // Increased minimum requirement from 10 to 15
    
    // Calculate autocorrelation to find periodic patterns
    let maxCorrelation = 0;
    const maxLag = Math.min(Math.floor(values.length / 2.5), 50); // Adjusted max period calculation with a cap at 50
    
    for (let lag = 1; lag < maxLag; lag++) {
        let correlation = 0;
        let count = 0;
        
        for (let i = 0; i < values.length - lag; i++) {
            correlation += Math.abs(values[i] - values[i + lag]);
            count++;
        }
        
        if (count > 0) {
            // Normalize and invert (lower difference = higher correlation)
            const meanDiff = correlation / count;
            const meanValue = values.reduce((a, b) => a + b, 0) / values.length;
            const normalizedCorrelation = 1 - Math.min(1, meanDiff / meanValue);
            
            // Keep track of the highest correlation
            maxCorrelation = Math.max(maxCorrelation, normalizedCorrelation);
        }
    }
    
    // Apply a stricter threshold for considering periodicity
    return maxCorrelation > 0.2 ? maxCorrelation : 0; // Added a minimum threshold of 0.2
}

// Update display of harmony values
function updateHarmonyDisplay() {
    // Find or create harmony display
    let harmonyDisplay = document.getElementById('harmony-display');
    if (!harmonyDisplay) {
        harmonyDisplay = document.createElement('div');
        harmonyDisplay.id = 'harmony-display';
        harmonyDisplay.style.position = 'absolute';
        harmonyDisplay.style.bottom = '50px';
        harmonyDisplay.style.left = '10px';
        harmonyDisplay.style.background = 'rgba(0, 0, 0, 0.5)';
        harmonyDisplay.style.color = 'white';
        harmonyDisplay.style.padding = '10px';
        harmonyDisplay.style.borderRadius = '5px';
        harmonyDisplay.style.zIndex = '100';
        document.body.appendChild(harmonyDisplay);
    }
    
    // Calculate how long the simulation has been running
    const runDuration = simulationTime.toFixed(1);
    
    // Update content with harmony values
    harmonyDisplay.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 5px;">Orbital Harmony (${runDuration}s):</div>
        <div>Red-Green: <span style="color: ${getHarmonyColor(harmonyValues[0])}">${harmonyValues[0].toFixed(2)}</span></div>
        <div>Red-Blue: <span style="color: ${getHarmonyColor(harmonyValues[1])}">${harmonyValues[1].toFixed(2)}</span></div>
        <div>Green-Blue: <span style="color: ${getHarmonyColor(harmonyValues[2])}">${harmonyValues[2].toFixed(2)}</span></div>
        <div style="font-size: 0.8em; margin-top: 5px; color: #aaa;">Note: Some orbits may take time to stabilize</div>
    `;
}

// Get color based on harmony value
function getHarmonyColor(value) {
    // Red to yellow to green gradient
    if (value < 0.5) {
        // Red to yellow
        const g = Math.floor(255 * (value * 2));
        return `rgb(255, ${g}, 0)`;
    } else {
        // Yellow to green
        const r = Math.floor(255 * (2 - value * 2));
        return `rgb(${r}, 255, 0)`;
    }
}

// Update flashing effect for camera borders
function updateFlashingEffect() {
    const currentTime = Date.now();
    
    // For each camera, update border color based on harmony values
    for (let i = 0; i < 3; i++) {
        const cameraElement = document.getElementById(`camera${i+1}`);
        if (!cameraElement) continue;
        
        // Determine which harmony values affect this camera
        let maxHarmony = 0;
        
        // For camera 0 (red), check pairs 0-1 and 0-2
        if (i === 0) {
            maxHarmony = Math.max(harmonyValues[0], harmonyValues[1]);
        }
        // For camera 1 (green), check pairs 0-1 and 1-2
        else if (i === 1) {
            maxHarmony = Math.max(harmonyValues[0], harmonyValues[2]);
        }
        // For camera 2 (blue), check pairs 0-2 and 1-2
        else if (i === 2) {
            maxHarmony = Math.max(harmonyValues[1], harmonyValues[2]);
        }
        
        // Fixed border width (no scaling with harmony)
        const borderWidth = 2; // Constant 2px width
        
        if (maxHarmony > 0.1) {
            // Calculate border color intensity based on harmony (black to white)
            const intensity = Math.floor(maxHarmony * 255);
            // Use white color with varying intensity
            const borderColor = `rgb(${intensity}, ${intensity}, ${intensity})`;
            
            // Apply border properties with fixed width
            cameraElement.style.outline = `${borderWidth}px solid ${borderColor}`;
            
            // Add glow effect proportional to harmony
            const glowIntensity = Math.floor(maxHarmony * 10);
            const glowColor = `rgba(${intensity}, ${intensity}, ${intensity}, 0.5)`;
            cameraElement.style.boxShadow = `inset 0 0 ${glowIntensity}px ${glowColor}`;
        } else {
            // No harmony - use dark gray outline
            cameraElement.style.outline = `${borderWidth}px solid #333`;
            cameraElement.style.boxShadow = 'none';
        }
    }
}

// Find the two closest objects and update the main camera to frame them
function updateMainCameraToFrameClosestObjects() {
    // Update more frequently for smoother camera movement
    if (frameCount % 2 !== 0) return; // Update every other frame instead of every 5th
    
    // Increment rotation angle for slow rotation effect
    // Only apply rotation if user has not manually controlled camera and rotation is enabled
    if (!userHasControlledCamera && cameraRotationEnabled) {
        mainCameraRotationAngle += CAMERA_ROTATION_SPEED;
        // Keep angle in reasonable range to avoid floating point issues over time
        if (mainCameraRotationAngle > Math.PI * 2) {
            mainCameraRotationAngle -= Math.PI * 2;
        }
    }
    
    // Check if user is currently interacting with the camera
    if (controls.enableDamping && controls.enabled) {
        // Calculate current distance from camera to its target
        const cameraToTarget = new THREE.Vector3().subVectors(
            mainCamera.position, controls.target
        ).length();
        
        // If distance has changed significantly from our tracked distance,
        // user has manually zoomed - update our recorded distance
        if (Math.abs(cameraToTarget - mainCameraDistance) > 1) {
            // Clamp the distance to prevent getting too far away
            mainCameraDistance = Math.max(MIN_MAIN_CAMERA_DISTANCE, 
                                      Math.min(MAX_MAIN_CAMERA_DISTANCE, cameraToTarget));
            userHasControlledCamera = true;
        }
    }
    
    // Dynamic camera distance based on object velocity and separation
    // This will pull the camera closer during high-speed interactions
    let baseDistance = mainCameraDistance;
    
    // Find the two closest objects to each other
    let closestPair = [0, 1];
    let minDistance = Infinity;
    
    // Check distance between each pair of objects
    const d01 = bodies[0].position.distanceTo(bodies[1].position);
    const d02 = bodies[0].position.distanceTo(bodies[2].position);
    const d12 = bodies[1].position.distanceTo(bodies[2].position);
    
    // Find the minimum distance pair
    if (d01 < minDistance) {
        minDistance = d01;
        closestPair = [0, 1];
    }
    if (d02 < minDistance) {
        minDistance = d02;
        closestPair = [0, 2];
    }
    if (d12 < minDistance) {
        minDistance = d12;
        closestPair = [1, 2];
    }
    
    // If the closest pair has changed, don't reset the camera distance
    // Just note the change for tracking purposes
    if (closestPair[0] !== previousTrackedPair[0] || closestPair[1] !== previousTrackedPair[1]) {
        previousTrackedPair = [...closestPair];
        // Don't reset userHasControlledCamera flag when pair changes
    }
    
    // Get the two closest bodies
    const body1 = closestPair[0];
    const body2 = closestPair[1];
    
    // Calculate midpoint between the two closest bodies
    const targetLookAtX = (bodies[body1].position.x + bodies[body2].position.x) / 2;
    const targetLookAtY = (bodies[body1].position.y + bodies[body2].position.y) / 2;
    const targetLookAtZ = (bodies[body1].position.z + bodies[body2].position.z) / 2;
    
    // Calculate the combined velocity vector of the two objects to determine movement direction
    const vel1 = bodies[body1].velocity;
    const vel2 = bodies[body2].velocity;
    
    // Calculate the total velocity magnitude of both objects (not just average)
    // This helps emphasize high-speed interactions
    const totalVelMagnitude = vel1.length() + vel2.length();
    
    // Get the combined velocity (average of the two)
    let dirX = (vel1.x + vel2.x) / 2;
    let dirY = (vel1.y + vel2.y) / 2;
    let dirZ = (vel1.z + vel2.z) / 2;
    
    // Normalize velocity vector if significant, otherwise use default camera position
    const velMagnitude = Math.sqrt(dirX*dirX + dirY*dirY + dirZ*dirZ);
    
    // Dynamic camera distance based on object velocity and separation
    // Only apply these modifiers if user hasn't manually controlled the camera
    let dynamicDistance = baseDistance;
    
    if (!userHasControlledCamera) {
        // Adjust distance based on object proximity (closer when objects are close together)
        dynamicDistance *= Math.max(0.4, Math.min(1.0, minDistance / 0.1));
        
        // Adjust distance based on velocity (closer when objects are moving quickly)
        const speedFactor = Math.max(1.0, Math.min(1.0, 3 / (totalVelMagnitude + 0.1)));
        dynamicDistance *= speedFactor;
        
        // Ensure distance stays within allowable range even in automatic mode
        dynamicDistance = Math.max(MIN_MAIN_CAMERA_DISTANCE, 
                               Math.min(MAX_MAIN_CAMERA_DISTANCE, dynamicDistance));
    } else {
        // Even in user-controlled mode, ensure we don't get too far away
        dynamicDistance = Math.max(MIN_MAIN_CAMERA_DISTANCE, 
                               Math.min(MAX_MAIN_CAMERA_DISTANCE, dynamicDistance));
    }
    
    if (velMagnitude > 0.3) { // Lower threshold for more responsiveness
        // Normalize the direction vector
        dirX /= velMagnitude;
        dirY /= velMagnitude;
        dirZ /= velMagnitude;
        
        // Emphasize vertical component for more dramatic angles
        dirY *= 1.2;
    } else {
        // Default direction if velocity is too small (traditional view slightly behind and above)
        dirX = 0;
        dirY = 0.4; // More elevation for better view
        dirZ = 1.0;
    }
    
    // Calculate camera position behind the objects' movement direction
    // Add rotation for an orbital effect when not user-controlled
    let cameraPosX, cameraPosY, cameraPosZ;
    
    if (!userHasControlledCamera && cameraRotationEnabled) {
        // Apply rotation around the Y axis (vertical axis)
        cameraPosX = targetLookAtX + Math.sin(mainCameraRotationAngle) * dynamicDistance;
        cameraPosY = targetLookAtY + (dynamicDistance * 0.3); // Add slight elevation
        cameraPosZ = targetLookAtZ + Math.cos(mainCameraRotationAngle) * dynamicDistance;
    } else {
        // Use the original calculation based on velocity direction
        cameraPosX = targetLookAtX - dirX * dynamicDistance;
        cameraPosY = targetLookAtY - dirY * dynamicDistance + (dynamicDistance * 0.3); // Add slight elevation
        cameraPosZ = targetLookAtZ - dirZ * dynamicDistance;
    }
    
    // More responsive camera for stronger effect
    // Higher lerpFactor means faster camera transitions
    const lerpFactor = 0.06; // Increased from 0.02 for more responsive camera
    
    // Set the control's target to the midpoint of the two objects
    controls.target.x += (targetLookAtX - controls.target.x) * lerpFactor;
    controls.target.y += (targetLookAtY - controls.target.y) * lerpFactor;
    controls.target.z += (targetLookAtZ - controls.target.z) * lerpFactor;
    
    // Only update camera position if user is not actively controlling it
    // Check if mouse is down or mouse wheel recently used
    if (!isDragging) {
        mainCamera.position.x += (cameraPosX - mainCamera.position.x) * lerpFactor;
        mainCamera.position.y += (cameraPosY - mainCamera.position.y) * lerpFactor;
        mainCamera.position.z += (cameraPosZ - mainCamera.position.z) * lerpFactor;
        
        // After moving camera, verify distance is still within limits
        const currentDistance = new THREE.Vector3().subVectors(
            mainCamera.position, controls.target
        ).length();
        
        if (currentDistance > MAX_MAIN_CAMERA_DISTANCE || currentDistance < MIN_MAIN_CAMERA_DISTANCE) {
            // Normalize direction vector from target to camera
            const dir = new THREE.Vector3().subVectors(
                mainCamera.position, controls.target
            ).normalize();
            
            // Calculate clamped distance
            const clampedDistance = Math.max(MIN_MAIN_CAMERA_DISTANCE, 
                                         Math.min(MAX_MAIN_CAMERA_DISTANCE, currentDistance));
            
            // Apply clamped distance to position camera
            mainCamera.position.copy(controls.target).add(
                dir.multiplyScalar(clampedDistance)
            );
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    
    updatePhysics();
    checkCollisions();
    
    // Update orbit history and harmony values
    updateOrbitHistory();
    
    // Update flashing effect for orbiting bodies
    updateFlashingEffect();
    
    // Calculate future positions and update prediction lines
    predictCollisions();
    
    // Always show prediction lines with improved visibility
    for (let i = 0; i < predictionLines.length; i++) {
        predictionLines[i].visible = true;
        
        if (futurePositions[i] && futurePositions[i].length > 0) {
            // Create more visible line points
            const linePoints = [bodies[i].position.clone()];
            
            // Use every point to create detailed paths
            linePoints.push(...futurePositions[i]);
            
            // Update prediction line geometry
            const geometry = predictionLines[i].geometry;
            geometry.setFromPoints(linePoints);
            geometry.attributes.position.needsUpdate = true;
            
            // Ensure line is properly positioned
            predictionLines[i].position.set(0, 0, 0);
            predictionLines[i].rotation.set(0, 0, 0);
            predictionLines[i].scale.set(1, 1, 1);
            
            // Update material for maximum visibility
            predictionLines[i].material.depthTest = false;
            predictionLines[i].material.transparent = true;
            predictionLines[i].material.opacity = 0.9;
            predictionLines[i].material.needsUpdate = true;
            predictionLines[i].renderOrder = 9999;
            predictionLines[i].frustumCulled = false;
        }
    }
    
    // Update main camera to track and frame the closest objects
    updateMainCameraToFrameClosestObjects();
    
    updateObjectCameras();
    updateExplosions();
    updateTimeVisuals();
    
    // Update current attempt timer
    updateCurrentAttemptTimer();
    
    // Update simulation time
    simulationTime += TIME_STEP;
    
    // Update graph
    updateGraph();
    
    // We still update controls but don't need to manually use them
    controls.update();
    
    // Render main view
    mainRenderer.render(scene, mainCamera);
    
    // Render graph
    graphRenderer.render(graphScene, graphCamera);
    
    // Render each object camera view
    for (let i = 0; i < objectRenderers.length; i++) {
        objectRenderers[i].render(scene, objectCameras[i]);
    }
}

// Reset simulation
function resetSimulation(generateNewSeed = true) {
    // Generate a new random seed for this attempt only if requested
    if (generateNewSeed) {
        currentSeed = Math.floor(Math.random() * MAX_SEED);
        rng = new SeededRandom(currentSeed);
    } else {
        // Otherwise just reset the existing RNG to ensure deterministic results
        rng.reset();
    }
    
    console.log(`Simulation starting with seed: ${currentSeed}`);
    
    // Only save current graph data as historical if there's actual data
    if (trajectoryPoints.some(points => points.length > 0)) {
        saveCurrentGraphAsHistorical();
    }
    
    // Record end of current attempt
    if (attemptStartTime !== 0) {
        // Determine the reason for ending
        let reason = "Manual reset";
        if (document.getElementById('prediction-info').textContent.includes('Collision')) {
            // Collision already logged in checkCollisions function
            // No need to add another log entry
        } else {
            // This was a manual reset - add it to the log
            addLogEntry(reason);
        }
    }
    
    // Reset attempt start time
    attemptStartTime = Date.now();
    
    // Remove existing bodies and their markers
    bodies.forEach(body => {
        scene.remove(body.mesh);
        
        if (body.markers) {
            body.markers.forEach(marker => {
                scene.remove(marker.mesh);
            });
        }
    });
    
    // Remove time visuals
    timeVisuals.forEach(visual => scene.remove(visual));
    
    // Do not remove active explosions - let them finish
    
    // Clear current trajectory points completely for new attempt
    trajectoryPoints = [[], [], []];
    
    // Clear current graph lines
    for (let i = 0; i < graphLines.length; i++) {
        if (graphLines[i]) {
            // Remove all segments from the scene
            while (graphLines[i].children.length > 0) {
                const segment = graphLines[i].children[0];
                graphLines[i].remove(segment);
                
                // Dispose of geometries and materials to free memory
                if (segment.geometry) segment.geometry.dispose();
                if (segment.material) segment.material.dispose();
            }
            graphScene.remove(graphLines[i]);
        }
    }
    graphLines = [];
    
    // Generate new random bodies using the current seed
    generateRandomBodies();
    
    // Reset orbit detection
    initializeOrbitHistory();
    
    // Set time offset to maximum
    const slider = document.getElementById('time-slider');
    if (slider) {
        slider.value = 1000;
        document.getElementById('time-value').textContent = '1000.0';
        timeOffset = 1000;
    }
    
    // Disable future visualization button since we're using time slider
    document.getElementById('toggle-future').disabled = true;
    showFuture = false;
    
    // Reset prediction display
    document.getElementById('prediction-info').textContent = '';
    
    // Force initial prediction calculation
    showPrediction = true; // Ensure visibility is on
    predictCollisions(); // Calculate future positions
    
    // Ensure prediction lines are visible with maximum time offset
    updatePredictionLinesWithOffset();
    updateTimeVisuals();
    
    // Update log display to show the new attempt
    updateLogDisplay();
    
    // Reset simulation time for new attempt
    simulationTime = 0;
    frameCount = 0;
    lastGraphUpdateTime = 0;
    
    // Reset graph view to default
    resetGraphView();
    
    // Create fresh graph lines for the new attempt
    createGraphLines();
    
    // Also update the seed input value to match current seed
    const seedInput = document.getElementById('seed-input');
    if (seedInput) {
        seedInput.value = currentSeed.toString();
    }
}

// Add function to run with a specific seed
function runWithSeed(seed) {
    seed = parseInt(seed) % MAX_SEED;
    console.log(`Running with seed: ${seed}`);
    
    currentSeed = seed;
    rng = new SeededRandom(currentSeed);
    
    // Force reset with this seed
    resetSimulation(false); // Pass false to indicate we're using a specific seed
}

// Event listeners
document.getElementById('reset').addEventListener('click', resetSimulation);

// Handle window resize
window.addEventListener('resize', () => {
    // Update main camera and renderer
    mainCamera.aspect = window.innerWidth / 2 / (window.innerHeight / 2);
    mainCamera.updateProjectionMatrix();
    mainRenderer.setSize(window.innerWidth / 2, window.innerHeight / 2);
    
    // Update graph renderer
    graphRenderer.setSize(window.innerWidth / 2, window.innerHeight / 2);
    
    // Update object cameras and renderers
    for (let i = 0; i < objectCameras.length; i++) {
        objectCameras[i].aspect = (window.innerWidth / 2) / (window.innerHeight / 3);
        objectCameras[i].updateProjectionMatrix();
        objectRenderers[i].setSize(window.innerWidth / 2, window.innerHeight / 3);
    }
});

// Initialize
function initialize() {
    generateRandomBodies();
    initializeSlider();
    initializeGraph();
    initializeLogTabs();
    initializeOrbitHistory();
    
    // Initialize log
    updateLogDisplay();
    
    // Reset attempt start time to now
    attemptStartTime = Date.now();
    
    // Force initial prediction calculation and visualization
    showPrediction = true; // Ensure prediction lines are visible
    predictCollisions(); // Calculate future positions
    updatePredictionLinesWithOffset(); // Update prediction lines with time offset
    updateTimeVisuals(); // Update time visuals
    
    // Initialize panel hover effects
    initializePanelHoverEffects();
    
    // Start animation loop
    animate();
    
    // Set up event listeners for camera control detection
    const mainCanvas = document.getElementById('main-canvas');
    if (mainCanvas) {
        // Mouse wheel event for zoom detection
        mainCanvas.addEventListener('wheel', function() {
            userHasControlledCamera = true;
            
            // Update distance based on current camera position
            const cameraToTarget = new THREE.Vector3().subVectors(
                mainCamera.position, controls.target
            ).length();
            
            mainCameraDistance = cameraToTarget;
        });
        
        // Track mouse down/up for dragging detection
        let mouseDown = false;
        mainCanvas.addEventListener('mousedown', function() {
            mouseDown = true;
            isDragging = true;
        });
        
        // Handle mouse up and potentially update camera distance
        document.addEventListener('mouseup', function() {
            if (mouseDown) {
                mouseDown = false;
                isDragging = false;
                
                // Update distance based on current camera position
                const cameraToTarget = new THREE.Vector3().subVectors(
                    mainCamera.position, controls.target
                ).length();
                
                mainCameraDistance = cameraToTarget;
                userHasControlledCamera = true;
            }
        });
        
        // Add a button to reset camera controls
        const resetButton = document.getElementById('reset-camera');
        if (resetButton) {
            resetButton.addEventListener('click', function() {
                userHasControlledCamera = false;
                mainCameraDistance = DEFAULT_MAIN_CAMERA_DISTANCE;
            });
        }
    }
    
    // Initialize UI event listeners
    document.getElementById('reset').addEventListener('click', () => resetSimulation(true));
    document.getElementById('run-seed').addEventListener('click', runWithCurrentSeed);
    document.getElementById('reset-camera').addEventListener('click', resetCameraView);
    
    // Add fullscreen button to controls
    const controlsDiv = document.getElementById('controls');
    const fullscreenRow = document.createElement('div');
    fullscreenRow.className = 'controls-row';
    
    const fullscreenButton = document.createElement('button');
    fullscreenButton.id = 'toggle-fullscreen';
    fullscreenButton.textContent = 'Toggle Fullscreen (F)';
    fullscreenButton.addEventListener('click', toggleFullscreen);
    
    fullscreenRow.appendChild(fullscreenButton);
    controlsDiv.appendChild(fullscreenRow);
    
    // Add camera rotation toggle button
    const rotationRow = document.createElement('div');
    rotationRow.className = 'controls-row';
    
    const rotationButton = document.createElement('button');
    rotationButton.id = 'toggle-rotation';
    rotationButton.textContent = 'Camera Rotation: ON';
    rotationButton.addEventListener('click', () => {
        cameraRotationEnabled = !cameraRotationEnabled;
        rotationButton.textContent = cameraRotationEnabled ? 
            'Camera Rotation: ON' : 'Camera Rotation: OFF';
        
        // If disabled, reset userHasControlledCamera so automatic tracking resumes
        if (!cameraRotationEnabled) {
            userHasControlledCamera = true; // Use standard camera behavior
        } else {
            userHasControlledCamera = false; // Allow rotation to work
        }
    });
    
    rotationRow.appendChild(rotationButton);
    controlsDiv.appendChild(rotationRow);
    
    // Initialize slider is already called at the beginning of this function
}

// Add panel hover glow effects
function initializePanelHoverEffects() {
    // Define the panels that should have the glow effect
    const panels = [
        document.getElementById('main-canvas'),
        document.getElementById('graph-container'),
        document.getElementById('camera1'),
        document.getElementById('camera2'),
        document.getElementById('camera3')
    ];
    
    // Add mouseenter and mouseleave event listeners to each panel
    panels.forEach(panel => {
        if (panel) {
            panel.addEventListener('mouseenter', function() {
                this.classList.add('panel-glow');
            });
            
            panel.addEventListener('mouseleave', function() {
                this.classList.remove('panel-glow');
            });
        }
    });
}

// Call initialize instead of directly calling functions
initialize();

// Add a downsampling function to reduce the number of points when necessary
function downsamplePoints(points, maxPoints) {
    if (points.length <= maxPoints) return points;
    
    const factor = Math.ceil(points.length / maxPoints);
    const result = [];
    
    for (let i = 0; i < points.length; i += factor) {
        result.push(points[i]);
    }
    
    return result;
}

// Initialize graph
function initializeGraph() {
    // Create graph lines
    createGraphLines();
    
    // Setup graph navigation
    setupGraphNavigation();
    
    // Add axis labels if they don't exist
    const graphContainer = document.getElementById('graph-container');
    if (graphContainer) {
        if (!document.getElementById('x-axis-label')) {
            const xLabel = document.createElement('div');
            xLabel.id = 'x-axis-label';
            xLabel.className = 'axis-label';
            xLabel.style.position = 'absolute';
            xLabel.style.bottom = '5px';
            xLabel.style.right = '10px';
            xLabel.innerHTML = 'Time (0—50)';
            graphContainer.appendChild(xLabel);
        }
    }
}

// Update the list of flashing borders based on orbiting pairs
function updateFlashingBorders() {
    // Reset all borders
    flashingBorders = [false, false, false];
    
    // For each orbiting pair, determine which bodies are involved
    orbitingPairs.forEach(pairIndex => {
        // Based on pair index, set corresponding bodies to flash
        if (pairIndex === 0) { // Bodies 0 and 1
            flashingBorders[0] = true;
            flashingBorders[1] = true;
        } else if (pairIndex === 1) { // Bodies 0 and 2
            flashingBorders[0] = true;
            flashingBorders[2] = true;
        } else if (pairIndex === 2) { // Bodies 1 and 2
            flashingBorders[1] = true;
            flashingBorders[2] = true;
        }
    });
}

// Function to zoom in on specific objects in the graph based on harmony
function zoomToObjectsInGraph(pairIndex, harmonyValue) {
    // Extract the two body indices from the pair index
    let body1, body2;
    if (pairIndex === 0) {
        body1 = 0; body2 = 1; // Red-Green
    } else if (pairIndex === 1) {
        body1 = 0; body2 = 2; // Red-Blue
    } else {
        body1 = 1; body2 = 2; // Green-Blue
    }
    
    // Only proceed if we have enough trajectory points
    if (trajectoryPoints[body1].length < 10 || trajectoryPoints[body2].length < 10) return;
    
    // Calculate zoom level based on harmony and clamp it to ensure reasonable bounds
    // FIXED: Higher harmony = smaller zoom factor (more zoomed in)
    // Scale between 1.0 (no zoom) and 0.2 (very zoomed in)
    const minZoom = 0.8; // Maximum zoom level (smallest scale)
    const maxZoom = 1.0; // Minimum zoom level (largest scale)
    // Clamp the harmonyValue between 0 and 1 to be safe
    const clampedHarmony = Math.max(0, Math.min(1, harmonyValue));
    const zoomScale = maxZoom - (clampedHarmony * (maxZoom - minZoom));
    
    // Set graph auto-zoom to true to allow our custom zooming
    graphAutoZoom = true;
    // Enable graph lock to make sure we follow these plots as they're being plotted
    graphLocked = true;
    
    // Find min/max y values in recent points to frame the objects properly
    let minY = Infinity;
    let maxY = -Infinity;
    const samples = 500; // Number of recent points to consider
    
    // Get the latest points from each trajectory
    for (let i = 0; i < samples; i++) {
        const index1 = trajectoryPoints[body1].length - 1 - i;
        const index2 = trajectoryPoints[body2].length - 1 - i;
        
        if (index1 >= 0) {
            minY = Math.min(minY, trajectoryPoints[body1][index1].y);
            maxY = Math.max(maxY, trajectoryPoints[body1][index1].y);
        }
        
        if (index2 >= 0) {
            minY = Math.min(minY, trajectoryPoints[body2][index2].y);
            maxY = Math.max(maxY, trajectoryPoints[body2][index2].y);
        }
    }
    
    // Add padding to ensure we see context
    const range = Math.max(maxY - minY, 0); // Ensure we have a minimum range to prevent division by zero
    const paddedMinY = minY - range * 0;
    const paddedMaxY = maxY + range * 0;



    
    // Set target values for smooth transitions instead of directly changing values
    targetGraphMinY = paddedMinY;
    targetGraphMaxY = paddedMaxY;
   
    
    // Set zoom level target - but clamped to reasonable bounds
    // FIXED: Invert the math to make higher harmony = closer zoom (smaller graphZoomLevel)
    targetGraphZoomLevel = Math.max(minZoom, Math.min(maxZoom, zoomScale));
    
    // Calculate the center point between the two objects
    const centerY = (minY + maxY) / 2;
    const normalizedY = (centerY - targetGraphMinY) / (targetGraphMaxY - targetGraphMinY) * -2;
    
    // Set target pan offset with clamping to prevent extreme values
    targetGraphPanOffset.y = Math.max(-1, Math.min(1, -normalizedY * (1 - zoomScale)));
    
    // Update time range to focus more on recent data and ensure we follow the plots
    // Scale timeRange inversely with harmony - higher harmony = narrower time window
    const timeRange = Math.max(20, simulationTime * 0.3 * (1.0 - 0.1 * clampedHarmony));
    targetGraphMinX = Math.max(0, simulationTime - timeRange);
    targetGraphMaxX = simulationTime + 10; // Add a bit of future space
    
    // Update buttons UI state to reflect the graph is now locked and auto-zooming
    const lockBtn = document.getElementById('graph-lock-button');
    if (lockBtn) {
        lockBtn.textContent = 'Lock Graph View: On';
    }
    
    const autoZoomBtn = document.getElementById('toggle-auto-zoom');
    if (autoZoomBtn) {
        autoZoomBtn.textContent = 'Auto Zoom: On';
    }
    
    // Note: We don't update graphs here anymore, it's done in updateGraph with smooth transitions
}

// Toggle fullscreen mode
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        // Enter fullscreen
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable fullscreen mode: ${err.message}`);
        });
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
    
    // Update button text
    updateFullscreenButtonText();
}

// Update fullscreen button text based on current state
function updateFullscreenButtonText() {
    const fullscreenButton = document.getElementById('toggle-fullscreen');
    if (fullscreenButton) {
        fullscreenButton.textContent = document.fullscreenElement ? 
            'Exit Fullscreen (F)' : 'Toggle Fullscreen (F)';
    }
}

// Add fullscreen change event listener to update button text
document.addEventListener('fullscreenchange', updateFullscreenButtonText);

// Add keyboard event listener for fullscreen toggle
document.addEventListener('keydown', (event) => {
    if (event.key === 'f' || event.key === 'F') {
        toggleFullscreen();
    }
});

// Camera rotation is configured at the top of the file
// ... existing code ...