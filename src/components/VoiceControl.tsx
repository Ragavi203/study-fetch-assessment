'use client';

import React, { useEffect, useState } from 'react';
import { useVoice } from '@/hooks/useVoice';

interface VoiceControlProps {
  onTranscript?: (text: string) => void;
  autoRead?: boolean;
  className?: string;
}

export function VoiceControl({ 
  onTranscript, 
  autoRead = true,
  className = ''
}: VoiceControlProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  
  // Initialize voice hook
  const {
    isListening,
    isSpeaking,
    isSupported,
    transcript,
    finalTranscript,
    error,
    toggleListening,
    stopSpeaking,
    speak
  } = useVoice({
    initialSettings: { 
      autoListen: false,
      autoRead: autoRead,
      language: 'en-US'
    },
    onTranscript: (text, isFinal) => {
      if (isFinal && onTranscript) {
        onTranscript(text);
      }
    }
  });

  // Handle final transcript
  useEffect(() => {
    if (finalTranscript && onTranscript) {
      onTranscript(finalTranscript.trim());
    }
  }, [finalTranscript, onTranscript]);

  // Tooltip hide timeout
  useEffect(() => {
    if (error) {
      setShowTooltip(true);
      const timer = setTimeout(() => setShowTooltip(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // If speech recognition is not supported, don't render
  if (!isSupported.stt) {
    return null;
  }

  return (
    <div className={`relative flex items-center gap-2 ${className}`}>
      {/* Microphone button */}
      <button
        className={`p-2 rounded-full ${
          isListening 
            ? 'bg-red-500 text-white animate-pulse' 
            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
        }`}
        onClick={toggleListening}
        aria-label={isListening ? 'Stop listening' : 'Start listening'}
        title={isListening ? 'Stop listening' : 'Start listening'}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-6 h-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
          />
        </svg>
      </button>

      {/* Text-to-speech toggle if supported */}
      {isSupported.tts && (
        <button
          className={`p-2 rounded-full ${
            isSpeaking 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
          }`}
          onClick={isSpeaking ? stopSpeaking : () => {}}
          aria-label={isSpeaking ? 'Stop speaking' : 'Text to speech enabled'}
          title={isSpeaking ? 'Stop speaking' : 'Text to speech enabled'}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
            />
          </svg>
        </button>
      )}

      {/* Transcription status */}
      {isListening && transcript && (
        <div className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm text-gray-700 max-w-[200px] overflow-hidden whitespace-nowrap overflow-ellipsis">
          {transcript}
        </div>
      )}

      {/* Error tooltip */}
      {error && showTooltip && (
        <div className="absolute top-full left-0 mt-2 p-2 bg-red-100 text-red-700 rounded text-xs max-w-[200px] z-10">
          {error.message || 'Voice recognition error'}
        </div>
      )}
    </div>
  );
}

// Button that reads text aloud when clicked
export function ReadAloudButton({ text, className = '' }: { text: string; className?: string }) {
  const { speak, stopSpeaking, isSpeaking, isSupported } = useVoice();
  
  // If speech synthesis is not supported, don't render
  if (!isSupported.tts) {
    return null;
  }

  return (
    <button
      className={`p-2 rounded-full ${
        isSpeaking 
          ? 'bg-blue-500 text-white' 
          : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
      } ${className}`}
      onClick={isSpeaking ? stopSpeaking : () => speak(text)}
      aria-label={isSpeaking ? 'Stop reading' : 'Read aloud'}
      title={isSpeaking ? 'Stop reading' : 'Read aloud'}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="w-5 h-5"
      >
        {isSpeaking ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 3.75L18 6m0 0l2.25 2.25M18 6l2.25-2.25M18 6l-2.25 2.25m1.5 13.5c-8.284 0-15-6.716-15-15V4.5A2.25 2.25 0 014.5 2.25h1.372c.516 0 .966.351 1.091.852l1.106 4.423c.11.44-.054.902-.417 1.173l-1.293.97a1.062 1.062 0 00-.38 1.21 12.035 12.035 0 007.143 7.143c.441.162.928-.004 1.21-.38l.97-1.293a1.125 1.125 0 011.173-.417l4.423 1.106c.5.125.852.575.852 1.091V19.5a2.25 2.25 0 01-2.25 2.25h-2.25z"
          />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
          />
        )}
      </svg>
    </button>
  );
}