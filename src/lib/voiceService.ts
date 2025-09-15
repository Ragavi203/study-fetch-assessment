/**
 * Voice Integration Service
 * Provides speech recognition and speech synthesis functionality
 * Uses browser APIs when available, with optional fallback to external providers
 */

// Type definitions for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

// Types for voice settings and events
export interface VoiceSettings {
  enabled: boolean;
  autoListen: boolean;
  autoRead: boolean;
  language: string;
  voice?: string;
  pitch?: number;
  rate?: number;
  volume?: number;
  provider?: 'browser' | 'google' | 'azure';
}

interface VoiceStateHandlers {
  onStart?: () => void;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
}

// Main class for handling voice interactions
export class VoiceService {
  private recognition: any | null = null;
  private synthesis: SpeechSynthesis | null = null;
  private settings: VoiceSettings;
  private isListening: boolean = false;
  private isReading: boolean = false;
  private handlers: VoiceStateHandlers = {};
  
  constructor(initialSettings: Partial<VoiceSettings> = {}) {
    // Default settings
    this.settings = {
      enabled: true,
      autoListen: false,
      autoRead: true,
      language: 'en-US',
      pitch: 1.0,
      rate: 1.0,
      volume: 1.0,
      provider: 'browser',
      ...initialSettings
    };
    
    // Initialize if in browser
    if (typeof window !== 'undefined') {
      this.initializeBrowserAPIs();
    }
  }
  
  private initializeBrowserAPIs() {
    // Check for SpeechRecognition support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.setupRecognition();
    } else {
      console.warn('SpeechRecognition not supported in this browser');
    }
    
    // Check for SpeechSynthesis support
    if ('speechSynthesis' in window) {
      this.synthesis = window.speechSynthesis;
    } else {
      console.warn('SpeechSynthesis not supported in this browser');
    }
  }
  
  private setupRecognition() {
    if (!this.recognition) return;
    
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.settings.language;
    
    this.recognition.onstart = () => {
      this.isListening = true;
      this.handlers.onStart?.();
    };
    
    this.recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      if (finalTranscript) {
        this.handlers.onResult?.(finalTranscript, true);
      } else if (interimTranscript) {
        this.handlers.onResult?.(interimTranscript, false);
      }
    };
    
    this.recognition.onerror = (event: any) => {
      this.handlers.onError?.(event);
    };
    
    this.recognition.onend = () => {
      this.isListening = false;
      this.handlers.onEnd?.();
      
      // Restart if autoListen is enabled
      if (this.settings.autoListen && this.settings.enabled) {
        this.startListening();
      }
    };
  }
  
  // Public methods for controlling voice recognition
  public startListening() {
    if (!this.settings.enabled || !this.recognition || this.isListening) return;
    
    try {
      this.recognition.start();
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      this.handlers.onError?.(error);
    }
  }
  
  public stopListening() {
    if (!this.recognition || !this.isListening) return;
    
    try {
      this.recognition.stop();
    } catch (error) {
      console.error('Error stopping speech recognition:', error);
    }
  }
  
  // Public methods for controlling speech synthesis
  public speak(text: string) {
    if (!this.settings.enabled || !this.synthesis || !text) return;
    
    // Cancel any ongoing speech
    this.stopSpeaking();
    
    // Create a new utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.settings.language;
    utterance.pitch = this.settings.pitch || 1;
    utterance.rate = this.settings.rate || 1;
    utterance.volume = this.settings.volume || 1;
    
    // Select voice if specified
    if (this.settings.voice) {
      const voices = this.synthesis.getVoices();
      const selectedVoice = voices.find(voice => voice.name === this.settings.voice);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }
    
    // Handle events
    utterance.onstart = () => {
      this.isReading = true;
    };
    
    utterance.onend = () => {
      this.isReading = false;
    };
    
    utterance.onerror = (event) => {
      this.isReading = false;
      this.handlers.onError?.(event);
    };
    
    // Start speaking
    this.synthesis.speak(utterance);
  }
  
  public stopSpeaking() {
    if (!this.synthesis) return;
    
    this.synthesis.cancel();
    this.isReading = false;
  }
  
  // Settings and event handlers
  public updateSettings(newSettings: Partial<VoiceSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    
    if (this.recognition) {
      this.recognition.lang = this.settings.language;
    }
    
    return this.settings;
  }
  
  public setHandlers(handlers: VoiceStateHandlers) {
    this.handlers = { ...this.handlers, ...handlers };
  }
  
  // Status checks
  public isEnabled() {
    return this.settings.enabled;
  }
  
  public isRecognitionSupported() {
    return !!this.recognition;
  }
  
  public isSynthesisSupported() {
    return !!this.synthesis;
  }
  
  public isRecognitionActive() {
    return this.isListening;
  }
  
  public isSpeaking() {
    return this.isReading;
  }
  
  // Voice options
  public getAvailableVoices() {
    if (!this.synthesis) return [];
    return this.synthesis.getVoices();
  }
  
  // Server fallback for cases where browser API isn't available
  public async serverRecognize(audioData: Blob): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('audio', audioData);
      formData.append('language', this.settings.language);
      
      const response = await fetch('/api/voice/stt', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Server STT failed: ${response.status}`);
      }
      
      const data = await response.json();
      return data.transcript;
    } catch (error) {
      console.error('Error with server speech recognition:', error);
      throw error;
    }
  }
  
  public async serverSynthesize(text: string): Promise<ArrayBuffer> {
    try {
      const response = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          language: this.settings.language,
          voice: this.settings.voice,
          pitch: this.settings.pitch,
          rate: this.settings.rate,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Server TTS failed: ${response.status}`);
      }
      
      return await response.arrayBuffer();
    } catch (error) {
      console.error('Error with server speech synthesis:', error);
      throw error;
    }
  }
}

// (Type definitions moved to the top of the file)

// Export singleton instance for easy import in components
let voiceServiceInstance: VoiceService | null = null;

export function getVoiceService(settings?: Partial<VoiceSettings>): VoiceService {
  if (!voiceServiceInstance) {
    voiceServiceInstance = new VoiceService(settings);
  } else if (settings) {
    voiceServiceInstance.updateSettings(settings);
  }
  
  return voiceServiceInstance;
}