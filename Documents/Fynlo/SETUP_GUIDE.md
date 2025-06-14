# 🚀 Fynlo POS - Complete Developer Setup Guide

## Overview
This guide provides step-by-step instructions for setting up the complete Fynlo POS development environment from scratch.

---

## 🖥️ System Requirements

### Hardware Requirements
- **Mac**: macOS 12.0 (Monterey) or later
- **RAM**: Minimum 8GB (16GB recommended)
- **Storage**: 20GB free space
- **Processor**: Apple Silicon (M1/M2) or Intel

### Software Prerequisites
- **Xcode**: 15.0 or later (from App Store)
- **Homebrew**: Package manager for macOS
- **Git**: Version control
- **Node.js**: 18.0 or later
- **Python**: 3.10+ (for backend)

---

## 📋 Step-by-Step Setup

### Step 1: Install Homebrew 🍺
```bash
# Check if Homebrew is installed
brew --version

# If not installed, install it:
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Add Homebrew to PATH (for Apple Silicon Macs)
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### Step 2: Install Development Tools 🛠️
```bash
# Install essential tools
brew install git node postgresql@14 redis pgbouncer python@3.10

# Install iOS development tools
brew install cocoapods watchman

# Install additional utilities
brew install jq tree wget curl
```

### Step 3: Clone Repository 📦
```bash
# Create development directory
mkdir -p ~/Development
cd ~/Development

# Clone the repository
git clone https://github.com/yourusername/fynlo-pos.git
cd fynlo-pos

# Verify structure
ls -la
```

### Step 4: Database Setup 💾

#### PostgreSQL Configuration
```bash
# Start PostgreSQL service
brew services start postgresql@14

# Create database and user
createdb fynlo_pos_dev
psql -c "CREATE USER fynlo_user WITH PASSWORD 'fynlo_secure_password';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE fynlo_pos_dev TO fynlo_user;"
psql -c "ALTER USER fynlo_user CREATEDB;"

# Apply custom configuration
cp config/postgresql.conf $(brew --prefix)/var/postgresql@14/
brew services restart postgresql@14
```

#### Redis Configuration
```bash
# Start Redis service
brew services start redis

# Test Redis connection
redis-cli ping
# Should return: PONG

# Apply custom configuration
cp config/redis.conf $(brew --prefix)/etc/
brew services restart redis
```

#### pgBouncer Setup
```bash
# Configure pgBouncer
cp config/pgbouncer.ini $(brew --prefix)/etc/

# Create userlist for authentication
echo '"fynlo_user" "md5$(echo -n 'fynlo_secure_passwordfynlo_user' | md5)'"' > $(brew --prefix)/etc/userlist.txt

# Start pgBouncer
brew services start pgbouncer
```

### Step 5: Backend Setup 🐍

#### Python Environment
```bash
# Install Python dependencies
pip3 install virtualenv

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # On macOS/Linux

# Install Python packages
pip install -r requirements.txt
```

#### Initialize Odoo/CashApp Backend
```bash
# Create Odoo configuration
cat > ~/.odoorc << EOF
[options]
db_host = localhost
db_port = 5432
db_user = fynlo_user
db_password = fynlo_secure_password
admin_passwd = admin
addons_path = ./addons
data_dir = ./data
EOF

# Initialize database
python cashapp-bin -d fynlo_pos_dev -i base,point_of_sale --stop-after-init

# Create demo data
python cashapp-bin -d fynlo_pos_dev --load-language=en_US --without-demo=all
```

### Step 6: iOS App Setup 📱

#### Navigate to iOS Project
```bash
cd CashApp-iOS/CashAppPOS
```

#### Install Dependencies
```bash
# Install Node packages
npm install

# Install iOS dependencies
cd ios
pod install
cd ..

# Create .env file
cat > .env << EOF
API_URL=http://localhost:8069
WEBSOCKET_URL=ws://localhost:8069
ENVIRONMENT=development
EOF
```

#### Configure Xcode Project
1. Open Xcode project:
   ```bash
   open ios/CashAppPOS.xcworkspace
   ```

2. In Xcode:
   - Select your development team
   - Update bundle identifier if needed
   - Configure signing certificates

### Step 7: Start Development Servers 🚀

#### Terminal 1: Backend Server
```bash
# Navigate to project root
cd ~/Development/fynlo-pos

# Activate Python environment
source venv/bin/activate

# Start Odoo server
python cashapp-bin --dev=all
```

#### Terminal 2: iOS Metro Bundler
```bash
# Navigate to iOS app
cd ~/Development/fynlo-pos/CashApp-iOS/CashAppPOS

# Start Metro bundler
npx react-native start
```

#### Terminal 3: Database Monitoring
```bash
# Monitor PostgreSQL logs
tail -f $(brew --prefix)/var/log/postgresql@14.log

# Monitor Redis
redis-cli monitor
```

### Step 8: Run iOS App 📲

#### Using Xcode
1. Open `ios/CashAppPOS.xcworkspace` in Xcode
2. Select target device (Simulator or physical device)
3. Click Run (⌘R)

#### Using Command Line
```bash
# Run on iOS Simulator
npx react-native run-ios

# Run on specific simulator
npx react-native run-ios --simulator="iPhone 15 Pro"

# Run on physical device
npx react-native run-ios --device
```

---

## 🔧 Troubleshooting

### Common Issues

#### PostgreSQL Connection Failed
```bash
# Check if PostgreSQL is running
brew services list | grep postgresql

# Check PostgreSQL logs
tail -50 $(brew --prefix)/var/log/postgresql@14.log

# Test connection
psql -U fynlo_user -d fynlo_pos_dev -h localhost
```

#### Pod Install Failures
```bash
# Clean pod cache
cd ios
pod cache clean --all
rm -rf Pods Podfile.lock
pod install --repo-update
```

#### Metro Bundler Issues
```bash
# Clear Metro cache
npx react-native start --reset-cache

# Clear all caches
watchman watch-del-all
rm -rf node_modules
npm install
cd ios && pod install
```

#### Xcode Build Errors
```bash
# Clean build folder
# In Xcode: Product → Clean Build Folder (⇧⌘K)

# Delete derived data
rm -rf ~/Library/Developer/Xcode/DerivedData

# Reset simulators
xcrun simctl shutdown all
xcrun simctl erase all
```

---

## 🛡️ Security Configuration

### Environment Variables
Create `.env.local` for sensitive data:
```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fynlo_pos_dev
DB_USER=fynlo_user
DB_PASSWORD=fynlo_secure_password

# API Keys
STRIPE_SECRET_KEY=sk_test_...
APPLE_PAY_MERCHANT_ID=merchant.com.fynlo.pos

# Security
JWT_SECRET=your-secret-key-here
SESSION_SECRET=your-session-secret
```

### SSL for Local Development
```bash
# Generate self-signed certificate
openssl req -x509 -newkey rsa:4096 -nodes -out cert.pem -keyout key.pem -days 365

# Configure in backend
python cashapp-bin --cert-file=cert.pem --key-file=key.pem
```

---

## 🧪 Verify Installation

### Backend Health Check
```bash
# Check API endpoint
curl http://localhost:8069/web/health

# Check database connection
psql -U fynlo_user -d fynlo_pos_dev -c "SELECT version();"

# Check Redis
redis-cli ping
```

### iOS App Verification
1. App launches without errors
2. Can navigate between screens
3. Mock data displays correctly
4. No console errors in Metro

---

## 📚 Additional Resources

### Documentation
- [React Native Docs](https://reactnative.dev/docs/getting-started)
- [Odoo Development](https://www.odoo.com/documentation/17.0/developer.html)
- [PostgreSQL Docs](https://www.postgresql.org/docs/14/)

### Development Tools
- **VS Code**: Recommended editor
  ```bash
  brew install --cask visual-studio-code
  ```
- **Postman**: API testing
  ```bash
  brew install --cask postman
  ```
- **TablePlus**: Database GUI
  ```bash
  brew install --cask tableplus
  ```

### Recommended VS Code Extensions
- React Native Tools
- Python
- ESLint
- Prettier
- GitLens
- Thunder Client (API testing)

---

## 🎯 Next Steps

1. **Explore the Codebase**
   - Review project structure
   - Understand key components
   - Check API documentation

2. **Start Development**
   - Pick a task from task documents
   - Create feature branch
   - Implement and test

3. **Join the Team**
   - Set up Slack/Discord
   - Attend daily standups
   - Review coding standards

---

## 🆘 Getting Help

### Internal Resources
- Check `docs/` folder
- Review existing code
- Ask in team chat

### Debug Commands
```bash
# Show all running services
brew services list

# Check port usage
lsof -i :8069  # Backend
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis

# View logs
tail -f ~/Development/fynlo-pos/cashapp.log
```

---

**Welcome to the Fynlo POS team! 🎉**