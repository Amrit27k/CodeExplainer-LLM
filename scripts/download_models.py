#!/usr/bin/env python3
"""
Model Downloader Script for Code Explainer

This script downloads the required GGUF model files from Hugging Face
and places them in the user_data/models directory.
"""

import os
import sys
import argparse
import requests
import time
from pathlib import Path
from tqdm import tqdm
import platform

# Model information - URL, size, and name
MODELS = {
    "tinyllama": {
        "name": "TinyLlama 1.1B Chat",
        "file": "tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
        "url": "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
        "size": 734003200  # ~700 MB
    },
    "orca-mini": {
        "name": "Orca Mini 3B",
        "file": "q4_1-orca-mini-3b.gguf",
        "url": "https://huggingface.co/Aryanne/Orca-Mini-3B-gguf/resolve/main/q4_1-orca-mini-3b.gguf",
        "size": 2200000000  # ~2.2 GB
    },
    "mistral": {
        "name": "Mistral 7B Instruct",
        "file": "mistral-7b-instruct-v0.2.Q4_K_M.gguf",
        "url": "https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf",
        "size": 3931086848  # ~3.7 GB
    },
    "claude": {
        "name": "Anthropic Claude 3.7 Sonnet",
        "file": "cloud_model_api_only",
        "url": None,
        "size": 0,
        "is_api": True,
        "api_info": "Requires ANTHROPIC_API_KEY and the 'anthropic' Python package."
    }
}

def get_models_dir():
    """Get the models directory at the root level of the project."""
    # Get the script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Go up one level if the script is in a subdirectory
    if os.path.basename(script_dir) == 'scripts':
        project_dir = os.path.dirname(script_dir)
    else:
        project_dir = script_dir
    
    # Set models directory at the root level
    models_dir = os.path.join(project_dir, 'models')
    
    # Create if it doesn't exist
    if not os.path.exists(models_dir):
        os.makedirs(models_dir, exist_ok=True)
        print(f"Created models directory: {models_dir}")
    
    return models_dir

def download_file(url, destination_path, expected_size=None):
    """
    Download a file with progress tracking.
    
    Args:
        url: URL to download from
        destination_path: Path where the file will be saved
        expected_size: Expected file size in bytes
    
    Returns:
        bool: True if download was successful, False otherwise
    """
    try:
        # Start the download
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        # Handle redirects
        if response.history:
            print(f"Request was redirected from {url} to {response.url}")
        
        # Get file size if not provided
        if expected_size is None:
            expected_size = int(response.headers.get('content-length', 0))
        
        # Create a progress bar
        progress_bar = tqdm(
            total=expected_size,
            unit='B',
            unit_scale=True,
            desc=f"Downloading {destination_path.name}"
        )
        
        # Download with progress tracking
        with open(destination_path, 'wb') as file:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    file.write(chunk)
                    progress_bar.update(len(chunk))
        
        progress_bar.close()
        
        # Verify file size
        actual_size = os.path.getsize(destination_path)
        if expected_size > 0 and actual_size != expected_size:
            print(f"Warning: Downloaded file size ({actual_size} bytes) does not match expected size ({expected_size} bytes)")
        
        return True
    
    except requests.exceptions.RequestException as e:
        print(f"Error downloading file: {e}")
        if destination_path.exists():
            destination_path.unlink()  # Remove partial download
        return False

def download_models(model_keys=None):
    """
    Download the specified models.
    
    Args:
        model_keys: List of model keys to download. If None, downloads the default model.
    
    Returns:
        bool: True if all downloads were successful, False otherwise
    """
    # Default to TinyLlama if no models specified
    if model_keys is None:
        model_keys = ["tinyllama"]
    
    # Get models directory
    models_dir = Path(get_models_dir())
    
    # Track if all downloads succeed
    all_successful = True
    
    # Download each model
    for model_key in model_keys:
        if model_key not in MODELS:
            print(f"Warning: Unknown model '{model_key}', skipping.")
            continue
        
        model_info = MODELS[model_key]
        
        # Skip API-based models (like Claude)
        if model_info.get("is_api", False):
            print(f"\nModel {model_info['name']} is a cloud API model:")
            print(f"  - {model_info['api_info']}")
            print(f"  - No download required, but you'll need to set up API access.")
            
            # Check if anthropic package is installed for Claude
            if model_key == "claude":
                try:
                    import anthropic
                    print(f"  - ✓ 'anthropic' package is installed.")
                except ImportError:
                    print(f"  - ✗ 'anthropic' package is not installed.")
                    print(f"    Install with: pip install anthropic")
            
            continue
        
        model_path = models_dir / model_info["file"]
        
        # Check if model already exists
        if model_path.exists():
            print(f"Model {model_info['name']} ({model_info['file']}) already exists.")
            continue
        
        print(f"Downloading {model_info['name']} ({model_info['file']})...")
        success = download_file(model_info["url"], model_path, model_info["size"])
        
        if success:
            print(f"Successfully downloaded {model_info['name']}.")
        else:
            print(f"Failed to download {model_info['name']}.")
            all_successful = False
    
    return all_successful

def parse_arguments():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description="Download models for Code Explainer")
    parser.add_argument(
        "--models",
        nargs="+",
        choices=list(MODELS.keys()),
        default=["tinyllama"],
        help="Models to download. Default is TinyLlama only."
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Download all available models"
    )
    return parser.parse_args()

def main():
    """Main function."""
    args = parse_arguments()
    
    print("Code Explainer Model Downloader")
    print("===============================")
    
    # Determine which models to download
    if args.all:
        model_keys = list(MODELS.keys())
        print(f"Downloading all {len(model_keys)} models...")
    else:
        model_keys = args.models
        print(f"Downloading {len(model_keys)} models: {', '.join(model_keys)}")
    
    # Download models
    start_time = time.time()
    success = download_models(model_keys)
    elapsed_time = time.time() - start_time
    
    # Report results
    print("\nDownload Summary:")
    print(f"Time elapsed: {elapsed_time:.1f} seconds")
    
    if success:
        print("All models downloaded successfully!")
        return 0
    else:
        print("Some models failed to download. Check the log for details.")
        return 1

if __name__ == "__main__":
    sys.exit(main())