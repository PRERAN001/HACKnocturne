// ═══════════════════════════════════════════════════════════════
//  Ghost Business Verifier — App Entry + Navigation
//  App.js
// ═══════════════════════════════════════════════════════════════
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';

import HomeScreen     from './screens/HomeScreen';
import DocumentScreen from './screens/DocumentScreen';
import CaptureScreen  from './screens/CaptureScreen';
import ResultScreen   from './screens/ResultScreen';
import HistoryScreen  from './screens/HistoryScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle          : { backgroundColor: '#0A0F1E' },
          headerTintColor      : '#F8FAFC',
          headerTitleStyle     : { fontWeight: 'bold' },
          cardStyle            : { backgroundColor: '#0A0F1E' },
          headerBackTitleVisible: false,
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: '🔍 Ghost Verifier', headerShown: false }}
        />
        <Stack.Screen
          name="Document"
          component={DocumentScreen}
          options={{ title: 'Document Verification', headerShown: false }}
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
        <Stack.Screen
          name="History"
          component={HistoryScreen}
          options={{ title: 'Verification History', headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
