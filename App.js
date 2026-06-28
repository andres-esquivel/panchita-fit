import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './config/firebase';
import HomeScreen     from './screens/HomeScreen';
import WorkoutScreen  from './screens/WorkoutScreen';
import CoachScreen    from './screens/CoachScreen';
import ProgressScreen from './screens/ProgressScreen';
import SettingsScreen from './screens/SettingsScreen';
import OnboardScreen  from './screens/OnboardScreen';
import LoginScreen    from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import WeeklyReviewModal from './screens/WeeklyReviewModal';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { isOnboarded, shouldShowWeeklyReview } from './storage';
import { IconHome, IconDumbbell, IconPaw, IconChart, IconSettings } from './components/icons';

const Tab = createBottomTabNavigator();

function AppNavigator() {
  const { colors, isDark } = useTheme();
  return (
    <NavigationContainer>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.bgCard,
            borderTopColor:  colors.purpleDim,
            borderTopWidth:  1,
            height:  70,
            paddingBottom: 12,
            paddingTop:    8,
          },
          tabBarActiveTintColor:   colors.purpleLight,
          tabBarInactiveTintColor: colors.gray,
          tabBarHideOnKeyboard: true,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tab.Screen
          name='Inicio'
          component={HomeScreen}
          options={{
            tabBarIcon: ({ focused, color }) => (
              <View style={[tabIconStyle(), focused && tabIconActiveStyle(colors)]}>
                <IconHome size={20} color={color} />
              </View>
            ),
          }}
        />
        <Tab.Screen
          name='Workout'
          component={WorkoutScreen}
          options={{
            tabBarLabel: 'Entrenar',
            tabBarIcon: ({ focused, color }) => (
              <View style={[tabIconStyle(), focused && tabIconActiveStyle(colors)]}>
                <IconDumbbell size={20} color={color} />
              </View>
            ),
          }}
        />
        <Tab.Screen
          name='Coach'
          component={CoachScreen}
          options={{
            tabBarIcon: ({ focused, color }) => (
              <View style={[tabIconStyle(), focused && tabIconActiveStyle(colors)]}>
                <IconPaw size={20} color={color} />
              </View>
            ),
          }}
        />
        <Tab.Screen
          name='Progreso'
          component={ProgressScreen}
          options={{
            tabBarIcon: ({ focused, color }) => (
              <View style={[tabIconStyle(), focused && tabIconActiveStyle(colors)]}>
                <IconChart size={18} color={color} />
              </View>
            ),
          }}
        />
        <Tab.Screen
          name='Ajustes'
          component={SettingsScreen}
          options={{
            tabBarIcon: ({ focused, color }) => (
              <View style={[tabIconStyle(), focused && tabIconActiveStyle(colors)]}>
                <IconSettings size={20} color={color} />
              </View>
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

function tabIconStyle() {
  return { width: 44, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' };
}
function tabIconActiveStyle(colors) {
  return { backgroundColor: colors.purpleDim, borderRadius: 16 };
}

function RootApp() {
  const { colors } = useTheme();

  // Auth state: null = loading, false = no session, object = user
  const [user,            setUser]            = useState(undefined); // undefined = checking
  const [screen,          setScreen]          = useState('login');   // 'login' | 'register'
  const [onboarded,       setOnboarded]       = useState(null);
  const [weeklyReviewInfo,setWeeklyReviewInfo]= useState(null);
  const [showWeeklyReview,setShowWeeklyReview]= useState(false);
  const [showEditor,      setShowEditor]      = useState(false);

  // Listen for auth state changes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u || null);
      if (u) checkOnboarded();
    });
    return unsub;
  }, []);

  async function checkOnboarded() {
    const result = await isOnboarded();
    setOnboarded(result);
    if (result) checkWeeklyReview();
  }

  async function checkWeeklyReview() {
    const info = await shouldShowWeeklyReview();
    if (info) {
      setTimeout(() => {
        setWeeklyReviewInfo(info);
        setShowWeeklyReview(true);
      }, 1200);
    }
  }

  // Loading while checking auth
  if (user === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.purple} size='large' />
      </View>
    );
  }

  // Not logged in
  if (!user) {
    if (screen === 'register') {
      return (
        <SafeAreaProvider>
          <StatusBar style='light' />
          <RegisterScreen onGoLogin={() => setScreen('login')} />
        </SafeAreaProvider>
      );
    }
    return (
      <SafeAreaProvider>
        <StatusBar style='light' />
        <LoginScreen onGoRegister={() => setScreen('register')} />
      </SafeAreaProvider>
    );
  }

  // Logged in but loading onboard state
  if (onboarded === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.purple} size='large' />
      </View>
    );
  }

  // Onboarding
  if (!onboarded) {
    return (
      <SafeAreaProvider>
        <StatusBar style='light' />
        <OnboardScreen onFinish={() => { setOnboarded(true); checkWeeklyReview(); }} />
      </SafeAreaProvider>
    );
  }

  // Main app
  return (
    <SafeAreaProvider>
      <AppNavigator />
      {weeklyReviewInfo && (
        <WeeklyReviewModal
          visible={showWeeklyReview}
          weekKey={weeklyReviewInfo.weekKey}
          weekEnd={weeklyReviewInfo.weekEnd}
          onClose={() => setShowWeeklyReview(false)}
        />
      )}
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <RootApp />
    </ThemeProvider>
  );
}
