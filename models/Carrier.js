const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Carrier = sequelize.define('Carrier', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
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
    tableName: 'carriers',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  Carrier.associate = (models) => {
    // Carrier belongs to a user (creator)
    Carrier.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'creator'
    });
  };

  return Carrier;
};
