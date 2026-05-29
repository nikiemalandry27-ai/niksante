/**
 * NikSanté — RegisterScreen
 *
 * Écran d'inscription.
 * Valide le formulaire, crée le compte, puis redirige vers le dashboard.
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
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/api';
import { ThemedText } from '@/components/themed-text';
import { s, fs, vs } from '@/utils/responsive';

export default function RegisterScreen() {
  const router  = useRouter();
  const setUser = useAuthStore((state) => state.setUser);

  const [name,            setName]            = useState('');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading,         setLoading]         = useState(false);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const validateForm = (): boolean => {
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      Alert.alert('Champs manquants', 'Veuillez remplir tous les champs.');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert('Email invalide', 'Veuillez entrer une adresse email valide.');
      return false;
    }
    if (password.length < 6) {
      Alert.alert('Mot de passe trop court', 'Le mot de passe doit contenir au moins 6 caractères.');
      return false;
    }
    if (password !== confirmPassword) {
      Alert.alert('Mots de passe différents', 'Les deux mots de passe ne correspondent pas.');
      return false;
    }
    return true;
  };

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleRegister = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const { token, user } = await authService.register(
        name.trim(),
        email.trim(),
        password
      );

      // Sauvegarde dans le store + SecureStore
      await setUser(user, token);

      // Redirection directe vers le dashboard
      router.replace('/(tabs)/dashboard');
    } catch (error: any) {
      const msg = error?.response?.data?.error ?? error?.message ?? 'Impossible de créer le compte.';
      Alert.alert('Erreur d\'inscription', msg);
      console.error('[Register]', error);
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = () => {
    router.push('/login');
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── En-tête ── */}
          <View style={styles.header}>
            <ThemedText type="title" style={styles.title}>Créer un compte</ThemedText>
            <ThemedText style={styles.subtitle}>NikSanté — Suivi de votre santé</ThemedText>
          </View>

          {/* ── Formulaire ── */}
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Nom complet"
              placeholderTextColor="#999"
              value={name}
              onChangeText={setName}
              editable={!loading}
              autoCapitalize="words"
            />

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
              placeholder="Mot de passe (6 caractères minimum)"
              placeholderTextColor="#999"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!loading}
            />

            <TextInput
              style={styles.input}
              placeholder="Confirmer le mot de passe"
              placeholderTextColor="#999"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!loading}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <ThemedText style={styles.buttonText}>Créer mon compte</ThemedText>
              }
            </TouchableOpacity>
          </View>

          {/* ── Lien connexion ── */}
          <View style={styles.footer}>
            <ThemedText style={styles.footerText}>Déjà un compte ? </ThemedText>
            <TouchableOpacity onPress={goToLogin} disabled={loading}>
              <ThemedText style={styles.link}>Se connecter</ThemedText>
            </TouchableOpacity>
          </View>

        </ScrollView>
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
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    paddingHorizontal: s(24),
    paddingVertical: vs(32),
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: vs(40),
  },
  title: {
    fontSize: fs(30),
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
