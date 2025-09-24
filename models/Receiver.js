const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Receiver = sequelize.define('Receiver', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    carrierId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'carrier_id',
      references: {
        model: 'carriers',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      defaultValue: 'active'
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
    tableName: 'receivers',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  Receiver.associate = (models) => {
    // Receiver belongs to a carrier
    Receiver.belongsTo(models.Carrier, {
      foreignKey: 'carrierId',
      as: 'carrier'
    });

    // Receiver belongs to a user (creator)
    Receiver.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'creator'
    });
  };

  return Receiver;
};
