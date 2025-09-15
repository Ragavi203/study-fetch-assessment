# Real-time PDF Highlighting with AI Response

This implementation enables real-time PDF highlighting that works simultaneously with AI text generation. Here's how it works:

## Core Components

1. **LiveHighlighter Component** - Processes streamed text chunks for annotation commands
2. **AnnotationUtils Library** - Parses special annotation and navigation commands
3. **StreamingResponse Component** - Handles SSE (Server-Sent Events) streaming
4. **Streaming API Endpoints** - Provides server-side streaming support

## Key Features

- Highlights appear immediately as the AI mentions them
- PDF navigation happens automatically at the right moment
- Different annotation types (highlights, circles) with animation effects
- Keeps all annotations in sync with the text content
- Provides visual feedback during streaming

## How It Works

1. The client sends a request to `/api/chat/stream`
2. Server responds with a unique stream URL
3. Client connects to the stream URL via EventSource
4. Server sends text chunks with embedded annotation commands
5. LiveHighlighter processes these commands in real-time
6. PDFAnnotationCanvas renders the annotations
7. ChatBox displays the cleaned text without commands

## Annotation Commands Format

```
[HIGHLIGHT x y width height page color="rgba(255,255,0,0.3)"]
[CIRCLE x y radius page color="rgba(255,0,0,0.7)"]
[HIGHLIGHT TEXT "exact text to find" ON PAGE page]
```

## Benefits

- Better user experience with immediate visual feedback
- Improved comprehension by synchronizing explanations with highlights
- More dynamic and engaging PDF analysis
- Allows users to follow along with the AI's reasoning

## Implementation Notes

- Uses Server-Sent Events (SSE) for efficient one-way streaming
- Lightweight parsing that doesn't block UI rendering
- Animation effects draw attention to new highlights
- Custom regex patterns ensure accurate command parsing
- Navigation cues are extracted and processed separately

## Future Improvements

- Add more annotation types (arrows, text notes, etc.)
- Support for batch annotation processing
- Optimize parsing for very large documents
- Add highlight search capabilities