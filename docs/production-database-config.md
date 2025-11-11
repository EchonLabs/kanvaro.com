---
slug: "self-hosting/production-database-config"
title: "Production Database Configuration Guide"
summary: "Complete guide for configuring MongoDB database connections in production environments"
visibility: "public"
audiences: ["self_host_admin", "admin"]
category: "self-hosting"
order: 21
updated: "2025-01-04"
---

# Production Database Configuration Guide

## Overview

This guide explains how to configure the database connection for production deployment of Kanvaro.

## Database Connection Details

**Production MongoDB Connection String:**
```
mongodb://dulandias:1n4M9Y6RmtQf@mongodb:27017/kanvaro_dev_db
```

**Connection Parameters:**
- **Host:** mongodb (Docker service name)
- **Port:** 27017
- **Database:** kanvaro_dev_db
- **Username:** dulandias
- **Password:** 1n4M9Y6RmtQf
- **Auth Source:** admin

## Configuration Files

### 1. Environment Variables

**Location:** `/app/.env.production` (inside Docker container)
**Location:** `./.env.production` (on host system)

```bash
# Database Configuration
MONGODB_URI=mongodb://dulandias:1n4M9Y6RmtQf@mongodb:27017/kanvaro_dev_db
MONGODB_USERNAME=dulandias
MONGODB_PASSWORD=1n4M9Y6RmtQf
MONGODB_DATABASE=kanvaro_dev_db
```

### 2. Docker Compose Configuration

**File:** `docker-compose.prod.yml`

```yaml
services:
  kanvaro-app:
    environment:
      - MONGODB_URI=mongodb://dulandias:1n4M9Y6RmtQf@mongodb:27017/kanvaro_dev_db
  
  mongodb:
    environment:
      - MONGO_INITDB_ROOT_USERNAME=dulandias
      - MONGO_INITDB_ROOT_PASSWORD=1n4M9Y6RmtQf
      - MONGO_INITDB_DATABASE=kanvaro_dev_db
```

## Production Deployment Locations

### On Your Server

1. **Environment File Location:**
   ```
   /path/to/kanvaro/.env.production
   ```

2. **Docker Compose File:**
   ```
   /path/to/kanvaro/docker-compose.prod.yml
   ```

3. **Database Configuration Script:**
   ```
   /path/to/kanvaro/scripts/setup-database.js
   ```

### Inside Docker Container

1. **Environment Variables:**
   ```
   /app/.env.production
   ```

2. **Application Configuration:**
   ```
   /app/config.json
   ```

## Deployment Steps

### 1. Copy Configuration Files

```bash
# Copy environment file
cp config.production.env .env.production

# Copy Docker Compose file
cp docker-compose.prod.yml docker-compose.yml
```

### 2. Update Environment Variables

Edit `.env.production` and update:
- JWT secrets
- SMTP settings
- Domain URLs
- Any other environment-specific values

### 3. Deploy with Docker

```bash
# Build and start production containers
docker-compose -f docker-compose.prod.yml up --build -d

# Check container status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

### 4. Verify Database Connection

```bash
# Test database connection
docker exec -it kanvarocom-kanvaro-app-1 node -e "
const mongoose = require('mongoose');
mongoose.connect('mongodb://dulandias:1n4M9Y6RmtQf@mongodb:27017/kanvaro_dev_db')
  .then(() => console.log('✅ Database connected successfully'))
  .catch(err => console.error('❌ Database connection failed:', err));
"
```

## Security Considerations

### 1. Environment Variables
- Store sensitive data in environment variables, not in code
- Use strong, unique passwords
- Rotate credentials regularly

### 2. Network Security
- Use Docker networks for internal communication
- Expose only necessary ports
- Consider using SSL/TLS for database connections

### 3. Access Control
- Limit database user permissions
- Use authentication and authorization
- Monitor database access logs

## Troubleshooting

### Common Issues

1. **Connection Refused:**
   ```bash
   # Check if MongoDB container is running
   docker ps | grep mongodb
   
   # Check MongoDB logs
   docker logs kanvarocom-mongodb-1
   ```

2. **Authentication Failed:**
   ```bash
   # Verify credentials in environment
   docker exec -it kanvarocom-kanvaro-app-1 env | grep MONGODB
   ```

3. **Database Not Found:**
   ```bash
   # Connect to MongoDB and create database
   docker exec -it kanvarocom-mongodb-1 mongosh -u dulandias -p 1n4M9Y6RmtQf
   ```

## Monitoring

### Health Checks

```bash
# Application health
curl http://localhost:3000/api/health

# Database health
docker exec -it kanvarocom-mongodb-1 mongosh --eval "db.adminCommand('ping')"
```

### Logs

```bash
# Application logs
docker logs kanvarocom-kanvaro-app-1 -f

# Database logs
docker logs kanvarocom-mongodb-1 -f
```

## Backup and Recovery

### Database Backup

```bash
# Create backup
docker exec -it kanvarocom-mongodb-1 mongodump \
  --uri="mongodb://dulandias:1n4M9Y6RmtQf@localhost:27017/kanvaro_dev_db" \
  --out=/backup/$(date +%Y%m%d_%H%M%S)
```

### Database Restore

```bash
# Restore from backup
docker exec -it kanvarocom-mongodb-1 mongorestore \
  --uri="mongodb://dulandias:1n4M9Y6RmtQf@localhost:27017/kanvaro_dev_db" \
  /backup/20240101_120000/kanvaro_dev_db
```
