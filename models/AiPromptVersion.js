const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AiPromptVersion = sequelize.define('AiPromptVersion', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    versionName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      field: 'version_name'
    },
    promptText: {
      type: DataTypes.TEXT('long'),
      allowNull: false,
      field: 'prompt_text'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_active'
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'created_by',
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'ai_prompt_versions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  AiPromptVersion.associate = (models) => {
    AiPromptVersion.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'creator'
    });

    AiPromptVersion.hasMany(models.AiCallExtraction, {
      foreignKey: 'promptVersionId',
      as: 'extractions'
    });
  };

  return AiPromptVersion;
};

