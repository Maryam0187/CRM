const { DataTypes } = require('sequelize');

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
      type: DataTypes.ENUM('lead', 'voicemail', 'hang-up', 'no_response', 'appointment', 'active', 'pending', 'completed', 'cancelled'),
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
      type: DataTypes.STRING(20),
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
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'account_number'
    },
    securityQuestion: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'security_question'
    },
    securityAnswer: {
      type: DataTypes.TEXT,
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
    updatedAt: 'updated_at'
  });

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

  };

  return Sale;
};
