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
    return try {
      val imageProxy: ImageProxy = frame.imageProxy
      val planes: Array<ImageProxy.PlaneProxy> = imageProxy.planes
      if (planes.isEmpty()) return -1.0

      // Plan Y de YUV_420_888 — toujours en memoire CPU via CameraX
      val plane: ImageProxy.PlaneProxy = planes[0]
      val buf = plane.buffer.duplicate()

      // Annotations :Int explicites pour eviter l erreur Kotlin FIR
      // "operator modifier required on compareTo" sur les types Java-interop
      val rowStride: Int = plane.rowStride
      val pixelStride: Int = plane.pixelStride
      val width: Int = imageProxy.width
      val height: Int = imageProxy.height

      val bytes = ByteArray(buf.remaining())
      buf.get(bytes)
      val bufLen: Int = bytes.size

      // Zone centrale 30-70 % pour eviter les bords
      val r0: Int = height * 30 / 100
      val r1: Int = height * 70 / 100
      val c0: Int = width * 30 / 100
      val c1: Int = width * 70 / 100

      // if/else explicite au lieu de maxOf() pour eviter le compareTo FIR
      var rStep: Int = (r1 - r0) / 20
      if (rStep < 1) rStep = 1
      var cStep: Int = (c1 - c0) / 20
      if (cStep < 1) cStep = 1

      var sum: Long = 0L
      var count: Int = 0
      var r: Int = r0
      while (r < r1) {
        var c: Int = c0
        while (c < c1) {
          val idx: Int = r * rowStride + c * pixelStride
          if (idx >= 0 && idx < bufLen) {
            sum += (bytes[idx].toInt() and 0xFF).toLong()
            count++
          }
          c += cStep
        }
        r += rStep
      }

      if (count > 0) sum.toDouble() / count.toDouble() else -1.0
    } catch (e: Exception) {
      Log.e("BrightnessPlugin", "Error reading frame: \${e.message}")
      -2.0
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
        content = content.replace(
          /super\.onCreate\(\)/,
          'super.onCreate()\n      BrightnessPlugin.register()'
        );
        fs.writeFileSync(mainAppPath, content);
        console.log('[withBrightnessPlugin] BrightnessPlugin.register() ajoute dans MainApplication.kt');
      }
    } else {
      console.warn('[withBrightnessPlugin] MainApplication.kt introuvable.');
    }

    return config;
  }]);

  return config;
};
