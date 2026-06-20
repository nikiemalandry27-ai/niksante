const { withAndroidManifest, withDangerousMod, withGradleProperties } = require('@expo/config-plugins');
const fs   = require('fs');
const path = require('path');

module.exports = function withAlarmScheduler(config) {

  // ── 1. Copy BroadcastReceiver Kotlin files into the Android project ──────
  //    AlarmSchedulerModule.kt is NOT copied here — it is registered via the
  //    inline-modules mechanism (Step 3) which symlinks it at Gradle build time.
  config = withDangerousMod(config, [
    'android',
    (config) => {
      const destDir = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'java', 'com', 'niksante', 'app'
      );
      const srcDir = path.join(config.modRequest.projectRoot, 'android-src');

      fs.mkdirSync(destDir, { recursive: true });

      // Only copy the BroadcastReceivers — NOT AlarmSchedulerModule (handled by inline modules)
      const files = [
        'AlarmReceiver.kt',
        'BootReceiver.kt',
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

  // ── 3. Inline-modules: tell expo-modules-autolinking to scan android-src/modules/
  //    The Gradle plugin reads expo.inlineModules.watchedDirectories at build time,
  //    symlinks AlarmSchedulerModule.kt into the app's source set, and generates
  //    ExpoInlineModulesList.java which AppContext loads via reflection at runtime.
  config = withGradleProperties(config, (config) => {
    const key = 'expo.inlineModules.watchedDirectories';
    const value = '["android-src/modules"]';

    // Remove any existing entry for this key to avoid duplicates
    config.modResults = config.modResults.filter(
      (item) => !(item.type === 'property' && item.key === key)
    );

    config.modResults.push({ type: 'property', key, value });
    return config;
  });

  return config;
};
