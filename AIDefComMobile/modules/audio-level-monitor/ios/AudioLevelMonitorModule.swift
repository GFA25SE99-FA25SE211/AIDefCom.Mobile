import ExpoModulesCore
import AVFoundation

public class AudioLevelMonitorModule: Module {
    private var audioRecorder: AVAudioRecorder?
    private var levelTimer: Timer?
    private var isMonitoring = false
    
    public func definition() -> ModuleDefinition {
        Name("AudioLevelMonitor")
        
        Events("onLevelUpdate")
        
        AsyncFunction("startMonitoring") { () -> Void in
            self.startMonitoring()
        }
        
        AsyncFunction("stopMonitoring") { () -> Void in
            self.stopMonitoring()
        }
    }
    
    private func startMonitoring() {
        // Don't start if already monitoring
        if isMonitoring {
            return
        }
        
        isMonitoring = true
        
        let audioSession = AVAudioSession.sharedInstance()
        
        do {
            // Configure audio session for recording
            try audioSession.setCategory(.record, mode: .measurement, options: [])
            try audioSession.setActive(true)
        } catch {
            print("AudioLevelMonitor: Failed to set up audio session: \(error)")
            isMonitoring = false
            return
        }
        
        // Audio settings matching the recording settings (16kHz, mono, 16-bit)
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatLinearPCM),
            AVSampleRateKey: 16000.0,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsFloatKey: false
        ]
        
        // Create temporary file for monitoring (won't be used for actual recording)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("audio_level_monitor_\(UUID().uuidString).wav")
        
        do {
            audioRecorder = try AVAudioRecorder(url: url, settings: settings)
            audioRecorder?.isMeteringEnabled = true
            audioRecorder?.record()
            
            // Start timer to update audio levels every 50ms (20 updates per second)
            levelTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
                self?.updateAudioLevel()
            }
            
            // Add timer to main run loop
            if let timer = levelTimer {
                RunLoop.main.add(timer, forMode: .common)
            }
        } catch {
            print("AudioLevelMonitor: Failed to create audio recorder: \(error)")
            isMonitoring = false
            
            // Deactivate audio session on error
            do {
                try AVAudioSession.sharedInstance().setActive(false)
            } catch {
                print("AudioLevelMonitor: Failed to deactivate audio session: \(error)")
            }
        }
    }
    
    private func stopMonitoring() {
        guard isMonitoring else { return }
        
        isMonitoring = false
        
        // Stop and invalidate timer
        levelTimer?.invalidate()
        levelTimer = nil
        
        // Stop audio recorder
        audioRecorder?.stop()
        audioRecorder = nil
        
        // Clean up temporary file
        if let recorder = audioRecorder {
            try? FileManager.default.removeItem(at: recorder.url)
        }
        
        // Deactivate audio session
        do {
            try AVAudioSession.sharedInstance().setActive(false)
        } catch {
            print("AudioLevelMonitor: Failed to deactivate audio session: \(error)")
        }
    }
    
    private func updateAudioLevel() {
        guard let recorder = audioRecorder, isMonitoring else { return }
        
        // Update meters to get current power levels
        recorder.updateMeters()
        
        // Get average power (more stable than peak power)
        let averagePower = recorder.averagePower(forChannel: 0)
        
        // Convert from dB to 0-100 scale
        // Typical range: -160 dB (silence) to 0 dB (maximum)
        // We'll map -60 dB to 0% and 0 dB to 100%
        // This gives a good range for speech
        let normalizedLevel: Double
        
        if averagePower < -60 {
            // Below threshold, consider as silence
            normalizedLevel = 0
        } else {
            // Map -60 dB to 0% and 0 dB to 100%
            normalizedLevel = max(0, min(100, ((averagePower + 60) / 60) * 100))
        }
        
        // Send event to JavaScript
        sendEvent("onLevelUpdate", [
            "level": normalizedLevel
        ])
    }
    
    deinit {
        stopMonitoring()
    }
}

