import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import ChatBox from '../components/ChatBox';
import ReportModal from '../components/ReportModal';
import SOSButton from '../components/SOSButton';
import MapComponent from '../components/MapComponent';

const DriverHome = ({ user }) => {
  const [requests, setRequests] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [showReview, setShowReview] = useState(false);
  const [declinedRides, setDeclinedRides] = useState([]);
  const [riderRatings, setRiderRatings] = useState({});
  const [chatRequestID, setChatRequestID] = useState(null);

  useEffect(() => {
    // 1. Listen for Pending Requests
    const qRequests = query(collection(db, "rides"), where("status", "==", "pending"));
    const unsubRequests = onSnapshot(qRequests, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Listen for Reviews (for Star Ratings)
    const unsubReviews = onSnapshot(collection(db, "reviews"), (snap) => {
      const ratingsMap = {};
      snap.docs.forEach(d => {
        const r = d.data();
        if (r.targetUserId) {
          if (!ratingsMap[r.targetUserId]) ratingsMap[r.targetUserId] = { total: 0, count: 0 };
          ratingsMap[r.targetUserId].total += (r.rating || 0);
          ratingsMap[r.targetUserId].count += 1;
        }
      });
      setRiderRatings(ratingsMap);
    });

    return () => { unsubRequests(); unsubReviews(); };
  }, []);

  useEffect(() => {
    // 3. Listen for Active Ride
    const q = query(collection(db, "rides"), where("driverId", "==", user.uid), where("status", "in", ["accepted", "in_progress"]));
    const unsubscribe = onSnapshot(q, (snap) => {
      if(!snap.empty) {
        const data = snap.docs[0].data();
        setActiveRide({ id: snap.docs[0].id, ...data });
      } else {
        if (!showReview) setActiveRide(null);
      }
    });
    return () => unsubscribe();
  }, [user.uid, showReview]);

  // Actions
  const acceptRide = async (rideId) => {
    try {
      await updateDoc(doc(db, "rides", rideId), { driverId: user.uid, status: "accepted" });
      setChatRequestID(null);
    } catch (err) { alert("Error: " + err.message); }
  };

  const declineRide = (rideId) => setDeclinedRides(prev => [...prev, rideId]);

  const startRide = async () => {
    if (!activeRide) return;
    try {
      await updateDoc(doc(db, "rides", activeRide.id), { status: "in_progress", pickupTime: serverTimestamp() });
    } catch (err) { alert("Start failed: " + err.message); }
  };

  const completeRide = async () => {
    if (!activeRide) return;
    try {
      const rideRef = doc(db, "rides", activeRide.id);
      const snap = await getDoc(rideRef);
      const data = snap.data();
      
      // Safety: Handle missing timer
      let price = 15;
      let diffMins = 15;

      if (data.pickupTime) {
        diffMins = Math.ceil((new Date() - data.pickupTime.toDate()) / 60000);
        price = Math.max(5, diffMins * 1);
      }
      
      if(window.confirm(`End Ride?\n\n⏱️ Duration: ${diffMins} min\n💰 Total: ${price} SAR`)) {
        await updateDoc(rideRef, { status: "completed", dropoffTime: serverTimestamp(), priceTotal: price });
        setShowReview(true);
      }
    } catch (err) { alert("End failed: " + err.message); }
  };

  const getRiderStars = (riderId) => {
    const data = riderRatings[riderId];
    return data ? `⭐ ${(data.total / data.count).toFixed(1)}` : "New";
  };

  const visibleRequests = requests.filter(req => !declinedRides.includes(req.id));
  const isTimeSynced = activeRide?.pickupTime != null;

  return (
    <div className="fade-in">
      <h2 style={{color:'white', marginBottom:'2rem'}}>🚖 Driver Dashboard</h2>
      <SOSButton userId={user.uid} rideId={activeRide?.id} />
      {showReview && activeRide && <ReportModal rideId={activeRide.id} reportedUserId={activeRide.riderId} title="Rate Passenger" onClose={() => { setShowReview(false); setActiveRide(null); }} />}
      
      {chatRequestID && (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center'}}>
          <div className="card" style={{width:'350px', position:'relative', background: '#1e293b'}}>
             <button onClick={() => setChatRequestID(null)} style={{position:'absolute', top:'10px', right:'10px', padding:'5px 10px', background:'#475569'}}>Close ✖</button>
             <h3 style={{color:'white'}}>Ask Rider Question</h3>
             <ChatBox rideId={chatRequestID} currentUser={user} />
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        <div className="card">
          {activeRide && !showReview ? (
            <div>
              {/* ACTIVE RIDE */}
              <div style={{background: activeRide.status === 'in_progress' ? '#7F1D1D' : 'rgba(59, 130, 246, 0.2)', padding:'15px', borderRadius:'10px', textAlign:'center', marginBottom:'20px', border: `1px solid ${activeRide.status === 'in_progress' ? '#EF4444' : '#38BDF8'}`}}>
                 <h3 style={{margin:0, color: 'white'}}>{activeRide.status === 'accepted' ? 'Driving to Pickup' : 'Ride In Progress'}</h3>
                 <p style={{color:'#E2E8F0', marginTop:'5px'}}><strong>Dest:</strong> {activeRide.dropoffAddress}</p>
              </div>
              <ChatBox rideId={activeRide.id} currentUser={user} />
              <div style={{display:'flex', gap:'10px', flexDirection:'column', marginTop:'20px'}}>
                {activeRide.status === 'accepted' && (
                  <button onClick={startRide} style={{background:'#0EA5E9', padding:'15px', fontSize:'1.1rem'}}>
                    ✅ Picked Up Rider
                  </button>
                )}
                {activeRide.status === 'in_progress' && (
                  <button onClick={completeRide} style={{background: isTimeSynced ? '#EF4444' : '#475569'}}>
                    {isTimeSynced ? "🏁 End Ride & Calculate" : "⏳ Syncing Timer..."}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div>
              {/* REQUEST LIST */}
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <h3 style={{color:'white'}}>Requests ({visibleRequests.length})</h3>
                <button onClick={() => window.location.reload()} style={{width:'auto', padding:'5px', fontSize:'0.8rem', background:'#475569'}}>↻ Refresh</button>
              </div>
              {visibleRequests.map(req => (
                <div key={req.id} style={{border:'1px solid rgba(255,255,255,0.1)', padding:'15px', borderRadius:'10px', marginBottom:'15px', background:'rgba(255,255,255,0.05)'}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <span style={{fontWeight:'bold', color:'#38BDF8', fontSize:'1.1rem'}}>📍 {req.pickupAddress}</span>
                    <span style={{color:'#FBBF24', fontWeight:'bold'}}>{getRiderStars(req.riderId)}</span>
                  </div>
                  <div style={{margin:'5px 0 10px 0', color:'white'}}>🏁 {req.dropoffAddress}</div>
                  <div style={{display:'flex', gap:'10px'}}>
                    <button onClick={() => acceptRide(req.id)} style={{background:'#10B981', flex:1}}>Accept</button>
                    <button onClick={() => setChatRequestID(req.id)} style={{background:'#3B82F6', flex:1}}>Chat</button>
                  </div>
                  <button onClick={() => declineRide(req.id)} style={{background:'transparent', border:'1px solid #475569', fontSize:'0.8rem', padding:'8px', marginTop:'10px'}}>Decline</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card map-container-wrapper" style={{padding:0}}>
           <MapComponent 
              pickup={activeRide?.pickupLocation} 
              dropoff={activeRide?.dropoffLocation}
              routePath={activeRide?.routePath}
              requests={!activeRide ? visibleRequests : []}
           />
        </div>
      </div>
    </div>
  );
};

export default DriverHome;