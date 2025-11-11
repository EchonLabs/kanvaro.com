---
slug: "self-hosting/docker-deployment"
title: "Docker Deployment Guide"
summary: "Step-by-step guide for deploying Kanvaro using Docker Compose with proper database configuration"
visibility: "public"
audiences: ["self_host_admin", "admin"]
category: "self-hosting"
order: 20
updated: "2025-01-04"
---

# Docker Deployment Guide

This guide explains how to deploy Kanvaro using Docker Compose.

## Prerequisites

- Docker and Docker Compose installed
- Basic understanding of Docker concepts

## Quick Start

1. **Clone the repository and navigate to the project directory**
   ```bash
   git clone <repository-url>
   cd kanvaro.com
   ```

2. **Create environment file**
   ```bash
   cp env.example .env
   ```

3. **Update environment variables**
   Edit `.env` file with your configuration:
   ```bash
   # Authentication Secrets (Generate secure random strings)
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRES_IN=7d
   REFRESH_TOKEN_SECRET=your-refresh-token-secret-change-this-in-production
   ```

   **Note:** No database credentials or SMTP configuration are needed in the environment file. All database and email configuration is handled through the setup wizard UI.

4. **Start the services**
   ```bash
   docker-compose up -d
   ```

5. **Access the application**
   - Open your browser and go to `http://localhost:3000`
   - Complete the setup wizard
   - For database configuration, use:
     - Host: `localhost` (will connect to internal MongoDB service)
     - Port: `27017`
     - Database: `kanvaro` (or your preferred name)
     - Username: Leave empty for no authentication (or enter your preferred username)
     - Password: Leave empty for no authentication (or enter your preferred password)
     - Auth Source: `admin` (if using authentication)

   **Note:** MongoDB starts without authentication by default. You can choose to set up authentication through the setup wizard or leave it open for easier development.

   - For email configuration, configure your SMTP settings through the setup wizard:
     - SMTP Host, Port, Username, Password
     - From Email and From Name
     - All email settings are stored in the database, not in environment variables

## Database Configuration

When setting up the database through the web interface:

### For Docker Deployment:
- **Host**: Use `localhost` - the application will automatically connect to the internal `mongodb` service
- **Port**: `27017`
- **Database Name**: Choose your preferred database name (e.g., `kanvaro`)
- **Username**: Leave empty for no authentication, or enter your preferred username
- **Password**: Leave empty for no authentication, or enter your preferred password
- **Auth Source**: `admin` (only if using authentication)

### Why use `localhost`?
The setup interface uses `localhost` as a user-friendly input, but the application automatically converts this to `mongodb` (the Docker service name) when connecting from within the container. This provides a seamless experience while maintaining proper Docker networking.

## Environment Variables

### Required Variables:
- `JWT_SECRET`: Secret key for JWT tokens
- `REFRESH_TOKEN_SECRET`: Secret key for refresh tokens

### Optional Variables:
- `SMTP_*`: Email configuration for notifications
- `SENTRY_DSN`: Error monitoring
- `LOG_LEVEL`: Logging level

## Production Deployment

For production deployment:

1. **Use production compose file**:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

2. **Set up reverse proxy** (nginx/traefik) for SSL termination

3. **Configure proper secrets management**

4. **Set up monitoring and logging**

## Troubleshooting

### Database Connection Issues

If you encounter "connection refused" errors:

1. **Check if MongoDB container is running**:
   ```bash
   docker-compose ps
   ```

2. **Check MongoDB logs**:
   ```bash
   docker-compose logs mongodb
   ```

3. **Verify environment variables**:
   ```bash
   docker-compose config
   ```

4. **Ensure proper networking**:
   The application container should be able to reach the `mongodb` service on port 27017.

### Setup Wizard Issues

If the setup wizard fails:

1. **Check application logs**:
   ```bash
   docker-compose logs kanvaro-app
   ```

2. **Verify config.json is writable**:
   The application needs to write the configuration file to persist setup data.

3. **Check database credentials**:
   Ensure the MongoDB username and password in your `.env` file match what you're entering in the setup wizard.

## File Structure

```
kanvaro.com/
├── docker-compose.yml          # Development compose file
├── docker-compose.prod.yml     # Production compose file
├── .env                        # Environment variables (create from env.example)
├── config.json                 # Application configuration (created during setup)
├── uploads/                    # File uploads directory
└── logs/                       # Application logs
```

## Security Considerations

1. **Change default passwords** in production
2. **Use strong JWT secrets**
3. **Enable SSL/TLS** in production
4. **Restrict network access** to MongoDB
5. **Regular security updates** for base images

## Backup and Recovery

1. **Database backup**:
   ```bash
   docker-compose exec mongodb mongodump --out /data/backup
   ```

2. **File uploads backup**:
   ```bash
   tar -czf uploads-backup.tar.gz uploads/
   ```

3. **Configuration backup**:
   ```bash
   cp config.json config.json.backup
   ```
