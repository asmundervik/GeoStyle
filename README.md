# GeoStyle

GeoStyle is a lightweight, client-side JavaScript library that collects user context data, including time of day, geolocation, urban/rural classification, and U.S. state, using `ip-api.com` for coordinates and the U.S. Census Geocoder API for spatial data. The data is output via callbacks, events, or a global variable, enabling developers to create personalized, adaptive styling for web pages. Dependency-free and easy to integrate, GeoStyle empowers dynamic, context-aware user experiences.

## Installation

<script src="geostyle.js"></script>

## Usage

Include `geostyle.js` in your HTML and access user context data via the `onGeoStyleReady` callback, `geoStyleReady` event, or `window.geoStyleContext` global to apply custom styles based on time, location, or environment.

### Using the Callback
Use `onGeoStyleReady` to receive context data and apply styles:

```javascript
onGeoStyleReady(function(context) {
  // Apply styles based on environment or state
  if (context.geographicClassification === 'urban') {
    document.body.style.backgroundColor = '#ff4500';
  }
  if (context.location?.state === 'California') {
    document.body.style.border = '2px solid #ff0000';
  }
});
