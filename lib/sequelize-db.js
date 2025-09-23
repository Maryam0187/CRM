import { 
  sequelize, 
  User, 
  Customer, 
  Sale, 
  Card,
  Bank,
  SupervisorAgent,
  RoleAssignment,
  testConnection, 
  syncDatabase 
} from '../models/index.js';
import { Op } from 'sequelize';

// Test database connection
export async function testSequelizeConnection() {
  return await testConnection();
}

// Sync database
export async function syncSequelizeDatabase(force = false) {
  return await syncDatabase(force);
}

// User operations
export const UserService = {
  async findAll() {
    return await User.findAll({
      include: [
        {
          model: Customer,
          as: 'customers',
          required: false
        }
      ]
    });
  },

  async findById(id) {
    return await User.findByPk(id, {
      include: [
        {
          model: Customer,
          as: 'customers',
          required: false
        },
        {
          model: Sale,
          as: 'sales',
          required: false
        },
      ]
    });
  },

  async findByEmail(email) {
    return await User.findOne({ where: { email } });
  },

  async findByEmailWithSupervisor(email) {
    return await User.findOne({
      where: { email },
      include: [
        {
          model: SupervisorAgent,
          as: 'supervisorRelationships',
          include: [
            {
              model: User,
              as: 'supervisor',
              attributes: ['id', 'firstName', 'lastName', 'email']
            }
          ]
        }
      ]
    });
  },

  async create(userData) {
    return await User.create(userData);
  },

  async update(id, userData) {
    const user = await User.findByPk(id);
    if (!user) return null;
    return await user.update(userData);
  },

  async delete(id) {
    const user = await User.findByPk(id);
    if (!user) return null;
    return await user.destroy();
  }
};

// Customer operations
export const CustomerService = {
  async findAll() {
    return await Customer.findAll({
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Sale,
          as: 'sales',
          required: false
        },
      ],
      order: [['created_at', 'DESC']]
    });
  },

  async findById(id) {
    return await Customer.findByPk(id, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Sale,
          as: 'sales',
          required: false
        },
      ]
    });
  },

  async create(customerData) {
    return await Customer.create(customerData);
  },

  async update(id, customerData) {
    const customer = await Customer.findByPk(id);
    if (!customer) return null;
    return await customer.update(customerData);
  },

  async delete(id) {
    const customer = await Customer.findByPk(id);
    if (!customer) return null;
    return await customer.destroy();
  },

  async findByLandlineAndName(landline, firstName) {
    return await Customer.findOne({
      where: {
        landline: landline,
        firstName: firstName
      },
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Sale,
          as: 'sales',
          required: false,
          order: [['created_at', 'DESC']],
          limit: 1
        }
      ]
    });
  },

  async getLastSaleForCustomer(customerId) {
    return await Sale.findOne({
      where: {
        customerId: customerId
      },
      order: [['created_at', 'DESC']],
      include: [
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ]
    });
  }
};

// Sale operations
export const SaleService = {
  async findAll() {
    return await Sale.findAll({
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id', 'cardType', 'provider', 'customerName', 'cardNumber', 'cvv', 'expiryDate', 'status', 'created_at']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id', 'bankName', 'accountHolder', 'accountNumber', 'routingNumber', 'checkNumber', 'driverLicense', 'nameOnLicense', 'stateId', 'status', 'created_at']
        }
      ],
      order: [['created_at', 'DESC']]
    });
  },

  async findAllWithLimitedPaymentInfo() {
    return await Sale.findAll({
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id', 'cardType', 'provider', 'customerName', 'cardNumber', 'expiryDate', 'status', 'created_at']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id', 'bankName', 'accountHolder', 'status', 'created_at']
        }
      ],
      order: [['created_at', 'DESC']]
    });
  },

  async findById(id) {
    return await Sale.findByPk(id, {
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline']
        },
        {
          model: User,
          as: 'agent'
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id', 'cardType', 'provider', 'customerName', 'cardNumber', 'cvv', 'expiryDate', 'status', 'created_at']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id', 'bankName', 'accountHolder', 'accountNumber', 'routingNumber', 'checkNumber', 'driverLicense', 'nameOnLicense', 'stateId', 'status', 'created_at']
        }
      ]
    });
  },

  async findByStatus(status) {
    return await Sale.findAll({
      where: { status },
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id', 'cardType', 'provider', 'customerName', 'cardNumber', 'cvv', 'expiryDate', 'status', 'created_at']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id', 'bankName', 'accountHolder', 'accountNumber', 'routingNumber', 'checkNumber', 'driverLicense', 'nameOnLicense', 'stateId', 'status', 'created_at']
        }
      ],
      order: [['created_at', 'DESC']]
    });
  },

  async create(saleData) {
    return await Sale.create(saleData);
  },

  async update(id, saleData) {
    const sale = await Sale.findByPk(id);
    if (!sale) return null;
    return await sale.update(saleData);
  },

  async delete(id) {
    const sale = await Sale.findByPk(id);
    if (!sale) return null;
    return await sale.destroy();
  },

  // Date filtering methods
  async findByDate(dateFilter) {
    const { startDate, endDate } = this.parseDateFilter(dateFilter);
    
    const whereClause = {};
    if (startDate && endDate) {
      whereClause.created_at = {
        [Op.between]: [startDate, endDate]
      };
    } else if (startDate) {
      whereClause.created_at = {
        [Op.gte]: startDate
      };
    } else if (endDate) {
      whereClause.created_at = {
        [Op.lte]: endDate
      };
    }

    return await Sale.findAll({
      where: whereClause,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id', 'cardType', 'provider', 'customerName', 'cardNumber', 'cvv', 'expiryDate', 'status', 'created_at']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id', 'bankName', 'accountHolder', 'accountNumber', 'routingNumber', 'checkNumber', 'driverLicense', 'nameOnLicense', 'stateId', 'status', 'created_at']
        }
      ],
      order: [['created_at', 'DESC']]
    });
  },

  async findByStatusAndDate(status, dateFilter) {
    const { startDate, endDate } = this.parseDateFilter(dateFilter);
    
    const whereClause = { status };
    if (startDate && endDate) {
      whereClause.created_at = {
        [Op.between]: [startDate, endDate]
      };
    } else if (startDate) {
      whereClause.created_at = {
        [Op.gte]: startDate
      };
    } else if (endDate) {
      whereClause.created_at = {
        [Op.lte]: endDate
      };
    }

    return await Sale.findAll({
      where: whereClause,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id', 'cardType', 'provider', 'customerName', 'cardNumber', 'cvv', 'expiryDate', 'status', 'created_at']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id', 'bankName', 'accountHolder', 'accountNumber', 'routingNumber', 'checkNumber', 'driverLicense', 'nameOnLicense', 'stateId', 'status', 'created_at']
        }
      ],
      order: [['created_at', 'DESC']]
    });
  },

  parseDateFilter(dateFilter) {
    let startDate = null;
    let endDate = null;

    if (!dateFilter) {
      return { startDate, endDate };
    }

    // Handle different date filter formats
    if (dateFilter === 'today') {
      const today = new Date();
      startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
    } else if (dateFilter === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
      endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
    } else if (dateFilter.includes('|')) {
      // Custom date range format: "startDate|endDate"
      const [start, end] = dateFilter.split('|');
      startDate = new Date(start);
      endDate = new Date(end);
      // Set end date to end of day
      endDate.setHours(23, 59, 59, 999);
    } else if (dateFilter.includes(' ')) {
      // Month format: "January 2024"
      const [month, year] = dateFilter.split(' ');
      const monthIndex = new Date(`${month} 1, ${year}`).getMonth();
      startDate = new Date(year, monthIndex, 1);
      endDate = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    }

    return { startDate, endDate };
  },

  // Pagination helper method
  async findWithPagination(options = {}) {
    const {
      page = 1,
      limit = 5,
      where = {},
      include = [],
      order = [['created_at', 'DESC']]
    } = options;

    const offset = (page - 1) * limit;

    // Get count separately to avoid issues with complex includes
    const totalCount = await Sale.count({ where });
    
    // Get the actual data with includes
    const rows = await Sale.findAll({
      where,
      include,
      order,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return {
      data: rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        itemsPerPage: parseInt(limit),
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      }
    };
  },

  // Paginated versions of existing methods
  async findAllPaginated(page = 1, limit = 10) {
    return await this.findWithPagination({
      page,
      limit,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id', 'cardType', 'provider', 'customerName', 'cardNumber', 'cvv', 'expiryDate', 'status', 'created_at']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id', 'bankName', 'accountHolder', 'accountNumber', 'routingNumber', 'checkNumber', 'driverLicense', 'nameOnLicense', 'stateId', 'status', 'created_at']
        }
      ]
    });
  },

  async findByStatusPaginated(status, page = 1, limit = 10) {
    return await this.findWithPagination({
      page,
      limit,
      where: { status },
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id', 'cardType', 'provider', 'customerName', 'cardNumber', 'cvv', 'expiryDate', 'status', 'created_at']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id', 'bankName', 'accountHolder', 'accountNumber', 'routingNumber', 'checkNumber', 'driverLicense', 'nameOnLicense', 'stateId', 'status', 'created_at']
        }
      ]
    });
  },

  async findByDatePaginated(dateFilter, page = 1, limit = 10) {
    const { startDate, endDate } = this.parseDateFilter(dateFilter);
    
    const whereClause = {};
    if (startDate && endDate) {
      whereClause.created_at = {
        [Op.between]: [startDate, endDate]
      };
    } else if (startDate) {
      whereClause.created_at = {
        [Op.gte]: startDate
      };
    } else if (endDate) {
      whereClause.created_at = {
        [Op.lte]: endDate
      };
    }

    return await this.findWithPagination({
      page,
      limit,
      where: whereClause,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id', 'cardType', 'provider', 'customerName', 'cardNumber', 'cvv', 'expiryDate', 'status', 'created_at']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id', 'bankName', 'accountHolder', 'accountNumber', 'routingNumber', 'checkNumber', 'driverLicense', 'nameOnLicense', 'stateId', 'status', 'created_at']
        }
      ]
    });
  },

  async findByStatusAndDatePaginated(status, dateFilter, page = 1, limit = 10) {
    const { startDate, endDate } = this.parseDateFilter(dateFilter);
    
    const whereClause = { status };
    if (startDate && endDate) {
      whereClause.created_at = {
        [Op.between]: [startDate, endDate]
      };
    } else if (startDate) {
      whereClause.created_at = {
        [Op.gte]: startDate
      };
    } else if (endDate) {
      whereClause.created_at = {
        [Op.lte]: endDate
      };
    }

    return await this.findWithPagination({
      page,
      limit,
      where: whereClause,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id', 'cardType', 'provider', 'customerName', 'cardNumber', 'cvv', 'expiryDate', 'status', 'created_at']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id', 'bankName', 'accountHolder', 'accountNumber', 'routingNumber', 'checkNumber', 'driverLicense', 'nameOnLicense', 'stateId', 'status', 'created_at']
        }
      ]
    });
  }
};

// Supervisor-Agent relationship operations
export const SupervisorAgentService = {
  async create(supervisorId, agentId) {
    return await SupervisorAgent.create({
      supervisorId,
      agentId
    });
  },

  async findBySupervisor(supervisorId) {
    return await SupervisorAgent.findAll({
      where: { supervisorId },
      include: [
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'isActive']
        }
      ]
    });
  },

  async findByAgent(agentId) {
    return await SupervisorAgent.findAll({
      where: { agentId },
      include: [
        {
          model: User,
          as: 'supervisor',
          attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'isActive']
        }
      ]
    });
  },

  async remove(supervisorId, agentId) {
    return await SupervisorAgent.destroy({
      where: { supervisorId, agentId }
    });
  },

  async getSupervisedAgents(supervisorId) {
    const relationships = await this.findBySupervisor(supervisorId);
    return relationships.map(rel => rel.agent);
  },

  async getSupervisors(agentId) {
    const relationships = await this.findByAgent(agentId);
    return relationships.map(rel => rel.supervisor);
  }
};

// Role assignment operations
export const RoleAssignmentService = {
  async create(userId, assignedRole, assignedBy = null, expiresAt = null) {
    return await RoleAssignment.create({
      userId,
      assignedRole,
      assignedBy,
      expiresAt
    });
  },

  async findByUser(userId) {
    return await RoleAssignment.findAll({
      where: { 
        userId,
        isActive: true,
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: new Date() } }
        ]
      },
      include: [
        {
          model: User,
          as: 'assigner',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ]
    });
  },

  async findByRole(assignedRole) {
    return await RoleAssignment.findAll({
      where: { 
        assignedRole,
        isActive: true,
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: new Date() } }
        ]
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'role']
        }
      ]
    });
  },

  async deactivate(userId, assignedRole) {
    return await RoleAssignment.update(
      { isActive: false },
      { where: { userId, assignedRole } }
    );
  },

  async getUserAssignedRoles(userId) {
    const assignments = await this.findByUser(userId);
    return assignments.map(assignment => assignment.assignedRole);
  },

  async getUsersWithRole(assignedRole) {
    const assignments = await this.findByRole(assignedRole);
    return assignments.map(assignment => assignment.user);
  }
};

// Dashboard statistics
export const DashboardService = {
  async getStats(agentId = null) {
    const whereClause = agentId ? { agentId } : {};

    const [
      totalCustomers,
      totalSales
    ] = await Promise.all([
      Customer.count({ where: agentId ? { createdBy: agentId } : {} }),
      Sale.count({ where: whereClause })
    ]);

    return {
      totalCustomers,
      totalSales
    };
  }
};

const sequelizeDb = {
  sequelize,
  User,
  Customer,
  Sale,
  UserService,
  CustomerService,
  SaleService,
  DashboardService,
  testSequelizeConnection,
  syncSequelizeDatabase
};

export default sequelizeDb;
