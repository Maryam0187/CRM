const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserDailyTimeLog = sequelize.define('UserDailyTimeLog', {
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
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    activeTimeSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'active_time_seconds'
    },
    inactiveTimeSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'inactive_time_seconds'
    },
    firstActiveTime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'first_active_time'
    },
    lastActiveTime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_active_time'
    },
    loginCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'login_count'
    }
  }, {
    tableName: 'user_daily_time_logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'date'],
        name: 'unique_user_daily_time'
      }
    ]
  });

  // Define associations
  UserDailyTimeLog.associate = (models) => {
    UserDailyTimeLog.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
  };

  return UserDailyTimeLog;
};

