/**
 * Simple Audio Level Monitor 
 * Uses simulated levels for testing - always works
 */

export interface SimpleAudioLevelMonitor {
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => Promise<void>;
  onLevelUpdate: (callback: (level: number) => void) => () => void;
}

class SimpleAudioLevelMonitorImpl implements SimpleAudioLevelMonitor {
  private updateCallback: ((level: number) => void) | null = null;
  private isMonitoring = false;
  private levelInterval: NodeJS.Timeout | null = null;

  async startMonitoring(): Promise<void> {
    try {
      if (this.isMonitoring) {
        return;
      }

      console.log('🎤 Starting Simple Audio level monitoring...');
      
      let elapsedTime = 0;
      let lastLevel = 30;
      
      this.levelInterval = setInterval(() => {
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

      this.isMonitoring = true;
      console.log('✅ Simple Audio level monitoring started');
    } catch (error) {
      console.error('❌ Failed to start Simple Audio level monitoring:', error);
      throw error;
    }
  }

  async stopMonitoring(): Promise<void> {
    try {
      if (!this.isMonitoring) {
        return;
      }

      if (this.levelInterval) {
        clearInterval(this.levelInterval);
        this.levelInterval = null;
      }

      this.isMonitoring = false;
      console.log('🛑 Simple Audio level monitoring stopped');
    } catch (error) {
      console.error('❌ Failed to stop Simple Audio level monitoring:', error);
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
export const simpleAudioLevelMonitor = new SimpleAudioLevelMonitorImpl();