document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const modelSelect = document.getElementById('model-select');
  const apiKeyContainer = document.getElementById('api-key-container');
  const apiKeyInput = document.getElementById('api-key');
  const maxTokensInput = document.getElementById('max-tokens');
  const temperatureInput = document.getElementById('temperature');
  const temperatureValue = document.getElementById('temperature-value');
  const contextSizeInput = document.getElementById('context-size');
  const openFileBtn = document.getElementById('open-file-btn');
  const fileListEl = document.getElementById('file-list');
  const explainBtn = document.getElementById('explain-btn');
  const explanationContent = document.getElementById('explanation-content');
  const latencyDisplay = document.getElementById('latency-display');
  const cacheStatus = document.getElementById('cache-status');
  const statusEl = document.getElementById('status');
  const clearCacheBtn = document.getElementById('clear-cache-btn');

  if (apiKeyContainer) {
    apiKeyContainer.style.display = 'flex';
  }
  // Rate limit status element
  let rateLimitStatus = document.createElement('div');
  rateLimitStatus.id = 'rate-limit-status';
  rateLimitStatus.className = 'rate-limit-status';
  document.querySelector('.model-controls').appendChild(rateLimitStatus);

  // State management
  let files = {};
  let activeFile = null;
  let editor = null;
  
  // Define global dragEvent to fix the error
  let dragEvent = null;
  
  // Initialize Monaco Editor
  require.config({ paths: { 'vs': 'monaco-editor/min/vs' }});
  require(['vs/editor/editor.main'], function() {
    editor = monaco.editor.create(document.getElementById('editor'), {
      value: '',
      language: 'javascript',
      theme: 'vs',
      automaticLayout: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      readOnly: false
    });
    
    // Listen for content changes to enable/disable explain button
    editor.onDidChangeModelContent(() => {
      explainBtn.disabled = editor.getValue().trim().length === 0;
    });
  });

  // Temperature slider update
  temperatureInput.addEventListener('input', () => {
    temperatureValue.textContent = temperatureInput.value;
  });

  // Load available models
  async function loadModels() {
    try {
      const modelStatus = await window.api.checkModels();
      console.log('Model status received:', modelStatus);
      // Cache model backends for use in UI
      window.modelBackends = modelStatus;
      
      // Clear existing options
      modelSelect.innerHTML = '';
      
      // Create model download container if it doesn't exist
      let modelDownloadContainer = document.getElementById('model-download-container');
      if (!modelDownloadContainer) {
        modelDownloadContainer = document.createElement('div');
        modelDownloadContainer.id = 'model-download-container';
        modelDownloadContainer.className = 'model-download-container';
        document.querySelector('.model-controls').appendChild(modelDownloadContainer);
      } else {
        modelDownloadContainer.innerHTML = '';
      }
      
      // Add options for each model
      for (const [key, model] of Object.entries(modelStatus)) {
        // Add to dropdown
        const option = document.createElement('option');
        option.value = key;
        
        // For API models, they're always available but need an API key
        if (model.isApi) {
          option.textContent = `${model.name} (API)`;
          option.disabled = false;
        } else {
          option.textContent = `${model.name} ${model.installed ? '' : '(Not Installed)'}`;
          option.disabled = !model.installed;
        }
        
        modelSelect.appendChild(option);
        
        // Select first available model
        if ((model.installed || model.isApi) && !modelSelect.value) {
          modelSelect.value = key;
          
          // Show/hide API key input based on selected model
          if (model.requiresApiKey) {
            apiKeyContainer.style.display = 'flex';
            // Context size isn't used for API models
            document.querySelector('label[for="context-size"]').parentNode.style.display = 'none';
          } else {
            apiKeyContainer.style.display = 'none';
            document.querySelector('label[for="context-size"]').parentNode.style.display = 'flex';
          }
        }
        
        // Add download button for models that are not installed (except API models)
        if (!model.installed && !model.isApi) {
          const downloadBtn = document.createElement('button');
          downloadBtn.textContent = `Download ${model.name}`;
          downloadBtn.className = 'download-model-btn';
          downloadBtn.dataset.modelKey = key;
          
          downloadBtn.addEventListener('click', async (e) => {
            const modelKey = e.target.dataset.modelKey;
            e.target.disabled = true;
            e.target.textContent = `Downloading ${modelStatus[modelKey].name}...`;
            
            try {
              const result = await window.api.downloadModel(modelKey);
              if (result.success) {
                setStatus(result.message, false);
                // Refresh model list
                await loadModels();
              } else {
                setStatus(result.message, true);
                e.target.disabled = false;
                e.target.textContent = `Download ${modelStatus[modelKey].name}`;
              }
            } catch (error) {
              console.error('Error downloading model:', error);
              setStatus(`Error downloading model: ${error.message}`, true);
              e.target.disabled = false;
              e.target.textContent = `Download ${modelStatus[modelKey].name}`;
            }
          });
          
          modelDownloadContainer.appendChild(downloadBtn);
        }
      }
      
      if (!modelSelect.value) {
        setStatus('No models installed. Please install at least one model.', true);
        explainBtn.disabled = true;
      }
    } catch (error) {
      console.error('Error loading models:', error);
      setStatus('Error loading models. Check console for details.', true);
    }
  }

  // Open files handler
  openFileBtn.addEventListener('click', async () => {
    try {
      const result = await window.api.selectFiles();
      
      if (result.filePaths && result.filePaths.length > 0) {
        // Store file contents
        files = { ...files, ...result.fileContents };
        
        // Update file list
        updateFileList();
        
        // Activate the first file
        if (!activeFile) {
          activateFile(result.filePaths[0]);
        }
        
        setStatus(`Loaded ${result.filePaths.length} file(s)`, false);
      }
    } catch (error) {
      console.error('Error opening files:', error);
      setStatus('Error opening files. Check console for details.', true);
    }
  });

  // Update file list in sidebar
  function updateFileList() {
    fileListEl.innerHTML = '';
    
    Object.keys(files).forEach(filePath => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      if (filePath === activeFile) {
        fileItem.classList.add('active');
      }
      
      // Display filename rather than full path
      const fileName = filePath.split(/[/\\]/).pop();
      fileItem.textContent = fileName;
      fileItem.title = filePath; // Show full path on hover
      
      // Add click handler to activate file
      fileItem.addEventListener('click', () => {
        activateFile(filePath);
      });
      
      fileListEl.appendChild(fileItem);
    });
  }

  // Activate a file
  function activateFile(filePath) {
    if (!files[filePath]) return;
    
    // Update active file
    activeFile = filePath;
    
    // Update file list UI
    const fileItems = document.querySelectorAll('.file-item');
    fileItems.forEach(item => {
      item.classList.remove('active');
      if (item.title === filePath) {
        item.classList.add('active');
      }
    });
    
    // Determine language based on file extension
    const fileName = filePath.split(/[/\\]/).pop();
    const extension = fileName.split('.').pop().toLowerCase();
    let language = 'plaintext';
    
    const languageMap = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'cs': 'csharp',
      'go': 'go',
      'rs': 'rust',
      'php': 'php',
      'rb': 'ruby',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'xml': 'xml',
      'md': 'markdown',
      'sh': 'shell',
      'sql': 'sql'
    };
    
    if (languageMap[extension]) {
      language = languageMap[extension];
    }
    
    // Update editor content and language
    const model = monaco.editor.createModel(files[filePath], language);
    editor.setModel(model);
    
    // Enable explain button if content is not empty
    explainBtn.disabled = editor.getValue().trim().length === 0;
    
    // Clear previous explanation
    explanationContent.innerHTML = '';
    latencyDisplay.textContent = 'Latency: N/A';
    cacheStatus.textContent = '';
    
    setStatus(`Loaded file: ${fileName}`, false);
  }

  // Explain code handler
  explainBtn.addEventListener('click', async () => {
    if (!editor) return;
    
    const code = editor.getValue();
    if (!code.trim()) {
      setStatus('No code to explain.', true);
      return;
    }
    
    // Get selected model
    const selectedModel = modelSelect.value;
    const modelInfo = selectedModel ? window.modelBackends?.[selectedModel] : null;
    
    // Get model configuration
    const modelConfig = {
      backend: selectedModel,
      maxTokens: parseInt(maxTokensInput.value),
      temperature: parseFloat(temperatureInput.value),
      contextSize: parseInt(contextSizeInput.value)
    };
    // Add this right after the model selection event listener
    console.log('Model selected:', selectedModel);
    console.log('Model info:', modelInfo);
    console.log('API key container:', apiKeyContainer);
    // Add API key for API-based models
    const apiKey = apiKeyInput.value.trim();
    if (modelInfo && modelInfo.requiresApiKey && !apiKey) {
      setStatus('API key is required for this model.', true);
      return;
    }
    modelConfig.apiKey = apiKey;
    
    // Show loading state
    setStatus('Generating explanation...', false);
    explanationContent.innerHTML = '<div class="loading"></div>';
    explanationContent.classList.add('loading');
    explainBtn.disabled = true;
    
    try {
      const result = await window.api.explainCode({ code, modelConfig });
      
      // Update UI with results
      explanationContent.classList.remove('loading');
      
      if (result.error) {
        explanationContent.innerHTML = `<div class="error-message">${result.error}</div>`;
        setStatus('Error generating explanation.', true);
      } else {
        // Format the explanation with markdown
        explanationContent.innerHTML = result.explanation;
        
        // Update performance metrics
        latencyDisplay.textContent = `Latency: ${result.latency.toFixed(2)}s`;
        
        if (result.fromCache) {
          cacheStatus.textContent = '(Cached)';
          cacheStatus.classList.add('cached');
        } else {
          cacheStatus.textContent = '';
          cacheStatus.classList.remove('cached');
        }
        
        setStatus('Explanation generated successfully.', false);
        
        // Update rate limit status for API models
        if (modelInfo && modelInfo.isApi) {
          updateRateLimitStatus();
        }
      }
    } catch (error) {
      console.error('Error generating explanation:', error);
      explanationContent.classList.remove('loading');
      explanationContent.innerHTML = `<div class="error-message">Failed to generate explanation: ${error.message}</div>`;
      setStatus('Error generating explanation.', true);
    } finally {
      explainBtn.disabled = false;
    }
  });

  // Clear cache handler
  clearCacheBtn.addEventListener('click', async () => {
    try {
      const result = await window.api.clearCache();
      if (result.success) {
        setStatus('Cache cleared successfully.', false);
      } else {
        setStatus('Failed to clear cache.', true);
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
      setStatus('Error clearing cache.', true);
    }
  });

  // Status message helper
  function setStatus(message, isError) {
    statusEl.textContent = message;
    if (isError) {
      statusEl.classList.add('error-message');
    } else {
      statusEl.classList.remove('error-message');
    }
  }
  
  // Rate limit status update
  async function updateRateLimitStatus() {
    const selectedModel = modelSelect.value;
    const modelInfo = selectedModel ? window.modelBackends[selectedModel] : null;
    
    if (modelInfo && modelInfo.isApi) {
      try {
        const result = await window.api.getRateLimitStatus(selectedModel);
        if (result.success) {
          const data = result.data;
          rateLimitStatus.innerHTML = `
            <div class="rate-limit-info">
              <div>API Usage: ${data.current_minute_requests}/${data.requests_per_minute} requests/min (${Math.round(data.minute_limit_percentage)}%)</div>
              <div>Token Usage: ${Math.round(data.current_minute_tokens/1000)}k/${Math.round(data.tokens_per_minute/1000)}k tokens/min</div>
            </div>
          `;
          rateLimitStatus.style.display = 'block';
        } else {
          rateLimitStatus.style.display = 'none';
        }
      } catch (error) {
        console.error('Error updating rate limit status:', error);
        rateLimitStatus.style.display = 'none';
      }
    } else {
      rateLimitStatus.style.display = 'none';
    }
  }

  // Initialize the app
  loadModels();
  
  // Add event listener for model selection change
  // Add event listener for model selection change
  modelSelect.addEventListener('change', () => {
    const selectedModel = modelSelect.value;
    const modelInfo = window.modelBackends ? window.modelBackends[selectedModel] : null;
    
    console.log('Model selected:', selectedModel);
    console.log('Model info:', modelInfo);
    
    // Always show API key input for Claude model specifically
    if (selectedModel === 'claude' || (modelInfo && modelInfo.requiresApiKey)) {
      console.log('Showing API key input field');
      apiKeyContainer.style.display = 'flex';
      
      // Context size isn't used for API models
      const contextSizeContainer = document.querySelector('label[for="context-size"]').parentNode;
      if (contextSizeContainer) {
        contextSizeContainer.style.display = 'none';
      }
    } else {
      console.log('Hiding API key input field');
      apiKeyContainer.style.display = 'none';
      
      const contextSizeContainer = document.querySelector('label[for="context-size"]').parentNode;
      if (contextSizeContainer) {
        contextSizeContainer.style.display = 'flex';
      }
    }
  });

  // Add dragEvent handlers to fix the error
  document.addEventListener('dragover', (event) => {
    window.dragEvent = event;
    event.preventDefault();
    return false;
  });

  document.addEventListener('drop', (event) => {
    window.dragEvent = event;
    event.preventDefault();
    return false;
  });
});