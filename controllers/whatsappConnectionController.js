// controllers/whatsappConnectionController.js
const WhatsappConnection = require('../models/WhatsappConnection');
const User = require('../models/User');

// Get active WhatsApp connection for client
exports.getClientConnection = async (req, res) => {
  try {
    const clientId = req.user.client_id;
    
    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: 'Client ID not found'
      });
    }

    const connection = await WhatsappConnection.findOne({
      client_id: clientId,
      is_active: true
    }).populate('connected_by', 'name email');

    res.status(200).json({
      success: true,
      connection: connection || null
    });
  } catch (error) {
    console.error('Error fetching WhatsApp connection:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch WhatsApp connection',
      error: error.message
    });
  }
};

// Create or update WhatsApp connection
exports.createConnection = async (req, res) => {
  try {
    const { phoneNumber, connectionData } = req.body;
    const clientId = req.user.client_id;
    const userId = req.user.id;

    if (!clientId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Client or user not found'
      });
    }

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Check if user has permission (client admin or boss)
    const user = await User.findById(userId);
    if (!user || user.client_id.toString() !== clientId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have permission to manage WhatsApp connections.'
      });
    }

    // Check if user is admin or has permission
    if (!user.can_manage_whatsapp && user.role !== 'client_admin' && user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions. Only client admins can manage WhatsApp connections.'
      });
    }

    // Deactivate any existing connection
    await WhatsappConnection.updateMany(
      { client_id: clientId, is_active: true },
      { is_active: false, updatedAt: new Date() }
    );

    // Create new connection
    const newConnection = new WhatsappConnection({
      client_id: clientId,
      phone_number: phoneNumber,
      connected_by: userId,
      connected_by_name: user.name,
      connection_data: connectionData || {},
      is_active: true,
      shared_with_users: [userId] // Include the creator
    });

    await newConnection.save();

    // Populate the created connection
    const populatedConnection = await WhatsappConnection.findById(newConnection._id)
      .populate('connected_by', 'name email');

    res.status(201).json({
      success: true,
      message: 'WhatsApp connection created successfully',
      connection: populatedConnection
    });
  } catch (error) {
    console.error('Error creating WhatsApp connection:', error);
    
    // Handle duplicate key error (unique index violation)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'An active WhatsApp connection already exists for this client'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create WhatsApp connection',
      error: error.message
    });
  }
};

// Delete (deactivate) WhatsApp connection
exports.deleteConnection = async (req, res) => {
  try {
    const clientId = req.user.client_id;
    const userId = req.user.id;

    if (!clientId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Client or user not found'
      });
    }

    // Check permissions
    const user = await User.findById(userId);
    if (!user || user.client_id.toString() !== clientId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (!user.can_manage_whatsapp && user.role !== 'client_admin' && user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions. Only client admins can delete WhatsApp connections.'
      });
    }

    // Deactivate the connection (soft delete)
    const result = await WhatsappConnection.updateMany(
      { client_id: clientId, is_active: true },
      { 
        is_active: false, 
        updatedAt: new Date(),
        deactivated_by: userId,
        deactivated_at: new Date()
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active WhatsApp connection found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'WhatsApp connection deactivated successfully'
    });
  } catch (error) {
    console.error('Error deleting WhatsApp connection:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete WhatsApp connection',
      error: error.message
    });
  }
};

// Get connection history for client (admin only)
exports.getConnectionHistory = async (req, res) => {
  try {
    const clientId = req.user.client_id;
    const userId = req.user.id;

    if (!clientId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Client or user not found'
      });
    }

    // Check permissions
    const user = await User.findById(userId);
    if (!user.can_manage_whatsapp && user.role !== 'client_admin' && user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    const connections = await WhatsappConnection.find({
      client_id: clientId
    })
    .populate('connected_by', 'name email')
    .populate('deactivated_by', 'name email')
    .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      connections,
      count: connections.length
    });
  } catch (error) {
    console.error('Error fetching connection history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch connection history',
      error: error.message
    });
  }
};

// Check if client has active connection
exports.checkConnectionStatus = async (req, res) => {
  try {
    const clientId = req.user.client_id;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: 'Client ID not found'
      });
    }

    const connection = await WhatsappConnection.findOne({
      client_id: clientId,
      is_active: true
    });

    const hasActiveConnection = !!connection;

    res.status(200).json({
      success: true,
      hasActiveConnection,
      connection: connection || null,
      message: hasActiveConnection ? 
        'Active WhatsApp connection found' : 
        'No active WhatsApp connection'
    });
  } catch (error) {
    console.error('Error checking connection status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check connection status',
      error: error.message
    });
  }
};