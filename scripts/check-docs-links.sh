#!/bin/bash
# Documentation Link Checker
# Validates internal links in markdown files

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Documentation Link Checker                             ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

BROKEN_LINKS=0
CHECKED=0

# Find all markdown files
MD_FILES=$(find . -name "*.md" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/archive/*")

echo "Checking markdown files for broken internal links..."
echo ""

# Check each markdown file
for FILE in $MD_FILES; do
    # Extract markdown links [text](path)
    LINKS=$(grep -oE '\[([^\]]+)\]\(([^)]+)\)' "$FILE" | sed 's/.*(\(.*\))/\1/' || true)
    
    for LINK in $LINKS; do
        CHECKED=$((CHECKED + 1))
        
        # Skip external links (http/https)
        if [[ "$LINK" =~ ^https?:// ]]; then
            continue
        fi
        
        # Skip anchor links within same file
        if [[ "$LINK" =~ ^# ]]; then
            continue
        fi
        
        # Remove anchor from link
        LINK_PATH=$(echo "$LINK" | sed 's/#.*//')
        
        # Skip empty links
        if [ -z "$LINK_PATH" ]; then
            continue
        fi
        
        # Resolve relative path
        FILE_DIR=$(dirname "$FILE")
        TARGET_PATH="$FILE_DIR/$LINK_PATH"
        
        # Normalize path
        TARGET_PATH=$(realpath -m "$TARGET_PATH" 2>/dev/null || echo "$TARGET_PATH")
        
        # Check if target exists
        if [ ! -e "$TARGET_PATH" ]; then
            log_error "Broken link in $FILE"
            echo "  Link: $LINK"
            echo "  Target: $TARGET_PATH"
            echo ""
            BROKEN_LINKS=$((BROKEN_LINKS + 1))
        fi
    done
done

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo "Checked $CHECKED internal links"
echo ""

if [ $BROKEN_LINKS -eq 0 ]; then
    log_success "All internal links are valid!"
    exit 0
else
    log_error "Found $BROKEN_LINKS broken link(s)"
    echo ""
    echo "Fix broken links before committing documentation changes."
    exit 1
fi
