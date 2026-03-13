// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — App Entry + Navigation
//  App.js
// ═══════════════════════════════════════════════════════════════
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';

import HomeScreen    from './screens/HomeScreen';
import CaptureScreen from './screens/CaptureScreen';
import ResultScreen  from './screens/ResultScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle          : { backgroundColor: '#0F172A' },
          headerTintColor      : '#F8FAFC',
          headerTitleStyle     : { fontWeight: 'bold' },
          cardStyle            : { backgroundColor: '#0F172A' },
          headerBackTitleVisible: false,
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: '🔍 Ghost Verifier', headerShown: false }}
        />
        <Stack.Screen
          name="Capture"
          component={CaptureScreen}
          options={{ title: 'Record Verification', headerShown: false }}
        />
        <Stack.Screen
          name="Result"
          component={ResultScreen}
          options={{ title: 'Verification Result', headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
