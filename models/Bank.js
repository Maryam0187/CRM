const { DataTypes } = require('sequelize');

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
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'account_number'
    },
    routingNumber: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'routing_number'
    },
    checkNumber: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'check_number'
    },
    driverLicense: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'driver_license'
    },
    nameOnLicense: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'name_on_license'
    },
    stateId: {
      type: DataTypes.STRING(50),
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
    updatedAt: 'updated_at'
  });

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
