/**
 * Firebase Configuration for MotorMods
 * 
 * This file initializes Firebase and exports the Firestore instance
 * for syncing product data to the cloud.
 * 
 * Configuration is loaded from environment variables (.env file).
 * Copy .env.example to .env and fill in your Firebase credentials.
 */

import { FirebaseApp, initializeApp } from "firebase/app";
import { Firestore, getFirestore } from "firebase/firestore";

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Check if Firebase is configured
const isFirebaseConfigured = (): boolean => {
  return (
    !!firebaseConfig.apiKey &&
    firebaseConfig.apiKey !== "your_api_key_here" &&
    !!firebaseConfig.projectId &&
    firebaseConfig.projectId !== "your_project_id"
  );
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

/**
 * Initialize Firebase - only if properly configured
 */
export const initializeFirebase = (): boolean => {
  if (!isFirebaseConfigured()) {
    console.warn(
      "Firebase not configured. Please update .env file with your Firebase credentials."
    );
    return false;
  }

  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log("Firebase initialized successfully");
    return true;
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
    return false;
  }
};

/**
 * Get the Firestore instance
 * Returns null if Firebase is not configured or initialized
 */
export const getFirestoreDb = (): Firestore | null => {
  if (!db && isFirebaseConfigured()) {
    initializeFirebase();
  }
  return db;
};

/**
 * Check if Firestore sync is available
 */
export const isFirestoreSyncEnabled = (): boolean => {
  return isFirebaseConfigured() && db !== null;
};

export { isFirebaseConfigured };
