import time
import threading
from datetime import datetime
from collections import deque


class APIRateLimiter:
    """
    Generic rate limiter for API-based models.
    Tracks both request count and token usage with configurable time windows.
    Thread-safe for use in concurrent environments.
    """
    
    def __init__(self, 
                name="default",
                requests_per_minute=20, 
                tokens_per_minute=100000, 
                requests_per_day=10000,
                tokens_per_day=1000000):
        """
        Initialize the rate limiter with configurable limits.
        
        Args:
            name: Identifier for this rate limiter (e.g., "claude", "openai")
            requests_per_minute: Maximum number of requests allowed per minute
            tokens_per_minute: Maximum number of tokens allowed per minute
            requests_per_day: Maximum number of requests allowed per day
            tokens_per_day: Maximum number of tokens allowed per day
        """
        self.name = name
        
        # Configure limits
        self.requests_per_minute = requests_per_minute
        self.tokens_per_minute = tokens_per_minute
        self.requests_per_day = requests_per_day
        self.tokens_per_day = tokens_per_day
        
        # Track usage
        self.minute_requests = deque()
        self.minute_tokens = deque()
        self.day_requests = deque()
        self.day_tokens = deque()
        
        # Define window sizes in seconds
        self.minute_window = 60
        self.day_window = 86400  # 24 hours
        
        # Thread safety
        self.lock = threading.RLock()
        
        # Statistics
        self.total_requests = 0
        self.total_tokens = 0
        self.total_wait_time = 0
        self.rate_limit_hits = 0
    
    def _clean_old_entries(self):
        """Remove entries outside the time windows."""
        now = time.time()
        
        # Clean minute windows
        while self.minute_requests and now - self.minute_requests[0] > self.minute_window:
            self.minute_requests.popleft()
            
        while self.minute_tokens and now - self.minute_tokens[0][0] > self.minute_window:
            self.minute_tokens.popleft()
            
        # Clean day windows
        while self.day_requests and now - self.day_requests[0] > self.day_window:
            self.day_requests.popleft()
            
        while self.day_tokens and now - self.day_tokens[0][0] > self.day_window:
            self.day_tokens.popleft()
    
    def check_rate_limit(self, tokens_estimate=1000):
        """
        Check if the request would exceed any rate limits.
        
        Args:
            tokens_estimate: Estimated token usage for this request
            
        Returns:
            tuple: (can_proceed, wait_time_seconds, limit_type)
                - can_proceed: True if request can proceed, False otherwise
                - wait_time_seconds: Suggested wait time if can_proceed is False
                - limit_type: String indicating which limit was hit (or None)
        """
        with self.lock:
            self._clean_old_entries()
            now = time.time()
            
            # Check minute request limit
            if len(self.minute_requests) >= self.requests_per_minute:
                oldest = self.minute_requests[0]
                wait_time = self.minute_window - (now - oldest)
                return False, max(0, wait_time), "requests_per_minute"
            
            # Check minute token limit
            current_minute_tokens = sum(tokens for _, tokens in self.minute_tokens)
            if current_minute_tokens + tokens_estimate > self.tokens_per_minute:
                oldest_token_time = self.minute_tokens[0][0] if self.minute_tokens else now
                wait_time = self.minute_window - (now - oldest_token_time)
                return False, max(0, wait_time), "tokens_per_minute"
            
            # Check day request limit
            if len(self.day_requests) >= self.requests_per_day:
                oldest = self.day_requests[0]
                wait_time = self.day_window - (now - oldest)
                return False, max(0, wait_time), "requests_per_day"
            
            # Check day token limit
            current_day_tokens = sum(tokens for _, tokens in self.day_tokens)
            if current_day_tokens + tokens_estimate > self.tokens_per_day:
                oldest_token_time = self.day_tokens[0][0] if self.day_tokens else now
                wait_time = self.day_window - (now - oldest_token_time)
                return False, max(0, wait_time), "tokens_per_day"
            
            return True, 0, None
    
    def record_request(self, tokens_used):
        """
        Record a successful request and its token usage.
        Call this after the API request completes.
        
        Args:
            tokens_used: Actual number of tokens used in this request
        """
        with self.lock:
            now = time.time()
            
            # Record in minute windows
            self.minute_requests.append(now)
            self.minute_tokens.append((now, tokens_used))
            
            # Record in day windows
            self.day_requests.append(now)
            self.day_tokens.append((now, tokens_used))
            
            # Update statistics
            self.total_requests += 1
            self.total_tokens += tokens_used
    
    def wait_if_needed(self, tokens_estimate=1000):
        """
        Check rate limits and wait if necessary.
        
        Args:
            tokens_estimate: Estimated token usage for this request
            
        Returns:
            bool: True if request can proceed, False if it had to wait too long
            
        This method will block until the request can proceed or
        if the wait time is excessive (>30s), it returns False.
        """
        max_wait_time = 30  # Maximum seconds to wait before giving up
        
        while True:
            can_proceed, wait_time, limit_type = self.check_rate_limit(tokens_estimate)
            
            if can_proceed:
                return True
                
            if wait_time > max_wait_time:
                self.rate_limit_hits += 1
                return False
                
            # Wait and try again
            self.total_wait_time += wait_time
            self.rate_limit_hits += 1
            time.sleep(wait_time)
    
    def get_usage_stats(self):
        """Get current usage statistics."""
        with self.lock:
            self._clean_old_entries()
            
            return {
                "name": self.name,
                "current_minute_requests": len(self.minute_requests),
                "current_minute_tokens": sum(tokens for _, tokens in self.minute_tokens),
                "current_day_requests": len(self.day_requests),
                "current_day_tokens": sum(tokens for _, tokens in self.day_tokens),
                "total_requests": self.total_requests,
                "total_tokens": self.total_tokens,
                "rate_limit_hits": self.rate_limit_hits,
                "total_wait_time": self.total_wait_time,
                "minute_limit_percentage": (len(self.minute_requests) / self.requests_per_minute) * 100 if self.requests_per_minute > 0 else 0,
                "day_limit_percentage": (len(self.day_requests) / self.requests_per_day) * 100 if self.requests_per_day > 0 else 0,
                "timestamp": datetime.now().isoformat()
            }