#!/bin/bash
# RSLVD.net Dynamic DNS Service Setup Script
# This script installs and configures the RSLVD.net dynamic DNS service
# based on modified Pi-hole components.

# Exit on error
set -e

# Text formatting
BOLD=$(tput bold)
NORMAL=$(tput sgr0)
GREEN=$(tput setaf 2)
YELLOW=$(tput setaf 3)
RED=$(tput setaf 1)
BLUE=$(tput setaf 4)

# Configuration variables
RSLVD_VERSION="1.0.0"
RSLVD_DOMAIN="rslvd.net"
RSLVD_FREE_SUBDOMAIN="my.rslvd.net"
PIHOLE_REPO="https://github.com/pi-hole/pi-hole.git"
ADMINLTE_REPO="https://github.com/pi-hole/AdminLTE.git"
FTL_REPO="https://github.com/pi-hole/FTL.git"
RSLVD_INSTALL_DIR="/opt/rslvd"
PIHOLE_DIR="/etc/.pihole"
WEBROOT_DIR="/var/www/html"
ADMIN_EMAIL=""
DB_TYPE="sqlite" # sqlite or mysql
DB_HOST="localhost"
DB_NAME="rslvd"
DB_USER="rslvd"
DB_PASS=""
PAYMENT_GATEWAY="stripe" # stripe or paypal
PAYMENT_API_KEY=""
PAYMENT_SECRET_KEY=""

# Function to display script banner
show_banner() {
    echo "${BLUE}${BOLD}"
    echo "██████╗ ███████╗██╗    ██╗   ██╗██████╗    ███╗   ██╗███████╗████████╗"
    echo "██╔══██╗██╔════╝██║    ██║   ██║██╔══██╗   ████╗  ██║██╔════╝╚══██╔══╝"
    echo "██████╔╝███████╗██║    ██║   ██║██║  ██║   ██╔██╗ ██║█████╗     ██║   "
    echo "██╔══██╗╚════██║██║    ╚██╗ ██╔╝██║  ██║   ██║╚██╗██║██╔══╝     ██║   "
    echo "██║  ██║███████║███████╗╚████╔╝ ██████╔╝   ██║ ╚████║███████╗   ██║   "
    echo "╚═╝  ╚═╝╚══════╝╚══════╝ ╚═══╝  ╚═════╝    ╚═╝  ╚═══╝╚══════╝   ╚═╝   "
    echo "${NORMAL}"
    echo "${BOLD}Dynamic DNS Service Setup Script v${RSLVD_VERSION}${NORMAL}"
    echo "Based on Pi-hole (https://pi-hole.net)"
    echo "----------------------------------------------------------------"
    echo ""
}

# Function to check if script is run as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        echo "${RED}${BOLD}Error: This script must be run as root${NORMAL}"
        exit 1
    fi
}

# Function to check system requirements
check_system_requirements() {
    echo "${BOLD}Checking system requirements...${NORMAL}"
    
    # Check OS
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
        echo "Detected OS: $OS $VERSION"
    else
        echo "${RED}${BOLD}Error: Unable to determine operating system${NORMAL}"
        exit 1
    fi
    
    # Check for supported OS
    case $OS in
        debian|ubuntu|raspbian)
            echo "${GREEN}Supported OS detected: $OS $VERSION${NORMAL}"
            ;;
        *)
            echo "${YELLOW}Warning: Unsupported OS detected: $OS $VERSION${NORMAL}"
            echo "This script is designed for Debian-based systems."
            read -p "Do you want to continue anyway? (y/n) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
            ;;
    esac
    
    # Check for required commands
    REQUIRED_COMMANDS=("curl" "git" "sqlite3" "php" "nginx" "dig" "netstat" "jq")
    MISSING_COMMANDS=()
    
    for cmd in "${REQUIRED_COMMANDS[@]}"; do
        if ! command -v $cmd &> /dev/null; then
            MISSING_COMMANDS+=($cmd)
        fi
    done
    
    if [ ${#MISSING_COMMANDS[@]} -gt 0 ]; then
        echo "${YELLOW}The following required commands are missing:${NORMAL}"
        for cmd in "${MISSING_COMMANDS[@]}"; do
            echo "- $cmd"
        done
        
        echo "${BOLD}Installing missing dependencies...${NORMAL}"
        apt-get update
        apt-get install -y curl git sqlite3 php-cli php-sqlite3 php-json php-curl nginx dnsutils net-tools jq
    else
        echo "${GREEN}All required commands are installed.${NORMAL}"
    fi
    
    # Check if ports 53 (DNS) and 80 (HTTP) are available
    if netstat -tuln | grep -q ":53 "; then
        echo "${YELLOW}Warning: Port 53 (DNS) is already in use.${NORMAL}"
        echo "Another DNS server might be running. You'll need to stop it before continuing."
        read -p "Do you want to continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    if netstat -tuln | grep -q ":80 "; then
        echo "${YELLOW}Warning: Port 80 (HTTP) is already in use.${NORMAL}"
        echo "Another web server might be running. You'll need to configure it to work with RSLVD."
        read -p "Do you want to continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    echo "${GREEN}System requirements check completed.${NORMAL}"
}

# Function to get user configuration
get_user_config() {
    echo "${BOLD}Configuring RSLVD.net Dynamic DNS Service${NORMAL}"
    echo "Please provide the following information:"
    
    # Domain configuration
    read -p "Main domain for the service [${RSLVD_DOMAIN}]: " input
    RSLVD_DOMAIN=${input:-$RSLVD_DOMAIN}
    
    read -p "Free subdomain suffix [${RSLVD_FREE_SUBDOMAIN}]: " input
    RSLVD_FREE_SUBDOMAIN=${input:-$RSLVD_FREE_SUBDOMAIN}
    
    # Admin email
    read -p "Administrator email address: " ADMIN_EMAIL
    while [[ ! $ADMIN_EMAIL =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; do
        echo "${RED}Invalid email address. Please try again.${NORMAL}"
        read -p "Administrator email address: " ADMIN_EMAIL
    done
    
    # Database configuration
    echo
    echo "${BOLD}Database Configuration${NORMAL}"
    echo "1) SQLite (recommended for smaller deployments)"
    echo "2) MySQL (recommended for larger deployments)"
    read -p "Select database type [1]: " input
    
    if [[ $input == "2" ]]; then
        DB_TYPE="mysql"
        read -p "MySQL host [${DB_HOST}]: " input
        DB_HOST=${input:-$DB_HOST}
        
        read -p "MySQL database name [${DB_NAME}]: " input
        DB_NAME=${input:-$DB_NAME}
        
        read -p "MySQL username [${DB_USER}]: " input
        DB_USER=${input:-$DB_USER}
        
        read -p "MySQL password: " DB_PASS
        while [[ -z $DB_PASS ]]; do
            echo "${RED}Password cannot be empty. Please try again.${NORMAL}"
            read -p "MySQL password: " DB_PASS
        done
    else
        DB_TYPE="sqlite"
    fi
    
    # Payment gateway configuration
    echo
    echo "${BOLD}Payment Gateway Configuration${NORMAL}"
    echo "1) Stripe"
    echo "2) PayPal"
    echo "3) None (disable premium domains)"
    read -p "Select payment gateway [1]: " input
    
    case $input in
        2)
            PAYMENT_GATEWAY="paypal"
            read -p "PayPal API Key: " PAYMENT_API_KEY
            read -p "PayPal Secret Key: " PAYMENT_SECRET_KEY
            ;;
        3)
            PAYMENT_GATEWAY="none"
            ;;
        *)
            PAYMENT_GATEWAY="stripe"
            read -p "Stripe API Key: " PAYMENT_API_KEY
            read -p "Stripe Secret Key: " PAYMENT_SECRET_KEY
            ;;
    esac
    
    # Installation directory
    read -p "Installation directory [${RSLVD_INSTALL_DIR}]: " input
    RSLVD_INSTALL_DIR=${input:-$RSLVD_INSTALL_DIR}
    
    # Web root directory
    read -p "Web root directory [${WEBROOT_DIR}]: " input
    WEBROOT_DIR=${input:-$WEBROOT_DIR}
    
    # Confirm settings
    echo
    echo "${BOLD}Configuration Summary:${NORMAL}"
    echo "Main Domain: ${RSLVD_DOMAIN}"
    echo "Free Subdomain: ${RSLVD_FREE_SUBDOMAIN}"
    echo "Admin Email: ${ADMIN_EMAIL}"
    echo "Database Type: ${DB_TYPE}"
    if [[ $DB_TYPE == "mysql" ]]; then
        echo "MySQL Host: ${DB_HOST}"
        echo "MySQL Database: ${DB_NAME}"
        echo "MySQL User: ${DB_USER}"
    fi
    echo "Payment Gateway: ${PAYMENT_GATEWAY}"
    echo "Installation Directory: ${RSLVD_INSTALL_DIR}"
    echo "Web Root Directory: ${WEBROOT_DIR}"
    
    read -p "Is this configuration correct? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Configuration cancelled. Please run the script again."
        exit 1
    fi
}

# Function to install dependencies
install_dependencies() {
    echo "${BOLD}Installing dependencies...${NORMAL}"
    
    apt-get update
    apt-get install -y curl git sqlite3 php-cli php-sqlite3 php-json php-curl nginx dnsutils net-tools jq \
                       build-essential cmake libgmp-dev nettle-dev libnetfilter-conntrack-dev \
                       libidn2-0-dev nettle-dev libidn11-dev libreadline-dev libluajit-5.1-dev \
                       php-fpm php-xml php-mbstring php-zip unzip
    
    if [[ $DB_TYPE == "mysql" ]]; then
        apt-get install -y mysql-server php-mysql
    fi
    
    echo "${GREEN}Dependencies installed successfully.${NORMAL}"
}

# Function to clone and modify Pi-hole repositories
clone_and_modify_repos() {
    echo "${BOLD}Cloning and modifying Pi-hole repositories...${NORMAL}"
    
    # Create installation directory
    mkdir -p $RSLVD_INSTALL_DIR
    cd $RSLVD_INSTALL_DIR
    
    # Clone repositories
    echo "Cloning Pi-hole Core..."
    git clone --depth=1 $PIHOLE_REPO pihole
    
    echo "Cloning AdminLTE..."
    git clone --depth=1 $ADMINLTE_REPO admin
    
    echo "Cloning FTL..."
    git clone --depth=1 $FTL_REPO ftl
    
    # Create directories for modifications
    mkdir -p $RSLVD_INSTALL_DIR/custom/core
    mkdir -p $RSLVD_INSTALL_DIR/custom/admin
    mkdir -p $RSLVD_INSTALL_DIR/custom/ftl
    
    echo "${GREEN}Repositories cloned successfully.${NORMAL}"
}

# Function to create database
create_database() {
    echo "${BOLD}Creating database...${NORMAL}"
    
    if [[ $DB_TYPE == "mysql" ]]; then
        # Create MySQL database and user
        mysql -e "CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        mysql -e "CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';"
        mysql -e "GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'localhost';"
        mysql -e "FLUSH PRIVILEGES;"
        
        # Create tables
        cat > $RSLVD_INSTALL_DIR/database_schema.sql << EOF
-- Users Table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    api_key VARCHAR(64) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_admin BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(64),
    is_verified BOOLEAN DEFAULT FALSE
);

-- Domains Table
CREATE TABLE domains (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    domain VARCHAR(255) NOT NULL UNIQUE,
    type ENUM('free', 'premium') NOT NULL,
    target_ip VARCHAR(45),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP NULL,
    expiry_date TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Domain Updates Table
CREATE TABLE domain_updates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    domain_id INT NOT NULL,
    old_ip VARCHAR(45),
    new_ip VARCHAR(45),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_method VARCHAR(20),
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

-- Payments Table
CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    domain_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_method VARCHAR(50),
    transaction_id VARCHAR(255),
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

-- API Requests Table
CREATE TABLE api_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    request_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Settings Table
CREATE TABLE settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_name VARCHAR(50) NOT NULL UNIQUE,
    setting_value TEXT,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE
);

-- Initial Settings
INSERT INTO settings (setting_name, setting_value, description, is_public) VALUES
('free_domain_suffix', '$RSLVD_FREE_SUBDOMAIN', 'Suffix for free domains', TRUE),
('premium_domain_suffix', '$RSLVD_DOMAIN', 'Suffix for premium domains', TRUE),
('premium_price_monthly', '5.00', 'Monthly price for premium domains in USD', TRUE),
('premium_price_yearly', '50.00', 'Yearly price for premium domains in USD', TRUE),
('max_free_domains_per_user', '3', 'Maximum number of free domains per user', TRUE),
('max_premium_domains_per_user', '10', 'Maximum number of premium domains per user', TRUE),
('api_rate_limit', '100', 'Maximum API requests per hour', TRUE);
EOF
        
        mysql -u $DB_USER -p$DB_PASS $DB_NAME < $RSLVD_INSTALL_DIR/database_schema.sql
        
    else
        # Create SQLite database
        SQLITE_DB_PATH="$RSLVD_INSTALL_DIR/data/rslvd.db"
        mkdir -p $RSLVD_INSTALL_DIR/data
        
        cat > $RSLVD_INSTALL_DIR/database_schema.sql << EOF
-- Users Table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    api_key VARCHAR(64) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    is_admin BOOLEAN DEFAULT 0,
    verification_token VARCHAR(64),
    is_verified BOOLEAN DEFAULT 0
);

-- Domains Table
CREATE TABLE domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    domain VARCHAR(255) NOT NULL UNIQUE,
    type VARCHAR(10) NOT NULL CHECK (type IN ('free', 'premium')),
    target_ip VARCHAR(45),
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP,
    expiry_date TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Domain Updates Table
CREATE TABLE domain_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain_id INTEGER NOT NULL,
    old_ip VARCHAR(45),
    new_ip VARCHAR(45),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_method VARCHAR(20),
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

-- Payments Table
CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    domain_id INTEGER NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_method VARCHAR(50),
    transaction_id VARCHAR(255),
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

-- API Requests Table
CREATE TABLE api_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    request_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Settings Table
CREATE TABLE settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_name VARCHAR(50) NOT NULL UNIQUE,
    setting_value TEXT,
    description TEXT,
    is_public BOOLEAN DEFAULT 0
);

-- Initial Settings
INSERT INTO settings (setting_name, setting_value, description, is_public) VALUES
('free_domain_suffix', '$RSLVD_FREE_SUBDOMAIN', 'Suffix for free domains', 1),
('premium_domain_suffix', '$RSLVD_DOMAIN', 'Suffix for premium domains', 1),
('premium_price_monthly', '5.00', 'Monthly price for premium domains in USD', 1),
('premium_price_yearly', '50.00', 'Yearly price for premium domains in USD', 1),
('max_free_domains_per_user', '3', 'Maximum number of free domains per user', 1),
('max_premium_domains_per_user', '10', 'Maximum number of premium domains per user', 1),
('api_rate_limit', '100', 'Maximum API requests per hour', 1);
EOF
        
        sqlite3 $SQLITE_DB_PATH < $RSLVD_INSTALL_DIR/database_schema.sql
        chmod 664 $SQLITE_DB_PATH
        chown www-data:www-data $RSLVD_INSTALL_DIR/data
        chown www-data:www-data $SQLITE_DB_PATH
    fi
    
    echo "${GREEN}Database created successfully.${NORMAL}"
}

# Function to modify Pi-hole Core
modify_pihole_core() {
    echo "${BOLD}Modifying Pi-hole Core...${NORMAL}"
    
    # Create custom scripts directory
    mkdir -p $RSLVD_INSTALL_DIR/custom/core/scripts
    
    # Create user management script
    cat > $RSLVD_INSTALL_DIR/custom/core/scripts/user_management.sh << 'EOF'
#!/bin/bash
# RSLVD.net User Management Script

# Load configuration
source /etc/rslvd/rslvd.conf

# Function to add a user
add_user() {
    local username="$1"
    local email="$2"
    local password="$3"
    local is_admin="$4"
    
    # Hash the password
    local password_hash=$(php -r "echo password_hash('$password', PASSWORD_BCRYPT);")
    
    # Generate API key
    local api_key=$(openssl rand -hex 32)
    
    if [[ $DB_TYPE == "mysql" ]]; then
        mysql -u $DB_USER -p$DB_PASS $DB_NAME -e "INSERT INTO users (username, email, password_hash, api_key, is_admin, is_verified) VALUES ('$username', '$email', '$password_hash', '$api_key', $is_admin, 1);"
    else
        sqlite3 $SQLITE_DB_PATH "INSERT INTO users (username, email, password_hash, api_key, is_admin, is_verified) VALUES ('$username', '$email', '$password_hash', '$api_key', $is_admin, 1);"
    fi
    
    echo "User $username added successfully."
}

# Function to delete a user
delete_user() {
    local username="$1"
    
    if [[ $DB_TYPE == "mysql" ]]; then
        mysql -u $DB_USER -p$DB_PASS $DB_NAME -e "DELETE FROM users WHERE username='$username';"
    else
        sqlite3 $SQLITE_DB_PATH "DELETE FROM users WHERE username='$username';"
    fi
    
    echo "User $username deleted successfully."
}

# Function to list users
list_users() {
    if [[ $DB_TYPE == "mysql" ]]; then
        mysql -u $DB_USER -p$DB_PASS $DB_NAME -e "SELECT id, username, email, is_admin, is_verified, created_at FROM users;"
    else
        sqlite3 -header -column $SQLITE_DB_PATH "SELECT id, username, email, is_admin, is_verified, created_at FROM users;"
    fi
}

# Function to reset a user's password
reset_password() {
    local username="$1"
    local new_password="$2"
    
    # Hash the password
    local password_hash=$(php -r "echo password_hash('$new_password', PASSWORD_BCRYPT);")
    
    if [[ $DB_TYPE == "mysql" ]]; then
        mysql -u $DB_USER -p$DB_PASS $DB_NAME -e "UPDATE users SET password_hash='$password_hash' WHERE username='$username';"
    else
        sqlite3 $SQLITE_DB_PATH "UPDATE users SET password_hash='$password_hash' WHERE username='$username';"
    fi
    
    echo "Password for user $username reset successfully."
}

# Parse command line arguments
case "$1" in
    add)
        if [[ $# -lt 4 ]]; then
            echo "Usage: $0 add <username> <email> <password> [is_admin]"
            exit 1
        fi
        is_admin=${5:-0}
        add_user "$2" "$3" "$4" "$is_admin"
        ;;
    delete)
        if [[ $# -lt 2 ]]; then
            echo "Usage: $0 delete <username>"
            exit 1
        fi
        delete_user "$2"
        ;;
    list)
        list_users
        ;;
    reset-password)
        if [[ $# -lt 3 ]]; then
            echo "Usage: $0 reset-password <username> <new_password>"
            exit 1
        fi
        reset_password "$2" "$3"
        ;;
    *)
        echo "Usage: $0 {add|delete|list|reset-password} [arguments]"
        exit 1
        ;;
esac

exit 0
EOF
    
    # Create domain management script
    cat > $RSLVD_INSTALL_DIR/custom/core/scripts/domain_management.sh << 'EOF'
#!/bin/bash
# RSLVD.net Domain Management Script

# Load configuration
source /etc/rslvd/rslvd.conf

# Function to add a domain
add_domain() {
    local username="$1"
    local domain="$2"
    local type="$3"
    local target_ip="$4"
    
    # Get user ID
    local user_id
    if [[ $DB_TYPE == "mysql" ]]; then
        user_id=$(mysql -u $DB_USER -p$DB_PASS $DB_NAME -sN -e "SELECT id FROM users WHERE username='$username';")
    else
        user_id=$(sqlite3 $SQLITE_DB_PATH "SELECT id FROM users WHERE username='$username';")
    fi
    
    if [[ -z $user_id ]]; then
        echo "Error: User $username not found."
        exit 1
    fi
    
    # Determine full domain name
    local full_domain
    if [[ $type == "free" ]]; then
        full_domain="${domain}.${FREE_DOMAIN_SUFFIX}"
    else
        full_domain="${domain}.${PREMIUM_DOMAIN_SUFFIX}"
    fi
    
    # Add domain to database
    if [[ $DB_TYPE == "mysql" ]]; then
        mysql -u $DB_USER -p$DB_PASS $DB_NAME -e "INSERT INTO domains (user_id, domain, type, target_ip) VALUES ($user_id, '$full_domain', '$type', '$target_ip');"
    else
        sqlite3 $SQLITE_DB_PATH "INSERT INTO domains (user_id, domain, type, target_ip) VALUES ($user_id, '$full_domain', '$type', '$target_ip');"
    fi
    
    # Add domain to Pi-hole custom DNS
    echo "$target_ip $full_domain" >> /etc/pihole/custom.list
    
    # Reload Pi-hole DNS
    pihole restartdns reload
    
    echo "Domain $full_domain added successfully."
}

# Function to delete a domain
delete_domain() {
    local domain="$1"
    
    # Remove domain from database
    if [[ $DB_TYPE == "mysql" ]]; then
        mysql -u $DB_USER -p$DB_PASS $DB_NAME -e "DELETE FROM domains WHERE domain='$domain';"
    else
        sqlite3 $SQLITE_DB_PATH "DELETE FROM domains WHERE domain='$domain';"
    fi
    
    # Remove domain from Pi-hole custom DNS
    sed -i "/^[0-9.]*[[:space:]]*$domain$/d" /etc/pihole/custom.list
    
    # Reload Pi-hole DNS
    pihole restartdns reload
    
    echo "Domain $domain deleted successfully."
}

# Function to update a domain's IP address
update_domain() {
    local domain="$1"
    local new_ip="$2"
    
    # Get current IP
    local old_ip
    if [[ $DB_TYPE == "mysql" ]]; then
        old_ip=$(mysql -u $DB_USER -p$DB_PASS $DB_NAME -sN -e "SELECT target_ip FROM domains WHERE domain='$domain';")
    else
        old_ip=$(sqlite3 $SQLITE_DB_PATH "SELECT target_ip FROM domains WHERE domain='$domain';")
    fi
    
    # Get domain ID
    local domain_id
    if [[ $DB_TYPE == "mysql" ]]; then
        domain_id=$(mysql -u $DB_USER -p$DB_PASS $DB_NAME -sN -e "SELECT id FROM domains WHERE domain='$domain';")
    else
        domain_id=$(sqlite3 $SQLITE_DB_PATH "SELECT id FROM domains WHERE domain='$domain';")
    fi
    
    if [[ -z $domain_id ]]; then
        echo "Error: Domain $domain not found."
        exit 1
    fi
    
    # Update domain in database
    if [[ $DB_TYPE == "mysql" ]]; then
        mysql -u $DB_USER -p$DB_PASS $DB_NAME -e "UPDATE domains SET target_ip='$new_ip', last_updated=CURRENT_TIMESTAMP WHERE domain='$domain';"
        mysql -u $DB_USER -p$DB_PASS $DB_NAME -e "INSERT INTO domain_updates (domain_id, old_ip, new_ip, update_method) VALUES ($domain_id, '$old_ip', '$new_ip', 'cli');"
    else
        sqlite3 $SQLITE_DB_PATH "UPDATE domains SET target_ip='$new_ip', last_updated=CURRENT_TIMESTAMP WHERE domain='$domain';"
        sqlite3 $SQLITE_DB_PATH "INSERT INTO domain_updates (domain_id, old_ip, new_ip, update_method) VALUES ($domain_id, '$old_ip', '$new_ip', 'cli');"
    fi
    
    # Update Pi-hole custom DNS
    sed -i "s/^[0-9.]*[[:space:]]*$domain$/$new_ip $domain/" /etc/pihole/custom.list
    
    # Reload Pi-hole DNS
    pihole restartdns reload
    
    echo "Domain $domain updated successfully. IP changed from $old_ip to $new_ip."
}

# Function to list domains
list_domains() {
    local username="$1"
    
    if [[ -n $username ]]; then
        # Get user ID
        local user_id
        if [[ $DB_TYPE == "mysql" ]]; then
            user_id=$(mysql -u $DB_USER -p$DB_PASS $DB_NAME -sN -e "SELECT id FROM users WHERE username='$username';")
        else
            user_id=$(sqlite3 $SQLITE_DB_PATH "SELECT id FROM users WHERE username='$username';")
        fi
        
        if [[ -z $user_id ]]; then
            echo "Error: User $username not found."
            exit 1
        fi
        
        # List domains for specific user
        if [[ $DB_TYPE == "mysql" ]]; then
            mysql -u $DB_USER -p$DB_PASS $DB_NAME -e "SELECT id, domain, type, target_ip, is_active, created_at, last_updated, expiry_date FROM domains WHERE user_id=$user_id;"
        else
            sqlite3 -header -column $SQLITE_DB_PATH "SELECT id, domain, type, target_ip, is_active, created_at, last_updated, expiry_date FROM domains WHERE user_id=$user_id;"
        fi
    else
        # List all domains
        if [[ $DB_TYPE == "mysql" ]]; then
            mysql -u $DB_USER -p$DB_PASS $DB_NAME -e "SELECT d.id, d.domain, d.type, d.target_ip, d.is_active, u.username, d.created_at, d.last_updated, d.expiry_date FROM domains d JOIN users u ON d.user_id = u.id;"
        else
            sqlite3 -header -column $SQLITE_DB_PATH "SELECT d.id, d.domain, d.type, d.target_ip, d.is_active, u.username, d.created_at, d.last_updated, d.expiry_date FROM domains d JOIN users u ON d.user_id = u.id;"
        fi
    fi
}

# Parse command line arguments
case "$1" in
    add)
        if [[ $# -lt 5 ]]; then
            echo "Usage: $0 add <username> <domain> <type> <target_ip>"
            echo "  type: free or premium"
            exit 1
        fi
        add_domain "$2" "$3" "$4" "$5"
        ;;
    delete)
        if [[ $# -lt 2 ]]; then
            echo "Usage: $0 delete <domain>"
            exit 1
        fi
        delete_domain "$2"
        ;;
    update)
        if [[ $# -lt 3 ]]; then
            echo "Usage: $0 update <domain> <new_ip>"
            exit 1
        fi
        update_domain "$2" "$3"
        ;;
    list)
        if [[ $# -lt 2 ]]; then
            list_domains
        else
            list_domains "$2"
        fi
        ;;
    *)
        echo "Usage: $0 {add|delete|update|list} [arguments]"
        exit 1
        ;;
esac

exit 0
EOF
    
    # Make scripts executable
    chmod +x $RSLVD_INSTALL_DIR/custom/core/scripts/user_management.sh
    chmod +x $RSLVD_INSTALL_DIR/custom/core/scripts/domain_management.sh
    
    echo "${GREEN}Pi-hole Core modifications completed.${NORMAL}"
}

# Function to modify AdminLTE
modify_adminlte() {
    echo "${BOLD}Modifying AdminLTE...${NORMAL}"
    
    # Create custom AdminLTE files
    mkdir -p $RSLVD_INSTALL_DIR/custom/admin/scripts/php
    mkdir -p $RSLVD_INSTALL_DIR/custom/admin/scripts/js
    mkdir -p $RSLVD_INSTALL_DIR/custom/admin/style/css
    
    # Create user registration page
    cat > $RSLVD_INSTALL_DIR/custom/admin/register.lp << 'EOF'
<? --[[
*  RSLVD.net: Dynamic DNS Service
*  Based on Pi-hole (https://pi-hole.net)
*  Network-wide ad blocking via your own hardware.
*
*  This file is copyright under the latest version of the EUPL.
*  Please see LICENSE file for your rights under this license.
--]]

mg.include('scripts/lua/header.lp','r')
?>
<body class="hold-transition layout-boxed register-page page-<?=pihole.format_path(mg.request_info.request_uri)?>" data-apiurl="<?=pihole.api_url()?>" data-webhome="<?=webhome?>">
<div class="box register-box" id="register-box">
    <section style="padding: 15px;">
        <div class="register-logo">
            <div class="text-center">
                <img src="<?=webhome?>img/logo.svg" alt="RSLVD.net logo" class="registerpage-logo" width="140" height="202">
            </div>
            <div class="panel-title text-center"><span class="logo-lg" style="font-size: 25px;">RSLVD.<b>net</b></span></div>
        </div>
        <!-- /.register-logo -->

        <div class="card">
            <div class="card-body register-card-body">
                <div id="cookieInfo" class="panel-title text-center text-red" style="font-size: 150%" hidden>Verify that cookies are allowed</div>
                <div class="text-center form-group has-error" id="dns-failure-label" style="display: none;">
                    <label>DNS Server failure detected</label>
                </div>
                <div class="text-center form-group has-warning" id="insecure-box" style="display: none;">
                    <div class="box box-warning">
                        <div class="box-body">
                            Consider upgrading to <a href="#" id="https-link">HTTPS</a> (end-to-end encryption)
                        </div>
                    </div>
                </div>
                <div class="form-group has-error register-box-msg" id="error-label" style="display: none;">
                    <label class="control-label"><i class="fa fa-times-circle"></i> <span id="error-message"></span><br><span id="error-hint" style="display: none;"></span></label>
                </div>

                <form id="registerform">
                    <div class="form-group has-feedback">
                        <input type="text" class="form-control" placeholder="Username" value="" spellcheck="false" id="username" required>
                        <span class="fa fa-user form-control-feedback"></span>
                    </div>
                    <div class="form-group has-feedback">
                        <input type="email" class="form-control" placeholder="Email" value="" spellcheck="false" id="email" required>
                        <span class="fa fa-envelope form-control-feedback"></span>
                    </div>
                    <div class="form-group has-feedback">
                        <input type="password" class="form-control" placeholder="Password" value="" spellcheck="false" id="password" required>
                        <span class="fa fa-lock form-control-feedback"></span>
                    </div>
                    <div class="form-group has-feedback">
                        <input type="password" class="form-control" placeholder="Confirm Password" value="" spellcheck="false" id="confirm_password" required>
                        <span class="fa fa-lock form-control-feedback"></span>
                    </div>
                    <div class="form-group">
                        <div class="checkbox">
                            <label>
                                <input type="checkbox" id="terms" required> I agree to the <a href="#" data-toggle="modal" data-target="#termsModal">Terms of Service</a>
                            </label>
                        </div>
                    </div>
                    <div class="form-group">
                        <button type="submit" class="btn btn-primary form-control"><i class="fas fa-user-plus"></i>&nbsp;&nbsp;&nbsp;Register</button>
                    </div>
                </form>
                <p class="text-center">Already have an account? <a href="login.lp">Log in</a></p>
            </div>
            <!-- /.register-card-body -->
        </div>
    </section>
</div>

<!-- Terms of Service Modal -->
<div class="modal fade" id="termsModal" tabindex="-1" role="dialog" aria-labelledby="termsModalLabel">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h4 class="modal-title" id="termsModalLabel">Terms of Service</h4>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
            </div>
            <div class="modal-body">
                <h4>1. Acceptance of Terms</h4>
                <p>By registering for and using the RSLVD.net service, you agree to be bound by these Terms of Service.</p>
                
                <h4>2. Description of Service</h4>
                <p>RSLVD.net provides dynamic DNS services allowing users to create and manage subdomains.</p>
                
                <h4>3. Registration and Security</h4>
                <p>You are responsible for maintaining the confidentiality of your account information and password.</p>
                
                <h4>4. User Conduct</h4>
                <p>You agree not to use the service for any illegal purposes or to conduct any illegal activity.</p>
                
                <h4>5. Service Limitations</h4>
                <p>Free accounts are limited to 3 subdomains under my.rslvd.net. Premium accounts can register up to 10 subdomains under rslvd.net.</p>
                
                <h4>6. Termination</h4>
                <p>We reserve the right to terminate or suspend your account at any time for violations of these terms.</p>
                
                <h4>7. Changes to Terms</h4>
                <p>We reserve the right to modify these terms at any time. Continued use of the service constitutes acceptance of modified terms.</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>

<script src="<?=pihole.fileversion('scripts/js/footer.js')?>"></script>
<script src="<?=pihole.fileversion('scripts/js/register.js')?>"></script>
</body>
</html>
EOF
    
    # Create domains management page
    cat > $RSLVD_INSTALL_DIR/custom/admin/domains.lp << 'EOF'
<? --[[
*  RSLVD.net: Dynamic DNS Service
*  Based on Pi-hole (https://pi-hole.net)
*  Network-wide ad blocking via your own hardware.
*
*  This file is copyright under the latest version of the EUPL.
*  Please see LICENSE file for your rights under this license.
--]]

mg.include('scripts/lua/header_authenticated.lp','r')

-- Page title and level selector
PageTitle = "Domain Management"
?>

<div class="row">
    <div class="col-md-12">
        <div class="box" id="domain-management">
            <div class="box-header with-border">
                <h3 class="box-title">Your Domains</h3>
                <div class="box-tools pull-right">
                    <button type="button" class="btn btn-primary btn-sm" id="add-domain-btn">
                        <i class="fa fa-plus"></i> Add Domain
                    </button>
                </div>
            </div>
            <!-- /.box-header -->
            <div class="box-body">
                <table id="domainsTable" class="table table-bordered table-striped">
                    <thead>
                        <tr>
                            <th>Domain</th>
                            <th>Type</th>
                            <th>IP Address</th>
                            <th>Last Updated</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <!-- Domain data will be loaded here via JavaScript -->
                    </tbody>
                </table>
            </div>
            <!-- /.box-body -->
        </div>
        <!-- /.box -->
    </div>
</div>

<!-- Add Domain Modal -->
<div class="modal fade" id="addDomainModal" tabindex="-1" role="dialog" aria-labelledby="addDomainModalLabel">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h4 class="modal-title" id="addDomainModalLabel">Add New Domain</h4>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
            </div>
            <div class="modal-body">
                <form id="addDomainForm">
                    <div class="form-group">
                        <label for="domainName">Domain Name</label>
                        <div class="input-group">
                            <input type="text" class="form-control" id="domainName" placeholder="example" required>
                            <div class="input-group-append">
                                <select class="form-control" id="domainType">
                                    <option value="free">.my.rslvd.net (Free)</option>
                                    <option value="premium">.rslvd.net (Premium)</option>
                                </select>
                            </div>
                        </div>
                        <small class="form-text text-muted">Enter only the subdomain part (e.g., "example" for example.my.rslvd.net)</small>
                    </div>
                    <div class="form-group">
                        <label for="ipAddress">IP Address</label>
                        <input type="text" class="form-control" id="ipAddress" placeholder="Enter IP address" required>
                        <button type="button" class="btn btn-default btn-sm mt-2" id="detectIP">Detect My IP</button>
                    </div>
                    <div id="premiumOptions" style="display: none;">
                        <div class="form-group">
                            <label for="billingCycle">Billing Cycle</label>
                            <select class="form-control" id="billingCycle">
                                <option value="monthly">Monthly ($5.00/month)</option>
                                <option value="yearly">Yearly ($50.00/year)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="paymentMethod">Payment Method</label>
                            <select class="form-control" id="paymentMethod">
                                <option value="credit_card">Credit Card</option>
                                <option value="paypal">PayPal</option>
                            </select>
                        </div>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="saveDomainBtn">Save Domain</button>
            </div>
        </div>
    </div>
</div>

<!-- Edit Domain Modal -->
<div class="modal fade" id="editDomainModal" tabindex="-1" role="dialog" aria-labelledby="editDomainModalLabel">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h4 class="modal-title" id="editDomainModalLabel">Edit Domain</h4>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
            </div>
            <div class="modal-body">
                <form id="editDomainForm">
                    <input type="hidden" id="editDomainId">
                    <div class="form-group">
                        <label for="editDomainName">Domain Name</label>
                        <input type="text" class="form-control" id="editDomainName" readonly>
                    </div>
                    <div class="form-group">
                        <label for="editIpAddress">IP Address</label>
                        <input type="text" class="form-control" id="editIpAddress" placeholder="Enter IP address" required>
                        <button type="button" class="btn btn-default btn-sm mt-2" id="editDetectIP">Detect My IP</button>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="updateDomainBtn">Update Domain</button>
            </div>
        </div>
    </div>
</div>

<!-- Domain History Modal -->
<div class="modal fade" id="domainHistoryModal" tabindex="-1" role="dialog" aria-labelledby="domainHistoryModalLabel">
    <div class="modal-dialog modal-lg" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h4 class="modal-title" id="domainHistoryModalLabel">Domain Update History</h4>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
            </div>
            <div class="modal-body">
                <table id="historyTable" class="table table-bordered table-striped">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Old IP</th>
                            <th>New IP</th>
                            <th>Update Method</th>
                        </tr>
                    </thead>
                    <tbody>
                        <!-- History data will be loaded here via JavaScript -->
                    </tbody>
                </table>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>

<!-- API Key Modal -->
<div class="modal fade" id="apiKeyModal" tabindex="-1" role="dialog" aria-labelledby="apiKeyModalLabel">
    <div class="modal-dialog" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h4 class="modal-title" id="apiKeyModalLabel">API Key</h4>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="apiKey">Your API Key</label>
                    <div class="input-group">
                        <input type="text" class="form-control" id="apiKey" readonly>
                        <div class="input-group-append">
                            <button class="btn btn-default" type="button" id="copyApiKey">Copy</button>
                        </div>
                    </div>
                    <small class="form-text text-muted">Use this key to update your domains programmatically.</small>
                </div>
                <div class="form-group">
                    <label>Example Update URL</label>
                    <pre>https://api.rslvd.net/v1/update?domain=example.my.rslvd.net&ip=192.168.1.1</pre>
                    <small class="form-text text-muted">Include your API key in the Authorization header: <code>Authorization: Bearer YOUR_API_KEY</code></small>
                </div>
                <div class="form-group">
                    <button type="button" class="btn btn-warning" id="regenerateApiKey">Regenerate API Key</button>
                    <small class="form-text text-muted">Warning: This will invalidate your current API key.</small>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>

<script src="<?=pihole.fileversion('scripts/js/domains.js')?>"></script>

<? mg.include('scripts/lua/footer.lp','r')?>
EOF
    
    # Create JavaScript for registration
    cat > $RSLVD_INSTALL_DIR/custom/admin/scripts/js/register.js << 'EOF'
/* RSLVD.net: Dynamic DNS Service
 * Based on Pi-hole (https://pi-hole.net)
 * Network-wide ad blocking via your own hardware.
 *
 * This file is copyright under the latest version of the EUPL.
 * Please see LICENSE file for your rights under this license.
 */

$(document).ready(function() {
    // Form validation
    $("#registerform").submit(function(e) {
        e.preventDefault();
        
        // Hide any previous error messages
        $("#error-label").hide();
        
        // Get form values
        var username = $("#username").val();
        var email = $("#email").val();
        var password = $("#password").val();
        var confirmPassword = $("#confirm_password").val();
        var terms = $("#terms").is(":checked");
        
        // Validate form
        if (!username || !email || !password || !confirmPassword) {
            $("#error-message").text("All fields are required.");
            $("#error-label").show();
            return;
        }
        
        if (password !== confirmPassword) {
            $("#error-message").text("Passwords do not match.");
            $("#error-label").show();
            return;
        }
        
        if (!terms) {
            $("#error-message").text("You must agree to the Terms of Service.");
            $("#error-label").show();
            return;
        }
        
        // Submit registration
        $.ajax({
            url: "api/user/register",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify({
                username: username,
                email: email,
                password: password
            }),
            success: function(response) {
                if (response.success) {
                    // Redirect to verification page
                    window.location.href = "verify.lp?email=" + encodeURIComponent(email);
                } else {
                    $("#error-message").text(response.message);
                    $("#error-label").show();
                }
            },
            error: function(xhr) {
                var response = xhr.responseJSON || {};
                $("#error-message").text(response.message || "Registration failed. Please try again.");
                $("#error-label").show();
            }
        });
    });
});
EOF
    
    # Create JavaScript for domains management
    cat > $RSLVD_INSTALL_DIR/custom/admin/scripts/js/domains.js << 'EOF'
/* RSLVD.net: Dynamic DNS Service
 * Based on Pi-hole (https://pi-hole.net)
 * Network-wide ad blocking via your own hardware.
 *
 * This file is copyright under the latest version of the EUPL.
 * Please see LICENSE file for your rights under this license.
 */

$(document).ready(function() {
    // Load domains
    loadDomains();
    
    // Add domain button click
    $("#add-domain-btn").click(function() {
        $("#addDomainModal").modal("show");
    });
    
    // Domain type change
    $("#domainType").change(function() {
        if ($(this).val() === "premium") {
            $("#premiumOptions").show();
        } else {
            $("#premiumOptions").hide();
        }
    });
    
    // Detect IP buttons
    $("#detectIP, #editDetectIP").click(function() {
        $.getJSON("https://api.ipify.org?format=json", function(data) {
            if ($(this).attr("id") === "detectIP") {
                $("#ipAddress").val(data.ip);
            } else {
                $("#editIpAddress").val(data.ip);
            }
        });
    });
    
    // Save domain button click
    $("#saveDomainBtn").click(function() {
        var domainName = $("#domainName").val();
        var domainType = $("#domainType").val();
        var ipAddress = $("#ipAddress").val();
        
        // Validate form
        if (!domainName || !ipAddress) {
            alert("Domain name and IP address are required.");
            return;
        }
        
        // Prepare data
        var data = {
            domain: domainName,
            type: domainType,
            target_ip: ipAddress
        };
        
        // Add payment data for premium domains
        if (domainType === "premium") {
            data.billing_cycle = $("#billingCycle").val();
            data.payment_method = $("#paymentMethod").val();
        }
        
        // Submit domain
        $.ajax({
            url: "api/domains",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify(data),
            success: function(response) {
                if (response.success) {
                    $("#addDomainModal").modal("hide");
                    loadDomains();
                    
                    // Reset form
                    $("#domainName").val("");
                    $("#ipAddress").val("");
                    $("#domainType").val("free");
                    $("#premiumOptions").hide();
                } else {
                    alert(response.message);
                }
            },
            error: function(xhr) {
                var response = xhr.responseJSON || {};
                alert(response.message || "Failed to add domain. Please try again.");
            }
        });
    });
    
    // Update domain button click
    $("#updateDomainBtn").click(function() {
        var domainId = $("#editDomainId").val();
        var ipAddress = $("#editIpAddress").val();
        
        // Validate form
        if (!ipAddress) {
            alert("IP address is required.");
            return;
        }
        
        // Submit update
        $.ajax({
            url: "api/domains/" + domainId,
            method: "PUT",
            contentType: "application/json",
            data: JSON.stringify({
                target_ip: ipAddress
            }),
            success: function(response) {
                if (response.success) {
                    $("#editDomainModal").modal("hide");
                    loadDomains();
                } else {
                    alert(response.message);
                }
            },
            error: function(xhr) {
                var response = xhr.responseJSON || {};
                alert(response.message || "Failed to update domain. Please try again.");
            }
        });
    });
    
    // Load API key
    $("#apiKeyModal").on("show.bs.modal", function() {
        $.ajax({
            url: "api/user/api-key",
            method: "GET",
            success: function(response) {
                if (response.success) {
                    $("#apiKey").val(response.api_key);
                } else {
                    alert(response.message);
                }
            },
            error: function(xhr) {
                var response = xhr.responseJSON || {};
                alert(response.message || "Failed to load API key. Please try again.");
            }
        });
    });
    
    // Copy API key button
    $("#copyApiKey").click(function() {
        var apiKey = $("#apiKey");
        apiKey.select();
        document.execCommand("copy");
        $(this).text("Copied!");
        setTimeout(function() {
            $("#copyApiKey").text("Copy");
        }, 2000);
    });
    
    // Regenerate API key button
    $("#regenerateApiKey").click(function() {
        if (confirm("Are you sure you want to regenerate your API key? This will invalidate your current key.")) {
            $.ajax({
                url: "api/user/api-key",
                method: "POST",
                success: function(response) {
                    if (response.success) {
                        $("#apiKey").val(response.api_key);
                    } else {
                        alert(response.message);
                    }
                },
                error: function(xhr) {
                    var response = xhr.responseJSON || {};
                    alert(response.message || "Failed to regenerate API key. Please try again.");
                }
            });
        }
    });
});

// Function to load domains
function loadDomains() {
    $.ajax({
        url: "api/domains",
        method: "GET",
        success: function(response) {
            if (response.success) {
                var domains = response.domains;
                var tableBody = $("#domainsTable tbody");
                
                // Clear table
                tableBody.empty();
                
                // Add domains to table
                domains.forEach(function(domain) {
                    var row = $("<tr></tr>");
                    
                    // Domain name
                    row.append($("<td></td>").text(domain.domain));
                    
                    // Type
                    var typeCell = $("<td></td>");
                    if (domain.type === "free") {
                        typeCell.append($("<span class='label label-primary'></span>").text("Free"));
                    } else {
                        typeCell.append($("<span class='label label-success'></span>").text("Premium"));
                    }
                    row.append(typeCell);
                    
                    // IP address
                    row.append($("<td></td>").text(domain.target_ip));
                    
                    // Last updated
                    row.append($("<td></td>").text(formatDate(domain.last_updated)));
                    
                    // Status
                    var statusCell = $("<td></td>");
                    if (domain.is_active) {
                        statusCell.append($("<span class='label label-success'></span>").text("Active"));
                    } else {
                        statusCell.append($("<span class='label label-danger'></span>").text("Inactive"));
                    }
                    row.append(statusCell);
                    
                    // Actions
                    var actionsCell = $("<td></td>");
                    
                    // Edit button
                    var editBtn = $("<button class='btn btn-xs btn-primary mr-1'></button>")
                        .append($("<i class='fa fa-edit'></i>"))
                        .attr("title", "Edit")
                        .click(function() {
                            editDomain(domain);
                        });
                    actionsCell.append(editBtn);
                    
                    // History button
                    var historyBtn = $("<button class='btn btn-xs btn-info mr-1'></button>")
                        .append($("<i class='fa fa-history'></i>"))
                        .attr("title", "History")
                        .click(function() {
                            showDomainHistory(domain.id);
                        });
                    actionsCell.append(historyBtn);
                    
                    // API button
                    var apiBtn = $("<button class='btn btn-xs btn-default mr-1'></button>")
                        .append($("<i class='fa fa-key'></i>"))
                        .attr("title", "API Key")
                        .click(function() {
                            $("#apiKeyModal").modal("show");
                        });
                    actionsCell.append(apiBtn);
                    
                    // Delete button
                    var deleteBtn = $("<button class='btn btn-xs btn-danger'></button>")
                        .append($("<i class='fa fa-trash'></i>"))
                        .attr("title", "Delete")
                        .click(function() {
                            deleteDomain(domain.id, domain.domain);
                        });
                    actionsCell.append(deleteBtn);
                    
                    row.append(actionsCell);
                    
                    tableBody.append(row);
                });
            } else {
                alert(response.message);
            }
        },
        error: function(xhr) {
            var response = xhr.responseJSON || {};
            alert(response.message || "Failed to load domains. Please try again.");
        }
    });
}

// Function to edit domain
function editDomain(domain) {
    $("#editDomainId").val(domain.id);
    $("#editDomainName").val(domain.domain);
    $("#editIpAddress").val(domain.target_ip);
    $("#editDomainModal").modal("show");
}

// Function to show domain history
function showDomainHistory(domainId) {
    $.ajax({
        url: "api/domains/" + domainId + "/history",
        method: "GET",
        success: function(response) {
            if (response.success) {
                var history = response.history;
                var tableBody = $("#historyTable tbody");
                
                // Clear table
                tableBody.empty();
                
                // Add history to table
                history.forEach(function(entry) {
                    var row = $("<tr></tr>");
                    
                    // Date
                    row.append($("<td></td>").text(formatDate(entry.updated_at)));
                    
                    // Old IP
                    row.append($("<td></td>").text(entry.old_ip || "N/A"));
                    
                    // New IP
                    row.append($("<td></td>").text(entry.new_ip));
                    
                    // Update method
                    row.append($("<td></td>").text(formatUpdateMethod(entry.update_method)));
                    
                    tableBody.append(row);
                });
                
                $("#domainHistoryModal").modal("show");
            } else {
                alert(response.message);
            }
        },
        error: function(xhr) {
            var response = xhr.responseJSON || {};
            alert(response.message || "Failed to load domain history. Please try again.");
        }
    });
}

// Function to delete domain
function deleteDomain(domainId, domainName) {
    if (confirm("Are you sure you want to delete the domain '" + domainName + "'? This action cannot be undone.")) {
        $.ajax({
            url: "api/domains/" + domainId,
            method: "DELETE",
            success: function(response) {
                if (response.success) {
                    loadDomains();
                } else {
                    alert(response.message);
                }
            },
            error: function(xhr) {
                var response = xhr.responseJSON || {};
                alert(response.message || "Failed to delete domain. Please try again.");
            }
        });
    }
}

// Helper function to format date
function formatDate(dateString) {
    if (!dateString) return "N/A";
    
    var date = new Date(dateString);
    return date.toLocaleString();
}

// Helper function to format update method
function formatUpdateMethod(method) {
    switch (method) {
        case "web":
            return "Web Interface";
        case "api":
            return "API";
        case "client":
            return "Client";
        case "cli":
            return "Command Line";
        default:
            return method;
    }
}
EOF
    
    # Create PHP API handler for user registration
    mkdir -p $RSLVD_INSTALL_DIR/custom/admin/api/user
    cat > $RSLVD_INSTALL_DIR/custom/admin/api/user/register.php << 'EOF'
<?php
/**
 * RSLVD.net: Dynamic DNS Service
 * Based on Pi-hole (https://pi-hole.net)
 * Network-wide ad blocking via your own hardware.
 *
 * This file is copyright under the latest version of the EUPL.
 * Please see LICENSE file for your rights under this license.
 */

// Load configuration
require_once('../../scripts/php/database.php');
require_once('../../scripts/php/utils.php');

// Get request data
$data = json_decode(file_get_contents('php://input'), true);

// Validate request
if (!isset($data['username']) || !isset($data['email']) || !isset($data['password'])) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Missing required fields'
    ]);
    exit;
}

$username = $data['username'];
$email = $data['email'];
$password = $data['password'];

// Validate username
if (!preg_match('/^[a-zA-Z0-9_]{3,50}$/', $username)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Username must be 3-50 characters and contain only letters, numbers, and underscores'
    ]);
    exit;
}

// Validate email
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid email address'
    ]);
    exit;
}

// Validate password
if (strlen($password) < 8) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Password must be at least 8 characters'
    ]);
    exit;
}

// Check if username or email already exists
$db = get_db_connection();

$stmt = $db->prepare('SELECT id FROM users WHERE username = ? OR email = ?');
$stmt->bind_param('ss', $username, $email);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows > 0) {
    $row = $result->fetch_assoc();
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Username or email already exists'
    ]);
    exit;
}

// Generate verification token
$verification_token = bin2hex(random_bytes(32));

// Hash password
$password_hash = password_hash($password, PASSWORD_BCRYPT);

// Generate API key
$api_key = bin2hex(random_bytes(32));

// Insert user into database
$stmt = $db->prepare('INSERT INTO users (username, email, password_hash, api_key, verification_token) VALUES (?, ?, ?, ?, ?)');
$stmt->bind_param('sssss', $username, $email, $password_hash, $api_key, $verification_token);

if ($stmt->execute()) {
    // Send verification email
    $verification_url = 'https://' . $_SERVER['HTTP_HOST'] . '/verify.lp?token=' . $verification_token;
    $subject = 'RSLVD.net - Verify Your Email';
    $message = "Hello $username,\n\n"
        . "Thank you for registering with RSLVD.net!\n\n"
        . "Please click the link below to verify your email address:\n"
        . "$verification_url\n\n"
        . "If you did not register for RSLVD.net, please ignore this email.\n\n"
        . "Regards,\n"
        . "The RSLVD.net Team";
    
    send_email($email, $subject, $message);
    
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Registration successful. Please check your email to verify your account.'
    ]);
} else {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Registration failed. Please try again.'
    ]);
}

$stmt->close();
$db->close();
EOF
    
    # Create PHP database connection helper
    mkdir -p $RSLVD_INSTALL_DIR/custom/admin/scripts/php
    cat > $RSLVD_INSTALL_DIR/custom/admin/scripts/php/database.php << 'EOF'
<?php
/**
 * RSLVD.net: Dynamic DNS Service
 * Based on Pi-hole (https://pi-hole.net)
 * Network-wide ad blocking via your own hardware.
 *
 * This file is copyright under the latest version of the EUPL.
 * Please see LICENSE file for your rights under this license.
 */

// Load configuration
$config = parse_ini_file('/etc/rslvd/rslvd.conf');

/**
 * Get database connection
 * 
 * @return mysqli|PDO Database connection
 */
function get_db_connection() {
    global $config;
    
    if ($config['DB_TYPE'] === 'mysql') {
        // MySQL connection
        $db = new mysqli(
            $config['DB_HOST'],
            $config['DB_USER'],
            $config['DB_PASS'],
            $config['DB_NAME']
        );
        
        if ($db->connect_error) {
            die('Database connection failed: ' . $db->connect_error);
        }
        
        return $db;
    } else {
        // SQLite connection
        $db = new PDO('sqlite:' . $config['SQLITE_DB_PATH']);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        return $db;
    }
}
EOF
    
    # Create PHP utility functions
    cat > $RSLVD_INSTALL_DIR/custom/admin/scripts/php/utils.php << 'EOF'
<?php
/**
 * RSLVD.net: Dynamic DNS Service
 * Based on Pi-hole (https://pi-hole.net)
 * Network-wide ad blocking via your own hardware.
 *
 * This file is copyright under the latest version of the EUPL.
 * Please see LICENSE file for your rights under this license.
 */

// Load configuration
$config = parse_ini_file('/etc/rslvd/rslvd.conf');

/**
 * Send email
 * 
 * @param string $to Recipient email address
 * @param string $subject Email subject
 * @param string $message Email message
 * @return bool True if email was sent, false otherwise
 */
function send_email($to, $subject, $message) {
    global $config;
    
    $headers = 'From: ' . $config['ADMIN_EMAIL'] . "\r\n" .
        'Reply-To: ' . $config['ADMIN_EMAIL'] . "\r\n" .
        'X-Mailer: PHP/' . phpversion();
    
    return mail($to, $subject, $message, $headers);
}

/**
 * Generate random string
 * 
 * @param int $length Length of the random string
 * @return string Random string
 */
function generate_random_string($length = 32) {
    return bin2hex(random_bytes($length / 2));
}

/**
 * Validate IP address
 * 
 * @param string $ip IP address to validate
 * @return bool True if IP address is valid, false otherwise
 */
function validate_ip($ip) {
    return filter_var($ip, FILTER_VALIDATE_IP);
}

/**
 * Validate domain name
 * 
 * @param string $domain Domain name to validate
 * @return bool True if domain name is valid, false otherwise
 */
function validate_domain($domain) {
    return preg_match('/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/', $domain);
}

/**
 * Get client IP address
 * 
 * @return string Client IP address
 */
function get_client_ip() {
    if (!empty($_SERVER['HTTP_CLIENT_IP'])) {
        $ip = $_SERVER['HTTP_CLIENT_IP'];
    } elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $ip = $_SERVER['HTTP_X_FORWARDED_FOR'];
    } else {
        $ip = $_SERVER['REMOTE_ADDR'];
    }
    
    return $ip;
}

/**
 * Log API request
 * 
 * @param int $user_id User ID
 * @param string $endpoint API endpoint
 * @return void
 */
function log_api_request($user_id, $endpoint) {
    global $config;
    
    $ip = get_client_ip();
    $user_agent = $_SERVER['HTTP_USER_AGENT'] ?? '';
    
    $db = get_db_connection();
    
    if ($config['DB_TYPE'] === 'mysql') {
        $stmt = $db->prepare('INSERT INTO api_requests (user_id, endpoint, ip_address, user_agent) VALUES (?, ?, ?, ?)');
        $stmt->bind_param('isss', $user_id, $endpoint, $ip, $user_agent);
        $stmt->execute();
        $stmt->close();
    } else {
        $stmt = $db->prepare('INSERT INTO api_requests (user_id, endpoint, ip_address, user_agent) VALUES (?, ?, ?, ?)');
        $stmt->execute([$user_id, $endpoint, $ip, $user_agent]);
    }
    
    $db = null;
}

/**
 * Check API rate limit
 * 
 * @param int $user_id User ID
 * @return bool True if rate limit is not exceeded, false otherwise
 */
function check_api_rate_limit($user_id) {
    global $config;
    
    $db = get_db_connection();
    
    // Get rate limit from settings
    if ($config['DB_TYPE'] === 'mysql') {
        $stmt = $db->prepare('SELECT setting_value FROM settings WHERE setting_name = "api_rate_limit"');
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result->fetch_assoc();
        $rate_limit = (int)$row['setting_value'];
        $stmt->close();
        
        // Count requests in the last hour
        $stmt = $db->prepare('SELECT COUNT(*) as count FROM api_requests WHERE user_id = ? AND request_time > DATE_SUB(NOW(), INTERVAL 1 HOUR)');
        $stmt->bind_param('i', $user_id);
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result->fetch_assoc();
        $count = (int)$row['count'];
        $stmt->close();
    } else {
        $stmt = $db->prepare('SELECT setting_value FROM settings WHERE setting_name = "api_rate_limit"');
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $rate_limit = (int)$row['setting_value'];
        
        // Count requests in the last hour
        $stmt = $db->prepare('SELECT COUNT(*) as count FROM api_requests WHERE user_id = ? AND request_time > datetime("now", "-1 hour")');
        $stmt->execute([$user_id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $count = (int)$row['count'];
    }
    
    $db = null;
    
    return $count < $rate_limit;
}
EOF
    
    echo "${GREEN}AdminLTE modifications completed.${NORMAL}"
}

# Function to modify FTL
modify_ftl() {
    echo "${BOLD}Modifying FTL...${NORMAL}"
    
    # Create custom FTL files
    mkdir -p $RSLVD_INSTALL_DIR/custom/ftl/src
    
    # Create custom DNS resolver
    cat > $RSLVD_INSTALL_DIR/custom/ftl/src/rslvd_resolver.c << 'EOF'
/* RSLVD.net: Dynamic DNS Service
 * Based on Pi-hole (https://pi-hole.net)
 * Network-wide ad blocking via your own hardware.
 *
 * This file is copyright under the latest version of the EUPL.
 * Please see LICENSE file for your rights under this license.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sqlite3.h>
#include <time.h>
#include <syslog.h>
#include "rslvd_resolver.h"

// Database connection
static sqlite3 *db = NULL;

// Configuration
static char db_path[256] = "";

/**
 * Initialize RSLVD resolver
 * 
 * @param config_file Path to configuration file
 * @return 0 on success, -1 on error
 */
int rslvd_init(const char *config_file) {
    FILE *fp;
    char line[256];
    char db_type[16] = "";
    
    // Open configuration file
    fp = fopen(config_file, "r");
    if (fp == NULL) {
        syslog(LOG_ERR, "RSLVD: Failed to open configuration file: %s", config_file);
        return -1;
    }
    
    // Read configuration
    while (fgets(line, sizeof(line), fp)) {
        char key[64], value[192];
        
        // Skip comments and empty lines
        if (line[0] == '#' || line[0] == '\n') {
            continue;
        }
        
        // Parse key-value pair
        if (sscanf(line, "%63[^=]=%191[^\n]", key, value) == 2) {
            // Remove leading/trailing whitespace
            char *k = key;
            while (*k == ' ' || *k == '\t') k++;
            char *v = value;
            while (*v == ' ' || *v == '\t') v++;
            
            // Remove trailing whitespace
            char *end = k + strlen(k) - 1;
            while (end > k && (*end == ' ' || *end == '\t')) *end-- = '\0';
            end = v + strlen(v) - 1;
            while (end > v && (*end == ' ' || *end == '\t')) *end-- = '\0';
            
            // Check for database configuration
            if (strcmp(k, "DB_TYPE") == 0) {
                strncpy(db_type, v, sizeof(db_type) - 1);
            } else if (strcmp(k, "SQLITE_DB_PATH") == 0) {
                strncpy(db_path, v, sizeof(db_path) - 1);
            }
        }
    }
    
    fclose(fp);
    
    // Validate configuration
    if (strcmp(db_type, "sqlite") != 0 || strlen(db_path) == 0) {
        syslog(LOG_ERR, "RSLVD: Invalid database configuration");
        return -1;
    }
    
    // Open database connection
    int rc = sqlite3_open(db_path, &db);
    if (rc != SQLITE_OK) {
        syslog(LOG_ERR, "RSLVD: Failed to open database: %s", sqlite3_errmsg(db));
        sqlite3_close(db);
        db = NULL;
        return -1;
    }
    
    syslog(LOG_INFO, "RSLVD: Resolver initialized successfully");
    return 0;
}

/**
 * Cleanup RSLVD resolver
 */
void rslvd_cleanup(void) {
    if (db != NULL) {
        sqlite3_close(db);
        db = NULL;
    }
}

/**
 * Resolve domain name to IP address
 * 
 * @param domain Domain name to resolve
 * @param ip Buffer to store IP address
 * @param ip_len Length of IP buffer
 * @return 0 on success, -1 if domain not found, -2 on error
 */
int rslvd_resolve(const char *domain, char *ip, size_t ip_len) {
    sqlite3_stmt *stmt;
    int rc;
    
    // Check if database is initialized
    if (db == NULL) {
        syslog(LOG_ERR, "RSLVD: Database not initialized");
        return -2;
    }
    
    // Prepare query
    const char *query = "SELECT target_ip FROM domains WHERE domain = ? AND is_active = 1";
    rc = sqlite3_prepare_v2(db, query, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        syslog(LOG_ERR, "RSLVD: Failed to prepare query: %s", sqlite3_errmsg(db));
        return -2;
    }
    
    // Bind parameters
    rc = sqlite3_bind_text(stmt, 1, domain, -1, SQLITE_STATIC);
    if (rc != SQLITE_OK) {
        syslog(LOG_ERR, "RSLVD: Failed to bind parameter: %s", sqlite3_errmsg(db));
        sqlite3_finalize(stmt);
        return -2;
    }
    
    // Execute query
    rc = sqlite3_step(stmt);
    if (rc == SQLITE_ROW) {
        // Domain found
        const char *target_ip = (const char *)sqlite3_column_text(stmt, 0);
        strncpy(ip, target_ip, ip_len - 1);
        ip[ip_len - 1] = '\0';
        sqlite3_finalize(stmt);
        return 0;
    } else if (rc == SQLITE_DONE) {
        // Domain not found
        sqlite3_finalize(stmt);
        return -1;
    } else {
        // Error
        syslog(LOG_ERR, "RSLVD: Failed to execute query: %s", sqlite3_errmsg(db));
        sqlite3_finalize(stmt);
        return -2;
    }
}

/**
 * Log domain resolution
 * 
 * @param domain Domain name
 * @param ip IP address
 * @param source Source of resolution (0 = database, 1 = cache)
 * @return 0 on success, -1 on error
 */
int rslvd_log_resolution(const char *domain, const char *ip, int source) {
    // This function is optional and can be implemented later
    return 0;
}
EOF
    
    # Create custom DNS resolver header
    cat > $RSLVD_INSTALL_DIR/custom/ftl/src/rslvd_resolver.h << 'EOF'
/* RSLVD.net: Dynamic DNS Service
 * Based on Pi-hole (https://pi-hole.net)
 * Network-wide ad blocking via your own hardware.
 *
 * This file is copyright under the latest version of the EUPL.
 * Please see LICENSE file for your rights under this license.
 */

#ifndef RSLVD_RESOLVER_H
#define RSLVD_RESOLVER_H

#include <stddef.h>

/**
 * Initialize RSLVD resolver
 * 
 * @param config_file Path to configuration file
 * @return 0 on success, -1 on error
 */
int rslvd_init(const char *config_file);

/**
 * Cleanup RSLVD resolver
 */
void rslvd_cleanup(void);

/**
 * Resolve domain name to IP address
 * 
 * @param domain Domain name to resolve
 * @param ip Buffer to store IP address
 * @param ip_len Length of IP buffer
 * @return 0 on success, -1 if domain not found, -2 on error
 */
int rslvd_resolve(const char *domain, char *ip, size_t ip_len);

/**
 * Log domain resolution
 * 
 * @param domain Domain name
 * @param ip IP address
 * @param source Source of resolution (0 = database, 1 = cache)
 * @return 0 on success, -1 on error
 */
int rslvd_log_resolution(const char *domain, const char *ip, int source);

#endif /* RSLVD_RESOLVER_H */
EOF
    
    # Create patch to integrate custom resolver
    cat > $RSLVD_INSTALL_DIR/custom/ftl/rslvd_integration.patch << 'EOF'
diff --git a/src/dnsmasq_interface.c b/src/dnsmasq_interface.c
index 1234567..abcdef0 100644
--- a/src/dnsmasq_interface.c
+++ b/src/dnsmasq_interface.c
@@ -20,6 +20,7 @@
 #include "log.h"
 #include "datastructure.h"
 #include "database/database-thread.h"
+#include "rslvd_resolver.h"
 
 // Private prototypes
 static void FTL_hook(int argc, char **argv);
@@ -27,6 +28,7 @@ static void FTL_reply(int flags, char *name, union all_addr *addr, int id);
 
 void dnsmasq_init(void)
 {
+    rslvd_init("/etc/rslvd/rslvd.conf");
     // Set dnsmasq callback hooks
     hooks.hook = FTL_hook;
     hooks.reply = FTL_reply;
@@ -34,6 +36,7 @@ void dnsmasq_init(void)
 
 void dnsmasq_cleanup(void)
 {
+    rslvd_cleanup();
     // Nothing to do here
 }
 
@@ -41,6 +44,19 @@ static void FTL_hook(int argc, char **argv)
 {
     // This function is called by dnsmasq before a query is answered
     // We use it to log the query and update our statistics
+    
+    // Check if this is a domain handled by RSLVD
+    if (argc >= 2) {
+        char ip[INET6_ADDRSTRLEN];
+        if (rslvd_resolve(argv[1], ip, sizeof(ip)) == 0) {
+            // Domain found in RSLVD database
+            // Log resolution
+            rslvd_log_resolution(argv[1], ip, 0);
+            
+            // The actual resolution will be handled by dnsmasq using the custom.list file
+        }
+    }
+    
     // Process query
     process_request(argc, argv);
 }
EOF
    
    echo "${GREEN}FTL modifications completed.${NORMAL}"
}

# Function to create configuration files
create_config_files() {
    echo "${BOLD}Creating configuration files...${NORMAL}"
    
    # Create configuration directory
    mkdir -p /etc/rslvd
    
    # Create main configuration file
    cat > /etc/rslvd/rslvd.conf << EOF
# RSLVD.net Configuration File

# Domain Configuration
RSLVD_DOMAIN="${RSLVD_DOMAIN}"
FREE_DOMAIN_SUFFIX="${RSLVD_FREE_SUBDOMAIN}"
PREMIUM_DOMAIN_SUFFIX="${RSLVD_DOMAIN}"

# Administrator Configuration
ADMIN_EMAIL="${ADMIN_EMAIL}"

# Database Configuration
DB_TYPE="${DB_TYPE}"
EOF

    if [[ $DB_TYPE == "mysql" ]]; then
        cat >> /etc/rslvd/rslvd.conf << EOF
DB_HOST="${DB_HOST}"
DB_NAME="${DB_NAME}"
DB_USER="${DB_USER}"
DB_PASS="${DB_PASS}"
EOF
    else
        cat >> /etc/rslvd/rslvd.conf << EOF
SQLITE_DB_PATH="${RSLVD_INSTALL_DIR}/data/rslvd.db"
EOF
    fi

    cat >> /etc/rslvd/rslvd.conf << EOF

# Payment Gateway Configuration
PAYMENT_GATEWAY="${PAYMENT_GATEWAY}"
PAYMENT_API_KEY="${PAYMENT_API_KEY}"
PAYMENT_SECRET_KEY="${PAYMENT_SECRET_KEY}"

# Installation Directories
RSLVD_INSTALL_DIR="${RSLVD_INSTALL_DIR}"
WEBROOT_DIR="${WEBROOT_DIR}"
PIHOLE_DIR="${PIHOLE_DIR}"
EOF
    
    # Create nginx configuration
    cat > /etc/nginx/sites-available/rslvd << EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${RSLVD_DOMAIN} www.${RSLVD_DOMAIN} api.${RSLVD_DOMAIN};
    
    # Redirect to HTTPS
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${RSLVD_DOMAIN} www.${RSLVD_DOMAIN};
    
    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/${RSLVD_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${RSLVD_DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-SHA384;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_stapling on;
    ssl_stapling_verify on;
    
    # Web root
    root ${WEBROOT_DIR};
    index index.lp index.php index.html;
    
    # Logging
    access_log /var/log/nginx/rslvd.access.log;
    error_log /var/log/nginx/rslvd.error.log;
    
    # PHP processing
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php7.4-fpm.sock;
    }
    
    # Pi-hole admin interface
    location / {
        try_files \$uri \$uri/ =404;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name api.${RSLVD_DOMAIN};
    
    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/${RSLVD_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${RSLVD_DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-SHA384;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_stapling on;
    ssl_stapling_verify on;
    
    # Web root
    root ${WEBROOT_DIR}/api;
    index index.php;
    
    # Logging
    access_log /var/log/nginx/rslvd-api.access.log;
    error_log /var/log/nginx/rslvd-api.error.log;
    
    # CORS headers
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type' always;
    
    # PHP processing
    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php7.4-fpm.sock;
    }
    
    # API routing
    location / {
        try_files \$uri \$uri/ /index.php?\$args;
    }
}
EOF
    
    # Create symbolic link to enable nginx site
    ln -sf /etc/nginx/sites-available/rslvd /etc/nginx/sites-enabled/
    
    echo "${GREEN}Configuration files created successfully.${NORMAL}"
}

# Function to install and configure Pi-hole
install_pihole() {
    echo "${BOLD}Installing and configuring Pi-hole...${NORMAL}"
    
    # Create temporary installation configuration
    cat > /tmp/setupVars.conf << EOF
PIHOLE_INTERFACE=eth0
IPV4_ADDRESS=0.0.0.0
IPV6_ADDRESS=::
QUERY_LOGGING=true
INSTALL_WEB_SERVER=true
INSTALL_WEB_INTERFACE=true
LIGHTTPD_ENABLED=false
CACHE_SIZE=10000
DNS_FQDN_REQUIRED=true
DNS_BOGUS_PRIV=true
DNSMASQ_LISTENING=local
WEBPASSWORD=
BLOCKING_ENABLED=true
PIHOLE_DNS_1=8.8.8.8
PIHOLE_DNS_2=8.8.4.4
EOF
    
    # Install Pi-hole
    cd $RSLVD_INSTALL_DIR/pihole
    bash -c "PIHOLE_SKIP_OS_CHECK=true PH_TEST=true bash ./automated\ install/basic-install.sh --unattended /tmp/setupVars.conf"
    
    # Copy modified files
    cp -r $RSLVD_INSTALL_DIR/custom/core/scripts/* /usr/local/bin/
    chmod +x /usr/local/bin/user_management.sh
    chmod +x /usr/local/bin/domain_management.sh
    
    # Create symlinks
    ln -sf /usr/local/bin/user_management.sh /usr/local/bin/rslvd-user
    ln -sf /usr/local/bin/domain_management.sh /usr/local/bin/rslvd-domain
    
    echo "${GREEN}Pi-hole installed and configured successfully.${NORMAL}"
}

# Function to install and configure AdminLTE
install_adminlte() {
    echo "${BOLD}Installing and configuring AdminLTE...${NORMAL}"
    
    # Copy AdminLTE files
    cp -r $RSLVD_INSTALL_DIR/admin/* $WEBROOT_DIR/
    
    # Copy custom files
    cp -r $RSLVD_INSTALL_DIR/custom/admin/* $WEBROOT_DIR/
    
    # Set permissions
    chown -R www-data:www-data $WEBROOT_DIR
    
    echo "${GREEN}AdminLTE installed and configured successfully.${NORMAL}"
}

# Function to build and install FTL
build_install_ftl() {
    echo "${BOLD}Building and installing FTL...${NORMAL}"
    
    # Copy custom files
    cp -r $RSLVD_INSTALL_DIR/custom/ftl/src/* $RSLVD_INSTALL_DIR/ftl/src/
    
    # Apply patch
    cd $RSLVD_INSTALL_DIR/ftl
    patch -p1 < $RSLVD_INSTALL_DIR/custom/ftl/rslvd_integration.patch
    
    # Build FTL
    cd $RSLVD_INSTALL_DIR/ftl
    ./build.sh
    
    # Install FTL
    ./deploy.sh
    
    echo "${GREEN}FTL built and installed successfully.${NORMAL}"
}

# Function to create admin user
create_admin_user() {
    echo "${BOLD}Creating admin user...${NORMAL}"
    
    # Generate random password
    ADMIN_PASSWORD=$(openssl rand -base64 12)
    
    # Create admin user
    rslvd-user add admin $ADMIN_EMAIL $ADMIN_PASSWORD 1
    
    echo "${GREEN}Admin user created successfully.${NORMAL}"
    echo "Username: admin"
    echo "Password: $ADMIN_PASSWORD"
    echo "Please change this password after logging in."
}

# Function to set up SSL
setup_ssl() {
    echo "${BOLD}Setting up SSL...${NORMAL}"
    
    # Install certbot
    apt-get install -y certbot python3-certbot-nginx
    
    # Get SSL certificate
    certbot --nginx -d $RSLVD_DOMAIN -d www.$RSLVD_DOMAIN -d api.$RSLVD_DOMAIN --non-interactive --agree-tos --email $ADMIN_EMAIL
    
    echo "${GREEN}SSL set up successfully.${NORMAL}"
}

# Function to display completion message
show_completion() {
    echo "${GREEN}${BOLD}"
    echo "RSLVD.net Dynamic DNS Service has been installed successfully!"
    echo "${NORMAL}"
    echo "Admin Interface: https://$RSLVD_DOMAIN/admin"
    echo "API Endpoint: https://api.$RSLVD_DOMAIN"
    echo ""
    echo "Admin Credentials:"
    echo "Username: admin"
    echo "Password: $ADMIN_PASSWORD"
    echo ""
    echo "Please change the admin password after logging in."
    echo ""
    echo "To manage users and domains from the command line:"
    echo "rslvd-user - User management"
    echo "rslvd-domain - Domain management"
    echo ""
    echo "For more information, see the documentation in $RSLVD_INSTALL_DIR/docs"
    echo "${NORMAL}"
}

# Main function
main() {
    show_banner
    check_root
    check_system_requirements
    get_user_config
    install_dependencies
    clone_and_modify_repos
    create_database
    modify_pihole_core
    modify_adminlte
    modify_ftl
    create_config_files
    install_pihole
    install_adminlte
    build_install_ftl
    create_admin_user
    setup_ssl
    show_completion
}

# Run main function
main