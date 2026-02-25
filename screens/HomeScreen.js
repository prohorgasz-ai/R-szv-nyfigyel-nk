import { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebaseConfig';

const priceCache = {};

async function fetchPrice(ticker) {
  const cached = priceCache[ticker];
  if (cached && Date.now() - cached.ts < 120000) return cached.price;
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`);
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (price) {
      priceCache[ticker] = { price, ts: Date.now() };
      return price;
    }
  } catch (e) {}
  return null;
}

export default function HomeScreen({ navigation }) {
  const [ticker, setTicker] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [stocks, setStocks] = useState([]);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'stocks'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, snapshot => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setStocks(data);
      setLoading(false);
      loadPrices(data);
    });
    return unsubscribe;
  }, []);

  const loadPrices = async (stockList) => {
    const newPrices = {};
    for (const stock of stockList) {
      const price = await fetchPrice(stock.ticker);
      if (price) newPrices[stock.ticker] = price;
      await new Promise(r => setTimeout(r, 100));
    }
    setPrices(prev => ({ ...prev, ...newPrices }));
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Object.keys(priceCache).forEach(k => delete priceCache[k]);
    await loadPrices(stocks);
    setRefreshing(false);
  }, [stocks]);

  const addStock = async () => {
    if (!ticker || !targetPrice) {
      Alert.alert('Hiba', 'Add meg a ticker-t és a célárát!');
      return;
    }
    const user = auth.currentUser;
    await addDoc(collection(db, 'users', user.uid, 'stocks'), {
      ticker: ticker.toUpperCase(),
      targetPrice: parseFloat(targetPrice),
      createdAt: new Date()
    });
    setTicker('');
    setTargetPrice('');
  };

  const deleteStock = async (id) => {
    const user = auth.currentUser;
    await deleteDoc(doc(db, 'users', user.uid, 'stocks', id));
  };

  const logout = async () => {
    await signOut(auth);
    navigation.replace('Login');
  };

  const renderStock = ({ item }) => {
    const currentPrice = prices[item.ticker];
    const reached = currentPrice && currentPrice >= item.targetPrice;
    const diff = currentPrice ? (((currentPrice - item.targetPrice) / item.targetPrice) * 100).toFixed(1) : null;

    return (
      <View style={[styles.stockItem, reached && styles.stockReached]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.stockTicker}>{item.ticker}</Text>
            {reached && <Text style={styles.reachedBadge}>🎯 Célár elérve!</Text>}
          </View>
          <Text style={styles.targetPrice}>Célár: ${item.targetPrice}</Text>
          {currentPrice ? (
            <Text style={[styles.currentPrice, { color: reached ? '#34C759' : '#007AFF' }]}>
              Jelenlegi: ${currentPrice.toFixed(2)}
              {diff && <Text style={{ color: parseFloat(diff) >= 0 ? '#34C759' : '#FF3B30' }}> ({diff}%)</Text>}
            </Text>
          ) : (
            <Text style={styles.loadingPrice}>Árfolyam betöltése...</Text>
          )}
        </View>
        <TouchableOpacity onPress={() => deleteStock(item.id)} style={styles.deleteButton}>
          <Text style={styles.deleteText}>🗑️</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📈 Részvényfigyelő</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logout}>Kilépés</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Ticker (pl. AAPL, TSLA)"
        value={ticker}
        onChangeText={t => setTicker(t.toUpperCase())}
        autoCapitalize="characters"
      />
      <TextInput
        style={styles.input}
        placeholder="Célár (USD)"
        value={targetPrice}
        onChangeText={setTargetPrice}
        keyboardType="decimal-pad"
      />
      <TouchableOpacity style={styles.addButton} onPress={addStock}>
        <Text style={styles.addButtonText}>+ Részvény hozzáadása</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={stocks}
          keyExtractor={item => item.id}
          renderItem={renderStock}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.empty}>Még nincs részvény hozzáadva. ☝️</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 10 },
  title: { fontSize: 22, fontWeight: 'bold' },
  logout: { color: '#FF3B30', fontSize: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, marginBottom: 10, fontSize: 16, backgroundColor: '#fff' },
  addButton: { backgroundColor: '#007AFF', padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 20 },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  stockItem: { padding: 16, backgroundColor: '#fff', borderRadius: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  stockReached: { backgroundColor: '#f0fff4', borderWidth: 1, borderColor: '#34C759' },
  stockTicker: { fontSize: 18, fontWeight: 'bold' },
  reachedBadge: { fontSize: 12, color: '#34C759', fontWeight: '600' },
  targetPrice: { fontSize: 14, color: '#666', marginTop: 2 },
  currentPrice: { fontSize: 14, fontWeight: '600', marginTop: 2 },
  loadingPrice: { fontSize: 14, color: '#999', marginTop: 2 },
  deleteButton: { padding: 8 },
  deleteText: { fontSize: 20 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 16 }
});
