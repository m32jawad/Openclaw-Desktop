const fs = require('fs');
const path = require('path');
const https = require('https');

class GeminiAnalyzer {
  constructor(configManager, store) {
    this.configManager = configManager;
    this.store = store;
    this.baseUrl = 'generativelanguage.googleapis.com';
    this.model = 'gemini-flash-latest'; // Supports video input
  }

  getApiKey() {
    // First check dedicated store key (set from Config UI)
    const storeKey = this.store?.get('geminiApiKey', '');
    if (storeKey) return storeKey;

    const config = this.configManager.getConfig();
    // Try multiple config paths for the API key
    return (
      config?.agents?.defaults?.model?.apiKey ||
      config?.apiKeys?.google ||
      config?.apiKeys?.gemini ||
      process.env.GEMINI_API_KEY ||
      ''
    );
  }

  /**
   * Analyze a recorded video along with input event logs using Gemini Pro Vision.
   * Returns a detailed description and generated automation workflow steps.
   * If voiceAssistantContext is provided, uses it to create more detailed workflows.
   */
  async analyzeRecording(videoPath, eventsSummary, voiceAssistantContext = null) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Gemini API key not configured. Please add your Google API key in Configuration.');
    }

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Recording file not found: ${videoPath}`);
    }

    // Read video file and convert to base64
    const videoBuffer = fs.readFileSync(videoPath);
    const videoBase64 = videoBuffer.toString('base64');
    const videoSizeBytes = videoBuffer.length;
    
    // Use voice assistant for detailed workflow if available
    if (voiceAssistantContext) {
      console.log('[GeminiAnalyzer] Using voice assistant context for enhanced analysis');
      return await this.analyzeWithVoiceAssistant(videoPath, eventsSummary, voiceAssistantContext, apiKey);
    }

    // If the file is too large (>20MB), we need to use the File API
    if (videoSizeBytes > 20 * 1024 * 1024) {
      return await this.analyzeWithFileUpload(videoPath, eventsSummary, apiKey);
    }

    return await this.analyzeWithInlineData(videoBase64, eventsSummary, apiKey);
  }
  
  /**
   * Analyze recording with voice assistant context for detailed workflows
   */
  async analyzeWithVoiceAssistant(videoPath, eventsSummary, voiceContext, apiKey) {
    const videoBuffer = fs.readFileSync(videoPath);
    const videoBase64 = videoBuffer.toString('base64');
    
    const prompt = this.buildDetailedPromptWithContext(eventsSummary, voiceContext);
    
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

    return this.parseResponse(response);
  }
  
  /**
   * Build detailed prompt using voice assistant context
   */
  buildDetailedPromptWithContext(eventsSummary, voiceContext) {
    const conversationHistory = voiceContext.conversation
      .map(q => `Q: ${q.question}\nA: ${q.answer || '(not answered)'}`)
      .join('\n\n');
      
    const actionLog = voiceContext.actionLog
      .map((a, idx) => `${idx + 1}. [${Math.floor(a.timestamp / 1000)}s] ${a.application}: ${a.action}`)
      .join('\n');

    return `You are an expert workflow analyst creating DETAILED, INSTRUCTIONAL workflows. You monitored this recording in real-time and asked clarifying questions.

## Recording Purpose (stated by user):
${voiceContext.context?.purpose || 'Not specified'}

## Interview Q&A During Recording:
${conversationHistory}

## Real-time Action Detection Log:
${actionLog}

## Applications Detected:
${voiceContext.context?.applications?.join(', ') || 'Unknown'}

## Complete Input Events:
${eventsSummary || 'No input events captured.'}

## Your Mission:
Create a workflow guide that treats the reader like a TRAINABLE EMPLOYEE, not a robot. Provide:
1. **WHAT** to do (the action)
2. **HOW** to do it (detailed instructions with UI element locations)  
3. **WHY** to do it (business purpose and reasoning)
4. **WHAT TO EXPECT** (visual feedback and results)

Think like you're training someone who:
- Understands basic computer use
- Needs to know WHERE to find things
- Should understand the PURPOSE of each step
- Can make minor adaptations if things look slightly different

## Required JSON Response Format:
{
  "title": "Clear, descriptive workflow title",
  "description": "Comprehensive overview including business purpose",
  "purpose": "The 'why' - what problem does this workflow solve?",
  "prerequisites": ["Requirements before starting"],
  "applications_used": ["list of applications"],
  "estimated_duration": "Typical time required",
  "difficulty_level": "beginner|intermediate|advanced",
  "steps": [
    {
      "step_number": 1,
      "what": "Brief action summary (e.g., 'Open the customer database')",
      "how": "DETAILED instructions: 'Click the blue database icon in the top-left corner of the screen. It looks like a cylinder with the label Customer DB underneath.'",
      "why": "Explanation: 'We need to access customer records to verify the account status before processing the request.'",
      "what_to_expect": "What happens: 'A new window opens showing a list of customers. The window title should say Customer Database v2.1.'",
      "application": "Application name",
      "action_type": "click|type|navigate|select|copy|paste|wait|verify|scroll",
      "target": "Specific UI element (e.g., 'Submit button', 'Email field')",
      "target_location": "Where to find it (e.g., 'Bottom right corner of the form', 'Under the Name heading')",
      "value": "Data to enter (if applicable)",
      "data_source": "Where this data comes from (e.g., 'from the email you received', 'calculated from Step 3')",
      "screenshot_description": "What the screen should look like",
      "tips": ["Helpful tips", "Common mistakes to avoid"],
      "alternatives": ["Alternative methods if available"]
    }
  ],
  "decision_points": [
    {
      "at_step": "step number",
      "decision": "What decision to make",
      "options": ["option1: description", "option2: description"],
      "how_to_decide": "Criteria for choosing (e.g., 'If amount > $1000, choose option 1')"
    }
  ],
  "data_flow": "Explain what data moves through this workflow and how it's transformed",
  "success_criteria": "How to verify successful completion",
  "troubleshooting": [
    {
      "issue": "Common problem",
      "symptoms": "How to recognize it",
      "solution": "How to fix it",
      "prevention": "How to avoid it next time"
    }
  ],
  "automation_prompt": "Detailed AI agent prompt including reasoning and decision logic",
  "tips_and_tricks": ["General helpful tips for this workflow"],
  "common_mistakes": ["Pitfalls to avoid"],
  "notes": "Additional context"
}

Make every step understandable to someone with basic computer skills who uses their judgment for small variations.`;
  }

  async analyzeWithInlineData(videoBase64, eventsSummary, apiKey) {
    const prompt = this.buildPrompt(eventsSummary);

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
        maxOutputTokens: 8192,
        responseMimeType: 'application/json'
      }
    };

    const response = await this.makeRequest(
      `/v1beta/models/${this.model}:generateContent?key=${apiKey}`,
      requestBody
    );

    return this.parseResponse(response);
  }

  async analyzeWithFileUpload(videoPath, eventsSummary, apiKey) {
    // Step 1: Upload file
    const fileUri = await this.uploadFile(videoPath, apiKey);

    const prompt = this.buildPrompt(eventsSummary);

    const requestBody = {
      contents: [
        {
          parts: [
            {
              fileData: {
                mimeType: 'video/webm',
                fileUri: fileUri
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
        maxOutputTokens: 8192,
        responseMimeType: 'application/json'
      }
    };

    const response = await this.makeRequest(
      `/v1beta/models/${this.model}:generateContent?key=${apiKey}`,
      requestBody
    );

    return this.parseResponse(response);
  }

  async uploadFile(filePath, apiKey) {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    // Start resumable upload
    const startResponse = await this.makeRawRequest(
      'POST',
      `/upload/v1beta/files?key=${apiKey}`,
      JSON.stringify({
        file: {
          displayName: fileName
        }
      }),
      {
        'Content-Type': 'application/json',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Type': 'video/webm',
        'X-Goog-Upload-Header-Content-Length': fileBuffer.length.toString()
      }
    );

    const uploadUrl = startResponse.headers['x-goog-upload-url'];
    if (!uploadUrl) {
      throw new Error('Failed to get upload URL from Gemini API');
    }

    // Upload the file data
    await this.makeRawUpload(uploadUrl, fileBuffer);

    // Return the file URI
    // We need to poll for file processing status
    const filesResponse = await this.makeRequest(`/v1beta/files?key=${apiKey}`, null, 'GET');
    const uploadedFile = filesResponse.files?.find(f => f.displayName === fileName);
    
    if (!uploadedFile) {
      throw new Error('Failed to find uploaded file');
    }

    return uploadedFile.uri;
  }

  buildPrompt(eventsSummary) {
    return `You are an expert workflow analyst and automation engineer. Analyze this screen recording video and the accompanying user input event logs to understand what the user is doing.

## User Input Event Log:
${eventsSummary || 'No input events were captured.'}

## Your Task:
1. **Watch the video carefully** and describe in detail what the user is doing step by step.
2. **Correlate the input events** with what you see in the video.
3. **Generate a comprehensive workflow description** of the tasks performed.
4. **Create detailed automation steps** that could be used to reproduce this workflow automatically using a computer-use AI agent (like OpenClaw/Claude).

## Required JSON Response Format:
{
  "title": "Short descriptive title for this workflow",
  "description": "Detailed narrative description of what the user did in the recording, including which applications were used, what data was entered, what buttons were clicked, etc.",
  "applications_used": ["list", "of", "applications", "seen"],
  "duration_observed": "approximate duration of the workflow",
  "steps": [
    {
      "step_number": 1,
      "action": "Brief action name",
      "description": "Detailed description of this step",
      "application": "Which application/website this step is in",
      "action_type": "click|type|navigate|scroll|keyboard_shortcut|wait|drag|select",
      "target": "What element to interact with (button text, input field name, menu item, etc.)",
      "value": "What to type or select (if applicable)",
      "coordinates": {"x": 0, "y": 0},
      "notes": "Any additional context or conditions for this step"
    }
  ],
  "automation_prompt": "A complete prompt that can be given to an AI computer-use agent to automate this exact workflow. Be very specific about every click, every keystroke, and every navigation action.",
  "complexity": "simple|moderate|complex",
  "estimated_automation_time": "estimated time for the automated version",
  "preconditions": ["list of things that need to be true before running this automation"],
  "potential_issues": ["list of things that might go wrong during automation"]
}

Be extremely detailed and specific in your step descriptions. Each step should contain enough information for an AI agent to reproduce the exact action.`;
  }

  parseResponse(response) {
    try {
      const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('No content in Gemini response');
      }

      // Try to parse JSON
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]);
        } else {
          // Return raw text as description
          parsed = {
            title: 'Recorded Workflow',
            description: text,
            steps: [],
            automation_prompt: text,
            applications_used: [],
            complexity: 'unknown'
          };
        }
      }

      return {
        success: true,
        analysis: parsed
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse Gemini response: ${error.message}`
      };
    }
  }

  makeRequest(urlPath, body, method = 'POST') {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        path: urlPath,
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
            if (res.statusCode >= 400) {
              const errData = JSON.parse(data);
              reject(new Error(`Gemini API error (${res.statusCode}): ${errData.error?.message || data}`));
            } else {
              resolve(JSON.parse(data));
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(300000, () => {
        req.destroy();
        reject(new Error('Request timed out (5 minutes)'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  makeRawRequest(method, urlPath, body, headers) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        path: urlPath,
        method,
        headers: headers || {}
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      });

      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  makeRawUpload(url, buffer) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'PUT',
        headers: {
          'Content-Length': buffer.length,
          'Content-Type': 'video/webm',
          'X-Goog-Upload-Command': 'upload, finalize',
          'X-Goog-Upload-Offset': '0'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
      req.write(buffer);
      req.end();
    });
  }
}

module.exports = GeminiAnalyzer;
