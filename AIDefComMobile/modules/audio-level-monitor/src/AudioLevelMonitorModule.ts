import { NativeModulesProxy, EventEmitter, Subscription } from 'expo-modules-core';

// Import the native module
let AudioLevelMonitorModule: any;

try {
  AudioLevelMonitorModule = NativeModulesProxy.AudioLevelMonitorModule;
} catch (error) {
  // Fallback if module is not available
  AudioLevelMonitorModule = new Proxy({}, {
    get() {
      throw new Error('AudioLevelMonitor module is not available. Make sure you have run `npx expo prebuild` or `npx expo run:ios`');
    },
  });
}

export interface AudioLevelUpdateEvent {
  level: number;
}

export default class AudioLevelMonitor {
  private static emitter = new EventEmitter(AudioLevelMonitorModule ?? NativeModulesProxy.default);

  /**
   * Start monitoring audio levels from microphone
   */
  static async startMonitoring(): Promise<void> {
    return await AudioLevelMonitorModule.startMonitoring();
  }

  /**
   * Stop monitoring audio levels
   */
  static async stopMonitoring(): Promise<void> {
    return await AudioLevelMonitorModule.stopMonitoring();
  }

  /**
   * Subscribe to audio level updates
   * @param callback Function called when audio level changes
   * @returns Subscription object that can be used to unsubscribe
   */
  static addLevelUpdateListener(
    callback: (event: AudioLevelUpdateEvent) => void
  ): Subscription {
    return this.emitter.addListener<AudioLevelUpdateEvent>('onLevelUpdate', callback);
  }

  /**
   * Remove all listeners for audio level updates
   */
  static removeAllListeners(): void {
    this.emitter.removeAllListeners('onLevelUpdate');
  }
}

