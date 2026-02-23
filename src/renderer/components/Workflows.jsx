import React, { useState, useEffect, useCallback } from 'react';

function Workflows({ onNavigateToRecorder, reloadTrigger, gatewayStatus }) {
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [history, setHistory] = useState([]);
  const [view, setView] = useState('list'); // list, detail, edit, history, running
  const [editData, setEditData] = useState(null);
  const [runStatus, setRunStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadWorkflows();
  }, []);

  // Reload workflows when reloadTrigger changes (e.g., when a new workflow is created)
  useEffect(() => {
    if (reloadTrigger > 0) {
      loadWorkflows();
    }
  }, [reloadTrigger]);

  const loadWorkflows = async () => {
    setLoading(true);
    try {
      const wfs = await window.electronAPI.listWorkflows();
      setWorkflows(wfs);
    } catch (err) {
      console.error('Failed to load workflows:', err);
    }
    setLoading(false);
  };

  const loadHistory = async (workflowId = null) => {
    try {
      const h = await window.electronAPI.getWorkflowHistory(workflowId);
      setHistory(h);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const selectWorkflow = async (wf) => {
    setSelectedWorkflow(wf);
    await loadHistory(wf.id);
    setView('detail');
  };

  const editWorkflow = (wf) => {
    setEditData(JSON.parse(JSON.stringify(wf))); // Deep clone
    setView('edit');
  };

  const saveEdit = async () => {
    try {
      const result = await window.electronAPI.updateWorkflow(editData.id, editData);
      if (result.success) {
        setSelectedWorkflow(result.workflow);
        await loadWorkflows();
        setView('detail');
      }
    } catch (err) {
      console.error('Failed to save workflow:', err);
    }
  };

  const deleteWorkflow = async (id) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    try {
      await window.electronAPI.deleteWorkflow(id);
      await loadWorkflows();
      setSelectedWorkflow(null);
      setView('list');
    } catch (err) {
      console.error('Failed to delete workflow:', err);
    }
  };

  const duplicateWorkflow = async (id) => {
    try {
      const result = await window.electronAPI.duplicateWorkflow(id);
      if (result.success) {
        await loadWorkflows();
      }
    } catch (err) {
      console.error('Failed to duplicate workflow:', err);
    }
  };

  const startGateway = async () => {
    try {
      await window.electronAPI.startGateway();
    } catch (err) {
      console.error('Failed to start gateway:', err);
    }
  };

  const runWorkflow = async (workflow) => {
    setView('running');
    setRunStatus({
      status: 'starting',
      step: 0,
      totalSteps: workflow.steps?.length || 0,
      logs: ['Starting workflow automation...']
    });

    try {
      // Check gateway status first
      if (gatewayStatus !== 'running') {
        setRunStatus(prev => ({
          ...prev,
          logs: [...prev.logs, 'Gateway not running. Starting gateway...']
        }));
      }

      // Generate the automation prompt
      const prompt = await window.electronAPI.generateAutomationPrompt(workflow.id);
      
      setRunStatus(prev => ({
        ...prev,
        status: 'running',
        logs: [...prev.logs, 'Sending automation prompt to NeurAI...']
      }));

      // Send to OpenClaw gateway
      const result = await window.electronAPI.runWorkflowAutomation(workflow.id, prompt);

      if (result.success) {
        setRunStatus(prev => ({
          ...prev,
          status: 'completed',
          logs: [...prev.logs, 'Workflow automation completed successfully!', ...(result.logs || [])]
        }));
      } else {
        setRunStatus(prev => ({
          ...prev,
          status: 'failed',
          logs: [...prev.logs, `Error: ${result.error}`]
        }));
      }

      // Refresh history
      await loadHistory(workflow.id);
      await loadWorkflows();
    } catch (err) {
      setRunStatus(prev => ({
        ...prev,
        status: 'failed',
        logs: [...prev.logs, `Error: ${err.message}`]
      }));
    }
  };

  const viewAllHistory = async () => {
    await loadHistory();
    setView('history');
  };

  const filteredWorkflows = workflows.filter(wf => {
    const matchesSearch = !searchQuery || 
      wf.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wf.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === 'all' || wf.complexity === filter;
    return matchesSearch && matchesFilter;
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // ==================== LIST VIEW ====================
  if (view === 'list') {
    return (
      <div>
        <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Workflows</h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              Manage and run your automated workflows
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={viewAllHistory}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
              </svg>
              History
            </button>
            <button className="btn btn-primary" onClick={onNavigateToRecorder}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="12" r="8"/>
              </svg>
              New Recording
            </button>
          </div>
        </div>

        {/* Search and Filter */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="text"
              placeholder="Search workflows..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input-field"
              style={{ width: '100%', paddingLeft: 36 }}
            />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </div>
          <select 
            value={filter} 
            onChange={e => setFilter(e.target.value)}
            className="input-field"
            style={{ width: 160 }}
          >
            <option value="all">All Complexity</option>
            <option value="simple">Simple</option>
            <option value="moderate">Moderate</option>
            <option value="complex">Complex</option>
          </select>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 16px' }}></div>
            <p style={{ color: 'var(--text-secondary)' }}>Loading workflows...</p>
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 60 }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ marginBottom: 16, opacity: 0.5 }}>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
            <h3 style={{ marginBottom: 8 }}>No Workflows Yet</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
              Record your screen to create your first automated workflow
            </p>
            <button className="btn btn-primary" onClick={onNavigateToRecorder}>Create First Workflow</button>
          </div>
        ) : (
          <div className="workflow-grid">
            {filteredWorkflows.map(wf => (
              <div key={wf.id} className="workflow-card" onClick={() => selectWorkflow(wf)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, flex: 1, marginRight: 8 }}>{wf.title}</h3>
                  <span className={`complexity-badge ${wf.complexity}`}>{wf.complexity}</span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {wf.description}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span className="info-tag" style={{ fontSize: 11 }}>{wf.steps?.length || 0} steps</span>
                    {wf.runCount > 0 && <span className="info-tag" style={{ fontSize: 11 }}>{wf.runCount} runs</span>}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(wf.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ==================== DETAIL VIEW ====================
  if (view === 'detail' && selectedWorkflow) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <button className="btn btn-secondary" onClick={() => { setSelectedWorkflow(null); setView('list'); }} style={{ marginBottom: 16 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12,19 5,12 12,5"/>
            </svg>
            Back to Workflows
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{selectedWorkflow.title}</h1>
              <p style={{ color: 'var(--text-secondary)' }}>Created {formatDate(selectedWorkflow.createdAt)}</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => duplicateWorkflow(selectedWorkflow.id)}>Duplicate</button>
              <button className="btn btn-secondary" onClick={() => editWorkflow(selectedWorkflow)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit
              </button>
              <button className="btn btn-danger" onClick={() => deleteWorkflow(selectedWorkflow.id)} style={{ padding: '6px 12px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
              </button>
              <div style={{ position: 'relative' }}>
                <button className="btn btn-success" style={{ fontSize: 15, padding: '8px 24px' }} onClick={() => runWorkflow(selectedWorkflow)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5,3 19,12 5,21"/>
                  </svg>
                  Run with NeurAI
                </button>
                {gatewayStatus !== 'running' && (
                  <span style={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    background: 'var(--accent-warning)',
                    color: '#000',
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 10,
                    fontWeight: 600
                  }}>Gateway Off</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-4" style={{ marginBottom: 24 }}>
          <div className="stat-card" style={{ padding: 16 }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4 }}>Complexity</div>
            <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{selectedWorkflow.complexity}</div>
          </div>
          <div className="stat-card" style={{ padding: 16 }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4 }}>Steps</div>
            <div style={{ fontWeight: 600 }}>{selectedWorkflow.steps?.length || 0}</div>
          </div>
          <div className="stat-card" style={{ padding: 16 }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4 }}>Times Run</div>
            <div style={{ fontWeight: 600 }}>{selectedWorkflow.runCount || 0}</div>
          </div>
          <div className="stat-card" style={{ padding: 16 }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4 }}>Last Run</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{selectedWorkflow.lastRunAt ? formatDate(selectedWorkflow.lastRunAt) : 'Never'}</div>
          </div>
        </div>

        {/* Description */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 className="card-title" style={{ marginBottom: 12 }}>Description</h3>
          <p style={{ lineHeight: 1.7, color: 'var(--text-secondary)' }}>{selectedWorkflow.description}</p>
          
          {selectedWorkflow.applications_used?.length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Applications:</span>
              {selectedWorkflow.applications_used.map((app, i) => (
                <span key={i} className="info-tag">{app}</span>
              ))}
            </div>
          )}

          {selectedWorkflow.preconditions?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 13, display: 'block', marginBottom: 8 }}>Preconditions:</span>
              <ul style={{ paddingLeft: 20, color: 'var(--text-secondary)', fontSize: 13 }}>
                {selectedWorkflow.preconditions.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}
        </div>

        {/* Steps */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 className="card-title" style={{ marginBottom: 16 }}>Automation Steps</h3>
          <div className="workflow-steps-preview">
            {(selectedWorkflow.steps || []).map((step, i) => (
              <div key={i} className="workflow-step-card">
                <div className="step-number">{step.step_number || i + 1}</div>
                <div className="step-content">
                  <div className="step-action">{step.action}</div>
                  <div className="step-description">{step.description}</div>
                  <div className="step-meta">
                    {step.action_type && <span className="step-tag">{step.action_type}</span>}
                    {step.application && <span className="step-tag">{step.application}</span>}
                    {step.target && <span className="step-tag target">Target: {step.target}</span>}
                    {step.value && <span className="step-tag value">Value: {step.value}</span>}
                  </div>
                  {step.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>{step.notes}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Run History */}
        {history.length > 0 && (
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 16 }}>Recent Runs</h3>
            <div className="history-list">
              {history.slice(0, 5).map(run => (
                <div key={run.id} className="history-item">
                  <div className={`status-dot ${run.status === 'completed' ? 'success' : run.status === 'failed' ? 'danger' : 'warning'}`}></div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{run.status}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 8 }}>
                      {formatDate(run.startedAt)}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {run.stepsCompleted}/{run.totalSteps} steps
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== EDIT VIEW ====================
  if (view === 'edit' && editData) {
    return (
      <div>
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <button className="btn btn-secondary" onClick={() => setView('detail')} style={{ marginBottom: 12 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12,19 5,12 12,5"/>
              </svg>
              Cancel
            </button>
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>Edit Workflow</h1>
          </div>
          <button className="btn btn-success" onClick={saveEdit}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20,6 9,17 4,12"/>
            </svg>
            Save Changes
          </button>
        </div>

        {/* Basic Info */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 className="card-title" style={{ marginBottom: 16 }}>Basic Information</h3>
          <div style={{ marginBottom: 16 }}>
            <label className="input-label">Title</label>
            <input
              type="text"
              className="input-field"
              value={editData.title}
              onChange={e => setEditData({ ...editData, title: e.target.value })}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="input-label">Description</label>
            <textarea
              className="input-field"
              value={editData.description}
              onChange={e => setEditData({ ...editData, description: e.target.value })}
              rows={4}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="input-label">Automation Prompt (sent to NeurAI)</label>
            <textarea
              className="input-field"
              value={editData.automation_prompt}
              onChange={e => setEditData({ ...editData, automation_prompt: e.target.value })}
              rows={6}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
            />
          </div>
        </div>

        {/* Edit Steps */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h3 className="card-title">Steps ({editData.steps?.length || 0})</h3>
            <button className="btn btn-secondary" onClick={() => {
              const steps = [...(editData.steps || [])];
              steps.push({
                step_number: steps.length + 1,
                action: 'New Step',
                description: '',
                application: '',
                action_type: 'click',
                target: '',
                value: '',
                notes: ''
              });
              setEditData({ ...editData, steps });
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Step
            </button>
          </div>
          
          {(editData.steps || []).map((step, i) => (
            <div key={i} className="edit-step-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>Step {i + 1}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {i > 0 && (
                    <button className="btn-icon" onClick={() => {
                      const steps = [...editData.steps];
                      [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]];
                      steps.forEach((s, idx) => s.step_number = idx + 1);
                      setEditData({ ...editData, steps });
                    }} title="Move up">↑</button>
                  )}
                  {i < (editData.steps.length - 1) && (
                    <button className="btn-icon" onClick={() => {
                      const steps = [...editData.steps];
                      [steps[i], steps[i + 1]] = [steps[i + 1], steps[i]];
                      steps.forEach((s, idx) => s.step_number = idx + 1);
                      setEditData({ ...editData, steps });
                    }} title="Move down">↓</button>
                  )}
                  <button className="btn-icon danger" onClick={() => {
                    const steps = editData.steps.filter((_, idx) => idx !== i);
                    steps.forEach((s, idx) => s.step_number = idx + 1);
                    setEditData({ ...editData, steps });
                  }} title="Delete">×</button>
                </div>
              </div>
              <div className="edit-step-grid">
                <div>
                  <label className="input-label">Action</label>
                  <input className="input-field" value={step.action} onChange={e => {
                    const steps = [...editData.steps];
                    steps[i] = { ...steps[i], action: e.target.value };
                    setEditData({ ...editData, steps });
                  }} style={{ width: '100%' }} />
                </div>
                <div>
                  <label className="input-label">Type</label>
                  <select className="input-field" value={step.action_type} onChange={e => {
                    const steps = [...editData.steps];
                    steps[i] = { ...steps[i], action_type: e.target.value };
                    setEditData({ ...editData, steps });
                  }} style={{ width: '100%' }}>
                    <option value="click">Click</option>
                    <option value="type">Type</option>
                    <option value="navigate">Navigate</option>
                    <option value="scroll">Scroll</option>
                    <option value="keyboard_shortcut">Keyboard Shortcut</option>
                    <option value="wait">Wait</option>
                    <option value="drag">Drag</option>
                    <option value="select">Select</option>
                  </select>
                </div>
                <div>
                  <label className="input-label">Application</label>
                  <input className="input-field" value={step.application || ''} onChange={e => {
                    const steps = [...editData.steps];
                    steps[i] = { ...steps[i], application: e.target.value };
                    setEditData({ ...editData, steps });
                  }} style={{ width: '100%' }} />
                </div>
                <div>
                  <label className="input-label">Target</label>
                  <input className="input-field" value={step.target || ''} onChange={e => {
                    const steps = [...editData.steps];
                    steps[i] = { ...steps[i], target: e.target.value };
                    setEditData({ ...editData, steps });
                  }} style={{ width: '100%' }} />
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <label className="input-label">Description</label>
                <textarea className="input-field" value={step.description} onChange={e => {
                  const steps = [...editData.steps];
                  steps[i] = { ...steps[i], description: e.target.value };
                  setEditData({ ...editData, steps });
                }} rows={2} style={{ width: '100%', resize: 'vertical' }} />
              </div>
              <div className="edit-step-grid" style={{ marginTop: 8 }}>
                <div>
                  <label className="input-label">Value / Input</label>
                  <input className="input-field" value={step.value || ''} onChange={e => {
                    const steps = [...editData.steps];
                    steps[i] = { ...steps[i], value: e.target.value };
                    setEditData({ ...editData, steps });
                  }} style={{ width: '100%' }} />
                </div>
                <div>
                  <label className="input-label">Notes</label>
                  <input className="input-field" value={step.notes || ''} onChange={e => {
                    const steps = [...editData.steps];
                    steps[i] = { ...steps[i], notes: e.target.value };
                    setEditData({ ...editData, steps });
                  }} style={{ width: '100%' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ==================== RUNNING VIEW ====================
  if (view === 'running' && runStatus) {
    return (
      <div>
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Running Workflow</h1>
            <p style={{ color: 'var(--text-secondary)' }}>{selectedWorkflow?.title}</p>
          </div>
          {(runStatus.status === 'running' || runStatus.status === 'starting') && (
            <button 
              className="btn btn-primary" 
              onClick={() => window.electronAPI.openInAppWindow('http://localhost:18789')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                <polyline points="15,3 21,3 21,9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Watch in Web View
            </button>
          )}
        </div>

        <div className="card" style={{ textAlign: 'center', padding: 40, marginBottom: 20 }}>
          {runStatus.status === 'starting' || runStatus.status === 'running' ? (
            <>
              <div className="spinner" style={{ width: 48, height: 48, margin: '0 auto 20px' }}></div>
              <h2 style={{ marginBottom: 8 }}>
                {runStatus.status === 'starting' ? 'Preparing...' : 'Automation Running'}
              </h2>
              <p style={{ color: 'var(--text-secondary)' }}>
                NeurAI is executing the workflow steps
              </p>
            </>
          ) : runStatus.status === 'completed' ? (
            <>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" strokeWidth="2" style={{ marginBottom: 16 }}>
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/>
              </svg>
              <h2 style={{ color: 'var(--accent-success)', marginBottom: 8 }}>Workflow Completed</h2>
              <p style={{ color: 'var(--text-secondary)' }}>All steps executed successfully</p>
            </>
          ) : (
            <>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--accent-danger)" strokeWidth="2" style={{ marginBottom: 16 }}>
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              <h2 style={{ color: 'var(--accent-danger)', marginBottom: 8 }}>Workflow Failed</h2>
              <p style={{ color: 'var(--text-secondary)' }}>An error occurred during execution</p>
            </>
          )}
        </div>

        {/* Execution Logs */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 className="card-title" style={{ marginBottom: 12 }}>Execution Log</h3>
          <div className="execution-log">
            {runStatus.logs.map((log, i) => (
              <div key={i} className="log-entry">
                <span className="log-time">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span>{log}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setView('detail')}>Back to Workflow</button>
          {runStatus.status !== 'running' && runStatus.status !== 'starting' && (
            <button className="btn btn-primary" onClick={() => runWorkflow(selectedWorkflow)}>Run Again</button>
          )}
        </div>
      </div>
    );
  }

  // ==================== HISTORY VIEW ====================
  if (view === 'history') {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <button className="btn btn-secondary" onClick={() => setView('list')} style={{ marginBottom: 12 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12,19 5,12 12,5"/>
            </svg>
            Back
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Workflow History</h1>
          <p style={{ color: 'var(--text-secondary)' }}>All workflow execution history</p>
        </div>

        {history.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: 'var(--text-secondary)' }}>No run history yet. Run a workflow to see results here.</p>
          </div>
        ) : (
          <div className="card">
            <div className="history-list">
              {history.map(run => {
                const wf = workflows.find(w => w.id === run.workflowId);
                return (
                  <div key={run.id} className="history-item detailed">
                    <div className={`status-indicator ${run.status}`}></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, marginBottom: 4 }}>{wf?.title || 'Unknown Workflow'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {formatDate(run.startedAt)} &middot; {run.stepsCompleted}/{run.totalSteps} steps &middot; {run.status}
                      </div>
                      {run.error && (
                        <div style={{ fontSize: 12, color: 'var(--accent-danger)', marginTop: 4 }}>{run.error}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

export default Workflows;
