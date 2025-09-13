# CRM Sequelize ORM Setup

This guide covers the Sequelize ORM integration for the Next.js CRM application with MySQL database.

## 🚀 Quick Start

### 1. Start Docker Services
```bash
./start-docker.sh
```

### 2. Test Sequelize Connection
```bash
npm run db:test
```

### 3. Sync Database
```bash
npm run db:sync
```

### 4. Test API Endpoints
- **Sequelize Test**: http://localhost:3000/api/test-sequelize
- **Dashboard Stats**: http://localhost:3000/api/dashboard
- **Customers**: http://localhost:3000/api/customers
- **Sales**: http://localhost:3000/api/sales

## 📁 Project Structure

```
crm/
├── config/
│   └── config.json          # Sequelize configuration
├── models/
│   ├── index.js             # Model initialization and associations
│   ├── User.js              # User model
│   ├── Customer.js          # Customer model
│   ├── Sale.js              # Sale model
│   ├── Deal.js              # Deal model
│   ├── Task.js              # Task model
│   └── Activity.js          # Activity model
├── lib/
│   └── sequelize-db.js      # Sequelize service layer
├── app/api/
│   ├── test-sequelize/      # Test Sequelize connection
│   ├── dashboard/           # Dashboard statistics
│   ├── customers/           # Customer CRUD operations
│   └── sales/               # Sales CRUD operations
└── migrations/              # Database migrations (auto-generated)
```

## 🗄️ Database Models

### User Model
- **Fields**: id, email, password, firstName, lastName, role, isActive
- **Relationships**: Has many customers, sales, deals, tasks, activities
- **Role Types**: admin, agent, manager

### Customer Model
- **Fields**: id, firstName, lastName, email, phone, landline, address, company, status
- **Relationships**: Belongs to user (creator), has many sales, deals, tasks, activities
- **Status Types**: active, inactive, prospect

### Sale Model
- **Fields**: Comprehensive sale information including customer details, pin code, SSN, carrier, services, receivers, billing info
- **Relationships**: Belongs to customer and agent, has many activities
- **Status Types**: lead, voicemail, hang-up, no_response, appointment, active, pending, completed, cancelled

### Deal Model
- **Fields**: id, customerId, agentId, name, value, stage, probability, priority, dates, description
- **Relationships**: Belongs to customer and agent, has many tasks and activities
- **Stage Types**: prospecting, qualification, proposal, negotiation, closed_won, closed_lost

### Task Model
- **Fields**: id, title, description, agentId, customerId, dealId, status, priority, dueDate, completedAt
- **Relationships**: Belongs to agent, customer (optional), deal (optional)
- **Status Types**: pending, in_progress, completed, cancelled

### Activity Model
- **Fields**: id, agentId, customerId, dealId, saleId, type, title, description
- **Relationships**: Belongs to agent, customer (optional), deal (optional), sale (optional)
- **Type Types**: call, email, meeting, note, task_completed, deal_created, sale_created

## 🔧 Configuration

### Sequelize Config (`config/config.json`)
```json
{
  "development": {
    "username": "root",
    "password": "password",
    "database": "crm_db",
    "host": "localhost",
    "port": 3306,
    "dialect": "mysql",
    "logging": false,
    "define": {
      "timestamps": true,
      "underscored": false,
      "freezeTableName": true
    }
  }
}
```

### Environment Variables
```env
DATABASE_URL=mysql://root:password@localhost:3306/crm_db
DB_HOST=localhost
DB_PORT=3306
DB_NAME=crm_db
DB_USER=root
DB_PASSWORD=password
NODE_ENV=development
```

## 🛠️ Available Scripts

### Database Operations
```bash
# Test database connection
npm run db:test

# Sync database (create tables)
npm run db:sync

# Reset database (drop and recreate tables)
npm run db:reset
```

### Development
```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start
```

## 📊 Service Layer

### UserService
- `findAll()` - Get all users with customers
- `findById(id)` - Get user by ID with relationships
- `findByEmail(email)` - Find user by email
- `create(userData)` - Create new user
- `update(id, userData)` - Update user
- `delete(id)` - Delete user

### CustomerService
- `findAll()` - Get all customers with creator info
- `findById(id)` - Get customer by ID with relationships
- `create(customerData)` - Create new customer
- `update(id, customerData)` - Update customer
- `delete(id)` - Delete customer

### SaleService
- `findAll()` - Get all sales with customer and agent info
- `findById(id)` - Get sale by ID with relationships
- `findByStatus(status)` - Get sales by status
- `create(saleData)` - Create new sale
- `update(id, saleData)` - Update sale
- `delete(id)` - Delete sale

### DealService
- `findAll()` - Get all deals with customer and agent info
- `findById(id)` - Get deal by ID with relationships
- `findByStage(stage)` - Get deals by stage
- `create(dealData)` - Create new deal
- `update(id, dealData)` - Update deal
- `delete(id)` - Delete deal

### TaskService
- `findAll()` - Get all tasks with relationships
- `findById(id)` - Get task by ID with relationships
- `findByStatus(status)` - Get tasks by status
- `create(taskData)` - Create new task
- `update(id, taskData)` - Update task
- `delete(id)` - Delete task

### ActivityService
- `findAll(limit)` - Get recent activities with relationships
- `findById(id)` - Get activity by ID with relationships
- `create(activityData)` - Create new activity

### DashboardService
- `getStats(agentId)` - Get dashboard statistics (optionally filtered by agent)

## 🌐 API Endpoints

### Test Endpoints
- `GET /api/test-sequelize` - Test Sequelize connection and get sample data
- `POST /api/test-sequelize` - Sync database tables

### Data Endpoints
- `GET /api/customers` - Get all customers
- `POST /api/customers` - Create new customer
- `GET /api/sales` - Get all sales (with optional status filter)
- `POST /api/sales` - Create new sale
- `GET /api/dashboard` - Get dashboard statistics

## 🔍 Usage Examples

### Using Services in API Routes
```javascript
import { CustomerService, SaleService } from '../../../lib/sequelize-db.js';

export async function GET() {
  const customers = await CustomerService.findAll();
  const sales = await SaleService.findByStatus('active');
  
  return Response.json({
    customers,
    sales
  });
}
```

### Using Services in Components
```javascript
import { useEffect, useState } from 'react';

export default function CustomersList() {
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    fetch('/api/customers')
      .then(res => res.json())
      .then(data => setCustomers(data.data));
  }, []);

  return (
    <div>
      {customers.map(customer => (
        <div key={customer.id}>
          {customer.firstName} {customer.lastName}
        </div>
      ))}
    </div>
  );
}
```

## 🚨 Troubleshooting

### Connection Issues
1. **Check Docker services**: `docker-compose ps`
2. **Verify database credentials** in `config/config.json`
3. **Test connection**: `npm run db:test`

### Model Issues
1. **Check associations** in model files
2. **Verify field names** match database schema
3. **Sync database**: `npm run db:sync`

### API Issues
1. **Check server logs** for error messages
2. **Verify API routes** are properly configured
3. **Test endpoints** with Postman or browser

## 📈 Performance Tips

1. **Use includes wisely** - Only include necessary relationships
2. **Add database indexes** for frequently queried fields
3. **Use pagination** for large datasets
4. **Cache frequently accessed data**
5. **Optimize queries** with proper where clauses

## 🔒 Security Considerations

1. **Validate input data** before database operations
2. **Use parameterized queries** (Sequelize handles this)
3. **Implement proper authentication** and authorization
4. **Sanitize user inputs** to prevent injection attacks
5. **Use environment variables** for sensitive configuration

## 📚 Additional Resources

- [Sequelize Documentation](https://sequelize.org/)
- [MySQL Documentation](https://dev.mysql.com/doc/)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
