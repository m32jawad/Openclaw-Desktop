const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * Voice Assistant that monitors recording sessions in real-time,
 * asks contextual questions, and helps build detailed workflows
 */
class VoiceAssistant {
  constructor(configManager, store) {
    this.configManager = configManager;
    this.store = store;
    this.baseUrl = 'generativelanguage.googleapis.com';
    this.model = 'gemini-flash-latest';
    
    // Session state
    this.isActive = false;
    this.recordingId = null;
    this.conversation = []; // Store Q&A history
    this.screenCaptures = []; // Store periodic screen captures
    this.actionLog = []; // Store interpreted actions
    this.lastAnalysisTime = 0;
    this.analysisInterval = 5000; // Analyze every 5 seconds
    this.questionCallback = null; // Callback to ask questions to user
    
    // Context understanding
    this.currentContext = {
      applications: new Set(),
      actions: [],
      data_handled: [],
      purpose: null
    };
  }

  getApiKey() {
    const storeKey = this.store?.get('geminiApiKey', '');
    if (storeKey) return storeKey;

    const config = this.configManager.getConfig();
    return (
      config?.agents?.defaults?.model?.apiKey ||
      config?.apiKeys?.google ||
      config?.apiKeys?.gemini ||
      process.env.GEMINI_API_KEY ||
      ''
    );
  }

  /**
   * Start voice assistant for a recording session
   */
  startSession(recordingId, questionCallback) {
    this.isActive = true;
    this.recordingId = recordingId;
    this.questionCallback = questionCallback;
    this.conversation = [];
    this.screenCaptures = [];
    this.actionLog = [];
    this.currentContext = {
      applications: new Set(),
      actions: [],
      data_handled: [],
      purpose: null
    };
    this.lastAnalysisTime = Date.now();
    
    console.log(`[VoiceAssistant] Session started for recording ${recordingId}`);
    
    // Ask initial question
    this.askQuestion("What task are you planning to demonstrate in this recording?", 'initial_purpose');
  }

  /**
   * Stop voice assistant session
   */
  stopSession() {
    this.isActive = false;
    console.log(`[VoiceAssistant] Session stopped for recording ${this.recordingId}`);
    
    // Return complete context
    return {
      conversation: this.conversation,
      actionLog: this.actionLog,
      context: {
        ...this.currentContext,
        applications: Array.from(this.currentContext.applications)
      }
    };
  }

  /**
   * Process a screen capture during recording
   */
  async processScreenCapture(captureData, timestamp, recentEvents) {
    if (!this.isActive) return;

    // Store the capture
    this.screenCaptures.push({
      timestamp,
      data: captureData,
      events: recentEvents
    });

    const now = Date.now();
    if (now - this.lastAnalysisTime < this.analysisInterval) {
      return; // Don't analyze too frequently
    }

    this.lastAnalysisTime = now;

    try {
      // Analyze what's happening in current screen
      const analysis = await this.analyzeCurrentAction(captureData, recentEvents);
      
      if (analysis) {
        this.actionLog.push({
          timestamp,
          ...analysis
        });

        // Update context
        if (analysis.application) {
          this.currentContext.applications.add(analysis.application);
        }
        if (analysis.action) {
          this.currentContext.actions.push(analysis.action);
        }

        // Determine if we should ask a clarifying question
        await this.considerAsking Question(analysis, recentEvents);
      }
    } catch (error) {
      console.error('[VoiceAssistant] Error processing capture:', error);
    }
  }

  /**
   * Analyze current screen and recent events to understand what user is doing
   */
  async analyzeCurrentAction(imageBase64, recentEvents) {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;

    const eventsSummary = this.formatRecentEvents(recentEvents);
    const conversationContext = this.formatConversation();

    const prompt = `You are a workflow monitoring assistant. Analyze this screenshot and recent user actions to understand what the user is currently doing.

## Recent User Actions:
${eventsSummary}

## Conversation History:
${conversationContext}

## Your Task:
Identify what action the user just performed or is performing. Be specific and concise.

## Required JSON Response:
{
  "application": "Name of the application or website being used",
  "action": "Brief description of the action (e.g., 'copied text from document', 'clicked submit button', 'navigated to settings')",
  "action_type": "click|type|navigate|copy|paste|scroll|select|open|close|other",
  "target": "What element was interacted with (if visible)",
  "data_visible": "Any important data visible on screen (keep brief)",
  "significance": "low|medium|high - how important is this step for the workflow",
  "potential_question": "A clarifying question to ask user about this action (or null if none needed)"
}

Only respond with valid JSON.`;

    try {
      const requestBody = {
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: imageBase64
                }
              },
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json'
        }
      };

      const response = await this.makeRequest(
        `/v1beta/models/${this.model}:generateContent?key=${apiKey}`,
        requestBody
      );

      const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return JSON.parse(text);
      }
    } catch (error) {
      console.error('[VoiceAssistant] Error analyzing action:', error);
    }

    return null;
  }

  /**
   * Decide whether to ask a clarifying question
   */
  async considerAskingQuestion(analysis, recentEvents) {
    // Ask questions for significant actions that need clarification
    if (analysis.significance === 'high' && analysis.potential_question) {
      this.askQuestion(analysis.potential_question, 'clarification', analysis);
      return;
    }

    // Ask about copied/pasted data
    if (['copy', 'paste'].includes(analysis.action_type) && analysis.data_visible) {
      this.askQuestion(
        `I see you ${analysis.action_type === 'copy' ? 'copied' : 'pasted'} "${analysis.data_visible.substring(0, 50)}...". What is the purpose of this data?`,
        'data_purpose',
        analysis
      );
      return;
    }

    // Ask about application switches
    const lastApp = this.actionLog.length > 0 ? 
      this.actionLog[this.actionLog.length - 1].application : null;
    if (lastApp && analysis.application && lastApp !== analysis.application) {
      this.askQuestion(
        `You switched from ${lastApp} to ${analysis.application}. Why is this transition necessary?`,
        'app_switch',
        analysis
      );
      return;
    }

    // Periodically ask for overall progress understanding
    if (this.actionLog.length > 0 && this.actionLog.length % 10 === 0) {
      this.askQuestion(
        `We're ${this.actionLog.length} steps in. Can you summarize what you've accomplished so far?`,
        'progress_check',
        analysis
      );
    }
  }

  /**
   * Ask a question to the user
   */
  askQuestion(question, questionType, context = null) {
    if (!this.questionCallback) return;

    const questionData = {
      id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      question,
      type: questionType,
      context,
      timestamp: Date.now(),
      answered: false,
      answer: null
    };

    this.conversation.push(questionData);
    
    // Call the callback to display question to user
    this.questionCallback(questionData);
  }

  /**
   * Receive answer from user
   */
  async receiveAnswer(questionId, answer) {
    const question = this.conversation.find(q => q.id === questionId);
    if (!question) return;

    question.answered = true;
    question.answer = answer;
    question.answeredAt = Date.now();

    // Update context based on answer
    if (question.type === 'initial_purpose') {
      this.currentContext.purpose = answer;
    } else if (question.type === 'data_purpose') {
      this.currentContext.data_handled.push({
        data: question.context?.data_visible,
        purpose: answer
      });
    }

    console.log(`[VoiceAssistant] Received answer for ${questionId}: ${answer}`);
  }

  /**
   * Generate final detailed workflow with all context
   */
  async generateDetailedWorkflow(videoPath, inputEvents) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Gemini API key not configured');
    }

    // Read video
    const videoBuffer = fs.readFileSync(videoPath);
    const videoBase64 = videoBuffer.toString('base64');

    const conversationContext = this.formatConversation();
    const actionContext = this.formatActionLog();
    const eventsSummary = this.formatAllEvents(inputEvents);

    const prompt = `You are an expert workflow analyst creating detailed, instructional workflows. You have monitored this entire recording session and asked clarifying questions.

## Recording Purpose (stated by user):
${this.currentContext.purpose || 'Not specified'}

## Conversation History & User Answers:
${conversationContext}

## Detected Actions During Recording:
${actionContext}

## Complete Input Events Log:
${eventsSummary}

## Applications Used:
${Array.from(this.currentContext.applications).join(', ')}

## Your Task:
Create a DETAILED, INSTRUCTIONAL workflow that someone else could follow to perform this same task. Think of it like training a new employee - don't just say "click button", but explain WHAT button, WHERE it is, WHY we click it, and WHAT to expect.

For each step, provide:
1. What to do (the action)
2. How to do it (detailed instructions)
3. Why to do it (the purpose/reasoning)
4. What to expect (the result/feedback)

## Required JSON Response Format:
{
  "title": "Clear, descriptive title for this workflow",
  "description": "Comprehensive narrative description including the business purpose and overall goal",
  "purpose": "The 'why' behind this workflow - what problem does it solve?",
  "prerequisites": ["List any requirements before starting this workflow"],
  "applications_used": ["list", "of", "applications"],
  "estimated_duration": "How long this workflow typically takes",
  "difficulty_level": "beginner|intermediate|advanced",
  "steps": [
    {
      "step_number": 1,
      "what": "Brief action summary",
      "how": "Detailed step-by-step instructions on HOW to perform this action, including exactly where to find UI elements",
      "why": "Explanation of WHY this step is necessary and what it accomplishes",
      "what_to_expect": "What the user should see/experience after completing this step",
      "application": "Which application this step is in",
      "action_type": "click|type|navigate|select|copy|paste|wait|verify",
      "target": "Specific UI element or location",
      "target_location": "Description of where to find the target element",
      "value": "Data to enter (if applicable)",
      "data_source": "Where this data comes from (if it's copied/calculated)",
      "screenshot_description": "What the screen should look like at this point",
      "tips": "Any helpful tips or common mistakes to avoid",
      "alternatives": "Alternative ways to accomplish the same thing (if any)"
    }
  ],
  "decision_points": [
    {
      "step": "Which step number",
      "decision": "What decision needs to be made",
      "options": ["option1", "option2"],
      "reasoning": "How to decide between options"
    }
  ],
  "data_flow": "Explanation of what data is being moved/transformed and why",
  "success_criteria": "How to know the workflow completed successfully",
  "troubleshooting": [
    {
      "issue": "Common problem that might occur",
      "solution": "How to fix it"
    }
  ],
  "automation_prompt": "A detailed prompt for an AI agent that includes not just the steps but the reasoning and decision-making logic needed to handle variations",
  "notes": "Any additional context or important information"
}

Make this workflow detailed enough that someone with basic computer skills could follow it successfully, using their own judgment when minor variations occur.`;

    try {
      const requestBody = {
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: 'video/webm',
                  data: videoBase64
                }
              },
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 16000,
          responseMimeType: 'application/json'
        }
      };

      const response = await this.makeRequest(
        `/v1beta/models/${this.model}:generateContent?key=${apiKey}`,
        requestBody
      );

      const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return JSON.parse(text);
      }

      throw new Error('No response from Gemini API');
    } catch (error) {
      console.error('[VoiceAssistant] Error generating workflow:', error);
      throw error;
    }
  }

  /**
   * Helper: Format recent events into readable text
   */
  formatRecentEvents(events) {
    if (!events || events.length === 0) return 'No recent events';
    
    return events.slice(-10).map(e => {
      if (e.type === 'keypress') {
        return `Key: ${e.key}`;
      } else if (e.type === 'click') {
        return `Click at (${e.x}, ${e.y})${e.target ? ` on "${e.target}"` : ''}`;
      } else if (e.type === 'scroll') {
        return `Scroll ${e.deltaY > 0 ? 'down' : 'up'}`;
      }
      return e.type;
    }).join('\n');
  }

  /**
   * Helper: Format all events into readable text
   */
  formatAllEvents(events) {
    if (!events || events.length === 0) return 'No events recorded';
    
    const summary = [];
    events.forEach((e, idx) => {
      const time = Math.floor(e.timestamp / 1000);
      if (e.type === 'keypress' && e.key) {
        summary.push(`[${time}s] Key: ${e.key}`);
      } else if (e.type === 'click') {
        summary.push(`[${time}s] Click${e.target ? ` on "${e.target.substring(0, 50)}"` : ''}`);
      }
    });
    
    return summary.join('\n');
  }

  /**
   * Helper: Format conversation history
   */
  formatConversation() {
    if (this.conversation.length === 0) return 'No conversation yet';
    
    return this.conversation.map(q => {
      return `Q: ${q.question}\nA: ${q.answered ? q.answer : '(not answered yet)'}`;
    }).join('\n\n');
  }

  /**
   * Helper: Format action log
   */
  formatActionLog() {
    if (this.actionLog.length === 0) return 'No actions logged yet';
    
    return this.actionLog.map((a, idx) => {
      const time = Math.floor(a.timestamp / 1000);
      return `[${time}s] ${a.application}: ${a.action}`;
    }).join('\n');
  }

  /**
   * Make HTTPS request to Gemini API
   */
  makeRequest(path, body, method = 'POST') {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(`API Error: ${parsed.error?.message || data}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      });

      req.on('error', reject);
      
      if (body) {
        req.write(JSON.stringify(body));
      }
      
      req.end();
    });
  }
}

module.exports = VoiceAssistant;
