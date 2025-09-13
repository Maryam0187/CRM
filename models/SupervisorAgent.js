const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SupervisorAgent = sequelize.define('SupervisorAgent', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    supervisorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'supervisor_id',
      references: {
        model: 'users',
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
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'assigned_at',
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'supervisor_agents',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        unique: true,
        fields: ['supervisor_id', 'agent_id']
      },
      {
        fields: ['supervisor_id']
      },
      {
        fields: ['agent_id']
      }
    ]
  });

  SupervisorAgent.associate = (models) => {
    // SupervisorAgent belongs to a supervisor (User)
    SupervisorAgent.belongsTo(models.User, {
      foreignKey: 'supervisorId',
      as: 'supervisor'
    });

    // SupervisorAgent belongs to an agent (User)
    SupervisorAgent.belongsTo(models.User, {
      foreignKey: 'agentId',
      as: 'agent'
    });
  };

  return SupervisorAgent;
};
