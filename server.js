// Complete GTM Automation Server with All Working Integrations
// UPDATED SCORING THRESHOLDS: Hot ≥40, Warm 10-39, Cold 0-9
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Import integration modules if they exist, otherwise use inline
let HubSpotIntegration, ClayIntegration;
try {
  HubSpotIntegration = require('./hubspot-integration');
  ClayIntegration = require('./clay-integration');
} catch (e) {
  console.log('Using inline integrations');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory database
const leads = new Map();
const enrichedData = new Map();
const campaigns = new Map();
const emailQueue = [];

// Initialize integrations
const hubspot = HubSpotIntegration ? new HubSpotIntegration(process.env.HUBSPOT_API_KEY) : null;
const clay = ClayIntegration ? new ClayIntegration(process.env.CLAY_API_KEY) : null;

// Email transporter
let transporter;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

// Slack notification with tiered messaging
async function sendSlackNotification(category, leadData, score) {
  if (!process.env.SLACK_WEBHOOK_URL) return;
  
  try {
    let emoji, color, message;
    
    if (category === 'HOT') {
      emoji = ':fire:';
      color = '#FF4444';
      message = `🔥 *HOT LEAD ALERT!* (Score: ${score}/100)\n` +
        `*Name:* ${leadData.firstName} ${leadData.lastName}\n` +
        `*Company:* ${leadData.company}\n` +
        `*Title:* ${leadData.title || 'N/A'}\n` +
        `*Email:* ${leadData.email}\n` +
        `*Action Required:* Immediate follow-up recommended\n` +
        `View: https://parthbadani96.github.io/growth-engineer-demo/`;
    } else if (category === 'WARM') {
      emoji = ':sunny:';
      color = '#FFA500';
      message = `☀️ *WARM LEAD* (Score: ${score}/100)\n` +
        `*Name:* ${leadData.firstName} ${leadData.lastName}\n` +
        `*Company:* ${leadData.company}\n` +
        `*Email:* ${leadData.email}\n` +
        `*Action:* Add to nurture campaign\n` +
        `View: https://parthbadani96.github.io/growth-engineer-demo/`;
    } else if (category === 'COLD') {
      emoji = ':snowflake:';
      color = '#87CEEB';
      message = `❄️ *COLD LEAD* (Score: ${score}/100)\n` +
        `*Name:* ${leadData.firstName} ${leadData.lastName}\n` +
        `*Company:* ${leadData.company}\n` +
        `*Email:* ${leadData.email}\n` +
        `*Action:* Monitor for engagement\n` +
        `View: https://parthbadani96.github.io/growth-engineer-demo/`;
    }
    
    await axios.post(process.env.SLACK_WEBHOOK_URL, {
      text: message,
      icon_emoji: emoji,
      username: 'GTM Bot',
      attachments: [{
        color: color,
        fields: [
          { title: 'Lead Category', value: category, short: true },
          { title: 'Score', value: `${score}/100`, short: true }
        ]
      }]
    });
    
    console.log(`✅ Slack notification sent: ${category} lead - ${leadData.email}`);
  } catch (error) {
    console.log('Slack notification failed:', error.message);
  }
}

// Lead Scoring Engine
function calculateLeadScore(leadData, enrichedData) {
  let score = 0;
  
  // Company size and revenue scoring
  if (enrichedData?.company) {
    const revenue = enrichedData.company.revenue || 0;
    if (revenue >= 2000000 && revenue <= 100000000) score += 25;
    if (revenue >= 5000000 && revenue <= 50000000) score += 10;
    
    const employees = enrichedData.company.employees || 0;
    if (employees >= 10 && employees <= 500) score += 15;
  }
  
  // Technology stack scoring
  if (enrichedData?.technologies || enrichedData?.company?.technologies) {
    const technologies = enrichedData.technologies || enrichedData.company.technologies || [];
    const targetTech = ['QuickBooks', 'NetSuite', 'Salesforce', 'Stripe', 'Shopify', 'Square'];
    const matches = targetTech.filter(tech => 
      technologies.some(t => t.toLowerCase().includes(tech.toLowerCase()))
    );
    score += matches.length * 10;
  }
  
  // Intent signals scoring
  if (enrichedData?.intent) {
    const signalStrength = enrichedData.intent.signalStrength;
    if (signalStrength === 'very_high') score += 25;
    else if (signalStrength === 'high') score += 20;
    else if (signalStrength === 'medium') score += 15;
    else if (signalStrength === 'low') score += 10;
  }
  
  // Title scoring
  const title = leadData.title || enrichedData?.person?.title || '';
  const highValueTitles = ['CEO', 'CFO', 'VP Finance', 'Controller', 'Finance Director', 'COO'];
  if (highValueTitles.some(t => title.toLowerCase().includes(t.toLowerCase()))) {
    score += 20;
  }
  
  // Industry scoring
  const industry = leadData.industry || enrichedData?.company?.industry || '';
  const targetIndustries = ['SaaS', 'E-commerce', 'Professional Services', 'Marketing', 'Wholesale'];
  if (targetIndustries.some(ind => industry.toLowerCase().includes(ind.toLowerCase()))) {
    score += 15;
  }
  
  return Math.min(score, 100);
}

// AI Agent Class
class GTMAgent {
  async processLead(leadData) {
    const actions = [];
    let enriched = {};
    
    // Step 1: Enrich with Clay or mock data
    if (clay && process.env.CLAY_API_KEY && process.env.CLAY_API_KEY !== 'your_clay_api_key') {
      enriched = await clay.enrichLead(leadData);
    } else {
      enriched = this.getMockEnrichment(leadData);
    }
    enrichedData.set(leadData.email, enriched);
    actions.push({ action: 'enriched', timestamp: new Date().toISOString() });
    
    // Step 2: Calculate lead score
    const score = calculateLeadScore(leadData, enriched);
    leadData.score = score;
    leadData.category = this.categorizeLead(score);
    actions.push({ action: 'scored', score, category: leadData.category });
    
    // Step 3: Sync to HubSpot
    if (hubspot && process.env.HUBSPOT_API_KEY && process.env.HUBSPOT_API_KEY !== 'your_hubspot_api_key') {
      try {
        const hubspotResult = await hubspot.createOrUpdateContact(leadData, enriched, score);
        actions.push({ action: 'synced_hubspot', hubspotId: hubspotResult.id });
        
        // Create deal for hot leads (score >= 40)
        if (score >= 40) {
          await hubspot.createDeal(hubspotResult.id, leadData, score);
          actions.push({ action: 'deal_created' });
        }
      } catch (error) {
        console.log('HubSpot sync skipped:', error.message);
      }
    }
    
    // Step 4: Trigger campaigns and Slack notifications based on category
    if (leadData.category === 'HOT') {
      await this.triggerHotLeadCampaign(leadData, enriched, score);
      actions.push({ action: 'hot_lead_campaign_triggered' });
      
      // Send HOT lead Slack notification
      await sendSlackNotification('HOT', leadData, score);
    } else if (leadData.category === 'WARM') {
      await this.triggerNurtureCampaign(leadData, enriched);
      actions.push({ action: 'nurture_campaign_triggered' });
      
      // Send WARM lead Slack notification
      await sendSlackNotification('WARM', leadData, score);
    } else if (leadData.category === 'COLD') {
      // Send COLD lead Slack notification
      await sendSlackNotification('COLD', leadData, score);
      actions.push({ action: 'cold_lead_logged' });
    }
    
    return { leadData, enriched, score, category: leadData.category, actions };
  }
  
  // UPDATED: New scoring thresholds
  categorizeLead(score) {
    if (score >= 40) return 'HOT';      // Hot: 40-100
    if (score >= 10) return 'WARM';     // Warm: 10-39
    return 'COLD';                       // Cold: 0-9
  }
  
  getMockEnrichment(leadData) {
    const industries = ['B2B SaaS', 'E-commerce', 'Professional Services', 'Marketing Agency'];
    const technologies = ['Salesforce', 'QuickBooks', 'Stripe', 'HubSpot', 'Shopify'];
    
    return {
      person: {
        email: leadData.email,
        firstName: leadData.firstName,
        lastName: leadData.lastName,
        title: leadData.title || 'VP Finance',
        linkedinUrl: `https://linkedin.com/in/${leadData.firstName}-${leadData.lastName}`.toLowerCase()
      },
      company: {
        name: leadData.company,
        industry: leadData.industry || industries[Math.floor(Math.random() * industries.length)],
        employees: Math.floor(Math.random() * 400) + 10,
        revenue: Math.floor(Math.random() * 50000000) + 2000000,
        technologies: technologies.slice(0, Math.floor(Math.random() * 3) + 1),
        website: `https://${leadData.company.toLowerCase().replace(/\s/g, '')}.com`
      },
      intent: {
        signals: [
          { type: 'hiring', strength: 'high', details: 'Posted finance roles', score: 20 },
          { type: 'funding', strength: 'medium', details: 'Recent funding', score: 15 }
        ],
        signalCount: 2,
        signalStrength: 'high'
      },
      enrichedAt: new Date().toISOString()
    };
  }
  
  async triggerHotLeadCampaign(leadData, enrichedData, score) {
    const emailContent = this.generatePersonalizedEmail(leadData, enrichedData, score);
    
    if (transporter) {
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: leadData.email,
          subject: emailContent.subject,
          html: emailContent.html
        });
        console.log(`Hot lead email sent to ${leadData.email}`);
      } catch (error) {
        console.log('Email sending failed:', error.message);
      }
    }
    
    // Queue follow-up emails
    emailQueue.push({
      to: leadData.email,
      subject: emailContent.subject,
      html: emailContent.html,
      scheduledFor: new Date()
    });
  }
  
  async triggerNurtureCampaign(leadData, enrichedData) {
    campaigns.set(leadData.email, {
      type: 'nurture',
      startDate: new Date(),
      currentStep: 0,
      enrichedData
    });
    console.log(`Nurture campaign started for ${leadData.email}`);
  }
  
  generatePersonalizedEmail(leadData, enrichedData, score) {
    const companyName = leadData.company;
    const industry = enrichedData?.company?.industry || 'your industry';
    const technologies = enrichedData?.company?.technologies || [];
    const techString = technologies.length > 0 ? technologies[0] : 'your existing systems';
    
    return {
      subject: `${leadData.firstName}, unlock instant working capital for ${companyName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f8f9fa; padding: 30px; border: 1px solid #dee2e6; }
            .cta-button { display: inline-block; background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { background: #333; color: #999; padding: 20px; text-align: center; font-size: 12px; }
            .highlight { background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Daylit</h1>
              <p>The Future of Working Capital</p>
            </div>
            
            <div class="content">
              <h2>Hi ${leadData.firstName},</h2>
              
              <p>I noticed ${companyName} is in the <strong>${industry}</strong> space. Like many companies in your industry, you're likely dealing with 30-90 day payment terms that create significant cash flow gaps.</p>
              
              <div class="highlight">
                <strong>Your Lead Score: ${score}/100</strong><br>
                Based on our analysis, ${companyName} qualifies for our <strong>fast-track approval process</strong>.
              </div>
              
              <h3>Common challenges we solve:</h3>
              <ul>
                <li>Waiting 30-90 days for customer payments while paying suppliers upfront</li>
                <li>Missing growth opportunities due to tied-up working capital</li>
                <li>Considering dilutive equity rounds just to fund operations</li>
              </ul>
              
              <h3>How Daylit helps companies like yours:</h3>
              <p>We integrate directly with <strong>${techString}</strong> to provide instant access to your tied-up capital. No new platforms, no complex applications.</p>
              
              <h3>Success stories from similar companies:</h3>
              <ul>
                <li><strong>Marketing Agency (45 employees):</strong> Freed up $2M in receivables, grew 40% YoY</li>
                <li><strong>SaaS Startup (Series A):</strong> Extended runway by 6 months without dilution</li>
                <li><strong>E-commerce Brand ($8M revenue):</strong> Reduced cash conversion cycle from 75 to 15 days</li>
              </ul>
              
              <center>
                <a href="https://parthbadani96.github.io/growth-engineer-demo/?utm_source=email&utm_medium=hot_lead&utm_campaign=automated&lead_score=${score}" class="cta-button">
                  Get Your Free Capital Assessment →
                </a>
              </center>
              
              <p><strong>Next Steps:</strong></p>
              <ol>
                <li>Click the button above for your personalized assessment</li>
                <li>See exactly how much capital you can unlock</li>
                <li>Get approved in under 24 hours</li>
              </ol>
              
              <p>Have questions? Reply to this email or book time directly: <a href="https://calendly.com/daylit-demo">calendly.com/daylit-demo</a></p>
              
              <p>Best regards,<br>
              The Daylit Team</p>
            </div>
            
            <div class="footer">
              <p>Daylit | San Francisco, CA<br>
              You're receiving this because you expressed interest in working capital solutions.<br>
              <a href="#" style="color: #999;">Unsubscribe</a></p>
            </div>
          </div>
        </body>
        </html>
      `
    };
  }
}

const agent = new GTMAgent();

// ============= API ENDPOINTS =============

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'GTM Automation Platform Active',
    version: '1.0.0',
    scoringThresholds: {
      hot: '≥40',
      warm: '10-39',
      cold: '0-9'
    },
    endpoints: {
      health: '/api/health',
      leads: '/api/leads',
      analytics: '/api/analytics/pipeline',
      bot: '/api/bot'
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    integrations: {
      clay: process.env.CLAY_API_KEY && process.env.CLAY_API_KEY !== 'your_clay_api_key' ? 'configured' : 'not_configured',
      hubspot: process.env.HUBSPOT_API_KEY && process.env.HUBSPOT_API_KEY !== 'your_hubspot_api_key' ? 'configured' : 'not_configured',
      email: transporter ? 'configured' : 'not_configured',
      slack: process.env.SLACK_WEBHOOK_URL ? 'configured' : 'not_configured'
    },
    stats: {
      totalLeads: leads.size,
      enrichedLeads: enrichedData.size,
      activeCampaigns: campaigns.size
    }
  });
});

// Main lead submission endpoint
app.post('/api/leads', async (req, res) => {
  try {
    const leadData = {
      id: `lead_${Date.now()}`,
      email: req.body.email,
      firstName: req.body.firstName || req.body.first_name || '',
      lastName: req.body.lastName || req.body.last_name || '',
      company: req.body.company || '',
      title: req.body.title || req.body.jobtitle || '',
      industry: req.body.industry || '',
      revenue: req.body.revenue || '',
      source: req.body.source || 'landing_page',
      createdAt: new Date().toISOString(),
      ...req.body
    };
    
    // Store lead
    leads.set(leadData.email, leadData);
    
    // Process with AI agent
    const result = await agent.processLead(leadData);
    
    // Send response immediately
    res.json({
      success: true,
      message: 'Lead received and being processed',
      leadId: leadData.id,
      score: result.score,
      category: result.category,
      actions: result.actions.map(a => a.action)
    });
    
    console.log(`✅ Lead processed: ${leadData.email} (Score: ${result.score}, Category: ${result.category})`);
    
  } catch (error) {
    console.error('Error processing lead:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process lead',
      message: error.message
    });
  }
});

// Get all leads
app.get('/api/leads', (req, res) => {
  const allLeads = Array.from(leads.values()).map(lead => ({
    ...lead,
    enriched: enrichedData.get(lead.email),
    score: lead.score || calculateLeadScore(lead, enrichedData.get(lead.email) || {})
  }));
  
  res.json({
    success: true,
    total: allLeads.length,
    leads: allLeads,
    breakdown: {
      hot: allLeads.filter(l => l.score >= 40).length,
      warm: allLeads.filter(l => l.score >= 10 && l.score < 40).length,
      cold: allLeads.filter(l => l.score < 10).length
    }
  });
});

// Get specific lead
app.get('/api/leads/:email', (req, res) => {
  const lead = leads.get(req.params.email);
  const enriched = enrichedData.get(req.params.email);
  
  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }
  
  const score = calculateLeadScore(lead, enriched || {});
  
  res.json({
    lead,
    enriched,
    score,
    category: agent.categorizeLead(score)
  });
});

// Pipeline analytics
app.get('/api/analytics/pipeline', (req, res) => {
  const allLeads = Array.from(leads.values());
  const leadsWithScores = allLeads.map(lead => ({
    ...lead,
    score: calculateLeadScore(lead, enrichedData.get(lead.email) || {})
  }));
  
  const hotLeads = leadsWithScores.filter(l => l.score >= 40);
  const warmLeads = leadsWithScores.filter(l => l.score >= 10 && l.score < 40);
  const coldLeads = leadsWithScores.filter(l => l.score < 10);
  
  const pipeline = {
    totalLeads: allLeads.length,
    averageScore: leadsWithScores.reduce((sum, l) => sum + l.score, 0) / leadsWithScores.length || 0,
    breakdown: {
      hot: {
        count: hotLeads.length,
        estimatedValue: hotLeads.length * 100000,
        conversionRate: 0.4,
        expectedRevenue: hotLeads.length * 100000 * 0.4
      },
      warm: {
        count: warmLeads.length,
        estimatedValue: warmLeads.length * 50000,
        conversionRate: 0.15,
        expectedRevenue: warmLeads.length * 50000 * 0.15
      },
      cold: {
        count: coldLeads.length,
        estimatedValue: coldLeads.length * 10000,
        conversionRate: 0.02,
        expectedRevenue: coldLeads.length * 10000 * 0.02
      }
    },
    totalExpectedRevenue: 
      (hotLeads.length * 100000 * 0.4) +
      (warmLeads.length * 50000 * 0.15) +
      (coldLeads.length * 10000 * 0.02),
    topLeads: leadsWithScores
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(l => ({
        name: `${l.firstName} ${l.lastName}`,
        company: l.company,
        score: l.score,
        email: l.email
      }))
  };
  
  res.json(pipeline);
});

// AI Bot endpoint
app.post('/api/bot', async (req, res) => {
  const { message, command } = req.body;
  const input = (message || command || '').toLowerCase();
  
  let response = {
    success: true,
    message: '',
    data: null
  };
  
  try {
    if (input.includes('score') || input.includes('leads')) {
      const allLeads = Array.from(leads.values());
      const scores = allLeads.map(lead => ({
        email: lead.email,
        name: `${lead.firstName} ${lead.lastName}`,
        company: lead.company,
        score: calculateLeadScore(lead, enrichedData.get(lead.email) || {})
      })).sort((a, b) => b.score - a.score);
      
      response.message = `Lead Scoring Report (${scores.length} leads)`;
      response.data = scores;
    } else if (input.includes('pipeline')) {
      const pipelineRes = await axios.get(`http://localhost:${PORT}/api/analytics/pipeline`);
      response.message = 'Pipeline Analysis';
      response.data = pipelineRes.data;
    } else if (input.includes('enrich')) {
      const emailMatch = input.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
      if (emailMatch && leads.has(emailMatch[1])) {
        const lead = leads.get(emailMatch[1]);
        const enrichResult = await agent.processLead(lead);
        response.message = `Enriched ${emailMatch[1]}`;
        response.data = enrichResult;
      } else {
        response.message = 'Please provide a valid email address';
      }
    } else if (input.includes('help')) {
      response.message = 'Available Commands';
      response.data = {
        commands: [
          'score leads - Get lead scoring report',
          'pipeline analysis - View pipeline metrics',
          'enrich [email] - Enrich specific lead',
          'send email [email] - Trigger email campaign',
          'get lead [email] - Get specific lead details'
        ],
        scoringThresholds: {
          hot: 'Score ≥ 40',
          warm: 'Score 10-39',
          cold: 'Score 0-9'
        }
      };
    } else {
      response.message = 'Command not recognized. Type "help" for available commands.';
    }
  } catch (error) {
    response.success = false;
    response.message = `Error: ${error.message}`;
  }
  
  res.json(response);
});

// Start server
app.listen(PORT, () => {
  console.log('========================================');
  console.log('🚀 GTM AUTOMATION PLATFORM');
  console.log('========================================');
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📍 Base URL: http://localhost:${PORT}`);
  console.log('');
  console.log('📊 Lead Scoring Thresholds:');
  console.log(`   🔥 HOT:  Score ≥ 40`);
  console.log(`   ☀️  WARM: Score 10-39`);
  console.log(`   ❄️  COLD: Score 0-9`);
  console.log('');
  console.log('📊 API Endpoints:');
  console.log(`   GET  /api/health - System health check`);
  console.log(`   POST /api/leads - Submit new lead`);
  console.log(`   GET  /api/leads - Get all leads`);
  console.log(`   GET  /api/leads/:email - Get specific lead`);
  console.log(`   GET  /api/analytics/pipeline - Pipeline analysis`);
  console.log(`   POST /api/bot - AI bot commands`);
  console.log('');
  console.log('🔧 Configuration Status:');
  console.log(`   Clay API: ${process.env.CLAY_API_KEY && process.env.CLAY_API_KEY !== 'your_clay_api_key' ? '✅ Configured' : '❌ Not configured (using mock data)'}`);
  console.log(`   HubSpot: ${process.env.HUBSPOT_API_KEY && process.env.HUBSPOT_API_KEY !== 'your_hubspot_api_key' ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`   Email: ${transporter ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`   Slack: ${process.env.SLACK_WEBHOOK_URL ? '✅ Configured' : '❌ Not configured'}`);
  console.log('========================================');
});
