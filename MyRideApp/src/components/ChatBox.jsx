import React, { useState, useEffect, useRef, useCallback } from "react";
import { db } from "../firebaseConfig";
import {
  collection, addDoc, query, where,
  orderBy, onSnapshot, serverTimestamp,
} from "firebase/firestore";

const MAX_MSG_LEN = 300;

// Strip dangerous characters from chat input
const sanitize = (s) => s.replace(/[<>"'`;&]/g, "").trim();

export default function ChatBox({ rideId, currentUser }) {
  const [messages,   setMessages]   = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending,    setSending]    = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!rideId) return;
    const q = query(
      collection(db, "messages"),
      where("rideId", "==", rideId),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      // Scroll after paint
      requestAnimationFrame(() =>
        scrollRef.current?.scrollIntoView({ behavior: "smooth" })
      );
    });
    return unsub;
  }, [rideId]);

  const sendMessage = useCallback(async (e) => {
    e.preventDefault();
    const text = sanitize(newMessage).slice(0, MAX_MSG_LEN);
    if (!text || !currentUser?.uid || !rideId || sending) return;

    setSending(true);
    try {
      await addDoc(collection(db, "messages"), {
        rideId,
        text,
        senderId:    currentUser.uid,
        senderEmail: currentUser.email,
        createdAt:   serverTimestamp(),
      });
      setNewMessage("");
    } catch (err) {
      console.error("Chat send error:", err.message);
    } finally {
      setSending(false);
    }
  }, [newMessage, currentUser, rideId, sending]);

  return (
    <div style={styles.container}>
      <div style={styles.messageList}>
        {messages.length === 0 && (
          <p style={{ textAlign:"center", color:"#666", fontSize:"0.8rem", margin:"auto" }}>
            No messages yet.
          </p>
        )}
        {messages.map((msg) => {
          const isMe = msg.senderId === currentUser?.uid;
          return (
            <div key={msg.id} style={{
              alignSelf: isMe ? "flex-end" : "flex-start",
              background: isMe ? "#0EA5E9" : "#334155",
              color: "white", padding: "8px 12px", borderRadius: 12,
              marginBottom: 8, maxWidth: "80%", fontSize: "0.9rem",
              wordBreak: "break-word",
            }}>
              <div style={{ fontSize:"0.7rem", opacity:0.7, marginBottom:2 }}>
                {isMe ? "Me" : msg.senderEmail?.split("@")[0]}
              </div>
              {/* Plain text only — never dangerouslySetInnerHTML */}
              {msg.text}
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>
      <form onSubmit={sendMessage} style={{ display:"flex", gap:8 }}>
        <input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder={`Message (max ${MAX_MSG_LEN} chars)`}
          maxLength={MAX_MSG_LEN}
          style={styles.input}
          disabled={sending}
          aria-label="Chat message"
        />
        <button
          type="submit"
          disabled={sending || !newMessage.trim()}
          style={{ ...styles.sendBtn, opacity: sending ? 0.6 : 1 }}
          aria-label="Send message"
        >
          ➤
        </button>
      </form>
    </div>
  );
}

const styles = {
  container:   { border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:15, background:"rgba(0,0,0,0.2)", marginTop:15 },
  messageList: { height:200, overflowY:"auto", display:"flex", flexDirection:"column", marginBottom:10, paddingRight:5 },
  input:       { flex:1, background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.2)", color:"white", borderRadius:8, padding:10 },
  sendBtn:     { width:46, background:"#10B981", border:"none", borderRadius:8, color:"white", cursor:"pointer", flexShrink:0 },
};