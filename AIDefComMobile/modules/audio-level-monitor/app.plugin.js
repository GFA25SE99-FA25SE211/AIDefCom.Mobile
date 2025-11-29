const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin to automatically add AudioLevelMonitor module to iOS project
 * Note: File will be copied, but you may need to add it to Xcode project manually
 */
module.exports = function withAudioLevelMonitor(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const modulePath = path.join(__dirname, 'ios', 'AudioLevelMonitorModule.swift');
      const targetPath = path.join(projectRoot, 'AIDefComMobile', 'AudioLevelMonitorModule.swift');
      
      // Copy Swift file to iOS project
      if (fs.existsSync(modulePath)) {
        fs.copyFileSync(modulePath, targetPath);
        console.log('✅ Copied AudioLevelMonitorModule.swift to iOS project');
        console.log('⚠️  IMPORTANT: You need to add this file to Xcode project manually:');
        console.log('   1. Open ios/AIDefComMobile.xcworkspace in Xcode');
        console.log('   2. Right-click on AIDefComMobile folder');
        console.log('   3. Select "Add Files to AIDefComMobile..."');
        console.log('   4. Select AudioLevelMonitorModule.swift');
        console.log('   5. Ensure "Copy items if needed" is UNCHECKED');
        console.log('   6. Ensure target "AIDefComMobile" is checked');
      } else {
        console.warn('⚠️  AudioLevelMonitorModule.swift not found at:', modulePath);
      }
      
      return config;
    },
  ]);
};

