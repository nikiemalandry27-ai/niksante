const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAlarmScheduler(config) {
  // Registers BroadcastReceivers and AlarmActivity in AndroidManifest.xml.
  // AlarmActivity, AlarmReceiver, BootReceiver and AlarmSchedulerModule are compiled from
  // modules/alarm-scheduler/android/ — a proper Gradle subproject resolved by
  // expo-modules autolinking via the android/build.gradle it now contains.
  config = withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    if (!app.receiver) app.receiver = [];
    if (!app.activity) app.activity = [];

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

    // AlarmActivity : lancée par setAlarmClock() au lieu d'un BroadcastReceiver.
    // Les Activity bénéficient d'une exemption Android que les broadcasts n'ont pas :
    // les OEM (TECNO, Infinix…) ne peuvent pas bloquer une Activity issue de setAlarmClock().
    // Theme.NoDisplay = aucune UI visible ; finish() appelé dans onCreate().
    if (!app.activity.some(a => a.$?.['android:name'] === '.AlarmActivity')) {
      app.activity.push({
        $: {
          'android:name': '.AlarmActivity',
          'android:exported': 'false',
          'android:noHistory': 'true',
          'android:excludeFromRecents': 'true',
          'android:theme': '@android:style/Theme.NoDisplay',
        },
      });
    }

    return config;
  });

  return config;
};
