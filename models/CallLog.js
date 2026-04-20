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
    customerName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'customer_name',
      comment: 'Customer name when customerId is null (e.g. quick dial)'
    },
    state: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    zipcode: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('initiated', 'queued', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled', 'voicemail'),
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
    recordings: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Array of recordings: [{ recordingSid, recordingUrl, recordingDuration, createdAt }]'
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
    callOutcome: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'call_outcome',
      comment: 'Agent-selected post-call outcome'
    },
    callPurpose: {
      type: DataTypes.ENUM('follow_up', 'cold_call', 'support', 'sales', 'appointment', 'other', 'ivr_dialer'),
      allowNull: true,
      defaultValue: 'follow_up',
      field: 'call_purpose'
    },
    callSource: {
      type: DataTypes.ENUM('lead_dialing', 'quick_dialing', 'call_history', 'sale_page', 'ivr_dialer', 'other'),
      allowNull: true,
      field: 'call_source',
      comment: 'Where the call was initiated from'
    },
    twilioData: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'twilio_data'
    },
    conferenceName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'conference_name',
      comment: 'Conference name (e.g., call-{agentId})'
    },
    conferenceSid: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'conference_sid',
      comment: 'Twilio Conference SID (CF...)'
    },
    customerCallSid: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'customer_call_sid',
      comment: 'Twilio CallSid for customer PSTN leg (CA...)'
    },
    agentCallSid: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'agent_call_sid',
      comment: 'Twilio CallSid for agent Voice SDK leg (CA...)'
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

