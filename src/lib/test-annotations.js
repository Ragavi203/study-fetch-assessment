/**
 * Test utility for annotation commands
 * This file can be used to test if annotation commands are being parsed correctly
 * Run it with "node test-annotations.js" in the terminal
 */

// Mock the annotation structure
class Annotation {
  constructor(props) {
    Object.assign(this, props);
  }
}

// Simplified version of parseAnnotationCommands function
function parseAnnotationCommands(text, currentPage) {
  const annotations = [];
  let cleanedText = text;
  
  try {
    // Process highlighting commands - format: [HIGHLIGHT x y width height page]
    const highlightRegex = /\[HIGHLIGHT (\d+) (\d+) (\d+) (\d+) (\d+)(?:\s+color="([^"]+)")?]/g;
    let match;
    
    // Collect all commands to remove
    const commandsToRemove = [];
    
    while ((match = highlightRegex.exec(text)) !== null) {
      console.log("Found highlight match:", match[0]);
      
      const x = parseInt(match[1], 10);
      const y = parseInt(match[2], 10);
      const width = parseInt(match[3], 10);
      const height = parseInt(match[4], 10);
      const page = parseInt(match[5], 10);
      const color = match[6] || "rgba(255, 255, 0, 0.3)";
      
      annotations.push({
        type: 'highlight',
        x,
        y,
        width,
        height,
        page,
        color,
        animationEffect: 'pulse'
      });
      
      commandsToRemove.push(match[0]);
    }
    
    // Remove all commands from the text
    commandsToRemove.forEach(cmd => {
      cleanedText = cleanedText.replace(cmd, '');
    });
    
  } catch (error) {
    console.error('Error parsing annotation commands:', error);
  }
  
  return { annotations, cleanedText };
}

// Test cases
const testCases = [
  {
    name: "Simple highlight",
    input: "This paragraph has a [HIGHLIGHT 100 200 300 50 1] highlight command.",
    expectedAnnotations: 1,
    expectedPage: 1
  },
  {
    name: "Multiple highlights",
    input: "This has [HIGHLIGHT 100 100 200 30 1] two [HIGHLIGHT 150 250 100 40 2] highlights.",
    expectedAnnotations: 2,
    expectedPages: [1, 2]
  },
  {
    name: "Highlight with color",
    input: "Colored [HIGHLIGHT 200 150 250 60 3 color=\"rgba(255, 0, 0, 0.5)\"] highlight.",
    expectedAnnotations: 1,
    expectedColor: "rgba(255, 0, 0, 0.5)"
  },
  {
    name: "No highlights",
    input: "This text has no highlights at all.",
    expectedAnnotations: 0
  },
  {
    name: "Realistic AI response",
    input: `I've analyzed the document and here are the key points:

1. The main concept is explained on [HIGHLIGHT 150 300 400 50 2] page 2.
2. There's an important formula [HIGHLIGHT 200 450 250 40 3 color="rgba(255, 165, 0, 0.4)"] that relates to the problem.
3. The conclusion section contains the summary.`,
    expectedAnnotations: 2,
    expectedPages: [2, 3]
  }
];

// Run tests
console.log("=== Annotation Command Parser Test ===");
console.log("");

testCases.forEach((test, index) => {
  console.log(`Test ${index + 1}: ${test.name}`);
  console.log("Input:", test.input.substring(0, 50) + (test.input.length > 50 ? "..." : ""));
  
  const result = parseAnnotationCommands(test.input, 1);
  
  console.log(`Found ${result.annotations.length} annotations`);
  if (result.annotations.length > 0) {
    console.log("First annotation:", JSON.stringify(result.annotations[0], null, 2));
  }
  
  // Simple validation
  let passed = result.annotations.length === test.expectedAnnotations;
  
  if (test.expectedPage && result.annotations.length > 0) {
    passed = passed && result.annotations[0].page === test.expectedPage;
  }
  
  if (test.expectedPages && result.annotations.length > 0) {
    passed = passed && test.expectedPages.includes(result.annotations[0].page);
  }
  
  if (test.expectedColor && result.annotations.length > 0) {
    passed = passed && result.annotations[0].color === test.expectedColor;
  }
  
  console.log(passed ? "✅ PASSED" : "❌ FAILED");
  console.log("");
});

console.log("=== Test Complete ===");