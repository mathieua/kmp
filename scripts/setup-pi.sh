#!/bin/bash
# Kids Alarm Clock - Raspberry Pi Setup Script
# Run this on a fresh Raspberry Pi OS Lite (64-bit) installation

set -e

echo "=========================================="
echo "Kids Alarm Clock - Pi Setup"
echo "=========================================="

# Check if running as root for certain commands
if [ "$EUID" -eq 0 ]; then
    echo "Please run without sudo. Script will request sudo when needed."
    exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_step() {
    echo -e "\n${GREEN}>>> $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}Warning: $1${NC}"
}

print_error() {
    echo -e "${RED}Error: $1${NC}"
}

# Step 1: System update
print_step "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Step 2: Install X11 and display dependencies
print_step "Installing X11 minimal desktop..."
sudo apt install -y \
    xserver-xorg \
    xinit \
    x11-xserver-utils \
    xdotool \
    unclutter \
    --no-install-recommends

# Step 3: Install Chromium (needed for Electron)
print_step "Installing Chromium and dependencies..."
sudo apt install -y \
    chromium \
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    libatspi2.0-0 \
    libdrm2 \
    libgbm1 \
    libasound2

# Step 4: Install development tools
print_step "Installing development tools..."
sudo apt install -y \
    git \
    build-essential \
    python3-pip \
    ffmpeg

# Step 5: Install I2C tools and hardware driver dependencies
print_step "Installing I2C tools and hardware dependencies..."
sudo apt install -y i2c-tools python3-smbus python3-lgpio
sudo pip3 install smbus2 adafruit-circuitpython-bh1750 --break-system-packages

# Step 6: Install Node.js 20 LTS
print_step "Installing Node.js 20 LTS..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "Node.js already installed: $NODE_VERSION"
    if [[ ! "$NODE_VERSION" =~ ^v20 ]]; then
        print_warning "Node.js version is not 20.x, reinstalling..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt install -y nodejs
    fi
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# Verify Node installation
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

# Step 7: Install yt-dlp (for YouTube import feature)
print_step "Installing yt-dlp..."
sudo pip3 install yt-dlp --break-system-packages || sudo pip3 install yt-dlp

# Step 8: Configure raspi-config settings
print_step "Configuring Raspberry Pi settings..."

# Enable I2C
if ! grep -q "^dtparam=i2c_arm=on" /boot/firmware/config.txt 2>/dev/null && \
   ! grep -q "^dtparam=i2c_arm=on" /boot/config.txt 2>/dev/null; then
    echo "Enabling I2C..."
    sudo raspi-config nonint do_i2c 0
fi

# Set GPU memory to 128MB (write directly to config.txt)
# Determine config file location first
if [ -f /boot/firmware/config.txt ]; then
    BOOT_CONFIG="/boot/firmware/config.txt"
elif [ -f /boot/config.txt ]; then
    BOOT_CONFIG="/boot/config.txt"
else
    BOOT_CONFIG="/boot/firmware/config.txt"
fi

if ! grep -q "^gpu_mem=" "$BOOT_CONFIG" 2>/dev/null; then
    echo "Setting GPU memory to 128MB..."
    echo "gpu_mem=128" | sudo tee -a "$BOOT_CONFIG"
fi

# Step 9: Configure display for official 7" touchscreen
print_step "Configuring display settings..."

# Determine config file location (varies by Pi OS version)
if [ -f /boot/firmware/config.txt ]; then
    CONFIG_FILE="/boot/firmware/config.txt"
elif [ -f /boot/config.txt ]; then
    CONFIG_FILE="/boot/config.txt"
else
    print_error "Could not find config.txt"
    exit 1
fi

# Add touchscreen rotation if not present (landscape mode)
if ! grep -q "lcd_rotate" "$CONFIG_FILE"; then
    echo "Configuring touchscreen for landscape mode..."
    echo "" | sudo tee -a "$CONFIG_FILE"
    echo "# Official 7\" touchscreen - landscape orientation" | sudo tee -a "$CONFIG_FILE"
    echo "lcd_rotate=2" | sudo tee -a "$CONFIG_FILE"
fi

# Step 10: Create app directory structure
print_step "Creating application directories..."
mkdir -p ~/alarm-clock/{media/{lullabies,music,audiobooks},data/artwork}

# Step 11: Configure auto-login to console
print_step "Configuring auto-login..."
sudo raspi-config nonint do_boot_behaviour B2

# Step 12: Create X11 startup script
print_step "Creating X11 startup configuration..."

cat > ~/.xinitrc << 'EOF'
#!/bin/bash
# Disable screen blanking and power management
xset s off
xset -dpms
xset s noblank

# Hide cursor after 3 seconds of inactivity
unclutter -idle 3 -root &

# Start the alarm clock app
cd ~/alarm-clock
NODE_ENV=production npm start
EOF
chmod +x ~/.xinitrc

# Step 13: Add startx to .bashrc for auto-start
if ! grep -q "startx" ~/.bashrc; then
    print_step "Configuring auto-start on login..."
    cat >> ~/.bashrc << 'EOF'

# Auto-start X11 on login (only on tty1)
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
    startx
fi
EOF
fi

# Step 14: Configure USB audio as default output
print_step "Configuring USB audio as default output..."
# USB speaker will be card 1 (card 0 is onboard headphones)
# This sets ALSA defaults so Electron/ffmpeg route to USB speaker automatically
if ! grep -q "defaults.pcm.card" ~/.asoundrc 2>/dev/null; then
    cat > ~/.asoundrc << 'EOF'
defaults.pcm.card 1
defaults.ctl.card 1
EOF
    echo "USB audio set as default (card 1)"
else
    echo "~/.asoundrc already configured"
fi

# Step 15: Install WiFi provisioning service
print_step "Installing WiFi provisioning service..."

# Allow the pi user to run nmcli, reboot, and the hostname-rename script
# without a password. nmcli is needed to connect to WiFi and tear down the
# setup hotspot; reboot is needed after a successful setup-mode
# reconfiguration or a device rename; set-hostname.sh is scoped to just
# "rename this device" rather than granting broad file-editing sudo access.
SUDOERS_FILE="/etc/sudoers.d/alarm-clock"
if ! sudo grep -q "set-hostname.sh" "$SUDOERS_FILE" 2>/dev/null; then
    echo "pi ALL=(ALL) NOPASSWD: /usr/bin/nmcli, /sbin/reboot, /home/pi/alarm-clock/scripts/set-hostname.sh" | sudo tee "$SUDOERS_FILE" > /dev/null
    sudo chmod 440 "$SUDOERS_FILE"
    echo "Sudoers entry written to $SUDOERS_FILE"
fi

chmod +x ~/alarm-clock/scripts/set-hostname.sh

# Make the check script executable
chmod +x ~/alarm-clock/scripts/wifi-check.sh

# Install and enable the systemd service
sudo cp ~/alarm-clock/scripts/wifi-check.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable wifi-check.service
echo "wifi-check.service enabled."

# Step 16: Verify I2C
print_step "Verifying I2C configuration..."
if sudo i2cdetect -y 1 > /dev/null 2>&1; then
    echo "I2C is working. Connected devices:"
    sudo i2cdetect -y 1
else
    print_warning "I2C not ready. May need a reboot."
fi

# Done
echo ""
echo "=========================================="
echo -e "${GREEN}Setup complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Reboot: sudo reboot"
echo "2. After reboot, clone/copy the alarm-clock project to ~/alarm-clock"
echo "3. Run 'npm install' in the project directory"
echo "4. The app should auto-start on next boot"
echo ""
echo "To manually start X11: startx"
echo "To test I2C devices: sudo i2cdetect -y 1"
echo ""
