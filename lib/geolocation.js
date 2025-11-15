/**
 * Browser Geolocation API wrapper
 * Used to get user's geographic location for tracking purposes
 */

/**
 * Get user's current location using browser Geolocation API
 * @param {Object} options - Geolocation options
 * @param {number} options.timeout - Maximum time to wait for location (ms, default: 10000)
 * @param {number} options.maximumAge - Maximum age of cached location (ms, default: 0)
 * @param {boolean} options.enableHighAccuracy - Request high accuracy (default: false)
 * @returns {Promise<Object>} Location data with latitude, longitude, accuracy, etc.
 */
export const getUserLocation = (options = {}) => {
  const {
    timeout = 10000,
    maximumAge = 0,
    enableHighAccuracy = true
  } = options;

  return new Promise((resolve, reject) => {
    // Check if browser supports geolocation
    if (!navigator.geolocation) {
      console.warn('Geolocation is not supported by this browser');
      reject(new Error('Geolocation not supported'));
      return;
    }

    // Check if geolocation is available (user may have denied permission)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const locationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy, // in meters
          altitude: position.coords.altitude,
          altitudeAccuracy: position.coords.altitudeAccuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp
        };
        
        console.log('📍 Location retrieved:', {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          accuracy: `${locationData.accuracy}m`
        });
        
        resolve(locationData);
      },
      (error) => {
        let errorMessage = 'Unknown error occurred';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'User denied location permission';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timeout';
            break;
          default:
            errorMessage = 'An unknown error occurred';
            break;
        }
        
        console.warn('❌ Geolocation error:', errorMessage);
        reject(new Error(errorMessage));
      },
      {
        timeout,
        maximumAge,
        enableHighAccuracy
      }
    );
  });
};

/**
 * Watch user's location (for continuous tracking)
 * @param {Function} onSuccess - Success callback
 * @param {Function} onError - Error callback
 * @param {Object} options - Geolocation options
 * @returns {number} Watch ID that can be used to stop watching
 */
export const watchUserLocation = (onSuccess, onError, options = {}) => {
  const {
    timeout = 10000,
    maximumAge = 0,
    enableHighAccuracy = false
  } = options;

  if (!navigator.geolocation) {
    console.warn('Geolocation is not supported by this browser');
    onError(new Error('Geolocation not supported'));
    return null;
  }

  return navigator.geolocation.watchPosition(
    (position) => {
      const locationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp
      };
      onSuccess(locationData);
    },
    onError,
    {
      timeout,
      maximumAge,
      enableHighAccuracy
    }
  );
};

/**
 * Stop watching user's location
 * @param {number} watchId - Watch ID returned by watchUserLocation
 */
export const stopWatchingLocation = (watchId) => {
  if (watchId && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
  }
};

/**
 * Check if geolocation is supported
 * @returns {boolean} Whether geolocation is supported
 */
export const isGeolocationSupported = () => {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
};

/**
 * Request geolocation permission (returns current permission status)
 * Note: The actual permission request happens when getCurrentPosition is called
 * @returns {Promise<string>} Permission status: 'granted', 'denied', or 'prompt'
 */
export const checkGeolocationPermission = async () => {
  if (!isGeolocationSupported()) {
    return 'unsupported';
  }

  if (navigator.permissions) {
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      return permission.state; // 'granted', 'denied', or 'prompt'
    } catch (error) {
      console.warn('Permission query not supported:', error);
      return 'unknown';
    }
  }

  return 'unknown';
};
