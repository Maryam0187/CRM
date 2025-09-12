# CRM Docker Setup with MySQL

This guide will help you set up the CRM application using Docker with MySQL database and Adminer for database management.

## Prerequisites

- Docker and Docker Compose installed on your system
- Git (to clone the repository)

## Quick Start

1. **Clone the repository and navigate to the project directory**
   ```bash
   cd /path/to/your/crm/project
   ```

2. **Copy environment variables**
   ```bash
   cp env.example .env.local
   ```

3. **Start the services**
   ```bash
   docker-compose up -d
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Adminer (Database Management): http://localhost:8080
   - MySQL Database: localhost:3306

## Services Overview

### Frontend (Next.js)
- **Port**: 3000
- **URL**: http://localhost:3000
- **Description**: The main CRM application built with Next.js

### Database (MySQL)
- **Port**: 3306
- **Database**: crm_db
- **Username**: root
- **Password**: password
- **Description**: MySQL 8.0 database with pre-configured tables and sample data

### Adminer (Database Management)
- **Port**: 8080
- **URL**: http://localhost:8080
- **Server**: db
- **Username**: root
- **Password**: password
- **Database**: crm_db
- **Description**: Web-based database management tool

## Database Schema

The database includes the following tables:

- **users**: User accounts (admin, agents, managers)
- **customers**: Customer information
- **sales**: Sales records with comprehensive fields
- **deals**: Sales deals and opportunities
- **tasks**: Task management
- **activities**: Activity feed and logging

## Environment Variables

Create a `.env.local` file with the following variables:

```env
# Database Configuration
DATABASE_URL=mysql://root:password@localhost:3306/crm_db
DB_HOST=localhost
DB_PORT=3306
DB_NAME=crm_db
DB_USER=root
DB_PASSWORD=password

# Next.js Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key-here-change-this-in-production

# Application Configuration
NODE_ENV=development
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# Docker Configuration
IS_DOCKER=true
```

## Docker Commands

### Start Services
```bash
docker-compose up -d
```

### Stop Services
```bash
docker-compose down
```

### View Logs
```bash
docker-compose logs -f
```

### Rebuild Services
```bash
docker-compose up -d --build
```

### Access Database Shell
```bash
docker-compose exec db mysql -u root -p crm_db
```

### Access Frontend Container
```bash
docker-compose exec frontend sh
```

## Database Management with Adminer

1. Open http://localhost:8080 in your browser
2. Use the following credentials:
   - **System**: MySQL
   - **Server**: db
   - **Username**: root
   - **Password**: password
   - **Database**: crm_db

## Sample Data

The database is initialized with sample data including:
- 3 users (1 admin, 2 agents)
- 3 customers
- 3 sales records
- 3 deals
- 3 tasks
- 3 activities

## Troubleshooting

### Port Conflicts
If you encounter port conflicts, modify the ports in `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # Change 3000 to 3001
  - "3307:3306"  # Change 3306 to 3307
  - "8081:8080"  # Change 8080 to 8081
```

### Database Connection Issues
1. Ensure MySQL container is running: `docker-compose ps`
2. Check database logs: `docker-compose logs db`
3. Verify environment variables in `.env.local`

### Frontend Issues
1. Check if all dependencies are installed
2. View frontend logs: `docker-compose logs frontend`
3. Rebuild the frontend: `docker-compose up -d --build frontend`

## Development Workflow

1. **Make changes to your code**
2. **The frontend will auto-reload** (hot reload enabled)
3. **Database changes** require container restart: `docker-compose restart db`
4. **View logs** for debugging: `docker-compose logs -f frontend`

## Production Considerations

For production deployment:

1. **Change default passwords**
2. **Use environment-specific configuration**
3. **Enable SSL/TLS**
4. **Set up proper backup strategies**
5. **Use Docker secrets for sensitive data**
6. **Configure proper logging and monitoring**

## Support

If you encounter any issues:
1. Check the logs: `docker-compose logs`
2. Verify all services are running: `docker-compose ps`
3. Ensure all environment variables are set correctly
4. Check Docker and Docker Compose versions
