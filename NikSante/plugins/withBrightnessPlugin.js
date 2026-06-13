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
import com.mrousavy.camera.core.VisionCameraProxy
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

class BrightnessPlugin(
  proxy: VisionCameraProxy,
  options: Map<String, Any>?
) : FrameProcessorPlugin(proxy, options) {

  override fun callback(frame: Frame, arguments: Map<String, Any>?): Any? {
    return try {
      val imageProxy = frame.imageProxy
      val planes = imageProxy.planes
      if (planes.isEmpty()) return -1.0

      val plane = planes[0]
      val buf = plane.buffer.duplicate()
      val rowStride: Int = plane.rowStride
      val pixelStride: Int = plane.pixelStride
      val width: Int = imageProxy.width
      val height: Int = imageProxy.height

      val bytes = ByteArray(buf.remaining())
      buf.get(bytes)
      val bufLen: Int = bytes.size

      val r0: Int = height * 30 / 100
      val r1: Int = height * 70 / 100
      val c0: Int = width * 30 / 100
      val c1: Int = width * 70 / 100

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
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("getBrightness") { proxy, options ->
        BrightnessPlugin(proxy, options)
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
