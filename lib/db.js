import mysql from 'mysql2/promise';

// Database configuration - supports both local Docker and Railway deployment
const getDbConfig = () => {
  // If DATABASE_URL is provided (Railway), parse it
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1), // Remove leading slash
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      acquireTimeout: 60000,
      timeout: 60000,
      reconnect: true
    };
  }
  
  // Fallback to individual environment variables (local Docker)
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'crm_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true
  };
};

const dbConfig = getDbConfig();

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
export async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Execute query with error handling
export async function executeQuery(query, params = []) {
  try {
    const [rows] = await pool.execute(query, params);
    return { success: true, data: rows };
  } catch (error) {
    console.error('Database query error:', error);
    return { success: false, error: error.message };
  }
}

// Get all customers
export async function getCustomers() {
  const query = `
    SELECT c.*, u.first_name as created_by_name, u.last_name as created_by_last_name
    FROM customers c
    LEFT JOIN users u ON c.created_by = u.id
    ORDER BY c.created_at DESC
  `;
  return await executeQuery(query);
}

// Get customer by ID
export async function getCustomerById(id) {
  const query = 'SELECT * FROM customers WHERE id = ?';
  const result = await executeQuery(query, [id]);
  return result.success ? result.data[0] : null;
}

// Create new customer
export async function createCustomer(customerData) {
  const {
    first_name,
    last_name,
    email,
    phone,
    landline,
    address,
    company,
    status = 'prospect',
    created_by
  } = customerData;

  // Sanitize email field - convert empty strings to null for email validation
  const sanitizedEmail = (email === '' || email === null || email === undefined) ? null : email;

  const query = `
    INSERT INTO customers (first_name, last_name, email, phone, landline, address, company, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const params = [first_name, last_name, sanitizedEmail, phone, landline, address, company, status, created_by];
  return await executeQuery(query, params);
}

// Get all sales
export async function getSales() {
  const query = `
    SELECT s.*, c.first_name as customer_first_name, c.last_name as customer_last_name,
           u.first_name as agent_first_name, u.last_name as agent_last_name
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    LEFT JOIN users u ON s.agent_id = u.id
    ORDER BY s.created_at DESC
  `;
  return await executeQuery(query);
}

// Get sale by ID
export async function getSaleById(id) {
  const query = 'SELECT * FROM sales WHERE id = ?';
  const result = await executeQuery(query, [id]);
  return result.success ? result.data[0] : null;
}

// Create new sale
export async function createSale(saleData) {
  const {
    customer_id,
    agent_id,
    status,
    customer_name,
    landline_no,
    cell_no,
    address,
    pin_code,
    pin_code_status,
    ssn_name,
    ssn_number,
    carrier,
    basic_package,
    basic_package_status,
    no_of_tv,
    no_of_receiver,
    account_holder,
    account_number,
    security_question,
    security_answer,
    regular_bill,
    promotional_bill,
    bundle,
    company,
    last_payment,
    last_payment_date,
    balance,
    due_on_date,
    breakdown,
    notes,
    services,
    receivers,
    receivers_info,
    tech_visit_date,
    tech_visit_time,
    appointment_date,
    appointment_time
  } = saleData;

  const query = `
    INSERT INTO sales (
      customer_id, agent_id, status, customer_name, landline_no, cell_no, address,
      pin_code, pin_code_status, ssn_name, ssn_number, carrier, basic_package,
      basic_package_status, no_of_tv, no_of_receiver, account_holder, account_number,
      security_question, security_answer, regular_bill, promotional_bill, bundle,
      company, last_payment, last_payment_date, balance, due_on_date, breakdown,
      notes, services, receivers, receivers_info, tech_visit_date, tech_visit_time,
      appointment_date, appointment_time
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    customer_id, agent_id, status, customer_name, landline_no, cell_no, address,
    pin_code, pin_code_status, ssn_name, ssn_number, carrier, basic_package,
    basic_package_status, no_of_tv, no_of_receiver, account_holder, account_number,
    security_question, security_answer, regular_bill, promotional_bill, bundle,
    company, last_payment, last_payment_date, balance, due_on_date, breakdown,
    notes, JSON.stringify(services), JSON.stringify(receivers), JSON.stringify(receivers_info),
    tech_visit_date, tech_visit_time, appointment_date, appointment_time
  ];

  return await executeQuery(query, params);
}

// Get all deals
export async function getDeals() {
  const query = `
    SELECT d.*, c.first_name as customer_first_name, c.last_name as customer_last_name,
           u.first_name as agent_first_name, u.last_name as agent_last_name
    FROM deals d
    LEFT JOIN customers c ON d.customer_id = c.id
    LEFT JOIN users u ON d.agent_id = u.id
    ORDER BY d.created_at DESC
  `;
  return await executeQuery(query);
}

// Get all tasks
export async function getTasks() {
  const query = `
    SELECT t.*, c.first_name as customer_first_name, c.last_name as customer_last_name,
           u.first_name as agent_first_name, u.last_name as agent_last_name
    FROM tasks t
    LEFT JOIN customers c ON t.customer_id = c.id
    LEFT JOIN users u ON t.agent_id = u.id
    ORDER BY t.due_date ASC, t.created_at DESC
  `;
  return await executeQuery(query);
}

// Get all activities
export async function getActivities() {
  const query = `
    SELECT a.*, c.first_name as customer_first_name, c.last_name as customer_last_name,
           u.first_name as agent_first_name, u.last_name as agent_last_name
    FROM activities a
    LEFT JOIN customers c ON a.customer_id = c.id
    LEFT JOIN users u ON a.agent_id = u.id
    ORDER BY a.created_at DESC
    LIMIT 50
  `;
  return await executeQuery(query);
}

// Get dashboard stats
export async function getDashboardStats(agentId = null) {
  const whereClause = agentId ? 'WHERE agent_id = ?' : '';
  const params = agentId ? [agentId] : [];

  const queries = {
    totalCustomers: `SELECT COUNT(*) as count FROM customers ${whereClause}`,
    totalSales: `SELECT COUNT(*) as count FROM sales ${whereClause}`,
    totalDeals: `SELECT COUNT(*) as count FROM deals ${whereClause}`,
    totalTasks: `SELECT COUNT(*) as count FROM tasks ${whereClause}`,
    activeDeals: `SELECT COUNT(*) as count FROM deals WHERE stage NOT IN ('closed_won', 'closed_lost') ${agentId ? 'AND agent_id = ?' : ''}`,
    pendingTasks: `SELECT COUNT(*) as count FROM tasks WHERE status = 'pending' ${agentId ? 'AND agent_id = ?' : ''}`
  };

  const stats = {};
  
  for (const [key, query] of Object.entries(queries)) {
    const result = await executeQuery(query, params);
    stats[key] = result.success ? result.data[0].count : 0;
  }

  return stats;
}

export default pool;
