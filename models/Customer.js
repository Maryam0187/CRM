const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Customer = sequelize.define('Customer', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'first_name'
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'last_name'
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    landline: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    state: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    mailingAddress: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'mailing_address'
    },
    customerFeedback: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'customer_feedback'
    },
    company: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'prospect', 'non_prospect'),
      defaultValue: 'prospect'
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'created_by',
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'customers',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  Customer.associate = (models) => {
    // Customer belongs to a user (creator)
    Customer.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'creator'
    });

    // Customer has many sales
    Customer.hasMany(models.Sale, {
      foreignKey: 'customerId',
      as: 'sales'
    });

    // Customer has many banks
    Customer.hasMany(models.Bank, {
      foreignKey: 'customerId',
      as: 'banks'
    });

    // Customer has many cards
    Customer.hasMany(models.Card, {
      foreignKey: 'customerId',
      as: 'cards'
    });

    // Customer has many sales logs
    Customer.hasMany(models.SalesLog, {
      foreignKey: 'customerId',
      as: 'salesLogs'
    });

  };

  return Customer;
};
