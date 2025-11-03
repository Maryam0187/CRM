const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');

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
      // Removed validation to make CNIC non-required and more flexible
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
    },
    status: {
      type: DataTypes.ENUM('online', 'offline', 'away'),
      defaultValue: 'offline',
      allowNull: false,
      field: 'status'
    },
    lastLoginTime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_login_time'
    },
    lastLogoutTime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_logout_time'
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true
    },
    longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true
    },
    locationAccuracy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'location_accuracy'
    },
    locationTimestamp: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'location_timestamp'
    },
    locationPermission: {
      type: DataTypes.ENUM('granted', 'denied', 'prompt', 'not_set'),
      allowNull: true,
      defaultValue: 'not_set',
      field: 'location_permission'
    }
  }, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          const saltRounds = 12;
          user.password = await bcrypt.hash(user.password, saltRounds);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password') && user.password) {
          const saltRounds = 12;
          user.password = await bcrypt.hash(user.password, saltRounds);
        }
      }
    }
  });

  // Add instance method for password comparison
  User.prototype.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
  };

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

    // User has many sales logs
    User.hasMany(models.SalesLog, {
      foreignKey: 'agentId',
      as: 'salesLogs'
    });

    // User has many activity logs
    User.hasMany(models.UserActivityLog, {
      foreignKey: 'userId',
      as: 'activityLogs'
    });
  };

  return User;
};
