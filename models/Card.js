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
      type: DataTypes.STRING(7), // Not encrypted - all users need to see expiry date
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
    },
    addedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'added_by_user_id',
      references: {
        model: 'users',
        key: 'id'
      }
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
        // expiryDate is NOT encrypted - all users need to see it
      },
      beforeUpdate: async (card) => {
        // Encrypt sensitive fields if they have changed
        if (card.changed('cardNumber') && card.cardNumber) {
          card.cardNumber = encryptSensitiveData(card.cardNumber);
        }
        if (card.changed('cvv') && card.cvv) {
          card.cvv = encryptSensitiveData(card.cvv);
        }
        // expiryDate is NOT encrypted - all users need to see it
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
    // expiryDate is NOT encrypted - return as is for all users
    // If it was previously encrypted, try to decrypt it once
    if (data.expiryDate && isEncrypted(data.expiryDate)) {
      data.expiryDate = decryptSensitiveData(data.expiryDate);
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

    Card.belongsTo(models.User, {
      foreignKey: 'addedByUserId',
      as: 'addedByUser'
    });
  };

  return Card;
};
