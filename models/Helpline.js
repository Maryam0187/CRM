const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Helpline = sequelize.define('Helpline', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      field: 'user_id'
    },
    phoneNumber: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'phone_number'
    },
    label: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active'
    }
  }, {
    tableName: 'helplines',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'phone_number'],
        where: {
          is_active: true
        }
      }
    ]
  });

  // Associate with User
  Helpline.associate = (models) => {
    Helpline.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
  };

  return Helpline;
};

