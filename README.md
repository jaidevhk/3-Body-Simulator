# 3D Three-Body Problem Simulator

A web-based 3D simulation of the classic three-body gravitational problem with predictive collision detection and future visualization.

## Features

- **Random Initial Conditions**: Each time you load the page or reset the simulation, the bodies are placed at random positions with random velocities.
- **Real-time Collision Prediction**: The simulator continuously calculates future trajectories to predict potential collisions between bodies.
- **Future Visualization**: Toggle a view of where the bodies will be in the near future.
- **Interactive Controls**: Rotate, zoom, and pan the camera to view the simulation from any angle.

## Controls

- **Reset Simulation**: Generates a new random setup with three bodies.
- **Toggle Prediction**: Show/hide the trajectory prediction lines.
- **Visualize Future**: Show/hide transparent versions of the bodies at their predicted future positions.

## How to Use

1. Open `index.html` in a modern web browser.
2. Use your mouse to rotate the view (left-click and drag), zoom (scroll), and pan (right-click and drag).
3. Use the buttons in the top-left corner to control the simulation features.
4. Watch the prediction information at the bottom of the screen to see if any collisions are predicted.

## Technical Details

The simulation uses:
- Three.js for 3D rendering
- Newtonian gravitational physics
- A simple numerical integrator for calculating body movements
- Forward prediction to detect potential collisions

## Browser Compatibility

This simulator works best in modern browsers with WebGL support such as:
- Chrome
- Firefox
- Safari
- Edge 