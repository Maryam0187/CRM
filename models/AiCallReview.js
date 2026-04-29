const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AiCallReview = sequelize.define('AiCallReview', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    callLogId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      field: 'call_log_id',
      references: {
        model: 'call_logs',
        key: 'id'
      }
    },
    reviewStatus: {
      type: DataTypes.ENUM('pending', 'approved', 'corrected', 'rejected'),
      allowNull: false,
      defaultValue: 'pending',
      field: 'review_status'
    },
    originalAiOutcome: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'original_ai_outcome'
    },
    finalOutcome: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'final_outcome'
    },
    provider: {
      type: DataTypes.ENUM('dish', 'directv', 'unknown'),
      allowNull: false,
      defaultValue: 'unknown'
    },
    qualityScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'quality_score'
    },
    complianceIssue: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'compliance_issue'
    },
    complianceNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'compliance_notes'
    },
    reviewNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'review_notes'
    },
    reviewedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'reviewed_by',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reviewed_at'
    }
  }, {
    tableName: 'ai_call_reviews',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  AiCallReview.associate = (models) => {
    AiCallReview.belongsTo(models.CallLog, {
      foreignKey: 'callLogId',
      as: 'callLog'
    });

    AiCallReview.belongsTo(models.User, {
      foreignKey: 'reviewedBy',
      as: 'reviewer'
    });
  };

  return AiCallReview;
};

