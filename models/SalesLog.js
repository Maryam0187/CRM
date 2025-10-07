const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SalesLog = sequelize.define('SalesLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    saleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'sales',
        key: 'id'
      }
    },
    agentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'customers',
        key: 'id'
      }
    },
    bankId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'banks',
        key: 'id'
      }
    },
    cardId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'cards',
        key: 'id'
      }
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Action taken: hangup, voicemail, no_response, lead_call, second_call, customer_agree, payment_info, process, verification, charge, approved, decline, chargeback, appointment, done, close'
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Current status of the sale'
    },
    currentSaleData: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Current sale data at the time of action'
    },
    previousSaleData: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Previous sale data for comparison'
    },
    breakdown: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Breakdown of the sale details'
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Additional notes for the action'
    },
    appointment_datetime: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Combined appointment date and time in UTC'
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'sales_logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['saleId']
      },
      {
        fields: ['agentId']
      },
      {
        fields: ['customerId']
      },
      {
        fields: ['action']
      },
      {
        fields: ['timestamp']
      }
    ]
  });

  SalesLog.associate = (models) => {
    // SalesLog belongs to User (agent)
    SalesLog.belongsTo(models.User, {
      foreignKey: 'agentId',
      as: 'agent'
    });

    // SalesLog belongs to Customer
    SalesLog.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'customer'
    });

    // SalesLog belongs to Sale
    SalesLog.belongsTo(models.Sale, {
      foreignKey: 'saleId',
      as: 'sale'
    });

    // SalesLog belongs to Bank (optional)
    SalesLog.belongsTo(models.Bank, {
      foreignKey: 'bankId',
      as: 'bank'
    });

    // SalesLog belongs to Card (optional)
    SalesLog.belongsTo(models.Card, {
      foreignKey: 'cardId',
      as: 'card'
    });
  };

  return SalesLog;
};
