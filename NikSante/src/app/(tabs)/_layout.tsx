/**
 * NikSanté — Tabs Layout
 *
 * 4 onglets : Tableau de bord / Scanner / Ajouter / Profil
 */

import { Tabs } from 'expo-router';
import { Image, Platform, Text, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabsLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  // Sur Android, on garantit au minimum 20dp pour couvrir la barre de navigation
  const bottomPad = Platform.OS === 'android'
    ? Math.max(insets.bottom, 58)
    : (insets.bottom || 6);

  const tabBarStyle = {
    backgroundColor: isDark ? '#1a1a1a' : '#fff',
    borderTopColor:  isDark ? '#333' : '#eee',
    borderTopWidth:  1,
    paddingTop:      6,
    paddingBottom:   bottomPad,
    height:          60 + bottomPad,
  } as const;

  return (
    <Tabs
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={{
        headerShown:             false,
        tabBarActiveTintColor:   '#388E3C',
        tabBarInactiveTintColor: '#aaa',
        tabBarStyle,
        tabBarLabelStyle: {
          fontSize:   11,
          fontWeight: '600',
          marginTop:  2,
        },
      }}
    >
      {/* ── Tableau de bord ── */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Tableau',
          tabBarIcon: ({ color }) => (
            <Image
              source={require('@/assets/images/tabIcons/home.png')}
              style={{ width: 24, height: 24, tintColor: color }}
              resizeMode="contain"
            />
          ),
        }}
      />

      {/* ── Scanner alimentaire ── */}
      <Tabs.Screen
        name="food-scan"
        options={{
          title: 'Analyser votre repas',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 22, color }}>📷</Text>
          ),
        }}
      />

      {/* ── Ajouter une mesure ── */}
      <Tabs.Screen
        name="add-glucose"
        options={{
          title: 'Ajouter',
          tabBarIcon: ({ color }) => (
            <Image
              source={require('@/assets/images/tabIcons/explore.png')}
              style={{ width: 24, height: 24, tintColor: color }}
              resizeMode="contain"
            />
          ),
        }}
      />

      {/* ── Fréquence cardiaque ── */}
      <Tabs.Screen
        name="heart-rate"
        options={{
          title: 'Fréq. cardiaque',
          tabBarIcon: ({ color, focused }) => (
            <Text style={{ fontSize: focused ? 24 : 22 }}>❤️</Text>
          ),
        }}
      />

      {/* ── Profil ── */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 22, color }}>👤</Text>
          ),
        }}
      />
    </Tabs>
  );
}
