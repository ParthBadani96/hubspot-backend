// server.js - Complete GTM Backend with All Integrations
require('dotenv').config();
const snowflake = require('./snowflake-integration');
const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration - Environment Variables
const HUBSPOT_API_TOKEN = process.env.HUBSPOT_API_TOKEN || 'demo-mode';
const HUBSPOT_BASE_URL = 'https://api.hubapi.com';
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || 'https://hooks.slack.com/demo';
const CLAY_API_KEY = process.env.CLAY_API_KEY || 'demo-mode';
const ASANA_ACCESS_TOKEN = process.env.ASANA_ACCESS_TOKEN || 'demo-mode';
const ZENDESK_DOMAIN = process.env.ZENDESK_DOMAIN || 'demo';
const ZENDESK_TOKEN = process.env.ZENDESK_TOKEN || 'demo-mode';
const ZENDESK_EMAIL = process.env.ZENDESK_EMAIL || 'demo@example.com';
const DEALHUB_API_KEY = process.env.DEALHUB_API_KEY || 'demo-mode';

app.use(cors());
app.use(express.json());

// Utility function for HTTP requests
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

// =============================================================================
// CLAY ENRICHMENT ENGINE
// =============================================================================

async function enrichWithClay(leadData) {
    console.log('Starting Clay enrichment for:', leadData.firstName, leadData.lastName);
    
    if (CLAY_API_KEY === 'demo-mode') {
        return mockClayEnrichment(leadData);
    }

    try {
        const enrichedData = await callClayAPI(leadData);
        return enrichedData;
    } catch (error) {
        console.error('Clay API failed, using mock data:', error);
        return mockClayEnrichment(leadData);
    }
}

async function callClayAPI(leadData) {
    console.log('Making Clay API call for:', leadData.firstName, leadData.lastName);

    const enrichmentResults = {};

    try {
        const requestBody = {
            input: {
                email: leadData.email,
                first_name: leadData.firstName,
                last_name: leadData.lastName,
                company: leadData.company
            }
        };

        const personResponse = await makeRequest('https://api.clay.com/v1/data/enrich/person', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CLAY_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (personResponse.ok) {
            const personData = await personResponse.json();
            if (personData && personData.data) {
                const person = personData.data;
                enrichmentResults.linkedinUrl = person.linkedin_url || person.linkedin;
                enrichmentResults.seniority = person.seniority_level || person.seniority;
                enrichmentResults.department = person.department;
                enrichmentResults.experience_years = person.years_experience;
                enrichmentResults.companyRevenue = person.company_revenue;
                enrichmentResults.technologies = person.technologies || [];
            }
        } else {
            await tryCompanyEnrichment(leadData, enrichmentResults);
        }
    } catch (error) {
        console.error('Clay API request failed:', error.message);
    }

    return { ...leadData, ...enrichmentResults };
}

async function tryCompanyEnrichment(leadData, enrichmentResults) {
    try {
        const companyResponse = await makeRequest('https://api.clay.com/v1/data/enrich/company', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CLAY_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: {
                    company_name: leadData.company,
                    domain: leadData.email.split('@')[1]
                }
            })
        });

        if (companyResponse.ok) {
            const companyData = await companyResponse.json();
            if (companyData && companyData.data) {
                enrichmentResults.companyRevenue = companyData.data.revenue;
                enrichmentResults.technologies = companyData.data.tech_stack || [];
                enrichmentResults.companyFunding = companyData.data.funding;
            }
        }
    } catch (error) {
        console.log('Company enrichment failed:', error.message);
    }
}

function mockClayEnrichment(leadData) {
    console.log('Using mock Clay enrichment for:', leadData.firstName, leadData.lastName);

    const mockData = { ...leadData };
    const firstNameLower = leadData.firstName.toLowerCase();
    const lastNameLower = leadData.lastName.toLowerCase();

    // Mock person enrichment
    mockData.linkedinUrl = `https://linkedin.com/in/${firstNameLower}-${lastNameLower}-${Math.random().toString(36).substr(2, 6)}`;
    mockData.seniority = determineSeniority(leadData.jobTitle);
    mockData.department = determineDepartment(leadData.jobTitle);
    mockData.experience_years = Math.floor(Math.random() * 15) + 3;

    // Mock company enrichment
    const companyData = generateCompanyData(leadData.industry, leadData.companySize);
    Object.assign(mockData, companyData);

    // Enrichment metadata
    mockData.enrichmentSource = 'Clay (Simulated)';
    mockData.enrichmentTimestamp = new Date().toISOString();
    mockData.dataQuality = Math.random() > 0.2 ? 'High' : 'Medium';

    console.log('Clay enrichment completed for:', mockData.firstName, mockData.lastName);
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

    const techStacks = {
        'fintech': ['Stripe', 'Plaid', 'AWS', 'React', 'Python', 'Kubernetes'],
        'finance': ['Salesforce', 'Oracle', 'SAP', 'Microsoft Azure', 'Java'],
        'technology': ['AWS', 'Docker', 'React', 'Node.js', 'Python', 'PostgreSQL'],
        'healthcare': ['Epic', 'AWS', 'HIPAA Tools', 'React', 'Python'],
        'manufacturing': ['SAP', 'Oracle', 'Microsoft', 'Industrial IoT'],
        'retail': ['Shopify', 'Magento', 'Google Analytics', 'AWS', 'React']
    };

    data.technologies = (techStacks[industry] || ['Microsoft Office', 'Google Workspace'])
        .slice(0, Math.floor(Math.random() * 4) + 2);

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

// =============================================================================
// HUBSPOT CRM INTEGRATION
// =============================================================================

async function createHubSpotContact(enrichedLead) {
    console.log('Creating HubSpot contact for:', enrichedLead.firstName, enrichedLead.lastName);

    if (HUBSPOT_API_TOKEN === 'demo-mode') {
        console.log('Demo mode: Simulating HubSpot contact creation');
        return {
            id: 'demo-contact-' + Date.now(),
            properties: generateHubSpotProperties(enrichedLead)
        };
    }

    const contactProperties = generateHubSpotProperties(enrichedLead);

    try {
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

        if (response.ok) {
            const result = await response.json();
            console.log('HubSpot contact created successfully:', result.id);

            // Create deal if qualified
            if (enrichedLead.score >= 60) {
                await createHubSpotDeal(enrichedLead, result.id);
            }

            return result;
        } else {
            const errorData = await response.text();
            if (response.status === 409) {
                console.log('Contact already exists in HubSpot');
                return {
                    id: 'existing-contact-' + Date.now(),
                    properties: contactProperties,
                    exists: true
                };
            } else {
                throw new Error(`HubSpot API error: ${response.status} - ${errorData}`);
            }
        }
    } catch (error) {
        console.error('HubSpot contact creation failed:', error);
        throw error;
    }
}

function mapCompanySizeToHubSpot(size) {
    const mapping = {
        '1-10': '1-5',
        '11-50': '25-50',
        '51-200': '100-500',
        '201-1000': '500-1000',
        '1000+': '1000+'
    };
    return mapping[size] || '1-5';
}

function generateHubSpotProperties(enrichedLead) {
    // Map custom status to valid HubSpot status
    let hubspotStatus = 'NEW';
    if (enrichedLead.status === 'Hot Lead') hubspotStatus = 'OPEN';
    else if (enrichedLead.status === 'Qualified') hubspotStatus = 'OPEN';
    else if (enrichedLead.status === 'Warm') hubspotStatus = 'IN_PROGRESS';
    
    return {
        firstname: enrichedLead.firstName,
        lastname: enrichedLead.lastName,
        email: enrichedLead.email,
        company: enrichedLead.company,
        jobtitle: enrichedLead.jobTitle,
        website: enrichedLead.company ? `https://${enrichedLead.company.toLowerCase().replace(/\s+/g, '')}.com` : '',
        phone: generateMockPhone(),
        
        // Custom GTM properties (that you created)
        lead_score_ml: enrichedLead.score || 0,
        territory_assignment: enrichedLead.territory || 'SMB Team',
        forecasted_deal_value: enrichedLead.forecastedDealValue || 0,
        ab_test_variant: enrichedLead.abVariant || 'A',
        
        // Clay enrichment data
        clay_enrichment_status: 'enriched',
        linkedin_url: enrichedLead.linkedinUrl || '',
        seniority_level: enrichedLead.seniority || '',
        department: enrichedLead.department || '',
        company_revenue: enrichedLead.companyRevenue || '',
        technologies: enrichedLead.technologies ? enrichedLead.technologies.join(', ') : '',
        
        // Behavioral data (you created these)
        form_interactions: enrichedLead.sessionData?.formInteractions || 0,
        
        // Use valid HubSpot status
        hs_lead_status: hubspotStatus,
        
        // Standard HubSpot properties
        industry: enrichedLead.industry || '',
        numemployees: mapCompanySizeToHubSpot(enrichedLead.companySize)
    };
}

function generateMockPhone() {
    const areaCode = Math.floor(Math.random() * 900) + 100;
    const exchange = Math.floor(Math.random() * 900) + 100;
    const number = Math.floor(Math.random() * 9000) + 1000;
    return `+1-${areaCode}-${exchange}-${number}`;
}

async function createHubSpotDeal(enrichedLead, contactId) {
    console.log('Creating HubSpot deal for qualified lead:', enrichedLead.firstName);
    
    if (HUBSPOT_API_TOKEN === 'demo-mode') {
        console.log('Demo mode: Simulating deal creation');
        return { id: 'demo-deal-' + Date.now() };
    }

    const dealProperties = {
        dealname: `${enrichedLead.company} - Working Capital Solution`,
        amount: enrichedLead.forecastedDealValue || 50000,
        dealstage: getDealStage(enrichedLead.score),
        pipeline: 'default',
        closedate: getCloseDate(enrichedLead.score),
        deal_source: 'Inbound Lead',
        deal_type: 'New Business',
        
        // Custom deal properties
        lead_score: enrichedLead.score,
        territory: enrichedLead.territory || 'SMB',
        industry_vertical: enrichedLead.industry,
        company_size_category: enrichedLead.companySize
    };

    try {
        const response = await makeRequest(`${HUBSPOT_BASE_URL}/crm/v3/objects/deals`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${HUBSPOT_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                properties: dealProperties,
                associations: [
                    {
                        to: { id: contactId },
                        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }]
                    }
                ]
            })
        });

        if (response.ok) {
            const deal = await response.json();
            console.log('Deal created successfully:', deal.id);
            return deal;
        } else {
            const errorData = await response.text();
            console.error('Deal creation failed:', errorData);
        }
    } catch (error) {
        console.error('Deal creation error:', error);
    }
}

function getDealStage(score) {
    if (score >= 80) return 'qualifiedtobuy'; // High-intent stage
    if (score >= 60) return 'appointmentscheduled'; // Qualified stage
    return 'leadinqualification'; // Initial stage
}

function getCloseDate(score) {
    const baseDate = new Date();
    let daysToAdd = 90; // Default 90 days
    
    if (score >= 80) daysToAdd = 30; // Hot leads close faster
    else if (score >= 60) daysToAdd = 60; // Qualified leads
    
    baseDate.setDate(baseDate.getDate() + daysToAdd);
    return baseDate.toISOString().split('T')[0];
}

// =============================================================================
// SLACK NOTIFICATION SYSTEM
// =============================================================================

async function sendSlackNotification(leadData) {
    console.log('Sending Slack notification for:', leadData.firstName, leadData.lastName);

    if (SLACK_WEBHOOK_URL === 'https://hooks.slack.com/demo') {
        console.log('Demo mode: Simulating Slack notification');
        return true;
    }

    try {
        if (leadData.score >= 70) { // Send notifications for high-value leads
            const urgencyLevel = leadData.score >= 80 ? 'HIGH PRIORITY' : 'QUALIFIED';
            const emoji = leadData.score >= 80 ? '🚨' : '⭐';
            
            const slackMessage = {
                text: `${emoji} ${urgencyLevel} Lead Alert!`,
                blocks: [
                    {
                        type: "header",
                        text: {
                            type: "plain_text",
                            text: `${emoji} ${urgencyLevel} Lead Alert!`
                        }
                    },
                    {
                        type: "section",
                        fields: [
                            {
                                type: "mrkdwn",
                                text: `*Name:* ${leadData.firstName} ${leadData.lastName}`
                            },
                            {
                                type: "mrkdwn",
                                text: `*Company:* ${leadData.company}`
                            },
                            {
                                type: "mrkdwn",
                                text: `*Title:* ${leadData.jobTitle}`
                            },
                            {
                                type: "mrkdwn",
                                text: `*Industry:* ${leadData.industry}`
                            },
                            {
                                type: "mrkdwn",
                                text: `*Score:* ${leadData.score}/100`
                            },
                            {
                                type: "mrkdwn",
                                text: `*Territory:* ${leadData.territory || 'Auto-Assigned'}`
                            },
                            {
                                type: "mrkdwn",
                                text: `*Deal Value:* ${((leadData.forecastedDealValue || 0) / 1000).toFixed(0)}K`
                            },
                            {
                                type: "mrkdwn",
                                text: `*Email:* ${leadData.email}`
                            }
                        ]
                    },
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `*Enrichment Data:*\n• Seniority: ${leadData.seniority || 'Unknown'}\n• Department: ${leadData.department || 'Unknown'}\n• LinkedIn: ${leadData.linkedinUrl ? 'Available' : 'Not found'}`
                        }
                    },
                    {
                        type: "actions",
                        elements: [
                            {
                                type: "button",
                                text: {
                                    type: "plain_text",
                                    text: "View in HubSpot"
                                },
                                url: `https://app.hubspot.com/contacts/your-portal/contact/${leadData.hubspotContactId}`,
                                style: "primary"
                            },
                            {
                                type: "button",
                                text: {
                                    type: "plain_text",
                                    text: "Schedule Call"
                                },
                                url: "https://calendly.com/your-team"
                            }
                        ]
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
                console.error('Slack notification failed:', response.status);
                return false;
            }
        }
    } catch (error) {
        console.error('Slack notification error:', error);
        return false;
    }
}

// =============================================================================
// ASANA TASK MANAGEMENT
// =============================================================================

async function createAsanaTask(leadData) {
    console.log('Creating Asana task for:', leadData.firstName, leadData.lastName);

    if (ASANA_ACCESS_TOKEN === 'demo-mode') {
        console.log('Demo mode: Simulating Asana task creation');
        return { gid: 'demo-task-' + Date.now() };
    }

    const taskData = {
        data: {
            name: `Follow up with ${leadData.firstName} ${leadData.lastName} - ${leadData.company}`,
            notes: `
Lead Score: ${leadData.score}/100
Company: ${leadData.company}
Industry: ${leadData.industry}
Territory: ${leadData.territory || 'Auto-Assigned'}
Email: ${leadData.email}
Phone: ${leadData.phone || 'Not provided'}

Enrichment Data:
- Seniority: ${leadData.seniority || 'Unknown'}
- Department: ${leadData.department || 'Unknown'}
- LinkedIn: ${leadData.linkedinUrl || 'Not found'}
- Company Revenue: ${leadData.companyRevenue || 'Unknown'}

Next Steps:
${leadData.score >= 80 ? '• Call within 2 hours\n• Send executive briefing' : 
  leadData.score >= 60 ? '• Call within 24 hours\n• Send product demo' : 
  '• Add to nurture sequence\n• Schedule follow-up call'}
            `,
            due_on: getTaskDueDate(leadData.score),
            projects: [getAsanaProjectId(leadData.territory)],
            assignee: getAssigneeId(leadData.territory),
            priority: leadData.score >= 80 ? 'urgent' : leadData.score >= 60 ? 'high' : 'medium'
        }
    };

    try {
        const response = await makeRequest('https://app.asana.com/api/1.0/tasks', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ASANA_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(taskData)
        });

        if (response.ok) {
            const task = await response.json();
            console.log('Asana task created:', task.data.gid);
            return task.data;
        } else {
            const errorData = await response.text();
            console.error('Asana task creation failed:', errorData);
        }
    } catch (error) {
        console.error('Asana task creation error:', error);
    }
}

function getTaskDueDate(score) {
    const today = new Date();
    if (score >= 80) {
        today.setHours(today.getHours() + 2); // 2 hours for hot leads
    } else if (score >= 60) {
        today.setDate(today.getDate() + 1); // 1 day for qualified
    } else {
        today.setDate(today.getDate() + 3); // 3 days for others
    }
    return today.toISOString().split('T')[0];
}

function getAsanaProjectId(territory) {
    const projectMap = {
        'Enterprise Team': '1211489117679342', // Deal Support project
        'Mid-Market Team': '1211489117679297', // Sales Follow-ups project  
        'SMB Team': '1211489117679297' // Sales Follow-ups project
    };
    return projectMap[territory] || '1211489117679297';
}

function getAssigneeId(territory) {
    const assigneeMap = {
        'Enterprise Team': '1211488794606450',
        'Mid-Market Team': '1211488794606450', 
        'SMB Team': '1211488794606450'
    };
    return assigneeMap[territory] || 'user-default-000';
}

// =============================================================================
// ZENDESK SUPPORT INTEGRATION
// =============================================================================

async function createZendeskTicket(leadData, type = 'deal_support') {
    console.log('Creating Zendesk ticket for:', leadData.firstName, leadData.lastName);

    if (ZENDESK_TOKEN === 'demo-mode') {
        console.log('Demo mode: Simulating Zendesk ticket creation');
        return { id: 'demo-ticket-' + Date.now() };
    }

    const ticketData = {
        ticket: {
            subject: `${type.replace('_', ' ').toUpperCase()}: ${leadData.company} - ${leadData.firstName} ${leadData.lastName}`,
            comment: {
                body: generateZendeskTicketBody(leadData, type)
            },
            priority: leadData.score >= 80 ? 'urgent' : 'high',
            tags: [type, 'gtm', 'high-value', leadData.territory?.toLowerCase().replace(' ', '-')],
        }
    };

    try {
        const response = await makeRequest(`https://${ZENDESK_DOMAIN}.zendesk.com/api/v2/tickets.json`, {
    method: 'POST',
    headers: {
        'Authorization': `Basic ${Buffer.from(`${ZENDESK_EMAIL}/token:${ZENDESK_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/json'
    },
            body: JSON.stringify(ticketData)
        });

        if (response.ok) {
            const ticket = await response.json();
            console.log('Zendesk ticket created:', ticket.ticket.id);
            return ticket.ticket;
        } else {
            const errorData = await response.text();
            console.error('Zendesk ticket creation failed:', errorData);
        }
    } catch (error) {
        console.error('Zendesk ticket creation error:', error);
    }
}

function generateZendeskTicketBody(leadData, type) {
    const baseInfo = `
Contact Information:
- Name: ${leadData.firstName} ${leadData.lastName}
- Company: ${leadData.company}
- Email: ${leadData.email}
- Title: ${leadData.jobTitle}
- Industry: ${leadData.industry}

Lead Intelligence:
- Score: ${leadData.score}/100
- Territory: ${leadData.territory || 'Auto-Assigned'}
- Deal Value: ${((leadData.forecastedDealValue || 0) / 1000).toFixed(0)}K
- Status: ${leadData.status}

Enrichment Data:
- Seniority: ${leadData.seniority || 'Unknown'}
- Department: ${leadData.department || 'Unknown'}
- Company Revenue: ${leadData.companyRevenue || 'Unknown'}
    `;

    const typeSpecificContent = {
        deal_support: `
Deal Support Required:

This is a ${leadData.score >= 80 ? 'HIGH PRIORITY' : 'qualified'} lead that requires immediate sales support.

Next Steps:
- Verify contact information
- Prepare custom demo environment
- Schedule discovery call
- Send relevant case studies
        `,
        document_request: `
Document Request:

The prospect has requested additional documentation. Please prepare:
- ROI calculator customized for ${leadData.industry}
- Security documentation
- Implementation timeline
- Pricing information for ${leadData.companySize} companies
        `,
        technical_question: `
Technical Support Required:

The prospect has technical questions that need expert attention.
Priority: ${leadData.score >= 80 ? 'URGENT' : 'HIGH'}

Please assign to technical sales engineer for detailed response.
        `
    };

    return baseInfo + (typeSpecificContent[type] || typeSpecificContent.deal_support);
}

// =============================================================================
// DEALHUB CPQ INTEGRATION
// =============================================================================

async function createDealHubQuote(leadData) {
    console.log('Creating DealHub quote for:', leadData.firstName, leadData.lastName);

    if (DEALHUB_API_KEY === 'demo-mode') {
        console.log('Demo mode: Simulating DealHub quote creation');
        return { id: 'demo-quote-' + Date.now() };
    }

    const quoteData = {
        buyer: {
            firstName: leadData.firstName,
            lastName: leadData.lastName,
            email: leadData.email,
            company: leadData.company,
            title: leadData.jobTitle
        },
        deal: {
            name: `${leadData.company} - Working Capital Solution`,
            value: leadData.forecastedDealValue || 50000,
            currency: 'USD',
            closeDate: getCloseDate(leadData.score)
        },
        template: getQuoteTemplate(leadData),
        customFields: {
            leadScore: leadData.score,
            territory: leadData.territory,
            industry: leadData.industry,
            companySize: leadData.companySize,
            enrichmentData: {
                seniority: leadData.seniority,
                department: leadData.department,
                companyRevenue: leadData.companyRevenue
            }
        }
    };

    try {
        const response = await makeRequest('https://api.dealhub.io/api/v1/deals', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DEALHUB_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(quoteData)
        });

        if (response.ok) {
            const quote = await response.json();
            console.log('DealHub quote created:', quote.id);
            return quote;
        } else {
            const errorData = await response.text();
            console.error('DealHub quote creation failed:', errorData);
        }
    } catch (error) {
        console.error('DealHub quote creation error:', error);
    }
}

function getQuoteTemplate(leadData) {
    if (leadData.companySize === '1000+' || leadData.score >= 80) {
        return 'enterprise-custom-template';
    } else if (leadData.companySize === '201-1000' || leadData.companySize === '51-200') {
        return 'midmarket-template';
    } else {
        return 'smb-standard-template';
    }
}

// =============================================================================
// TERRITORY ASSIGNMENT ENGINE
// =============================================================================

function assignTerritory(leadData) {
    // Territory assignment logic based on company size, industry, and geography
    let territory = 'SMB Team';
    let assignedRep = 'Sarah Johnson';

    if (leadData.companySize === '1000+') {
        territory = 'Enterprise Team';
        assignedRep = 'Michael Chen';
    } else if (leadData.companySize === '201-1000' || 
               (leadData.companySize === '51-200' && leadData.score >= 70)) {
        territory = 'Mid-Market Team';
        assignedRep = 'Alex Rodriguez';
    }

    // Industry-specific routing
    if (leadData.industry === 'fintech' && leadData.score >= 80) {
        territory = 'Enterprise Team'; // FinTech specialist
        assignedRep = 'Michael Chen';
    }

    return { territory, assignedRep };
}

// =============================================================================
// MAIN API ENDPOINTS
// =============================================================================

app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Complete GTM Backend is running',
        integrations: {
            hubspot: HUBSPOT_API_TOKEN !== 'demo-mode' ? 'connected' : 'demo-mode',
            clay: CLAY_API_KEY !== 'demo-mode' ? 'connected' : 'demo-mode',
            slack: SLACK_WEBHOOK_URL !== 'https://hooks.slack.com/demo' ? 'connected' : 'demo-mode',
            asana: ASANA_ACCESS_TOKEN !== 'demo-mode' ? 'connected' : 'demo-mode',
            zendesk: ZENDESK_TOKEN !== 'demo-mode' ? 'connected' : 'demo-mode',
            dealhub: DEALHUB_API_KEY !== 'demo-mode' ? 'connected' : 'demo-mode'
        }
    });
});

app.get('/', (req, res) => {
    res.json({ 
        message: 'Complete GTM Backend API is running!',
        version: '2.0.0',
        features: [
            'HubSpot CRM Integration',
            'Clay Data Enrichment',
            'Slack Notifications',
            'Asana Task Management',
            'Zendesk Support Integration',
            'DealHub CPQ Integration',
            'Territory Assignment',
            'Lead Scoring & Qualification',
            'Deal Pipeline Management'
        ]
    });
});

// Main contact creation endpoint with full GTM automation
app.post('/api/hubspot/contacts', async (req, res) => {
    try {
        console.log('=== GTM LEAD PROCESSING STARTED ===');
        console.log('Received lead data:', req.body);

        const { leadData } = req.body;
        const processingResults = {
            success: true,
            contact: null,
            enrichmentData: null,
            automationResults: {
                slack: false,
                asana: false,
                zendesk: false,
                dealhub: false
            },
            errors: []
        };

        // Step 1: Territory Assignment
        console.log('Step 1: Territory Assignment');
        const territoryAssignment = assignTerritory(leadData);
        leadData.territory = territoryAssignment.territory;
        leadData.assignedRep = territoryAssignment.assignedRep;
        console.log('Territory assigned:', territoryAssignment);

        // Step 2: Clay Enrichment
        console.log('Step 2: Clay Enrichment');
        const enrichedLead = await enrichWithClay(leadData);
        console.log('Enrichment completed');

        // Step 3: HubSpot Contact & Deal Creation
        console.log('Step 3: HubSpot Integration');
        try {
            const hubspotContact = await createHubSpotContact(enrichedLead);
            enrichedLead.hubspotContactId = hubspotContact.id;
            processingResults.contact = hubspotContact;
            console.log('HubSpot contact created/updated');
        } catch (hubspotError) {
            console.error('HubSpot integration failed:', hubspotError);
            processingResults.errors.push('HubSpot: ' + hubspotError.message);
        }

        // Step 4: Slack Notification (for high-value leads)
        console.log('Step 4: Slack Notification');
        try {
            const slackSent = await sendSlackNotification(enrichedLead);
            processingResults.automationResults.slack = slackSent;
            if (slackSent) console.log('Slack notification sent');
        } catch (slackError) {
            console.error('Slack notification failed:', slackError);
            processingResults.errors.push('Slack: ' + slackError.message);
        }

        // Step 5: Asana Task Creation
        console.log('Step 5: Asana Task Creation');
        try {
            const asanaTask = await createAsanaTask(enrichedLead);
            processingResults.automationResults.asana = !!asanaTask;
            if (asanaTask) console.log('Asana task created');
        } catch (asanaError) {
            console.error('Asana task creation failed:', asanaError);
            processingResults.errors.push('Asana: ' + asanaError.message);
        }

        // Step 6: Zendesk Support Ticket (for qualified leads)
        console.log('Step 6: Zendesk Integration');
        if (enrichedLead.score >= 60) {
            try {
                const zendeskTicket = await createZendeskTicket(enrichedLead);
                processingResults.automationResults.zendesk = !!zendeskTicket;
                if (zendeskTicket) console.log('Zendesk ticket created');
            } catch (zendeskError) {
                console.error('Zendesk ticket creation failed:', zendeskError);
                processingResults.errors.push('Zendesk: ' + zendeskError.message);
            }
        }

        // Step 7: DealHub Quote (for enterprise leads)
        console.log('Step 7: DealHub CPQ Integration');
        if (enrichedLead.score >= 70 && enrichedLead.territory === 'Enterprise Team') {
            try {
                const dealHubQuote = await createDealHubQuote(enrichedLead);
                processingResults.automationResults.dealhub = !!dealHubQuote;
                if (dealHubQuote) console.log('DealHub quote created');
            } catch (dealHubError) {
                console.error('DealHub quote creation failed:', dealHubError);
                processingResults.errors.push('DealHub: ' + dealHubError.message);
            }
        }

        // Prepare response
        processingResults.enrichmentData = {
            linkedinUrl: enrichedLead.linkedinUrl,
            seniority: enrichedLead.seniority,
            department: enrichedLead.department,
            companyRevenue: enrichedLead.companyRevenue,
            technologies: enrichedLead.technologies,
            experience_years: enrichedLead.experience_years,
            territory: enrichedLead.territory,
            assignedRep: enrichedLead.assignedRep
        };

        console.log('=== GTM LEAD PROCESSING COMPLETED ===');
        console.log('Processing results:', processingResults);

        res.json({
            success: true,
            message: 'Lead processed successfully through complete GTM pipeline',
            contact: processingResults.contact,
            enrichmentData: processingResults.enrichmentData,
            automation: processingResults.automationResults,
            errors: processingResults.errors,
            slackNotified: processingResults.automationResults.slack,
            pipeline: {
                hubspot: !!processingResults.contact,
                clay: true,
                slack: processingResults.automationResults.slack,
                asana: processingResults.automationResults.asana,
                zendesk: processingResults.automationResults.zendesk,
                dealhub: processingResults.automationResults.dealhub
            }
        });

    } catch (error) {
        console.error('=== GTM PROCESSING ERROR ===');
        console.error('Error details:', error);
        
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'GTM pipeline processing failed',
            timestamp: new Date().toISOString()
        });
    }
});

// Additional API endpoints for GTM functionality
app.get('/api/territory/:companySize/:industry', (req, res) => {
    const { companySize, industry } = req.params;
    const mockLead = { companySize, industry, score: 75 };
    const assignment = assignTerritory(mockLead);
    res.json(assignment);
});

app.post('/api/zendesk/ticket', async (req, res) => {
    try {
        const { leadData, type } = req.body;
        const ticket = await createZendeskTicket(leadData, type);
        res.json({ success: true, ticket });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/dealhub/quote', async (req, res) => {
    try {
        const { leadData } = req.body;
        const quote = await createDealHubQuote(leadData);
        res.json({ success: true, quote });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/analytics/pipeline', (req, res) => {
    // Mock pipeline analytics
    res.json({
        totalPipelineValue: 2400000,
        dealsByStage: {
            'leadinqualification': 12,
            'appointmentscheduled': 8,
            'qualifiedtobuy': 5,
            'presentationscheduled': 3,
            'decisionmakerboughtin': 2
        },
        conversionRates: {
            'lead_to_qualified': 0.73,
            'qualified_to_opportunity': 0.65,
            'opportunity_to_closed': 0.42
        },
        forecastAccuracy: 0.87,
        averageDealSize: 75000,
        averageSalesCycle: 67
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`=== COMPLETE GTM BACKEND STARTED ===`);
    console.log(`Server running on port ${PORT}`);
    console.log('Integrated systems:');
    console.log('- HubSpot CRM:', HUBSPOT_API_TOKEN !== 'demo-mode' ? 'CONNECTED' : 'DEMO MODE');
    console.log('- Clay Enrichment:', CLAY_API_KEY !== 'demo-mode' ? 'CONNECTED' : 'DEMO MODE');
    console.log('- Slack Notifications:', SLACK_WEBHOOK_URL !== 'https://hooks.slack.com/demo' ? 'CONNECTED' : 'DEMO MODE');
    console.log('- Asana Tasks:', ASANA_ACCESS_TOKEN !== 'demo-mode' ? 'CONNECTED' : 'DEMO MODE');
    console.log('- Zendesk Support:', ZENDESK_TOKEN !== 'demo-mode' ? 'CONNECTED' : 'DEMO MODE');
    console.log('- DealHub CPQ:', DEALHUB_API_KEY !== 'demo-mode' ? 'CONNECTED' : 'DEMO MODE');
    console.log('==========================================');
});

module.exports = app;






