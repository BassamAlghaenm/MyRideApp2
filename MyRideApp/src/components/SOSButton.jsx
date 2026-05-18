import React, { useState, useRef } from "react";
import { db } from "../firebaseConfig";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

const SOSButton = ({ userId, rideId }) => {
  const [step, setStep]       = useState(0); // 0=normal 1=confirm 2=sent
  const [sending, setSending] = useState(false);
  const timerRef              = useRef(null);

  const handleSOS = async () => {
    if (step === 0) {
      setStep(1);
      // Auto-cancel confirmation after 5 seconds
      timerRef.current = setTimeout(() => setStep(0), 5000);
      return;
    }
    if (step === 1) {
      clearTimeout(timerRef.current);
      setSending(true);
      setStep(2);
      try {
        // Validate userId is present before writing to Firestore
        if (!userId) throw new Error("Missing user ID");
        await addDoc(collection(db, "reports"), {
          type:      "SOS",
          userId:    userId,
          rideId:    rideId || null,
          reason:    "EMERGENCY BUTTON PRESSED",
          severity:  "CRITICAL",
          createdAt: serverTimestamp(),
          status:    "urgent",
        });
        alert("🆘 SOS signal sent to admin safety team!");
      } catch (error) {
        alert("Error sending SOS: " + error.message);
        setStep(0);
      } finally {
        setSending(false);
        setTimeout(() => setStep(0), 5000);
      }
    }
  };

  return (
    <button
      className={`sos-btn${step === 1 ? " sos-active" : ""}`}
      onClick={handleSOS}
      disabled={sending}
      aria-label="SOS Emergency Button"
      style={{
        background: step === 2 ? "#10B981" : "#EF4444",
        opacity: sending ? 0.7 : 1
      }}
    >
      {step === 0 && "🆘 SOS"}
      {step === 1 && "⚠️ CONFIRM?"}
      {step === 2 && "✅ SENT"}
    </button>
  );
};

export default SOSButton;