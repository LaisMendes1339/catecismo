// firebase.js (SDK modular via CDN)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCcLU_s0knSY6SN5erdzLZzpI3JsdS7AT4",
  authDomain: "catecismo-b412c.firebaseapp.com",
  projectId: "catecismo-b412c",
  storageBucket: "catecismo-b412c.firebasestorage.app",
  messagingSenderId: "537505326579",
  appId: "1:537505326579:web:30e05237bbdd8303f39e86",
  measurementId: "G-WYFBKTHB6D"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };