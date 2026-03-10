#!/bin/bash
# Vercel Environment Variables Setup Script
# Run: chmod +x vercel-env-setup.sh && ./vercel-env-setup.sh

echo "Setting up Vercel environment variables..."
echo ""
echo "⚠️  Make sure you're logged in to Vercel: npx vercel login"
echo ""

# Check if vercel is linked
if [ ! -d ".vercel" ]; then
    echo "❌ Error: Project not linked to Vercel."
    echo "Run: npx vercel link"
    exit 1
fi

echo "Enter your Supabase Project URL (found in Supabase Dashboard > Settings > API):"
read -p "VITE_SUPABASE_URL: " supabase_url

echo ""
echo "Enter your Supabase Anon/Public Key (found in Supabase Dashboard > Settings > API):"
read -p "VITE_SUPABASE_ANON_KEY: " supabase_key

echo ""
echo "Adding environment variables to Vercel..."

# Add Supabase URL
npx vercel env add VITE_SUPABASE_URL production <<< "$supabase_url"

# Add Supabase Key
npx vercel env add VITE_SUPABASE_ANON_KEY production <<< "$supabase_key"

echo ""
echo "✅ Supabase environment variables added successfully!"
echo ""

# Optional: Add admin credentials
echo "Would you like to add an environment-based admin account? (y/n)"
read -p "> " add_admin

if [ "$add_admin" = "y" ] || [ "$add_admin" = "Y" ]; then
    echo ""
    echo "Enter admin email:"
    read -p "VITE_ADMIN_EMAIL: " admin_email
    
    echo ""
    echo "Enter admin password (will be hashed):"
    read -s -p "Password: " admin_password
    echo ""
    
    # Generate SHA256 hash
    if command -v openssl &> /dev/null; then
        password_hash=$(echo -n "$admin_password" | openssl dgst -sha256 | sed 's/^.* //')
    else
        echo "⚠️  OpenSSL not found. Please manually hash your password and add:"
        echo "   npx vercel env add VITE_ADMIN_PASSWORD_HASH production"
        password_hash="MANUAL_HASH_NEEDED"
    fi
    
    if [ "$password_hash" != "MANUAL_HASH_NEEDED" ]; then
        npx vercel env add VITE_ADMIN_EMAIL production <<< "$admin_email"
        npx vercel env add VITE_ADMIN_PASSWORD_HASH production <<< "$password_hash"
        echo ""
        echo "✅ Admin credentials added!"
    fi
fi

echo ""
echo "🚀 Deploying with new environment variables..."
npx vercel --prod

echo ""
echo "✅ Done! Environment variables are now live in production."
