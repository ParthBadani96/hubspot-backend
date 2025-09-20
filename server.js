// server.js - Fixed Node.js backend for HubSpot integration
const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

const HUBSPOT_API_TOKEN = 'pat-na2-cbba02fc-2cb4-45c0-bff2-c865d65201d4';
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

app.use(cors());
app.use(express.json());

function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const requestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = https.request(requestOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const response = {
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        json: () => Promise.resolve(JSON.parse(data)),
                        text: () => Promise.resolve(data)
                    };
                    resolve(response);
                } catch (error) {
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (options.body) {
            req.write(options.body);
        }

        req.end();
    });
}

app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'HubSpot API proxy is running' });
});

app.get('/', (req, res) => {
    res.json({ message: 'HubSpot Backend API is running!' });
});

app.post('/api/hubspot/contacts', async (req, res) => {
    try {
        console.log('Received contact data:', req.body);
        
        const { leadData } = req.body;
        
        const contactProperties = {
            firstname: leadData.firstName,
            lastname: leadData.lastName,
            email: leadData.email,
            company: leadData.company,
            jobtitle: leadData.jobTitle,
            hs_lead_status: leadData.qualified ? 'QUALIFIED_TO_BUY' : 'NEW',
            industry: leadData.industry || '',
            numberofemployees: leadData.companySize || '',
            lead_score: leadData.score ? leadData.score.toString() : '0'
        };

        console.log('Sending to HubSpot:', contactProperties);

        const response = await makeRequest(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts`, {
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
            throw new Error(`HubSpot API error: ${response.status}`);
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

app.listen(PORT, () => {
    console.log(`HubSpot API proxy server running on port ${PORT}`);
});

module.exports = app;

