const { DataTypes } = require('sequelize');
const { encryptSensitiveData, decryptSensitiveData, isEncrypted, getDataBasedOnRole } = require('../lib/sensitive-data');

module.exports = (sequelize) => {
  const Bank = sequelize.define('Bank', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    saleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'sale_id',
      references: {
        model: 'sales',
        key: 'id'
      }
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'customer_id',
      references: {
        model: 'customers',
        key: 'id'
      }
    },
    bankName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'bank_name'
    },
    accountHolder: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'account_holder'
    },
    accountNumber: {
      type: DataTypes.TEXT, // Changed to TEXT to accommodate encrypted data
      allowNull: false,
      field: 'account_number'
    },
    routingNumber: {
      type: DataTypes.TEXT, // Changed to TEXT to accommodate encrypted data
      allowNull: false,
      field: 'routing_number'
    },
    checkNumber: {
      type: DataTypes.TEXT, // Changed to TEXT to accommodate encrypted data
      allowNull: false,
      field: 'check_number'
    },
    driverLicense: {
      type: DataTypes.TEXT, // Changed to TEXT to accommodate encrypted data
      allowNull: false,
      field: 'driver_license'
    },
    nameOnLicense: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'name_on_license'
    },
    stateId: {
      type: DataTypes.TEXT, // Changed to TEXT to accommodate encrypted data
      allowNull: false,
      field: 'state_id'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'closed'),
      defaultValue: 'active'
    }
  }, {
    tableName: 'banks',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (bank) => {
        // Encrypt sensitive fields before saving
        if (bank.accountNumber) {
          bank.accountNumber = encryptSensitiveData(bank.accountNumber);
        }
        if (bank.routingNumber) {
          bank.routingNumber = encryptSensitiveData(bank.routingNumber);
        }
        if (bank.checkNumber) {
          bank.checkNumber = encryptSensitiveData(bank.checkNumber);
        }
        if (bank.driverLicense) {
          bank.driverLicense = encryptSensitiveData(bank.driverLicense);
        }
        if (bank.stateId) {
          bank.stateId = encryptSensitiveData(bank.stateId);
        }
      },
      beforeUpdate: async (bank) => {
        // Encrypt sensitive fields if they have changed
        if (bank.changed('accountNumber') && bank.accountNumber) {
          bank.accountNumber = encryptSensitiveData(bank.accountNumber);
        }
        if (bank.changed('routingNumber') && bank.routingNumber) {
          bank.routingNumber = encryptSensitiveData(bank.routingNumber);
        }
        if (bank.changed('checkNumber') && bank.checkNumber) {
          bank.checkNumber = encryptSensitiveData(bank.checkNumber);
        }
        if (bank.changed('driverLicense') && bank.driverLicense) {
          bank.driverLicense = encryptSensitiveData(bank.driverLicense);
        }
        if (bank.changed('stateId') && bank.stateId) {
          bank.stateId = encryptSensitiveData(bank.stateId);
        }
      },
      // Note: We removed the afterFind hook to avoid double processing
      // Role-based access control is now handled manually in the API routes
    }
  });

  // Add instance methods for role-based data access
  Bank.prototype.getDataForRole = function(userRole) {
    const data = { ...this.dataValues };
    
    // First decrypt the data, then apply role-based masking
    if (data.accountNumber && isEncrypted(data.accountNumber)) {
      const decrypted = decryptSensitiveData(data.accountNumber);
      data.accountNumber = getDataBasedOnRole(decrypted, userRole, 'account');
    }
    if (data.routingNumber && isEncrypted(data.routingNumber)) {
      const decrypted = decryptSensitiveData(data.routingNumber);
      data.routingNumber = getDataBasedOnRole(decrypted, userRole, 'routing');
    }
    if (data.checkNumber && isEncrypted(data.checkNumber)) {
      const decrypted = decryptSensitiveData(data.checkNumber);
      data.checkNumber = getDataBasedOnRole(decrypted, userRole, 'check');
    }
    if (data.driverLicense && isEncrypted(data.driverLicense)) {
      const decrypted = decryptSensitiveData(data.driverLicense);
      data.driverLicense = getDataBasedOnRole(decrypted, userRole, 'license');
    }
    if (data.stateId && isEncrypted(data.stateId)) {
      const decrypted = decryptSensitiveData(data.stateId);
      data.stateId = getDataBasedOnRole(decrypted, userRole, 'state_id');
    }
    
    return data;
  };

  Bank.associate = (models) => {
    // Bank belongs to a sale
    Bank.belongsTo(models.Sale, {
      foreignKey: 'saleId',
      as: 'sale'
    });

    // Bank belongs to a customer
    Bank.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'customer'
    });
  };

  return Bank;
};
