const { DataTypes } = require('sequelize');
const { encryptSensitiveData, decryptSensitiveData, isEncrypted, getDataBasedOnRole } = require('../lib/sensitive-data');

module.exports = (sequelize) => {
  const ChequeMail = sequelize.define('ChequeMail', {
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
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    comments: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Array of { id, userId, userName, text, createdAt } like notes'
    },
    status: {
      type: DataTypes.ENUM('active', 'pending', 'sent', 'received', 'processed'),
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
    tableName: 'cheques_mail',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (cheque) => {
        if (cheque.chequeNumber) {
          cheque.chequeNumber = encryptSensitiveData(cheque.chequeNumber);
        }
      },
      beforeUpdate: async (cheque) => {
        if (cheque.changed('chequeNumber') && cheque.chequeNumber) {
          cheque.chequeNumber = encryptSensitiveData(cheque.chequeNumber);
        }
      }
    }
  });

  ChequeMail.prototype.getDataForRole = function(userRole) {
    const data = { ...this.dataValues };
    
    if (data.chequeNumber && isEncrypted(data.chequeNumber)) {
      const decrypted = decryptSensitiveData(data.chequeNumber);
      data.chequeNumber = getDataBasedOnRole(decrypted, userRole, 'check');
    }
    
    return data;
  };

  ChequeMail.associate = (models) => {
    ChequeMail.belongsTo(models.Sale, {
      foreignKey: 'saleId',
      as: 'sale'
    });
    ChequeMail.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'customer'
    });

    ChequeMail.belongsTo(models.User, {
      foreignKey: 'addedByUserId',
      as: 'addedByUser'
    });
  };

  return ChequeMail;
};


