const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CallTransfer = sequelize.define('CallTransfer', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    callSid: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'call_sid',
      comment: 'Twilio Call SID of the original call'
    },
    callLogId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'call_log_id',
      references: {
        model: 'call_logs',
        key: 'id'
      }
    },
    fromAgentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'from_agent_id',
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'Agent who initiated the transfer'
    },
    toAgentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'to_agent_id',
      references: {
        model: 'users',
        key: 'id'
      },
      comment: 'Agent receiving the transfer (if transferred to agent)'
    },
    transferTo: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'transfer_to',
      comment: 'Phone number or agent identifier for transfer destination'
    },
    transferType: {
      type: DataTypes.ENUM('blind', 'warm'),
      allowNull: false,
      field: 'transfer_type',
      defaultValue: 'blind',
      comment: 'blind = agent leaves, warm = agent stays in call'
    },
    transferStatus: {
      type: DataTypes.ENUM('initiated', 'in_progress', 'completed', 'failed', 'canceled'),
      allowNull: false,
      field: 'transfer_status',
      defaultValue: 'initiated',
      comment: 'Status of the transfer'
    },
    conferenceSid: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'conference_sid',
      comment: 'Twilio Conference SID (for warm transfers)'
    },
    transferredCallSid: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'transferred_call_sid',
      comment: 'Call SID of the transferred call leg'
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message',
      comment: 'Error message if transfer failed'
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
      comment: 'When the transfer was completed'
    }
  }, {
    tableName: 'call_transfers',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  // Define associations
  CallTransfer.associate = (models) => {
    CallTransfer.belongsTo(models.CallLog, {
      foreignKey: 'callLogId',
      as: 'callLog'
    });
    
    CallTransfer.belongsTo(models.User, {
      foreignKey: 'fromAgentId',
      as: 'fromAgent'
    });
    
    CallTransfer.belongsTo(models.User, {
      foreignKey: 'toAgentId',
      as: 'toAgent'
    });
  };

  return CallTransfer;
};

