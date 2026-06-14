/**
 * Config plugin Expo qui injecte BrightnessPlugin.kt dans le build Android.
 *
 * Pourquoi : frame.toArrayBuffer() copie GPU→CPU et échoue sur certains
 * appareils Android. Ce plugin natif lit directement imageProxy.planes[0]
 * (plan Y de YUV_420_888), chemin toujours CPU-accessible via CameraX.
 */
const { withDangerousMod, withAppBuildGradle } = require('@expo/config-plugins');
const fs   = require('fs');
const path = require('path');

// ImageProxy vient de androidx.camera:camera-core qui est une dependance
// transitive de VisionCamera (implementation, non exposee au module app).
// On l ajoute en compileOnly pour que le compilateur Kotlin puisse resoudre
// la classe — elle est deja presente au runtime via VisionCamera.
const CAMERA_CORE_VERSION = '1.5.0-alpha03';

const KOTLIN_SOURCE = `package com.niksante.app

import android.util.Log
import androidx.camera.core.ImageProxy
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

class BrightnessPlugin : FrameProcessorPlugin() {

  override fun callback(frame: Frame, params: Map<String, Any>?): Any {
    val ERR = mapOf("r" to -2.0, "g" to -2.0, "b" to -2.0)
    return try {
      val imageProxy: ImageProxy = frame.imageProxy ?: return ERR
      val planes: Array<ImageProxy.PlaneProxy> = imageProxy.planes
      // YUV_420_888 a toujours 3 plans : Y, U(Cb), V(Cr)
      if (planes.size < 3) return ERR

      val width:  Int = imageProxy.width
      val height: Int = imageProxy.height

      // ── Plan Y (luminance, pleine resolution) ────────────────────────────
      val yPlane: ImageProxy.PlaneProxy = planes[0]
      val yRaw = yPlane.buffer ?: return ERR
      val yBuf = yRaw.duplicate()
      val yRowStride:   Int = yPlane.rowStride
      val yPixelStride: Int = yPlane.pixelStride
      val yBytes = ByteArray(yBuf.remaining())
      yBuf.get(yBytes)
      val yLen: Int = yBytes.size

      // ── Plan U/Cb (sous-echantillonne 2x) ────────────────────────────────
      val uPlane: ImageProxy.PlaneProxy = planes[1]
      val uRaw = uPlane.buffer ?: return ERR
      val uBuf = uRaw.duplicate()
      val uRowStride:   Int = uPlane.rowStride
      val uPixelStride: Int = uPlane.pixelStride
      val uBytes = ByteArray(uBuf.remaining())
      uBuf.get(uBytes)
      val uLen: Int = uBytes.size

      // ── Plan V/Cr (sous-echantillonne 2x) ────────────────────────────────
      val vPlane: ImageProxy.PlaneProxy = planes[2]
      val vRaw = vPlane.buffer ?: return ERR
      val vBuf = vRaw.duplicate()
      val vRowStride:   Int = vPlane.rowStride
      val vPixelStride: Int = vPlane.pixelStride
      val vBytes = ByteArray(vBuf.remaining())
      vBuf.get(vBytes)
      val vLen: Int = vBytes.size

      // Zone centrale 30-70 % — evite les bords et les artefacts de vignettage
      val r0: Int = height * 30 / 100
      val r1: Int = height * 70 / 100
      val c0: Int = width  * 30 / 100
      val c1: Int = width  * 70 / 100

      var rStep: Int = (r1 - r0) / 20; if (rStep < 1) rStep = 1
      var cStep: Int = (c1 - c0) / 20; if (cStep < 1) cStep = 1

      var sumR: Double = 0.0
      var sumG: Double = 0.0
      var sumB: Double = 0.0
      var count: Int   = 0

      var row: Int = r0
      while (row < r1) {
        var col: Int = c0
        while (col < c1) {
          // Valeur Y
          val yIdx: Int = row * yRowStride + col * yPixelStride
          val Y: Double = if (yIdx in 0 until yLen) (yBytes[yIdx].toInt() and 0xFF).toDouble() else 128.0

          // Valeurs UV — sous-echantillonnage 2x en ligne et colonne
          val uvRow: Int = row / 2
          val uvCol: Int = col / 2
          val uIdx:  Int = uvRow * uRowStride + uvCol * uPixelStride
          val vIdx:  Int = uvRow * vRowStride + uvCol * vPixelStride
          val U: Double  = if (uIdx in 0 until uLen) (uBytes[uIdx].toInt() and 0xFF).toDouble() - 128.0 else 0.0
          val V: Double  = if (vIdx in 0 until vLen) (vBytes[vIdx].toInt() and 0xFF).toDouble() - 128.0 else 0.0

          // Conversion BT.601 YUV → RGB (plage 0-255)
          val R: Double = (Y + 1.402  * V).coerceIn(0.0, 255.0)
          val G: Double = (Y - 0.344  * U - 0.714 * V).coerceIn(0.0, 255.0)
          val B: Double = (Y + 1.772  * U).coerceIn(0.0, 255.0)

          sumR += R; sumG += G; sumB += B
          count++
          col += cStep
        }
        row += rStep
      }

      if (count > 0) mapOf(
        "r" to sumR / count,
        "g" to sumG / count,
        "b" to sumB / count
      ) else ERR

    } catch (e: Exception) {
      Log.e("BrightnessPlugin", "Error reading frame: \${e.message}")
      mapOf("r" to -2.0, "g" to -2.0, "b" to -2.0)
    }
  }

  companion object {
    private var registered = false

    fun register() {
      if (registered) return
      registered = true
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("getBrightness") { _, _ ->
        BrightnessPlugin()
      }
    }
  }
}
`;

module.exports = function withBrightnessPlugin(config) {
  // Etape 1 : ajouter camera-core en compileOnly pour que ImageProxy soit
  // visible au compilateur Kotlin (deja presente au runtime via VisionCamera)
  config = withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('brightness_plugin_camera_core')) {
      config.modResults.contents += `
// brightness_plugin_camera_core — ImageProxy visible pour BrightnessPlugin.kt
dependencies {
    compileOnly("androidx.camera:camera-core:${CAMERA_CORE_VERSION}")
}
`;
    }
    return config;
  });

  // Etape 2 : ecrire BrightnessPlugin.kt + patcher MainApplication.kt
  config = withDangerousMod(config, ['android', (config) => {
    const projectRoot  = config.modRequest.platformProjectRoot;
    const pkgDir       = path.join(projectRoot, 'app', 'src', 'main', 'java', 'com', 'niksante', 'app');

    fs.mkdirSync(pkgDir, { recursive: true });

    fs.writeFileSync(path.join(pkgDir, 'BrightnessPlugin.kt'), KOTLIN_SOURCE);

    const mainAppPath = path.join(pkgDir, 'MainApplication.kt');
    if (fs.existsSync(mainAppPath)) {
      let content = fs.readFileSync(mainAppPath, 'utf8');
      if (!content.includes('BrightnessPlugin.register')) {
        const patched = content.replace(
          /super\.onCreate\(\)/,
          'super.onCreate()\n      BrightnessPlugin.register()'
        );
        if (!patched.includes('BrightnessPlugin.register')) {
          // super.onCreate() non trouve : on injecte dans la methode onCreate manuellement
          const injected = patched.replace(
            /override\s+fun\s+onCreate\(\)\s*\{/,
            'override fun onCreate() {\n      BrightnessPlugin.register()'
          );
          if (!injected.includes('BrightnessPlugin.register')) {
            throw new Error(
              '[withBrightnessPlugin] Impossible de patcher MainApplication.kt ' +
              '— ni super.onCreate() ni override fun onCreate() trouves. ' +
              'Le plugin getBrightness ne sera pas enregistre.'
            );
          }
          fs.writeFileSync(mainAppPath, injected);
        } else {
          fs.writeFileSync(mainAppPath, patched);
        }
        console.log('[withBrightnessPlugin] BrightnessPlugin.register() ajoute dans MainApplication.kt');
      }
    } else {
      throw new Error(
        '[withBrightnessPlugin] MainApplication.kt introuvable dans ' + pkgDir +
        ' — verifiez que withBrightnessPlugin est apres les plugins Expo core dans app.json.'
      );
    }

    return config;
  }]);

  return config;
};
