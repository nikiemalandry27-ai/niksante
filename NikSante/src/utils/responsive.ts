/**
 * NikSanté — Utilitaire de mise à l'échelle responsive
 *
 * Référence : iPhone 14 (390 × 844 pts logiques)
 *
 * s(n)  → échelle horizontale  (padding, margin, width)
 * vs(n) → échelle verticale    (height, paddingVertical)
 * fs(n) → échelle police       (fontSize — moins agressive)
 */

import { Dimensions, PixelRatio } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

const BASE_W = 390;
const BASE_H = 844;

/** Mise à l'échelle horizontale */
export const s = (n: number): number =>
  Math.round(PixelRatio.roundToNearestPixel(n * (W / BASE_W)));

/** Mise à l'échelle verticale */
export const vs = (n: number): number =>
  Math.round(PixelRatio.roundToNearestPixel(n * (H / BASE_H)));

/** Mise à l'échelle police (facteur 0.4 — modérée) */
export const fs = (n: number): number =>
  Math.round(PixelRatio.roundToNearestPixel(n + (s(n) - n) * 0.4));

/** Largeur et hauteur de la fenêtre */
export const WINDOW_W = W;
export const WINDOW_H = H;

/** Détection tablette (≥ 768 pt) */
export const isTablet = W >= 768;

/** Détection petit écran (≤ 375 pt) */
export const isSmall  = W <= 375;
