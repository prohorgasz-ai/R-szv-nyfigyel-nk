import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { collection, addDoc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

export default function AddStockScreen({ navigation }) {
  const [ticker, setTicker] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [fee, setFee] = useState('0.1');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!ticker || !quantity || !price) {
      Alert.alert('Hiba', 'Ticker, mennyiség és ár kötelező!');
      return;
    }
    setLoading(true);
    const user = auth.currentUser;
    try {
      const q = query(collection(db, 'users', user.uid, 'stocks'), where('ticker', '==', ticker.toUpperCase()));
      const existing = await getDocs(q);
      const purchase = {
        quantity: parseFloat(quantity),
        price: parseFloat(price),
        fee: parseFloat(fee || 0),
        date
      };
      if (!existing.empty) {
        const stockDoc = existing.docs[0];
        const purchases = stockDoc.data().purchases || [];
        await updateDoc(stockDoc.ref, { purchases: [...purchases, purchase] });
      } else {
        await addDoc(collection(db, 'users', user.uid, 'stocks'), {
          ticker: ticker.toUpperCase(),
          purchases: [purchase],
          sells: [],
          createdAt: new Date()
        });
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Hiba', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>📥 Vásárlás rögzítése</Text>

      <Text style={styles.label}>Ticker</Text>
      <TextInput style={styles.input} placeholder="pl. AAPL, TSLA, MSFT" value={ticker} onChangeText={t => setTicker(t.toUpperCase())} autoCapitalize="characters" />

      <Text style={styles.label}>Mennyiség (db)</Text>
      <TextInput style={styles.input} placeholder="pl. 10 vagy 0.5" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />

      <Text style={styles.label}>Vételár (USD / részvény)</Text>
      <TextInput style={styles.input} placeholder="pl. 150.50" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />

      <Text style={styles.label}>Tranzakciós díj (USD)</Text>
      <TextInput style={styles.input} placeholder="pl. 0.1" value={fee} onChangeText={setFee} keyboardType="decimal-pad" />

      <Text style={styles.label}>Dátum</Text>
      <TextInput style={styles.input} placeholder="ÉÉÉÉ-HH-NN" value={date} onChangeText={setDate} />

      <TouchableOpacity style={styles.button} onPress={save} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Mentés...' : '💾 Vásárlás mentése'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, marginTop: 10 },
  label: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 14, borderWidth: 1, borderColor: '#eee' },
  button: { backgroundColor: '#34C759', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8, marginBottom: 40 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' }
});
