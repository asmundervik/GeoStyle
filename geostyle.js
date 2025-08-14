/**
 * GeoStyle
 *
 * A client-side JavaScript library that automatically collects user context data
 * including time of day, geographic location, environmental classification, and U.S. state.
 * Outputs data via callback, event, or global variable for user-defined styling.
 *
 * CORS REQUIREMENTS:
 * To use this script, your server must allow requests to the following external APIs:
 * - https://ip-api.com/json (IP geolocation)
 * - https://geocoding.geo.census.gov/geocoder/geographies/coordinates (US Census Bureau)
 *
 * Add these to your Content Security Policy (CSP) connect-src directive:
 * connect-src 'self' https://ip-api.com https://geocoding.geo.census.gov;
 *
 * Or configure your server as a proxy for these endpoints to avoid CORS entirely.
 *
 * NOTE ON CORS RESPONSIBILITY:
 * CORS headers are controlled by the external APIs (ip-api.com, census.gov), not your server.
 * Both APIs already support CORS with Access-Control-Allow-Origin headers.
 * Your server only needs to configure CSP to ALLOW outbound requests to these domains.
 * If you get CORS errors, it's likely a CSP restriction, not a server CORS configuration issue.
 *
 * @author Aasmund Ervik
 * @version 1.0.0
 */
class GeoStyle {
    constructor(options = {}) {
        this.debug = options.debug || false;
        this.onDataReady = options.onDataReady || null;
        this.apiEndpoints = {
            ipGeolocation: options.ipGeolocationEndpoint || 'https://ip-api.com/json',
            censusGeocoder: options.censusGeocoderEndpoint || 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates',
            censusBenchmark: options.censusBenchmark || 'Public_AR_Current',
            censusVintage: options.censusVintage || 'Current_Current'
        };
        
        // Auto-start collection when instantiated
        this.collectUserContext();
    }

    /**
     * Main collection process - Gathers all user context data
     * @returns {Promise<Object>} Complete user context object
     */
    async collectUserContext() {
        try {
            this.log('Starting GeoStyle context collection...');
            
            const context = {
                timeOfDay: this.getTimeOfDay(),
                timeContext: this.getTimeContext(),
                location: null,
                geographicClassification: null,
                browserInfo: this.getBrowserInfo(),
                timestamp: new Date().toISOString(),
                collectionDurationMs: null
            };
            const startTime = performance.now();
            
            // Collect location data asynchronously
            const locationData = await this.getLocationData();
            if (locationData) {
                context.location = locationData.location;
                context.geographicClassification = locationData.classification;
            }
            
            context.collectionDurationMs = Math.round(performance.now() - startTime);
            this.log('Context collection completed in', context.collectionDurationMs, 'ms');
            
            // Call user callback if provided
            if (this.onDataReady && typeof this.onDataReady === 'function') {
                this.onDataReady(context);
            }
            
            // Make available globally
            window.geoStyleContext = context;
            
            // Dispatch custom event
            window.dispatchEvent(new CustomEvent('geoStyleReady', { detail: context }));
            
            return context;
        } catch (error) {
            this.log('Error collecting GeoStyle context:', error);
            const errorContext = {
                timeOfDay: this.getTimeOfDay(),
                timeContext: this.getTimeContext(),
                location: null,
                geographicClassification: 'unknown',
                browserInfo: this.getBrowserInfo(),
                timestamp: new Date().toISOString(),
                error: error.message,
                collectionDurationMs: null
            };
            if (this.onDataReady) {
                this.onDataReady(errorContext);
            }
            
            window.geoStyleContext = errorContext;
            window.dispatchEvent(new CustomEvent('geoStyleReady', { detail: errorContext }));
            
            return errorContext;
        }
    }

    /**
     * Gets time of day classification
     * @returns {string} Time classification: 'morning', 'daytime', 'evening', 'night'
     */
    getTimeOfDay() {
        const hour = new Date().getHours();
        
        if (hour >= 6 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 17) return 'daytime';
        if (hour >= 17 && hour < 22) return 'evening';
        return 'night';
    }

    /**
     * Gets detailed time context
     * @returns {Object} Detailed time information
     */
    getTimeContext() {
        const now = new Date();
        return {
            hour: now.getHours(),
            isWeekend: now.getDay() === 0 || now.getDay() === 6,
            dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()],
            timeOfDay: this.getTimeOfDay()
        };
    }

    /**
     * Gets location data and geographic classification
     * @returns {Promise<Object|null>} Location and classification data
     */
    async getLocationData() {
        const cacheKey = 'geoStyleLocation';
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            this.log('Using cached location data');
            return JSON.parse(cached);
        }
        
        try {
            // Step 1: Get coordinates and data from IP
            const ipResponse = await fetch(`${this.apiEndpoints.ipGeolocation}?fields=lat,lon,status,region,country,city,timezone,query`);
            const ipData = await ipResponse.json();
            if (ipData.status !== 'success' || !ipData.lat || !ipData.lon) {
                this.log('IP geolocation failed:', ipData);
                return null;
            }
            
            // Step 2: Get Census classification and state
            const { classification, state } = await this.getCensusClassification(ipData.lat, ipData.lon);
            
            const result = {
                location: {
                    latitude: ipData.lat,
                    longitude: ipData.lon,
                    city: ipData.city || 'Unknown',
                    region: ipData.region || 'Unknown',
                    country: ipData.country || 'Unknown',
                    timezone: ipData.timezone || 'Unknown',
                    ip: ipData.query || null,
                    state: state || 'Unknown'
                },
                classification: classification || 'unknown'
            };
            
            sessionStorage.setItem(cacheKey, JSON.stringify(result));
            return result;
        } catch (error) {
            this.log('Error getting location data:', error);
            return null;
        }
    }

    /**
     * Gets browser and device information
     * @returns {Object} Browser context information
     */
    getBrowserInfo() {
        return {
            userAgent: navigator.userAgent,
            language: navigator.language,
            languages: navigator.languages || [navigator.language],
            platform: navigator.platform,
            cookieEnabled: navigator.cookieEnabled,
            onLine: navigator.onLine,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            screenResolution: {
                width: screen.width,
                height: screen.height,
                colorDepth: screen.colorDepth
            },
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            }
        };
    }

    /**
     * Gets Census Bureau geographic classification and state
     * @param {number} latitude - Latitude coordinate
     * @param {number} longitude - Longitude coordinate
     * @returns {Promise<Object>} Geographic classification and state
     */
    async getCensusClassification(latitude, longitude) {
        try {
            const url = `${this.apiEndpoints.censusGeocoder}?x=${longitude}&y=${latitude}&benchmark=${this.apiEndpoints.censusBenchmark}&vintage=${this.apiEndpoints.censusVintage}&format=json`;
            const response = await fetch(url);
            const data = await response.json();
            const geographies = data?.result?.geographies;
            if (!geographies) {
                this.log('No geographies found in Census data');
                return { classification: this.getSimpleClassificationFallback(latitude, longitude), state: null };
            }
            
            this.log('Available geography types:', Object.keys(geographies));
            
            let classification = 'rural';
            if (geographies['Urban Areas']) {
                this.log('Found Urban Areas classification');
                classification = 'urban';
            } else if (geographies['Combined Statistical Areas'] || geographies['Metropolitan Statistical Areas'] || geographies['Incorporated Places'] || geographies['Census Tracts']) {
                this.log('Found metropolitan or tract data');
                classification = 'suburban';
            } else if (geographies['Counties'] || geographies['States']) {
                this.log('Only Counties/States found');
                classification = 'rural';
            }
            
            // Extract state from States geography
            const state = geographies['States']?.[0]?.BASENAME || null;
            
            return { classification, state };
        } catch (error) {
            this.log('Error getting Census classification, using fallback:', error);
            return { classification: this.getSimpleClassificationFallback(latitude, longitude), state: null };
        }
    }

    /**
     * Simple geographic classification fallback using IP data
     * @param {number} latitude - Latitude coordinate
     * @param {number} longitude - Longitude coordinate
     * @returns {string} Basic classification
     */
    async getSimpleClassificationFallback(latitude, longitude) {
        try {
            const ipResponse = await fetch(`${this.apiEndpoints.ipGeolocation}?fields=city`);
            const ipData = await ipResponse.json();
            if (ipData.city && ipData.city !== 'Unknown') {
                this.log('Fallback: Using city from IP data - urban');
                return 'urban';
            }
            this.log('Fallback: No city data, assuming rural');
            return 'rural';
        } catch (error) {
            this.log('Fallback: Remote coordinates - rural');
            return 'rural';
        }
    }

    /**
     * Logging utility
     */
    log(...args) {
        if (this.debug) {
            console.log('[GeoStyle]', ...args);
        }
    }
}

// Auto-initialize when script loads
let geoStyleInstance;
// Initialize immediately when script loads
(function() {
    geoStyleInstance = new GeoStyle({
        debug: false // Set to true for development
    });
})();

/**
 * Main API function for developers - Access collected context data
 *
 * @param {Function} callback - Function to call when data is ready
 * @example
 * onGeoStyleReady(function(context) {
 *   console.log('Time:', context.timeOfDay); // 'morning', 'daytime', 'evening', 'night'
 *   console.log('Location:', context.location); // {city, region, country, timezone, ip, state}
 *   console.log('Environment:', context.geographicClassification); // 'urban', 'suburban', 'rural'
 *   console.log('Browser:', context.browserInfo); // Browser and device info
 *   // Apply custom styles, e.g.:
 *   if (context.geographicClassification === 'urban') {
 *     document.body.style.backgroundColor = '#ff4500';
 *   }
 * });
 */
function onGeoStyleReady(callback) {
    if (typeof callback !== 'function') {
        console.error('onGeoStyleReady requires a callback function');
        return;
    }
    // If data is already available, call immediately
    if (window.geoStyleContext) {
        callback(window.geoStyleContext);
        return;
    }
    // Otherwise, listen for the event
    window.addEventListener('geoStyleReady', function(event) {
        callback(event.detail);
    }, { once: true });
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
    // Node.js/CommonJS
    module.exports = { GeoStyle, onGeoStyleReady };
} else if (typeof define === 'function' && define.amd) {
    // AMD/RequireJS
    define([], function() {
        return { GeoStyle, onGeoStyleReady };
    });
} else {
    // Browser globals - main API
    window.onGeoStyleReady = onGeoStyleReady;
    window.GeoStyle = GeoStyle;
}

/**
 * SETUP INSTRUCTIONS:
 *
 * 1. Configure your server's Content Security Policy to allow external API calls:
 * connect-src 'self' https://ip-api.com https://geocoding.geo.census.gov;
 *
 * 2. OR set up server-side proxy endpoints to avoid CORS entirely
 *
 * 3. Include this script in your HTML:
 * <script src="geostyle.js"></script>
 *
 * Usage Examples:
 *
 * // Simple usage - hook into the data
 * onGeoStyleReady(function(context) {
 *   console.log('Time of day:', context.timeOfDay); // 'morning', 'daytime', 'evening', 'night'
 *   console.log('Geographic type:', context.geographicClassification); // 'urban', 'suburban', 'rural'
 *   console.log('State:', context.location?.state); // e.g., 'California'
 *   console.log('User location:', context.location?.city); // City name
 *   console.log('Screen size:', context.browserInfo.viewport); // Viewport dimensions
 * });
 *
 * // Alternative - listen for the event directly
 * window.addEventListener('geoStyleReady', function(event) {
 *   const context = event.detail;
 *   // Use context data for personalization
 * });
 *
 * // Access data synchronously if available (after collection)
 * if (window.geoStyleContext) {
 *   console.log('Data already collected:', window.geoStyleContext);
 * }
 */
