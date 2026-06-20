const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
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
  //    Written to android/app/gradle.properties (scoped to :app only) so that sibling
  //    expo module projects do NOT inherit this property and try to compile
  //    ExpoInlineModulesList.java referencing com.niksante.app.AlarmSchedulerModule,
  //    which would fail since that class is not in their compile classpath.
  config = withDangerousMod(config, [
    'android',
    (config) => {
      const appGradleProps = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'gradle.properties'
      );
      const key = 'expo.inlineModules.watchedDirectories';
      const value = '["android-src/modules"]';

      let contents = '';
      if (fs.existsSync(appGradleProps)) {
        contents = fs.readFileSync(appGradleProps, 'utf8');
        contents = contents.split('\n').filter(l => !l.startsWith(key + '=')).join('\n');
        if (contents.length > 0 && !contents.endsWith('\n')) contents += '\n';
      }
      contents += `${key}=${value}\n`;
      fs.writeFileSync(appGradleProps, contents, 'utf8');
      console.log(`[withAlarmScheduler] Set ${key} in app/gradle.properties`);
      return config;
    },
  ]);

  return config;
};
