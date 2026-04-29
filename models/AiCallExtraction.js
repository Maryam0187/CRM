const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AiCallExtraction = sequelize.define('AiCallExtraction', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    callLogId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'call_log_id',
      references: {
        model: 'call_logs',
        key: 'id'
      }
    },
    promptVersionId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'prompt_version_id',
      references: {
        model: 'ai_prompt_versions',
        key: 'id'
      }
    },
    provider: {
      type: DataTypes.ENUM('dish', 'directv', 'unknown'),
      allowNull: false,
      defaultValue: 'unknown'
    },
    tvOn: {
      type: DataTypes.ENUM('yes', 'no', 'unknown'),
      allowNull: false,
      defaultValue: 'unknown',
      field: 'tv_on'
    },
    receiverId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'receiver_id'
    },
    receiverModel: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'receiver_model'
    },
    tvCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'tv_count'
    },
    accountHolderConfirmed: {
      type: DataTypes.ENUM('yes', 'no', 'unknown'),
      allowNull: false,
      defaultValue: 'unknown',
      field: 'account_holder_confirmed'
    },
    verificationMethod: {
      type: DataTypes.ENUM('name_zip', 'last2phone', 'none'),
      allowNull: false,
      defaultValue: 'none',
      field: 'verification_method'
    },
    callbackWindow: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'callback_window'
    },
    riskFlags: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'risk_flags'
    },
    aiConfidence: {
      type: DataTypes.FLOAT,
      allowNull: true,
      field: 'ai_confidence'
    },
    rawExtractionJson: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'raw_extraction_json'
    }
  }, {
    tableName: 'ai_call_extractions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  AiCallExtraction.associate = (models) => {
    AiCallExtraction.belongsTo(models.CallLog, {
      foreignKey: 'callLogId',
      as: 'callLog'
    });

    AiCallExtraction.belongsTo(models.AiPromptVersion, {
      foreignKey: 'promptVersionId',
      as: 'promptVersion'
    });
  };

  return AiCallExtraction;
};

