import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { fetchPrice } from '../utils';

export default function SellStockScreen({ route, navigation }) {
  const { stockId, ticker } = route.params;
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [fee, setFee] = useState('0.1');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [availableQty, setAvailableQty] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      const user = auth.currentUser;
      const snap = await getDoc(doc(db, 'users', user.uid, 'stocks', stockId));
      if (snap.exists()) {
        const data = snap.data();
        const bought = (data.purchases || []).reduce((a, p) => a + p.quantity, 0);
        const sold = (data.sells || []).reduce((a, s) => a + s.quantity, 0);
        setAvailableQty(bought - sold);
      }
      const p = await fetchPrice(ticker);
      if (p) setPrice(p.toString());
    };
    load();
  }, []);

  const save = async () => {
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) { Alert.alert('Hiba', 'Érvénytelen mennyiség!'); return; }
    if (qty > availableQty) { Alert.alert('Hiba', `Maximum ${availableQty} db adható el!`); return; }
    if (!price) { Alert.alert('Hiba', 'Add meg az eladási árat!'); return; }
    setLoading(true);
    try {
      const user = auth.currentUser;
      const ref = doc(db, 'users', user.uid, 'stocks', stockId);
      const snap = await getDoc(ref);
      const sells = snap.data().sells || [];
      await updateDoc(ref, {
        sells: [...sells, {
          quantity: qty,
          price: parseFloat(price),
          fee: parseFloat(fee || 0),
          date
        }]
      });
      navigation.goBack();
    } catch (e) {
      Alert.alert('Hiba', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>📤 Eladás – {ticker}</Text>
      <Text style={styles.available}>Eladható mennyiség: <Text style={styles.bold}>{availableQty} db</Text></Text>

      <Text style={styles.label}>Eladott mennyiség (db)</Text>
      <TextInput style={styles.input} placeholder={`max. ${availableQty}`} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />

      <Text style={styles.label}>Eladási ár (USD / részvény)</Text>
      <TextInput style={styles.input} placeholder="pl. 175.00" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />

      <Text style={styles.label}>Tranzakciós díj (USD)</Text>
      <TextInput style={styles.input} placeholder="pl. 0.1" value={fee} onChangeText={setFee} keyboardType="decimal-pad" />

      <Text style={styles.label}>Dátum</Text>
      <TextInput style={styles.input} placeholder="ÉÉÉÉ-HH-NN" value={date} onChangeText={setDate} />

      <TouchableOpacity style={styles.button} onPress={save} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Mentés...' : '💾 Eladás mentése'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 8, marginTop: 10 },
  available: { fontSize: 14, color: '#666', marginBottom: 20 },
  bold: { fontWeight: '700', color: '#333' },
  label: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 14, borderWidth: 1, borderColor: '#eee' },
  button: { backgroundColor: '#FF9500', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8, marginBottom: 40 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' }
});
