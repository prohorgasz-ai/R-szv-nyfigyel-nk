import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Alert, Modal, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, deleteDoc, doc, query, where, onSnapshot, updateDoc } from 'firebase/firestore';

const firebaseConfig = { apiKey: "AIzaSyBySbBaOcVouhmxXLqa4_C7kka4FMIGnKs", authDomain: "reszvenyfigyelo.firebaseapp.com", projectId: "reszvenyfigyelo", storageBucket: "reszvenyfigyelo.firebasestorage.app", messagingSenderId: "434228516850", appId: "1:434228516850:ios:db21e968a59aa1def67d6b" };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function fetchStockData(ticker) {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=5m&range=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const json = await res.json();
    const meta = json.chart.result[0].meta;
    const quotes = json.chart.result[0].indicators.quote[0];
    const volumes = quotes.volume.filter(v => v != null);
    const currentVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const currentPrice = meta.regularMarketPrice;
    const prevClose = meta.previousClose || meta.chartPreviousClose;
    return { ticker, currentPrice, priceChangePct: ((currentPrice - prevClose) / prevClose) * 100, volumeRatio: currentVolume / avgVolume };
  } catch (e) { return null; }
}

function getBreakEven(item, live) {
  if (!live || live.currentPrice <= item.buyPrice) return null;
  const totalSold = (item.sales || []).reduce((s, x) => s + x.quantity, 0);
  const remaining = item.quantity - totalSold;
  if (remaining <= 0) return null;
  const toSell = Math.ceil((item.buyPrice * item.quantity) / live.currentPrice);
  if (toSell >= remaining) return null;
  return { toSell, free: remaining - toSell };
}

function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const handleAuth = async () => {
    if (!email || !password) { Alert.alert('Hiba', 'Töltsd ki az összes mezőt!'); return; }
    setLoading(true);
    try { if (isLogin) await signInWithEmailAndPassword(auth, email, password); else await createUserWithEmailAndPassword(auth, email, password); }
    catch (e) { Alert.alert('Hiba', e.message); }
    setLoading(false);
  };
  return (
    <SafeAreaView style={s.authWrap}>
      <Text style={s.authTitle}>📈 Részvényfigyelő</Text>
      <TextInput style={s.input} placeholder="Email" placeholderTextColor="#666" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextInput style={s.input} placeholder="Jelszó" placeholderTextColor="#666" value={password} onChangeText={setPassword} secureTextEntry />
      <TouchableOpacity style={s.btnGreen} onPress={handleAuth} disabled={loading}>
        <Text style={s.btnTxt}>{loading ? 'Betöltés...' : isLogin ? 'Bejelentkezés' : 'Regisztráció'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setIsLogin(!isLogin)}>
        <Text style={s.link}>{isLogin ? 'Nincs fiókod? Regisztrálj' : 'Van már fiókod? Lépj be'}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function HoldingCard({ item, liveData, onSell, onDelete }) {
  const live = liveData[item.ticker];
  const totalSold = (item.sales || []).reduce((s, x) => s + x.quantity, 0);
  const remaining = item.quantity - totalSold;
  const pnl = live ? ((live.currentPrice - item.buyPrice) * remaining) : null;
  const pnlPct = live ? ((live.currentPrice - item.buyPrice) / item.buyPrice * 100) : null;
  const volAlert = live && live.volumeRatio >= 2;
  const priceAlert = live && live.priceChangePct <= -5;
  const profitAlert = pnlPct !== null && pnlPct > 10;
  const breakEven = getBreakEven(item, live);
  return (
    <View style={[s.card, (volAlert || priceAlert) && s.cardRed]}>
      <View style={s.row}>
        <Text style={s.ticker}>{item.ticker}</Text>
        {live && <Text style={{ color: live.priceChangePct >= 0 ? '#4CAF50' : '#F44336', fontWeight: 'bold' }}>${live.currentPrice?.toFixed(2)} ({live.priceChangePct?.toFixed(2)}%)</Text>}
      </View>
      <Text style={s.detail}>Vétel: {item.quantity} db @ ${item.buyPrice} | {item.buyDate}</Text>
      <Text style={s.detail}>Meglévő: {remaining} db</Text>
      {pnl !== null && <Text style={[s.detail, { color: pnl >= 0 ? '#4CAF50' : '#F44336' }]}>P&L: ${pnl.toFixed(2)} ({pnlPct?.toFixed(2)}%)</Text>}
      {live && <Text style={s.detail}>Volume: {live.volumeRatio?.toFixed(2)}x átlag</Text>}
      {volAlert && <Text style={s.alertTxt}>🚨 Nagy eladási nyomás!</Text>}
      {priceAlert && <Text style={s.alertTxt}>📉 Erős árfolyamesés!</Text>}
      {profitAlert && <Text style={[s.alertTxt, { color: '#FFC107' }]}>🎯 Profit > 10% – érdemes részben eladni!</Text>}
      {breakEven && <Text style={[s.detail, { color: '#2196F3' }]}>💡 Adj el {breakEven.toSell} db-t → visszanyered a befektetést, marad {breakEven.free} db ingyen</Text>}
      <View style={s.row}>
        <TouchableOpacity style={s.btnBlue} onPress={() => onSell(item)}><Text style={s.btnTxt}>Eladás</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => onDelete(item.id)}><Text style={{ color: '#F44336', marginLeft: 16 }}>Törlés</Text></TouchableOpacity>
      </View>
    </View>
  );
}

function PortfolioScreen({ user }) {
  const [holdings, setHoldings] = useState([]);
  const [liveData, setLiveData] = useState({});
  const [buyModal, setBuyModal] = useState(false);
  const [sellModal, setSellModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [ticker, setTicker] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [qty, setQty] = useState('');
  const [buyDate, setBuyDate] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sellQty, setSellQty] = useState('');
  const [sellDate, setSellDate] = useState('');
  const intervalRef = useRef(null);
  useEffect(() => {
    const q = query(collection(db, 'holdings'), where('uid', '==', user.uid));
    return onSnapshot(q, snap => setHoldings(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);
  useEffect(() => {
    const poll = async () => {
      const tickers = [...new Set(holdings.map(h => h.ticker))];
      const res = {};
      for (const t of tickers) { const d = await fetchStockData(t); if (d) res[t] = d; await new Promise(r => setTimeout(r, 100)); }
      setLiveData(res);
    };
    if (holdings.length > 0) { poll(); intervalRef.current = setInterval(poll, 3 * 60 * 1000); }
    return () => clearInterval(intervalRef.current);
  }, [holdings]);
  const addHolding = async () => {
    if (!ticker || !buyPrice || !qty) { Alert.alert('Hiba', 'Töltsd ki az összes mezőt!'); return; }
    await addDoc(collection(db, 'holdings'), { uid: user.uid, ticker: ticker.toUpperCase(), buyPrice: parseFloat(buyPrice), quantity: parseFloat(qty), buyDate: buyDate || new Date().toISOString().split('T')[0], sales: [] });
    setBuyModal(false); setTicker(''); setBuyPrice(''); setQty(''); setBuyDate('');
  };
  const recordSale = async () => {
    if (!sellPrice || !sellQty) { Alert.alert('Hiba', 'Add meg az eladási adatokat!'); return; }
    await updateDoc(doc(db, 'holdings', selected.id), { sales: [...(selected.sales || []), { price: parseFloat(sellPrice), quantity: parseFloat(sellQty), date: sellDate || new Date().toISOString().split('T')[0] }] });
    setSellModal(false); setSellPrice(''); setSellQty(''); setSellDate('');
  };
  const deleteHolding = (id) => Alert.alert('Törlés', 'Biztosan törlöd?', [{ text: 'Mégse' }, { text: 'Törlés', style: 'destructive', onPress: () => deleteDoc(doc(db, 'holdings', id)) }]);
  return (
    <View style={{ flex: 1, backgroundColor: '#0d0d1a' }}>
      <View style={s.header}>
        <Text style={s.headerTxt}>📊 Portfólióm</Text>
        <TouchableOpacity style={s.btnGreenSm} onPress={() => setBuyModal(true)}><Text style={s.btnTxt}>+ Vétel</Text></TouchableOpacity>
      </View>
      <FlatList data={holdings} keyExtractor={i => i.id}
        renderItem={({ item }) => <HoldingCard item={item} liveData={liveData} onSell={(i) => { setSelected(i); setSellModal(true); }} onDelete={deleteHolding} />}
        ListEmptyComponent={<Text style={s.empty}>Még nincs részvényed.{'\n'}Adj hozzá egyet!</Text>}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }} />
      <Modal visible={buyModal} animationType="slide" transparent>
        <View style={s.modalOverlay}><View style={s.modalBox}>
          <Text style={s.modalTitle}>Új vétel</Text>
          <TextInput style={s.input} placeholder="Ticker (pl. AAPL)" placeholderTextColor="#666" value={ticker} onChangeText={setTicker} autoCapitalize="characters" />
          <TextInput style={s.input} placeholder="Vételár ($)" placeholderTextColor="#666" value={buyPrice} onChangeText={setBuyPrice} keyboardType="decimal-pad" />
          <TextInput style={s.input} placeholder="Mennyiség (db)" placeholderTextColor="#666" value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
          <TextInput style={s.input} placeholder="Dátum (YYYY-MM-DD)" placeholderTextColor="#666" value={buyDate} onChangeText={setBuyDate} />
          <TouchableOpacity style={s.btnGreen} onPress={addHolding}><Text style={s.btnTxt}>Mentés</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setBuyModal(false)}><Text style={s.link}>Mégse</Text></TouchableOpacity>
        </View></View>
      </Modal>
      <Modal visible={sellModal} animationType="slide" transparent>
        <View style={s.modalOverlay}><View style={s.modalBox}>
          <Text style={s.modalTitle}>Eladás – {selected?.ticker}</Text>
          <TextInput style={s.input} placeholder="Eladási ár ($)" placeholderTextColor="#666" value={sellPrice} onChangeText={setSellPrice} keyboardType="decimal-pad" />
          <TextInput style={s.input} placeholder="Mennyiség (db)" placeholderTextColor="#666" value={sellQty} onChangeText={setSellQty} keyboardType="decimal-pad" />
          <TextInput style={s.input} placeholder="Dátum (YYYY-MM-DD)" placeholderTextColor="#666" value={sellDate} onChangeText={setSellDate} />
          <TouchableOpacity style={s.btnGreen} onPress={recordSale}><Text style={s.btnTxt}>Mentés</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setSellModal(false)}><Text style={s.link}>Mégse</Text></TouchableOpacity>
        </View></View>
      </Modal>
    </View>
  );
}

function HistoryScreen({ user }) {
  const [holdings, setHoldings] = useState([]);
  useEffect(() => {
    const q = query(collection(db, 'holdings'), where('uid', '==', user.uid));
    return onSnapshot(q, snap => setHoldings(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);
  const allSales = holdings.flatMap(h => (h.sales || []).map(s => ({ ticker: h.ticker, buyPrice: h.buyPrice, ...s, pnl: ((s.price - h.buyPrice) * s.quantity).toFixed(2) }))).sort((a, b) => new Date(b.date) - new Date(a.date));
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0d0d1a' }} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
      <Text style={s.headerTxt}>📋 Eladás történet</Text>
      {allSales.length === 0 && <Text style={s.empty}>Még nincs rögzített eladás.</Text>}
      {allSales.map((sale, i) => (
        <View key={i} style={s.card}>
          <Text style={s.ticker}>{sale.ticker}</Text>
          <Text style={s.detail}>{sale.date} – {sale.quantity} db @ ${sale.price}</Text>
          <Text style={s.detail}>Eredeti vételár: ${sale.buyPrice}</Text>
          <Text style={[s.detail, { color: parseFloat(sale.pnl) >= 0 ? '#4CAF50' : '#F44336' }]}>Realizált P&L: ${sale.pnl}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function SettingsScreen({ user }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0d0d1a' }} contentContainerStyle={{ padding: 16 }}>
      <Text style={s.headerTxt}>⚙️ Beállítások</Text>
      <View style={s.card}><Text style={s.detail}>👤 {user.email}</Text></View>
      <View style={s.card}>
        <Text style={s.detail}>🚨 Volume spike: 2× átlag felett</Text>
        <Text style={s.detail}>📉 Árfolyamesés: -5% alatt</Text>
        <Text style={s.detail}>🎯 Profit alert: +10% felett</Text>
        <Text style={s.detail}>💡 Break-even javaslat: automatikus</Text>
        <Text style={s.detail}>🔄 Frissítés: 3 percenként</Text>
      </View>
      <TouchableOpacity style={[s.btnGreen, { backgroundColor: '#F44336', marginTop: 24 }]} onPress={() => signOut(auth)}>
        <Text style={s.btnTxt}>Kijelentkezés</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function TabBar({ tab, setTab }) {
  return (
    <View style={s.tabBar}>
      {[{ id: 'portfolio', label: '📊 Portfólió' }, { id: 'history', label: '📋 Történet' }, { id: 'settings', label: '⚙️ Beállítások' }].map(t => (
        <TouchableOpacity key={t.id} style={[s.tabBtn, tab === t.id && s.tabBtnActive]} onPress={() => setTab(t.id)}>
          <Text style={[s.tabTxt, tab === t.id && s.tabTxtActive]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('portfolio');
  useEffect(() => { return onAuthStateChanged(auth, u => { setUser(u); setLoading(false); }); }, []);
  if (loading) return <View style={{ flex: 1, backgroundColor: '#0d0d1a', justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: '#fff', fontSize: 18 }}>Betöltés...</Text></View>;
  if (!user) return <AuthScreen />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0d0d1a' }}>
      <StatusBar barStyle="light-content" backgroundColor="#0d0d1a" />
      <View style={{ flex: 1 }}>
        {tab === 'portfolio' && <PortfolioScreen user={user} />}
        {tab === 'history' && <HistoryScreen user={user} />}
        {tab === 'settings' && <SettingsScreen user={user} />}
      </View>
      <TabBar tab={tab} setTab={setTab} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  authWrap: { flex: 1, backgroundColor: '#0d0d1a', justifyContent: 'center', padding: 24 },
  authTitle: { color: '#fff', fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 32 },
  input: { backgroundColor: '#1a1a2e', color: '#fff', borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 16, borderWidth: 1, borderColor: '#333' },
  btnGreen: { backgroundColor: '#4CAF50', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  btnGreenSm: { backgroundColor: '#4CAF50', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  btnBlue: { backgroundColor: '#1565C0', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  btnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  link: { color: '#4CAF50', textAlign: 'center', marginTop: 16, fontSize: 15 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 20, backgroundColor: '#0d0d1a' },
  headerTxt: { color: '#fff', fontSize: 20, fontWeight: 'bold', padding: 16 },
  card: { backgroundColor: '#1a1a2e', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#222' },
  cardRed: { borderColor: '#F44336', borderWidth: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  ticker: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  detail: { color: '#aaa', fontSize: 13, marginTop: 3 },
  alertTxt: { color: '#F44336', fontWeight: 'bold', marginTop: 6, fontSize: 13 },
  empty: { color: '#555', textAlign: 'center', marginTop: 60, fontSize: 16, lineHeight: 26 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#1a1a2e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  tabBar: { flexDirection: 'row', backgroundColor: '#1a1a2e', borderTopWidth: 1, borderTopColor: '#333' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive: { borderTopWidth: 2, borderTopColor: '#4CAF50' },
  tabTxt: { color: '#666', fontSize: 12 },
  tabTxtActive: { color: '#4CAF50', fontWeight: 'bold' },
});
