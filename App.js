
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, Alert, Modal, ScrollView, Platform
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { initializeApp } from 'firebase/app';
import {
  getAuth, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore, collection, addDoc, getDocs,
  deleteDoc, doc, query, where, onSnapshot
} from 'firebase/firestore';
import * as Notifications from 'expo-notifications';

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBySbBaOcVouhmxXLqa4_C7kka4FMIGnKs",
  authDomain: "reszvenyfigyelo.firebaseapp.com",
  projectId: "reszvenyfigyelo",
  storageBucket: "reszvenyfigyelo.firebasestorage.app",
  messagingSenderId: "434228516850",
  appId: "1:434228516850:ios:db21e968a59aa1def67d6b"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// ─── Yahoo Finance API ───────────────────────────────────────────────────────
async function fetchStockData(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=5m&range=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const json = await res.json();
    const meta = json.chart.result[0].meta;
    const quotes = json.chart.result[0].indicators.quote[0];
    const volumes = quotes.volume.filter(v => v != null);
    const closes = quotes.close.filter(c => c != null);
    const currentVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const currentPrice = meta.regularMarketPrice;
    const prevClose = meta.previousClose || meta.chartPreviousClose;
    const priceChangePct = ((currentPrice - prevClose) / prevClose) * 100;
    return {
      ticker,
      currentPrice,
      priceChangePct,
      currentVolume,
      avgVolume,
      volumeRatio: currentVolume / avgVolume,
    };
  } catch (e) {
    console.error('fetchStockData error:', e);
    return null;
  }
}

// ─── Auth Screen ─────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);

  const handleAuth = async () => {
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (e) {
      Alert.alert('Hiba', e.message);
    }
  };

  return (
    <View style={styles.authContainer}>
      <Text style={styles.authTitle}>📈 Részvényfigyelő</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#888"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Jelszó"
        placeholderTextColor="#888"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <TouchableOpacity style={styles.btnPrimary} onPress={handleAuth}>
        <Text style={styles.btnText}>{isLogin ? 'Bejelentkezés' : 'Regisztráció'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setIsLogin(!isLogin)}>
        <Text style={styles.switchText}>
          {isLogin ? 'Nincs fiókod? Regisztrálj' : 'Van már fiókod? Lépj be'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Portfolio Screen ─────────────────────────────────────────────────────────
function PortfolioScreen({ user }) {
  const [holdings, setHoldings] = useState([]);
  const [liveData, setLiveData] = useState({});
  const [modalVisible, setModalVisible] = useState(false);
  const [saleModalVisible, setSaleModalVisible] = useState(false);
  const [selectedHolding, setSelectedHolding] = useState(null);
  const [ticker, setTicker] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [buyDate, setBuyDate] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sellQty, setSellQty] = useState('');
  const [sellDate, setSellDate] = useState('');
  const intervalRef = useRef(null);

  // Load holdings from Firestore
  useEffect(() => {
    const q = query(collection(db, 'holdings'), where('uid', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setHoldings(data);
    });
    return () => unsub();
  }, []);

  // Polling every 3 minutes
  useEffect(() => {
    const poll = async () => {
      const tickers = [...new Set(holdings.map(h => h.ticker))];
      const results = {};
      for (const t of tickers) {
        const data = await fetchStockData(t);
        if (data) {
          results[t] = data;
          // Alert logika
          if (data.volumeRatio >= 2) {
            await sendAlert(`🚨 ${t}: Nagy eladási nyomás!`, `Forgalom ${data.volumeRatio.toFixed(1)}x az átlagnak`);
          }
          if (data.priceChangePct <= -5) {
            await sendAlert(`📉 ${t}: Árfolyamesés!`, `${data.priceChangePct.toFixed(2)}% esés ma`);
          }
        }
      }
      setLiveData(results);
    };
    if (holdings.length > 0) {
      poll();
      intervalRef.current = setInterval(poll, 3 * 60 * 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [holdings]);

  const sendAlert = async (title, body) => {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: null,
    });
  };

  const addHolding = async () => {
    if (!ticker || !buyPrice || !quantity) {
      Alert.alert('Hiba', 'Töltsd ki az összes mezőt!');
      return;
    }
    await addDoc(collection(db, 'holdings'), {
      uid: user.uid,
      ticker: ticker.toUpperCase(),
      buyPrice: parseFloat(buyPrice),
      quantity: parseFloat(quantity),
      buyDate: buyDate || new Date().toISOString().split('T')[0],
      sales: [],
      createdAt: new Date(),
    });
    setModalVisible(false);
    setTicker(''); setBuyPrice(''); setQuantity(''); setBuyDate('');
  };

  const recordSale = async () => {
    if (!sellPrice || !sellQty) {
      Alert.alert('Hiba', 'Add meg az eladási adatokat!');
      return;
    }
    const ref = doc(db, 'holdings', selectedHolding.id);
    const newSale = {
      price: parseFloat(sellPrice),
      quantity: parseFloat(sellQty),
      date: sellDate || new Date().toISOString().split('T')[0],
    };
    const updatedSales = [...(selectedHolding.sales || []), newSale];
    await import('firebase/firestore').then(({ updateDoc }) =>
      updateDoc(ref, { sales: updatedSales })
    );
    setSaleModalVisible(false);
    setSellPrice(''); setSellQty(''); setSellDate('');
  };

  const deleteHolding = async (id) => {
    Alert.alert('Törlés', 'Biztosan törlöd ezt a pozíciót?', [
      { text: 'Mégse' },
      { text: 'Törlés', style: 'destructive', onPress: () => deleteDoc(doc(db, 'holdings', id)) }
    ]);
  };

  const renderHolding = ({ item }) => {
    const live = liveData[item.ticker];
    const totalSold = (item.sales || []).reduce((s, x) => s + x.quantity, 0);
    const remaining = item.quantity - totalSold;
    const pnl = live ? ((live.currentPrice - item.buyPrice) * remaining).toFixed(2) : null;
    const pnlColor = pnl >= 0 ? '#4CAF50' : '#F44336';
    const volumeAlert = live && live.volumeRatio >= 2;
    const priceAlert = live && live.priceChangePct <= -5;

    return (
      <View style={[styles.card, (volumeAlert || priceAlert) && styles.cardAlert]}>
        <View style={styles.cardRow}>
          <Text style={styles.ticker}>{item.ticker}</Text>
          {live && (
            <Text style={[styles.price, { color: live.priceChangePct >= 0 ? '#4CAF50' : '#F44336' }]}>
              ${live.currentPrice?.toFixed(2)} ({live.priceChangePct?.toFixed(2)}%)
            </Text>
          )}
        </View>
        <Text style={styles.cardDetail}>Vétel: {item.quantity} db @ ${item.buyPrice} ({item.buyDate})</Text>
        <Text style={styles.cardDetail}>Meglévő: {remaining} db</Text>
        {pnl && <Text style={[styles.cardDetail, { color: pnlColor }]}>P&L: ${pnl}</Text>}
        {live && <Text style={styles.cardDetail}>Volume arány: {live.volumeRatio?.toFixed(2)}x</Text>}
        {volumeAlert && <Text style={styles.alertText}>🚨 Nagy eladási nyomás!</Text>}
        {priceAlert && <Text style={styles.alertText}>📉 Erős árfolyamesés!</Text>}
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => { setSelectedHolding(item); setSaleModalVisible(true); }}>
            <Text style={styles.btnSecondaryText}>Eladás rögzítése</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => deleteHolding(item.id)}>
            <Text style={styles.deleteText}>Törlés</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📊 Portfólióm</Text>
        <TouchableOpacity style={styles.btnAdd} onPress={() => setModalVisible(true)}>
          <Text style={styles.btnText}>+ Vétel</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={holdings}
        keyExtractor={i => i.id}
        renderItem={renderHolding}
        ListEmptyComponent={<Text style={styles.emptyText}>Még nincs részvényed. Adj hozzá egyet!</Text>}
        contentContainerStyle={{ paddingBottom: 20 }}
      />

      {/* Vétel Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Új vétel rögzítése</Text>
            <TextInput style={styles.input} placeholder="Ticker (pl. AAPL)" placeholderTextColor="#888" value={ticker} onChangeText={setTicker} autoCapitalize="characters" />
            <TextInput style={styles.input} placeholder="Vételár ($)" placeholderTextColor="#888" value={buyPrice} onChangeText={setBuyPrice} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder="Mennyiség (db)" placeholderTextColor="#888" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder="Dátum (YYYY-MM-DD)" placeholderTextColor="#888" value={buyDate} onChangeText={setBuyDate} />
            <TouchableOpacity style={styles.btnPrimary} onPress={addHolding}>
              <Text style={styles.btnText}>Mentés</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.switchText}>Mégse</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Eladás Modal */}
      <Modal visible={saleModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Eladás rögzítése – {selectedHolding?.ticker}</Text>
            <TextInput style={styles.input} placeholder="Eladási ár ($)" placeholderTextColor="#888" value={sellPrice} onChangeText={setSellPrice} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder="Mennyiség (db)" placeholderTextColor="#888" value={sellQty} onChangeText={setSellQty} keyboardType="decimal-pad" />
            <TextInput style={styles.input} placeholder="Dátum (YYYY-MM-DD)" placeholderTextColor="#888" value={sellDate} onChangeText={setSellDate} />
            <TouchableOpacity style={styles.btnPrimary} onPress={recordSale}>
              <Text style={styles.btnText}>Mentés</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSaleModalVisible(false)}>
              <Text style={styles.switchText}>Mégse</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── History Screen ────────────────────────────────────────────────────────────
function HistoryScreen({ user }) {
  const [holdings, setHoldings] = useState([]);

  useEffect(() => {
    const q = query(collection(db, 'holdings'), where('uid', '==', user.uid));
    const unsub = onSnapshot(q, snap => {
      setHoldings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const allSales = holdings.flatMap(h =>
    (h.sales || []).map(s => ({
      ticker: h.ticker,
      buyPrice: h.buyPrice,
      ...s,
      pnl: ((s.price - h.buyPrice) * s.quantity).toFixed(2),
    }))
  ).sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.headerTitle}>📋 Eladás történet</Text>
      {allSales.length === 0 && <Text style={styles.emptyText}>Még nincs rögzített eladás.</Text>}
      {allSales.map((s, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.ticker}>{s.ticker}</Text>
          <Text style={styles.cardDetail}>{s.date} – {s.quantity} db @ ${s.price}</Text>
          <Text style={styles.cardDetail}>Vétel volt: ${s.buyPrice}</Text>
          <Text style={[styles.cardDetail, { color: parseFloat(s.pnl) >= 0 ? '#4CAF50' : '#F44336' }]}>
            Realizált P&L: ${s.pnl}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Settings Screen ───────────────────────────────────────────────────────────
function SettingsScreen({ user }) {
  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>⚙️ Beállítások</Text>
      <View style={styles.card}>
        <Text style={styles.cardDetail}>Bejelentkezve: {user.email}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardDetail}>Alert logika:</Text>
        <Text style={styles.cardDetail}>🚨 Volume spike: 2x átlag felett</Text>
        <Text style={styles.cardDetail}>📉 Árfolyamesés: -5% alatt</Text>
        <Text style={styles.cardDetail}>🔄 Frissítés: 3 percenként</Text>
      </View>
      <TouchableOpacity style={[styles.btnPrimary, { margin: 16, backgroundColor: '#F44336' }]} onPress={() => signOut(auth)}>
        <Text style={styles.btnText}>Kijelentkezés</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Tabs ─────────────────────────────────────────────────────────────────
function MainTabs({ user }) {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: '#1a1a2e' }, tabBarActiveTintColor: '#4CAF50', tabBarInactiveTintColor: '#888' }}>
      <Tab.Screen name="Portfólió" options={{ tabBarLabel: 'Portfólió' }}>
        {() => <PortfolioScreen user={user} />}
      </Tab.Screen>
      <Tab.Screen name="Történet" options={{ tabBarLabel: 'Történet' }}>
        {() => <HistoryScreen user={user} />}
      </Tab.Screen>
      <Tab.Screen name="Beállítások" options={{ tabBarLabel: 'Beállítások' }}>
        {() => <SettingsScreen user={user} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    Notifications.requestPermissionsAsync();
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#fff', fontSize: 18 }}>Betöltés...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <MainTabs user={user} /> : <AuthScreen />}
    </NavigationContainer>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d1a' },
  authContainer: { flex: 1, backgroundColor: '#0d0d1a', justifyContent: 'center', padding: 24 },
  authTitle: { color: '#fff', fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 56 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', padding: 16, paddingTop: 56 },
  input: { backgroundColor: '#1a1a2e', color: '#fff', borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 16, borderWidth: 1, borderColor: '#333' },
  btnPrimary: { backgroundColor: '#4CAF50', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  btnAdd: { backgroundColor: '#4CAF50', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  btnSecondary: { backgroundColor: '#1a1a2e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#4CAF50' },
  btnSecondaryText: { color: '#4CAF50', fontSize: 13 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  switchText: { color: '#4CAF50', textAlign: 'center', marginTop: 16, fontSize: 15 },
  deleteText: { color: '#F44336', fontSize: 13, marginLeft: 12 },
  card: { backgroundColor: '#1a1a2e', borderRadius: 12, padding: 16, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: '#222' },
  cardAlert: { borderColor: '#F44336', borderWidth: 2 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  ticker: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  price: { fontSize: 16, fontWeight: '600' },
  cardDetail: { color: '#aaa', fontSize: 14, marginTop: 2 },
  cardActions: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  alertText: { color: '#F44336', fontWeight: 'bold', marginTop: 6, fontSize: 13 },
  emptyText: { color: '#555', textAlign: 'center', marginTop: 60, fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#1a1a2e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
});
