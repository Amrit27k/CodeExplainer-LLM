// Description: Main process for Electron app that handles file selection, model management, and code explanation using various models.
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const NodeCache = require('node-cache');

// Initialize cache with 1 hour TTL
const explanationCache = new NodeCache({ stdTTL: 3600 });

// Keep a global reference of the window object
let mainWindow;

// Store available model backends
const modelBackends = {
  'tinyllama': {
    name: 'TinyLlama 1.1B Chat',
    file: 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    type: 'llama'
  },
  'orca-mini': {
    name: 'Orca Mini 3B',
    file: 'q4_1-orca-mini-3b.gguf',
    type: 'llama'  // Orca Mini uses the Llama architecture
  },
  'mistral': {
    name: 'Mistral 7B Instruct',
    file: 'mistral-7b-instruct-v0.2.Q4_K_M.gguf',
    type: 'mistral'
  },
  'claude': {
    name: 'Claude 3.7 Sonnet',
    file: 'cloud_model_api_only',
    type: 'claude',
    isApi: true,
    requiresApiKey: true
  }
};

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the index.html of the app
  mainWindow.loadFile('index.html');

  // Open the DevTools in development
  // mainWindow.webContents.openDevTools();
}

// When Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

function validateOutput(output) {
  // Remove any obvious preamble or system prompts that might have leaked
  const cleanOutput = output.replace(/^(.*?Explanation:\s*)/s, '').trim();
  
  // Check for any potentially harmful content (basic filter)
  const harmfulPatterns = [
    /exec\([^)]*\)/gi, 
    /eval\([^)]*\)/gi, 
    /system\([^)]*\)/gi,
    /<script>.*?<\/script>/gis
  ];
  
  let filteredOutput = cleanOutput;
  for (const pattern of harmfulPatterns) {
    filteredOutput = filteredOutput.replace(pattern, '[FILTERED_CONTENT]');
  }
  
  return filteredOutput;
}

// Handle file selection
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Code Files', extensions: ['js', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'ts', 'html', 'css', 'php'] }
    ]
  });
  
  if (!result.canceled) {
    // Read file contents
    const fileContents = {};
    for (const filePath of result.filePaths) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        fileContents[filePath] = content;
      } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        fileContents[filePath] = `Error reading file: ${error.message}`;
      }
    }
    return { filePaths: result.filePaths, fileContents };
  }
  
  return { filePaths: [], fileContents: {} };
});

// Handle explanation request
ipcMain.handle('explain-code', async (event, { code, modelConfig }) => {
  // Generate a cache key based on code and model settings
  const cacheKey = `${code}-${JSON.stringify(modelConfig)}`;
  
  // Check if we have a cached result
  const cachedResult = explanationCache.get(cacheKey);
  if (cachedResult) {
    return {
      explanation: cachedResult.explanation,
      latency: cachedResult.latency,
      fromCache: true
    };
  }
  
  // Start timing
  const startTime = process.hrtime();
  
  // Create a temporary file to store the code
  const tempFilePath = path.join(app.getPath('temp'), `code_to_explain_${Date.now()}.txt`);
  fs.writeFileSync(tempFilePath, code);
  
  try {
    // Get the selected model details
    const modelInfo = modelBackends[modelConfig.backend];
    
    // Handle API-based models (like Claude)
    if (modelInfo.isApi) {
      if (modelInfo.type === 'claude') {
        // For Claude, we need the API key
        if (!modelConfig.apiKey) {
          return {
            error: "No API key provided for Claude. Please enter your Anthropic API key in the settings.",
            latency: 0
          };
        }
        
        // Set up command line arguments for Claude
        const pythonScript = path.join(__dirname, 'code_explainer.py');
        const args = [
          pythonScript,
          '--model', 'claude',
          '--model_type', 'claude',
          '--anthropic_api_key', modelConfig.apiKey,
          '--claude_model', 'claude-3-7-sonnet-20250219',
          '--code_file', tempFilePath,
          '--max_tokens', modelConfig.maxTokens.toString(),
          '--temperature', modelConfig.temperature.toString()
        ];
        
        // Use the Python script to call Claude API
        const pythonProcess = spawn('python', args);
        
        // Collect the output
        let explanation = '';
        let errorOutput = '';
        
        pythonProcess.stdout.on('data', (data) => {
          explanation += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        // Wait for the process to complete
        const result = await new Promise((resolve) => {
          pythonProcess.on('close', (code) => {
            // Calculate latency
            const hrend = process.hrtime(startTime);
            const latency = hrend[0] + hrend[1] / 1e9; // in seconds
            
            if (code !== 0) {
              resolve({
                error: `Process exited with code ${code}: ${errorOutput}`,
                latency
              });
            } else {
              // Clean and validate output
              const cleanedExplanation = validateOutput(explanation);
              
              // Cache the result
              explanationCache.set(cacheKey, {
                explanation: cleanedExplanation,
                latency
              });
              
              resolve({
                explanation: cleanedExplanation,
                latency,
                fromCache: false
              });
            }
          });
        });
        
        // Clean up temp file
        fs.unlinkSync(tempFilePath);
        return result;
      }
    }
    // For local GGUF models
    else {
      const modelPath = path.join(__dirname, 'models', modelInfo.file);
      
      // Check if model exists
      if (!fs.existsSync(modelPath)) {
        return {
          error: `Model file not found: ${modelInfo.file}. Please download it first.`,
          latency: 0
        };
      }
      
      // Spawn Python process to run the explanation
      const pythonScript = path.join(__dirname, 'code_explainer.py');
      
      // Create python process
      const pythonProcess = spawn('python', [
        pythonScript,
        '--model', modelPath,
        '--code_file', tempFilePath,
        '--model_type', modelInfo.type,
        '--context_size', modelConfig.contextSize.toString(),
        '--max_tokens', modelConfig.maxTokens.toString(),
        '--temperature', modelConfig.temperature.toString()
      ]);
      
      // Collect the output
      let explanation = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        explanation += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      // Wait for the process to complete
      const result = await new Promise((resolve) => {
        pythonProcess.on('close', (code) => {
          // Calculate latency
          const hrend = process.hrtime(startTime);
          const latency = hrend[0] + hrend[1] / 1e9; // in seconds
          
          if (code !== 0) {
            resolve({
              error: `Process exited with code ${code}: ${errorOutput}`,
              latency
            });
          } else {
            // Clean and validate output
            const cleanedExplanation = validateOutput(explanation);
            
            // Cache the result
            explanationCache.set(cacheKey, {
              explanation: cleanedExplanation,
              latency
            });
            
            resolve({
              explanation: cleanedExplanation,
              latency,
              fromCache: false
            });
          }
        });
      });
      
      // Clean up temp file
      fs.unlinkSync(tempFilePath);
      return result;
    }
  } catch (error) {
    console.error('Error explaining code:', error);
    // Clean up temp file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    
    return {
      error: `Error explaining code: ${error.message}`,
      latency: 0
    };
  }
});

// Handle model download status check
ipcMain.handle('check-models', async () => {
  const modelsDir = path.join(__dirname, 'models');
  
  // Create models directory if it doesn't exist
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }
  
  // Check which models are available
  const modelStatus = {};
  for (const [key, model] of Object.entries(modelBackends)) {
    // For API-based models, we don't need to check if they're installed
    if (model.isApi) {
      modelStatus[key] = {
        ...model,
        installed: true // API models are always "installed"
      };
    } else {
      const modelPath = path.join(modelsDir, model.file);
      modelStatus[key] = {
        ...model,
        installed: fs.existsSync(modelPath)
      };
    }
  }
  
  return modelStatus;
});

// Handle model download
ipcMain.handle('download-model', async (event, modelKey) => {
  try {
    // Get the model info
    const model = modelBackends[modelKey];
    if (!model) {
      return { success: false, message: `Model ${modelKey} not found in available models.` };
    }
    
    // Run the Python script to download the model
    const pythonScript = path.join(__dirname, 'scripts/download_models.py');
    const result = spawn('python', [
      pythonScript, 
      '--models', modelKey,
    ]);
    
    let stdoutData = '';
    let stderrData = '';
    
    result.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    
    result.stderr.on('data', (data) => {
      stderrData += data.toString();
    });
    
    const exitCode = await new Promise((resolve) => {
      result.on('close', (code) => {
        resolve(code);
      });
    });
    
    if (exitCode === 0) {
      return { 
        success: true, 
        message: `Model ${model.name} downloaded successfully.` 
      };
    } else {
      return { 
        success: false, 
        message: `Failed to download model: ${stderrData || 'Unknown error'}` 
      };
    }
  } catch (error) {
    console.error('Error downloading model:', error);
    return { 
      success: false, 
      message: `Error downloading model: ${error.message}` 
    };
  }
});

// Clear cache
ipcMain.handle('clear-cache', () => {
  explanationCache.flushAll();
  return { success: true };
});

// Add rate limit status handler
ipcMain.handle('get-rate-limit-status', async (event, modelType) => {
  try {
    // Run the Python script to get rate limit status
    const pythonScript = path.join(__dirname, 'get_rate_limit_status.py');
    const result = spawn('python', [pythonScript, '--model_type', modelType]);
    
    let stdoutData = '';
    let stderrData = '';
    
    result.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    
    result.stderr.on('data', (data) => {
      stderrData += data.toString();
    });
    
    const exitCode = await new Promise((resolve) => {
      result.on('close', (code) => {
        resolve(code);
      });
    });
    
    if (exitCode === 0) {
      // Parse the JSON output
      try {
        const statusData = JSON.parse(stdoutData);
        return { success: true, data: statusData };
      } catch (error) {
        return { 
          success: false, 
          message: `Failed to parse rate limit status: ${error.message}` 
        };
      }
    } else {
      return { 
        success: false, 
        message: `Failed to get rate limit status: ${stderrData || 'Unknown error'}` 
      };
    }
  } catch (error) {
    console.error('Error getting rate limit status:', error);
    return { 
      success: false, 
      message: `Error getting rate limit status: ${error.message}` 
    };
  }
});