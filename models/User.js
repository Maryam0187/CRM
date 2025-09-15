const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'first_name'
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'last_name'
    },
    role: {
      type: DataTypes.ENUM('admin', 'supervisor', 'agent', 'processor', 'verification'),
      defaultValue: 'agent'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    },
    cnic: {
      type: DataTypes.STRING(15),
      allowNull: true,
      unique: true,
      validate: {
        len: [13, 13],
        isNumeric: true
      }
    },
    phone: {
      type: DataTypes.STRING(15),
      allowNull: true,
      validate: {
        isNumeric: true
      }
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  User.associate = (models) => {
    // User has many customers
    User.hasMany(models.Customer, {
      foreignKey: 'createdBy',
      as: 'customers'
    });

    // User has many sales
    User.hasMany(models.Sale, {
      foreignKey: 'agentId',
      as: 'sales'
    });

    // Supervisor relationships
    User.hasMany(models.SupervisorAgent, {
      foreignKey: 'supervisorId',
      as: 'supervisedAgents'
    });

    User.hasMany(models.SupervisorAgent, {
      foreignKey: 'agentId',
      as: 'supervisorRelationships'
    });

    // Role assignments
    User.hasMany(models.RoleAssignment, {
      foreignKey: 'userId',
      as: 'roleAssignments'
    });

    User.hasMany(models.RoleAssignment, {
      foreignKey: 'assignedBy',
      as: 'assignedRoles'
    });

    // Belongs to relationships for role assignments
    User.belongsToMany(models.User, {
      through: models.SupervisorAgent,
      foreignKey: 'supervisorId',
      otherKey: 'agentId',
      as: 'agents'
    });

    User.belongsToMany(models.User, {
      through: models.SupervisorAgent,
      foreignKey: 'agentId',
      otherKey: 'supervisorId',
      as: 'supervisors'
    });
  };

  return User;
};
