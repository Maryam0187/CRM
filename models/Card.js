const { DataTypes } = require('sequelize');
const { encryptSensitiveData, decryptSensitiveData, isEncrypted, getDataBasedOnRole } = require('../lib/sensitive-data');

module.exports = (sequelize) => {
  const Card = sequelize.define('Card', {
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
    cardType: {
      type: DataTypes.ENUM('credit', 'debit', 'prepaid', 'gift-card'),
      allowNull: false,
      field: 'card_type'
    },
    provider: {
      type: DataTypes.ENUM('visa', 'mastercard', 'discover', 'amex'),
      allowNull: false
    },
    customerName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'customer_name'
    },
    cardNumber: {
      type: DataTypes.TEXT, // Changed to TEXT to accommodate encrypted data
      allowNull: false,
      field: 'card_number'
    },
    cvv: {
      type: DataTypes.TEXT, // Changed to TEXT to accommodate encrypted data
      allowNull: false
    },
    expiryDate: {
      type: DataTypes.TEXT, // Changed to TEXT to accommodate encrypted data
      allowNull: false,
      field: 'expiry_date'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'expired'),
      defaultValue: 'active'
    }
  }, {
    tableName: 'cards',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (card) => {
        // Encrypt sensitive fields before saving
        if (card.cardNumber) {
          card.cardNumber = encryptSensitiveData(card.cardNumber);
        }
        if (card.cvv) {
          card.cvv = encryptSensitiveData(card.cvv);
        }
        if (card.expiryDate) {
          card.expiryDate = encryptSensitiveData(card.expiryDate);
        }
      },
      beforeUpdate: async (card) => {
        // Encrypt sensitive fields if they have changed
        if (card.changed('cardNumber') && card.cardNumber) {
          card.cardNumber = encryptSensitiveData(card.cardNumber);
        }
        if (card.changed('cvv') && card.cvv) {
          card.cvv = encryptSensitiveData(card.cvv);
        }
        if (card.changed('expiryDate') && card.expiryDate) {
          card.expiryDate = encryptSensitiveData(card.expiryDate);
        }
      },
      // Note: We removed the afterFind hook to avoid double processing
      // Role-based access control is now handled manually in the API routes
    }
  });

  // Add instance methods for role-based data access
  Card.prototype.getDataForRole = function(userRole) {
    const data = { ...this.dataValues };
    
    // First decrypt the data, then apply role-based masking
    if (data.cardNumber && isEncrypted(data.cardNumber)) {
      const decrypted = decryptSensitiveData(data.cardNumber);
      data.cardNumber = getDataBasedOnRole(decrypted, userRole, 'card');
    }
    if (data.cvv && isEncrypted(data.cvv)) {
      const decrypted = decryptSensitiveData(data.cvv);
      data.cvv = getDataBasedOnRole(decrypted, userRole, 'cvv');
    }
    if (data.expiryDate && isEncrypted(data.expiryDate)) {
      const decrypted = decryptSensitiveData(data.expiryDate);
      data.expiryDate = getDataBasedOnRole(decrypted, userRole, 'default');
    }
    
    return data;
  };

  Card.associate = (models) => {
    // Card belongs to a sale
    Card.belongsTo(models.Sale, {
      foreignKey: 'saleId',
      as: 'sale'
    });

    // Card belongs to a customer
    Card.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'customer'
    });
  };

  return Card;
};
