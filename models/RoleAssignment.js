const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RoleAssignment = sequelize.define('RoleAssignment', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
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
    assignedRole: {
      type: DataTypes.ENUM('processor', 'verification'),
      allowNull: false,
      field: 'assigned_role'
    },
    assignedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'assigned_by',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'assigned_at',
      defaultValue: DataTypes.NOW
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at'
    }
  }, {
    tableName: 'role_assignments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'assigned_role']
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['assigned_role']
      },
      {
        fields: ['is_active']
      }
    ]
  });

  RoleAssignment.associate = (models) => {
    // RoleAssignment belongs to a user
    RoleAssignment.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });

    // RoleAssignment belongs to the user who assigned it
    RoleAssignment.belongsTo(models.User, {
      foreignKey: 'assignedBy',
      as: 'assigner'
    });
  };

  return RoleAssignment;
};
