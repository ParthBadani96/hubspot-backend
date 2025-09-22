// server.js - Fixed Node.js backend for HubSpot integration with Slack notifications
const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const HUBSPOT_API_TOKEN = process.env.HUBSPOT_API_TOKEN || 'fallback-token';
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK';
const CLAY_API_KEY = process.env.CLAY_API_KEY || 'demo-mode';

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

// Slack notification function
async function sendSlackNotification(leadData) {
    try {
        if (leadData.score >= 80) {
            const slackMessage = {
                text: `🔥 *Hot Lead Alert!*`,
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `🔥 *Hot Lead Alert!*\n\n*Name:* ${leadData.firstName} ${leadData.lastName}\n*Company:* ${leadData.company}\n*Title:* ${leadData.jobTitle}\n*Industry:* ${leadData.industry}\n*Score:* ${leadData.score}/100\n*Email:* ${leadData.email}`
                        }
                    }
                ]
            };

            const response = await makeRequest(SLACK_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(slackMessage)
            });

            if (response.ok) {
                console.log('Slack notification sent successfully');
                return true;
            } else {
                console.error('Failed to send Slack notification:', response.status);
                return false;
            }
        }
    } catch (error) {
        console.error('Slack notification error:', error);
        return false;
    }
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
            hs_lead_status: 'NEW',
            industry: leadData.industry || ''
        };

        console.log('Sending to HubSpot:', contactProperties);
        
        // Create contact in HubSpot
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

        // Send Slack notification for high-score leads
        const slackSent = await sendSlackNotification(leadData);
        
        res.json({
            success: true,
            contact: result,
            slackNotified: slackSent,
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

