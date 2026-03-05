# Kanvaro - Project Management Solution

## Overview

Kanvaro is a comprehensive, open-source project management web application designed for SMEs, tech startups, freelancers, and modern teams. Built with cutting-edge technologies, Kanvaro provides a self-hosted solution that gives teams complete control over their project management data and workflows.

## Key Features

- **Self-Hosted**: Complete control over your data with Docker-based deployment
- **Open Source**: Fully open-source with community-driven development
- **Modern Stack**: Built with Next.js, Node.js, and MongoDB
- **Scalable**: Designed to grow with your team and project complexity
- **Customizable**: Flexible architecture for custom workflows and integrations

## Technology Stack

- **Frontend**: Next.js 14 with TypeScript
- **Backend**: Next.js API routes with Server Actions
- **Database**: MongoDB with Mongoose ODM
- **Deployment**: Docker & Docker Compose
- **UI Framework**: shadcn/ui with Tailwind CSS
- **Authentication**: JWT-based authentication
- **Email**: SMTP and Azure Communication Services support

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Git
- Node.js 18+ (for development)

### 1. Clone the Repository

```bash
git clone https://github.com/DulanDias/kanvaro.com.git
cd kanvaro.com
```

### 2. Environment Configuration

```bash
cp env.example .env.local
# Edit .env.local with your configuration
```

### 3. Start with Docker

```bash
# Development
docker-compose -f docker-compose.dev.yml up -d

# Production
docker-compose up -d
```

### 4. Access the Application

- **Main Application**: `http://localhost:3000`
- **Setup Wizard**: `http://localhost:3000/setup`
- **Dashboard**: `http://localhost:3000/dashboard`
- **Login**: `http://localhost:3000/login`
- **Health Check**: `http://localhost:3000/api/health`

**Service Ports:**

- **Application**: `http://localhost:3000`
- **MongoDB**: `localhost:27018`
- **Redis**: `localhost:6380`

**Demo Credentials:**

- Email: `admin@kanvaro.com`
- Password: `admin123`

## Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Development Services

```bash
# Start MongoDB and Redis with Docker
docker-compose -f docker-compose.dev.yml up -d

# Start the development server
npm run dev
```

### 3. Database Setup

```bash
# Run database migrations
npm run db:migrate

# Seed development data
npm run db:seed
```

## Project Structure

```
kanvaro/
├── src/
│   ├── app/                 # Next.js app directory
│   │   ├── api/            # API routes
│   │   ├── dashboard/      # Dashboard pages
│   │   └── setup/          # Setup wizard
│   ├── components/         # React components
│   │   ├── ui/             # Reusable UI components
│   │   ├── layout/         # Layout components
│   │   ├── dashboard/      # Dashboard components
│   │   └── setup/          # Setup wizard components
│   ├── lib/                # Utility libraries
│   ├── models/             # Database models
│   └── types/              # TypeScript types
├── docs/                   # Documentation
├── docker/                 # Docker configurations
└── scripts/               # Build and utility scripts
```

## Setup Wizard

The setup wizard guides you through:

1. **Database Configuration**: MongoDB connection setup
2. **Admin User Creation**: Create your administrator account
3. **Organization Setup**: Configure your organization details
4. **Email Service**: Optional email notification setup
5. **Completion**: Finalize setup and access dashboard

## Features

### Core Project Management

- Project creation and management
- Task management with Scrum and Kanban
- Team collaboration and user management
- Time tracking and reporting
- Budget allocation and financial management
- Invoicing and billing capabilities
- File management and document sharing

### Technical Architecture

- **Micro Frontend**: Modular frontend architecture
- **Redis Caching**: Session management and data caching
- **Background Jobs**: Queue-based job processing
- **Email Integration**: SMTP and Azure Communication Services
- **Modern UI**: Tailwind CSS with Lucide icons
- **Setup Wizard**: WordPress-style installation process

## API Endpoints

### Setup Wizard

- `GET /api/setup/status` - Check setup completion status
- `POST /api/setup/database/test` - Test database connection
- `POST /api/setup/email/test` - Test email configuration
- `POST /api/setup/complete` - Complete setup process

### Authentication

- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout user

## Docker Configuration

### Development

```bash
docker-compose -f docker-compose.dev.yml up -d
```

### Production

```bash
docker-compose up -d
```

## Environment Variables

### Required

- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT secret key
- `REFRESH_TOKEN_SECRET` - Refresh token secret

### Optional

- `REDIS_URL` - Redis connection string
- `SMTP_HOST` - SMTP server host
- `SMTP_USER` - SMTP username
- `SMTP_PASS` - SMTP password

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:

- Create an issue on GitHub
- Check the documentation in the `docs/` folder
- Join our community discussions

---

**Kanvaro** - Empowering teams with self-hosted project management.
