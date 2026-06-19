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

      // AlarmSchedulerPackage.kt n'est plus nécessaire (Expo Module API)
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

  // ── 3. Register AlarmSchedulerModule via ExpoModulesProvider.kt ─────────
  //    Expo génère ce fichier dans un emplacement fixe avec un format stable.
  //    Beaucoup plus fiable que de patcher MainApplication.kt.
  config = withDangerousMod(config, [
    'android',
    (config) => {
      const providerPath = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'java', 'expo', 'modules', 'ExpoModulesProvider.kt'
      );

      if (!fs.existsSync(providerPath)) {
        console.warn('[withAlarmScheduler] ExpoModulesProvider.kt not found:', providerPath);
        return config;
      }

      let content = fs.readFileSync(providerPath, 'utf8');

      if (content.includes('AlarmSchedulerModule')) {
        console.log('[withAlarmScheduler] AlarmSchedulerModule already registered.');
        return config;
      }

      // Le pattern est généré par expo-modules-core — très stable
      const anchor = 'internal fun appContext() = modulesProvider {';
      if (!content.includes(anchor)) {
        console.warn('[withAlarmScheduler] Pattern not found in ExpoModulesProvider.kt');
        return config;
      }

      content = content.replace(
        anchor,
        `${anchor}\n  module { com.niksante.app.AlarmSchedulerModule() }`
      );

      fs.writeFileSync(providerPath, content);
      console.log('[withAlarmScheduler] AlarmSchedulerModule registered in ExpoModulesProvider.kt');
      return config;
    },
  ]);

  return config;
};
