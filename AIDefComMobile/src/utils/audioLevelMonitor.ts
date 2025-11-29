/**
 * Audio Level Monitor for iOS
 * Uses native module to get real-time audio levels from microphone
 * Note: Currently only supports iOS. Android will use fallback.
 */

import { Platform } from 'react-native';

// Import native module from expo-modules-core
// Expo modules are automatically registered in NativeModulesProxy
let AudioLevelMonitorModule: any = null;

try {
  const { NativeModulesProxy } = require('expo-modules-core');
  AudioLevelMonitorModule = NativeModulesProxy.AudioLevelMonitorModule;
  
  if (AudioLevelMonitorModule) {
    console.log('✅ AudioLevelMonitor native module found');
  } else {
    if (Platform.OS === 'ios') {
      console.warn('⚠️ AudioLevelMonitor native module not found. Make sure:');
      console.warn('   1. File AudioLevelMonitorModule.swift is added to Xcode project');
      console.warn('   2. App has been rebuilt: npx expo run:ios --device');
      console.warn('   3. Using fallback audio levels (simulated)');
    }
  }
} catch (error) {
  console.warn('⚠️ Failed to load NativeModulesProxy:', error);
  AudioLevelMonitorModule = null;
}

export interface AudioLevelMonitor {
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => Promise<void>;
  onLevelUpdate: (callback: (level: number) => void) => () => void;
}

class AudioLevelMonitorImpl implements AudioLevelMonitor {
  private subscription: { remove: () => void } | null = null;
  private updateCallback: ((level: number) => void) | null = null;
  private fallbackInterval: NodeJS.Timeout | null = null;
  private useNativeModule = false;

  async startMonitoring(): Promise<void> {
    try {
      // Use native module if available (iOS)
      if (Platform.OS === 'ios' && AudioLevelMonitorModule) {
        try {
          console.log('🎤 Attempting to start native audio level monitoring...');
          
          // Check if it's the native module from NativeModulesProxy
          if (AudioLevelMonitorModule.startMonitoring) {
            await AudioLevelMonitorModule.startMonitoring();
            
            // For native module, we need to use EventEmitter
            const { EventEmitter } = require('expo-modules-core');
            const emitter = new EventEmitter(AudioLevelMonitorModule);
            
            this.subscription = emitter.addListener('onLevelUpdate', (event: { level: number }) => {
              console.log('📊 Native audio level:', event.level);
              if (this.updateCallback) {
                this.updateCallback(event.level);
              }
            });
          } else if (AudioLevelMonitorModule.addLevelUpdateListener) {
            // If it's the TypeScript wrapper
            await AudioLevelMonitorModule.startMonitoring();
            this.subscription = AudioLevelMonitorModule.addLevelUpdateListener(
              (event: { level: number }) => {
                console.log('📊 Native audio level:', event.level);
                if (this.updateCallback) {
                  this.updateCallback(event.level);
                }
              }
            );
          } else {
            throw new Error('Module does not have expected methods');
          }
          
          this.useNativeModule = true;
          console.log('✅ Native audio level monitoring started');
        } catch (nativeError) {
          console.warn('⚠️ Native module failed, using fallback:', nativeError);
          this.useNativeModule = false;
          this.startFallbackMonitoring();
        }
      } else {
        // Fallback for Android or when module is not available
        console.warn('⚠️ Audio level monitoring: Using fallback (native module not available)');
        this.useNativeModule = false;
        this.startFallbackMonitoring();
      }
    } catch (error) {
      console.error('❌ Failed to start audio level monitoring:', error);
      // Start fallback even on error
      this.startFallbackMonitoring();
    }
  }

  private startFallbackMonitoring(): void {
    // Fallback: Simulated audio levels that respond to time
    let elapsedTime = 0;
    let lastLevel = 30;
    
    this.fallbackInterval = setInterval(() => {
      elapsedTime += 0.1;
      
      // Create realistic speech pattern
      const time = elapsedTime;
      const speechRhythm = Math.sin(time * 1.8) * 18;
      const wordPattern = Math.sin(time * 4.2) * 8;
      const pausePattern = Math.sin(time * 0.6) * 5;
      
      const baseLevel = 40;
      const targetLevel = baseLevel + speechRhythm + wordPattern + pausePattern;
      
      // Smooth transition
      const smoothFactor = 0.3;
      lastLevel = lastLevel * (1 - smoothFactor) + targetLevel * smoothFactor;
      
      const level = Math.min(85, Math.max(15, Math.round(lastLevel)));
      
      if (this.updateCallback) {
        this.updateCallback(level);
      }
    }, 100);
    
    console.log('🔄 Fallback audio level monitoring started');
  }

  async stopMonitoring(): Promise<void> {
    try {
      if (this.useNativeModule && Platform.OS === 'ios' && AudioLevelMonitorModule) {
        await AudioLevelMonitorModule.stopMonitoring();
        console.log('🛑 Native audio level monitoring stopped');
      }
      
      // Stop fallback interval
      if (this.fallbackInterval) {
        clearInterval(this.fallbackInterval);
        this.fallbackInterval = null;
        console.log('🛑 Fallback audio level monitoring stopped');
      }
      
      // Remove subscription
      if (this.subscription) {
        this.subscription.remove();
        this.subscription = null;
      }
    } catch (error) {
      console.error('❌ Failed to stop audio level monitoring:', error);
    }
  }

  onLevelUpdate(callback: (level: number) => void): () => void {
    this.updateCallback = callback;
    
    // Return unsubscribe function
    return () => {
      this.updateCallback = null;
    };
  }
}

// Export singleton instance
export const audioLevelMonitor = new AudioLevelMonitorImpl();

