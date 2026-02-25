import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebaseConfig';
import { fetchPrice, fetchExchangeRates, convertPrice, formatCurrency, formatQuantity } from '../utils';

export default function HomeScreen({ navigation }) {
  const [stocks, setStocks] = useState([]);
  const [prices, setPrices] = useState({});
  const [rates, setRates] = useState({ USD: 1, HUF: 390, EUR: 0.92 });
  const [currency, setCurrency] = useState('HUF');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchExchangeRates().then(setRates);
    const user = auth.currentUser;
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'stocks'), orderBy('ticker'));
    return onSnapshot(q, snapshot => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setStocks(data);
      setLoading(false);
      loadPrices(data);
    });
  }, []);

  const loadPrices = async (stockList) => {
    const newPrices = {};
    const tickers = [...new Set(stockList.map(s => s.ticker))];
    for (const ticker of tickers) {
      const price = await fetchPrice(ticker);
      if (price) newPrices[ticker] = price;
      await new Promise(r => setTimeout(r, 100));
    }
    setPrices(prev => ({ ...prev, ...newPrices }));
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const r = await fetchExchangeRates();
    setRates(r);
    await loadPrices(stocks);
    setRefreshing(false);
  }, [stocks]);

  const toggleCurrency = () => setCurrency(c => c === 'HUF' ? 'USD' : c === 'USD' ? 'EUR' : 'HUF');

  const calcStock = (item) => {
    const purchases = item.purchases || [];
    const sells = item.sells || [];
    const totalQty = purchases.reduce((a, p) => a + p.quantity, 0) - sells.reduce((a, s) => a + s.quantity, 0);
    const totalCost = purchases.reduce((a, p) => a + (p.quantity * p.price + (p.fee || 0)), 0);
    const sellRevenue = sells.reduce((a, s) => a + (s.quantity * s.price - (s.fee || 0)), 0);
    const netInvested = totalCost - sellRevenue;
    const currentPrice = prices[item.ticker];
    const currentValue = currentPrice ? totalQty * currentPrice : 0;
    const profit = currentValue - netInvested;
    const profitPct = netInvested > 0 ? ((profit / netInvested) * 100).toFixed(1) : 0;
    return { totalQty, netInvested, currentValue, profit, profitPct, currentPrice };
  };

  const totals = stocks.reduce((acc, s) => {
    const { netInvested, currentValue } = calcStock(s);
    return { invested: acc.invested + netInvested, value: acc.value + currentValue };
  }, { invested: 0, value: 0 });

  const totalProfit = totals.value - totals.invested;
  const totalProfitPct = totals.invested > 0 ? ((totalProfit / totals.invested) * 100).toFixed(1) : 0;

  const renderStock = ({ item }) => {
    const { totalQty, netInvested, profit, profitPct, currentPrice } = calcStock(item);
    return (
      <TouchableOpacity style={styles.stockItem} onPress={() => navigation.navigate('StockDetail', { stockId: item.id, ticker: item.ticker })}>
        <View style={{ flex: 1 }}>
          <View style={styles.stockRow}>
            <Text style={styles.stockTicker}>{item.ticker}</Text>
            <Text style={[styles.profitBadge, { backgroundColor: profit >= 0 ? '#e6f9ee' : '#fff0f0', color: profit >= 0 ? '#34C759' : '#FF3B30' }]}>
              {profit >= 0 ? '+' : ''}{formatCurrency(convertPrice(profit, currency, rates), currency)} ({profitPct}%)
            </Text>
          </View>
          <Text style={styles.stockDetail}>{formatQuantity(totalQty)} db @ {currentPrice ? formatCurrency(convertPrice(currentPrice, currency, rates), currency) : '...'}</Text>
          <Text style={styles.stockDetail}>Befektetve: {formatCurrency(convertPrice(netInvested, currency, rates), currency)}</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📈 Portfólió</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={toggleCurrency} style={styles.currencyBtn}>
            <Text style={styles.currencyText}>{currency}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => signOut(auth)}>
            <Text style={styles.logout}>Kilépés</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Befektetve</Text>
            <Text style={styles.summaryValue}>{formatCurrency(convertPrice(totals.invested, currency, rates), currency)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Jelenlegi érték</Text>
            <Text style={styles.summaryValue}>{formatCurrency(convertPrice(totals.value, currency, rates), currency)}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <Text style={[styles.totalProfit, { color: totalProfit >= 0 ? '#34C759' : '#FF3B30' }]}>
          {totalProfit >= 0 ? '+' : ''}{formatCurrency(convertPrice(totalProfit, currency, rates), currency)} ({totalProfitPct}%)
        </Text>
      </View>

      <TouchableOpacity style={styles.addButton} onPress={() => navigation.navigate('AddStock')}>
        <Text style={styles.addButtonText}>+ Új vásárlás</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={stocks}
          keyExtractor={item => item.id}
          renderItem={renderStock}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.empty}>Még nincs részvény. Adj hozzá egyet! ☝️</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 10 },
  title: { fontSize: 24, fontWeight: 'bold' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  currencyBtn: { backgroundColor: '#007AFF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  currencyText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  logout: { color: '#FF3B30', fontSize: 15 },
  summaryCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryItem: { flex: 1 },
  summaryLabel: { fontSize: 12, color: '#999', marginBottom: 4 },
  summaryValue: { fontSize: 16, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 10 },
  totalProfit: { fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  addButton: { backgroundColor: '#007AFF', padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 16 },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  stockItem: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  stockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  stockTicker: { fontSize: 18, fontWeight: 'bold' },
  profitBadge: { fontSize: 13, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  stockDetail: { fontSize: 13, color: '#666', marginTop: 2 },
  arrow: { fontSize: 22, color: '#ccc', marginLeft: 8 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 16 }
});
