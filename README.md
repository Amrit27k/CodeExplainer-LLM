# Code Explainer

An Electron-based desktop application that leverages local and API-based language models to provide detailed explanations of code snippets.

## Features

- **Multiple Model Support**: Uses various language models including TinyLlama, Orca Mini, Mistral, and Claude
- **Local & API Models**: Works with both locally downloaded models and cloud-based API models
- **Rate Limiting**: Basic rate limiting for API-based models to control costs and prevent throttling
- **Performance Metrics**: Displays latency information to track model performance
- **Result Caching**: Caches explanation results to improve application performance
- **Multi-file Analysis**: Support for opening and analyzing multiple files
- **Syntax Highlighting**: Advanced code editing and display with Monaco Editor

## How to Run the Solution

### Prerequisites

1. **Node.js & npm**: Required to run the Electron application
2. **Python 3.8+**: Required for running the language models
3. **Required Python packages**:
   ```
   pip install -r requirements.txt
   ```

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/Amrit27k/CodeExplainer-LLM.git
   cd CodeExplainer-LLM
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Download models (optional - they will be downloaded on demand):
   ```
   python download_models.py --all
   ```
   
   Or download a specific model:
   ```
   python download_models.py --models tinyllama
   ```

### Running the Application

Start the application with:

```
npm start
```

### Using the Application

1. **Select a Model**: Choose your preferred model from the dropdown menu
2. **Configure Settings**: Adjust parameters like max tokens, temperature, and context size
3. **Open Files**: Click the "Open Files" button to load code files
4. **API Key**: For Claude or other API-based models, enter your API key
5. **Generate Explanation**: Select a file and click "Explain Code"

## Design Decisions and Trade-offs

### Architecture

- **Electron + Python Hybrid**: The application uses Electron for the UI and Python for model inference, leveraging the strengths of both ecosystems.
  - **Trade-off**: This adds complexity but allows us to use Python's ML ecosystem while maintaining a modern UI.

- **Local File Structure**: Models are stored in a local 'models' directory rather than the user's AppData folder.
  - **Trade-off**: This makes models easier to manage but requires write access to the application directory.

### Model Selection

- **Multiple Model Options**: The application supports various GGUF version models with different capabilities and sizes.
  - **Trade-off**: More options increase complexity but provide flexibility for different use cases.

- **API Model Integration**: Includes support for Claude API to provide higher quality explanations.
  - **Trade-off**: Requires internet access and API keys but offers better results than local models.

### Performance Considerations

- **Caching System**: Explanations are cached to improve response times for repeated requests.
  - **Trade-off**: Uses more memory but significantly reduces latency for repeated explanations.

- **Rate Limiting**: API requests are rate-limited to prevent throttling and control costs.
  - **Trade-off**: May sometimes delay responses but ensures sustainable API usage.

### User Experience

- **Monaco Editor**: Uses Monaco Editor for code display and editing.
  - **Trade-off**: Adds to the application size but provides superior syntax highlighting and editing capabilities.

- **Asynchronous Processing**: All model inference runs asynchronously to keep the UI responsive.
  - **Trade-off**: More complex code but much better user experience.

### UI/UX Design Decisions

- **Split-Pane Layout**: The application uses a split-pane layout with code on top and explanation below, allowing users to see both simultaneously without context switching.
    - **Trade-off**: Reduces the vertical space for each component but significantly improves understanding by providing direct visual reference.


- **Contextual Controls**: Model-specific controls (like API key fields) only appear when relevant models are selected, reducing interface clutter.
    - **Trade-off**: Requires more complex state management but creates a cleaner, more focused interface.


- **Performance Feedback**: Real-time display of latency metrics and cache status provides transparency about system performance.
    - **Trade-off**: Uses screen space but builds user trust and helps set appropriate expectations for response times.


- **File Explorer Integration**: The sidebar file explorer makes code management intuitive and familiar to developers used to IDE environments.
    - **Trade-off**: Takes up horizontal space but significantly improves file navigation and organization.

## What I Would Improve With More Time

1. **GPU Acceleration**: Add support for GPU inference to improve performance with larger models.

2. **More Advanced Prompting**: Develop model-specific prompting techniques to generate better explanations.

3. **Explanation Quality Metrics**: Implement a system to evaluate and compare the quality of explanations across models.

4. **Diff-based Explanations**: Add the ability to explain differences between code versions.

5. **Plugin System**: Create a plugin architecture to support additional models and features.

6. **Persistent Settings**: Save user preferences and API keys securely between sessions.

7. **More Visualization Options**: Add visualization tools for explaining algorithm behavior.

8. **Testing Suite**: Comprehensive tests for both the Electron and Python components.

9. **Better UI/UX Layout**: Smooth screen transitions and icons compatible with multiple display support 

## Challenges Faced During Development

1. **Model Output Consistency**: When temperature settings are high, some models ignored prompt instructions and included follow-up questions in their responses, requiring post-processing to filter these out.

2. **Parameter Tuning**: Finding the optimal balance between temperature, context size, and max_tokens proved challenging. Changes to these parameters rarely produced consistent output for the same input.

3. **API Rate Limiting**: Implementing effective rate limiting for API models required careful design to prevent throttling while maintaining responsiveness.

4. **UI Synchronization**: Keeping the UI in sync with model processing state and ensuring proper display of API settings was challenging, particularly with the API key input field.

5. **Model Storage Location**: Determining the optimal location for storing models required balancing ease of access with application portability.

6. **Error Handling Across Languages**: Coordinating error handling between JavaScript (Electron) and Python (model inference) required careful message passing and state management.

7. **Dependency Management**: Managing Python dependencies across different operating systems presented compatibility challenges.

## Assumptions Made

1. **User Environment**: Users have Python and Node.js installed and configured correctly.

2. **Network Access**: For API-based models, users have reliable internet access.

3. **Model Understanding**: The models have sufficient knowledge to provide accurate code explanations.

4. **Permission Structure**: The application has write permissions to create and manage the models directory.

5. **API Access**: Users with API keys have the appropriate tier/access level for their API providers.

6. **File Size Limitations**: Code files are of reasonable size that can fit in model context windows.

7. **Compatible Code Languages**: The application focuses on commonly used programming languages like C++, C, C#, Python, Javascript, java, go, typescript, html, css, and php.

8. **Single User Per Instance**: The application is designed for individual use rather than multi-user scenarios.

9. **Desktop Use**: The application is primarily designed for desktop environments with cross-platform support in Windows, Linux, and Mac, rather than mobile or web.

10. **Security Context**: API keys are only stored in memory and not persisted between sessions for security purposes.

## License

MIT License - See LICENSE file for details.