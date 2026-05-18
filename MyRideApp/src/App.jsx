import React, { useState, useEffect, useCallback, Suspense, lazy, memo } from "react";
import {
  BrowserRouter as Router, Routes, Route, Navigate, useNavigate,
} from "react-router-dom";
import { auth, db } from "./firebaseConfig";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

// ─── Lazy pages ─────────────────────────────────────────────────────
const Login          = lazy(() => import("./pages/Login"));
const RiderHome      = lazy(() => import("./pages/RiderHome"));
const DriverHome     = lazy(() => import("./pages/DriverHome"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));

const VALID_ROLES    = new Set(["rider","driver","admin"]);
const VALID_STATUSES = new Set(["pending","approved","banned"]);

// ─── SVG icons ──────────────────────────────────────────────────────
const RiderIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="7" r="4"/><path d="M5.5 20a7 7 0 0 1 13 0"/>
  </svg>
);
const DriverIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="10" width="20" height="8" rx="2"/>
    <path d="M5 10V8a7 7 0 0 1 14 0v2"/>
    <circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>
  </svg>
);
const LogoMark = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <rect width="28" height="28" rx="8" fill="#0EA5E9"/>
    <path d="M7 18l5-9 3 5 2-3 4 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ─── Shared spinner ──────────────────────────────────────────────────
const LoadingSpinner = memo(() => (
  <div style={{ display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", height:"100vh", gap:16 }}>
    <div style={{
      width:36, height:36, borderRadius:"50%",
      border:"3px solid rgba(255,255,255,0.1)",
      borderTopColor:"#0EA5E9",
      animation:"spin 0.7s linear infinite",
    }}/>
    <span style={{ color:"#64748b", fontSize:"0.875rem" }}>Loading CampusRide…</span>
    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
  </div>
));

// ─── Status screens ──────────────────────────────────────────────────
const StatusCard = memo(({ icon, title, titleColor, body, note, onLogout, btnLabel="Sign Out", btnStyle }) => (
  <div style={{ display:"flex", justifyContent:"center", alignItems:"center", minHeight:"100vh", padding:24 }}>
    <div style={{ maxWidth:400, width:"100%", background:"#1e293b", borderRadius:16, padding:"40px 36px", textAlign:"center", border:"1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ display:"flex", justifyContent:"center", marginBottom:20 }}>{icon}</div>
      <h2 style={{ color: titleColor || "white", marginBottom:10, fontSize:"1.25rem", fontWeight:700 }}>{title}</h2>
      <p style={{ color:"#cbd5e1", marginBottom:8 }}>{body}</p>
      {note && <p style={{ color:"#64748b", fontSize:"0.85rem", marginBottom:24 }}>{note}</p>}
      <button onClick={onLogout} style={{ ...btnStyle, marginTop:8 }}>{btnLabel}</button>
    </div>
  </div>
));

const BannedScreen = memo(({ onLogout }) => (
  <StatusCard
    icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>}
    title="Account Suspended"
    titleColor="#EF4444"
    body="Your access has been revoked by an administrator."
    onLogout={onLogout}
    btnStyle={{ background:"transparent", border:"1px solid #475569", color:"#94A3B8", borderRadius:8, padding:"10px 24px", cursor:"pointer" }}
  />
));

const PendingScreen = memo(({ onLogout }) => (
  <StatusCard
    icon={<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
    title="Awaiting Approval"
    titleColor="white"
    body="Your account is pending administrator review."
    note="This typically takes less than 24 hours."
    onLogout={onLogout}
    btnStyle={{ background:"transparent", border:"1px solid #475569", color:"#94A3B8", borderRadius:8, padding:"10px 24px", cursor:"pointer" }}
  />
));

// ─── Role selection ──────────────────────────────────────────────────
const RoleSelection = memo(() => {
  const navigate = useNavigate();
  const roles = [
    { id:"rider",  Icon:RiderIcon,  title:"I need a ride",     desc:"Book campus rides instantly" },
    { id:"driver", Icon:DriverIcon, title:"I want to drive",    desc:"Earn by driving on campus"   },
  ];
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"100vh", padding:24 }}>
      <div style={{ marginBottom:40, textAlign:"center" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, marginBottom:12 }}>
          <LogoMark />
          <span style={{ color:"white", fontSize:"1.5rem", fontWeight:700, letterSpacing:"-0.02em" }}>CampusRide</span>
        </div>
        <p style={{ color:"#64748b", fontSize:"0.95rem" }}>How are you using the platform today?</p>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:14, width:"100%", maxWidth:380 }}>
        {roles.map(({ id, Icon, title, desc }) => (
          <button
            key={id}
            type="button"
            onClick={() => navigate(`/login?role=${id}`)}
            style={roleCard}
          >
            <div style={{ color:"#0EA5E9", flexShrink:0 }}><Icon /></div>
            <div style={{ textAlign:"left" }}>
              <div style={{ color:"white", fontWeight:600, fontSize:"1rem", marginBottom:3 }}>{title}</div>
              <div style={{ color:"#64748b", fontSize:"0.85rem" }}>{desc}</div>
            </div>
            <svg style={{ marginLeft:"auto", color:"#475569" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        ))}
      </div>
    </div>
  );
});

// ─── Protected route ─────────────────────────────────────────────────
function ProtectedRoute({ user, userRole, userStatus, requiredRole, children }) {
  if (!user || userRole !== requiredRole || userStatus !== "approved")
    return <Navigate to="/" replace />;
  return children;
}

// ─── App ──────────────────────────────────────────────────────────────
export default function App() {
  const [user,       setUser]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [userRole,   setUserRole]   = useState(null);
  const [userStatus, setUserStatus] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null); setUserRole(null); setUserStatus(null);
        setLoading(false); return;
      }
      try {
        const snap = await getDoc(doc(db, "users", currentUser.uid));
        if (!snap.exists()) { await signOut(auth); setUser(null); return; }
        const { role, status } = snap.data();
        const r = role?.toLowerCase();
        const s = status?.toLowerCase();
        if (!VALID_ROLES.has(r) || !VALID_STATUSES.has(s)) { await signOut(auth); setUser(null); return; }
        setUserRole(r); setUserStatus(s); setUser(currentUser);
      } catch (err) {
        console.error("Auth state error:", err.message);
        await signOut(auth); setUser(null);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const handleLogout = useCallback(async () => {
    await signOut(auth);
    setUser(null); setUserRole(null); setUserStatus(null);
  }, []);

  if (loading)                          return <LoadingSpinner />;
  if (user && userStatus === "banned")  return <BannedScreen  onLogout={handleLogout} />;
  if (user && userStatus === "pending") return <PendingScreen onLogout={handleLogout} />;

  const rootEl = !user
    ? <RoleSelection />
    : userRole === "admin"  ? <Navigate to="/admin"  replace />
    : userRole === "driver" ? <Navigate to="/driver" replace />
    : userRole === "rider"  ? <Navigate to="/rider"  replace />
    : <p style={{ color:"white", textAlign:"center" }}>Unknown role. Contact support.</p>;

  return (
    <Router>
      <div className="app-container">
        <nav style={{
          display:"flex", justifyContent:"space-between", alignItems:"center",
          padding:"0 24px", height:56,
          borderBottom:"1px solid rgba(255,255,255,0.06)",
          background:"rgba(15,23,42,0.95)", backdropFilter:"blur(12px)",
          position:"sticky", top:0, zIndex:100,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <LogoMark />
            <span style={{ color:"white", fontWeight:700, fontSize:"1rem", letterSpacing:"-0.01em" }}>CampusRide</span>
          </div>
          {user && (
            <button onClick={handleLogout} style={{
              background:"transparent", border:"1px solid rgba(255,255,255,0.15)",
              color:"#94A3B8", borderRadius:8, padding:"6px 16px",
              fontSize:"0.85rem", cursor:"pointer",
            }}>
              Sign Out
            </button>
          )}
        </nav>
        <div className="content">
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route path="/"       element={rootEl} />
              <Route path="/login"  element={<Login />} />
              <Route path="/rider"  element={
                <ProtectedRoute user={user} userRole={userRole} userStatus={userStatus} requiredRole="rider">
                  <RiderHome  user={user} />
                </ProtectedRoute>
              }/>
              <Route path="/driver" element={
                <ProtectedRoute user={user} userRole={userRole} userStatus={userStatus} requiredRole="driver">
                  <DriverHome user={user} />
                </ProtectedRoute>
              }/>
              <Route path="/admin"  element={
                <ProtectedRoute user={user} userRole={userRole} userStatus={userStatus} requiredRole="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              }/>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </Router>
  );
}

const roleCard = {
  display:"flex", alignItems:"center", gap:20,
  background:"#1e293b", border:"1px solid rgba(255,255,255,0.08)",
  borderRadius:14, padding:"20px 24px", cursor:"pointer", textAlign:"left",
  transition:"border-color 0.2s, background 0.2s", width:"100%",
};