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
        'AlarmSchedulerPackage.kt',
      ];

      for (const file of files) {
        const src = path.join(srcDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(destDir, file));
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
  config = withDangerousMod(config, [
    'android',
    (config) => {
      const mainAppPath = path.join(
        config.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'java', 'com', 'niksante', 'app', 'MainApplication.kt'
      );

      if (!fs.existsSync(mainAppPath)) return config;

      let content = fs.readFileSync(mainAppPath, 'utf8');

      if (content.includes('AlarmSchedulerPackage')) return config;

      content = content.replace(
        'val packages = PackageList(this).packages',
        'val packages = PackageList(this).packages\n          packages.add(AlarmSchedulerPackage())'
      );

      fs.writeFileSync(mainAppPath, content);
      return config;
    },
  ]);

  return config;
};
