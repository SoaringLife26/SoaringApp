import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyBa4V2gpILeKkVUNnNGkRPCPLviNS_W50E",
  authDomain: "soaringapp-dev.firebaseapp.com",
  projectId: "soaringapp-dev",
  storageBucket: "soaringapp-dev.firebasestorage.app",
  messagingSenderId: "266964281704",
  appId: "1:266964281704:web:59aa1e77758b5950ed0edd"
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

export const db = getFirestore(app);