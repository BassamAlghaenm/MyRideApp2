import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import icon from 'leaflet/dist/images/marker-icon.png';
import shadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: shadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

// --- OPTIMIZED HELPERS ---

// 1. Universal Coordinate Parser (Handles Firestore Objects & Standard Objects)
const getPos = (loc) => {
  if (!loc) return null;
  const lat = loc.lat || loc._lat; 
  const lng = loc.lng || loc._long;
  if (lat && lng) return [parseFloat(lat), parseFloat(lng)];
  return null;
};

// 2. Universal Route Parser (Handles Arrays & Objects)
const sanitizeRoute = (routeData) => {
  if (!routeData || !Array.isArray(routeData) || routeData.length === 0) return [];
  // Case A: Already Leaflet Array [[lat,lng], [lat,lng]]
  if (Array.isArray(routeData[0])) return routeData;
  // Case B: Firestore Object Array [{lat,lng}, {lat,lng}]
  if (routeData[0].lat !== undefined || routeData[0]._lat !== undefined) {
    return routeData.map(p => getPos(p)).filter(p => p !== null);
  }
  return [];
};

const LocationSelector = ({ onMapClick }) => {
  useMapEvents({ click(e) { if (onMapClick) onMapClick(e.latlng); } });
  return null;
};

const MapUpdater = ({ center, route, requests }) => {
  const map = useMap();
  useEffect(() => {
    if (route && route.length > 0) {
      map.fitBounds(L.latLngBounds(route), { padding: [50, 50] });
    } else if (requests && requests.length > 0) {
      const markers = requests.map(r => getPos(r.pickupLocation)).filter(p => p !== null);
      if(markers.length > 0) map.fitBounds(L.latLngBounds(markers), { padding: [50, 50] });
    } else if (center) {
      map.flyTo(center, 13); // Smooth fly animation
    }
  }, [center, route, requests, map]);
  return null;
};

const MapComponent = ({ pickup, dropoff, routePath, onMapClick, requests }) => {
  const defaultCenter = [24.7136, 46.6753]; // Riyadh
  
  // Prepare Data
  const safeRoute = sanitizeRoute(routePath);
  const pickupPos = getPos(pickup);
  const dropoffPos = getPos(dropoff);
  
  // Intelligent Center Logic
  let center = defaultCenter;
  if (pickupPos) center = pickupPos;
  else if (requests && requests.length > 0) {
    const firstReq = getPos(requests[0].pickupLocation);
    if(firstReq) center = firstReq;
  }

  return (
    <div style={{ height: '100%', width: '100%', minHeight: '400px' }}>
      <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        
        <MapUpdater center={center} route={safeRoute} requests={requests} />
        {onMapClick && <LocationSelector onMapClick={onMapClick} />}

        {/* CURRENT RIDE LAYERS */}
        {pickupPos && <Marker position={pickupPos}><Popup>📍 Pickup</Popup></Marker>}
        {dropoffPos && <Marker position={dropoffPos}><Popup>🏁 Dropoff</Popup></Marker>}
        {safeRoute.length > 0 && <Polyline positions={safeRoute} color="#3B82F6" weight={5} opacity={0.7} />}

        {/* DRIVER REQUESTS (Green Circles) - High Z-Index */}
        {!pickup && requests && requests.map(req => {
          const pos = getPos(req.pickupLocation);
          if (!pos) return null;
          return (
            <CircleMarker 
              key={req.id} center={pos} radius={12} 
              pathOptions={{ color: 'white', fillColor: '#10B981', fillOpacity: 0.9, weight: 2 }}
              eventHandlers={{ click: () => {} }} // Ensures click capture
            >
              <Popup>
                <div style={{textAlign:'center', minWidth:'100px'}}>
                   <strong>📍 {req.pickupAddress}</strong>
                   <hr style={{borderColor:'#eee', margin:'5px 0'}}/>
                   Drop: {req.dropoffAddress}<br/>
                   <span style={{color: '#10B981', fontWeight:'bold', fontSize:'1.1rem'}}>💰 {req.priceTotal} SAR</span>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default MapComponent;