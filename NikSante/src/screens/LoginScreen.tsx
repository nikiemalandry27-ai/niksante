/**
 * NikSanté — LoginScreen
 *
 * Écran de connexion.
 * Utilise le authStore (Zustand) pour mettre à jour l'état global
 * et expo-router (useRouter) pour la navigation.
 */

import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/api';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

export default function LoginScreen() {
  const router  = useRouter();
  const setUser = useAuthStore((state) => state.setUser);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /** Valide et exécute la connexion */
  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Champs manquants', 'Veuillez remplir tous les champs.');
      return;
    }

    setLoading(true);
    try {
      const { token, user } = await authService.login(email.trim(), password);

      // Sauvegarde dans le store Zustand + SecureStore
      await setUser(user, token);

      // Redirection vers le dashboard (tabs)
      router.replace('/(tabs)/dashboard');
    } catch (error: any) {
      const msg = error?.response?.data?.error ?? error?.message ?? 'Identifiants incorrects.';
      Alert.alert('Erreur de connexion', msg);
      console.error('[Login]', error);
    } finally {
      setLoading(false);
    }
  };

  /** Redirige vers l'écran d'inscription */
  const goToRegister = () => {
    router.push('/register');
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>

        {/* ── En-tête ── */}
        <View style={styles.header}>
          <ThemedText type="title" style={styles.title}>NikSanté</ThemedText>
          <ThemedText style={styles.subtitle}>Suivi de votre glycémie</ThemedText>
        </View>

        {/* ── Formulaire ── */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            placeholder="Mot de passe"
            placeholderTextColor="#999"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <ThemedText style={styles.buttonText}>Se connecter</ThemedText>
            }
          </TouchableOpacity>
        </View>

        {/* ── Lien inscription ── */}
        <View style={styles.footer}>
          <ThemedText style={styles.footerText}>Pas encore de compte ? </ThemedText>
          <TouchableOpacity onPress={goToRegister} disabled={loading}>
            <ThemedText style={styles.link}>S'inscrire</ThemedText>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: s(24),
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: vs(48),
  },
  title: {
    fontSize: fs(36),
    fontWeight: 'bold',
    color: '#388E3C',
    marginBottom: vs(8),
  },
  subtitle: {
    fontSize: fs(14),
    color: '#666',
  },
  form: {
    marginBottom: vs(24),
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: s(16),
    paddingVertical: vs(14),
    marginBottom: vs(16),
    borderColor: '#ddd',
    borderWidth: 1,
    fontSize: fs(15),
    color: '#333',
  },
  button: {
    backgroundColor: '#388E3C',
    borderRadius: 10,
    paddingVertical: vs(15),
    alignItems: 'center',
    marginTop: vs(8),
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: fs(16),
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    color: '#666',
    fontSize: fs(14),
  },
  link: {
    color: '#388E3C',
    fontWeight: 'bold',
    fontSize: fs(14),
  },
});
