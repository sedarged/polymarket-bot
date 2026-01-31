# GitHub Marketplace & Development Tools Setup

**Last Updated:** 2026-01-31  
**Repository:** sedarged/polymarket-bot

## Overview

This document provides comprehensive setup instructions for GitHub Marketplace apps and development tools used in this repository. It includes step-by-step installation guides for AI code review tools, test generators, and other automation tools.

---

## Current Tool Status

### ✅ Active Tools

1. **Codecov** - Code coverage reporting
   - Status: ✅ Installed and configured
   - Workflow: `.github/workflows/codecov.yml`
   - Configuration: Working correctly with Vitest coverage
   
2. **Issue Label Bot** - Automatic issue labeling
   - Status: ✅ Installed and configured
   - Configuration: `.github/issue-label-bot.yml`
   - Labels: bug, feature, trading, compliance, websocket, critical, performance, documentation

3. **GitHub Actions** - CI/CD automation
   - Status: ✅ Active
   - Workflows: Test coverage on push/PR to main branch

### ⚠️ Missing Tools

1. **AI Code Review / Test Generation Tool** (e.g., Qodo Merge, formerly PR-Agent)
   - Status: ❌ NOT INSTALLED
   - Required for: Automated code reviews, test generation, PR descriptions
   - Action Required: Install recommended tool (see below)

---

## 🤖 AI Code Review & Test Generation Tools

### Recommended Options for 2026 (Free for Public Repos)

#### Option 1: **Qodo Merge (Recommended)** ⭐

**About:** Qodo Merge (formerly PR-Agent) is an AI-powered code review tool that automatically reviews PRs, suggests improvements, generates tests, and creates detailed PR descriptions.

**Features:**
- ✅ Automatic PR reviews with inline comments
- ✅ Test generation suggestions
- ✅ PR description auto-generation
- ✅ Code quality checks
- ✅ Security vulnerability detection
- ✅ Free for public repositories

**Installation Steps:**

1. **Install from GitHub Marketplace:**
   - Visit: https://github.com/apps/qodo-merge
   - Click **"Install it for free"**
   - Select **"Only select repositories"**
   - Choose: `sedarged/polymarket-bot`
   - Click **"Install"**

2. **Configure Qodo Merge (Optional):**
   
   Create `.github/qodo-merge.toml` for custom settings:
   
   ```toml
   [pr_reviewer]
   # Enable automatic review on PR creation
   automatic_review = true
   # Require PR reviewer approval before merge
   require_all_thresholds_for_approval = true
   
   [pr_description]
   # Auto-generate PR descriptions
   auto_generate = true
   
   [pr_code_suggestions]
   # Auto-suggest code improvements
   auto_review = true
   
   [pr_test_generation]
   # Generate test suggestions
   enable = true
   testing_framework = "vitest"
   ```

3. **First Use:**
   - Create a new PR or update an existing one
   - Qodo Merge will automatically:
     - Review the code
     - Add inline comments for improvements
     - Suggest tests
     - Generate/update PR description
   - You can also trigger manually by commenting `/review` on any PR

4. **Available Commands (comment on PR):**
   - `/review` - Trigger full code review
   - `/describe` - Generate PR description
   - `/improve` - Suggest code improvements
   - `/test` - Generate test suggestions
   - `/update_changelog` - Update CHANGELOG.md
   - `/help` - Show all available commands

#### Option 2: **GitHub Copilot for Pull Requests**

**About:** Built-in GitHub feature (requires GitHub Copilot subscription)

**Features:**
- ✅ AI-generated PR descriptions
- ✅ Code review summaries
- ✅ Integrated with GitHub UI

**Installation:**
- Requires GitHub Copilot Individual/Business/Enterprise subscription
- Enable in repository settings: Settings → Code review → Copilot

**Cost:** Not free - requires subscription ($10/month individual)

#### Option 3: **CodeRabbit**

**About:** AI-powered code review assistant

**Features:**
- ✅ Line-by-line code reviews
- ✅ Security analysis
- ✅ Best practice suggestions
- ✅ Free for open-source projects

**Installation:**
- Visit: https://github.com/apps/coderabbit
- Follow same installation process as Qodo Merge

#### Option 4: **Codacy**

**About:** Automated code quality and coverage tool

**Features:**
- ✅ Code quality analysis
- ✅ Security scanning
- ✅ Technical debt tracking
- ✅ Free for open-source

**Installation:**
- Visit: https://github.com/apps/codacy
- Connect your repository

---

## 📋 Complete Setup Checklist

Use this checklist to verify all marketplace and development tools are properly configured:

### Core Development Tools

- [ ] **Node.js 20+** installed locally
- [ ] **npm** package manager working
- [ ] Repository cloned: `git clone https://github.com/sedarged/polymarket-bot.git`
- [ ] Dependencies installed: `npm install`
- [ ] Tests passing: `npm test`
- [ ] Dev mode working: `npm run dev`

### GitHub Actions & CI/CD

- [x] **Codecov** integration active
  - Verify: Check that PRs show coverage reports
  - Token configured in repository secrets: `CODECOV_TOKEN`
  
- [x] **Test Coverage Workflow** running
  - File: `.github/workflows/codecov.yml`
  - Triggers: On push to main, on PRs to main
  - Verify: Check Actions tab for recent runs

### GitHub Apps & Automation

- [x] **Issue Label Bot** installed and configured
  - File: `.github/issue-label-bot.yml`
  - Test: Create an issue with keywords like "bug" or "feature"
  - Verify: Labels are automatically applied

- [ ] **AI Code Review Tool** (Qodo Merge recommended)
  - Install from: https://github.com/apps/qodo-merge
  - Test: Create a PR and verify automatic review
  - Verify: PR gets comments and suggestions

### Security & Code Quality

- [ ] **Dependabot** enabled (GitHub Security features)
  - Enable in: Settings → Code security and analysis
  - Turn on: Dependabot alerts, security updates, version updates

- [ ] **Code Scanning** (CodeQL) enabled
  - Enable in: Settings → Code security and analysis → Code scanning
  - Recommended for TypeScript/JavaScript security

- [ ] **Secret Scanning** enabled
  - Enable in: Settings → Code security and analysis
  - Prevents committing secrets (.env files, API keys)

### Documentation & Standards

- [x] **README.md** complete and up-to-date
- [x] **CONTRIBUTING.md** exists (if public contributions expected)
- [x] **LICENSE** file present (ISC license)
- [x] **Code of Conduct** (optional, recommended for open-source)

### Environment & Secrets

- [ ] **.env.example** present with all required variables
- [ ] **.gitignore** includes `.env`, `node_modules`, `dist`, `coverage`
- [ ] **GitHub Secrets** configured (if needed):
  - `CODECOV_TOKEN` ✅ (already set)
  - Add others as needed for deployment

---

## 🔧 Troubleshooting

### Qodo Merge Not Working

**Issue:** PR created but no automatic review appears

**Solutions:**
1. Check that the app is installed for your repository
2. Verify you have PR permissions (not available for forks from outside collaborators)
3. Try manual trigger: Comment `/review` on the PR
4. Check GitHub App permissions in repository settings

**Issue:** Installation link doesn't work (404 error)

**Solutions:**
1. Qodo Merge may have changed URLs - try searching "Qodo Merge GitHub Marketplace"
2. Alternative: Use direct link https://github.com/marketplace
3. Search for "PR-Agent" or "Qodo" in marketplace
4. Consider alternatives like CodeRabbit or Codacy

### Codecov Not Reporting Coverage

**Issue:** Coverage not showing on PRs

**Solutions:**
1. Verify `CODECOV_TOKEN` is set in repository secrets
2. Check that tests run successfully in GitHub Actions
3. Ensure coverage files are generated: `./apps/backend/coverage/coverage-final.json`
4. Review workflow logs in Actions tab

### Issue Label Bot Not Working

**Issue:** Labels not automatically applied to issues

**Solutions:**
1. Verify `.github/issue-label-bot.yml` is present and valid YAML
2. Check that issue keywords match those in configuration
3. Labels must exist in repository (create them if missing)
4. Test with a new issue containing clear keywords like "bug" or "feature"

---

## 📚 Additional Resources

### Official Documentation

- **Qodo Merge (PR-Agent):** https://qodo-merge-docs.qodo.ai/
- **GitHub Marketplace:** https://github.com/marketplace
- **GitHub Actions:** https://docs.github.com/en/actions
- **Codecov:** https://docs.codecov.com/docs

### Polymarket Bot Specific

- **Master Development Plan:** [/MASTER_DEVELOPMENT_PLAN.md](../MASTER_DEVELOPMENT_PLAN.md)
- **System Overview:** [/SYSTEM_OVERVIEW.md](../SYSTEM_OVERVIEW.md)
- **Implementation Checklist:** [/docs/IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md)
- **Runbook:** [/docs/RUNBOOK.md](./RUNBOOK.md)

---

## 🎯 Recommended Setup for New Contributors

If you're setting up this repository for the first time, follow this order:

1. ✅ **Clone and install dependencies**
   ```bash
   git clone https://github.com/sedarged/polymarket-bot.git
   cd polymarket-bot
   npm install
   ```

2. ✅ **Verify tests pass**
   ```bash
   npm test
   ```

3. ✅ **Run development mode**
   ```bash
   npm run dev
   ```

4. ⚠️ **Install Qodo Merge** (or alternative AI code review tool)
   - Visit: https://github.com/apps/qodo-merge
   - Install for this repository

5. ✅ **Enable GitHub security features**
   - Go to: Settings → Code security and analysis
   - Enable: Dependabot, Code scanning, Secret scanning

6. ✅ **Read documentation**
   - Start with: [SYSTEM_OVERVIEW.md](../SYSTEM_OVERVIEW.md)
   - Then read: [MASTER_DEVELOPMENT_PLAN.md](../MASTER_DEVELOPMENT_PLAN.md)

---

## 📝 Notes for Repository Owner

- **Action Required:** Install Qodo Merge from https://github.com/apps/qodo-merge
- **Alternative:** If Qodo Merge link doesn't work, consider CodeRabbit as free alternative
- **Security:** Enable Dependabot and Code Scanning for better security
- All other marketplace tools are functioning correctly ✅

---

## Summary

**What's Working:**
- ✅ Codecov - Coverage reporting active
- ✅ Issue Label Bot - Auto-labeling functional  
- ✅ GitHub Actions - CI/CD running
- ✅ Test infrastructure - Vitest configured

**What Needs Setup:**
- ⚠️ AI Code Review Tool - Install Qodo Merge or alternative
- 💡 Optional: Enable Dependabot and Code Scanning for enhanced security

**Next Steps:**
1. Install Qodo Merge: https://github.com/apps/qodo-merge
2. Test with a new PR to verify automatic reviews
3. Optional: Configure `.github/qodo-merge.toml` for custom settings
4. Enable additional security features as recommended

For questions or issues, please open a GitHub issue in this repository.
