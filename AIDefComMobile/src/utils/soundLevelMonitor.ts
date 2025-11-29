/**
 * Sound Level Monitor using react-native-sound-level
 * Works on both iOS and Android without Xcode
 */

import SoundLevel from 'react-native-sound-level';
import { Platform } from 'react-native';

export interface SoundLevelMonitor {
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => Promise<void>;
  onLevelUpdate: (callback: (level: number) => void) => () => void;
}

class SoundLevelMonitorImpl implements SoundLevelMonitor {
  private updateCallback: ((level: number) => void) | null = null;
  private isMonitoring = false;

  async startMonitoring(): Promise<void> {
    try {
      if (this.isMonitoring) {
        return;
      }

      console.log('🎤 Starting sound level monitoring...');
      
      // Start monitoring
      await SoundLevel.start({
        monitoringTime: 100, // Update every 100ms
        samplingRate: 22050, // Sample rate
        savePath: '', // We don't need to save audio
      } as any);

      // Add listeners
      SoundLevel.onNewFrame = (data: { value: number; rawValue: number }) => {
        // Convert to 0-100 range for consistency
        const normalizedLevel = Math.min(100, Math.max(0, data.value + 60));
        
        if (this.updateCallback) {
          this.updateCallback(normalizedLevel);
        }
      };

      this.isMonitoring = true;
      console.log('✅ Sound level monitoring started');
    } catch (error) {
      console.error('❌ Failed to start sound level monitoring:', error);
      throw error;
    }
  }

  async stopMonitoring(): Promise<void> {
    try {
      if (!this.isMonitoring) {
        return;
      }

      await SoundLevel.stop();
      this.isMonitoring = false;
      console.log('🛑 Sound level monitoring stopped');
    } catch (error) {
      console.error('❌ Failed to stop sound level monitoring:', error);
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
export const soundLevelMonitor = new SoundLevelMonitorImpl();