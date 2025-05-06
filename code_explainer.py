#!/usr/bin/env python3
"""
Enhanced Code Explanation Script for Electron App
Using ctransformers with GGUF format models and Claude API
"""

import os
import argparse
import textwrap
import sys
import json
import re
import time
from ctransformers import AutoModelForCausalLM

# Import rate limiter
from scripts.api_ratelimiter import APIRateLimiter

# Create rate limiters for different API models
RATE_LIMITERS = {
    "claude": APIRateLimiter(
        name="claude",
        requests_per_minute=20,    # Adjust based on your Anthropic tier
        tokens_per_minute=100000,  # Adjust based on your Anthropic tier
        requests_per_day=10000,    # Adjust based on your Anthropic tier
        tokens_per_day=1000000     # Adjust based on your Anthropic tier
    )
    # Add more rate limiters for other API-based models here
}

# Add Anthropic import
try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Code explanation using LLM models")
    parser.add_argument(
        "--model", 
        type=str, 
        required=True,
        help="Path to the GGUF model file or 'claude' for Anthropic Claude"
    )
    parser.add_argument(
        "--model_type", 
        type=str, 
        default="llama",
        choices=["llama", "phi", "mistral", "gpt-neox", "claude"],
        help="Model architecture type"
    )
    parser.add_argument(
        "--anthropic_api_key",
        type=str,
        default=os.environ.get("ANTHROPIC_API_KEY"),
        help="API key for Anthropic Claude (only required if model_type is 'claude')"
    )
    parser.add_argument(
        "--claude_model",
        type=str,
        default="claude-3-7-sonnet-20250219",
        help="Claude model to use (only if model_type is 'claude')"
    )
    parser.add_argument(
        "--code_file", 
        type=str, 
        help="Path to the code file to explain"
    )
    parser.add_argument(
        "--context_size", 
        type=int, 
        default=2048,
        help="Context size for the model"
    )
    parser.add_argument(
        "--max_tokens", 
        type=int, 
        default=1024,
        help="Maximum tokens for generation"
    )
    parser.add_argument(
        "--temperature", 
        type=float, 
        default=0.7,
        help="Temperature for generation"
    )
    return parser.parse_args()

def load_model(model_path, model_type, context_size, anthropic_api_key=None, claude_model=None):
    """Load the LLM model."""
    
    # Handle Claude separately
    if model_type == "claude":
        if not ANTHROPIC_AVAILABLE:
            print("Error: The 'anthropic' package is not installed. Please install it using:", file=sys.stderr)
            print("pip install anthropic", file=sys.stderr)
            sys.exit(1)
            
        if not anthropic_api_key:
            print("Error: No Anthropic API key provided.", file=sys.stderr)
            print("Please provide an API key using the --anthropic_api_key parameter or set the ANTHROPIC_API_KEY environment variable.", file=sys.stderr)
            sys.exit(1)
            
        try:
            # Create Anthropic client
            client = anthropic.Anthropic(api_key=anthropic_api_key)
            # Return a dict with the client and model name to use later
            return {
                "type": "claude",
                "client": client,
                "model": claude_model or "claude-3-7-sonnet-20250219"
            }
        except Exception as e:
            print(f"Error initializing Anthropic client: {e}", file=sys.stderr)
            sys.exit(1)
    
    # Handle local GGUF models
    else:
        # Check if the model file exists
        if not os.path.exists(model_path):
            print(f"Error: Model file {model_path} not found!", file=sys.stderr)
            print(f"Please download the {model_type} GGUF model first.", file=sys.stderr)
            sys.exit(1)
        
        try:
            # Load the model using ctransformers
            model = AutoModelForCausalLM.from_pretrained(
                model_path,
                model_type=model_type,
                context_length=context_size,
                gpu_layers=0  # Use 0 to run on CPU only
            )
            return model
        except Exception as e:
            print(f"Error loading model: {e}", file=sys.stderr)
            sys.exit(1)

def read_code_file(file_path):
    """Read code from file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            return file.read()
    except Exception as e:
        print(f"Error reading file: {e}", file=sys.stderr)
        sys.exit(1)

def remove_followup_questions(text):
    """Remove follow-up questions from the model output."""
    # List of patterns that often indicate follow-up questions
    question_patterns = [
        r"Do you have any (specific|particular) questions about (the|this) code\?",
        r"Is there anything (specific|particular|else) you'd like me to (explain|clarify|elaborate on)\?",
        r"Would you like me to (explain|elaborate on) any (specific|particular) part (of the code|in more detail)\?",
        r"Let me know if you (need|want|have|would like) (any|more) (clarification|explanation|details|information)\.",
        r"If you have any (questions|concerns), (feel free to|please) (ask|let me know)\.",
        r"Do you want me to (go into more detail|explain anything further)\?",
        r"Is there a (specific|particular) (part|section|aspect|area) (of the code )?(that )?(you're|you are) (curious|interested|confused) about\?",
        r"What (specific|particular) (parts|aspects) of (this|the) code (would you like|do you want) (me )?to (focus on|explain|elaborate|clarify)\?",
        r"How would you like to (proceed|continue)\?",
        r"I'd be happy to (discuss|explain|clarify) (any|specific) (parts|sections|aspects) in more detail\."
    ]
    
    # Iteratively remove each pattern
    cleaned_text = text
    for pattern in question_patterns:
        cleaned_text = re.sub(pattern, "", cleaned_text, flags=re.IGNORECASE)
    
    # Remove any sentences with question marks at the end of the text
    lines = cleaned_text.split('\n')
    while lines and any(q_word in lines[-1].lower() for q_word in ['?', 'what', 'how', 'would you', 'do you', 'is there', 'are there']):
        lines.pop()
    
    # Rejoin the cleaned text
    cleaned_text = '\n'.join(lines)
    
    # Remove extra whitespace that might have been created
    cleaned_text = re.sub(r'\n\s*\n', '\n\n', cleaned_text)
    cleaned_text = cleaned_text.strip()
    
    return cleaned_text

def explain_code(model, code, max_tokens, temperature, model_type):
    """Generate code explanation using the loaded model."""
    
    # Handle Claude API
    if isinstance(model, dict) and model["type"] == "claude":
        claude_client = model["client"]
        claude_model_name = model["model"]
        
        # Create prompt for Claude
        claude_prompt = f"""You are an expert programmer tasked with explaining code. Below is a code snippet that needs explanation.
Please provide a clear, concise explanation of what this code does, including:
1. Overall purpose
2. Key components and their functions
3. Notable techniques or patterns used
4. Any potential issues or improvements

DO NOT ask any follow-up questions at the end of your response. Provide a complete explanation without prompting for more information.

Code to explain:
```
{code}
```"""

        try:
            # Estimate token count (rough estimation)
            estimated_tokens = len(claude_prompt.split()) + max_tokens
            
            # Get rate limiter for Claude
            rate_limiter = RATE_LIMITERS.get("claude")
            
            # Check rate limits if rate limiter exists
            if rate_limiter:
                print(f"Checking rate limits for Claude API...", file=sys.stderr)
                can_proceed = rate_limiter.wait_if_needed(estimated_tokens)
                if not can_proceed:
                    return "Rate limit exceeded. Please try again later."
            
            # Call the Claude API
            print(f"Calling Claude API with {estimated_tokens} estimated tokens...", file=sys.stderr)
            response = claude_client.messages.create(
                model=claude_model_name,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[
                    {"role": "user", "content": claude_prompt}
                ]
            )
            
            # Extract and post-process the response
            response_text = response.content[0].text
            
            # Record token usage if rate limiter exists
            if rate_limiter:
                # Rough estimate of actual tokens used
                tokens_used = len(claude_prompt.split()) + len(response_text.split())
                rate_limiter.record_request(tokens_used)
                print(f"Recorded {tokens_used} tokens used in Claude API request", file=sys.stderr)
            
            return remove_followup_questions(response_text)
        except Exception as e:
            print(f"Error using Claude API: {e}", file=sys.stderr)
            return f"Error generating explanation with Claude: {e}"
    
    # Handle local GGUF models
    else:
        # Adjust prompt based on model type
        if model_type in ["llama", "mistral"]:
            # For Llama and Mistral models
            prompt = f"""<s>[INST] You are an expert programmer tasked with explaining code. Below is a code snippet that needs explanation.
Please provide a clear, concise explanation of what this code does, including:
1. Overall purpose
2. Key components and their functions
3. Notable techniques or patterns used
4. Any potential issues or improvements

DO NOT ask any follow-up questions at the end of your response. Provide a complete explanation without prompting for more information.

Code to explain:
```
{code}
```
[/INST]
"""
        elif model_type == "phi":
            # For Phi models
            prompt = f"""<|user|>
You are an expert programmer tasked with explaining code. Below is a code snippet that needs explanation.
Please provide a clear, concise explanation of what this code does, including:
1. Overall purpose
2. Key components and their functions
3. Notable techniques or patterns used
4. Any potential issues or improvements

DO NOT ask any follow-up questions at the end of your response. Provide a complete explanation without prompting for more information.

Code to explain:
```
{code}
```
<|assistant|>
"""
        else:
            # Generic prompt for other models
            prompt = f"""
You are an expert programmer tasked with explaining code. Below is a code snippet that needs explanation.
Please provide a clear, concise explanation of what this code does, including:
1. Overall purpose
2. Key components and their functions
3. Notable techniques or patterns used
4. Any potential issues or improvements

DO NOT ask any follow-up questions at the end of your response. Provide a complete explanation without prompting for more information.

Code to explain:
```
{code}
```

Explanation:
"""
        
        # Generate explanation
        try:
            # Call the model for inference
            output = model(
                prompt,
                max_new_tokens=max_tokens,
                temperature=temperature,
                stop=["```", "<|endoftext|>", "</s>", "<|user|>"]
            )
            
            # Extract the relevant part of the response
            if model_type == "phi":
                # Phi model might include the assistant tag
                processed_output = output.strip()
            elif model_type in ["llama", "mistral"]:
                # Llama/Mistral might include the instruction pattern
                processed_output = output.replace("[/INST]", "").strip()
            else:
                # Generic cleanup
                processed_output = output.strip()
            
            # Post-process to remove follow-up questions
            return remove_followup_questions(processed_output)
        except Exception as e:
            print(f"Error generating explanation: {e}", file=sys.stderr)
            return f"Error generating explanation: {e}"

def main():
    """Main function."""
    args = parse_arguments()
    
    try:
        # Load the model
        model = load_model(
            args.model, 
            args.model_type, 
            args.context_size,
            args.anthropic_api_key,
            args.claude_model
        )
        
        # Read the code file
        if args.code_file:
            code = read_code_file(args.code_file)
            
            # Generate explanation
            explanation = explain_code(model, code, args.max_tokens, args.temperature, args.model_type)
            
            # Output the explanation
            print(explanation)
        else:
            print("Error: No code file provided", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()