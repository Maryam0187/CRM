import { 
  sequelize, 
  User, 
  Customer, 
  Sale, 
  Card,
  Bank,
  ChequeElectronic,
  ChequeMail,
  PaymentEmail,
  SupervisorAgent,
  RoleAssignment,
  Carrier,
  Receiver,
  SalesLog,
  CallLog,
  Notification,
  Helpline,
  testConnection, 
  syncDatabase 
} from '../models/index.js';

// Get models from sequelize instance to ensure associations are available
const getModel = (modelName) => {
  return sequelize.models[modelName] || 
    (modelName === 'User' ? User :
     modelName === 'Customer' ? Customer :
     modelName === 'Sale' ? Sale :
     modelName === 'Card' ? Card :
     modelName === 'Bank' ? Bank :
     modelName === 'ChequeElectronic' ? ChequeElectronic :
     modelName === 'ChequeMail' ? ChequeMail :
     modelName === 'PaymentEmail' ? PaymentEmail : null);
};

import { Op } from 'sequelize';
import { normalizePhoneForStorage } from './twilio.js';

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

  async findAllPaginated(page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    // Get count separately to avoid issues with complex includes
    const totalCount = await Customer.count({});
    
    // Get the actual data with includes
    const rows = await Customer.findAll({
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
        }
      ],
      order: [['created_at', 'DESC']],
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
    // Normalize phone numbers before saving
    const normalizedData = { ...customerData };
    
    if (normalizedData.phone) {
      normalizedData.phone = normalizePhoneForStorage(normalizedData.phone) || normalizedData.phone;
    }
    if (normalizedData.landline) {
      normalizedData.landline = normalizePhoneForStorage(normalizedData.landline) || normalizedData.landline;
    }
    
    return await Customer.create(normalizedData);
  },

  async update(id, customerData) {
    const customer = await Customer.findByPk(id);
    if (!customer) return null;
    
    // Normalize phone numbers before updating
    const normalizedData = { ...customerData };
    
    if (normalizedData.phone !== undefined) {
      normalizedData.phone = normalizedData.phone ? normalizePhoneForStorage(normalizedData.phone) || normalizedData.phone : normalizedData.phone;
    }
    if (normalizedData.landline !== undefined) {
      normalizedData.landline = normalizedData.landline ? normalizePhoneForStorage(normalizedData.landline) || normalizedData.landline : normalizedData.landline;
    }
    
    return await customer.update(normalizedData);
  },

  async delete(id) {
    const customer = await Customer.findByPk(id);
    if (!customer) return null;
    return await customer.destroy();
  },

  async findByLandline(landline) {
    return await Customer.findOne({
      where: {
        landline: landline
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
          required: false
        }
      ],
      order: [['created_at', 'DESC']] // Get the most recent customer with this landline
    });
  },

  async findAllByLandline(landline) {
    return await Customer.findAll({
      where: {
        landline: landline
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
          limit: 1, // Get only the last sale
          include: [
            {
              model: User,
              as: 'agent',
              attributes: ['id', 'firstName', 'lastName', 'email']
            }
          ],
          order: [['created_at', 'DESC']] // Get most recent sale first
        }
      ],
      order: [['created_at', 'ASC']] // Get oldest first, then most recent
    });
  },

  /** Find customers by landline OR phone (same number in either column). */
  async findAllByLandlineOrPhone(landlineOrPhone) {
    if (!landlineOrPhone) return [];
    const normalized = normalizePhoneForStorage(landlineOrPhone) || landlineOrPhone;
    return await Customer.findAll({
      where: {
        [Op.or]: [
          { landline: normalized },
          { phone: normalized }
        ]
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
          limit: 1,
          include: [
            {
              model: User,
              as: 'agent',
              attributes: ['id', 'firstName', 'lastName', 'email']
            }
          ],
          order: [['created_at', 'DESC']]
        }
      ],
      order: [['created_at', 'ASC']]
    });
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
  buildSaleIdWhere(idSearch) {
    if (idSearch === null || idSearch === undefined || idSearch === '') {
      return {};
    }
    const parsedId = parseInt(String(idSearch).trim(), 10);
    if (Number.isNaN(parsedId)) {
      return {};
    }
    return { id: parsedId };
  },

  // Helper function to build customer where clause for number search
  buildCustomerNumberSearchWhere(numberSearch, searchLastFour = false) {
    if (!numberSearch || (typeof numberSearch === 'string' && numberSearch.trim() === '')) {
      return null;
    }
    
    // Remove any non-digit characters
    const searchDigits = String(numberSearch).replace(/\D/g, '');
    
    if (searchDigits.length === 0) {
      return null;
    }
    
    // Build search conditions for phone and landline
    // If searchLastFour is true and search is 4 digits: match last 4 digits only (pattern ends with searchDigits)
    // Otherwise: match anywhere in the number (contains pattern)
    const conditions = [];
    
    // Determine the pattern based on searchLastFour toggle and search length
    let phonePattern, landlinePattern;
    if (searchLastFour && searchDigits.length === 4) {
      // Match last 4 digits only - pattern ends with searchDigits
      phonePattern = `%${searchDigits}`;
      landlinePattern = `%${searchDigits}`;
    } else {
      // Match anywhere in the number - contains pattern
      phonePattern = `%${searchDigits}%`;
      landlinePattern = `%${searchDigits}%`;
    }
    
    // Match phone field
    conditions.push({ 
      [Op.and]: [
        { phone: { [Op.ne]: null } },
        { phone: { [Op.like]: phonePattern } }
      ]
    });
    
    // Match landline field
    conditions.push({ 
      [Op.and]: [
        { landline: { [Op.ne]: null } },
        { landline: { [Op.like]: landlinePattern } }
      ]
    });
    
    return {
      [Op.or]: conditions
    };
  },

  async findAll() {
    return await Sale.findAll({
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline', 'state']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
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
          attributes: [
            'id',
            'firstName',
            'phone',
            'landline',
            'address',
            'state',
            'city',
            'zipcode',
            'country',
            'mailingAddress',
            'customerFeedback'
          ]
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email', 'role']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id']  // Only need ID to check existence
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id']  // Only need ID to check existence
        },
        {
          model: sequelize.models.ChequeElectronic,
          as: 'chequesElectronic',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.ChequeMail,
          as: 'chequesMail',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.PaymentEmail,
          as: 'paymentEmails',
          attributes: ['id'],
          required: false
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
          attributes: ['id', 'firstName', 'lastName', 'email', 'state']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName']
        },
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
    
    // Exclude agentId from updates to preserve the original agent who created the sale
    const { agentId, ...updateData } = saleData;
    
    return await sale.update(updateData);
  },

  async delete(id) {
    const sale = await Sale.findByPk(id);
    if (!sale) return null;
    return await sale.destroy();
  },

  // Date filtering methods
  async findByDate(dateFilter, dateField = 'created_at') {
    const { startDate, endDate } = this.parseDateFilter(dateFilter, dateField);
    
    const whereClause = {};
    if (startDate && endDate) {
      whereClause[dateField] = {
        [Op.between]: [startDate, endDate]
      };
    } else if (startDate) {
      whereClause[dateField] = {
        [Op.gte]: startDate
      };
    } else if (endDate) {
      whereClause[dateField] = {
        [Op.lte]: endDate
      };
    }

    return await Sale.findAll({
      where: whereClause,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline', 'state']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
      ],
      order: [['created_at', 'DESC']]
    });
  },

  async findByStatusAndDate(status, dateFilter, dateField = 'created_at') {
    const { startDate, endDate } = this.parseDateFilter(dateFilter, dateField);
    
    const whereClause = { status };
    if (startDate && endDate) {
      whereClause[dateField] = {
        [Op.between]: [startDate, endDate]
      };
    } else if (startDate) {
      whereClause[dateField] = {
        [Op.gte]: startDate
      };
    } else if (endDate) {
      whereClause[dateField] = {
        [Op.lte]: endDate
      };
    }

    return await Sale.findAll({
      where: whereClause,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline', 'state']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
      ],
      order: [['created_at', 'DESC']]
    });
  },

  // Lightweight method for dashboard appointment counts - no heavy includes
  async findAppointmentsForDashboard(agentId, dateFilter, dateField = 'appointmentDateTime') {
    const { startDate, endDate } = this.parseDateFilter(dateFilter, dateField);
    const whereClause = { agentId };
    if (startDate && endDate) {
      whereClause[dateField] = { [Op.between]: [startDate, endDate] };
    } else if (startDate) {
      whereClause[dateField] = { [Op.gte]: startDate };
    } else if (endDate) {
      whereClause[dateField] = { [Op.lte]: endDate };
    }

    return await Sale.findAll({
      where: whereClause,
      attributes: ['id', 'appointmentDateTime', 'customerId'],
      order: [['appointmentDateTime', 'ASC']]
    });
  },

  parseDateFilter(dateFilter, dateField = 'created_at') {
    let startDate = null;
    let endDate = null;

    if (!dateFilter) {
      return { startDate, endDate, dateField };
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
    } else if (dateFilter === 'week') {
      const today = new Date();
      startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
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
    } else if (dateFilter.startsWith('>')) {
      // Greater than format: ">2024-01-15"
      const dateStr = dateFilter.substring(1);
      startDate = new Date(dateStr);
      // No endDate for greater than queries
    } else if (dateFilter.startsWith('<')) {
      // Less than format: "<2024-01-15"
      const dateStr = dateFilter.substring(1);
      endDate = new Date(dateStr);
      endDate.setHours(23, 59, 59, 999);
      // No startDate for less than queries
    }

    return { startDate, endDate, dateField };
  },

  // Pagination helper method
  async findWithPagination(options = {}) {
    const {
      page = 1,
      limit = 5,
      where = {},
      include = [],
      order = [['updated_at', 'DESC']],
      numberSearch = null,
      searchLastFour = false
    } = options;

    const offset = (page - 1) * limit;

    // Add customer where clause if numberSearch is provided
    const customerWhere = numberSearch ? this.buildCustomerNumberSearchWhere(numberSearch, searchLastFour) : null;
    
    // Update Customer include to add where clause
    const processedIncludes = include.map(inc => {
      if (inc.as === 'customer' && customerWhere) {
        return { ...inc, where: customerWhere, required: true };
      }
      // If it's one of the new payment types, use sequelize.models
      if (inc.as === 'chequesElectronic' && inc.model !== sequelize.models.ChequeElectronic) {
        return { ...inc, model: sequelize.models.ChequeElectronic };
      }
      if (inc.as === 'chequesMail' && inc.model !== sequelize.models.ChequeMail) {
        return { ...inc, model: sequelize.models.ChequeMail };
      }
      if (inc.as === 'paymentEmails' && inc.model !== sequelize.models.PaymentEmail) {
        return { ...inc, model: sequelize.models.PaymentEmail };
      }
      return inc;
    });

    // Get count - if customer filter is applied, need to count with join
    let totalCount;
    if (customerWhere) {
      // Count sales that have customers matching the number search
      // Use findAndCountAll to get accurate count with includes
      const countResult = await Sale.findAndCountAll({
        where,
        include: [{
          model: Customer,
          as: 'customer',
          where: customerWhere,
          required: true
        }],
        distinct: true,
        col: 'id'
      });
      // Handle both array and number return types for count
      totalCount = Array.isArray(countResult.count) ? countResult.count.length : countResult.count;
    } else {
      totalCount = await Sale.count({ where });
    }
    
    const rows = await Sale.findAll({
      where,
      include: processedIncludes,
      order,
      limit: parseInt(limit),
      offset: parseInt(offset),
      // Ensure all associations are loaded
      subQuery: false,
      // Use raw: false to get Sequelize instances with associations
      raw: false
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
  async findAllPaginated(page = 1, limit = 10, numberSearch = null, searchLastFour = false, idSearch = null) {
    return await this.findWithPagination({
      page,
      limit,
      where: this.buildSaleIdWhere(idSearch),
      numberSearch,
      searchLastFour,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline', 'state']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id']
        },
        {
          model: sequelize.models.ChequeElectronic,
          as: 'chequesElectronic',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.ChequeMail,
          as: 'chequesMail',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.PaymentEmail,
          as: 'paymentEmails',
          attributes: ['id'],
          required: false
        },
      ]
    });
  },

  async findByStatusPaginated(statuses, page = 1, limit = 10, numberSearch = null, searchLastFour = false, idSearch = null) {
    // Support both single status (string) and multiple statuses (array)
    const statusArray = Array.isArray(statuses) ? statuses : [statuses];
    const statusCondition = statusArray.length === 1 ? statusArray[0] : { [Op.in]: statusArray };
    
    return await this.findWithPagination({
      page,
      limit,
      where: { status: statusCondition, ...this.buildSaleIdWhere(idSearch) },
      numberSearch,
      searchLastFour,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'state']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id']
        },
        {
          model: sequelize.models.ChequeElectronic,
          as: 'chequesElectronic',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.ChequeMail,
          as: 'chequesMail',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.PaymentEmail,
          as: 'paymentEmails',
          attributes: ['id'],
          required: false
        },
      ]
    });
  },

  async findByDatePaginated(dateFilter, page = 1, limit = 10, dateField = 'created_at', numberSearch = null, searchLastFour = false, idSearch = null) {
    const { startDate, endDate } = this.parseDateFilter(dateFilter, dateField);
    
    const whereClause = {};
    if (startDate && endDate) {
      whereClause[dateField] = {
        [Op.between]: [startDate, endDate]
      };
    } else if (startDate) {
      whereClause[dateField] = {
        [Op.gte]: startDate
      };
    } else if (endDate) {
      whereClause[dateField] = {
        [Op.lte]: endDate
      };
    }

    return await this.findWithPagination({
      page,
      limit,
      where: { ...whereClause, ...this.buildSaleIdWhere(idSearch) },
      numberSearch,
      searchLastFour,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline', 'state']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id']
        },
        {
          model: sequelize.models.ChequeElectronic,
          as: 'chequesElectronic',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.ChequeMail,
          as: 'chequesMail',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.PaymentEmail,
          as: 'paymentEmails',
          attributes: ['id'],
          required: false
        },
      ]
    });
  },

  async findByStatusAndDatePaginated(statuses, dateFilter, page = 1, limit = 10, dateField = 'created_at', numberSearch = null, searchLastFour = false, idSearch = null) {
    const { startDate, endDate } = this.parseDateFilter(dateFilter, dateField);
    
    // Support both single status (string) and multiple statuses (array)
    const statusArray = Array.isArray(statuses) ? statuses : [statuses];
    const statusCondition = statusArray.length === 1 ? statusArray[0] : { [Op.in]: statusArray };
    
    const whereClause = { status: statusCondition };
    if (startDate && endDate) {
      whereClause[dateField] = {
        [Op.between]: [startDate, endDate]
      };
    } else if (startDate) {
      whereClause[dateField] = {
        [Op.gte]: startDate
      };
    } else if (endDate) {
      whereClause[dateField] = {
        [Op.lte]: endDate
      };
    }

    return await this.findWithPagination({
      page,
      limit,
      where: { ...whereClause, ...this.buildSaleIdWhere(idSearch) },
      numberSearch,
      searchLastFour,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline', 'state']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id']
        },
        {
          model: sequelize.models.ChequeElectronic,
          as: 'chequesElectronic',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.ChequeMail,
          as: 'chequesMail',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.PaymentEmail,
          as: 'paymentEmails',
          attributes: ['id'],
          required: false
        },
      ]
    });
  },


  // Agent-specific paginated methods
  async findByAgentPaginated(agentId, page = 1, limit = 10, numberSearch = null, searchLastFour = false, idSearch = null) {
    return await this.findWithPagination({
      where: { agentId, ...this.buildSaleIdWhere(idSearch) },
      page,
      limit,
      numberSearch,
      searchLastFour,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline', 'state']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id']
        },
        {
          model: sequelize.models.ChequeElectronic,
          as: 'chequesElectronic',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.ChequeMail,
          as: 'chequesMail',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.PaymentEmail,
          as: 'paymentEmails',
          attributes: ['id'],
          required: false
        },
      ]
    });
  },

  async findByAgentStatusPaginated(agentId, statuses, page = 1, limit = 10, numberSearch = null, searchLastFour = false, idSearch = null) {
    // Support both single status (string) and multiple statuses (array)
    const statusArray = Array.isArray(statuses) ? statuses : [statuses];
    const statusCondition = statusArray.length === 1 ? statusArray[0] : { [Op.in]: statusArray };
    
    return await this.findWithPagination({
      where: { agentId, status: statusCondition, ...this.buildSaleIdWhere(idSearch) },
      page,
      limit,
      numberSearch,
      searchLastFour,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline', 'state']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id']
        },
        {
          model: sequelize.models.ChequeElectronic,
          as: 'chequesElectronic',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.ChequeMail,
          as: 'chequesMail',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.PaymentEmail,
          as: 'paymentEmails',
          attributes: ['id'],
          required: false
        }
      ]
    });
  },

  async findByAgentDatePaginated(agentId, dateFilter, page = 1, limit = 10, dateField = 'created_at', numberSearch = null, searchLastFour = false, idSearch = null) {
    const { startDate, endDate } = this.parseDateFilter(dateFilter, dateField);
    return await this.findWithPagination({
      where: { 
        agentId,
        ...this.buildSaleIdWhere(idSearch),
        [dateField]: {
          [Op.gte]: startDate,
          [Op.lte]: endDate
        }
      },
      page,
      limit,
      numberSearch,
      searchLastFour,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline', 'state']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id']
        },
        {
          model: sequelize.models.ChequeElectronic,
          as: 'chequesElectronic',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.ChequeMail,
          as: 'chequesMail',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.PaymentEmail,
          as: 'paymentEmails',
          attributes: ['id'],
          required: false
        },
      ]
    });
  },
  async findByAgentDate(agentId, dateFilter, dateField = 'created_at') {
    const { startDate, endDate } = this.parseDateFilter(dateFilter, dateField);
    
    const whereClause = { agentId };
    if (startDate && endDate) {
      whereClause[dateField] = {
        [Op.between]: [startDate, endDate]
      };
    } else if (startDate) {
      whereClause[dateField] = {
        [Op.gte]: startDate
      };
    } else if (endDate) {
      whereClause[dateField] = {
        [Op.lte]: endDate
      };
    }

    return await Sale.findAll({
      where: whereClause,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline', 'state']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id']
        },
        {
          model: sequelize.models.ChequeElectronic,
          as: 'chequesElectronic',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.ChequeMail,
          as: 'chequesMail',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.PaymentEmail,
          as: 'paymentEmails',
          attributes: ['id'],
          required: false
        },
      ],
      order: [['appointmentDateTime', 'ASC']]
    });
  },

  async findByAgentStatusAndDatePaginated(agentId, statuses, dateFilter, page = 1, limit = 10, dateField = 'created_at', numberSearch = null, searchLastFour = false, idSearch = null) {
    const { startDate, endDate } = this.parseDateFilter(dateFilter, dateField);
    
    // Support both single status (string) and multiple statuses (array)
    const statusArray = Array.isArray(statuses) ? statuses : [statuses];
    const statusCondition = statusArray.length === 1 ? statusArray[0] : { [Op.in]: statusArray };
    
    return await this.findWithPagination({
      where: { 
        agentId,
        ...this.buildSaleIdWhere(idSearch),
        status: statusCondition,
        [dateField]: {
          [Op.gte]: startDate,
          [Op.lte]: endDate
        }
      },
      page,
      limit,
      numberSearch,
      searchLastFour,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline', 'state']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Card,
          as: 'cards',
          attributes: ['id']
        },
        {
          model: Bank,
          as: 'banks',
          attributes: ['id']
        },
        {
          model: sequelize.models.ChequeElectronic,
          as: 'chequesElectronic',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.ChequeMail,
          as: 'chequesMail',
          attributes: ['id'],
          required: false
        },
        {
          model: sequelize.models.PaymentEmail,
          as: 'paymentEmails',
          attributes: ['id'],
          required: false
        },
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
  },

  // Non-paginated agent-specific methods for appointments
  async findByAgent(agentId) {
    return await Sale.findAll({
      where: { agentId },
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline', 'state']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
      ],
      order: [['appointmentDateTime', 'ASC']]
    });
  },


  async findByAgentStatus(agentId, status) {
    return await Sale.findAll({
      where: { agentId, status },
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline', 'state']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
      ],
      order: [['appointmentDateTime', 'ASC']]
    });
  },

  async findByAgentStatusAndDate(agentId, status, dateFilter, dateField = 'created_at') {
    const { startDate, endDate } = this.parseDateFilter(dateFilter, dateField);
    
    const whereClause = { agentId, status };
    if (startDate && endDate) {
      whereClause[dateField] = {
        [Op.between]: [startDate, endDate]
      };
    } else if (startDate) {
      whereClause[dateField] = {
        [Op.gte]: startDate
      };
    } else if (endDate) {
      whereClause[dateField] = {
        [Op.lte]: endDate
      };
    }

    return await Sale.findAll({
      where: whereClause,
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'landline', 'state']
        },
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
      ],
      order: [['appointmentDateTime', 'ASC']]
    });
  }
};

// Dashboard statistics
export const DashboardService = {
  async getStats(agentId = null) {
    const whereClause = agentId ? { agentId } : {};

    const [
      totalCustomers,
      totalSales,
      salesWithCards,
      salesWithBanks
    ] = await Promise.all([
      Customer.count({ where: agentId ? { createdBy: agentId } : {} }),
      Sale.count({ where: whereClause }),
      Sale.count({ 
        where: whereClause,
        include: [{
          model: Card,
          as: 'cards',
          required: true
        }]
      }),
      Sale.count({ 
        where: whereClause,
        include: [{
          model: Bank,
          as: 'banks',
          required: true
        }]
      })
    ]);

    return {
      totalCustomers,
      totalSales,
      salesWithCards,
      salesWithBanks
    };
  }
};

// Carrier operations
export const CarrierService = {
  async findAll() {
    return await Carrier.findAll({
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ],
      order: [['created_at', 'DESC']]
    });
  },

  async findAllPaginated(page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    // Get count separately to avoid issues with complex includes
    const totalCount = await Carrier.count({});
    
    // Get the actual data with includes
    const rows = await Carrier.findAll({
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: limit,
      offset: offset
    });

    const totalPages = Math.ceil(totalCount / limit);

    return {
      data: rows,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalCount,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  },

  async findById(id) {
    return await Carrier.findByPk(id, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ]
    });
  },

  async create(carrierData) {
    return await Carrier.create(carrierData);
  },

  async update(id, carrierData) {
    const carrier = await Carrier.findByPk(id);
    if (!carrier) return null;
    return await carrier.update(carrierData);
  },

  async delete(id) {
    const carrier = await Carrier.findByPk(id);
    if (!carrier) return null;
    return await carrier.destroy();
  }
};

// Receiver operations
export const ReceiverService = {
  async findAll() {
    return await Receiver.findAll({
      include: [
        {
          model: Carrier,
          as: 'carrier',
          attributes: ['id', 'name', 'status']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ],
      order: [['created_at', 'DESC']]
    });
  },

  async findAllPaginated(page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    // Get count separately to avoid issues with complex includes
    const totalCount = await Receiver.count({});
    
    // Get the actual data with includes
    const rows = await Receiver.findAll({
      include: [
        {
          model: Carrier,
          as: 'carrier',
          attributes: ['id', 'name', 'status']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: limit,
      offset: offset
    });

    const totalPages = Math.ceil(totalCount / limit);

    return {
      data: rows,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalCount,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  },

  async findById(id) {
    return await Receiver.findByPk(id, {
      include: [
        {
          model: Carrier,
          as: 'carrier',
          attributes: ['id', 'name', 'status']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ]
    });
  },

  async findByCarrierId(carrierId) {
    return await Receiver.findAll({
      where: { carrierId: carrierId },
      include: [
        {
          model: Carrier,
          as: 'carrier',
          attributes: ['id', 'name', 'status']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ],
      order: [['name', 'ASC']]
    });
  },

  async create(receiverData) {
    return await Receiver.create(receiverData);
  },

  async update(id, receiverData) {
    const receiver = await Receiver.findByPk(id);
    if (!receiver) return null;
    return await receiver.update(receiverData);
  },

  async delete(id) {
    const receiver = await Receiver.findByPk(id);
    if (!receiver) return null;
    return await receiver.destroy();
  }
};

// Sales Log operations
export const SalesLogService = {
  async createLog(logData) {
    return await SalesLog.create(logData);
  },

  async findBySaleId(saleId, options = {}) {
    const { page = 1, limit = 10 } = options;
    const offset = (page - 1) * limit;

    const { count, rows } = await SalesLog.findAndCountAll({
      where: { saleId },
      include: [
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'landline']
        }
      ],
      order: [['timestamp', 'DESC']],
      limit,
      offset
    });

    return {
      data: rows,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        itemsPerPage: limit
      }
    };
  },

  async findBySaleIdAll(saleId) {
    const rows = await SalesLog.findAll({
      where: { saleId },
      include: [
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'landline']
        }
      ],
      order: [['timestamp', 'DESC']]
    });

    return rows;
  },

  async findByAgentId(agentId, options = {}) {
    const { page = 1, limit = 10 } = options;
    const offset = (page - 1) * limit;

    const { count, rows } = await SalesLog.findAndCountAll({
      where: { agentId },
      include: [
        {
          model: Sale,
          as: 'sale',
          attributes: ['id', 'status']
        },
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'landline']
        }
      ],
      order: [['timestamp', 'DESC']],
      limit,
      offset
    });

    return {
      data: rows,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        itemsPerPage: limit
      }
    };
  },

  async findByAction(action, options = {}) {
    const { page = 1, limit = 10 } = options;
    const offset = (page - 1) * limit;

    const { count, rows } = await SalesLog.findAndCountAll({
      where: { action },
      include: [
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Sale,
          as: 'sale',
          attributes: ['id', 'status']
        },
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'landline']
        }
      ],
      order: [['timestamp', 'DESC']],
      limit,
      offset
    });

    return {
      data: rows,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        itemsPerPage: limit
      }
    };
  },

  async getSalesFlowStats(agentId = null, dateRange = null) {
    const whereClause = {};
    
    if (agentId) {
      whereClause.agentId = agentId;
    }
    
    if (dateRange) {
      whereClause.timestamp = {
        [Op.between]: [dateRange.start, dateRange.end]
      };
    }

    const stats = await SalesLog.findAll({
      where: whereClause,
      attributes: [
        'action',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['action'],
      raw: true
    });

    return stats;
  },

  async getRecentActions(limit = 10) {
    return await SalesLog.findAll({
      include: [
        {
          model: User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: Sale,
          as: 'sale',
          attributes: ['id', 'status']
        },
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'landline']
        }
      ],
      order: [['timestamp', 'DESC']],
      limit
    });
  }
};

// Notification operations
export const NotificationService = {
  async create(notificationData) {
    return await Notification.create(notificationData);
  },

  async findById(id) {
    return await Notification.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'role']
        }
      ]
    });
  },

  async findByUserId(userId, options = {}) {
    const { limit = 50, offset = 0, unreadOnly = false } = options;
    
    const whereClause = { userId };
    if (unreadOnly) {
      whereClause.isRead = false;
    }

    const notifications = await Notification.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'role']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return notifications;
  },

  async getUnreadCount(userId) {
    const count = await Notification.count({
      where: {
        userId,
        isRead: false
      }
    });
    return count;
  },

  async getTotalCount(userId, options = {}) {
    const { unreadOnly = false } = options;
    
    const whereClause = { userId };
    if (unreadOnly) {
      whereClause.isRead = false;
    }

    const count = await Notification.count({
      where: whereClause
    });
    return count;
  },

  async markAsRead(notificationId) {
    const notification = await Notification.findByPk(notificationId);
    if (notification) {
      notification.isRead = true;
      await notification.save();
      return notification;
    }
    return null;
  },

  async markAllAsRead(userId) {
    const result = await Notification.update(
      { isRead: true },
      {
        where: {
          userId,
          isRead: false
        }
      }
    );
    return result;
  },

  async delete(notificationId) {
    const notification = await Notification.findByPk(notificationId);
    if (notification) {
      await notification.destroy();
      return true;
    }
    return false;
  },

  async findByType(type, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    const notifications = await Notification.findAll({
      where: { type },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'role']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return notifications;
  },

  async findByRelatedId(relatedId, relatedType, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    const notifications = await Notification.findAll({
      where: { 
        relatedId,
        relatedType 
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'firstName', 'lastName', 'email', 'role']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return notifications;
  }
};

/**
 * Returns the set of customer IDs (from the given list) that have at least one payment
 * (card, bank, cheque-mail, cheque-electronic, or payment_email). Used for customer-based payment-info tag.
 * @param {number[]} customerIds - list of customer IDs to check (e.g. from current page of sales)
 * @returns {Promise<Set<number>>}
 */
export async function getCustomerIdsWithPayments(customerIds) {
  if (!Array.isArray(customerIds) || customerIds.length === 0) return new Set();
  const ids = customerIds.filter(Boolean).map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id));
  if (ids.length === 0) return new Set();
  const placeholders = ids.map(() => '?').join(',');
  const replacements = [...ids, ...ids, ...ids, ...ids, ...ids];
  const [rows] = await sequelize.query(
    `SELECT DISTINCT customer_id AS id FROM (
      SELECT customer_id FROM cards WHERE customer_id IN (${placeholders})
      UNION SELECT customer_id FROM banks WHERE customer_id IN (${placeholders})
      UNION SELECT customer_id FROM cheques_mail WHERE customer_id IN (${placeholders})
      UNION SELECT customer_id FROM cheques_electronic WHERE customer_id IN (${placeholders})
      UNION SELECT customer_id FROM payment_emails WHERE customer_id IN (${placeholders})
    ) t`,
    { replacements }
  );
  return new Set((rows || []).map((r) => r.id));
}

const sequelizeDb = {
  sequelize,
  User,
  Customer,
  Sale,
  CallLog,
  Helpline,
  UserService,
  CustomerService,
  SaleService,
  DashboardService,
  CarrierService,
  ReceiverService,
  SalesLogService,
  NotificationService,
  getCustomerIdsWithPayments,
  testSequelizeConnection,
  syncSequelizeDatabase
};

export default sequelizeDb;
