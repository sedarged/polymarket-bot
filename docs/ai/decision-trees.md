# Decision Trees

Troubleshooting guides for common scenarios. Use these decision trees to debug issues quickly.

## 🔴 Order Failed to Submit

```
Order submission failed
├─ Error: "Rate limit exceeded"
│  ├─ Check: Are you respecting rate limits?
│  ├─ Action: Implement rate limiting (bottleneck)
│  ├─ Action: Add exponential backoff
│  └─ Action: Batch requests if possible
│
├─ Error: "Invalid signature"
│  ├─ Check: Is the signature scheme correct?
│  ├─ Action: Review Polymarket signature docs
│  ├─ Action: Log signature inputs and outputs
│  ├─ Check: Is the timestamp fresh?
│  └─ Action: Verify private key is correct
│
├─ Error: "Insufficient balance"
│  ├─ Check: Query account balance
│  ├─ Action: Fetch positions and reconcile
│  ├─ Check: Are there pending orders locking funds?
│  └─ Action: Cancel stale orders or add funds
│
├─ Error: "Order too small" / "Order too large"
│  ├─ Check: Market minimum/maximum order sizes
│  ├─ Action: Query market info for limits
│  └─ Action: Adjust order size
│
├─ Error: "Market not found"
│  ├─ Check: Is market ID correct?
│  ├─ Action: Query markets to verify ID
│  └─ Check: Has market closed or expired?
│
├─ Error: "Network error" / Timeout
│  ├─ Check: Is the API reachable?
│  ├─ Action: Implement retry with exponential backoff
│  ├─ Action: Check circuit breaker state
│  └─ Check: Are you handling transient errors?
│
└─ Error: "Duplicate order"
   ├─ Check: Is idempotency key being used?
   ├─ Action: Generate unique order IDs
   ├─ Action: Check if order already exists
   └─ Action: Implement order tracking

Fix applied?
├─ Yes → Test order submission again
└─ No → Check logs for more details, consult RUNBOOK.md
```

## 🔌 WebSocket Disconnected

```
WebSocket connection lost
├─ Check: Is this expected maintenance?
│  └─ Action: Wait and rely on auto-reconnect
│
├─ Check: Are you receiving close frames?
│  ├─ Code 1000 (Normal closure)
│  │  └─ Action: Reconnect immediately
│  ├─ Code 1006 (Abnormal closure)
│  │  ├─ Action: Implement exponential backoff
│  │  └─ Action: Check network stability
│  └─ Other codes
│     └─ Action: Log code and consult docs
│
├─ Check: Reconnection working?
│  ├─ No → Action: Verify reconnect logic exists
│  ├─ Looping → Action: Add exponential backoff + jitter
│  └─ Yes but stale data
│     └─ Action: Implement state resync after reconnect
│
├─ Check: Are you sending pings/pongs?
│  ├─ No → Action: Implement heartbeat mechanism
│  └─ Yes but timing out
│     └─ Action: Reduce ping interval
│
└─ Check: Network issues?
   ├─ Action: Test connectivity to WebSocket endpoint
   ├─ Action: Check firewall rules
   └─ Action: Verify DNS resolution

Reconnection strategy:
1. Attempt reconnect with exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
2. Add jitter (random 0-1000ms) to prevent thundering herd
3. After successful reconnect: resync order book, positions, orders
4. Log all connection state changes
```

## 🔐 Signature Mismatch

```
Signature validation failed
├─ Check: Are you using the correct private key?
│  ├─ Action: Verify PRIVATE_KEY env var
│  ├─ Action: Never log private key
│  └─ Action: Check key format (hex, base64, etc.)
│
├─ Check: Is the message format correct?
│  ├─ Action: Review Polymarket signature scheme
│  ├─ Action: Match exactly: field order matters
│  ├─ Action: Check for trailing spaces or newlines
│  └─ Action: Verify encoding (UTF-8)
│
├─ Check: Is the timestamp valid?
│  ├─ Too old → Action: Use current timestamp
│  ├─ In future → Action: Check system clock sync
│  └─ Action: Ensure timestamp is Unix milliseconds
│
├─ Check: Is the nonce correct?
│  ├─ Action: Nonce must be unique and increasing
│  ├─ Action: Don't reuse nonces
│  └─ Action: Handle nonce conflicts
│
└─ Check: Is the signing library correct?
   ├─ Action: Use ethers.js or web3.js
   ├─ Action: Verify library version
   └─ Action: Test with known examples

Debug approach:
1. Log message to be signed (before signing)
2. Log generated signature
3. Compare with working example
4. Verify field by field
```

## ⚙️ Environment Variables Missing

```
Required env var not found
├─ Check: Does .env file exist?
│  ├─ No → Action: Copy .env.example to .env
│  └─ Yes → Proceed to next check
│
├─ Check: Are env vars loaded?
│  ├─ Using dotenv? → Action: Call dotenv.config() early
│  ├─ Docker? → Action: Pass env vars with -e or --env-file
│  └─ Action: Log process.env to verify
│
├─ Check: Is the variable name correct?
│  ├─ Action: Check .env.example for correct names
│  ├─ Action: Check for typos
│  └─ Action: Env vars are case-sensitive
│
├─ Check: Default values?
│  ├─ Safe to default? → Action: Provide default in code
│  └─ Critical var? → Action: Fail fast with error
│
└─ Action: Implement env validation on startup

Startup validation pattern:
```typescript
function validateEnv() {
  const required = ['API_KEY', 'PRIVATE_KEY', 'CHAIN_ID'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing);
    process.exit(1);
  }
}
```
```

## 🌐 Chain/Network Issues

```
Blockchain operation failed
├─ Error: "Network congestion"
│  ├─ Action: Increase gas price
│  ├─ Action: Implement gas price oracle
│  └─ Action: Retry with higher gas
│
├─ Error: "Nonce too low"
│  ├─ Check: Are you tracking nonces?
│  ├─ Action: Query current nonce from chain
│  ├─ Action: Increment and retry
│  └─ Check: Multiple instances running?
│
├─ Error: "Transaction underpriced"
│  ├─ Action: Increase gas price
│  ├─ Action: Check current network gas prices
│  └─ Action: Use EIP-1559 if available
│
├─ Error: "RPC endpoint unreachable"
│  ├─ Check: Is RPC URL correct?
│  ├─ Action: Try alternative RPC endpoints
│  ├─ Action: Implement RPC failover
│  └─ Check: Is endpoint rate-limited?
│
├─ Error: "Transaction reverted"
│  ├─ Action: Decode revert reason
│  ├─ Action: Check contract state
│  ├─ Action: Verify transaction parameters
│  └─ Check: Is there enough gas limit?
│
└─ Error: "Chain reorganization"
   ├─ Action: Wait for confirmations
   ├─ Action: Re-verify transaction status
   └─ Action: Handle conflicting transactions

Network stability:
1. Use reputable RPC providers
2. Implement failover to backup RPCs
3. Monitor RPC health
4. Cache blockchain data where safe
```

## 📊 Stale Market Data

```
Market data seems outdated
├─ Check: When was data last updated?
│  ├─ Action: Add timestamp to cached data
│  └─ Action: Log cache age on access
│
├─ Check: Is WebSocket connected?
│  ├─ No → Follow "WebSocket Disconnected" tree
│  └─ Yes → Proceed to next check
│
├─ Check: Are you receiving updates?
│  ├─ No updates → Check subscription status
│  ├─ Action: Resubscribe to market feeds
│  └─ Action: Verify message handlers
│
├─ Check: Cache invalidation working?
│  ├─ Action: Set max cache age (e.g., 5 seconds)
│  ├─ Action: Force refresh if stale
│  └─ Action: Clear cache on reconnect
│
└─ Action: Implement cache refresh logic

Cache pattern:
```typescript
class MarketDataCache {
  private data: Map<string, { value: any; timestamp: number }> = new Map();
  private maxAge = 5000; // 5 seconds
  
  get(key: string) {
    const cached = this.data.get(key);
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > this.maxAge) {
      this.data.delete(key);
      return null;
    }
    
    return cached.value;
  }
}
```
```

## 🧪 Tests Failing

```
npm test fails
├─ Check: What's the error message?
│  ├─ Module not found
│  │  ├─ Action: Run npm install
│  │  └─ Action: Check import paths
│  ├─ Type errors
│  │  ├─ Action: Run npm run build
│  │  └─ Action: Check TypeScript config
│  └─ Test assertion failed
│     └─ Proceed to next check
│
├─ Check: Are you testing the right thing?
│  ├─ Action: Review test expectations
│  ├─ Action: Check if API changed
│  └─ Action: Verify test data is valid
│
├─ Check: Flaky tests (pass sometimes)?
│  ├─ Timing issue → Add proper waits
│  ├─ Race condition → Mock async operations
│  └─ Network dependency → Mock external calls
│
├─ Check: Environment issues?
│  ├─ Action: Check if .env.test exists
│  ├─ Action: Verify test database/mocks
│  └─ Action: Clear test cache
│
└─ Still failing?
   ├─ Action: Run single test: npm test -- file.test.ts
   ├─ Action: Add console.logs to debug
   └─ Action: Check test logs for clues
```

## 🚨 Bot Stopped Working

```
Bot is not trading/responding
├─ Check: Is the process running?
│  ├─ No → Action: Restart the bot
│  └─ Yes → Proceed to next check
│
├─ Check: Are errors being logged?
│  ├─ Yes → Follow appropriate error tree above
│  └─ No → Proceed to next check
│
├─ Check: Is it stuck in a loop?
│  ├─ Action: Check CPU usage
│  ├─ Action: Add timeouts to operations
│  └─ Action: Review loop conditions
│
├─ Check: Circuit breaker open?
│  ├─ Action: Check circuit breaker status
│  ├─ Action: Review recent errors
│  └─ Action: Reset if appropriate
│
├─ Check: WebSocket disconnected?
│  ├─ Follow "WebSocket Disconnected" tree
│  └─ Action: Verify auto-reconnect working
│
└─ Check: Hitting rate limits?
   ├─ Action: Check API response headers
   ├─ Action: Reduce request rate
   └─ Action: Implement backoff

Emergency recovery:
1. Check logs for last successful operation
2. Reconcile state with exchange
3. Cancel stale orders
4. Restart with clean state
5. Monitor closely
```

## 🔧 Quick Diagnostic Commands

```bash
# Check if bot is running
ps aux | grep node

# Check logs
tail -f logs/bot.log

# Check WebSocket connection
netstat -an | grep :443 | grep ESTABLISHED

# Check environment
node -e "console.log(process.env.API_KEY ? 'Set' : 'Missing')"

# Test API connection
curl -X GET "https://gamma-api.polymarket.com/markets"

# Check package integrity
npm ls

# Run single test
npm test -- --run src/test/specific.test.ts

# Check build
npm run build

# Validate TypeScript
npx tsc --noEmit
```

## 📚 Related Documentation

- [Common Pitfalls](./common-pitfalls.md) - Detailed pitfall explanations
- [Project Layout](./project-layout.md) - Find relevant code
- [RUNBOOK](../RUNBOOK.md) - Operational procedures
- [ENVIRONMENT](../ENVIRONMENT.md) - Configuration details
