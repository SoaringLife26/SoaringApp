import 'react-native-gesture-handler';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { MemberProvider, useMember } from './context/MemberContext';
import { GlobalSettingsProvider } from './context/GlobalSettingsContext';
import { ActivityIndicator, View } from 'react-native';
import LoginScreen from './Screens/LoginScreen';
import RoleSelectScreen from './Screens/RoleSelectScreen';
import TowRequestScreen from './Screens/TowRequestScreen';
import TowPilotScreen from './Screens/TowPilotScreen';
import LineChiefScreen from './Screens/LineChiefScreen';
import MyTicketScreen from './Screens/MyTicketScreen';
import DemoRideScreen from './Screens/DemoRideScreen';
import EndOfDayScreen from './Screens/EndOfDayScreen';
import ChangePasswordScreen from './Screens/ChangePasswordScreen';


const Stack = createStackNavigator();

function AppNavigator() {
  const { user, member, loading } = useMember();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1A4E8C" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
            <Stack.Screen name="TowRequest" component={TowRequestScreen} />
            <Stack.Screen name="TowPilot" component={TowPilotScreen} />
            <Stack.Screen name="LineChief" component={LineChiefScreen} />
            <Stack.Screen name="MyTicket" component={MyTicketScreen} />
            <Stack.Screen name="DemoRide" component={DemoRideScreen} />
            <Stack.Screen name="EndOfDay" component={EndOfDayScreen} />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <MemberProvider>
        <GlobalSettingsProvider>
          <AppNavigator />
        </GlobalSettingsProvider>
      </MemberProvider>
    </GestureHandlerRootView>
  );
}