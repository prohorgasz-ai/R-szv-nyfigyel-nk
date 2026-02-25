import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Alert, Modal, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, deleteDoc, doc, query, where, onSnapshot, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBySbBaOcVouhmxXLqa4_C7kka4FMIGnKs",
  authDomain: "reszvenyfigyelo.firebaseapp.com",
  projectId: "reszvenyfigyelo",
  storageBucket: "reszvenyfigyelo.firebasestorage.app",
  messagingSenderId: "434228516850",
  appId: "1:434228516850:ios:db21e968a59aa1def67d6b"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

async function fetchStockData(ticker) {
  try {
    const res = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '?interval=5m&range=1d',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const json = await res.json();
    const meta = json.chart.result[0].meta;
    const quotes = json.chart.result[0].indicators.quote[0];
    const volumes = quotes.volume.filter(function(v) { return v != null; });
    const currentVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.reduce(function(a, b) { return a + b; }, 0) / volumes.length;
    const currentPrice = meta.regularMarketPrice;
    const prevClose = meta.previousClose || meta.chartPreviousClose;
    const priceChangePct = ((currentPrice - prevClose) / prevClose) * 100;
    return { ticker: ticker, currentPrice: currentPrice, priceChangePct: priceChangePct, volumeRatio: currentVolume / avgVolume };
  } catch (e) {
    return null;
  }
}

function getBreakEven(item, live) {
  if (!live || live.currentPrice <= item.buyPrice) return null;
  const totalSold = (item.sales || []).reduce(function(s, x) { return s + x.quantity; }, 0);
  const remaining = item.quantity - totalSold;
  if (remaining <= 0) return null;
  const toSell = Math.ceil((item.buyPrice * item.quantity) / live.currentPrice);
  if (toSell >= remaining) return null;
  return { toSell: toSell, free: remaining - toSell };
}

function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleAuth = async function() {
    if (!email || !password) {
      Alert.alert('Hiba', 'Töltsd ki az összes mezőt!');
      return;
    }
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (e) {
      Alert.alert('Hiba', e.message);
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={s.authWrap}>
      <Text style={s.authTitle}>Reszvenyfigyelo</Text>
      <TextInput style={s.input} placeholder="Email" placeholderTextColor="#666" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextInput style={s.input} placeholder="Jelszo" placeholderTextColor="#666" value={password} onChangeText={setPassword} secureTextEntry={true} />
      <TouchableOpacity style={s.btnGreen} onPress={handleAuth} disabled={loading}>
        <Text style={s.btnTxt}>{loading ? 'Betoltes...' : isLogin ? 'Bejelentkezes' : 'Regisztracio'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={function() { setIsLogin(!isLogin); }}>
        <Text style={s.link}>{isLogin ? 'Nincs fiokod? Regisztralj' : 'Van mar fiokod? Lepj be'}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function HoldingCard(props) {
  var item = props.item;
  var liveData = props.liveData;
  var onSell = props.onSell;
  var onDelete = props.onDelete;
  var live = liveData[item.ticker];
  var totalSold = (item.sales || []).reduce(function(s, x) { return s + x.quantity; }, 0);
  var remaining = item.quantity - totalSold;
  var pnl = live ? ((live.currentPrice - item.buyPrice) * remaining) : null;
  var pnlPct = live ? ((live.currentPrice - item.buyPrice) / item.buyPrice * 100) : null;
  var volAlert = live && live.volumeRatio >= 2;
  var priceAlert = live && live.priceChangePct <= -5;
  var profitAlert = pnlPct !== null && pnlPct > 10;
  var breakEven = getBreakEven(item, live);

  return (
    <View style={[s.card, (volAlert || priceAlert) ? s.cardRed : null]}>
      <View style={s.row}>
        <Text style={s.ticker}>{item.ticker}</Text>
        {live ? (
          <Text style={{ color: live.priceChangePct >= 0 ? '#4CAF50' : '#F44336', fontWeight: 'bold' }}>
            {'$' + live.currentPrice.toFixed(2) + ' (' + live.priceChangePct.toFixed(2) + '%)'}
          </Text>
        ) : null}
      </View>
      <Text style={s.detail}>{'Vetel: ' + item.quantity + ' db @ $' + item.buyPrice + ' | ' + item.buyDate}</Text>
      <Text style={s.detail}>{'Meglevő: ' + remaining + ' db'}</Text>
      {pnl !== null ? (
        <Text style={[s.detail, { color: pnl >= 0 ? '#4CAF50' : '#F44336' }]}>
          {'P&L: $' + pnl.toFixed(2) + ' (' + pnlPct.toFixed(2) + '%)'}
        </Text>
      ) : null}
      {live ? <Text style={s.detail}>{'Volume: ' + live.volumeRatio.toFixed(2) + 'x atlag'}</Text> : null}
      {volAlert ? <Text style={s.alertTxt}>ALERT: Nagy eladasi nyomas!</Text> : null}
      {priceAlert ? <Text style={s.alertTxt}>ALERT: Eros arfolyameses!</Text> : null}
      {profitAlert ? <Text style={[s.alertTxt, { color: '#FFC107' }]}>Profit 10% felett - erdemes reszben eladni!</Text> : null}
      {breakEven ? (
        <Text style={[s.detail, { color: '#2196F3' }]}>
          {'Javaslat: Adj el ' + breakEven.toSell + ' db-t, marad ' + breakEven.free + ' db ingyen'}
        </Text>
      ) : null}
      <View style={s.row}>
        <TouchableOpacity style={s.btnBlue} onPress={function() { onSell(item); }}>
          <Text style={s.btnTxt}>Eladas</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={function() { onDelete(item.id); }}>
          <Text style={{ color: '#F44336', marginLeft: 16 }}>Torles</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PortfolioScreen(props) {
  var user = props.user;
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

  useEffect(function() {
    var q = query(collection(db, 'holdings'), where('uid', '==', user.uid));
    return onSnapshot(q, function(snap) {
      setHoldings(snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); }));
    });
  }, []);

  useEffect(function() {
    var poll = async function() {
      var tickers = [...new Set(holdings.map(function(h) { return h.ticker; }))];
      var res = {};
      for (var i = 0; i < tickers.length; i++) {
        var d = await fetchStockData(tickers[i]);
        if (d) res[tickers[i]] = d;
        await new Promise(function(r) { setTimeout(r, 100); });
      }
      setLiveData(res);
    };
    if (holdings.length > 0) {
      poll();
      intervalRef.current = setInterval(poll, 3 * 60 * 1000);
    }
    return function() { clearInterval(intervalRef.current); };
  }, [holdings]);

  var addHolding = async function() {
    if (!ticker || !buyPrice || !qty) {
      Alert.alert('Hiba', 'Töltsd ki az összes mezőt!');
      return;
    }
    await addDoc(collection(db, 'holdings'), {
      uid: user.uid,
      ticker: ticker.toUpperCase(),
      buyPrice: parseFloat(buyPrice),
      quantity: parseFloat(qty),
      buyDate: buyDate || new Date().toISOString().split('T')[0],
      sales: []
    });
    setBuyModal(false); setTicker(''); setBuyPrice(''); setQty(''); setBuyDate('');
  };

  var recordSale = async function() {
    if (!sellPrice || !sellQty) {
      Alert.alert('Hiba', 'Add meg az eladasi adatokat!');
      return;
    }
    var newSales = (selected.sales || []).concat([{
      price: parseFloat(sellPrice),
      quantity: parseFloat(sellQty),
      date: sellDate || new Date().toISOString().split('T')[0]
    }]);
    await updateDoc(doc(db, 'holdings', selected.id), { sales: newSales });
    setSellModal(false); setSellPrice(''); setSellQty(''); setSellDate('');
  };

  var deleteHolding = function(id) {
    Alert.alert('Torles', 'Biztosan torlod?', [
      { text: 'Megse' },
      { text: 'Torles', style: 'destructive', onPress: function() { deleteDoc(doc(db, 'holdings', id)); } }
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0d0d1a' }}>
      <View style={s.header}>
        <Text style={s.headerTxt}>Portfoliom</Text>
        <TouchableOpacity style={s.btnGreenSm} onPress={function() { setBuyModal(true); }}>
          <Text style={s.btnTxt}>+ Vetel</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={holdings}
        keyExtractor={function(i) { return i.id; }}
        renderItem={function(renderProps) {
          return (
            <HoldingCard
              item={renderProps.item}
              liveData={liveData}
              onSell={function(i) { setSelected(i); setSellModal(true); }}
              onDelete={deleteHolding}
            />
          );
        }}
        ListEmptyComponent={<Text style={s.empty}>Meg nincs reszveny. Adj hozza egyet!</Text>}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
      />
      <Modal visible={buyModal} animationType="slide" transparent={true}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Uj vetel</Text>
            <TextInput style={s.input} placeholder="Ticker (pl. AAPL)" placeholderTextColor="#666" value={ticker} onChangeText={setTicker} autoCapitalize="characters" />
            <TextInput style={s.input} placeholder="Vetelár ($)" placeholderTextColor="#666" value={buyPrice} onChangeText={setBuyPrice} keyboardType="decimal-pad" />
            <TextInput style={s.input} placeholder="Mennyiseg (db)" placeholderTextColor="#666" value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
            <TextInput style={s.input} placeholder="Datum (YYYY-MM-DD)" placeholderTextColor="#666" value={buyDate} onChangeText={setBuyDate} />
            <TouchableOpacity style={s.btnGreen} onPress={addHolding}>
              <Text style={s.btnTxt}>Mentes</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={function() { setBuyModal(false); }}>
              <Text style={s.link}>Megse</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={sellModal} animationType="slide" transparent={true}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>{'Eladas - ' + (selected ? selected.ticker : '')}</Text>
            <TextInput style={s.input} placeholder="Eladasi ar ($)" placeholderTextColor="#666" value={sellPrice} onChangeText={setSellPrice} keyboardType="decimal-pad" />
            <TextInput style={s.input} placeholder="Mennyiseg (db)" placeholderTextColor="#666" value={sellQty} onChangeText={setSellQty} keyboardType="decimal-pad" />
            <TextInput style={s.input} placeholder="Datum (YYYY-MM-DD)" placeholderTextColor="#666" value={sellDate} onChangeText={setSellDate} />
            <TouchableOpacity style={s.btnGreen} onPress={recordSale}>
              <Text style={s.btnTxt}>Mentes</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={function() { setSellModal(false); }}>
              <Text style={s.link}>Megse</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function HistoryScreen(props) {
  var user = props.user;
  const [holdings, setHoldings] = useState([]);
  useEffect(function() {
    var q = query(collection(db, 'holdings'), where('uid', '==', user.uid));
    return onSnapshot(q, function(snap) {
      setHoldings(snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); }));
    });
  }, []);
  var allSales = holdings.flatMap(function(h) {
    return (h.sales || []).map(function(s) {
      return { ticker: h.ticker, buyPrice: h.buyPrice, price: s.price, quantity: s.quantity, date: s.date, pnl: ((s.price - h.buyPrice) * s.quantity).toFixed(2) };
    });
  }).sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0d0d1a' }} contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
      <Text style={s.headerTxt}>Eladas tortenet</Text>
      {allSales.length === 0 ? <Text style={s.empty}>Meg nincs rogzitett eladas.</Text> : null}
      {allSales.map(function(sale, i) {
        return (
          <View key={i} style={s.card}>
            <Text style={s.ticker}>{sale.ticker}</Text>
            <Text style={s.detail}>{sale.date + ' - ' + sale.quantity + ' db @ $' + sale.price}</Text>
            <Text style={s.detail}>{'Eredeti vetelár: $' + sale.buyPrice}</Text>
            <Text style={[s.detail, { color: parseFloat(sale.pnl) >= 0 ? '#4CAF50' : '#F44336' }]}>
              {'Realizalt P&L: $' + sale.pnl}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

function SettingsScreen(props) {
  var user = props.user;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0d0d1a' }} contentContainerStyle={{ padding: 16 }}>
      <Text style={s.headerTxt}>Beallitasok</Text>
      <View style={s.card}>
        <Text style={s.detail}>{user.email}</Text>
      </View>
      <View style={s.card}>
        <Text style={s.detail}>Volume spike alert: 2x atlag felett</Text>
        <Text style={s.detail}>Arfolyameses alert: -5% alatt</Text>
        <Text style={s.detail}>Profit alert: +10% felett</Text>
        <Text style={s.detail}>Break-even javaslat: automatikus</Text>
        <Text style={s.detail}>Frissites: 3 percenkent</Text>
      </View>
      <TouchableOpacity style={[s.btnGreen, { backgroundColor: '#F44336', marginTop: 24 }]} onPress={function() { signOut(auth); }}>
        <Text style={s.btnTxt}>Kijelentkezes</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function TabBar(props) {
  var tab = props.tab;
  var setTab = props.setTab;
  var tabs = [
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'history', label: 'Tortenet' },
    { id: 'settings', label: 'Beallitasok' }
  ];
  return (
    <View style={s.tabBar}>
      {tabs.map(function(t) {
        return (
          <TouchableOpacity key={t.id} style={[s.tabBtn, tab === t.id ? s.tabBtnActive : null]} onPress={function() { setTab(t.id); }}>
            <Text style={[s.tabTxt, tab === t.id ? s.tabTxtActive : null]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('portfolio');
  useEffect(function() {
    return onAuthStateChanged(auth, function(u) { setUser(u); setLoading(false); });
  }, []);
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0d0d1a', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 18 }}>Betoltes...</Text>
      </View>
    );
  }
  if (!user) {
    return <AuthScreen />;
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0d0d1a' }}>
      <StatusBar barStyle="light-content" backgroundColor="#0d0d1a" />
      <View style={{ flex: 1 }}>
        {tab === 'portfolio' ? <PortfolioScreen user={user} /> : null}
        {tab === 'history' ? <HistoryScreen user={user} /> : null}
        {tab === 'settings' ? <SettingsScreen user={user} /> : null}
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
  tabTxtActive: { color: '#4CAF50', fontWeight: 'bold' }
});
