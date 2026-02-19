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
        // Custom validator that only validates if value is provided
        isNumericOrEmpty(value) {
          // Allow null, undefined, or empty string
          if (value === null || value === '' || value === undefined) {
            return true;
          }
          // If value is provided, it must be numeric
          if (!/^\d+$/.test(value)) {
            throw new Error('Phone number must contain only numbers (no spaces, dashes, or special characters)');
          }
        }
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
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_seen_at'
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
    },
    // SIP Extension fields
    extension: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true,
      comment: 'SIP extension number (e.g., 201, 202, 203)'
    },
    sipUsername: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
      field: 'sip_username',
      comment: 'SIP username (usually same as extension)'
    },
    sipPassword: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'sip_password',
      comment: 'Encrypted SIP password'
    },
    sipDomain: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'sip_domain',
      comment: 'SIP domain URL (e.g., crm-sip.sip.us1.twilio.com)'
    },
    callStatus: {
      type: DataTypes.ENUM('available', 'busy', 'away', 'offline'),
      allowNull: true,
      defaultValue: 'offline',
      field: 'call_status',
      comment: 'Agent call status for routing'
    },
    lastCallTime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_call_time',
      comment: 'Timestamp of last call'
    },
    totalCalls: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 'total_calls',
      comment: 'Total number of calls made by agent'
    },
    totalCallTime: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      field: 'total_call_time',
      comment: 'Total call time in seconds'
    },
    twilioEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'twilio_enabled',
      comment: 'Enable/disable Twilio calling functionality for user'
    },
    additionalInfo: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'additional_info',
      comment: 'Additional information for the user'
    }
  }, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          // Only hash if not already a bcrypt hash
          if (!isBcryptHash(user.password)) {
            const saltRounds = 12;
            user.password = await bcrypt.hash(user.password, saltRounds);
          }
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password') && user.password) {
          // Only hash if not already a bcrypt hash
          // This prevents double-hashing if an already-hashed password is accidentally passed
          if (!isBcryptHash(user.password)) {
            const saltRounds = 12;
            user.password = await bcrypt.hash(user.password, saltRounds);
          }
        }
      }
    }
  });

  // Helper function to check if a string is already a bcrypt hash
  // Bcrypt hashes start with $2a$, $2b$, or $2y$ followed by cost parameter
  function isBcryptHash(str) {
    if (!str || typeof str !== 'string') {
      return false;
    }
    // Bcrypt hash format: $2[abxy]$[cost]$[22 character salt][31 character hash]
    // Total length is typically 60 characters
    return /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(str);
  }

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

    // User has many sessions
    User.hasMany(models.UserSession, {
      foreignKey: 'userId',
      as: 'sessions'
    });
  };

  return User;
};
