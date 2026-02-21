# UMA Resolution & Dispute Process

**Version:** 1.0  
**Last Updated:** 2026-02-21  
**Audience:** All users - technical and non-technical

---

## 📋 Table of Contents

- [Overview](#overview)
- [What is UMA?](#what-is-uma)
- [Resolution Process](#resolution-process)
- [Roles & Responsibilities](#roles--responsibilities)
- [Timelines & SLAs](#timelines--slas)
- [Bot Implications](#bot-implications)
- [FAQ & Troubleshooting](#faq--troubleshooting)
- [Resources & References](#resources--references)

---

## Overview

### What is Market Resolution?

When a prediction market on Polymarket closes (e.g., "Will Bitcoin reach $100,000 by December 31?"), someone must determine the correct outcome:
- **YES** - Event happened → YES shares pay $1.00, NO shares pay $0
- **NO** - Event didn't happen → NO shares pay $1.00, YES shares pay $0

This process is called **market resolution** and is handled by UMA's Optimistic Oracle.

### Why This Matters

**For All Users:**
- Determines if you won or lost your bet
- Controls when you can redeem shares for USDC
- Can cause delays if disputes occur

**For Bot Operators:**
- Affects when capital is freed up for new trades
- Requires settlement buffer in capital planning
- May need manual intervention for redemption

---

## What is UMA?

**UMA (Universal Market Access)** is a decentralized protocol that provides an **Optimistic Oracle** service. Think of it as a referee system for determining real-world outcomes in a trustless, blockchain-based way.

### Key Principles

1. **Optimistic by Default**  
   Outcomes are assumed correct unless challenged

2. **Economic Incentives**  
   Bonds ensure honesty (lose money for wrong answers)

3. **Community Governance**  
   Token holders vote if disputes occur

4. **Decentralized Truth**  
   No single authority controls outcomes

---

## Resolution Process

### Normal Resolution (No Dispute)

```
┌─────────────────┐
│  Market Closes  │ ← Trading stops
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Outcome Proposed│ ← Someone proposes result (posts bond)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Liveness Period │ ← 2 hours to several days
│  (Challenge OK) │    Anyone can dispute
└────────┬────────┘
         │
         │ ✅ No disputes
         ▼
┌─────────────────┐
│ Auto-Acceptance │ ← Outcome finalized
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Shares Unlock  │ ← Winners can redeem for $1.00 USDC
└─────────────────┘
```

**Typical Timeline:** 2-24 hours from market close to redemption

### Disputed Resolution

```
┌─────────────────┐
│ Outcome Proposed│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  🚨 DISPUTE!    │ ← Someone challenges (posts counter-bond)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Escalation to  │ ← Goes to UMA Data Verification Mechanism
│   DVM Voting    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ UMA Tokenholders│ ← 48-96 hour voting period
│ Analyze & Vote  │    Evidence discussed on Discord
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Vote Results   │ ← Majority wins
│    Finalized    │    Loser forfeits bond
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Shares Unlock  │ ← Winners can redeem
└─────────────────┘
```

**Disputed Timeline:** 48-96 hours (or more) from dispute to resolution

### Step-by-Step: Proposing an Outcome

1. **Market Closes**  
   Trading ends at scheduled time

2. **Waiting Period**  
   Usually a brief pause to ensure event has concluded

3. **Proposer Posts Bond**  
   Someone (often market creator or bot) submits proposed outcome with collateral

4. **Bond Amount**  
   Varies by market, typically a few hundred to thousands of USDC

5. **Liveness Period Begins**  
   Clock starts for potential challenges

6. **Monitoring**  
   Community watches for incorrect proposals

### Step-by-Step: Disputing an Outcome

1. **Identify Wrong Proposal**  
   You believe the proposed outcome is incorrect

2. **Gather Evidence**  
   Collect proof (news articles, official statements, data)

3. **Post Dispute Bond**  
   Must match or exceed proposer's bond

4. **Submit Dispute**  
   Call smart contract function to challenge

5. **DVM Vote Triggered**  
   Escalates to UMA token holder voting

6. **Present Evidence**  
   Share proof in UMA Discord, forums

7. **Wait for Vote**  
   48-96 hours for voting period

8. **Outcome Determined**  
   Majority vote decides; winner keeps bonds

---

## Roles & Responsibilities

### 1. Market Creator

**Responsibilities:**
- Define clear, unambiguous market question
- Provide resolution source upfront (e.g., "Per CoinGecko data")
- May propose outcome (optional)
- Pay market creation costs

**Not Responsible For:**
- Guaranteeing specific resolution time
- Resolving disputes (handled by UMA)

### 2. Proposer

**Who:** Anyone can propose, typically:
- Market creator
- Polymarket team
- Automated bots
- Community members

**Responsibilities:**
- Monitor for market close
- Verify correct outcome from trusted source
- Post bond (collateral)
- Propose outcome on-chain
- Risk losing bond if wrong

**Incentives:**
- Keep bond if correct and unchallenged
- Earn reward for honest proposals

### 3. Disputer

**Who:** Anyone can dispute if they believe proposal is wrong

**Responsibilities:**
- Monitor proposed outcomes
- Post counter-bond to challenge
- Provide evidence for correct outcome
- Participate in DVM voting discussion

**Risks:**
- Lose bond if dispute fails
- Tie up capital during voting

**Incentives:**
- Win proposer's bond if correct
- Protect market integrity
- Earn reputation

### 4. UMA Token Holders

**Who:** Holders of $UMA tokens

**Responsibilities (if dispute occurs):**
- Review evidence from both sides
- Vote on correct outcome
- Act as ultimate arbiters of truth

**Incentives:**
- Earn voting rewards
- Maintain UMA protocol value
- See all evidence before voting

### 5. Bot Operator (You)

**Responsibilities:**
- Understand resolution delays
- Plan for capital lockup during disputes
- Monitor positions approaching resolution
- Decide whether to auto-redeem or manual redeem
- Track settlement status

**Not Responsible For:**
- Proposing outcomes (optional)
- Disputing (optional, but can participate)
- Voting in DVM (need $UMA tokens)

---

## Timelines & SLAs

### Expected Resolution Times

| Scenario | Timeline | Notes |
|----------|----------|-------|
| **Normal (No Dispute)** | 2-24 hours | Most common (>95% of markets) |
| **Short Liveness** | 2-6 hours | Fast markets (e.g., 15-min crypto) |
| **Standard Liveness** | 12-24 hours | Most prediction markets |
| **Disputed Resolution** | 48-96 hours | From dispute to DVM vote completion |
| **Complex Disputes** | 96+ hours | Multiple rounds, unclear evidence |

### Buffer Recommendations

**For Trading Bots:**
- **Minimum buffer:** 24 hours after event conclusion
- **Conservative buffer:** 96 hours (4 days) for capital planning
- **Risk capital only:** Don't trade with money needed within 1 week

**Why Buffers Matter:**
- Cannot redeem shares until resolution finalizes
- Capital locked during dispute period
- Need liquidity for new opportunities

### No Guaranteed SLAs

**Important:** UMA and Polymarket do **not guarantee** specific resolution times:
- Proposals depend on community action
- Disputes can extend indefinitely (rare)
- Technical issues can delay voting
- No customer support for faster resolution

**Recommendation:** Plan for worst-case timelines

---

## Bot Implications

### Capital Management

**Challenge:** Funds locked in resolved positions

**Solutions:**
1. **Reserve Buffer**  
   Keep 25-50% capital free at all times

2. **Stagger Expirations**  
   Don't concentrate all trades in same expiry

3. **Early Exit**  
   Close positions before resolution when possible

4. **Monitor Resolution**  
   Track markets approaching close

### Auto-Redemption

**Current Implementation:**
- ❌ Bot does NOT auto-redeem winning shares
- ⚠️ Manual redemption required via Polymarket UI or API

**Why Manual?**
- Avoid on-chain gas costs
- Wait for bulk redemption
- Verify outcome before claiming
- Reduce transaction overhead

**Future Enhancement (Optional):**
```typescript
// Pseudo-code for auto-redemption
async function monitorAndRedeem() {
  const positions = await getOpenPositions();
  
  for (const position of positions) {
    if (position.marketResolved && position.isWinner) {
      // Wait for settlement buffer (e.g., 24 hours post-resolution)
      if (Date.now() - position.resolutionTime > 24 * 60 * 60 * 1000) {
        await redeemPosition(position.conditionId);
      }
    }
  }
}
```

**Recommendation:** Monitor manually for first few months, then implement auto-redemption if needed.

### Strategy Considerations

**Market Making:**
- Avoid markets resolving within your position hold time
- Close positions 24-48 hours before resolution
- Price in resolution risk

**Arbitrage:**
- Internal arb positions must hold to resolution
- Factor 48-96 hour capital lock into ROI
- Ensure both legs settle simultaneously

**Directional Trading:**
- Can exit anytime before resolution
- Resolution timing less critical
- Watch for last-minute odds shifts

### Risk Management

**Resolution Delays:**
- Don't trade with money needed urgently
- Maintain liquidity buffer for opportunities
- Track positions approaching expiry

**Dispute Risk:**
- Controversial markets more likely disputed
- Political/subjective events higher risk
- Price in potential delays

**Redemption Failures:**
- Smart contract bugs (rare)
- Network congestion (during high gas)
- Account restrictions

---

## FAQ & Troubleshooting

### General Questions

#### Q: How long does resolution take?
**A:** Typically 2-24 hours without disputes, 48-96 hours if disputed. Always plan for 96+ hour buffer.

#### Q: Can I speed up resolution?
**A:** No. Resolution is community-driven. You can propose an outcome yourself (requires bond), but cannot force faster acceptance.

#### Q: What if the wrong outcome is proposed?
**A:** You can dispute by posting a bond. This escalates to UMA token holder voting.

#### Q: Do I need UMA tokens?
**A:** Not for trading or redemption. Only needed if you want to vote in disputes (DVM).

#### Q: Can disputes fail?
**A:** Yes. If not enough voters participate or evidence is unclear, disputes can result in "no resolution" requiring re-proposal.

### Trading Bot Questions

#### Q: Should my bot auto-redeem?
**A:** Not initially. Manual redemption gives you control and avoids gas fees. Consider implementing after 3-6 months of operation.

#### Q: How do I check resolution status?
**A:** Query Polymarket API or Gamma API for market status:
```bash
# Check if market resolved
curl "https://gamma-api.polymarket.com/markets/<market_id>"
# Look for "closed": true and resolution data
```

#### Q: What if my position isn't redeemable?
**A:** Wait 24-48 hours post-resolution. If still unavailable:
1. Check market resolution status
2. Verify on Polymarket UI
3. Contact Polymarket support
4. Check for ongoing disputes

#### Q: Can I trade during resolution?
**A:** No. Trading closes when market closes. Positions are locked until resolution.

#### Q: Should I close before resolution?
**A:** **Pros:** Get capital back faster, avoid resolution risk  
**Cons:** Miss payout, may exit early if winning

Most bots should exit **before resolution** unless strategy requires holding (e.g., arbitrage).

### Technical Issues

#### Q: Resolution status not updating
**A:** 
1. Check API rate limits
2. Verify market ID is correct
3. Wait 5-10 minutes and retry
4. Check Polymarket status page

#### Q: Redemption transaction fails
**A:**
1. Verify you hold winning shares
2. Check wallet has MATIC for gas
3. Ensure market fully resolved (not in dispute)
4. Try via Polymarket UI

#### Q: How to monitor resolution programmatically?
**A:**
```typescript
// Example: Poll resolution status
async function checkResolution(marketId: string): Promise<boolean> {
  const market = await gammaApi.getMarket(marketId);
  return market.closed && market.resolved;
}

// Check every hour
setInterval(async () => {
  const resolved = await checkResolution('your-market-id');
  if (resolved) {
    console.log('Market resolved, can redeem now');
  }
}, 60 * 60 * 1000);
```

### Dispute Scenarios

#### Q: Market resolved incorrectly, what do I do?
**A:**
1. **Act fast:** Liveness period is short (2-24 hours)
2. **Gather evidence:** Screenshots, official sources, timestamps
3. **Calculate bond cost:** Ensure economic sense to dispute
4. **Post dispute:** Via Polymarket UI or smart contract
5. **Engage community:** Share evidence in UMA Discord

#### Q: How much does disputing cost?
**A:** Typically matches proposer's bond (few hundred to thousands USDC). You get it back if you win, plus proposer's bond.

#### Q: Is disputing profitable?
**A:** Only if:
- You're confident you're correct (with evidence)
- Your position value > bond cost
- Willing to wait 48-96 hours

Not recommended as a primary strategy—only when legitimately wrong.

#### Q: Can I dispute maliciously?
**A:** **No.** You'll lose your bond and damage your reputation. UMA token holders review evidence and vote fairly.

---

## Resources & References

### Official Documentation

- **UMA Protocol Overview:**  
  https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work

- **Polymarket Resolution Guide:**  
  https://docs.polymarket.com/developers/resolution/UMA

- **Polymarket Market Resolution Explained:**  
  https://docs.polymarket.com/polymarket-learn/markets/how-are-markets-resolved

### Community Resources

- **UMA Discord:**  
  Main channel for dispute discussions, evidence sharing, voting coordination

- **Polymarket Discord:**  
  Market-specific discussions, community resolution debates

- **PolyNoob - UMA Disputes Explained:**  
  https://polynoob.com/uma-dispute-polymarket/

- **Polymarket Review - Resolution Dispute Guide:**  
  https://polymarket.review/guides/resolution-dispute.html

- **PredictPedia - UMA Optimistic Oracle:**  
  https://predictpedia.com/wiki/uma-optimistic-oracle

### Related Documentation (This Repo)

- **[Runbook](./runbook.md)** - Resolution section for operational procedures
- **[Compliance Guide](./compliance.md)** - Legal and ToS implications
- **[Architecture Overview](./architecture-overview.md)** - How markets work
- **[Troubleshooting Guide](./troubleshooting.md)** - Common issues and solutions

### Smart Contracts

- **UMA Optimistic Oracle V3:**  
  On Polygon mainnet (check official UMA docs for latest addresses)

- **Polymarket CTF Contracts:**  
  Market and outcome token contracts

### API Endpoints

```bash
# Check market resolution status
GET https://gamma-api.polymarket.com/markets/{market_id}

# Get all markets (filter by closed/resolved)
GET https://gamma-api.polymarket.com/markets?closed=true

# CLOB API - market metadata
GET https://clob.polymarket.com/markets/{condition_id}
```

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-21 | 1.0 | Initial documentation (GAP-018) |

---

## Feedback & Updates

This document will be updated as:
- UMA protocol changes
- Polymarket resolution process evolves
- Community best practices emerge
- Bot implementation patterns mature

**Contributions welcome:** Open an issue or PR with updates, corrections, or additional FAQs.

---

**Last Updated:** 2026-02-21  
**Maintainer:** Polymarket Bot Contributors  
**Issue Reference:** [GAP-018] UMA Resolution Documentation
