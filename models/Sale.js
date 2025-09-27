const { DataTypes } = require('sequelize');
const { encryptSensitiveData, decryptSensitiveData, isEncrypted, getDataBasedOnRole } = require('../lib/sensitive-data');

module.exports = (sequelize) => {
  const Sale = sequelize.define('Sale', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'customer_id',
      references: {
        model: 'customers',
        key: 'id'
      }
    },
    agentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'agent_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('lead', 'voicemail', 'hang-up', 'no_response', 'appointment', 'active', 'payment_info', 'pending', 'completed', 'cancelled'),
      defaultValue: 'lead'
    },
    
    // Sale Information
    pinCode: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'pin_code'
    },
    pinCodeStatus: {
      type: DataTypes.ENUM('matched', 'not_matched'),
      allowNull: true,
      field: 'pin_code_status'
    },
    ssnName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'ssn_name'
    },
    ssnNumber: {
      type: DataTypes.TEXT, // Changed to TEXT to accommodate encrypted data
      allowNull: true,
      field: 'ssn_number'
    },
    carrier: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    basicPackage: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'basic_package'
    },
    basicPackageStatus: {
      type: DataTypes.ENUM('same', 'upgrade', 'downgrade'),
      allowNull: true,
      field: 'basic_package_status'
    },
    noOfTv: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'no_of_tv'
    },
    noOfReceiver: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'no_of_receiver'
    },
    accountHolder: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'account_holder'
    },
    accountNumber: {
      type: DataTypes.TEXT, // Changed to TEXT to accommodate encrypted data
      allowNull: true,
      field: 'account_number'
    },
    securityQuestion: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'security_question'
    },
    securityAnswer: {
      type: DataTypes.TEXT, // Already TEXT - will accommodate encrypted data
      allowNull: true,
      field: 'security_answer'
    },
    regularBill: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'regular_bill'
    },
    promotionalBill: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'promotional_bill'
    },
    bundle: {
      type: DataTypes.ENUM('yes', 'no'),
      allowNull: true
    },
    company: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    lastPayment: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'last_payment'
    },
    lastPaymentDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'last_payment_date'
    },
    balance: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    dueOnDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'due_on_date'
    },
    breakdown: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    
    // JSON fields for complex data
    services: {
      type: DataTypes.JSON,
      allowNull: true
    },
    receivers: {
      type: DataTypes.JSON,
      allowNull: true
    },
    receiversInfo: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'receivers_info'
    },
    
    // Tech Visit Information
    techVisitDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'tech_visit_date'
    },
    techVisitTime: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'tech_visit_time'
    },
    
    // Appointment Information
    appointmentDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      field: 'appointment_date'
    },
    appointmentTime: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'appointment_time'
    }
  }, {
    tableName: 'sales',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (sale) => {
        // Encrypt sensitive fields before saving
        if (sale.ssnNumber) {
          sale.ssnNumber = encryptSensitiveData(sale.ssnNumber);
        }
        if (sale.accountNumber) {
          sale.accountNumber = encryptSensitiveData(sale.accountNumber);
        }
        if (sale.securityAnswer) {
          sale.securityAnswer = encryptSensitiveData(sale.securityAnswer);
        }
      },
      beforeUpdate: async (sale) => {
        // Encrypt sensitive fields if they have changed
        if (sale.changed('ssnNumber') && sale.ssnNumber) {
          sale.ssnNumber = encryptSensitiveData(sale.ssnNumber);
        }
        if (sale.changed('accountNumber') && sale.accountNumber) {
          sale.accountNumber = encryptSensitiveData(sale.accountNumber);
        }
        if (sale.changed('securityAnswer') && sale.securityAnswer) {
          sale.securityAnswer = encryptSensitiveData(sale.securityAnswer);
        }
      },
      afterFind: async (result, options) => {
        // Decrypt and apply role-based masking after retrieving from database
        if (!result) return;
        
        const sales = Array.isArray(result) ? result : [result];
        
        // Get user role from options (passed from query)
        const userRole = options?.userRole || 'agent'; // Default to agent if no role specified
        
        for (const sale of sales) {
          if (sale && sale.dataValues) {
            const data = sale.dataValues;
            
            // Decrypt all fields and return full data (no masking)
            if (data.ssnNumber && isEncrypted(data.ssnNumber)) {
              data.ssnNumber = decryptSensitiveData(data.ssnNumber);
            }
            
            if (data.accountNumber && isEncrypted(data.accountNumber)) {
              data.accountNumber = decryptSensitiveData(data.accountNumber);
            }
            
            if (data.securityAnswer && isEncrypted(data.securityAnswer)) {
              data.securityAnswer = decryptSensitiveData(data.securityAnswer);
            }
          }
        }
      }
    }
  });

  // Add instance methods for data access (returns full decrypted data)
  Sale.prototype.getDataForRole = function(userRole) {
    const data = { ...this.dataValues };
    
    // Return full decrypted data (no masking for any user)
    if (data.ssnNumber && isEncrypted(data.ssnNumber)) {
      data.ssnNumber = decryptSensitiveData(data.ssnNumber);
    }
    if (data.accountNumber && isEncrypted(data.accountNumber)) {
      data.accountNumber = decryptSensitiveData(data.accountNumber);
    }
    if (data.securityAnswer && isEncrypted(data.securityAnswer)) {
      data.securityAnswer = decryptSensitiveData(data.securityAnswer);
    }
    
    return data;
  };

  Sale.associate = (models) => {
    // Sale belongs to a customer
    Sale.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'customer'
    });

    // Sale belongs to an agent (user)
    Sale.belongsTo(models.User, {
      foreignKey: 'agentId',
      as: 'agent'
    });

    // Sale has many cards
    Sale.hasMany(models.Card, {
      foreignKey: 'saleId',
      as: 'cards'
    });

    // Sale has many banks
    Sale.hasMany(models.Bank, {
      foreignKey: 'saleId',
      as: 'banks'
    });

    // Sale has many sales logs
    Sale.hasMany(models.SalesLog, {
      foreignKey: 'saleId',
      as: 'salesLogs'
    });

  };

  return Sale;
};
