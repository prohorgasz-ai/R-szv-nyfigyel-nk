import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyDsaoQqG1rqUjmnAI4OXj53XSlx8Z2XVA8",
  authDomain: "reszvenyfigyelo.firebaseapp.com",
  projectId: "reszvenyfigyelo",
  storageBucket: "reszvenyfigyelo.firebasestorage.app",
  messagingSenderId: "434228516850",
  appId: "1:434228516850:web:d506e463c27977f4f67d6b"
};

const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});
export const db = getFirestore(app);
