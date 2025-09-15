"use client";
import { useState, useEffect, useRef } from 'react';
import { enhanceTextForSpeech, splitIntoSpeechChunks } from '@/lib/chatUtils';

interface EnhancedSpeechProps {
  text: string;
  autoPlay?: boolean;
  onSpeakingChange?: (isSpeaking: boolean) => void;
}

export default function EnhancedSpeech({
  text,
  autoPlay = false,
  onSpeakingChange
}: EnhancedSpeechProps) {
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const speechChunksRef = useRef<string[]>([]);
  const currentChunkRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Initialize speech synthesis and select the best voice
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Create AudioContext for testing audio output
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Play a silent sound to initialize audio
      if (audioContextRef.current.state === 'suspended') {
        const silentOscillator = audioContextRef.current.createOscillator();
        silentOscillator.connect(audioContextRef.current.destination);
        silentOscillator.frequency.value = 0; // Silent
        silentOscillator.start();
        silentOscillator.stop(audioContextRef.current.currentTime + 0.001);
      }
    } catch (e) {
      console.error("AudioContext initialization failed:", e);
    }
    
    // Function to find and set the best voice
    const findBestVoice = () => {
      if (!('speechSynthesis' in window)) {
        console.warn('Speech synthesis not supported');
        return;
      }
      
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;
      
      // Prioritized voice selection
      const bestVoice = voices.find(v => 
        v.name.includes('Google UK English Female') || 
        v.name.includes('Samantha') || 
        v.name.includes('Google US English Female')
      ) || voices.find(v => 
        (v.name.includes('Google') && v.name.includes('Female')) || 
        v.name.includes('Female') ||
        v.name.includes('Microsoft')
      ) || voices[0];
      
      setSelectedVoice(bestVoice);
      console.log("Selected voice:", bestVoice?.name);
    };
    
    // Try immediately and also listen for voices to load
    findBestVoice();
    window.speechSynthesis.onvoiceschanged = findBestVoice;
    
    // Cleanup function
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);
  
  // When text changes, prepare speech chunks
  useEffect(() => {
    if (!text) return;
    
    // Enhance and split the text
    const enhancedText = enhanceTextForSpeech(text);
    speechChunksRef.current = splitIntoSpeechChunks(enhancedText, 150); // Smaller chunks for better reliability
    currentChunkRef.current = 0;
    
    // Start speaking if autoPlay is enabled
    if (autoPlay) {
      setTimeout(() => speakText(), 500); // Small delay to ensure everything is ready
    }
  }, [text, autoPlay]);
  
  // Main function to speak text
  const speakText = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('Speech synthesis not supported');
      return;
    }
    
    // Ensure audio context is running
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(err => console.error("Failed to resume AudioContext:", err));
    }
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    if (!speechChunksRef.current.length) return;
    
    // Start speaking state
    setIsSpeaking(true);
    if (onSpeakingChange) onSpeakingChange(true);
    
    // Function to speak next chunk
    const speakNextChunk = () => {
      if (currentChunkRef.current < speechChunksRef.current.length) {
        const utterance = new SpeechSynthesisUtterance(speechChunksRef.current[currentChunkRef.current]);
        
        // Configure voice
        if (selectedVoice) utterance.voice = selectedVoice;
        utterance.rate = 1.0; // Natural pace
        utterance.pitch = 1.0; // Natural pitch
        utterance.volume = 1.0; // Full volume
        
        // Handle events
        utterance.onend = () => {
          currentChunkRef.current++;
          speakNextChunk();
        };
        
        utterance.onerror = (event) => {
          console.error('Speech error:', event);
          stopSpeaking();
        };
        
        // Start speaking this chunk
        window.speechSynthesis.speak(utterance);
      } else {
        // All chunks finished
        stopSpeaking();
      }
    };
    
    // Start with the first chunk
    speakNextChunk();
  };
  
  // Stop speaking
  const stopSpeaking = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    setIsSpeaking(false);
    if (onSpeakingChange) onSpeakingChange(false);
  };
  
  // Chrome bug fix: speech synthesis stops after ~15 seconds
  useEffect(() => {
    if (!isSpeaking) return;
    
    const intervalId = setInterval(() => {
      if (window.speechSynthesis.speaking) {
        // Pause and resume to keep it going
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      } else {
        clearInterval(intervalId);
      }
    }, 5000); // Check more frequently
    
    return () => clearInterval(intervalId);
  }, [isSpeaking]);
  
  return (
    <div className="enhanced-speech-controls flex items-center space-x-2">
      {!isSpeaking ? (
        <button
          onClick={speakText}
          className="play-button bg-blue-600 text-white px-3 py-1.5 rounded-md flex items-center gap-1.5 hover:bg-blue-700 transition-all shadow-sm"
          disabled={!text || !selectedVoice}
          aria-label="Read text aloud"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <span className="font-medium">Listen</span>
        </button>
      ) : (
        <div className="flex items-center space-x-2">
          <button
            onClick={stopSpeaking}
            className="stop-button bg-red-500 text-white px-3 py-1.5 rounded-md flex items-center gap-1.5 hover:bg-red-600 transition-all shadow-sm"
            aria-label="Stop reading"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span className="font-medium">Stop</span>
          </button>
          
          <div className="speech-indicator flex items-center bg-gray-800 px-2 py-1 rounded-md border border-gray-700">
            <div className="flex space-x-1 mr-2">
              <div className="w-1 h-3 bg-blue-400 rounded-full animate-pulse" style={{ animationDuration: '0.8s' }}></div>
              <div className="w-1 h-4 bg-blue-500 rounded-full animate-pulse" style={{ animationDuration: '0.7s', animationDelay: '0.1s' }}></div>
              <div className="w-1 h-5 bg-blue-600 rounded-full animate-pulse" style={{ animationDuration: '0.6s', animationDelay: '0.2s' }}></div>
              <div className="w-1 h-3 bg-blue-400 rounded-full animate-pulse" style={{ animationDuration: '0.7s', animationDelay: '0.3s' }}></div>
            </div>
            <span className="text-xs text-white">Playing audio...</span>
          </div>
        </div>
      )}
    </div>
  );
}