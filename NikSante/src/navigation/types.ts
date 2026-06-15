/**
 * NikSanté — Types de navigation (Expo Router)
 *
 * Centralise tous les chemins de routes utilisés dans l'app.
 * Utilisé pour l'autocomplétion et éviter les fautes de frappe dans router.push().
 */

/** Routes publiques (non authentifiées) */
export type PublicRoute = '/login' | '/register';

/** Routes privées (authentifiées) */
export type PrivateRoute =
  | '/(tabs)/dashboard'
  | '/(tabs)/add-glucose'
  | '/(tabs)/profile'
  | '/(tabs)/sleep'
  | '/history'
  | '/emergency'
  | '/food-scan'
  | '/gamification'
  | '/mental-health';

export type AppRoute = PublicRoute | PrivateRoute;

/**
 * Future : paramètres de route typés
 *
 * Exemple d'usage :
 *   router.push({ pathname: '/history', params: { filter: 'week' } });
 */
export type RouteParams = {
  '/history':      { filter?: 'today' | 'week' | 'all' };
  '/food-scan':    Record<string, never>;
  '/gamification': Record<string, never>;
  '/mental-health': Record<string, never>;
};
