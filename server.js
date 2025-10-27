const express = require('express');
const cors = require('cors');
const axios = require('axios');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory database (for quick prototype)
const leads = new Map();
const enrichedData = new Map();
const campaigns = new Map();
const emailQueue = [];

// Configuration - Replace with your actual credentials
const CONFIG = {
  CLAY: {
    API_KEY: process.env.CLAY_API_KEY || 'your_clay_api_key',
    BASE_URL: 'https://api.clay.com/v1'
  },
  HUBSPOT: {
    API_KEY: process.env.HUBSPOT_API_KEY || 'your_hubspot_api_key',
    BASE_URL: 'https://api.hubapi.com'
  },
  EMAIL: {
    SERVICE: 'gmail',
    USER: process.env.EMAIL_USER || 'your_email@gmail.com',
    PASS: process.env.EMAIL_PASS || 'your_app_password'
  },
  ANTHROPIC: {
    API_KEY: process.env.ANTHROPIC_API_KEY || 'your_anthropic_key'
  }
};

// Email transporter
const transporter = nodemailer.createTransport({
  service: CONFIG.EMAIL.SERVICE,
  auth: {
    user: CONFIG.EMAIL.USER,
    pass: CONFIG.EMAIL.PASS
  }
});

// ============= LEAD SCORING ENGINE =============
function calculateLeadScore(leadData, enrichedData) {
  let score = 0;
  
  // Firmographic scoring
  if (enrichedData.company) {
    const revenue = enrichedData.company.revenue || 0;
    if (revenue >= 2000000 && revenue <= 100000000) score += 25;
    if (revenue >= 5000000 && revenue <= 50000000) score += 10;
    
    const employees = enrichedData.company.employees || 0;
    if (employees >= 10 && employees <= 500) score += 15;
  }
  
  // Technographic scoring
  if (enrichedData.technologies) {
    const targetTech = ['QuickBooks', 'NetSuite', 'Salesforce', 'Stripe', 'Shopify'];
    const matches = targetTech.filter(tech => 
      enrichedData.technologies.some(t => t.includes(tech))
    );
    score += matches.length * 10;
  }
  
  // Intent signals
  if (enrichedData.funding) {
    if (enrichedData.funding.recentRound) score += 20;
    if (enrichedData.funding.lastRoundDate) {
      const daysSinceFunding = (Date.now() - new Date(enrichedData.funding.lastRoundDate)) / (1000 * 60 * 60 * 24);
      if (daysSinceFunding < 180) score += 15;
    }
  }
  
  // Job title scoring
  const highValueTitles = ['CEO', 'CFO', 'VP Finance', 'Controller', 'Finance Director'];
  if (highValueTitles.some(title => leadData.title?.toLowerCase().includes(title.toLowerCase()))) {
    score += 20;
  }
  
  // Industry scoring
  const targetIndustries = ['SaaS', 'E-commerce', 'Professional Services', 'Marketing', 'Wholesale'];
  if (targetIndustries.some(ind => enrichedData.company?.industry?.includes(ind))) {
    score += 15;
  }
  
  return Math.min(score, 100);
}

// ============= AI AGENT FUNCTIONS =============
class GTMAgent {
  constructor() {
    this.actions = [];
  }
  
  async processLead(leadData) {
    const actions = [];
    
    // 1. Enrich with Clay
    const enriched = await this.enrichWithClay(leadData);
    actions.push({ action: 'enriched', data: enriched });
    
    // 2. Calculate lead score
    const score = calculateLeadScore(leadData, enriched);
    actions.push({ action: 'scored', score });
    
    // 3. Categorize lead
    const category = this.categorizeLead(score);
    actions.push({ action: 'categorized', category });
    
    // 4. Sync to HubSpot
    const hubspotId = await this.syncToHubSpot(leadData, enriched, score);
    actions.push({ action: 'synced_hubspot', hubspotId });
    
    // 5. Trigger appropriate campaign
    if (category === 'HOT') {
      await this.triggerHotLeadCampaign(leadData, enriched, score);
      actions.push({ action: 'campaign_triggered', type: 'hot_lead' });
    } else if (category === 'WARM') {
      await this.triggerNurtureCampaign(leadData, enriched);
      actions.push({ action: 'campaign_triggered', type: 'nurture' });
    }
    
    return { leadData, enriched, score, category, actions };
  }
  
  async enrichWithClay(leadData) {
    // Simulate Clay API enrichment
    // In production, make actual API call to Clay
    const enriched = {
      company: {
        name: leadData.company,
        revenue: Math.floor(Math.random() * 50000000) + 2000000,
        employees: Math.floor(Math.random() * 400) + 10,
        industry: 'B2B SaaS',
        website: `https://${leadData.company.toLowerCase().replace(/\s/g, '')}.com`
      },
      technologies: ['Salesforce', 'QuickBooks', 'Stripe'],
      funding: {
        recentRound: true,
        lastRoundDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
      },
      socialProfiles: {
        linkedin: `https://linkedin.com/in/${leadData.firstName}-${leadData.lastName}`,
        twitter: `@${leadData.firstName}${leadData.lastName}`
      }
    };
    
    enrichedData.set(leadData.email, enriched);
    return enriched;
  }
  
  categorizeLead(score) {
    if (score >= 85) return 'HOT';
    if (score >= 60) return 'WARM';
    if (score >= 40) return 'QUALIFIED';
    return 'COLD';
  }
  
  async syncToHubSpot(leadData, enrichedData, score) {
    // Simulate HubSpot API sync
    // In production, make actual API call
    const hubspotId = `hs_${Date.now()}`;
    
    const hubspotPayload = {
      properties: {
        email: leadData.email,
        firstname: leadData.firstName,
        lastname: leadData.lastName,
        company: leadData.company,
        jobtitle: leadData.title,
        lead_score: score,
        lead_category: this.categorizeLead(score),
        enriched_revenue: enrichedData.company?.revenue,
        enriched_employees: enrichedData.company?.employees,
        technologies_used: enrichedData.technologies?.join(', ')
      }
    };
    
    console.log('Syncing to HubSpot:', hubspotPayload);
    return hubspotId;
  }
  
  async triggerHotLeadCampaign(leadData, enrichedData, score) {
    // Immediate personalized outreach for hot leads
    const emailContent = this.generatePersonalizedEmail(leadData, enrichedData, score);
    
    // Queue email for immediate sending
    emailQueue.push({
      to: leadData.email,
      subject: emailContent.subject,
      html: emailContent.html,
      priority: 'HIGH',
      scheduledFor: new Date()
    });
    
    // Also notify sales team
    await this.notifySalesTeam(leadData, score);
  }
  
  async triggerNurtureCampaign(leadData, enrichedData) {
    // Add to nurture sequence
    const campaignId = 'nurture_sequence_001';
    campaigns.set(leadData.email, {
      campaignId,
      startDate: new Date(),
      currentStep: 0,
      enrichedData
    });
  }
  
  generatePersonalizedEmail(leadData, enrichedData, score) {
    const companyName = enrichedData.company?.name || leadData.company;
    const industry = enrichedData.company?.industry || 'your industry';
    
    return {
      subject: `${leadData.firstName}, unlock working capital for ${companyName}'s growth`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Hi ${leadData.firstName},</h2>
          
          <p>I noticed ${companyName} is in the ${industry} space and likely dealing with the typical 30-90 day payment cycles that create cash flow gaps.</p>
          
          <p>Companies like yours often struggle with:</p>
          <ul>
            <li>Paying suppliers upfront while waiting on customer payments</li>
            <li>Missing growth opportunities due to tied-up capital</li>
            <li>Diluting equity to fund working capital needs</li>
          </ul>
          
          <p><strong>Daylit helps ${industry} companies access working capital instantly</strong> - embedded directly in your existing ${enrichedData.technologies?.[0] || 'ERP'} system.</p>
          
          <p>With your current setup using ${enrichedData.technologies?.join(' and ') || 'your current stack'}, you could unlock capital in under 24 hours.</p>
          
          <p>Here's how we've helped similar companies:</p>
          <ul>
            <li>Marketing agency: Freed up $2M in receivables, grew 40% YoY</li>
            <li>SaaS startup: Extended runway by 6 months without dilution</li>
            <li>Wholesale distributor: Reduced DSO from 75 to 15 days</li>
          </ul>
          
          <p><strong>Ready to see how much capital you can unlock?</strong></p>
          
          <p><a href="https://parthbadani96.github.io/growth-engineer-demo/?utm_source=email&utm_medium=outbound&utm_campaign=hot_lead" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Get Your Free Capital Assessment</a></p>
          
          <p>P.S. Based on your profile (score: ${score}/100), you pre-qualify for our fast-track approval. Reply to this email or book time directly: <a href="https://calendly.com/daylit-sales">calendly.com/daylit-sales</a></p>
          
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #666;">
            You're receiving this because you expressed interest in working capital solutions.
            <br>Daylit | The Future of Working Capital
          </p>
        </div>
      `
    };
  }
  
  async notifySalesTeam(leadData, score) {
    // In production, send to Slack
    console.log(`🔥 HOT LEAD ALERT: ${leadData.firstName} ${leadData.lastName} from ${leadData.company} (Score: ${score})`);
  }
}

const agent = new GTMAgent();

// ============= API ENDPOINTS =============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    integrations: {
      clay: 'ready',
      hubspot: 'ready',
      email: 'ready',
      ai_agent: 'active'
    }
  });
});

// Main lead submission endpoint
app.post('/api/leads', async (req, res) => {
  try {
    const leadData = {
      id: `lead_${Date.now()}`,
      ...req.body,
      source: req.body.source || 'landing_page',
      createdAt: new Date().toISOString()
    };
    
    // Store lead
    leads.set(leadData.email, leadData);
    
    // Process with AI agent
    const result = await agent.processLead(leadData);
    
    // Send immediate response
    res.json({
      success: true,
      message: 'Lead received and being processed',
      leadId: leadData.id,
      score: result.score,
      category: result.category,
      nextSteps: result.actions.map(a => a.action)
    });
    
    // Process email queue in background
    processEmailQueue();
    
  } catch (error) {
    console.error('Error processing lead:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process lead' 
    });
  }
});

// Get lead by email
app.get('/api/leads/:email', (req, res) => {
  const lead = leads.get(req.params.email);
  const enriched = enrichedData.get(req.params.email);
  
  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }
  
  res.json({ lead, enriched });
});

// Get all leads
app.get('/api/leads', (req, res) => {
  const allLeads = Array.from(leads.values()).map(lead => ({
    ...lead,
    enriched: enrichedData.get(lead.email),
    score: calculateLeadScore(lead, enrichedData.get(lead.email) || {})
  }));
  
  res.json({
    total: allLeads.length,
    leads: allLeads,
    categories: {
      hot: allLeads.filter(l => l.score >= 85).length,
      warm: allLeads.filter(l => l.score >= 60 && l.score < 85).length,
      qualified: allLeads.filter(l => l.score >= 40 && l.score < 60).length,
      cold: allLeads.filter(l => l.score < 40).length
    }
  });
});

// Pipeline analysis endpoint
app.get('/api/analytics/pipeline', (req, res) => {
  const allLeads = Array.from(leads.values());
  const scores = allLeads.map(lead => 
    calculateLeadScore(lead, enrichedData.get(lead.email) || {})
  );
  
  const pipeline = {
    totalLeads: allLeads.length,
    averageScore: scores.reduce((a, b) => a + b, 0) / scores.length || 0,
    estimatedValue: scores.filter(s => s >= 60).length * 50000, // $50k ACV assumption
    byCategory: {
      hot: { count: scores.filter(s => s >= 85).length, value: scores.filter(s => s >= 85).length * 100000 },
      warm: { count: scores.filter(s => s >= 60 && s < 85).length, value: scores.filter(s => s >= 60 && s < 85).length * 50000 },
      qualified: { count: scores.filter(s => s >= 40 && s < 60).length, value: scores.filter(s => s >= 40 && s < 60).length * 25000 }
    },
    conversionPrediction: {
      hot: 0.4,
      warm: 0.15,
      qualified: 0.05
    },
    expectedRevenue: (scores.filter(s => s >= 85).length * 100000 * 0.4) +
                    (scores.filter(s => s >= 60 && s < 85).length * 50000 * 0.15) +
                    (scores.filter(s => s >= 40 && s < 60).length * 25000 * 0.05)
  };
  
  res.json(pipeline);
});

// Manual enrichment trigger
app.post('/api/enrich/:email', async (req, res) => {
  const lead = leads.get(req.params.email);
  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }
  
  const enriched = await agent.enrichWithClay(lead);
  const score = calculateLeadScore(lead, enriched);
  
  res.json({ lead, enriched, score });
});

// Send email manually
app.post('/api/email/send', async (req, res) => {
  const { to, leadEmail } = req.body;
  const lead = leads.get(leadEmail || to);
  
  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }
  
  const enriched = enrichedData.get(lead.email) || {};
  const score = calculateLeadScore(lead, enriched);
  const emailContent = agent.generatePersonalizedEmail(lead, enriched, score);
  
  try {
    await transporter.sendMail({
      from: CONFIG.EMAIL.USER,
      to: lead.email,
      subject: emailContent.subject,
      html: emailContent.html
    });
    
    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Process email queue
async function processEmailQueue() {
  while (emailQueue.length > 0) {
    const email = emailQueue.shift();
    try {
      await transporter.sendMail({
        from: CONFIG.EMAIL.USER,
        to: email.to,
        subject: email.subject,
        html: email.html
      });
      console.log(`Email sent to ${email.to}`);
    } catch (error) {
      console.error(`Failed to send email to ${email.to}:`, error.message);
    }
  }
}

// AI Bot endpoint
app.post('/api/bot', async (req, res) => {
  const { message } = req.body;
  
  // Simple command parser
  const command = message.toLowerCase();
  let response = '';
  
  if (command.includes('score') && command.includes('lead')) {
    const allLeads = Array.from(leads.values());
    const scores = allLeads.map(lead => ({
      email: lead.email,
      name: `${lead.firstName} ${lead.lastName}`,
      company: lead.company,
      score: calculateLeadScore(lead, enrichedData.get(lead.email) || {})
    }));
    response = `Lead Scoring Report:\n${scores.map(s => `• ${s.name} (${s.company}): ${s.score}/100`).join('\n')}`;
  } else if (command.includes('pipeline')) {
    const pipeline = await fetch(`http://localhost:${PORT}/api/analytics/pipeline`).then(r => r.json());
    response = `Pipeline Analysis:\n• Total Leads: ${pipeline.totalLeads}\n• Average Score: ${pipeline.averageScore.toFixed(1)}\n• Expected Revenue: $${pipeline.expectedRevenue.toLocaleString()}\n• Hot Leads: ${pipeline.byCategory.hot.count}`;
  } else if (command.includes('enrich')) {
    const emailMatch = command.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
    if (emailMatch) {
      const enrichResult = await agent.enrichWithClay(leads.get(emailMatch[1]));
      response = `Enriched ${emailMatch[1]} - Company: ${enrichResult.company.name}, Revenue: $${enrichResult.company.revenue.toLocaleString()}`;
    }
  } else if (command.includes('send email')) {
    const emailMatch = command.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
    if (emailMatch && leads.has(emailMatch[1])) {
      await processEmailQueue();
      response = `Email sent to ${emailMatch[1]}`;
    }
  } else {
    response = `Available commands:\n• "score all leads" - Get lead scoring report\n• "pipeline analysis" - View pipeline metrics\n• "enrich [email]" - Enrich specific lead\n• "send email to [email]" - Trigger email campaign`;
  }
  
  res.json({ response });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ GTM Platform API running on port ${PORT}`);
  console.log(`📍 Endpoints:`);
  console.log(`   POST /api/leads - Submit new lead`);
  console.log(`   GET  /api/leads - Get all leads`);
  console.log(`   GET  /api/analytics/pipeline - Pipeline analysis`);
  console.log(`   POST /api/bot - AI bot commands`);
  console.log(`   POST /api/email/send - Send email`);
});
