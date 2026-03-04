// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCXkQPRRGrYa0bHrvK4KICRgMopeNkZMPw",
  authDomain: "catecismo-9565d.firebaseapp.com",
  projectId: "catecismo-9565d",
  storageBucket: "catecismo-9565d.firebasestorage.app",
  messagingSenderId: "706368409154",
  appId: "1:706368409154:web:8f577fb195e839644967db",
  measurementId: "G-1Y3JSRPLKM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
