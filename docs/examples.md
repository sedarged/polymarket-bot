# CLI Examples

## List Markets

### Command
```bash
npm run markets -- --limit 3
```

### Expected Output
```
Active Markets (3):

1. Will Donald Trump win the 2024 US Presidential Election?
   - Yes: Token ID 21742633143463906290569050155826241533067272736897614950488156847949938836455
   - No: Token ID 48331043336612883890938759509493159234755048973500640148014422747788308965732

2. Will Bitcoin reach $100,000 by December 31, 2024?
   - Yes: Token ID 71699307064468990184267518009575498516742703854809654704956126688955686645575
   - No: Token ID 52114319501245915516055106046884209969926127482827954674443846877344696008621

3. Will the Fed cut interest rates in 2024?
   - Yes: Token ID 16678291189211314787145083999015737376658799626183230671758641503291735614088
   - No: Token ID 23967014605127273323537820084096502825231142646370853869524476246146721629607
```

## Get Orderbook

### Command
```bash
npm run book -- --tokenId 21742633143463906290569050155826241533067272736897614950488156847949938836455
```

### Expected Output
```
Token ID: 21742633143463906290569050155826241533067272736897614950488156847949938836455
Best Bid: 0.5500
Best Ask: 0.5600
Mid Price: 0.5550
Spread: 0.0100
```

## Development Mode

You can also use the dev command to run without building:

```bash
npm run dev markets -- --limit 5
npm run dev book -- --tokenId <TOKEN_ID>
```

## Testing

Run the test suite:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Run tests with coverage:
```bash
npm run test:coverage
```

## Error Handling

The CLI includes comprehensive error handling with retry logic:

```bash
npm run markets -- --limit 5
```

If the API is unreachable, you'll see retry attempts:
```
[2026-01-30T00:00:00.000Z] WARN: Attempt 1/3 failed: getaddrinfo ENOTFOUND gamma-api.polymarket.com
[2026-01-30T00:00:01.000Z] WARN: Attempt 2/3 failed: getaddrinfo ENOTFOUND gamma-api.polymarket.com
[2026-01-30T00:00:03.000Z] WARN: Attempt 3/3 failed: getaddrinfo ENOTFOUND gamma-api.polymarket.com
[2026-01-30T00:00:03.001Z] ERROR: Failed to fetch markets: ...
```

The retry mechanism uses exponential backoff to avoid overwhelming the API.
