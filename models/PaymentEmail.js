const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PaymentEmail = sequelize.define('PaymentEmail', {
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
    emailAddress: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'email_address'
    },
    invoiceLink: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'invoice_link'
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'sent_at'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'pending', 'sent', 'opened', 'paid'),
      defaultValue: 'active'
    }
  }, {
    tableName: 'payment_emails',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  PaymentEmail.associate = (models) => {
    PaymentEmail.belongsTo(models.Sale, {
      foreignKey: 'saleId',
      as: 'sale'
    });
    PaymentEmail.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'customer'
    });
  };

  return PaymentEmail;
};


