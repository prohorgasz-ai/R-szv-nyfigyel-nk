import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebaseConfig';

export default function HomeScreen({ navigation }) {
  const [ticker, setTicker] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, 'users', user.uid, 'stocks'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, snapshot => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStocks(data);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

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
          renderItem={({ item }) => (
            <View style={styles.stockItem}>
              <View>
                <Text style={styles.stockTicker}>{item.ticker}</Text>
                <Text style={styles.stockPrice}>Célár: ${item.targetPrice}</Text>
              </View>
              <TouchableOpacity onPress={() => deleteStock(item.id)} style={styles.deleteButton}>
                <Text style={styles.deleteText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>Még nincs részvény hozzáadva. ☝️</Text>
          }
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
  stockItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderRadius: 10, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  stockTicker: { fontSize: 18, fontWeight: 'bold' },
  stockPrice: { fontSize: 14, color: '#666', marginTop: 2 },
  deleteButton: { padding: 8 },
  deleteText: { fontSize: 20 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 16 }
});
