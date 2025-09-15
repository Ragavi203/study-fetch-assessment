export interface Annotation {
  type: 'highlight' | 'circle' | 'underline' | 'arrow' | 'text' | 'rectangle' | 'freeform';
  page?: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  color?: string;
  text?: string;
  isAutomatic?: boolean;
  animationEffect?: 'pulse' | 'fade' | 'bounce' | 'zoom' | 'shake';
  opacity?: number;
  strokeWidth?: number;
  label?: string; // For adding numbered labels
  importance?: 'low' | 'medium' | 'high'; // For priority-based visual styling
  timestamp?: Date; // When the annotation was created
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  annotations?: Annotation[];
  streaming?: boolean; // Flag for messages that are currently streaming
  error?: boolean; // Flag for messages that failed with an error
}
