const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PaymentLog = sequelize.define('PaymentLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    paymentType: {
      type: DataTypes.ENUM('card', 'bank', 'cheque_electronic', 'cheque_mail', 'payment_email'),
      allowNull: false,
      field: 'payment_type'
    },
    paymentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'payment_id',
      comment: 'ID of the card, bank, cheque, or payment_email record'
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
    action: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'attempt, charged, declined, chargeback'
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Reason for decline or other notes'
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Extra data (e.g. amount, gateway response)'
    }
  }, {
    tableName: 'payment_logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['sale_id'] },
      { fields: ['payment_type', 'payment_id'] },
      { fields: ['action'] },
      { fields: ['created_at'] }
    ]
  });

  PaymentLog.associate = (models) => {
    PaymentLog.belongsTo(models.Sale, { foreignKey: 'saleId', as: 'sale' });
    PaymentLog.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
  };

  return PaymentLog;
};
