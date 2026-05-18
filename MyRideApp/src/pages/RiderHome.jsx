import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import MapComponent from '../components/MapComponent';
import ChatBox from '../components/ChatBox';
import ReportModal from '../components/ReportModal';
import SOSButton from '../components/SOSButton';
import { getCoordinates, getRouteData, getCurrentLocation, getAddressFromCoordinates } from '../utils/locationService';

const RiderHome = ({ user }) => {
  const [currentRide, setCurrentRide] = useState(null);
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [passengers, setPassengers] = useState(1);
  const [showReview, setShowReview] = useState(false);
  const [liveFare, setLiveFare] = useState(5.00);

  // GPS & Routing
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropoffCoords, setDropoffCoords] = useState(null);
  const [routePath, setRoutePath] = useState(null);
  const [estimatedPrice, setEstimatedPrice] = useState(null);
  const [isRequesting, setIsRequesting] = useState(false);

  // 1. Listen for Ride Updates
  useEffect(() => {
    const q = query(collection(db, "rides"), where("riderId", "==", user.uid), where("status", "in", ["pending", "accepted", "in_progress", "completed"]));
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
        if (data.status === "completed") setShowReview(true);
        setCurrentRide(data);
        if(data.routePath) setRoutePath(data.routePath);
      } else {
        setCurrentRide(null); setShowReview(false);
      }
    });
    return () => unsubscribe();
  }, [user.uid]);

  // 2. Live Meter
  useEffect(() => {
    let interval;
    if (currentRide?.status === 'in_progress' && currentRide?.pickupTime) {
      interval = setInterval(() => {
        const start = currentRide.pickupTime.toDate ? currentRide.pickupTime.toDate() : new Date(); 
        const mins = Math.ceil((new Date() - start) / 60000);
        setLiveFare(Math.max(5, mins * 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [currentRide]);

  // Actions
  const handleMapClick = async (latlng) => {
    const address = await getAddressFromCoordinates(latlng.lat, latlng.lng);
    const simpleCoords = { lat: latlng.lat, lng: latlng.lng };
    
    if (!pickup || !pickupCoords) {
      setPickupCoords(simpleCoords);
      setPickup(address);
    } else {
      setDropoffCoords(simpleCoords);
      setDropoff(address);
      calculateRoute(pickupCoords || simpleCoords, simpleCoords); 
    }
  };

  const useGPS = async () => {
    setPickup("Locating...");
    try {
      const coords = await getCurrentLocation();
      const address = await getAddressFromCoordinates(coords.lat, coords.lng);
      setPickupCoords(coords);
      setPickup(address || "Current Location");
    } catch (e) { alert("GPS Error: " + e.message); setPickup(""); }
  };

  const calculateRoute = async (startOverride = null, endOverride = null) => {
    const start = startOverride || pickupCoords || await getCoordinates(pickup);
    const end = endOverride || dropoffCoords || await getCoordinates(dropoff);
    if(!start || !end) return null;

    setPickupCoords(start); setDropoffCoords(end);
    const route = await getRouteData(start, end);
    if(route) {
      setRoutePath(route.geometry);
      const price = Math.round(5 + (parseFloat(route.distanceKm) * 2));
      setEstimatedPrice(price);
      return { route, price, start, end }; 
    }
    return null;
  };

  const requestRide = async () => {
    if (!pickup || !dropoff) return alert("Please set Pickup and Dropoff locations.");
    setIsRequesting(true);

    try {
      // Logic: If price/route isn't ready, force calculate one last time
      let data = { 
        route: routePath ? { geometry: routePath } : null, 
        price: estimatedPrice, 
        start: pickupCoords, 
        end: dropoffCoords 
      };

      if (!data.price || !data.route) {
         const result = await calculateRoute(); 
         if (result) data = result;
         else data.price = "Meter"; // Fallback if routing fails completely
      }

      // --- CRITICAL SAFEGUARD: Convert all Arrays to Objects ---
      // This prevents "Nested Array" errors in Firestore
      const safePickup = data.start ? { lat: Number(data.start.lat), lng: Number(data.start.lng) } : null;
      const safeDropoff = data.end ? { lat: Number(data.end.lat), lng: Number(data.end.lng) } : null;

      const safeRoutePath = data.route?.geometry && Array.isArray(data.route.geometry)
        ? data.route.geometry.map(p => {
            // Check if point is [lat, lng] or {lat, lng}
            if(Array.isArray(p)) return { lat: p[0], lng: p[1] };
            return { lat: p.lat, lng: p.lng };
          })
        : [];

      await addDoc(collection(db, "rides"), {
        riderId: user.uid, 
        riderEmail: user.email, 
        pickupAddress: pickup || "Pinned Location", 
        dropoffAddress: dropoff || "Pinned Location",
        pickupLocation: safePickup, 
        dropoffLocation: safeDropoff,
        routePath: safeRoutePath, // Safe Object Array
        passengers: parseInt(passengers) || 1,
        status: "pending", 
        createdAt: serverTimestamp(),
        priceTotal: data.price
      });

      // Clear State
      setPickup(''); setDropoff(''); setRoutePath(null); setEstimatedPrice(null);
      setPickupCoords(null); setDropoffCoords(null);

    } catch (err) {
      alert("Request Failed: " + err.message);
    }
    setIsRequesting(false);
  };

  const cancelRequest = async () => {
    if(currentRide && window.confirm("Cancel request?")) await deleteDoc(doc(db, "rides", currentRide.id));
  };
  
  const handleFinish = async () => {
    if (currentRide) await updateDoc(doc(db, "rides", currentRide.id), { status: "archived" });
    setShowReview(false); setCurrentRide(null);
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{margin:0, color:'white'}}>👋 {user.email.split('@')[0]}</h2>
        {currentRide && <span className={`status-badge status-${currentRide.status}`}>{currentRide.status}</span>}
      </div>

      <SOSButton userId={user.uid} rideId={currentRide?.id} />
      {showReview && currentRide && <ReportModal rideId={currentRide.id} reportedUserId={currentRide.driverId} onClose={handleFinish} />}

      {!currentRide && !showReview ? (
        <div className="dashboard-grid">
          <div className="card">
            <h3 style={{color:'white'}}>Request a Ride</h3>
            <p style={{fontSize:'0.9rem', color:'#38BDF8'}}>💡 Tip: Click on the map to select locations!</p>
            
            <div style={{display:'flex', gap:'10px'}}>
              <input placeholder="📍 Pickup" value={pickup} onChange={e => {setPickup(e.target.value); setPickupCoords(null);}} />
              <button onClick={useGPS} style={{width:'50px', background:'#475569', marginBottom:'20px'}}>📍</button>
            </div>
            <input placeholder="🏁 Dropoff" value={dropoff} onChange={e => {setDropoff(e.target.value); setDropoffCoords(null);}} />

            {estimatedPrice && (
              <div style={{background:'#0F172A', padding:'15px', borderRadius:'10px', textAlign:'center', marginBottom:'20px', border:'1px solid #10B981'}}>
                <span style={{color:'#10B981', fontWeight:'bold', fontSize:'1.2rem'}}>Est. Fare: {estimatedPrice} SAR</span>
              </div>
            )}

            <div style={{display:'flex', gap:'10px'}}>
               <button onClick={() => calculateRoute()} style={{background: '#3B82F6'}}>Check Price</button>
               <button onClick={requestRide} disabled={isRequesting} style={{background: '#10B981'}}>
                 {isRequesting ? 'Processing...' : 'Request Ride'}
               </button>
            </div>
          </div>

          <div className="card map-container-wrapper" style={{padding:0}}>
             <MapComponent pickup={pickupCoords} dropoff={dropoffCoords} routePath={routePath} onMapClick={handleMapClick} />
          </div>
        </div>
      ) : (
        <div className="dashboard-grid">
          <div className="card">
             {currentRide?.status === 'pending' && (
               <div style={{textAlign:'center'}}>
                 <h3>Finding Driver...</h3>
                 <div className="spinner"></div>
                 <button onClick={cancelRequest} style={{marginTop:'20px', background:'transparent', border:'1px solid #EF4444', color:'#EF4444'}}>Cancel Request</button>
                 <div style={{marginTop:'20px'}}><ChatBox rideId={currentRide.id} currentUser={user} /></div>
               </div>
             )}
             {currentRide?.status === 'accepted' && <div style={{textAlign:'center', padding:'20px', background:'rgba(59,130,246,0.2)', borderRadius:'10px'}}><h3>Driver Accepted!</h3></div>}
             {currentRide?.status === 'in_progress' && <div style={{textAlign:'center', padding:'20px', background:'rgba(239,68,68,0.2)', borderRadius:'10px', border:'2px solid red'}}><h2 style={{color:'red'}}>LIVE METER</h2><h1 style={{color:'red'}}>{liveFare.toFixed(2)} SAR</h1></div>}
             {currentRide?.status === 'completed' && <h2>Total: {currentRide.priceTotal} SAR</h2>}
             {(currentRide.driverId && currentRide.status !== 'pending') && <ChatBox rideId={currentRide.id} currentUser={user} />}
          </div>

          <div className="card map-container-wrapper" style={{padding:0}}>
             <MapComponent 
                pickup={currentRide?.pickupLocation || pickupCoords} 
                dropoff={currentRide?.dropoffLocation || dropoffCoords}
                routePath={currentRide?.routePath || routePath}
             />
          </div>
        </div>
      )}
    </div>
  );
};

export default RiderHome;