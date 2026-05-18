import React, { useState, useEffect, useMemo, useCallback } from "react";
import { db, auth } from "../firebaseConfig";
import {
  collection, onSnapshot, doc,
  updateDoc, query, orderBy,
} from "firebase/firestore";

// Sanitize any value before rendering to prevent XSS via Firestore data
const safe = (v) => (v == null ? "—" : String(v).replace(/[<>"'`;&]/g, ""));

export default function AdminDashboard() {
  const [users,       setUsers]       = useState([]);
  const [reviews,     setReviews]     = useState([]);
  const [rides,       setRides]       = useState([]);
  const [reports,     setReports]     = useState([]);
  const [actionError, setActionError] = useState("");

  // Single useEffect, all listeners cleaned up together
  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, "users"),   (s) => setUsers(s.docs.map((d) => ({ id:d.id, ...d.data() })))),
      onSnapshot(collection(db, "reviews"), (s) => setReviews(s.docs.map((d) => ({ id:d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "rides"),   orderBy("createdAt","desc")), (s) => setRides(s.docs.map((d) => ({ id:d.id, ...d.data() })))),
      onSnapshot(query(collection(db, "reports"), orderBy("createdAt","desc")), (s) => setReports(s.docs.map((d) => ({ id:d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  // ── Memoised derived lists — only recompute when source data changes ──
  const pendingUsers    = useMemo(() => users.filter((u) => u.status === "pending"),  [users]);
  const approvedDrivers = useMemo(() => users.filter((u) => u.role === "driver" && u.status === "approved"), [users]);
  const activeReports   = useMemo(() => reports.filter((r) => r.status !== "resolved"), [reports]);

  // ── Email lookup map — O(1) instead of O(n) per render ────────────
  const emailMap = useMemo(() =>
    Object.fromEntries(users.map((u) => [u.id, u.email])),
  [users]);
  const getEmail = useCallback((uid) => safe(emailMap[uid]) || "Unknown", [emailMap]);

  // ── Rating map — pre-computed, not recalculated every render ──────
  const ratingMap = useMemo(() => {
    const map = {};
    reviews.forEach((r) => {
      if (!r.targetUserId) return;
      const entry = map[r.targetUserId] ?? { sum: 0, count: 0 };
      entry.sum   += r.rating || 0;
      entry.count += 1;
      map[r.targetUserId] = entry;
    });
    return map;
  }, [reviews]);
  const getRating = useCallback((uid) => {
    const d = ratingMap[uid];
    return d ? `${(d.sum / d.count).toFixed(1)} ⭐ (${d.count})` : "New";
  }, [ratingMap]);

  // ── Guarded Firestore actions ──────────────────────────────────────
  const approveUser = useCallback(async (uid) => {
    if (!uid || !window.confirm("Approve this user?")) return;
    try {
      await updateDoc(doc(db, "users", uid), { status: "approved" });
    } catch (e) { setActionError(e.message); }
  }, []);

  const banUser = useCallback(async (uid) => {
    if (!uid || !window.confirm("Ban this user?")) return;
    if (uid === auth.currentUser?.uid) {
      setActionError("You cannot ban your own account.");
      return;
    }
    try {
      await updateDoc(doc(db, "users", uid), { status: "banned" });
    } catch (e) { setActionError(e.message); }
  }, []);

  const resolveReport = useCallback(async (rid) => {
    if (!rid) return;
    try {
      await updateDoc(doc(db, "reports", rid), { status: "resolved" });
    } catch (e) { setActionError(e.message); }
  }, []);

  return (
    <div className="fade-in" style={{ paddingBottom:50 }}>
      <h2 style={{ color:"white", marginBottom:30 }}>Admin Control Center</h2>

      {actionError && (
        <div role="alert" style={{
          background:"rgba(239,68,68,0.15)", border:"1px solid #EF4444",
          borderRadius:8, padding:"10px 14px", marginBottom:16,
          color:"#FCA5A5", display:"flex", justifyContent:"space-between",
        }}>
          <span>⚠ {actionError}</span>
          <button
            onClick={() => setActionError("")}
            style={{ background:"transparent", border:"none", color:"#FCA5A5", cursor:"pointer" }}
            aria-label="Dismiss error"
          >✕</button>
        </div>
      )}

      <div className="dashboard-grid">

        {/* ── LEFT COLUMN ── */}
        <div>

          {/* Pending approvals */}
          <div className="card" style={{ marginBottom:20 }}>
            <h3 style={{ color:"white" }}>Pending Approvals ({pendingUsers.length})</h3>
            {pendingUsers.length === 0
              ? <p style={{ color:"#94A3B8" }}>No new signups.</p>
              : pendingUsers.map((u) => (
                <div key={u.id} style={styles.listItem}>
                  <span>
                    <strong style={{ color:"white" }}>{safe(u.email)}</strong>
                    <span style={{ color:"#94A3B8", marginLeft:6 }}>{safe(u.role)}</span>
                  </span>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={() => approveUser(u.id)} style={{ ...styles.btn, background:"#10B981" }}>Approve</button>
                    <button onClick={() => banUser(u.id)}    style={{ ...styles.btn, background:"#EF4444" }}>Ban</button>
                  </div>
                </div>
              ))
            }
          </div>

          {/* Active reports / SOS */}
          {activeReports.length > 0 && (
            <div className="card" style={{ borderLeft:"5px solid #EF4444", marginBottom:20 }}>
              <h3 style={{ color:"#EF4444" }}>⚠ Active Reports ({activeReports.length})</h3>
              {activeReports.map((report) => (
                <div key={report.id} style={styles.listItem}>
                  <div style={{ flex:1 }}>
                    {report.type === "SOS" && (
                      <div style={{ color:"#EF4444", fontWeight:"bold", marginBottom:4 }}>
                        🆘 SOS FROM {getEmail(report.userId)}
                      </div>
                    )}
                    <strong style={{ color:"#EF4444" }}>{safe(report.reason)}</strong>
                    <div style={{ fontSize:"0.8rem", color:"#CBD5E1", marginTop:4 }}>
                      {report.createdAt?.seconds
                        ? new Date(report.createdAt.seconds * 1000).toLocaleTimeString()
                        : ""}
                    </div>
                  </div>
                  <button onClick={() => resolveReport(report.id)} style={{ ...styles.btn, background:"#334155", border:"1px solid #475569" }}>
                    Resolve
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Driver ratings */}
          <div className="card">
            <h3 style={{ color:"white" }}>Driver Ratings</h3>
            {approvedDrivers.length === 0
              ? <p style={{ color:"#94A3B8" }}>No approved drivers yet.</p>
              : approvedDrivers.map((d) => (
                <div key={d.id} style={styles.listItem}>
                  <div>
                    <strong style={{ color:"white" }}>{safe(d.email)}</strong>
                    <div style={{ color:"#FBBF24", fontWeight:"bold", marginTop:4 }}>{getRating(d.id)}</div>
                  </div>
                  <button onClick={() => banUser(d.id)} style={{ ...styles.btn, background:"#EF4444" }}>Ban</button>
                </div>
              ))
            }
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div>
          <div className="card">
            <h3 style={{ color:"white" }}>Recent Rides</h3>
            <div style={{ maxHeight:600, overflowY:"auto" }}>
              {rides.length === 0
                ? <p style={{ color:"#94A3B8" }}>No rides yet.</p>
                : rides.map((ride) => (
                  <div key={ride.id} style={styles.historyItem}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                      <span className={`status-badge status-${ride.status === "inprogress" ? "active" : ride.status}`}>
                        {safe(ride.status)}
                      </span>
                      <strong style={{ color:"#10B981" }}>{ride.priceTotal ?? 0} SAR</strong>
                    </div>
                    <div style={{ fontSize:"0.9rem", color:"white", marginBottom:6 }}>
                      {safe(ride.pickupAddress)} → {safe(ride.dropoffAddress)}
                    </div>
                    <div style={{ fontSize:"0.8rem", color:"#94A3B8", borderTop:"1px solid rgba(255,255,255,0.1)", paddingTop:6 }}>
                      Rider: {getEmail(ride.riderId)}<br />
                      Driver: {ride.driverId ? getEmail(ride.driverId) : "Searching…"}
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  listItem:    { padding:15, borderBottom:"1px solid rgba(255,255,255,0.1)", display:"flex", justifyContent:"space-between", alignItems:"center" },
  historyItem: { padding:15, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, marginBottom:10 },
  btn:         { padding:"5px 10px", fontSize:"0.8rem", borderRadius:6, border:"none", cursor:"pointer", color:"white", marginLeft:6 },
};