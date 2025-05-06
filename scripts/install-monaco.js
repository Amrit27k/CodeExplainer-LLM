// scripts/install-monaco.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Installing Monaco Editor...');

// Ensure scripts directory exists
const scriptsDir = path.join(__dirname);
if (!fs.existsSync(scriptsDir)) {
  fs.mkdirSync(scriptsDir, { recursive: true });
}

// Install Monaco Editor
try {
  // Create monaco-editor directory in project root
  const monacoDir = path.join(process.cwd(), 'monaco-editor');
  if (!fs.existsSync(monacoDir)) {
    fs.mkdirSync(monacoDir, { recursive: true });
  }

  // Copy Monaco Editor files from node_modules
  const nodeModulesMonacoDir = path.join(process.cwd(), 'node_modules', 'monaco-editor', 'min', 'vs');
  const targetMonacoDir = path.join(monacoDir, 'min', 'vs');
  
  if (!fs.existsSync(path.join(monacoDir, 'min'))) {
    fs.mkdirSync(path.join(monacoDir, 'min'), { recursive: true });
  }

  if (fs.existsSync(nodeModulesMonacoDir)) {
    console.log('Copying Monaco Editor files...');
    // Use platform-specific copy command
    if (process.platform === 'win32') {
      execSync(`xcopy "${nodeModulesMonacoDir}" "${targetMonacoDir}" /E /I /Y`);
    } else {
      execSync(`cp -R "${nodeModulesMonacoDir}" "${path.join(monacoDir, 'min')}"`);
    }
    console.log('Monaco Editor installed successfully!');
  } else {
    console.error('Monaco Editor source files not found in node_modules!');
    console.log('Please ensure monaco-editor is installed by running: npm install');
    process.exit(1);
  }
} catch (error) {
  console.error('Error installing Monaco Editor:', error);
  process.exit(1);
}