/**
 * NikSanté — Auth Store (Zustand)
 *
 * Gère :
 *  - L'état d'authentification (user, token, isAuthenticated)
 *  - La persistance via expo-secure-store (token + données user)
 *  - initAuth()  : restaure la session au démarrage de l'app
 *  - setUser()   : sauvegarde user + token après login/register
 *  - logout()    : efface le store ET SecureStore
 */

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  /** true pendant le chargement initial (vérification SecureStore) */
  isLoading: boolean;

  /** Restaure la session depuis SecureStore au démarrage */
  initAuth: () => Promise<void>;
  /** Appelé après un login ou register réussi */
  setUser: (user: AuthUser, token: string) => Promise<void>;
  /** Déconnexion : efface store + SecureStore */
  logout: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Clés SecureStore
// ---------------------------------------------------------------------------

const KEY_TOKEN = 'auth_token';
const KEY_USER  = 'auth_user';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState>((set) => ({
  user:            null,
  token:           null,
  isAuthenticated: false,
  isLoading:       true, // on démarre en "loading" jusqu'à initAuth()

  /**
   * initAuth
   * À appeler une seule fois au démarrage (dans _layout.tsx).
   * Récupère token + user depuis SecureStore et hydrate le store.
   */
  initAuth: async () => {
    try {
      const [token, userStr] = await Promise.all([
        SecureStore.getItemAsync(KEY_TOKEN),
        SecureStore.getItemAsync(KEY_USER),
      ]);

      if (token && userStr) {
        const user: AuthUser = JSON.parse(userStr);
        set({ user, token, isAuthenticated: true });
      }
    } catch (e) {
      // En cas d'erreur de lecture, on repart de zéro (pas de crash)
      console.warn('[AuthStore] Erreur de lecture SecureStore :', e);
    } finally {
      set({ isLoading: false });
    }
  },

  /**
   * setUser
   * Sauvegarde l'utilisateur et le token dans le store ET SecureStore.
   */
  setUser: async (user: AuthUser, token: string) => {
    try {
      await Promise.all([
        SecureStore.setItemAsync(KEY_TOKEN, token),
        SecureStore.setItemAsync(KEY_USER, JSON.stringify(user)),
      ]);
    } catch (e) {
      console.warn('[AuthStore] Erreur d\'écriture SecureStore :', e);
    }
    set({ user, token, isAuthenticated: true });
  },

  /**
   * logout
   * Supprime les données stockées et réinitialise le store.
   */
  logout: async () => {
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(KEY_TOKEN),
        SecureStore.deleteItemAsync(KEY_USER),
      ]);
    } catch (e) {
      console.warn('[AuthStore] Erreur de suppression SecureStore :', e);
    }
    set({ user: null, token: null, isAuthenticated: false });
  },
}));
