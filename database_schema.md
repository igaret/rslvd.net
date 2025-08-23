# Database Schema for RSLVD.net Dynamic DNS Service

## Users Table
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    api_key VARCHAR(64) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    is_admin BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(64),
    is_verified BOOLEAN DEFAULT FALSE
);
```

## Domains Table
```sql
CREATE TABLE domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    domain VARCHAR(255) NOT NULL UNIQUE,
    type ENUM('free', 'premium') NOT NULL,
    target_ip VARCHAR(45),  -- IPv4 or IPv6 address
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP,
    expiry_date TIMESTAMP,  -- For premium domains
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## Domain Updates Table (for logging)
```sql
CREATE TABLE domain_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain_id INTEGER NOT NULL,
    old_ip VARCHAR(45),
    new_ip VARCHAR(45),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    update_method VARCHAR(20),  -- 'api', 'web', 'client'
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);
```

## Payments Table
```sql
CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    domain_id INTEGER NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_method VARCHAR(50),
    transaction_id VARCHAR(255),
    status VARCHAR(20) NOT NULL,  -- 'pending', 'completed', 'failed', 'refunded'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);
```

## API Requests Table (for rate limiting)
```sql
CREATE TABLE api_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    request_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## Settings Table
```sql
CREATE TABLE settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_name VARCHAR(50) NOT NULL UNIQUE,
    setting_value TEXT,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE
);
```

## Initial Settings
```sql
INSERT INTO settings (setting_name, setting_value, description, is_public) VALUES
('free_domain_suffix', 'my.rslvd.net', 'Suffix for free domains', TRUE),
('premium_domain_suffix', 'rslvd.net', 'Suffix for premium domains', TRUE),
('premium_price_monthly', '5.00', 'Monthly price for premium domains in USD', TRUE),
('premium_price_yearly', '50.00', 'Yearly price for premium domains in USD', TRUE),
('max_free_domains_per_user', '3', 'Maximum number of free domains per user', TRUE),
('max_premium_domains_per_user', '10', 'Maximum number of premium domains per user', TRUE),
('api_rate_limit', '100', 'Maximum API requests per hour', TRUE);
```