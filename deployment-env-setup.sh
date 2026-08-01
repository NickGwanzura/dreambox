#!/bin/bash
# Vendor-neutral environment checklist. This script does not call a hosting CLI.
set -u

required="DATABASE_URL JWT_SECRET"
optional="APP_URL GROQ_API_KEY RESEND_API_KEY R2_ENDPOINT R2_BUCKET_NAME R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_PUBLIC_URL"

echo "Required server variables: $required"
echo "Optional integration variables: $optional"
echo "Configure these in the active deployment environment, then run: npm run build"
