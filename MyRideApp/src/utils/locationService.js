// src/utils/locationService.js

const GEOCODE_API = "https://nominatim.openstreetmap.org/search";
const REVERSE_GEO_API = "https://nominatim.openstreetmap.org/reverse";
const ROUTE_API = "https://router.project-osrm.org/route/v1/driving";

// Helper: Timeout wrapper to prevent hanging
const fetchWithTimeout = async (url, ms = 5000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

export const getCoordinates = async (address) => {
  if (!address) return null;
  try {
    const url = `${GEOCODE_API}?q=${encodeURIComponent(address + ', Saudi Arabia')}&format=json&limit=1`;
    const response = await fetchWithTimeout(url);
    const data = await response.json();
    return data && data.length > 0 ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null;
  } catch (error) {
    console.warn("Geocoding failed/timed out:", error);
    return null;
  }
};

export const getAddressFromCoordinates = async (lat, lng) => {
  try {
    const url = `${REVERSE_GEO_API}?lat=${lat}&lon=${lng}&format=json`;
    const response = await fetchWithTimeout(url);
    const data = await response.json();
    return data.display_name ? data.display_name.split(',').slice(0, 2).join(',') : "Map Location";
  } catch (error) {
    return "Map Location";
  }
};

export const getRouteData = async (start, end) => {
  if (!start || !end) return null;
  try {
    const url = `${ROUTE_API}/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    const response = await fetchWithTimeout(url, 8000); // 8s timeout for routing
    const data = await response.json();
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      return {
        distanceKm: (route.distance / 1000).toFixed(2),
        durationMin: (route.duration / 60).toFixed(0),
        // OSRM returns [lng, lat], Leaflet needs [lat, lng]
        geometry: route.geometry.coordinates.map(c => [c[1], c[0]]) 
      };
    }
    return null;
  } catch (error) {
    console.warn("Routing failed:", error);
    return null;
  }
};

export const getCurrentLocation = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("No GPS support"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
};