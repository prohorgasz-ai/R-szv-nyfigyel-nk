import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert, ScrollView } from 'react-native';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { fetchPrice, fetchExchangeRates, convertPrice, formatCurrency, formatQuantity } from '../utils';

export default function StockDetailScreen({ route, navigation }) {
  const { stockId, ticker } = route.params;
  const [stock, setStock] = useState(null);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [rates, setRates] = useState({ USD: 1, HUF: 390, EUR: 0.92 });
  const [currency, setCurrency] = useState('HUF');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const user = auth.currentUser;
    const ref = doc(db, 'users', user.uid, 'stocks', stockId);
    const snap = await getDoc(ref);
    if (snap.exists()) setStock({ id: snap.id, ...snap.data() });
    const [price, r] = await Promise.all([fetchPrice(ticker), fetchExchangeRates()]);
    setCurrentPrice(price);
    setRates(r);
    setLoading(false);
  };

  const deletePurchase = (index) => {
    Alert.alert('Törlés', 'Biztosan törölni szeretnéd ezt a vásárlást?', [
      { text: 'Mégse' },
      { text: 'Törlés', style: 'destructive', onPress: async () => {
        const user = auth.currentUser;
        const ref = doc(db, 'users', user.uid, 'stocks', stockId);
        const updated = stock.purchases.filter((_, i) => i !== index);
        await updateDoc(ref, { purchases: updated });
        setStock(prev => ({ ...prev, purchases: updated }));
      }}
    ]);
  };

  const deleteStock = () => {
    Alert.alert('Részvény törlése', `Biztosan törlöd a(z) ${ticker} összes adatát?`, [
      { text: 'Mégse' },
      { text: 'Törlés', style: 'destructive', onPress: async () => {
        const user = auth.currentUser;
        await deleteDoc(doc(db, 'users', user.uid, 'stocks', stockId));
        navigation.goBack();
      }}
    ]);
  };

  const toggleCurrency = () => setCurrency(c => c === 'HUF' ? 'USD' : c === 'USD' ? 'EUR' : 'HUF');

  if (loading || !stock) return <View style={styles.center}><Text>Betöltés...</Text></View>;

  const purchases = stock.purchases || [];
  const sells = stock.sells || [];
  const totalQty = purchases.reduce((a, p) => a + p.quantity, 0) - sells.reduce((a, s) => a + s.quantity, 0);
  const totalCost = purchases.reduce((a, p) => a + (p.quantity * p.price + (p.fee || 0)), 0);
  const sellRevenue = sells.reduce((a, s) => a + (s.quantity * s.price - (s.fee || 0)), 0);
  const netInvested = totalCost - sellRevenue;
  const currentValue = currentPrice ? totalQty * currentPrice : 0;
  const profit = currentValue - netInvested;
  const profitPct = netInvested > 0 ? ((profit / netInvested) * 100).toFixed(2) : 0;
  const avgPrice = totalQty > 0 ? (netInvested / totalQty) : 0;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{ticker}</Text>
        <TouchableOpacity onPress={toggleCurrency} style={styles.currencyBtn}>
          <Text style={styles.currencyText}>{currency}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Row label="Mennyiség" value={`${formatQuantity(totalQty)} db`} />
        <Row label="Átlag vételár" value={formatCurrency(convertPrice(avgPrice, currency, rates), currency)} />
        <Row label="Jelenlegi ár" value={currentPrice ? formatCurrency(convertPrice(currentPrice, currency, rates), currency) : '...'} />
        <Row label="Befektetve" value={formatCurrency(convertPrice(netInvested, currency, rates), currency)} />
        <Row label="Jelenlegi érték" value={formatCurrency(convertPrice(currentValue, currency, rates), currency)} />
        <View style={styles.divider} />
        <Text style={[styles.profit, { color: profit >= 0 ? '#34C759' : '#FF3B30' }]}>
          {profit >= 0 ? '+' : ''}{formatCurrency(convertPrice(profit, currency, rates), currency)} ({profitPct}%)
        </Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Vásárlások</Text>
        <TouchableOpacity onPress={() => navigation.navigate('AddStock')} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Új vásárlás</Text>
        </TouchableOpacity>
      </View>

      {purchases.map((p, i) => (
        <View key={i} style={styles.transItem}>
          <View style={{ flex: 1 }}>
            <Text style={styles.transMain}>{formatQuantity(p.quantity)} db @ {formatCurrency(convertPrice(p.price, currency, rates), currency)}</Text>
            <Text style={styles.transSub}>{p.date} · Díj: {formatCurrency(convertPrice(p.fee || 0, currency, rates), currency)}</Text>
          </View>
          <TouchableOpacity onPress={() => deletePurchase(i)}>
            <Text style={styles.deleteBtn}>🗑</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={styles.sellButton} onPress={() => navigation.navigate('SellStock', { stockId, ticker })}>
        <Text style={styles.sellButtonText}>📤 Eladás rögzítése</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.deleteStockButton} onPress={deleteStock}>
        <Text style={styles.deleteStockText}>🗑 Részvény törlése</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const Row = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 10 },
  title: { fontSize: 28, fontWeight: 'bold' },
  currencyBtn: { backgroundColor: '#007AFF', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  currencyText: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { fontSize: 14, color: '#666' },
  rowValue: { fontSize: 14, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 10 },
  profit: { fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  addBtn: { backgroundColor: '#007AFF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  transItem: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  transMain: { fontSize: 15, fontWeight: '600' },
  transSub: { fontSize: 12, color: '#999', marginTop: 2 },
  deleteBtn: { fontSize: 20, marginLeft: 10 },
  sellButton: { backgroundColor: '#FF9500', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  sellButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  deleteStockButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#FF3B30', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 10, marginBottom: 40 },
  deleteStockText: { color: '#FF3B30', fontSize: 15, fontWeight: '600' }
});
