# Quick Start: Install Qodo Merge (AI Code Review)

**⚠️ IMPORTANT: This is the missing tool mentioned in your setup checklist.**

## What is Qodo Merge?

Qodo Merge (formerly PR-Agent) is an AI-powered code review assistant that automatically:
- 🔍 Reviews your pull requests
- 💡 Suggests code improvements
- 🧪 Recommends tests to add
- 📝 Generates PR descriptions
- 🔒 Detects potential security issues

**It's FREE for public repositories!**

---

## Installation (2 minutes)

### Step 1: Install the App

1. **Click this link:** https://github.com/apps/qodo-merge

2. **Click the green "Install it for free" button**

3. **Choose "Only select repositories"**

4. **Select:** `sedarged/polymarket-bot`

5. **Click "Install"**

6. **Authorize** the app when prompted

✅ Done! Qodo Merge is now installed.

---

## Step 2: Test It (Optional)

### Create a Test Pull Request

1. **Make a small change** (e.g., update README.md)

2. **Create a new branch and PR:**
   ```bash
   git checkout -b test-qodo-merge
   # Make a small change to any file
   git add .
   git commit -m "Test Qodo Merge"
   git push origin test-qodo-merge
   ```

3. **Open the PR on GitHub**

4. **Wait 30-60 seconds** for Qodo Merge to:
   - Review your code
   - Add comments with suggestions
   - Enhance your PR description

### Manual Commands

You can also trigger Qodo Merge manually by commenting on any PR:

- `/review` - Full code review
- `/describe` - Generate PR description
- `/improve` - Suggest improvements
- `/test` - Generate test suggestions
- `/help` - Show all commands

---

## What if the Link Doesn't Work?

If https://github.com/apps/qodo-merge returns a 404 error:

### Alternative 1: Search GitHub Marketplace

1. Go to: https://github.com/marketplace
2. Search for: "Qodo Merge" or "PR Agent"
3. Install from search results

### Alternative 2: Try CodeRabbit (Free Alternative)

1. Visit: https://github.com/apps/coderabbit
2. Install for your repository
3. Works similarly to Qodo Merge

### Alternative 3: Try Codacy

1. Visit: https://github.com/apps/codacy
2. Install and connect your repository
3. Provides code quality and security analysis

---

## Configuration (Optional)

Want to customize how Qodo Merge works? Create this file:

**File:** `.github/qodo-merge.toml`

```toml
[pr_reviewer]
# Enable automatic review on PR creation
automatic_review = true

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

Commit this file to customize Qodo Merge's behavior.

---

## Verification

After installing, verify it's working:

1. ✅ Go to: https://github.com/sedarged/polymarket-bot/settings/installations
2. ✅ You should see "Qodo Merge" in the list
3. ✅ Create a test PR and verify automatic review appears

---

## Troubleshooting

### Issue: No automatic review appears

**Solution:**
1. Check app is installed at repository settings
2. Wait 1-2 minutes after creating PR
3. Try manual trigger: Comment `/review` on the PR
4. Verify you have write access to the repository

### Issue: Link returns 404

**Solution:**
1. Search "Qodo Merge" in GitHub Marketplace
2. The app may have changed names or URLs
3. Try alternatives: CodeRabbit or Codacy
4. See [GITHUB_MARKETPLACE_SETUP.md](./GITHUB_MARKETPLACE_SETUP.md) for more options

---

## Summary

✅ **What you need to do:**
1. Click: https://github.com/apps/qodo-merge
2. Click "Install it for free"
3. Select `sedarged/polymarket-bot`
4. Click "Install"

⏱️ **Time required:** 2 minutes

💰 **Cost:** FREE for public repositories

📚 **Full documentation:** See [GITHUB_MARKETPLACE_SETUP.md](./GITHUB_MARKETPLACE_SETUP.md)

🔍 **Verification:** See [SETUP_VERIFICATION.md](./SETUP_VERIFICATION.md)

---

That's it! After this one installation, all your marketplace tools will be complete. ✨
