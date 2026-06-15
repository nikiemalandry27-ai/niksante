/**
 * withCameraLockPlugin — verrouillage Camera2 pour mesure PPG
 *
 * Pourquoi : pendant la mesure PPG (doigt sur caméra + flash),
 * l'AE/AWB ajuste dynamiquement le gain → amplitude des pics variable
 * → peakAmpCv > seuil → rejet. Ce plugin :
 *   1. Patche CameraSession.kt (VisionCamera) pour ajouter lockForPPG()
 *      via Camera2CameraControl (AE off, ISO fixe, temps expo fixe, AWB off).
 *   2. Crée CameraLockModule.kt — native module React Native appelable depuis JS.
 *   3. Crée CameraLockPackage.kt et l'enregistre dans MainApplication.kt.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs   = require('fs');
const path = require('path');

const MARKER = '// PPG_CAMERA_LOCK_v1';

// ── Méthodes injectées dans CameraSession.kt ────────────────────────────────
const LOCK_METHODS = `
  ${MARKER}
  @OptIn(ExperimentalCamera2Interop::class)
  fun lockForPPG() {
    val cam = camera ?: run {
      Log.w(TAG, "[PPG] lockForPPG: camera non prête")
      return
    }
    try {
      Camera2CameraControl.from(cam.cameraControl).setCaptureRequestOptions(
        CaptureRequestOptions.Builder()
          // Désactive l'auto-exposition — gain figé
          .setCaptureRequestOption(CaptureRequest.CONTROL_AE_MODE,  CaptureRequest.CONTROL_AE_MODE_OFF)
          // Temps d'exposition : 16 ms (≈ 62 fps max, compatible 30 fps)
          .setCaptureRequestOption(CaptureRequest.SENSOR_EXPOSURE_TIME, 16_000_000L)
          // ISO 1600 — signal suffisant même sur appareils peu sensibles sous flash LED
          .setCaptureRequestOption(CaptureRequest.SENSOR_SENSITIVITY, 1600)
          // Désactive l'auto white-balance (stabilise le ratio R/G)
          .setCaptureRequestOption(CaptureRequest.CONTROL_AWB_MODE, CaptureRequest.CONTROL_AWB_MODE_OFF)
          // Désactive l'auto-focus (inutile, doigt collé sur l'objectif)
          .setCaptureRequestOption(CaptureRequest.CONTROL_AF_MODE,  CaptureRequest.CONTROL_AF_MODE_OFF)
          .build()
      )
      Log.i(TAG, "[PPG] Camera verrouillée : AE off, ISO 600, exp 16ms, AWB/AF off")
    } catch (e: Exception) {
      Log.e(TAG, "[PPG] lockForPPG échoué : \${e.message}")
    }
  }

  @OptIn(ExperimentalCamera2Interop::class)
  fun unlockCamera() {
    val cam = camera ?: return
    try {
      Camera2CameraControl.from(cam.cameraControl)
        .setCaptureRequestOptions(CaptureRequestOptions.Builder().build())
      Log.i(TAG, "[PPG] Camera déverrouillée — réglages auto restaurés")
    } catch (e: Exception) {
      Log.e(TAG, "[PPG] unlockCamera échoué : \${e.message}")
    }
  }
`;

// ── CameraLockModule.kt ───────────────────────────────────────────────────────
const MODULE_SOURCE = `package com.niksante.app

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.mrousavy.camera.core.CameraSession

class CameraLockModule(reactContext: ReactApplicationContext)
  : ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "CameraLockModule"

  @ReactMethod
  fun lockForPPG(promise: Promise) {
    try {
      val session = CameraSession.ppgInstance
      if (session == null) {
        promise.reject("NOT_READY", "CameraSession non initialisée — attends que la caméra soit prête")
        return
      }
      session.lockForPPG()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("LOCK_ERROR", e.message ?: "Erreur inconnue", e)
    }
  }

  @ReactMethod
  fun unlockCamera(promise: Promise) {
    try {
      CameraSession.ppgInstance?.unlockCamera()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("UNLOCK_ERROR", e.message ?: "Erreur inconnue", e)
    }
  }
}
`;

// ── CameraLockPackage.kt ──────────────────────────────────────────────────────
const PACKAGE_SOURCE = `package com.niksante.app

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class CameraLockPackage : ReactPackage {
  override fun createNativeModules(ctx: ReactApplicationContext) = listOf(CameraLockModule(ctx))
  override fun createViewManagers(ctx: ReactApplicationContext) =
    emptyList<ViewManager<*, *>>()
}
`;

// ─────────────────────────────────────────────────────────────────────────────

module.exports = function withCameraLockPlugin(config) {

  // ── Étape 1 : patcher CameraSession.kt de VisionCamera ───────────────────
  config = withDangerousMod(config, ['android', (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const sessionPath = path.join(
      projectRoot,
      'node_modules', 'react-native-vision-camera',
      'android', 'src', 'main', 'java',
      'com', 'mrousavy', 'camera', 'core',
      'CameraSession.kt'
    );

    if (!fs.existsSync(sessionPath)) {
      console.warn('[withCameraLockPlugin] CameraSession.kt introuvable — patch ignoré');
      return config;
    }

    let src = fs.readFileSync(sessionPath, 'utf8');
    if (src.includes(MARKER)) {
      // déjà patchée lors d'un build précédent
      return config;
    }

    // 1a. Ajouter les imports Camera2 après le dernier import kotlinx
    src = src.replace(
      'import kotlinx.coroutines.sync.withLock',
      [
        'import kotlinx.coroutines.sync.withLock',
        'import android.hardware.camera2.CaptureRequest',
        'import androidx.camera.camera2.interop.Camera2CameraControl',
        'import androidx.camera.camera2.interop.CaptureRequestOptions',
        'import androidx.camera.camera2.interop.ExperimentalCamera2Interop',
      ].join('\n')
    );

    // 1b. Étendre le companion object avec le singleton ppgInstance
    src = src.replace(
      '  companion object {\n    internal const val TAG = "CameraSession"\n  }',
      [
        '  companion object {',
        '    internal const val TAG = "CameraSession"',
        '    ' + MARKER,
        '    @JvmStatic @Volatile var ppgInstance: CameraSession? = null',
        '  }',
      ].join('\n')
    );

    // 1c. Affecter ppgInstance dès l'init
    src = src.replace(
      '  init {\n    lifecycleRegistry.currentState = Lifecycle.State.CREATED',
      '  init {\n    ppgInstance = this\n    lifecycleRegistry.currentState = Lifecycle.State.CREATED'
    );

    // 1d. Injecter lockForPPG / unlockCamera avant la dernière accolade
    const lastBrace = src.lastIndexOf('}');
    src = src.slice(0, lastBrace) + LOCK_METHODS + '\n}';

    fs.writeFileSync(sessionPath, src);
    console.log('[withCameraLockPlugin] CameraSession.kt patchée pour le lock PPG');
    return config;
  }]);

  // ── Étape 2 : écrire les Kotlin + enregistrer le package ─────────────────
  config = withDangerousMod(config, ['android', (config) => {
    const platformRoot = config.modRequest.platformProjectRoot;
    const pkgDir = path.join(
      platformRoot, 'app', 'src', 'main', 'java',
      'com', 'niksante', 'app'
    );
    fs.mkdirSync(pkgDir, { recursive: true });

    fs.writeFileSync(path.join(pkgDir, 'CameraLockModule.kt'),  MODULE_SOURCE);
    fs.writeFileSync(path.join(pkgDir, 'CameraLockPackage.kt'), PACKAGE_SOURCE);
    console.log('[withCameraLockPlugin] CameraLockModule.kt + CameraLockPackage.kt écrits');

    // Patch MainApplication.kt pour enregistrer CameraLockPackage
    const mainAppPath = path.join(pkgDir, 'MainApplication.kt');
    if (fs.existsSync(mainAppPath)) {
      let content = fs.readFileSync(mainAppPath, 'utf8');
      if (!content.includes('CameraLockPackage')) {
        // Expo 51/52 : "PackageList(this).packages" sur une seule expression
        if (content.includes('PackageList(this).packages')) {
          content = content.replace(
            'PackageList(this).packages',
            'PackageList(this).packages.apply { add(CameraLockPackage()) }'
          );
          fs.writeFileSync(mainAppPath, content);
          console.log('[withCameraLockPlugin] CameraLockPackage enregistré dans MainApplication.kt');
        } else {
          console.warn('[withCameraLockPlugin] Pattern getPackages() non trouvé — enregistre CameraLockPackage manuellement');
        }
      }
    } else {
      console.warn('[withCameraLockPlugin] MainApplication.kt introuvable dans ' + pkgDir);
    }

    return config;
  }]);

  return config;
};
