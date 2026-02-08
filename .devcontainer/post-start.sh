#!/bin/bash
set -e

echo "🚀 Setting up Polymarket Bot development environment..."
echo ""

# Check if .env exists, create from .env.example if missing
if [ ! -f .env ]; then
  echo "📝 Creating .env from .env.example..."
  if [ -f .env.codespaces.example ]; then
    cp .env.codespaces.example .env
    echo "✅ Created .env from .env.codespaces.example"
  elif [ -f .env.example ]; then
    cp .env.example .env
    echo "✅ Created .env from .env.example"
    
    # Add Codespaces-safe defaults if not already present
    echo "" >> .env
    echo "# Codespaces Development Defaults" >> .env
    if ! grep -q "ADMIN_TOKEN=" .env 2>/dev/null || [ -z "$(grep "ADMIN_TOKEN=" .env | cut -d'=' -f2)" ]; then
      echo "ADMIN_TOKEN=USE_GITHUB_CODESPACES_SECRET_OR_GENERATE_WITH_openssl_rand_hex_32" >> .env
    fi
    if ! grep -q "ALLOWED_ORIGINS=" .env 2>/dev/null; then
      echo "ALLOWED_ORIGINS=*" >> .env
    fi
    if ! grep -q "LOG_LEVEL=" .env 2>/dev/null; then
      echo "LOG_LEVEL=debug" >> .env
    fi
  else
    echo "⚠️  No .env.example or .env.codespaces.example found!"
  fi
else
  echo "✅ .env file already exists"
fi

echo ""

# Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
  echo "✅ Dependencies installed"
else
  echo "✅ Dependencies already installed"
fi

echo ""

# Build the project
echo "🔨 Building project..."
npm run build || {
  echo "⚠️  Build failed, but continuing setup..."
  echo "   This may be due to pre-existing TypeScript errors."
  echo "   Check docs/environment.md for known issues."
}

echo ""
echo "✨ Setup complete!"
echo ""
echo "📚 Quick Commands:"
echo "  npm run dev              - Start backend server (port 3000)"
echo "  npm run markets          - Fetch and display markets"
echo "  npm run book             - Display orderbook"
echo "  npm test                 - Run all tests"
echo "  cd apps/frontend && npm run dev - Start frontend dashboard (port 8080)"
echo ""
echo "📖 Documentation:"
echo "  docs/CODESPACES_SETUP.md - Complete Codespaces guide"
echo "  docs/README.md           - Documentation index"
echo "  README.md                - Project overview"
echo ""
echo "🔐 Security Reminders:"
echo "  • Default mode: PAPER TRADING (no real money)"
echo "  • Set ADMIN_TOKEN in GitHub Codespaces secrets for full access"
echo "  • Never commit secrets to git"
echo "  • Use test wallets only in development"
echo ""
