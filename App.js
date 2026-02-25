import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebaseConfig';

import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import AddStockScreen from './screens/AddStockScreen';
import StockDetailScreen from './screens/StockDetailScreen';
import SellStockScreen from './screens/SellStockScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    return onAuthStateChanged(auth, u => setUser(u));
  }, []);

  if (user === undefined) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AddStock" component={AddStockScreen} options={{ title: 'Vásárlás rögzítése' }} />
            <Stack.Screen name="StockDetail" component={StockDetailScreen} options={({ route }) => ({ title: route.params.ticker })} />
            <Stack.Screen name="SellStock" component={SellStockScreen} options={{ title: 'Eladás rögzítése' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
