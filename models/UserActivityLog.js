const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserActivityLog = sequelize.define('UserActivityLog', {
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
    activityType: {
      type: DataTypes.ENUM(
        'login',
        'logout',
        'status_change',
        'worked_on_sale',
        'worked_on_call',
        'attendance',
        'other'
      ),
      allowNull: false,
      field: 'activity_type'
    },
    activityDescription: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'activity_description'
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'ip_address'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'user_agent'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Additional metadata about the activity'
    }
  }, {
    tableName: 'user_activity_logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['activity_type']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['user_id', 'created_at']
      }
    ]
  });

  // Define associations
  UserActivityLog.associate = (models) => {
    UserActivityLog.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
  };

  return UserActivityLog;
};

