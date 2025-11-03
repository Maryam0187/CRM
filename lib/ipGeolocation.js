/**
 * IP Geolocation Service
 * Uses free IP geolocation APIs to get location from IP address
 */

class IPGeolocation {
  /**
   * Get location from IP address using ip-api.com (free tier)
   * @param {string} ipAddress - IP address
   * @returns {Object|null} Location data or null if failed
   */
  static async getLocationFromIP(ipAddress) {
    if (!ipAddress) return null;

    // Skip private/internal IP addresses
    if (this.isPrivateIP(ipAddress)) {
      return {
        ip: ipAddress,
        city: 'Internal/Private Network',
        region: null,
        country: null,
        countryCode: null,
        timezone: null,
        isp: null,
        org: null,
        as: null,
        isPrivate: true,
        note: 'IP address is from internal network (Docker/LAN). Configure proxy to forward real client IP.'
      };
    }

    try {
      // Using ip-api.com free tier (150 requests per minute)
      const response = await fetch(`http://ip-api.com/json/${ipAddress}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error(`IP Geolocation API error: ${response.status}`);
        return null;
      }

      const data = await response.json();

      if (data.status === 'success') {
        return {
          ip: data.query || ipAddress,
          city: data.city || null,
          region: data.regionName || null,
          regionCode: data.region || null,
          country: data.country || null,
          countryCode: data.countryCode || null,
          zip: data.zip || null,
          latitude: data.lat || null,
          longitude: data.lon || null,
          timezone: data.timezone || null,
          isp: data.isp || null,
          org: data.org || null,
          as: data.as || null,
          isPrivate: false
        };
      } else {
        console.error(`IP Geolocation API returned error: ${data.message}`);
        return null;
      }
    } catch (error) {
      // Fail silently - don't block activity logging if geolocation fails
      console.error('IP Geolocation error:', error.message);
      return null;
    }
  }

  /**
   * Check if IP address is private/internal
   * @param {string} ipAddress - IP address
   * @returns {boolean}
   */
  static isPrivateIP(ipAddress) {
    if (!ipAddress) return false;

    // Remove IPv6 prefix if present
    const cleanIP = ipAddress.replace(/^::ffff:/, '').replace(/^:ffff:/, '');

    // Check for private IP ranges
    const privateRanges = [
      /^10\./,           // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // 172.16.0.0/12
      /^192\.168\./,     // 192.168.0.0/16
      /^127\./,          // 127.0.0.0/8 (localhost)
      /^169\.254\./,     // 169.254.0.0/16 (link-local)
      /^::1$/,           // IPv6 localhost
      /^fc00:/,          // IPv6 private
      /^fe80:/           // IPv6 link-local
    ];

    return privateRanges.some(range => range.test(cleanIP));
  }

  /**
   * Format location as string (City, Country)
   * @param {Object} location - Location data object
   * @returns {string}
   */
  static formatLocation(location) {
    if (!location) return 'Unknown';
    
    if (location.isPrivate) {
      return location.city || 'Internal Network (Docker/Private IP)';
    }

    const parts = [];
    if (location.city) parts.push(location.city);
    if (location.region) parts.push(location.region);
    if (location.country) parts.push(location.country);
    
    return parts.length > 0 ? parts.join(', ') : 'Unknown';
  }
}

module.exports = IPGeolocation;

