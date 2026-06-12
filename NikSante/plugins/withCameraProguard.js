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
      // 1. Patch VisionCamera build.gradle to compile against CameraX 1.6.0
      //    (same version as expo-camera) — fixes Camera2CameraInfoImpl mismatch
      const vcBuildGradle = path.join(
        config.modRequest.projectRoot,
        'node_modules',
        'react-native-vision-camera',
        'android',
        'build.gradle'
      );
      if (fs.existsSync(vcBuildGradle)) {
        let gradle = fs.readFileSync(vcBuildGradle, 'utf8');
        gradle = gradle.replace(
          /def camerax_version = "1\.5\.0-alpha03"/,
          'def camerax_version = "1.6.0"'
        );
        fs.writeFileSync(vcBuildGradle, gradle);
      }

      // 2. Add ProGuard keep rules for CameraX (belt-and-suspenders)
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
      } else {
        fs.writeFileSync(proguardPath, PROGUARD_RULES);
      }

      return config;
    },
  ]);
};
