# RSLVD.net API Documentation

## API Overview

The RSLVD.net API allows users to programmatically manage their dynamic DNS domains. All API requests require authentication using an API key that can be generated from the user dashboard.

## Base URL

```
https://api.rslvd.net/v1
```

## Authentication

All API requests must include an API key in the request header:

```
Authorization: Bearer YOUR_API_KEY
```

## Rate Limiting

API requests are limited to 100 requests per hour per API key. Rate limit information is included in the response headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1598356800
```

## Endpoints

### User Management

#### Get User Profile

```
GET /user
```

**Response:**

```json
{
  "id": 123,
  "username": "example_user",
  "email": "user@example.com",
  "created_at": "2025-08-01T12:00:00Z",
  "is_premium": false,
  "domains_count": {
    "free": 2,
    "premium": 0
  }
}
```

#### Generate New API Key

```
POST /user/api-key
```

**Response:**

```json
{
  "api_key": "new_api_key_value",
  "created_at": "2025-08-23T12:00:00Z"
}
```

### Domain Management

#### List Domains

```
GET /domains
```

**Response:**

```json
{
  "domains": [
    {
      "id": 1,
      "domain": "example.my.rslvd.net",
      "type": "free",
      "target_ip": "192.168.1.1",
      "is_active": true,
      "created_at": "2025-08-01T12:00:00Z",
      "last_updated": "2025-08-23T12:00:00Z"
    },
    {
      "id": 2,
      "domain": "premium.rslvd.net",
      "type": "premium",
      "target_ip": "192.168.1.2",
      "is_active": true,
      "created_at": "2025-08-01T12:00:00Z",
      "last_updated": "2025-08-23T12:00:00Z",
      "expiry_date": "2026-08-01T12:00:00Z"
    }
  ]
}
```

#### Get Domain Details

```
GET /domains/{domain_id}
```

**Response:**

```json
{
  "id": 1,
  "domain": "example.my.rslvd.net",
  "type": "free",
  "target_ip": "192.168.1.1",
  "is_active": true,
  "created_at": "2025-08-01T12:00:00Z",
  "last_updated": "2025-08-23T12:00:00Z",
  "update_history": [
    {
      "old_ip": null,
      "new_ip": "192.168.1.1",
      "updated_at": "2025-08-01T12:00:00Z",
      "update_method": "web"
    },
    {
      "old_ip": "192.168.1.1",
      "new_ip": "192.168.1.2",
      "updated_at": "2025-08-15T12:00:00Z",
      "update_method": "api"
    },
    {
      "old_ip": "192.168.1.2",
      "new_ip": "192.168.1.1",
      "updated_at": "2025-08-23T12:00:00Z",
      "update_method": "client"
    }
  ]
}
```

#### Create New Domain

```
POST /domains
```

**Request:**

```json
{
  "domain": "example",
  "type": "free",
  "target_ip": "192.168.1.1"
}
```

**Response:**

```json
{
  "id": 3,
  "domain": "example.my.rslvd.net",
  "type": "free",
  "target_ip": "192.168.1.1",
  "is_active": true,
  "created_at": "2025-08-23T12:00:00Z",
  "last_updated": "2025-08-23T12:00:00Z"
}
```

#### Update Domain IP

```
PUT /domains/{domain_id}
```

**Request:**

```json
{
  "target_ip": "192.168.1.2"
}
```

**Response:**

```json
{
  "id": 1,
  "domain": "example.my.rslvd.net",
  "type": "free",
  "target_ip": "192.168.1.2",
  "is_active": true,
  "created_at": "2025-08-01T12:00:00Z",
  "last_updated": "2025-08-23T12:05:00Z"
}
```

#### Delete Domain

```
DELETE /domains/{domain_id}
```

**Response:**

```json
{
  "success": true,
  "message": "Domain deleted successfully"
}
```

### Quick Update Endpoint

#### Update Domain IP (Simplified)

```
GET /update?domain={domain}&ip={ip}
```

**Response:**

```json
{
  "success": true,
  "domain": "example.my.rslvd.net",
  "ip": "192.168.1.2",
  "updated_at": "2025-08-23T12:10:00Z"
}
```

### Payment Management (Premium Only)

#### List Payment Methods

```
GET /payments/methods
```

**Response:**

```json
{
  "methods": [
    {
      "id": "card_1",
      "type": "credit_card",
      "last4": "4242",
      "expiry": "12/26",
      "is_default": true
    }
  ]
}
```

#### Create Subscription

```
POST /domains/{domain_id}/subscribe
```

**Request:**

```json
{
  "plan": "monthly",
  "payment_method_id": "card_1"
}
```

**Response:**

```json
{
  "subscription_id": "sub_12345",
  "domain_id": 2,
  "plan": "monthly",
  "amount": 5.00,
  "currency": "USD",
  "next_billing_date": "2025-09-23T12:00:00Z",
  "status": "active"
}
```

### System Status

#### Get Service Status

```
GET /status
```

**Response:**

```json
{
  "status": "operational",
  "version": "1.0.0",
  "uptime": 1234567,
  "dns_server": "online",
  "api_server": "online",
  "database": "online"
}
```

## Error Responses

All API errors follow a standard format:

```json
{
  "error": true,
  "code": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {} // Optional additional details
}
```

### Common Error Codes

- `AUTHENTICATION_FAILED`: Invalid or missing API key
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INVALID_PARAMETERS`: Missing or invalid request parameters
- `DOMAIN_NOT_FOUND`: The requested domain does not exist
- `DOMAIN_LIMIT_REACHED`: User has reached their domain limit
- `INSUFFICIENT_PERMISSIONS`: User does not have permission for this action
- `PAYMENT_REQUIRED`: Action requires payment or subscription
- `INTERNAL_ERROR`: Server encountered an error