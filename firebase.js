// firebase.js (module) — Firestore pronto

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Config do seu projeto (cole exatamente como veio do Firebase)
const firebaseConfig = {
  apiKey: "AIzaSyCXkQPRRGrYa0bHrvK4KICRgMopeNkZMPw",
  authDomain: "catecismo-9565d.firebaseapp.com",
  projectId: "catecismo-9565d",
  storageBucket: "catecismo-9565d.firebasestorage.app",
  messagingSenderId: "706368409154",
  appId: "1:706368409154:web:8f577fb195e839644967db",
  measurementId: "G-1Y3JSRPLKM"
};

const app = initializeApp(firebaseConfig);

// ✅ Exporta o Firestore pro app.js usar
export const db = getFirestore(app);
