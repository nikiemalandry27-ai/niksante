/**
 * Config plugin Expo qui injecte BrightnessPlugin.kt dans le build Android.
 *
 * Pourquoi : frame.toArrayBuffer() copie GPU→CPU et échoue sur certains
 * appareils Android. Ce plugin natif lit directement imageProxy.planes[0]
 * (plan Y de YUV_420_888), chemin toujours CPU-accessible via CameraX.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs   = require('fs');
const path = require('path');

const KOTLIN_SOURCE = `package com.niksante.app

import android.util.Log
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

/**
 * Frame Processor Plugin VisionCamera — calcule la luminosité moyenne
 * du canal Y (YUV_420_888) sans passer par toArrayBuffer() / GPU.
 * Lit directement imageProxy.planes[0].buffer (CPU-accessible, standard CameraX).
 */
class BrightnessPlugin : FrameProcessorPlugin() {

  override fun callback(frame: Frame, params: Map<String, Any>?): Any {
    return try {
      val imageProxy = frame.imageProxy
      val planes = imageProxy.planes
      if (planes.isEmpty()) return -1.0

      // Plan Y = luminosité ; rowStride peut dépasser width sur certains devices
      val yPlane      = planes[0]
      val buf         = yPlane.buffer.duplicate()   // ne modifie pas la position originale
      val rowStride   = yPlane.rowStride
      val pixelStride = yPlane.pixelStride
      val w           = imageProxy.width
      val h           = imageProxy.height

      val bytes = ByteArray(buf.remaining())
      buf.get(bytes)

      // Zone centrale 30–70 % pour éviter les bords
      val r0 = h * 30 / 100;  val r1 = h * 70 / 100
      val c0 = w * 30 / 100;  val c1 = w * 70 / 100
      val rStep = maxOf(1, (r1 - r0) / 20)
      val cStep = maxOf(1, (c1 - c0) / 20)

      var sum   = 0L
      var count = 0
      var r = r0
      while (r < r1) {
        var c = c0
        while (c < c1) {
          val idx = r * rowStride + c * pixelStride
          if (idx < bytes.size) {
            sum   += bytes[idx].toInt() and 0xFF
            count += 1
          }
          c += cStep
        }
        r += rStep
      }

      if (count > 0) sum.toDouble() / count else -1.0
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
  return withDangerousMod(config, ['android', (config) => {
    const projectRoot  = config.modRequest.platformProjectRoot;
    const pkgDir       = path.join(projectRoot, 'app', 'src', 'main', 'java', 'com', 'niksante', 'app');

    fs.mkdirSync(pkgDir, { recursive: true });

    // 1. Écrire BrightnessPlugin.kt
    fs.writeFileSync(path.join(pkgDir, 'BrightnessPlugin.kt'), KOTLIN_SOURCE);

    // 2. Patcher MainApplication.kt pour enregistrer le plugin au démarrage
    const mainAppPath = path.join(pkgDir, 'MainApplication.kt');
    if (fs.existsSync(mainAppPath)) {
      let content = fs.readFileSync(mainAppPath, 'utf8');
      if (!content.includes('BrightnessPlugin.register')) {
        content = content.replace(
          /super\.onCreate\(\)/,
          'super.onCreate()\n      BrightnessPlugin.register()'
        );
        fs.writeFileSync(mainAppPath, content);
        console.log('[withBrightnessPlugin] BrightnessPlugin.register() ajouté dans MainApplication.kt');
      }
    } else {
      console.warn('[withBrightnessPlugin] MainApplication.kt introuvable — le plugin ne sera pas enregistré automatiquement.');
    }

    return config;
  }]);
};
