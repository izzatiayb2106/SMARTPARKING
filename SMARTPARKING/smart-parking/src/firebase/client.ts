import { initializeApp, getApps } from 'firebase/app';
import {
  getDatabase,
  ref,
  set,
  update,
  remove,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  off,
} from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCQJrry9x9ymuq_3VgxstfKoCreH_KoJ4M",
  authDomain: "smartparking-26d0f.firebaseapp.com",
  projectId: "smartparking-26d0f",
  storageBucket: "smartparking-26d0f.firebasestorage.app",
  messagingSenderId: "541336880562",
  appId: "1:541336880562:web:f454fdcfb4a6dd2a44d0ab",
  measurementId: "G-E2DBHVF81B"
};

if (!getApps().length) {
  initializeApp(firebaseConfig);
}

const db = getDatabase();

export { db, ref, set, update, remove, onChildAdded, onChildChanged, onChildRemoved, off };

// Note: Set Vite env vars starting with VITE_FIREBASE_* in .env to configure Firebase.
