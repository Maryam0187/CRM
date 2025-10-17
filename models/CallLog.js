const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CallLog = sequelize.define('CallLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    callSid: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'call_sid',
      comment: 'Twilio Call SID'
    },
    customerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'customer_id',
      references: {
        model: 'customers',
        key: 'id'
      }
    },
    saleId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'sale_id',
      references: {
        model: 'sales',
        key: 'id'
      }
    },
    agentId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'agent_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    direction: {
      type: DataTypes.ENUM('inbound', 'outbound'),
      allowNull: false,
      defaultValue: 'outbound'
    },
    fromNumber: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'from_number'
    },
    toNumber: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'to_number'
    },
    status: {
      type: DataTypes.ENUM('queued', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled'),
      allowNull: false,
      defaultValue: 'queued'
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Call duration in seconds'
    },
    recordingUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'recording_url'
    },
    recordingDuration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'recording_duration'
    },
    recordingSid: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'recording_sid'
    },
    transcriptionText: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'transcription_text'
    },
    transcriptionSid: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'transcription_sid'
    },
    callNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'call_notes'
    },
    callPurpose: {
      type: DataTypes.ENUM('follow_up', 'cold_call', 'support', 'sales', 'appointment', 'other'),
      allowNull: true,
      defaultValue: 'follow_up',
      field: 'call_purpose'
    },
    twilioData: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'twilio_data'
    }
  }, {
    tableName: 'call_logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  // Define associations
  CallLog.associate = (models) => {
    CallLog.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'customer'
    });
    
    CallLog.belongsTo(models.Sale, {
      foreignKey: 'saleId',
      as: 'sale'
    });
    
    CallLog.belongsTo(models.User, {
      foreignKey: 'agentId',
      as: 'agent'
    });
  };

  return CallLog;
};

