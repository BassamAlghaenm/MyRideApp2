// src/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCEIVBJP-dueZiOklnjaJkiYi9VpKeG1zc",
  authDomain: "ride-sharing-40c42.firebaseapp.com",
  databaseURL: "https://ride-sharing-40c42-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ride-sharing-40c42",
  storageBucket: "ride-sharing-40c42.firebasestorage.app",
  messagingSenderId: "1077175415938",
  appId: "1:1077175415938:web:34f7e925df9f9843a0709b"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);