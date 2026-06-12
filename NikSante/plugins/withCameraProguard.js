const { withDangerousMod, withAppBuildGradle } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const CAMERAX_VERSION = '1.5.0-alpha03';

const CAMERAX_ARTIFACTS = [
  'camera-core',
  'camera-camera2',
  'camera-lifecycle',
  'camera-video',
  'camera-view',
  'camera-extensions',
  'camera-mlkit-vision',
];

const PROGUARD_RULES = `
# Keep CameraX classes for react-native-vision-camera
-keep class androidx.camera.** { *; }
-keepclassmembers class androidx.camera.** { *; }
-dontwarn androidx.camera.**
`;

module.exports = function withCameraFix(config) {
  // Step 1: Force CameraX to 1.5.0-alpha03 globally in app build.gradle
  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.contents.includes('camerax_force_alpha03')) {
      return config;
    }

    const forceLines = CAMERAX_ARTIFACTS
      .map(a => `    resolutionStrategy.force "androidx.camera:${a}:${CAMERAX_VERSION}"`)
      .join('\n');

    const block = `
// camerax_force_alpha03 — align CameraX for react-native-vision-camera
configurations.all {
${forceLines}
}
`;

    config.modResults.contents += block;
    return config;
  });

  // Step 2: Patch expo-camera and VisionCamera build.gradle to declare 1.5.0-alpha03
  config = withDangerousMod(config, [
    'android',
    (config) => {
      const libs = [
        {
          filePath: path.join(config.modRequest.projectRoot, 'node_modules', 'expo-camera', 'android', 'build.gradle'),
          from: /def camerax_version = "1\.6\.0"/,
          to: `def camerax_version = "${CAMERAX_VERSION}"`,
        },
        {
          filePath: path.join(config.modRequest.projectRoot, 'node_modules', 'react-native-vision-camera', 'android', 'build.gradle'),
          from: /def camerax_version = "1\.6\.0"/,
          to: `def camerax_version = "${CAMERAX_VERSION}"`,
        },
      ];

      for (const lib of libs) {
        if (fs.existsSync(lib.filePath)) {
          let content = fs.readFileSync(lib.filePath, 'utf8');
          content = content.replace(lib.from, lib.to);
          fs.writeFileSync(lib.filePath, content);
        }
      }

      // ProGuard rules (safety net)
      const proguardPath = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'proguard-rules.pro'
      );
      const existing = fs.existsSync(proguardPath)
        ? fs.readFileSync(proguardPath, 'utf8')
        : '';
      if (!existing.includes('androidx.camera')) {
        fs.appendFileSync(proguardPath, PROGUARD_RULES);
      }

      return config;
    },
  ]);

  return config;
};
