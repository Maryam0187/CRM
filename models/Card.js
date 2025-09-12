const { DataTypes } = require('sequelize');

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
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'card_number'
    },
    cvv: {
      type: DataTypes.STRING(4),
      allowNull: false
    },
    expiryDate: {
      type: DataTypes.STRING(7),
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
    updatedAt: 'updated_at'
  });

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
