const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PROGUARD_RULES = `
# Keep CameraX internal classes required by react-native-vision-camera
-keep class androidx.camera.** { *; }
-keepclassmembers class androidx.camera.** { *; }
-dontwarn androidx.camera.**
`;

module.exports = function withCameraProguard(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const proguardPath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'proguard-rules.pro'
      );

      if (fs.existsSync(proguardPath)) {
        const existing = fs.readFileSync(proguardPath, 'utf8');
        if (!existing.includes('androidx.camera')) {
          fs.appendFileSync(proguardPath, PROGUARD_RULES);
        }
      }

      return config;
    },
  ]);
};
