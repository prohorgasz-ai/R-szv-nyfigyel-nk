import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
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
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigation.replace('Home');
    } catch (e) {
      Alert.alert('Hiba', e.message);
    }
  };

  const register = async () => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      navigation.replace('Home');
    } catch (e) {
      Alert.alert('Hiba', e.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Részvényfigyelő</Text>
      <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextInput style={styles.input} placeholder="Jelszó" value={password} onChangeText={setPassword} secureTextEntry />
      <TouchableOpacity style={styles.button} onPress={login}>
        <Text style={styles.buttonText}>Bejelentkezés</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.registerButton]} onPress={register}>
        <Text style={styles.buttonText}>Regisztráció</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 40 },
  input: { width: '100%', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  button: { width: '100%', backgroundColor: '#007AFF', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  registerButton: { backgroundColor: '#34C759' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' }
});
