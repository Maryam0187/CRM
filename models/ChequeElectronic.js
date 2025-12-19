const { DataTypes } = require('sequelize');
const { encryptSensitiveData, decryptSensitiveData, isEncrypted, getDataBasedOnRole } = require('../lib/sensitive-data');

module.exports = (sequelize) => {
  const ChequeElectronic = sequelize.define('ChequeElectronic', {
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
    routingNumber: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'routing_number'
    },
    accountNumber: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'account_number'
    },
    chequeNumber: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'cheque_number'
    },
    nameOnCheque: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'name_on_cheque'
    },
    bankName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'bank_name'
    },
    state: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'processed'),
      defaultValue: 'active'
    }
  }, {
    tableName: 'cheques_electronic',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (cheque) => {
        if (cheque.routingNumber) {
          cheque.routingNumber = encryptSensitiveData(cheque.routingNumber);
        }
        if (cheque.accountNumber) {
          cheque.accountNumber = encryptSensitiveData(cheque.accountNumber);
        }
        if (cheque.chequeNumber) {
          cheque.chequeNumber = encryptSensitiveData(cheque.chequeNumber);
        }
      },
      beforeUpdate: async (cheque) => {
        if (cheque.changed('routingNumber') && cheque.routingNumber) {
          cheque.routingNumber = encryptSensitiveData(cheque.routingNumber);
        }
        if (cheque.changed('accountNumber') && cheque.accountNumber) {
          cheque.accountNumber = encryptSensitiveData(cheque.accountNumber);
        }
        if (cheque.changed('chequeNumber') && cheque.chequeNumber) {
          cheque.chequeNumber = encryptSensitiveData(cheque.chequeNumber);
        }
      }
    }
  });

  ChequeElectronic.prototype.getDataForRole = function(userRole) {
    const data = { ...this.dataValues };
    
    if (data.routingNumber && isEncrypted(data.routingNumber)) {
      const decrypted = decryptSensitiveData(data.routingNumber);
      data.routingNumber = getDataBasedOnRole(decrypted, userRole, 'routing');
    }
    if (data.accountNumber && isEncrypted(data.accountNumber)) {
      const decrypted = decryptSensitiveData(data.accountNumber);
      data.accountNumber = getDataBasedOnRole(decrypted, userRole, 'account');
    }
    if (data.chequeNumber && isEncrypted(data.chequeNumber)) {
      const decrypted = decryptSensitiveData(data.chequeNumber);
      data.chequeNumber = getDataBasedOnRole(decrypted, userRole, 'check');
    }
    
    return data;
  };

  ChequeElectronic.associate = (models) => {
    ChequeElectronic.belongsTo(models.Sale, {
      foreignKey: 'saleId',
      as: 'sale'
    });
    ChequeElectronic.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'customer'
    });
  };

  return ChequeElectronic;
};


