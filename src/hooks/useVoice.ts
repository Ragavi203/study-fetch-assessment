/**
 * React hook for using the VoiceService in components
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { VoiceService, VoiceSettings, getVoiceService } from '@/lib/voiceService';

export interface UseVoiceOptions {
  initialSettings?: Partial<VoiceSettings>;
  autoInitialize?: boolean;
  onTranscript?: (text: string, isFinal: boolean) => void;
}

export function useVoice(options: UseVoiceOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [isSupported, setIsSupported] = useState<{stt: boolean; tts: boolean}>({ stt: false, tts: false });
  
  // Keep service instance in ref to avoid re-creating on each render
  const serviceRef = useRef<VoiceService | null>(null);
  
  // Initialize the voice service
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const service = getVoiceService(options.initialSettings);
      serviceRef.current = service;
      
      // Check support
      setIsSupported({
        stt: service.isRecognitionSupported(),
        tts: service.isSynthesisSupported()
      });
      
      // Set up event handlers
      service.setHandlers({
        onStart: () => setIsListening(true),
        onResult: (text, isFinal) => {
          setTranscript(text);
          if (isFinal) {
            setFinalTranscript(prev => prev + ' ' + text);
          }
          options.onTranscript?.(text, isFinal);
        },
        onEnd: () => setIsListening(false),
        onError: (err) => setError(err instanceof Error ? err : new Error(String(err)))
      });
      
      // Auto-start if requested
      if (options.autoInitialize && service.isEnabled()) {
        service.startListening();
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
    
    // Cleanup
    return () => {
      if (serviceRef.current) {
        serviceRef.current.stopListening();
        serviceRef.current.stopSpeaking();
      }
    };
  }, [options.initialSettings, options.autoInitialize, options.onTranscript]);
  
  // Speech recognition control
  const startListening = useCallback(() => {
    if (!serviceRef.current) return;
    setError(null);
    serviceRef.current.startListening();
  }, []);
  
  const stopListening = useCallback(() => {
    if (!serviceRef.current) return;
    serviceRef.current.stopListening();
  }, []);
  
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);
  
  // Speech synthesis
  const speak = useCallback((text: string) => {
    if (!serviceRef.current || !text) return;
    serviceRef.current.speak(text);
    setIsSpeaking(true);
  }, []);
  
  const stopSpeaking = useCallback(() => {
    if (!serviceRef.current) return;
    serviceRef.current.stopSpeaking();
    setIsSpeaking(false);
  }, []);
  
  // Settings
  const updateSettings = useCallback((newSettings: Partial<VoiceSettings>) => {
    if (!serviceRef.current) return;
    return serviceRef.current.updateSettings(newSettings);
  }, []);
  
  // Reset transcript
  const resetTranscript = useCallback(() => {
    setTranscript('');
    setFinalTranscript('');
  }, []);
  
  // Get available voices
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  
  useEffect(() => {
    if (!serviceRef.current) return;
    
    const loadVoices = () => {
      const availableVoices = serviceRef.current?.getAvailableVoices() || [];
      setVoices(availableVoices);
    };
    
    loadVoices();
    
    // Handle dynamic voice loading in some browsers
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
      return () => {
        window.speechSynthesis.onvoiceschanged = null;
      };
    }
  }, []);
  
  return {
    isListening,
    isSpeaking,
    isSupported,
    transcript,
    finalTranscript,
    error,
    voices,
    startListening,
    stopListening,
    toggleListening,
    speak,
    stopSpeaking,
    updateSettings,
    resetTranscript,
  };
}