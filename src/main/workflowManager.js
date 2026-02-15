const fs = require('fs');
const path = require('path');
const os = require('os');

class WorkflowManager {
  constructor() {
    this.workflowsDir = path.join(os.homedir(), '.openclaw', 'workflows');
    this.historyDir = path.join(os.homedir(), '.openclaw', 'workflow_history');
    this.ensureDirs();
  }

  ensureDirs() {
    if (!fs.existsSync(this.workflowsDir)) {
      fs.mkdirSync(this.workflowsDir, { recursive: true });
    }
    if (!fs.existsSync(this.historyDir)) {
      fs.mkdirSync(this.historyDir, { recursive: true });
    }
  }

  generateId() {
    return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save a new workflow from Gemini analysis result
   */
  saveWorkflow(analysis, recordingId) {
    const id = this.generateId();
    const workflow = {
      id,
      title: analysis.title || 'Untitled Workflow',
      description: analysis.description || '',
      steps: analysis.steps || [],
      automation_prompt: analysis.automation_prompt || '',
      applications_used: analysis.applications_used || [],
      complexity: analysis.complexity || 'unknown',
      estimated_automation_time: analysis.estimated_automation_time || '',
      preconditions: analysis.preconditions || [],
      potential_issues: analysis.potential_issues || [],
      recordingId: recordingId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runCount: 0,
      lastRunAt: null
    };

    const filePath = path.join(this.workflowsDir, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(workflow, null, 2));
    return workflow;
  }

  /**
   * Get all saved workflows
   */
  listWorkflows() {
    this.ensureDirs();
    const files = fs.readdirSync(this.workflowsDir).filter(f => f.endsWith('.json'));
    return files.map(f => {
      try {
        const content = fs.readFileSync(path.join(this.workflowsDir, f), 'utf8');
        return JSON.parse(content);
      } catch {
        return null;
      }
    }).filter(Boolean).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Get a single workflow by ID
   */
  getWorkflow(id) {
    const filePath = path.join(this.workflowsDir, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  /**
   * Update a workflow (edit steps, title, description, etc.)
   */
  updateWorkflow(id, updates) {
    const workflow = this.getWorkflow(id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    const updated = {
      ...workflow,
      ...updates,
      id, // Don't allow ID change
      updatedAt: new Date().toISOString()
    };

    const filePath = path.join(this.workflowsDir, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
    return { success: true, workflow: updated };
  }

  /**
   * Delete a workflow
   */
  deleteWorkflow(id) {
    const filePath = path.join(this.workflowsDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { success: true };
    }
    return { success: false, error: 'Workflow not found' };
  }

  /**
   * Duplicate a workflow
   */
  duplicateWorkflow(id) {
    const workflow = this.getWorkflow(id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    const newId = this.generateId();
    const duplicate = {
      ...workflow,
      id: newId,
      title: `${workflow.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runCount: 0,
      lastRunAt: null
    };

    const filePath = path.join(this.workflowsDir, `${newId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(duplicate, null, 2));
    return { success: true, workflow: duplicate };
  }

  /**
   * Record a workflow run in history
   */
  recordRun(workflowId, result) {
    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const runRecord = {
      id: runId,
      workflowId,
      status: result.status || 'completed', // 'completed', 'failed', 'cancelled'
      startedAt: result.startedAt || new Date().toISOString(),
      completedAt: new Date().toISOString(),
      duration: result.duration || 0,
      stepsCompleted: result.stepsCompleted || 0,
      totalSteps: result.totalSteps || 0,
      error: result.error || null,
      logs: result.logs || []
    };

    const filePath = path.join(this.historyDir, `${runId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(runRecord, null, 2));

    // Update workflow run count
    const workflow = this.getWorkflow(workflowId);
    if (workflow) {
      this.updateWorkflow(workflowId, {
        runCount: (workflow.runCount || 0) + 1,
        lastRunAt: new Date().toISOString()
      });
    }

    return runRecord;
  }

  /**
   * Get run history for a specific workflow or all workflows
   */
  getHistory(workflowId = null) {
    this.ensureDirs();
    const files = fs.readdirSync(this.historyDir).filter(f => f.endsWith('.json'));
    let records = files.map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(this.historyDir, f), 'utf8'));
      } catch {
        return null;
      }
    }).filter(Boolean);

    if (workflowId) {
      records = records.filter(r => r.workflowId === workflowId);
    }

    return records.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  }

  /**
   * Generate an OpenClaw-compatible automation prompt from workflow
   */
  generateAutomationPrompt(workflow) {
    if (!workflow) return '';

    let prompt = `# Automation Task: ${workflow.title}\n\n`;
    prompt += `## Description\n${workflow.description}\n\n`;

    if (workflow.preconditions?.length > 0) {
      prompt += `## Preconditions\n`;
      workflow.preconditions.forEach(p => {
        prompt += `- ${p}\n`;
      });
      prompt += '\n';
    }

    prompt += `## Steps to Execute\n`;
    (workflow.steps || []).forEach((step, i) => {
      prompt += `\n### Step ${step.step_number || i + 1}: ${step.action}\n`;
      prompt += `${step.description}\n`;
      if (step.application) prompt += `- Application: ${step.application}\n`;
      if (step.action_type) prompt += `- Action Type: ${step.action_type}\n`;
      if (step.target) prompt += `- Target Element: ${step.target}\n`;
      if (step.value) prompt += `- Value/Input: ${step.value}\n`;
      if (step.notes) prompt += `- Notes: ${step.notes}\n`;
    });

    if (workflow.automation_prompt) {
      prompt += `\n## Additional Automation Instructions\n${workflow.automation_prompt}\n`;
    }

    return prompt;
  }

  /**
   * Clear all history
   */
  clearHistory(workflowId = null) {
    this.ensureDirs();
    const files = fs.readdirSync(this.historyDir).filter(f => f.endsWith('.json'));
    
    for (const f of files) {
      if (workflowId) {
        try {
          const record = JSON.parse(fs.readFileSync(path.join(this.historyDir, f), 'utf8'));
          if (record.workflowId === workflowId) {
            fs.unlinkSync(path.join(this.historyDir, f));
          }
        } catch {}
      } else {
        fs.unlinkSync(path.join(this.historyDir, f));
      }
    }
    return { success: true };
  }
}

module.exports = WorkflowManager;
