const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Log = sequelize.define('Log', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    level: {
      type: DataTypes.ENUM('info', 'warn', 'error', 'debug'),
      allowNull: false,
      defaultValue: 'info',
      comment: 'Log level'
    },
    source: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Source of the log (e.g., call-status-callback, CallContext)'
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Action being logged (e.g., START_CALL, UPDATE_STATUS)'
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Log message'
    },
    data: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Additional log data (JSON)'
    },
    callSid: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'call_sid',
      comment: 'Associated call SID if applicable'
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'Associated user ID if applicable'
    },
    processingTime: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'processing_time',
      comment: 'Processing time in milliseconds'
    }
  }, {
    tableName: 'logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['level'] },
      { fields: ['source'] },
      { fields: ['call_sid'] },
      { fields: ['user_id'] },
      { fields: ['created_at'] }
    ]
  });

  // Define associations
  Log.associate = (models) => {
    Log.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
  };

  return Log;
};

