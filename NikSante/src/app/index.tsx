/**
 * NikSanté — Point d'entrée (/)
 *
 * Ce fichier gère la redirection initiale en fonction de l'état d'auth :
 *  - isLoading → affiche un spinner (initAuth() tourne dans _layout.tsx)
 *  - isAuthenticated → redirige vers /(tabs)/dashboard
 *  - !isAuthenticated → redirige vers /login
 *
 * Note : initAuth() est appelé dans _layout.tsx (parent),
 * donc ici on lit juste l'état final du store.
 */

import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';

export default function Index() {
  const router  = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading) return; // attend la fin de initAuth

    if (isAuthenticated) {
      router.replace('/(tabs)/dashboard');
    } else {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading]);

  // Affiche un loader pendant la vérification
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }}>
      <ActivityIndicator size="large" color="#388E3C" />
    </View>
  );
}
