# Developer Quick Start: Implementing Gaps
## Fast-Track Guide for Closing Identified Gaps

**Audience:** Developers ready to implement  
**Time to read:** 5 minutes  
**Prerequisites:** Read GAPS_EXECUTIVE_SUMMARY.md first

---

## 🚀 Quick Decision Tree

```
START: Which path are you on?
│
├─ Path A (Quick Wins - 1 week)
│  ├─ Day 1: GAP-001 (Markets config) → Section A1
│  ├─ Day 2: GAP-002 (Strategy config) → Section A2
│  ├─ Day 3: GAP-016 (Deployment) → Section A3
│  └─ Day 4-5: GAP-017, 018 (Scripts) → Section A4
│
├─ Path B (Production - 1 month)
│  ├─ Week 1: Path A + Config vars → Sections A1-A5
│  ├─ Week 2: GAP-033 (Chaos tests) → Section B1
│  ├─ Week 3: GAP-041 (IaC) → Section B2
│  └─ Week 4: GAP-034 (Integration tests) → Section B3
│
├─ Path C (Enterprise - 3 months)
│  ├─ Month 1: Path B
│  ├─ Month 2: GAP-009, 010 (Strategy framework) → Section C1
│  └─ Month 3: Cloud features → Section C2
│
└─ Path D (Minimal - Deploy Now!)
   └─ You're done! Nothing to implement.
```

---

## Section A1: GAP-001 - Wire Markets Config (4 hours)

### Files to Edit
1. `apps/backend/src/config/index.ts` (3 locations)
2. `docs/environment.md` (1 addition)
3. `apps/backend/tests/unit/marketsConfig.test.ts` (new file)

### Step-by-Step (Copy-Paste Ready)

**Step 1:** Add to schema (line ~260):
```typescript
  MARKETS_CONFIG_PATH: optionalStringFromEnv(z.string().optional()),
```

**Step 2:** Add loading function (after parseConfig function):
```typescript
function loadMarketsConfig(filePath: string | undefined): MarketConfigEntry[] {
  if (!filePath) return [];
  
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    if (!fs.existsSync(absolutePath)) {
      logger.warn('Markets config file not found', { path: absolutePath });
      return [];
    }
    
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const data = JSON.parse(content);
    
    if (!Array.isArray(data)) {
      throw new Error('Markets config must be an array');
    }
    
    const schema = z.object({
      tokenId: z.string(),
      maxPositionSize: z.number().optional(),
      spread: z.number().optional(),
    });
    
    return data.map((entry, i) => {
      const result = schema.safeParse(entry);
      if (!result.success) {
        throw new Error(`Invalid market entry at index ${i}: ${result.error.message}`);
      }
      return result.data;
    });
  } catch (error) {
    logger.error('Failed to load markets config', { path: filePath, error });
    throw error;
  }
}
```

**Step 3:** Use in parseConfig (in return statement):
```typescript
  const marketsConfig = loadMarketsConfig(env.MARKETS_CONFIG_PATH);
  const tokenIds = marketsConfig.length > 0
    ? marketsConfig.map(m => m.tokenId)
    : env.TOKEN_IDS.split(',').filter((id) => id.trim() !== '');
  
  return {
    // ... existing fields ...
    tokenIds,
    markets: marketsConfig,
    marketsConfigPath: env.MARKETS_CONFIG_PATH,
  };
```

**Step 4:** Create test file:
```bash
touch apps/backend/tests/unit/marketsConfig.test.ts
# Copy test code from IMPLEMENTATION_PLAN.md Section GAP-001
```

**Step 5:** Test and verify:
```bash
npm test -- marketsConfig.test.ts
npm test  # Full suite
```

✅ **Done! Markets config now loads from JSON**

---

## Section A2: GAP-002 - Wire Strategy Config (4 hours)

### Repeat Section A1 Process

Same pattern as markets config:
1. Add `STRATEGY_CONFIG_PATH` to schema
2. Create `loadStrategyConfig()` function
3. Use in parseConfig
4. Write tests
5. Update docs

**Copy-paste the code from IMPLEMENTATION_PLAN.md GAP-002 section**

✅ **Done! Strategy config now loads from JSON**

---

## Section A3: GAP-016 - Deployment Workflow (2 hours)

### Files to Create
1. `.github/workflows/deploy.yml`
2. `scripts/deploy.sh`

### Quick Implementation

**Step 1:** Copy deploy.yml from IMPLEMENTATION_PLAN.md → `.github/workflows/deploy.yml`

**Step 2:** Copy deploy.sh from IMPLEMENTATION_PLAN.md → `scripts/deploy.sh`

**Step 3:** Make executable:
```bash
chmod +x scripts/deploy.sh
```

**Step 4:** Test locally:
```bash
./scripts/deploy.sh staging latest
```

✅ **Done! Deployment automated**

---

## Section A4: GAP-017 & GAP-018 - Scripts (4 hours)

### Files to Create
1. `scripts/pre-deploy-verify.sh`
2. `scripts/backup-db.sh`
3. `scripts/restore-db.sh`

### Quick Implementation

**Copy all three scripts from IMPLEMENTATION_PLAN.md**

```bash
# Copy scripts
# Make executable
chmod +x scripts/*.sh

# Test
./scripts/pre-deploy-verify.sh
./scripts/backup-db.sh
```

✅ **Done! Operational scripts ready**

---

## Section A5: GAP-003, 004, 005 - Config Vars (4 hours)

### Learning System Config

Add to schema:
```typescript
  LEARNING_SYSTEM_ENABLED: booleanFromEnv.default(false),
  BANDIT_ALGORITHM: z.enum(['epsilon-greedy', 'ucb1', 'thompson-sampling']).default('epsilon-greedy'),
  BANDIT_EXPLORATION_FACTOR: numberFromEnv(0.1, z.number().nonnegative().max(1)),
  BANDIT_MIN_TRADE_COUNT: numberFromEnv(10, z.number().int().positive()),
```

### WebSocket Config

Add to schema:
```typescript
  WS_RECONNECT_DELAY: numberFromEnv(1000, z.number().int().positive()),
  WS_HEARTBEAT_INTERVAL: numberFromEnv(30000, z.number().int().positive()),
```

Pass to WebSocket constructor in server initialization.

✅ **Done! All config vars wired**

---

## Section B1: GAP-033 - Chaos Tests (3 days)

### Day 1: WebSocket Failures

```bash
mkdir -p apps/backend/tests/chaos
touch apps/backend/tests/chaos/websocket-failures.test.ts
```

**Copy websocket chaos tests from IMPLEMENTATION_PLAN.md**

Key tests:
- Abrupt disconnection
- Message flood
- Malformed messages
- Rapid connect/disconnect
- Network timeout

### Day 2: API Failures

```bash
touch apps/backend/tests/chaos/api-failures.test.ts
```

Key tests:
- API downtime (503)
- Timeout cascade
- Rate limiting (429)
- Partial failures

### Day 3: Integration and Polish

```bash
touch apps/backend/tests/chaos/database-failures.test.ts
```

Add to package.json:
```json
"test:chaos": "vitest run tests/chaos"
```

Run:
```bash
npm run test:chaos
```

✅ **Done! Chaos tests catching failures**

---

## Section B2: GAP-041 - Infrastructure as Code (5 days)

### Day 1-2: Setup Terraform

```bash
mkdir -p infrastructure/aws
touch infrastructure/aws/{main.tf,ecs.tf,database.tf,monitoring.tf}
```

**Copy Terraform configs from IMPLEMENTATION_PLAN.md GAP-041**

### Day 3-4: Test Infrastructure

```bash
cd infrastructure/aws
terraform init
terraform plan
terraform apply  # To test environment
```

### Day 5: Documentation

Update docs/infrastructure.md with deployment instructions.

✅ **Done! Infrastructure reproducible**

---

## Section B3: GAP-034 - Integration Tests (5 days)

### Week Focus: E2E Testing

```bash
touch apps/backend/tests/integration/e2e-order-flow.test.ts
touch apps/backend/tests/integration/system-integration.test.ts
touch apps/backend/tests/integration/performance.test.ts
```

**Copy test code from IMPLEMENTATION_PLAN.md GAP-034**

Run:
```bash
npm run test:integration
```

✅ **Done! Comprehensive integration coverage**

---

## Section C1: GAP-009 & GAP-010 - Strategy Framework (2 weeks)

### Week 1: Strategy Abstraction

**Day 1-2:** Create StrategyBase
```bash
touch apps/backend/src/trading/StrategyBase.ts
touch apps/backend/src/trading/StrategyManager.ts
```

**Copy full implementations from IMPLEMENTATION_PLAN.md GAP-009**

**Day 3:** Create example strategy
```bash
mkdir -p apps/backend/src/trading/strategies
touch apps/backend/src/trading/strategies/SimpleMarketMaker.ts
```

**Day 4:** Integration
- Update server.ts to use StrategyManager
- Wire up event handlers

**Day 5:** Testing
```bash
touch apps/backend/tests/unit/StrategyBase.test.ts
touch apps/backend/tests/unit/StrategyManager.test.ts
```

### Week 2: Signal Engine

**Day 1-2:** Create SignalEngine
```bash
touch apps/backend/src/trading/SignalEngine.ts
```

**Copy implementation from IMPLEMENTATION_PLAN.md GAP-010**

**Day 3:** Integration with StrategyManager

**Day 4:** Testing
```bash
touch apps/backend/tests/unit/SignalEngine.test.ts
```

**Day 5:** Documentation
```bash
touch docs/strategy-framework.md
touch docs/signal-engine.md
```

✅ **Done! Multi-strategy support enabled**

---

## Section C2: GAP-038 - Cloud Secrets (1 week)

### Implement All Three Backends

**Day 1-2: AWS Secrets Manager**
```bash
npm install --workspace @polymarket/backend @aws-sdk/client-secrets-manager
```

Update `apps/backend/src/secrets/index.ts`:
- Remove stub implementation
- Add real AWS SDK code (see IMPLEMENTATION_PLAN.md)
- Add tests

**Day 3-4: Azure Key Vault**
```bash
npm install --workspace @polymarket/backend @azure/keyvault-secrets @azure/identity
```

Update secrets module with Azure implementation.

**Day 5: HashiCorp Vault**
```bash
npm install --workspace @polymarket/backend node-vault
```

Update secrets module with Vault implementation.

✅ **Done! All cloud backends working**

---

## Common Tasks Reference

### Running Tests
```bash
# All tests
npm test

# Specific file
npm test -- filename.test.ts

# Watch mode
npm test -- --watch

# Coverage
npm run test:coverage

# By type
npm run test:unit
npm run test:integration
npm run test:chaos
```

### Building
```bash
# Type check
npm run build

# Development
npm run dev

# Production
NODE_ENV=production npm start
```

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/gap-001-markets-config

# Make changes, test
npm test

# Commit with conventional commit
git add -A
git commit -m "feat: wire MARKETS_CONFIG_PATH loading

Addresses GAP-001 by implementing markets.json loading.
..."

# Push
git push -u origin feature/gap-001-markets-config

# Create PR on GitHub
```

### Documentation
```bash
# After code changes, update:
- docs/environment.md (if new env vars)
- docs/architecture.md (if architecture changes)
- docs/examples.md (if new features)
- README.md (if major changes)

# Check links
npm run check-links  # If script exists
```

---

## Troubleshooting

### Tests Fail After Changes

**Quick fixes:**
```bash
# Clear cache
rm -rf apps/backend/node_modules/.vite

# Reinstall
npm ci

# Run single failing test
npm test -- failing-test.test.ts --reporter=verbose

# Check TypeScript errors
npm run build
```

### Config Changes Break Startup

**Debug:**
```bash
# Check config parsing
node -e "const { parseConfig } = require('./apps/backend/dist/config'); try { const cfg = parseConfig(); console.log('Config OK'); } catch (e) { console.error('Config Error:', e.message); }"

# Validate JSON files
node -e "console.log(JSON.parse(require('fs').readFileSync('config/markets.json', 'utf-8')))"
```

### Import Errors After New Files

**Fix:**
```bash
# Ensure exports added
# Check tsconfig paths
# Restart TypeScript server in IDE
```

---

## Code Snippets

### Adding a New Config Var

**1. Schema (config/index.ts):**
```typescript
  MY_NEW_VAR: numberFromEnv(123, z.number().int().positive()),
```

**2. Interface (config/index.ts):**
```typescript
export interface Config {
  // ... existing ...
  myNewVar: number;
}
```

**3. Return statement (config/index.ts):**
```typescript
  return {
    // ... existing ...
    myNewVar: env.MY_NEW_VAR,
  };
```

**4. Documentation (.env.example):**
```bash
# My New Variable
# Description of what it does
# Default: 123
MY_NEW_VAR=123
```

**5. Test it:**
```bash
MY_NEW_VAR=456 npm run dev
# Check logs for new value
```

### Adding a New Test

**Template:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MyModule } from '../../src/path/to/module';

describe('MyModule', () => {
  let instance: MyModule;
  
  beforeEach(() => {
    instance = new MyModule();
  });
  
  it('should do something', () => {
    const result = instance.doSomething();
    expect(result).toBe(expected);
  });
  
  it('should handle errors', () => {
    expect(() => instance.doInvalid()).toThrow('Expected error message');
  });
});
```

### Adding a New API Endpoint

**In server/index.ts:**
```typescript
  if (method === 'GET' && url === '/my-endpoint') {
    try {
      const result = await myFunction();
      respondJson(res, 200, result, req);
    } catch (error) {
      logger.error('My endpoint failed', { error });
      respondJson(res, 500, { error: 'Internal server error' }, req);
    }
    return;
  }
```

---

## Testing Checklist

Before submitting PR:

- [ ] All tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] No TypeScript errors
- [ ] No lint errors: `npm run lint`
- [ ] Security audit clean: `npm audit --audit-level=high`
- [ ] New functionality has tests
- [ ] Coverage not decreased
- [ ] Documentation updated
- [ ] Examples added (if new feature)
- [ ] CHANGELOG.md updated (via conventional commits)

---

## PR Checklist

Your PR must have:

- [ ] **Descriptive title** (follows conventional commits)
- [ ] **Description** explaining the change
- [ ] **References issue/gap** (e.g., "Addresses GAP-001")
- [ ] **Test evidence** (screenshot of passing tests)
- [ ] **Documentation updates** listed
- [ ] **Breaking changes** noted (if any)
- [ ] **Review checklist** completed

**Example PR description:**
```markdown
# Wire MARKETS_CONFIG_PATH Loading

Addresses GAP-001 from comprehensive gaps analysis.

## Changes
- Add MARKETS_CONFIG_PATH to config schema
- Implement markets.json loading with validation
- Override TOKEN_IDS when markets.json provided
- Add per-market config to risk manager

## Testing
- All 1138 tests passing (5 new tests added)
- Validated with config/markets.json.example
- Tested invalid config rejection

## Documentation
- Updated docs/environment.md
- Updated docs/examples.md
- Added inline code comments

## Breaking Changes
None

## Checklist
- [x] Tests pass
- [x] Build succeeds
- [x] Documentation updated
- [x] Security audit clean
```

---

## Time Estimates (Reference)

### Quick Tasks (1-4 hours)
- Add single config var
- Update documentation
- Create simple script
- Add basic tests

### Medium Tasks (1-2 days)
- Load JSON config
- Add deployment workflow
- Create chaos test suite
- Wire config through system

### Large Tasks (3-7 days)
- Strategy framework
- Infrastructure as Code
- Cloud secret backends
- Comprehensive integration tests

### Epic Tasks (1-3 weeks)
- Complete strategy framework + signal engine
- Full testing suite (chaos + integration + performance)
- Multi-strategy orchestration + learning system

---

## Priority Matrix (What to Do When)

### If Production is Urgent (1 week)
1. GAP-001, 002 (config files)
2. GAP-017, 018 (scripts)
3. GAP-016 (deployment)
4. Deploy!

### If Production is Soon (1 month)
1. Week 1: Config improvements
2. Week 2: Chaos tests
3. Week 3: IaC
4. Week 4: Integration tests + deploy

### If Building for Scale (3 months)
1. Month 1: Operational improvements
2. Month 2: Strategy framework
3. Month 3: Cloud features + learning system

---

## Dependencies Map

```
GAP-009 (Strategy Abstraction)
  ├─ Blocks: GAP-010, 012, 013, 045, 046
  └─ Required by: Multi-strategy features

GAP-010 (Signal Engine)
  ├─ Requires: GAP-009
  └─ Enables: Coordinated strategy execution

GAP-002 (Strategy Config)
  ├─ Required by: GAP-011 (hot-reload)
  └─ Enhances: GAP-009 (strategy framework)

GAP-041 (IaC)
  ├─ Required by: GAP-043 (staging)
  └─ Enables: Reproducible deployment

GAP-012 (Backtest Integration)
  ├─ Requires: GAP-009
  └─ Enables: GAP-046 (validation)

All others: Independent (can implement in any order)
```

---

## Quality Gates

### Before Moving to Next Gap

- ✅ All existing tests still pass
- ✅ New tests added for new functionality
- ✅ Code reviewed (self-review minimum)
- ✅ Documentation updated
- ✅ No console.log or debug code left
- ✅ No TypeScript errors or warnings
- ✅ Git commit with good message

### Before Merging PR

- ✅ All tests pass in CI
- ✅ Security scan clean
- ✅ Approved by reviewer
- ✅ All comments addressed
- ✅ Documentation complete
- ✅ Breaking changes communicated

### Before Deployment

- ✅ Pre-deployment script passes
- ✅ Staging environment tested
- ✅ Monitoring configured
- ✅ Rollback plan ready
- ✅ Team notified

---

## Common Patterns

### Pattern 1: Adding Feature Flag

```typescript
// In config
MY_FEATURE_ENABLED: booleanFromEnv.default(false),

// In code
if (config.myFeatureEnabled) {
  // New behavior
} else {
  // Old behavior
}
```

### Pattern 2: Loading JSON Config

```typescript
function loadConfig(path?: string): ConfigType[] {
  if (!path) return [];
  const content = fs.readFileSync(path, 'utf-8');
  const data = JSON.parse(content);
  return validateSchema(data);
}
```

### Pattern 3: Adding Metric

```typescript
// In utils/metrics.ts
export const myMetric = new promClient.Counter({
  name: 'polymarket_my_metric_total',
  help: 'Description',
  labelNames: ['label1', 'label2'],
  registers: [register],
});

// In code
myMetric.inc({ label1: 'value1', label2: 'value2' });
```

### Pattern 4: Adding Test

```typescript
describe('Feature', () => {
  it('should work normally', () => {
    expect(feature.doThing()).toBe(expected);
  });
  
  it('should handle errors', () => {
    expect(() => feature.doInvalid()).toThrow();
  });
  
  it('should respect config', () => {
    const feature = new Feature({ option: true });
    expect(feature.behavior()).toBe(withOption);
  });
});
```

---

## Developer Workflow

### Starting a Gap

1. Read gap description in COMPREHENSIVE_GAPS_REPORT.md
2. Read detailed plan in IMPLEMENTATION_PLAN.md
3. Create feature branch: `git checkout -b feature/gap-XXX`
4. Follow step-by-step instructions
5. Test frequently: `npm test -- relevant.test.ts --watch`

### During Implementation

1. Commit frequently (every 1-2 hours)
2. Run tests after each change
3. Update docs as you code (not at the end)
4. Ask questions in PR comments
5. Use conventional commits

### Finishing a Gap

1. Full test suite: `npm test`
2. Build check: `npm run build`
3. Security audit: `npm audit --audit-level=high`
4. Self-review code
5. Update GAPS_EXECUTIVE_SUMMARY.md (mark as done)
6. Push and create PR
7. Address review comments
8. Merge after approval

---

## Resources

### Key Files
- **Implementation guide:** IMPLEMENTATION_PLAN.md (4200+ lines)
- **Gap analysis:** COMPREHENSIVE_GAPS_REPORT.md
- **This guide:** DEVELOPER_QUICK_START.md

### Code Examples
- All gaps have copy-paste ready code in IMPLEMENTATION_PLAN.md
- Look for ` ```typescript` blocks
- Tests included for most gaps

### Getting Help
- **Architecture:** docs/architecture.md, docs/adr/
- **Security:** docs/security.md
- **Testing:** docs/testing.md
- **AI Agent:** docs/AI_AGENT_WORKFLOW.md

---

## Quick Wins (High ROI)

### Top 5 Easiest Improvements (1 week total)

| # | Gap | Time | Files | Impact |
|---|-----|------|-------|--------|
| 1 | GAP-001 | 4h | 3 files | Config from JSON |
| 2 | GAP-002 | 4h | 3 files | Strategy from JSON |
| 3 | GAP-016 | 2h | 2 files | Automated deployment |
| 4 | GAP-017 | 2h | 1 file | Pre-deploy checks |
| 5 | GAP-018 | 2h | 2 files | Automated backups |

**Total:** 14 hours for massive operational improvement

### Top 3 Highest Impact (2 weeks total)

| # | Gap | Time | Impact |
|---|-----|------|--------|
| 1 | GAP-033 | 3 days | Production confidence |
| 2 | GAP-009 | 5 days | Multi-strategy support |
| 3 | GAP-041 | 5 days | Cloud-native deployment |

**Choose based on your needs**

---

## Final Checklist

### Before Starting
- [ ] Read GAPS_EXECUTIVE_SUMMARY.md
- [ ] Choose your path (A, B, C, or D)
- [ ] Understand which gaps apply to you
- [ ] Have IMPLEMENTATION_PLAN.md open for reference

### During Implementation
- [ ] Follow step-by-step instructions
- [ ] Copy code examples (don't reinvent)
- [ ] Test after every change
- [ ] Commit frequently with good messages
- [ ] Update docs alongside code

### Before Finishing
- [ ] All tests pass
- [ ] Documentation complete
- [ ] PR created with evidence
- [ ] Ready for review

### After Merge
- [ ] Update STATUS.md
- [ ] Mark gap as complete in tracking
- [ ] Notify team
- [ ] Move to next gap

---

## Success Metrics

You know you're doing well when:

✅ Tests keep passing (count going up, not down)  
✅ Documentation stays current (no drift)  
✅ PRs are small and focused (one gap at a time)  
✅ Changes are backward compatible  
✅ No regressions introduced  
✅ Team velocity is steady  

---

## Remember

1. **System already works** - Don't break it!
2. **Test everything** - No change without tests
3. **Document as you go** - Not at the end
4. **Small PRs** - Easier to review
5. **Ask questions** - Better than guessing

---

## Get Started Now

**Ready to implement? Pick one:**

🟢 **Easy Start:** GAP-001 (Markets config) - 4 hours, high impact  
🟠 **Medium Start:** GAP-033 (Chaos tests) - 3 days, confidence builder  
🔴 **Advanced Start:** GAP-009 (Strategy framework) - 5 days, transformative  

**All detailed instructions in IMPLEMENTATION_PLAN.md**

**Good luck! 🚀**

---

**Document Version:** 1.0  
**For:** Developers implementing gaps  
**Next:** Open IMPLEMENTATION_PLAN.md and start coding  
**Support:** See docs/ folder for detailed guides
