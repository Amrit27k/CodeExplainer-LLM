#!/usr/bin/env python3
"""
Script to retrieve rate limit status for API-based models
"""

import argparse
import json
import sys
from scripts.api_ratelimiter import APIRateLimiter
from code_explainer import RATE_LIMITERS

def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Get rate limit status for API models")
    parser.add_argument(
        "--model_type", 
        type=str,
        required=True,
        help="Model type to get rate limit status for"
    )
    return parser.parse_args()

def main():
    """Main function."""
    args = parse_arguments()
    
    # Get the rate limiter for the specified model
    rate_limiter = RATE_LIMITERS.get(args.model_type)
    
    if not rate_limiter:
        print(json.dumps({
            "error": f"No rate limiter found for model type: {args.model_type}"
        }))
        return 1
    
    # Get usage stats
    stats = rate_limiter.get_usage_stats()
    
    # Output as JSON
    print(json.dumps(stats, indent=2))
    return 0

if __name__ == "__main__":
    sys.exit(main())