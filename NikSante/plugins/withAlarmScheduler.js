const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs   = require('fs');
const path = require('path');

module.exports = function withAlarmScheduler(config) {

  // ── 1. Copy Kotlin files into the Android project ───────────────────────
  config = withDangerousMod(config, [
    'android',
    (config) => {
      const destDir = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'java', 'com', 'niksante', 'app'
      );
      const srcDir = path.join(config.modRequest.projectRoot, 'android-src');

      fs.mkdirSync(destDir, { recursive: true });

      const files = [
        'AlarmReceiver.kt',
        'BootReceiver.kt',
        'AlarmSchedulerModule.kt',
      ];

      for (const file of files) {
        const src = path.join(srcDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(destDir, file));
          console.log(`[withAlarmScheduler] Copied ${file}`);
        } else {
          console.warn(`[withAlarmScheduler] Source not found: ${src}`);
        }
      }

      return config;
    },
  ]);

  // ── 2. Register BroadcastReceivers in AndroidManifest.xml ───────────────
  config = withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    if (!app.receiver) app.receiver = [];

    if (!app.receiver.some(r => r.$?.['android:name'] === '.AlarmReceiver')) {
      app.receiver.push({
        $: { 'android:name': '.AlarmReceiver', 'android:exported': 'false' },
      });
    }

    if (!app.receiver.some(r => r.$?.['android:name'] === '.BootReceiver')) {
      app.receiver.push({
        $: {
          'android:name': '.BootReceiver',
          'android:exported': 'true',
          'android:enabled': 'true',
        },
        'intent-filter': [{
          action: [
            { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
            { $: { 'android:name': 'android.intent.action.QUICKBOOT_POWERON' } },
          ],
        }],
      });
    }

    return config;
  });

  // ── 3. L'enregistrement du module est géré par modules/alarm-scheduler/expo-module.config.json
  //    expo-modules-core scanne node_modules au prebuild et génère ExpoModulesProvider.kt
  //    automatiquement — aucun patch manuel nécessaire.

  return config;
};
