import React, { useState, useRef, useMemo, useCallback } from "react";
import { auth, db } from "../firebaseConfig";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate, useSearchParams } from "react-router-dom";

// ─── Constants ─────────────────────────────────────────────────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 60_000;
const VALID_ROLES  = ["rider", "driver"];

const PASSWORD_RULES = [
  { id:"len",   test: (p) => p.length >= 8,                                          label:"At least 8 characters" },
  { id:"upper", test: (p) => /[A-Z]/.test(p),                                        label:"One uppercase letter" },
  { id:"lower", test: (p) => /[a-z]/.test(p),                                        label:"One lowercase letter" },
  { id:"num",   test: (p) => /[0-9]/.test(p),                                        label:"One number" },
  { id:"sym",   test: (p) => /[!@#$%^&*()\-_=+\[\]{};':",.<>/?\\|`~]/.test(p),      label:"One symbol  (!@#$...)" },
];

const FIREBASE_ERRORS = {
  "auth/user-not-found":         "Invalid email or password.",
  "auth/wrong-password":         "Invalid email or password.",
  "auth/invalid-credential":     "Invalid email or password.",
  "auth/invalid-email":          "Please enter a valid email address.",
  "auth/too-many-requests":      "Too many attempts. Please wait and try again.",
  "auth/email-already-in-use":   "An account with this email already exists.",
  "auth/network-request-failed": "Network error. Check your connection.",
};

// ─── Rate-limit store ──────────────────────────────────────────────
const _attempts = {};
function getRateLimit(email) {
  const rec = _attempts[email.toLowerCase()];
  if (!rec) return { blocked: false };
  if (rec.lockedUntil > Date.now())
    return { blocked: true, secsLeft: Math.ceil((rec.lockedUntil - Date.now()) / 1000) };
  return { blocked: false };
}
function recordFailure(email) {
  const key = email.toLowerCase();
  const rec = _attempts[key] ?? { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) { rec.lockedUntil = Date.now() + LOCKOUT_MS; rec.count = 0; }
  _attempts[key] = rec;
}
function clearFailures(email) { delete _attempts[email.toLowerCase()]; }

const sanitize = (s) => s.replace(/[<>"'`;&]/g, "").trim();

// ─── SVG icons (no emoji) ──────────────────────────────────────────
const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);
const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const CircleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="9"/>
  </svg>
);

// ─── Strength Meter ────────────────────────────────────────────────
const STRENGTH_COLORS = ["#EF4444","#F97316","#EAB308","#22C55E","#10B981"];
const STRENGTH_LABELS = ["Very Weak","Weak","Fair","Strong","Very Strong"];

function StrengthMeter({ results }) {
  const passed = results.filter((r) => r.passed).length;
  const color  = passed > 0 ? STRENGTH_COLORS[passed - 1] : "#334155";
  return (
    <div style={{ marginTop: 10, marginBottom: 4 }}>
      {/* Bar */}
      <div style={{ display:"flex", gap:3, marginBottom:6 }}>
        {STRENGTH_COLORS.map((_, i) => (
          <div key={i} style={{
            flex:1, height:3, borderRadius:2,
            background: i < passed ? color : "#1e293b",
            transition: "background 0.3s",
          }}/>
        ))}
      </div>
      {/* Label */}
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
        <span style={{ fontSize:"0.75rem", color:"#64748b" }}>Password strength</span>
        {passed > 0 && <span style={{ fontSize:"0.75rem", color, fontWeight:600 }}>{STRENGTH_LABELS[passed-1]}</span>}
      </div>
      {/* Rules checklist */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 12px" }}>
        {results.map((r) => (
          <div key={r.id} style={{ display:"flex", alignItems:"center", gap:6, fontSize:"0.75rem", color: r.passed ? "#10B981" : "#64748b" }}>
            {r.passed ? <CheckIcon /> : <CircleIcon />}
            {r.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Field wrapper with label ──────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display:"block", fontSize:"0.8rem", fontWeight:600, color:"#94A3B8", marginBottom:6, letterSpacing:"0.04em", textTransform:"uppercase" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Password input with toggle ────────────────────────────────────
// KEY FIX: toggle only changes `type` attribute — input stays in DOM,
// cursor position and value are fully preserved.
function PasswordInput({ value, onChange, placeholder, autoComplete, disabled }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position:"relative" }}>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={128}
        disabled={disabled}
        required
        style={{ paddingRight: 44, width:"100%", boxSizing:"border-box" }}
        aria-label={placeholder}
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()} // prevent input blur on click
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        style={{
          position:"absolute", right:0, top:0, bottom:0,
          width:44, background:"transparent", border:"none",
          color:"#64748b", cursor:"pointer", display:"flex",
          alignItems:"center", justifyContent:"center",
          borderRadius:"0 8px 8px 0",
        }}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

// ─── Error banner ──────────────────────────────────────────────────
function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div role="alert" style={{
      background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.4)",
      borderRadius:8, padding:"11px 14px", marginBottom:20,
      color:"#fca5a5", fontSize:"0.875rem",
      display:"flex", justifyContent:"space-between", alignItems:"center", gap:8,
    }}>
      <span>{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss"
        style={{ background:"transparent", border:"none", color:"#fca5a5", cursor:"pointer", padding:0, lineHeight:1, fontSize:"1.1rem" }}>
        ×
      </button>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────
export default function Login() {
  const [email,         setEmail]         = useState("");
  const [password,      setPassword]      = useState("");
  const [confirmPass,   setConfirmPass]   = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [error,         setError]         = useState("");
  const [loading,       setLoading]       = useState(false);

  const navigate        = useNavigate();
  const [searchParams]  = useSearchParams();
  const lockoutInterval = useRef(null);

  const selectedRole = useMemo(() => {
    const r = searchParams.get("role")?.toLowerCase();
    return VALID_ROLES.includes(r) ? r : null;
  }, [searchParams]);

  const pwResults  = useMemo(() => PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(password) })), [password]);
  const allPassed  = pwResults.every((r) => r.passed);
  const passMatch  = password === confirmPass;

  const toggleMode = useCallback(() => {
    setIsRegistering((v) => !v);
    setError(""); setPassword(""); setConfirmPass("");
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setError("");
    const cleanEmail = sanitize(email);
    const limit = getRateLimit(cleanEmail);
    if (limit.blocked) { setError(`Too many attempts. Try again in ${limit.secsLeft}s.`); return; }
    if (isRegistering) {
      if (!selectedRole)  { setError("No valid role selected. Go back and choose Rider or Driver."); return; }
      if (!allPassed)     { setError("Password does not meet all requirements."); return; }
      if (!passMatch)     { setError("Passwords do not match."); return; }
    }
    setLoading(true);
    try {
      if (isRegistering) {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await setDoc(doc(db, "users", cred.user.uid), {
          email: cred.user.email, role: selectedRole,
          status: "pending", createdAt: serverTimestamp(),
        });
        alert("Account created! Waiting for admin approval.");
      } else {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
        clearFailures(cleanEmail);
        navigate("/");
      }
    } catch (err) {
      recordFailure(cleanEmail);
      const msg = FIREBASE_ERRORS[err.code] ?? "Authentication failed. Please try again.";
      setError(msg);
      const newLimit = getRateLimit(cleanEmail);
      if (newLimit.blocked) {
        setError(`Too many attempts. Try again in ${newLimit.secsLeft}s.`);
        clearInterval(lockoutInterval.current);
        lockoutInterval.current = setInterval(() => {
          const l = getRateLimit(cleanEmail);
          if (!l.blocked) { clearInterval(lockoutInterval.current); setError(""); }
          else setError(`Too many attempts. Try again in ${l.secsLeft}s.`);
        }, 1000);
      }
    } finally {
      setLoading(false);
    }
  };

  const roleLabel = selectedRole ? selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1) : "";
  const submitDisabled = loading || (isRegistering && (!allPassed || !passMatch));

  return (
    <div className="center-view fade-in">
      <div style={card}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <button type="button" onClick={() => navigate("/")} style={backBtn}>
            ← Back
          </button>
          <h2 style={{ color:"white", margin:"16px 0 4px", fontSize:"1.5rem", fontWeight:700 }}>
            {isRegistering ? `Create account` : "Sign in"}
          </h2>
          <p style={{ color:"#64748b", fontSize:"0.875rem", margin:0 }}>
            {isRegistering ? `Registering as ${roleLabel}` : "Welcome back to CampusRide"}
          </p>
        </div>

        {isRegistering && (
          <div style={{
            background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.3)",
            borderRadius:8, padding:"10px 14px", marginBottom:20,
            color:"#fbbf24", fontSize:"0.8rem",
          }}>
            New accounts require admin approval before use.
          </div>
        )}

        <ErrorBanner message={error} onDismiss={() => setError("")} />

        <form onSubmit={handleAuth} noValidate autoComplete={isRegistering ? "off" : "on"}>
          <Field label="Email address">
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" maxLength={254} required
              autoComplete="email" aria-label="Email address"
              style={{ width:"100%", boxSizing:"border-box" }}
            />
          </Field>

          <Field label="Password">
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete={isRegistering ? "new-password" : "current-password"}
              disabled={loading}
            />
          </Field>

          {isRegistering && password.length > 0 && <StrengthMeter results={pwResults} />}

          {isRegistering && (
            <Field label="Confirm password">
              <div style={{ position:"relative" }}>
                <PasswordInput
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  disabled={loading}
                />
                {confirmPass.length > 0 && (
                  <div style={{
                    marginTop:6, fontSize:"0.75rem",
                    color: passMatch ? "#10B981" : "#EF4444",
                  }}>
                    {passMatch ? "Passwords match" : "Passwords do not match"}
                  </div>
                )}
              </div>
            </Field>
          )}

          {!isRegistering && (
            <div style={{ textAlign:"right", marginTop:-8, marginBottom:16 }}>
              <button type="button" onClick={() => alert("Password reset coming soon.")}
                style={{ background:"transparent", border:"none", color:"#38BDF8", fontSize:"0.8rem", cursor:"pointer", padding:0 }}>
                Forgot password?
              </button>
            </div>
          )}

          <button type="submit" disabled={submitDisabled}
            style={{ width:"100%", marginTop:4, padding:"13px", fontSize:"0.95rem", fontWeight:600, opacity: submitDisabled ? 0.55 : 1 }}>
            {loading ? "Please wait…" : isRegistering ? "Create Account" : "Sign In"}
          </button>
        </form>

        <div style={{ marginTop:20, textAlign:"center", fontSize:"0.875rem", color:"#64748b" }}>
          {isRegistering ? "Already have an account?" : "Don't have an account?"}{" "}
          <button type="button" onClick={toggleMode}
            style={{ background:"transparent", border:"none", color:"#38BDF8", cursor:"pointer", fontWeight:600, padding:0, fontSize:"inherit" }}>
            {isRegistering ? "Sign in" : `Register as ${roleLabel}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const card = {
  maxWidth:420, width:"100%", margin:"0 auto",
  background:"#1e293b", borderRadius:16,
  padding:"32px 36px", border:"1px solid rgba(255,255,255,0.08)",
  boxShadow:"0 24px 48px rgba(0,0,0,0.4)",
};
const backBtn = {
  background:"transparent", border:"none", color:"#64748b",
  fontSize:"0.85rem", cursor:"pointer", padding:0, display:"flex", alignItems:"center", gap:4,
};