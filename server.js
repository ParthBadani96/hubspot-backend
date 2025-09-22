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

// Clay enrichment functions
async function enrichWithClay(leadData) {
    // For demo purposes, use mock enrichment to avoid API costs
    if (CLAY_API_KEY === 'demo-mode') {
        return mockClayEnrichment(leadData);
    }

    try {
        // Real Clay API integration (use sparingly on free tier)
        const enrichedData = await callClayAPI(leadData);
        return enrichedData;
    } catch (error) {
        console.error('Clay API failed, using mock data:', error);
        return mockClayEnrichment(leadData);
    }
}

async function callClayAPI(leadData) {
    const enrichmentResults = {};
    
    // Person enrichment
    try {
        const personResponse = await makeRequest('https://api.clay.com/v1/people/search', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CLAY_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: leadData.email,
                first_name: leadData.firstName,
                last_name: leadData.lastName
            })
        });

        if (personResponse.ok) {
            const personData = await personResponse.json();
            if (personData.data && personData.data.length > 0) {
                const person = personData.data[0];
                enrichmentResults.linkedinUrl = person.linkedin_url;
                enrichmentResults.seniority = person.seniority_level;
                enrichmentResults.department = person.department;
            }
        }
    } catch (error) {
        console.log('Person enrichment failed:', error.message);
    }

    return { ...leadData, ...enrichmentResults };
}

function mockClayEnrichment(leadData) {
    const mockData = { ...leadData };
    
    // Mock person enrichment
    const firstNameLower = leadData.firstName.toLowerCase();
    const lastNameLower = leadData.lastName.toLowerCase();
    
    mockData.linkedinUrl = `https://linkedin.com/in/${firstNameLower}-${lastNameLower}-${Math.random().toString(36).substr(2, 6)}`;
    mockData.seniority = determineSeniority(leadData.jobTitle);
    mockData.department = determineDepartment(leadData.jobTitle);
    mockData.experience_years = Math.floor(Math.random() * 15) + 3;
    
    // Mock company enrichment based on industry
    const companyData = generateCompanyData(leadData.industry, leadData.companySize);
    Object.assign(mockData, companyData);
    
    // Add enrichment metadata
    mockData.enrichmentSource = 'Clay (Simulated)';
    mockData.enrichmentTimestamp = new Date().toISOString();
    mockData.dataQuality = Math.random() > 0.2 ? 'High' : 'Medium';
    
    console.log('Clay enrichment completed:', mockData.firstName, mockData.lastName);
    return mockData;
}

function determineSeniority(jobTitle) {
    const title = (jobTitle || '').toLowerCase();
    if (title.includes('ceo') || title.includes('founder') || title.includes('president')) return 'C-Level';
    if (title.includes('cfo') || title.includes('cto') || title.includes('cmo')) return 'C-Level';
    if (title.includes('vp') || title.includes('vice president')) return 'VP';
    if (title.includes('director') || title.includes('head of')) return 'Director';
    if (title.includes('manager') || title.includes('lead')) return 'Manager';
    if (title.includes('senior')) return 'Senior IC';
    return 'Individual Contributor';
}

function determineDepartment(jobTitle) {
    const title = (jobTitle || '').toLowerCase();
    if (title.includes('finance') || title.includes('cfo') || title.includes('accounting')) return 'Finance';
    if (title.includes('engineer') || title.includes('tech') || title.includes('cto') || title.includes('developer')) return 'Engineering';
    if (title.includes('sales') || title.includes('revenue') || title.includes('account')) return 'Sales';
    if (title.includes('marketing') || title.includes('cmo') || title.includes('growth')) return 'Marketing';
    if (title.includes('operations') || title.includes('coo') || title.includes('ops')) return 'Operations';
    if (title.includes('product') || title.includes('pm')) return 'Product';
    return 'Other';
}

function generateCompanyData(industry, companySize) {
    const data = {};
    
    // Revenue estimates based on size and industry
    const revenueMultipliers = {
        'fintech': 1.5,
        'finance': 2.0,
        'technology': 1.3,
        'healthcare': 1.4,
        'manufacturing': 1.0,
        'retail': 0.8
    };
    
    const baseRevenues = {
        '1-10': [0.5, 2],
        '11-50': [2, 10],
        '51-200': [10, 50],
        '201-1000': [50, 200],
        '1000+': [200, 1000]
    };
    
    const multiplier = revenueMultipliers[industry] || 1.0;
    const baseRange = baseRevenues[companySize] || [1, 5];
    const estimatedRevenue = Math.floor((Math.random() * (baseRange[1] - baseRange[0]) + baseRange[0]) * multiplier);
    
    data.companyRevenue = `$${estimatedRevenue}M`;
    data.companyFunding = Math.random() > 0.6 ? `$${Math.floor(Math.random() * 100) + 10}M` : 'Bootstrapped';
    data.companyGrowthRate = `${Math.floor(Math.random() * 50) + 10}%`;
    data.employeeCount = generateEmployeeCount(companySize);
    
    // Technology stack based on industry
    const techStacks = {
        'fintech': ['Stripe', 'Plaid', 'AWS', 'React', 'Python', 'Kubernetes'],
        'finance': ['Salesforce', 'Oracle', 'SAP', 'Microsoft Azure', 'Java'],
        'technology': ['AWS', 'Docker', 'React', 'Node.js', 'Python', 'PostgreSQL'],
        'healthcare': ['Epic', 'AWS', 'HIPAA Tools', 'React', 'Python'],
        'manufacturing': ['SAP', 'Oracle', 'Microsoft', 'Industrial IoT'],
        'retail': ['Shopify', 'Magento', 'Google Analytics', 'AWS', 'React']
    };
    
    data.technologies = (techStacks[industry] || ['Microsoft Office', 'Google Workspace']).slice(0, Math.floor(Math.random() * 4) + 2);
    
    return data;
}

function generateEmployeeCount(companySize) {
    const ranges = {
        '1-10': [1, 10],
        '11-50': [11, 50],
        '51-200': [51, 200],
        '201-1000': [201, 1000],
        '1000+': [1000, 5000]
    };
    
    const range = ranges[companySize] || [10, 50];
    return Math.floor(Math.random() * (range[1] - range[0]) + range[0]);
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


