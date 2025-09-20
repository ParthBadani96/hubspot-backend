// server.js - Node.js backend for HubSpot integration
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// HubSpot configuration
const HUBSPOT_API_TOKEN = 'pat-na2-d8208ca5-8ed4-4363-a3f4-db03a84dcf94';
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// Middleware
app.use(cors({
    origin: ['https://parthbadani96.github.io', 'http://localhost:3000', 'https://localhost:3000'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'HubSpot API proxy is running' });
});

// Create HubSpot contact endpoint
app.post('/api/hubspot/contacts', async (req, res) => {
    try {
        console.log('Received contact data:', req.body);
        
        const { leadData } = req.body;
        
        // Prepare HubSpot contact properties
        const contactProperties = {
            firstname: leadData.firstName,
            lastname: leadData.lastName,
            email: leadData.email,
            company: leadData.company,
            jobtitle: leadData.jobTitle,
            hs_lead_status: leadData.qualified ? 'QUALIFIED_TO_BUY' : 'NEW',
            industry: leadData.industry || '',
            numberofemployees: leadData.companySize || '',
            // Custom properties
            lead_score: leadData.score ? leadData.score.toString() : '0',
            behavioral_data: JSON.stringify(leadData.sessionData || {}),
            estimated_revenue: leadData.estimatedRevenue || '',
            tech_stack: leadData.technographics ? leadData.technographics.join(', ') : ''
        };

        console.log('Sending to HubSpot:', contactProperties);

        // Make API call to HubSpot
        const response = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${HUBSPOT_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                properties: contactProperties
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('HubSpot API error:', response.status, errorData);
            throw new Error(`HubSpot API error: ${response.status} - ${errorData}`);
        }

        const result = await response.json();
        console.log('HubSpot success:', result);

        res.json({
            success: true,
            contact: result,
            message: 'Contact created successfully in HubSpot'
        });

    } catch (error) {
        console.error('Backend error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to create contact in HubSpot'
        });
    }
});

// Update contact endpoint
app.patch('/api/hubspot/contacts/:contactId', async (req, res) => {
    try {
        const { contactId } = req.params;
        const { properties } = req.body;

        const response = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/${contactId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${HUBSPOT_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                properties: properties
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`HubSpot API error: ${response.status} - ${errorData}`);
        }

        const result = await response.json();
        
        res.json({
            success: true,
            contact: result,
            message: 'Contact updated successfully'
        });

    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to update contact'
        });
    }
});

// Get contacts endpoint (for dashboard)
app.get('/api/hubspot/contacts', async (req, res) => {
    try {
        const response = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts?limit=10&properties=firstname,lastname,email,company,lead_score,hs_lead_status`, {
            headers: {
                'Authorization': `Bearer ${HUBSPOT_API_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HubSpot API error: ${response.status}`);
        }

        const result = await response.json();
        
        res.json({
            success: true,
            contacts: result.results,
            message: 'Contacts retrieved successfully'
        });

    } catch (error) {
        console.error('Get contacts error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to retrieve contacts'
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 HubSpot API proxy server running on port ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`📋 Contacts endpoint: POST /api/hubspot/contacts`);
});


module.exports = app;
