<!-- markdownlint-configure-file { "MD004": { "style": "consistent" } } -->
<!-- markdownlint-disable MD033 -->
#
# RSLVD.net System Architecture

## Overview

RSLVD.net is a dynamic DNS service built on modified Pi-hole components. The system allows users to register and manage their own subdomains, with free subdomains at `x.my.rslvd.net` and premium subdomains at `x.rslvd.net`.

## System Components

### 1. Core DNS Server (Modified Pi-hole FTL)
- **Purpose**: Handles DNS resolution for all registered domains
- **Modifications**:
  - Extended to read domain records from the RSLVD database
  - Dynamic update capability for IP addresses
  - Support for user-specific domain management
  - Custom TTL settings for dynamic DNS records

### 2. Web Interface (Modified Pi-hole AdminLTE)
- **Purpose**: Provides user interface for account and domain management
- **Modifications**:
  - User registration and login system
  - Domain management dashboard
  - Payment processing for premium domains
  - User profile management
  - API key management

### 3. Backend Services (Modified Pi-hole Core)
- **Purpose**: Handles business logic and database operations
- **Modifications**:
  - Multi-user support
  - Domain registration and validation
  - IP update processing
  - Payment processing integration
  - API endpoints for programmatic access

### 4. Database (SQLite/MySQL)
- **Purpose**: Stores user accounts, domains, and system settings
- **Tables**:
  - Users
  - Domains
  - Domain Updates
  - Payments
  - API Requests
  - Settings

### 5. API Service
- **Purpose**: Provides programmatic access for clients and third-party integrations
- **Features**:
  - Authentication via API keys
  - Domain registration and management
  - IP address updates
  - Status checks
  - Rate limiting

## Data Flow

### User Registration Flow
1. User submits registration form on web interface
2. System validates input and checks for duplicate username/email
3. User account is created in database with unverified status
4. Verification email is sent to user
5. User clicks verification link
6. Account is marked as verified and activated

### Domain Registration Flow
1. Authenticated user requests domain registration
2. System validates domain name availability and user limits
3. For premium domains, user completes payment process
4. Domain is registered in database
5. DNS records are created in the system
6. Confirmation is sent to user

### DNS Update Flow
1. Client sends update request with authentication
2. System validates authentication and domain ownership
3. IP address is updated in database
4. DNS cache is flushed for the updated domain
5. Success response is returned to client

### DNS Resolution Flow
1. DNS query for registered domain is received by FTL
2. FTL checks database for domain record
3. If found, returns the associated IP address
4. If not found, processes normally as per Pi-hole rules

## System Interactions

```
                                 ┌─────────────────┐
                                 │                 │
                                 │  DNS Clients    │
                                 │                 │
                                 └────────┬────────┘
                                          │
                                          │ DNS Queries
                                          ▼
┌─────────────────┐  HTTP/API   ┌─────────────────┐  Queries   ┌─────────────────┐
│                 │◄───────────►│                 │◄──────────►│                 │
│  Web Interface  │             │   DNS Server    │            │  External DNS   │
│  (AdminLTE)     │             │   (FTL)         │            │                 │
│                 │             │                 │            └─────────────────┘
└────────┬────────┘             └────────┬────────┘
         │                               │
         │                               │
         ▼                               ▼
┌─────────────────┐             ┌─────────────────┐
│                 │             │                 │
│  Backend API    │◄───────────►│   Database      │
│  (Core)         │             │                 │
│                 │             │                 │
└─────────────────┘             └─────────────────┘
```

## Deployment Architecture

The system is designed to run on a single server with the following components:

1. **Web Server**: Nginx or Apache serving the AdminLTE interface
2. **DNS Server**: Modified Pi-hole FTL for DNS resolution
3. **Database**: SQLite for smaller deployments, MySQL for larger ones
4. **Backend Services**: Modified Pi-hole Core scripts
5. **Cron Jobs**: Scheduled tasks for maintenance and cleanup

For high-availability deployments, the system can be scaled horizontally with:

1. Multiple DNS servers with database replication
2. Load balancers for web and API traffic
3. Replicated database with master-slave configuration
4. Distributed caching for DNS records

## Security Considerations

1. **Authentication**: Secure password storage, API key management
2. **Authorization**: Role-based access control for domain management
3. **Rate Limiting**: Prevent API abuse and DDoS attacks
4. **Input Validation**: Sanitize all user inputs to prevent injection attacks
5. **HTTPS**: Secure all web and API communications
6. **Logging**: Comprehensive logging for security monitoring
7. **Backups**: Regular database backups with secure storage

