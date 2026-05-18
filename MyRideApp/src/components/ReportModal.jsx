import React, { useState, useRef, useEffect, useCallback } from "react";
import { db } from "../firebaseConfig";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

const CONFIRM_TIMEOUT_MS = 5000;
const RESET_AFTER_MS     = 5000;

// step: 0=idle  1=awaiting-confirm  2=sent
export default function SOSButton({ userId, rideId }) {
  const [step,    setStep]    = useState(0);
  const [sending, setSending] = useState(false);
  const timerRef = useRef(null);

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleSOS = useCallback(async () => {
    if (sending) return;

    if (step === 0) {
      setStep(1);
      // Auto-cancel confirmation if user doesn't act
      timerRef.current = setTimeout(() => setStep(0), CONFIRM_TIMEOUT_MS);
      return;
    }

    if (step === 1) {
      clearTimeout(timerRef.current);
      if (!userId) {
        alert("Cannot send SOS: missing user ID.");
        setStep(0);
        return;
      }
      setSending(true);
      setStep(2);
      try {
        await addDoc(collection(db, "reports"), {
          type:      "SOS",
          userId,
          rideId:    rideId ?? null,
          reason:    "EMERGENCY BUTTON PRESSED",
          severity:  "CRITICAL",
          createdAt: serverTimestamp(),
          status:    "urgent",
        });
        alert("🆘 SOS signal sent to the safety team!");
      } catch (err) {
        alert("Failed to send SOS: " + err.message);
        setStep(0);
      } finally {
        setSending(false);
        timerRef.current = setTimeout(() => setStep(0), RESET_AFTER_MS);
      }
    }
  }, [step, sending, userId, rideId]);

  const label = step === 0 ? "🆘 SOS" : step === 1 ? "⚠️ Confirm?" : "✅ Sent";
  const bg    = step === 2 ? "#10B981" : "#EF4444";

  return (
    <button
      className={`sos-btn${step === 1 ? " sos-active" : ""}`}
      onClick={handleSOS}
      disabled={sending}
      aria-label="SOS Emergency Button"
      aria-live="polite"
      style={{ background: bg, opacity: sending ? 0.7 : 1 }}
    >
      {label}
    </button>
  );
}