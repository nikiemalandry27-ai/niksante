const { withAndroidManifest, withDangerousMod, withMainApplication } = require('@expo/config-plugins');
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
        'AlarmSchedulerPackage.kt',
      ];

      for (const file of files) {
        const src = path.join(srcDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(destDir, file));
          console.log(`[withAlarmScheduler] Copied ${file} → ${destDir}`);
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

  // ── 3. Register AlarmSchedulerPackage in MainApplication.kt ─────────────
  //    Utilise withMainApplication (API officielle) + patterns multiples
  config = withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    if (contents.includes('AlarmSchedulerPackage')) {
      console.log('[withAlarmScheduler] AlarmSchedulerPackage already registered.');
      return config;
    }

    // Pattern A : template Expo standard avec variable locale
    //   val packages = PackageList(this).packages
    //   return packages
    if (contents.includes('val packages = PackageList(this).packages')) {
      contents = contents.replace(
        'val packages = PackageList(this).packages',
        'val packages = PackageList(this).packages\n          packages.add(AlarmSchedulerPackage())'
      );
      console.log('[withAlarmScheduler] Registered via Pattern A.');

    // Pattern B : return direct compact
    //   return PackageList(this).packages
    } else if (contents.includes('return PackageList(this).packages')) {
      contents = contents.replace(
        'return PackageList(this).packages',
        [
          'val packages = PackageList(this).packages',
          '          packages.add(AlarmSchedulerPackage())',
          '          return packages',
        ].join('\n')
      );
      console.log('[withAlarmScheduler] Registered via Pattern B.');

    } else {
      console.warn('[withAlarmScheduler] WARNING: Could not find a pattern to inject AlarmSchedulerPackage.');
      console.warn('[withAlarmScheduler] File path:', config.modResults.path);
    }

    config.modResults.contents = contents;
    return config;
  });

  return config;
};
